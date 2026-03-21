'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle, CheckCircle, X } from 'lucide-react';
import type { MenuItem, Category } from '@/types';
import type { Bundle } from '@/types/bundle';
import type { UpsellRule, UpsellTriggerType, UpsellOfferType } from '@/types/upsell';
import {
  createUpsellRule,
  updateUpsellRule,
  deleteUpsellRule,
  toggleUpsellRule,
} from '@/actions/upsell-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  rules: any[];
  menuItems: MenuItem[];
  categories: Category[];
  bundles: Bundle[];
}

interface RuleFormValues {
  name: string;
  phase: 'upgrade';
  trigger_type: UpsellTriggerType;
  trigger_item_ids: string[];
  trigger_category_ids: string[];
  trigger_min_total: string;
  offer_type: UpsellOfferType;
  offer_item_id: string;
  offer_bundle_id: string;
  offer_discount_percent: string;
  offer_message: string;
  priority: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyForm(): RuleFormValues {
  return {
    name: '',
    phase: 'upgrade',
    trigger_type: 'item',
    trigger_item_ids: [],
    trigger_category_ids: [],
    trigger_min_total: '',
    offer_type: 'item',
    offer_item_id: '',
    offer_bundle_id: '',
    offer_discount_percent: '',
    offer_message: '',
    priority: '0',
    starts_at: '',
    ends_at: '',
    is_active: true,
  };
}

function ruleToForm(r: any): RuleFormValues {
  const toLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : '');
  return {
    name: r.name ?? '',
    phase: 'upgrade',
    trigger_type: r.trigger_type ?? 'item',
    trigger_item_ids: r.trigger_item_ids ?? [],
    trigger_category_ids: r.trigger_category_ids ?? [],
    trigger_min_total: r.trigger_min_total != null ? String(r.trigger_min_total) : '',
    offer_type: r.offer_type ?? 'item',
    offer_item_id: r.offer_item_id ?? '',
    offer_bundle_id: r.offer_bundle_id ?? '',
    offer_discount_percent: r.offer_discount_percent != null ? String(r.offer_discount_percent) : '',
    offer_message: r.offer_message ?? '',
    priority: String(r.priority ?? 0),
    starts_at: toLocal(r.starts_at),
    ends_at: toLocal(r.ends_at),
    is_active: r.is_active ?? true,
  };
}

function formToPayload(f: RuleFormValues) {
  return {
    name: f.name.trim(),
    phase: 'upgrade' as const,
    trigger_type: f.trigger_type,
    trigger_item_ids: f.trigger_item_ids,
    trigger_category_ids: f.trigger_category_ids,
    trigger_min_total: f.trigger_min_total ? Number(f.trigger_min_total) : null,
    offer_type: f.offer_type,
    offer_item_id: f.offer_item_id || null,
    offer_bundle_id: f.offer_bundle_id || null,
    offer_discount_percent: f.offer_discount_percent ? Number(f.offer_discount_percent) : null,
    offer_message: f.offer_message.trim() || null,
    priority: Number(f.priority),
    starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
    ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
    is_active: f.is_active,
  };
}

