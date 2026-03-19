'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle, Layers, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { createUpsellRule, updateUpsellRule, deleteUpsellRule, toggleUpsellRule } from '@/actions/upsell-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  rules: any[]; // already filtered to phase='interstitial'
  menuItems: any[];
  categories: any[];
  bundles: any[];
}

type TriggerType = 'item' | 'category' | 'cart_total' | 'cart_empty_category';
type OfferType = 'item' | 'bundle' | 'discount' | 'loyalty_nudge';

interface FormValues {
  name: string;
  trigger_type: TriggerType;
  trigger_item_ids: string[];
  trigger_category_ids: string[];
  trigger_min_total: string;
  offer_type: OfferType;
  offer_item_id: string;
  offer_bundle_id: string;
  offer_discount_percent: string;
  offer_message: string;
  priority: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}

const emptyForm = (): FormValues => ({
  name: '',
  trigger_type: 'cart_total',
  trigger_item_ids: [],
  trigger_category_ids: [],
  trigger_min_total: '',
  offer_type: 'loyalty_nudge',
  offer_item_id: '',
  offer_bundle_id: '',
  offer_discount_percent: '',
  offer_message: '',
  priority: '0',
  is_active: true,
  starts_at: '',
  ends_at: '',
});

function ruleToForm(rule: any): FormValues {
  return {
    name: rule.name ?? '',
    trigger_type: rule.trigger_type ?? 'cart_total',
    trigger_item_ids: rule.trigger_item_ids ?? [],
    trigger_category_ids: rule.trigger_category_ids ?? [],
    trigger_min_total: rule.trigger_min_total != null ? String(rule.trigger_min_total) : '',
    offer_type: rule.offer_type ?? 'loyalty_nudge',
    offer_item_id: rule.offer_item_id ?? '',
    offer_bundle_id: rule.offer_bundle_id ?? '',
    offer_discount_percent: rule.offer_discount_percent != null ? String(rule.offer_discount_percent) : '',
    offer_message: rule.offer_message ?? '',
    priority: String(rule.priority ?? 0),
    is_active: rule.is_active ?? true,
    starts_at: rule.starts_at ? rule.starts_at.slice(0, 16) : '',
    ends_at: rule.ends_at ? rule.ends_at.slice(0, 16) : '',
  };
}

function formToPayload(f: FormValues) {
  return {
    name: f.name.trim(),
    phase: 'interstitial' as const,
    trigger_type: f.trigger_type,
    trigger_item_ids: f.trigger_item_ids,
    trigger_category_ids: f.trigger_category_ids,
    trigger_min_total: f.trigger_min_total ? Number(f.trigger_min_total) : null,
    offer_type: f.offer_type,
    offer_item_id: f.offer_type === 'item' && f.offer_item_id ? f.offer_item_id : null,
    offer_bundle_id: f.offer_type === 'bundle' && f.offer_bundle_id ? f.offer_bundle_id : null,
    offer_discount_percent:
      f.offer_type === 'discount' && f.offer_discount_percent ? Number(f.offer_discount_percent) : null,
    offer_message: f.offer_message.trim() || null,
    priority: Number(f.priority) || 0,
    is_active: f.is_active,
    starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
    ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  item: 'Specific Items',
  category: 'Category',
  cart_total: 'Cart Total',
  cart_empty_category: 'Cart Missing Category',
};

const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  item: 'Suggest Item',
  bundle: 'Suggest Bundle',
  discount: 'Discount Offer',
  loyalty_nudge: 'Loyalty Nudge',
};

const OFFER_TYPE_COLORS: Record<OfferType, string> = {
  item: 'bg-[#7BBFB5]/10 text-[#3D8A80]',
  bundle: 'bg-amber-50 text-amber-700',
  discount: 'bg-purple-50 text-purple-700',
  loyalty_nudge: 'bg-blue-50 text-blue-700',
};

// ─── Searchable Dropdown ──────────────────────────────────────────────────────

interface DropdownOption {
  id: string;
  label: string;
  sub?: string;
}

interface SearchableDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
}