function triggerLabel(rule: any): string {
  if (rule.trigger_type === 'cart_total') {
    return `Cart total ≥ ₱${rule.trigger_min_total ?? 0}`;
  }
  if (rule.trigger_type === 'cart_empty_category') return 'Empty category in cart';
  if (rule.trigger_type === 'category') {
    const count = (rule.trigger_category_ids ?? []).length;
    return `${count} ${count === 1 ? 'category' : 'categories'}`;
  }
  const count = (rule.trigger_item_ids ?? []).length;
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

function offerLabel(rule: any, menuItems: MenuItem[], bundles: Bundle[]): string {
  if (rule.offer_type === 'discount') {
    return `${rule.offer_discount_percent ?? 0}% off`;
  }
  if (rule.offer_type === 'loyalty_nudge') return 'Loyalty nudge';
  if (rule.offer_type === 'bundle') {
    const b = bundles.find(bun => bun.id === rule.offer_bundle_id);
    return b ? b.name : 'Bundle';
  }
  const item = menuItems.find(m => m.id === rule.offer_item_id);
  return item ? item.name : 'Item';
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, label, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#7BBFB5] focus:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? 'bg-[#3D8A80]' : 'bg-stone-300'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
          transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ─── Multi-select helper ──────────────────────────────────────────────────────

interface MultiSelectProps {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  return (
    <div>
      <p className="text-xs font-nunito font-medium text-stone-500 mb-1.5">{label}</p>
      <div className="border border-[#E8E3DA] rounded-lg max-h-44 overflow-y-auto bg-white">
        {options.length === 0 && (
          <p className="px-3 py-2 text-xs text-stone-400 font-nunito">No options</p>
        )}
        {options.map(opt => (
          <label
            key={opt.id}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#F2EEE8] cursor-pointer"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300 text-[#3D8A80] focus:ring-[#7BBFB5]"
              checked={selected.includes(opt.id)}
              onChange={() => toggle(opt.id)}
            />
            <span className="text-sm font-nunito text-stone-700">{opt.name}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-stone-400 font-nunito mt-1">{selected.length} selected</p>
      )}
    </div>
  );
}

// ─── Rule Form Modal ──────────────────────────────────────────────────────────

interface RuleFormModalProps {
  form: RuleFormValues;
  onChange: (f: RuleFormValues) => void;
  onSubmit: () => void;
  onClose: () => void;
  saving: boolean;
  isEdit: boolean;
  menuItems: MenuItem[];
  categories: Category[];
  bundles: Bundle[];
  error: string | null;
}

function RuleFormModal({
  form,
  onChange,
  onSubmit,
  onClose,
  saving,
  isEdit,
  menuItems,
  categories,
  bundles,
  error,
}: RuleFormModalProps) {
  const set = <K extends keyof RuleFormValues>(key: K, value: RuleFormValues[K]) =>
    onChange({ ...form, [key]: value });

  const labelCls = 'text-xs font-nunito font-medium text-stone-500 mb-1.5 block';
  const inputCls =
    'w-full px-3 py-2 text-sm font-nunito border border-[#E8E3DA] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7BBFB5] bg-white text-stone-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-[#E8E3DA] w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E3DA]">
          <h2 className="font-playfair text-lg font-semibold text-stone-900">
            {isEdit ? 'Edit Upgrade Rule' : 'Create Upgrade Rule'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-[#F2EEE8] hover:text-stone-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className={labelCls}>Rule Name</label>
            <input
              className={inputCls}
              placeholder="e.g. Shake upgrade offer"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </div>

          {/* Trigger type */}
          <div>
            <label className={labelCls}>Trigger Type</label>
            <select
              className={inputCls}
              value={form.trigger_type}
              onChange={e => set('trigger_type', e.target.value as UpsellTriggerType)}
            >
              <option value="item">Specific Items in Cart</option>
              <option value="category">Items from Category in Cart</option>
              <option value="cart_total">Cart Total Reaches Minimum</option>
              <option value="cart_empty_category">Cart Missing a Category</option>
            </select>
          </div>

          {/* Trigger items */}
          {form.trigger_type === 'item' && (
            <MultiSelect
              label="Trigger Items"
              options={menuItems.map(m => ({ id: m.id, name: m.name }))}
              selected={form.trigger_item_ids}
              onChange={ids => set('trigger_item_ids', ids)}
            />
          )}

          {/* Trigger categories */}
          {(form.trigger_type === 'category' || form.trigger_type === 'cart_empty_category') && (
            <MultiSelect
              label="Trigger Categories"
              options={categories.map(c => ({ id: c.id, name: c.name }))}
              selected={form.trigger_category_ids}
              onChange={ids => set('trigger_category_ids', ids)}
            />
          )}

          {/* Cart minimum total */}
          {form.trigger_type === 'cart_total' && (
            <div>
              <label className={labelCls}>Minimum Cart Total (₱)</label>
              <input
                type="number"
                min="0"
                step="1"
                className={inputCls}
                placeholder="e.g. 500"
                value={form.trigger_min_total}
                onChange={e => set('trigger_min_total', e.target.value)}
              />
            </div>
          )}

          {/* Offer type */}
          <div>
            <label className={labelCls}>Offer Type</label>
            <select
              className={inputCls}
              value={form.offer_type}
              onChange={e => set('offer_type', e.target.value as UpsellOfferType)}
            >
              <option value="item">Specific Item</option>
              <option value="bundle">Bundle</option>
              <option value="discount">Discount %</option>
              <option value="loyalty_nudge">Loyalty Nudge</option>
            </select>
          </div>

          {/* Offer item */}
          {form.offer_type === 'item' && (
            <div>
              <label className={labelCls}>Offer Item</label>
              <select
                className={inputCls}
                value={form.offer_item_id}
                onChange={e => set('offer_item_id', e.target.value)}
              >
                <option value="">— Select item —</option>
                {menuItems.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Offer bundle */}
          {form.offer_type === 'bundle' && (
            <div>
              <label className={labelCls}>Offer Bundle</label>
              <select
                className={inputCls}
                value={form.offer_bundle_id}
                onChange={e => set('offer_bundle_id', e.target.value)}
              >
                <option value="">— Select bundle —</option>
                {bundles.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Discount % */}
          {form.offer_type === 'discount' && (
            <div>
              <label className={labelCls}>Discount Percentage</label>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                className={inputCls}
                placeholder="e.g. 10"
                value={form.offer_discount_percent}
                onChange={e => set('offer_discount_percent', e.target.value)}
              />
            </div>
          )}

          {/* Offer message */}
          <div>
            <label className={labelCls}>Offer Message</label>
            <textarea
              rows={2}
              className={inputCls + ' resize-none'}
              placeholder="e.g. Upgrade to a large for only ₱20 more!"
              value={form.offer_message}
              onChange={e => set('offer_message', e.target.value)}
            />
          </div>

          {/* Priority */}
          <div>
            <label className={labelCls}>Priority (higher = shown first)</label>
            <input
              type="number"
              min="0"
              step="1"
              className={inputCls}
              value={form.priority}
              onChange={e => set('priority', e.target.value)}
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Starts At (optional)</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={form.starts_at}
                onChange={e => set('starts_at', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Ends At (optional)</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={form.ends_at}
                onChange={e => set('ends_at', e.target.value)}
              />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-nunito font-medium text-stone-700">Active</span>
            <ToggleSwitch
              checked={form.is_active}
              onChange={v => set('is_active', v)}
              label="Rule active"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-xs font-nunito">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E8E3DA]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-nunito font-medium text-stone-600 bg-white border border-[#E8E3DA] rounded-lg hover:bg-[#F2EEE8] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 text-sm font-nunito font-semibold text-white bg-[#3D8A80] rounded-lg hover:bg-[#2F6B63] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UpsellUpgradesTab({ rules, menuItems, categories, bundles }: Props) {
  const [localRules, setLocalRules] = useState<any[]>(rules);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [form, setForm] = useState<RuleFormValues>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const openCreate = () => {
    setEditingRule(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (rule: any) => {
    setEditingRule(rule);
    setForm(ruleToForm(rule));
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormError(null);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setFormError('Rule name is required.');
      return;
    }
    setFormError(null);
    const payload = formToPayload(form);

    startTransition(async () => {
      const result = editingRule
        ? await updateUpsellRule(editingRule.id, payload)
        : await createUpsellRule(payload);

      if (!result.success) {
        setFormError(result.error ?? 'Something went wrong.');
        return;
      }

      if (editingRule) {
        setLocalRules(prev =>
          prev.map(r => (r.id === editingRule.id ? { ...r, ...payload } : r))
        );
        showToast('success', 'Rule updated.');
      } else {
        // Server returns the new record; fall back to a temp object
        const newRule = result.data ?? { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        setLocalRules(prev => [newRule, ...prev]);
        showToast('success', 'Rule created.');
      }
      closeModal();
    });
  };

  const handleToggle = (rule: any) => {
    setTogglingId(rule.id);
    startTransition(async () => {
      const result = await toggleUpsellRule(rule.id);
      setTogglingId(null);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to toggle rule.');
        return;
      }
      setLocalRules(prev =>
        prev.map(r => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
      );
    });
  };

  const handleDelete = (rule: any) => {
    if (!confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) return;
    setDeletingId(rule.id);
    startTransition(async () => {
      const result = await deleteUpsellRule(rule.id);
      setDeletingId(null);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to delete rule.');
        return;
      }
      setLocalRules(prev => prev.filter(r => r.id !== rule.id));
      showToast('success', 'Rule deleted.');
    });
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-nunito font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-white border-[#7BBFB5] text-[#2F6B63]'
              : 'bg-white border-red-300 text-red-600'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-playfair text-lg font-semibold text-stone-800">Upgrade Rules</h2>
          <p className="text-xs font-nunito text-stone-500 mt-0.5">
            Shown to customers during order — offer a better item or bundle.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-nunito font-semibold text-white bg-[#3D8A80] rounded-lg hover:bg-[#2F6B63] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Rule
        </button>
      </div>

      {/* Table */}
      {localRules.length === 0 ? (
        <div className="bg-white border border-[#E8E3DA] rounded-xl p-10 text-center">
          <p className="font-nunito text-stone-400">No upgrade rules yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E8E3DA] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8E3DA] bg-[#FAFAF8]">
                <th className="px-4 py-3 text-left font-nunito font-semibold text-stone-600 text-xs uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left font-nunito font-semibold text-stone-600 text-xs uppercase tracking-wide hidden sm:table-cell">Trigger</th>
                <th className="px-4 py-3 text-left font-nunito font-semibold text-stone-600 text-xs uppercase tracking-wide hidden md:table-cell">Offer</th>
                <th className="px-4 py-3 text-center font-nunito font-semibold text-stone-600 text-xs uppercase tracking-wide hidden lg:table-cell">Priority</th>
                <th className="px-4 py-3 text-center font-nunito font-semibold text-stone-600 text-xs uppercase tracking-wide">Active</th>
                <th className="px-4 py-3 text-right font-nunito font-semibold text-stone-600 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2EEE8]">
              {localRules.map(rule => (
                <tr key={rule.id} className="hover:bg-[#FAFAF8] transition-colors">
                  <td className="px-4 py-3 font-nunito font-medium text-stone-800">{rule.name}</td>
                  <td className="px-4 py-3 font-nunito text-stone-500 hidden sm:table-cell">
                    {triggerLabel(rule)}
                  </td>
                  <td className="px-4 py-3 font-nunito text-stone-500 hidden md:table-cell">
                    {offerLabel(rule, menuItems, bundles)}
                  </td>
                  <td className="px-4 py-3 text-center font-nunito text-stone-500 hidden lg:table-cell">
                    {rule.priority}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ToggleSwitch
                      checked={rule.is_active}
                      onChange={() => handleToggle(rule)}
                      label={`Toggle ${rule.name}`}
                      disabled={togglingId === rule.id || isPending}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(rule)}
                        className="p-1.5 rounded-lg text-stone-400 hover:bg-[#F2EEE8] hover:text-[#3D8A80] transition-colors"
                        aria-label={`Edit ${rule.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule)}
                        disabled={deletingId === rule.id}
                        className="p-1.5 rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                        aria-label={`Delete ${rule.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <RuleFormModal
          form={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          onClose={closeModal}
          saving={isPending}
          isEdit={!!editingRule}
          menuItems={menuItems}
          categories={categories}
          bundles={bundles}
          error={formError}
        />
      )}
    </div>
  );
}