function SearchableDropdown({ options, value, onChange, placeholder, disabled }: SearchableDropdownProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = options.find(o => o.id === value);
  const filtered = options.filter(
    o => !query || o.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-left font-nunito focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none disabled:opacity-50 flex items-center justify-between gap-2"
      >
        <span className={selected ? 'text-stone-800' : 'text-stone-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <Search className="h-3.5 w-3.5 text-stone-400 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E8E3DA] rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-[#E8E3DA]">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-1.5 text-sm font-nunito outline-none focus:ring-2 focus:ring-[#7BBFB5]"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm font-nunito text-stone-400 text-center">No results</li>
            ) : (
              filtered.map(opt => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(opt.id)}
                    className={`w-full text-left px-3 py-2 text-sm font-nunito hover:bg-[#F2EEE8] transition-colors ${
                      opt.id === value ? 'bg-[#7BBFB5]/10 text-[#3D8A80] font-medium' : 'text-stone-700'
                    }`}
                  >
                    <span className="block">{opt.label}</span>
                    {opt.sub && <span className="block text-xs text-stone-400">{opt.sub}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Multi-select Chips ───────────────────────────────────────────────────────

interface MultiSelectChipsProps {
  options: DropdownOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}

function MultiSelectChips({ options, value, onChange, placeholder }: MultiSelectChipsProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = options.filter(
    o => !value.includes(o.id) && (!query || o.label.toLowerCase().includes(query.toLowerCase()))
  );

  const add = (id: string) => { onChange([...value, id]); setQuery(''); };
  const remove = (id: string) => onChange(value.filter(v => v !== id));

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(id => {
            const opt = options.find(o => o.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#7BBFB5]/10 text-[#3D8A80] text-xs font-nunito font-medium"
              >
                {opt?.label ?? id}
                <button type="button" onClick={() => remove(id)} aria-label={`Remove ${opt?.label}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm font-nunito outline-none focus:ring-2 focus:ring-[#7BBFB5]"
        />
        {open && filtered.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full bg-white border border-[#E8E3DA] rounded-xl shadow-lg max-h-40 overflow-y-auto">
            {filtered.map(opt => (
              <li key={opt.id}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => add(opt.id)}
                  className="w-full text-left px-3 py-2 text-sm font-nunito hover:bg-[#F2EEE8] transition-colors text-stone-700"
                >
                  {opt.label}
                  {opt.sub && <span className="ml-2 text-xs text-stone-400">{opt.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Rule Form (Modal) ────────────────────────────────────────────────────────

interface RuleFormProps {
  initialValues: FormValues;
  menuItems: any[];
  categories: any[];
  bundles: any[];
  saving: boolean;
  isEditing: boolean;
  onSave: (values: FormValues) => Promise<void>;
  onCancel: () => void;
}

function RuleForm({
  initialValues,
  menuItems,
  categories,
  bundles,
  saving,
  isEditing,
  onSave,
  onCancel,
}: RuleFormProps) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setValidationError(null);
  };

  const handleOfferTypeChange = (t: OfferType) => {
    setValues(prev => ({
      ...prev,
      offer_type: t,
      offer_item_id: '',
      offer_bundle_id: '',
      offer_discount_percent: '',
    }));
    setValidationError(null);
  };

  const handleTriggerTypeChange = (t: TriggerType) => {
    setValues(prev => ({
      ...prev,
      trigger_type: t,
      trigger_item_ids: [],
      trigger_category_ids: [],
      trigger_min_total: '',
    }));
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setValidationError('Rule name is required.');
      return;
    }
    if (values.offer_type === 'item' && !values.offer_item_id) {
      setValidationError('Please select an offer item.');
      return;
    }
    if (values.offer_type === 'bundle' && !values.offer_bundle_id) {
      setValidationError('Please select an offer bundle.');
      return;
    }
    if (values.offer_type === 'discount' && !values.offer_discount_percent) {
      setValidationError('Discount percent is required.');
      return;
    }
    if (values.starts_at && values.ends_at && new Date(values.starts_at) >= new Date(values.ends_at)) {
      setValidationError('End date must be after start date.');
      return;
    }
    setValidationError(null);
    await onSave(values);
  };

  const itemOptions: DropdownOption[] = menuItems.map(i => ({
    id: i.id,
    label: i.name,
    sub: i.base_price != null ? `₱${Number(i.base_price).toFixed(2)}` : undefined,
  }));

  const categoryOptions: DropdownOption[] = categories.map(c => ({
    id: c.id_slug ?? c.id,
    label: c.name,
  }));

  const bundleOptions: DropdownOption[] = bundles.map(b => ({
    id: b.id,
    label: b.name,
    sub: b.base_price != null ? `₱${Number(b.base_price).toFixed(2)}` : undefined,
  }));

  const inputClass =
    'w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none font-nunito';

  const needsItemOffer = values.offer_type === 'item';
  const needsBundleOffer = values.offer_type === 'bundle';
  const needsDiscount = values.offer_type === 'discount';
  const isLoyaltyNudge = values.offer_type === 'loyalty_nudge';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E3DA] sticky top-0 bg-white z-10">
          <p className="text-sm font-nunito font-semibold text-stone-800">
            {isEditing ? 'Edit Interstitial Rule' : 'New Interstitial Rule'}
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="text-stone-400 hover:text-stone-600 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {validationError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <p className="font-nunito text-xs text-amber-700">{validationError}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
              Rule Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={values.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Post-cart Loyalty Nudge"
              className={inputClass}
              autoFocus
            />
          </div>

          {/* Trigger Type */}
          <div>
            <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
              Trigger
            </label>
            <select
              value={values.trigger_type}
              onChange={e => handleTriggerTypeChange(e.target.value as TriggerType)}
              className={inputClass}
            >
              <option value="cart_total">Cart Total (min amount)</option>
              <option value="item">Specific Items in Cart</option>
              <option value="category">Category in Cart</option>
              <option value="cart_empty_category">Cart Missing Category</option>
            </select>
          </div>

          {/* Trigger details */}
          {values.trigger_type === 'cart_total' && (
            <div>
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Minimum Cart Total (₱)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={values.trigger_min_total}
                onChange={e => set('trigger_min_total', e.target.value)}
                placeholder="e.g. 300"
                className={inputClass}
              />
            </div>
          )}

          {values.trigger_type === 'item' && (
            <div>
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Trigger Items
              </label>
              <MultiSelectChips
                options={itemOptions}
                value={values.trigger_item_ids}
                onChange={ids => set('trigger_item_ids', ids)}
                placeholder="Search and add items..."
              />
            </div>
          )}

          {(values.trigger_type === 'category' || values.trigger_type === 'cart_empty_category') && (
            <div>
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Trigger Categories
              </label>
              <MultiSelectChips
                options={categoryOptions}
                value={values.trigger_category_ids}
                onChange={ids => set('trigger_category_ids', ids)}
                placeholder="Search and add categories..."
              />
            </div>
          )}

          {/* Offer Type */}
          <div>
            <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
              Offer Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['item', 'bundle', 'discount', 'loyalty_nudge'] as OfferType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleOfferTypeChange(type)}
                  className={`px-3 py-2 rounded-lg border text-xs font-nunito font-medium transition-colors text-left ${
                    values.offer_type === type
                      ? 'bg-[#3D8A80] text-white border-[#3D8A80]'
                      : 'bg-white text-stone-600 border-[#E8E3DA] hover:bg-[#F2EEE8]'
                  }`}
                >
                  {OFFER_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Offer details */}
          {needsItemOffer && (
            <div>
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Offer Item <span className="text-red-500">*</span>
              </label>
              <SearchableDropdown
                options={itemOptions}
                value={values.offer_item_id}
                onChange={id => set('offer_item_id', id)}
                placeholder="Select menu item..."
              />
            </div>
          )}

          {needsBundleOffer && (
            <div>
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Offer Bundle <span className="text-red-500">*</span>
              </label>
              <SearchableDropdown
                options={bundleOptions}
                value={values.offer_bundle_id}
                onChange={id => set('offer_bundle_id', id)}
                placeholder="Select bundle..."
              />
            </div>
          )}

          {needsDiscount && (
            <div>
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Discount Percent <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={values.offer_discount_percent}
                  onChange={e => set('offer_discount_percent', e.target.value)}
                  placeholder="e.g. 20"
                  className={inputClass}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-stone-400">%</span>
              </div>
            </div>
          )}

          {/* Offer Message (always shown; required for loyalty_nudge) */}
          <div>
            <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
              Message{isLoyaltyNudge && <span className="text-red-500 ml-0.5">*</span>}
              {!isLoyaltyNudge && (
                <span className="ml-1 font-normal normal-case text-stone-400">(optional)</span>
              )}
            </label>
            <textarea
              rows={2}
              value={values.offer_message}
              onChange={e => set('offer_message', e.target.value)}
              placeholder={
                isLoyaltyNudge
                  ? 'e.g. You\'re 2 stamps away from a free shake!'
                  : 'e.g. Add this to complete your order!'
              }
              className={`${inputClass} resize-none`}
              maxLength={500}
            />
          </div>

          {/* Priority + Active */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Priority
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={values.priority}
                onChange={e => set('priority', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col justify-end">
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Status
              </label>
              <button
                type="button"
                onClick={() => set('is_active', !values.is_active)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-nunito transition-colors ${
                  values.is_active
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-stone-50 border-stone-200 text-stone-500'
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${values.is_active ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                {values.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>

          {/* Optional date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Starts At
                <span className="ml-1 font-normal normal-case text-stone-400">(optional)</span>
              </label>
              <input
                type="datetime-local"
                value={values.starts_at}
                onChange={e => set('starts_at', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Ends At
                <span className="ml-1 font-normal normal-case text-stone-400">(optional)</span>
              </label>
              <input
                type="datetime-local"
                value={values.ends_at}
                onChange={e => set('ends_at', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E8E3DA]">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="border border-[#E8E3DA] text-stone-600 px-3 py-1.5 rounded-lg text-sm font-nunito hover:bg-[#F2EEE8] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !values.name.trim()}
              className="bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors disabled:opacity-50 font-nunito"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                isEditing ? 'Update Rule' : 'Create Rule'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}

function DeleteConfirm({ onConfirm, onCancel, saving }: DeleteConfirmProps) {
  return (
    <div className="mt-3 pt-3 border-t border-[#E8E3DA] flex items-center justify-between gap-4">
      <p className="text-xs font-nunito text-stone-600">Delete this interstitial rule?</p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-nunito text-stone-500 hover:text-stone-700 px-2 py-1"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className="text-xs font-nunito font-medium text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Rule Row ─────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule: any;
  menuItems: any[];
  bundles: any[];
  saving: boolean;
  onEdit: (rule: any) => void;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
}

function RuleRow({ rule, menuItems, bundles, saving, onEdit, onDelete, onToggle }: RuleRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const offerType: OfferType = rule.offer_type ?? 'loyalty_nudge';
  const offerLabel =
    offerType === 'item'
      ? menuItems.find(i => i.id === rule.offer_item_id)?.name ?? 'Unknown item'
      : offerType === 'bundle'
      ? bundles.find(b => b.id === rule.offer_bundle_id)?.name ?? 'Unknown bundle'
      : offerType === 'discount'
      ? `${rule.offer_discount_percent ?? '?'}% off`
      : 'Loyalty nudge';

  const isExpired = rule.ends_at && new Date(rule.ends_at) < new Date();
  const isUpcoming = rule.starts_at && new Date(rule.starts_at) > new Date();

  return (
    <div
      className={`bg-white border border-[#E8E3DA] rounded-xl p-4 transition-all hover:shadow-sm ${
        !rule.is_active || isExpired ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
              isExpired ? 'bg-stone-300' :
              isUpcoming ? 'bg-blue-400' :
              rule.is_active ? 'bg-emerald-500' : 'bg-stone-300'
            }`} />
            <p className="text-sm font-medium text-stone-800 font-nunito truncate">{rule.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium font-nunito ${OFFER_TYPE_COLORS[offerType]}`}>
              {OFFER_TYPE_LABELS[offerType]}
            </span>
            {isExpired && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-medium uppercase tracking-wide font-nunito">
                Expired
              </span>
            )}
            {isUpcoming && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium uppercase tracking-wide font-nunito">
                Upcoming
              </span>
            )}
            {!rule.is_active && !isExpired && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium uppercase tracking-wide font-nunito">
                Inactive
              </span>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <p className="text-xs text-stone-500 font-nunito">{offerLabel}</p>
            {rule.offer_message && (
              <>
                <span className="text-stone-300 text-xs">|</span>
                <p className="text-xs text-stone-400 font-nunito italic truncate max-w-xs">"{rule.offer_message}"</p>
              </>
            )}
            <span className="text-stone-300 text-xs">|</span>
            <p className="text-xs text-stone-400 font-nunito">
              {TRIGGER_TYPE_LABELS[rule.trigger_type as TriggerType] ?? rule.trigger_type} · Priority {rule.priority}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(rule)}
            aria-label="Edit rule"
            className="border border-[#E8E3DA] text-stone-600 px-3 py-1.5 rounded-lg text-sm font-nunito hover:bg-[#F2EEE8] transition-colors inline-flex items-center gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          {!isExpired && (
            <button
              type="button"
              onClick={() => onToggle(rule.id)}
              disabled={saving}
              className={`text-sm font-nunito font-medium transition-colors disabled:opacity-50 px-2 py-1.5 rounded-lg ${
                rule.is_active
                  ? 'text-stone-500 hover:text-stone-700 hover:bg-stone-50'
                  : 'text-[#3D8A80] hover:text-[#356E66] hover:bg-[#7BBFB5]/10'
              }`}
            >
              {rule.is_active ? 'Disable' : 'Enable'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={saving}
            aria-label="Delete rule"
            className="border border-red-200 text-red-500 px-2 py-1.5 rounded-lg text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <DeleteConfirm
          onConfirm={() => { setConfirmDelete(false); onDelete(rule.id); }}
          onCancel={() => setConfirmDelete(false)}
          saving={saving}
        />
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function UpsellInterstitialsTab({ rules: initialRules, menuItems, categories, bundles }: Props) {
  const [rules, setRules] = useState<any[]>(initialRules);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleCreate = async (values: FormValues) => {
    startTransition(async () => {
      const result = await createUpsellRule(formToPayload(values));
      if (result.success) {
        if (result.data) setRules(prev => [result.data, ...prev]);
        setShowForm(false);
        setError(null);
        flashSaved();
      } else {
        setError(result.error ?? 'Failed to create rule.');
      }
    });
  };

  const handleUpdate = async (values: FormValues) => {
    if (!editingRule) return;
    startTransition(async () => {
      const result = await updateUpsellRule(editingRule.id, formToPayload(values));
      if (result.success) {
        const payload = formToPayload(values);
        setRules(prev =>
          prev.map(r => r.id === editingRule.id ? { ...r, ...payload } : r)
        );
        setEditingRule(null);
        setError(null);
        flashSaved();
      } else {
        setError(result.error ?? 'Failed to update rule.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      const result = await deleteUpsellRule(id);
      if (result.success) {
        setRules(prev => prev.filter(r => r.id !== id));
        setError(null);
      } else {
        setError(result.error ?? 'Failed to delete rule.');
      }
    });
  };

  const handleToggle = async (id: string) => {
    startTransition(async () => {
      const result = await toggleUpsellRule(id);
      if (result.success) {
        setRules(prev =>
          prev.map(r => r.id === id ? { ...r, is_active: result.data?.is_active ?? !r.is_active } : r)
        );
        setError(null);
      } else {
        setError(result.error ?? 'Failed to toggle rule.');
      }
    });
  };

  const startEdit = (rule: any) => {
    setShowForm(false);
    setEditingRule(rule);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingRule(null);
  };

  const activeCount = rules.filter(r => r.is_active && !(r.ends_at && new Date(r.ends_at) < new Date())).length;

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="font-nunito text-sm text-red-700 flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="text-red-400 hover:text-red-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Success banner */}
      {saved && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="font-nunito text-sm text-emerald-700">Rule saved.</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-nunito font-semibold text-stone-700">
          Interstitial Rules{' '}
          <span className="font-normal text-stone-500">
            ({activeCount} active / {rules.length} total)
          </span>
        </h2>
        <button
          type="button"
          onClick={() => { setEditingRule(null); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors shadow-sm font-nunito"
        >
          <Plus className="h-4 w-4" />
          Add Rule
        </button>
      </div>

      {/* Empty state */}
      {rules.length === 0 && (
        <div className="text-center py-16 text-stone-400 bg-white border border-[#E8E3DA] rounded-xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3">
            <Layers className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-sm font-nunito font-medium text-stone-600">No interstitial rules yet</p>
          <p className="text-xs font-nunito text-stone-400 mt-1">
            Show offers and loyalty nudges between cart and checkout
          </p>
        </div>
      )}

      {/* Rules list */}
      {rules.length > 0 && (
        <div className="space-y-3">
          {rules.map(rule => (
            <RuleRow
              key={rule.id}
              rule={rule}
              menuItems={menuItems}
              bundles={bundles}
              saving={isPending}
              onEdit={startEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <RuleForm
          initialValues={emptyForm()}
          menuItems={menuItems}
          categories={categories}
          bundles={bundles}
          saving={isPending}
          isEditing={false}
          onSave={handleCreate}
          onCancel={cancelForm}
        />
      )}

      {/* Edit modal */}
      {editingRule && (
        <RuleForm
          initialValues={ruleToForm(editingRule)}
          menuItems={menuItems}
          categories={categories}
          bundles={bundles}
          saving={isPending}
          isEditing={true}
          onSave={handleUpdate}
          onCancel={cancelForm}
        />
      )}
    </div>
  );
}
