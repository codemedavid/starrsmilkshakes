'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle, GitMerge, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { createPairRule, updatePairRule, deletePairRule } from '@/actions/upsell-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  pairRules: any[];
  menuItems: any[];
  categories: any[];
  bundles: any[];
}

type SourceType = 'item' | 'category';
type TargetType = 'item' | 'bundle';

interface FormValues {
  sourceType: SourceType;
  sourceId: string;
  targetType: TargetType;
  targetId: string;
  message: string;
  priority: string;
  is_active: boolean;
}

const emptyForm = (): FormValues => ({
  sourceType: 'item',
  sourceId: '',
  targetType: 'item',
  targetId: '',
  message: '',
  priority: '0',
  is_active: true,
});

function ruleToForm(rule: any): FormValues {
  return {
    sourceType: rule.source_category_id ? 'category' : 'item',
    sourceId: rule.source_item_id ?? rule.source_category_id ?? '',
    targetType: rule.paired_bundle_id ? 'bundle' : 'item',
    targetId: rule.paired_item_id ?? rule.paired_bundle_id ?? '',
    message: rule.message ?? '',
    priority: String(rule.priority ?? 0),
    is_active: rule.is_active ?? true,
  };
}

function formToPayload(f: FormValues) {
  return {
    source_item_id: f.sourceType === 'item' ? f.sourceId : null,
    source_category_id: f.sourceType === 'category' ? f.sourceId : null,
    paired_item_id: f.targetType === 'item' ? f.targetId : null,
    paired_bundle_id: f.targetType === 'bundle' ? f.targetId : null,
    message: f.message.trim() || null,
    priority: Number(f.priority) || 0,
    is_active: f.is_active,
  };
}

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
  const filtered = options.filter(o =>
    !query || o.label.toLowerCase().includes(query.toLowerCase())
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

// ─── Toggle Group ─────────────────────────────────────────────────────────────

interface ToggleGroupProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}

function ToggleGroup<T extends string>({ value, onChange, options }: ToggleGroupProps<T>) {
  return (
    <div className="inline-flex rounded-lg border border-[#E8E3DA] overflow-hidden">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-nunito font-medium transition-colors ${
            value === opt.value
              ? 'bg-[#3D8A80] text-white'
              : 'bg-white text-stone-600 hover:bg-[#F2EEE8]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Pair Rule Form (Modal) ───────────────────────────────────────────────────

interface PairRuleFormProps {
  initialValues: FormValues;
  menuItems: any[];
  categories: any[];
  bundles: any[];
  saving: boolean;
  isEditing: boolean;
  onSave: (values: FormValues) => Promise<void>;
  onCancel: () => void;
}

function PairRuleForm({
  initialValues,
  menuItems,
  categories,
  bundles,
  saving,
  isEditing,
  onSave,
  onCancel,
}: PairRuleFormProps) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setValidationError(null);
  };

  const handleSourceTypeChange = (t: SourceType) => {
    setValues(prev => ({ ...prev, sourceType: t, sourceId: '' }));
    setValidationError(null);
  };

  const handleTargetTypeChange = (t: TargetType) => {
    setValues(prev => ({ ...prev, targetType: t, targetId: '' }));
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.sourceId) {
      setValidationError('Please select a source item or category.');
      return;
    }
    if (!values.targetId) {
      setValidationError('Please select a target item or bundle.');
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

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E3DA]">
          <p className="text-sm font-nunito font-semibold text-stone-800">
            {isEditing ? 'Edit Pair Rule' : 'New Pair Rule'}
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

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {validationError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <p className="font-nunito text-xs text-amber-700">{validationError}</p>
            </div>
          )}

          {/* Source */}
          <div>
            <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-2">
              Source <span className="text-red-500">*</span>
            </label>
            <div className="mb-2">
              <ToggleGroup<SourceType>
                value={values.sourceType}
                onChange={handleSourceTypeChange}
                options={[{ value: 'item', label: 'Item' }, { value: 'category', label: 'Category' }]}
              />
            </div>
            <SearchableDropdown
              options={values.sourceType === 'item' ? itemOptions : categoryOptions}
              value={values.sourceId}
              onChange={id => set('sourceId', id)}
              placeholder={values.sourceType === 'item' ? 'Select menu item...' : 'Select category...'}
            />
          </div>

          {/* Target */}
          <div>
            <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-2">
              Paired With <span className="text-red-500">*</span>
            </label>
            <div className="mb-2">
              <ToggleGroup<TargetType>
                value={values.targetType}
                onChange={handleTargetTypeChange}
                options={[{ value: 'item', label: 'Item' }, { value: 'bundle', label: 'Bundle' }]}
              />
            </div>
            <SearchableDropdown
              options={values.targetType === 'item' ? itemOptions : bundleOptions}
              value={values.targetId}
              onChange={id => set('targetId', id)}
              placeholder={values.targetType === 'item' ? 'Select menu item...' : 'Select bundle...'}
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
              Message
              <span className="ml-1 font-normal normal-case text-stone-400">(optional)</span>
            </label>
            <input
              type="text"
              value={values.message}
              onChange={e => set('message', e.target.value)}
              placeholder="e.g. Pairs perfectly with..."
              className={inputClass}
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
              disabled={saving || !values.sourceId || !values.targetId}
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
      <p className="text-xs font-nunito text-stone-600">Delete this pair rule?</p>
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

// ─── Pair Rule Row ────────────────────────────────────────────────────────────

interface PairRuleRowProps {
  rule: any;
  menuItems: any[];
  categories: any[];
  bundles: any[];
  saving: boolean;
  onEdit: (rule: any) => void;
  onDelete: (id: string) => Promise<void>;
}

function resolveLabel(id: string | null, items: any[], key = 'id', labelKey = 'name'): string {
  if (!id) return '--';
  return items.find(i => i[key] === id)?.[labelKey] ?? id;
}

function PairRuleRow({ rule, menuItems, categories, bundles, saving, onEdit, onDelete }: PairRuleRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sourceLabel = rule.source_item_id
    ? resolveLabel(rule.source_item_id, menuItems)
    : resolveLabel(rule.source_category_id, categories, 'id_slug', 'name') ||
      resolveLabel(rule.source_category_id, categories, 'id', 'name');

  const targetLabel = rule.paired_item_id
    ? resolveLabel(rule.paired_item_id, menuItems)
    : resolveLabel(rule.paired_bundle_id, bundles);

  const sourceType = rule.source_item_id ? 'Item' : 'Category';
  const targetType = rule.paired_item_id ? 'Item' : 'Bundle';

  return (
    <div className={`bg-white border border-[#E8E3DA] rounded-xl p-4 transition-all hover:shadow-sm ${!rule.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Source → Target */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#7BBFB5]/10 text-[#3D8A80] font-medium font-nunito">
              {sourceType}
            </span>
            <span className="text-sm font-medium text-stone-800 truncate font-nunito">{sourceLabel}</span>
            <span className="text-stone-400 text-xs">→</span>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium font-nunito">
              {targetType}
            </span>
            <span className="text-sm font-medium text-stone-800 truncate font-nunito">{targetLabel}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {rule.message && (
              <p className="text-xs text-stone-500 font-nunito italic truncate max-w-xs">"{rule.message}"</p>
            )}
            <span className="text-xs text-stone-400 font-nunito">Priority: {rule.priority}</span>
            {!rule.is_active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium uppercase tracking-wide font-nunito">
                Inactive
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(rule)}
            aria-label="Edit pair rule"
            className="border border-[#E8E3DA] text-stone-600 px-3 py-1.5 rounded-lg text-sm font-nunito hover:bg-[#F2EEE8] transition-colors inline-flex items-center gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={saving}
            aria-label="Delete pair rule"
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

export default function UpsellPairsTab({ pairRules: initialRules, menuItems, categories, bundles }: Props) {
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
      const result = await createPairRule(formToPayload(values));
      if (result.success) {
        if (result.data) setRules(prev => [result.data, ...prev]);
        setShowForm(false);
        setError(null);
        flashSaved();
      } else {
        setError(result.error ?? 'Failed to create pair rule.');
      }
    });
  };

  const handleUpdate = async (values: FormValues) => {
    if (!editingRule) return;
    startTransition(async () => {
      const result = await updatePairRule(editingRule.id, formToPayload(values));
      if (result.success) {
        setRules(prev =>
          prev.map(r =>
            r.id === editingRule.id ? { ...r, ...formToPayload(values) } : r
          )
        );
        setEditingRule(null);
        setError(null);
        flashSaved();
      } else {
        setError(result.error ?? 'Failed to update pair rule.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      const result = await deletePairRule(id);
      if (result.success) {
        setRules(prev => prev.filter(r => r.id !== id));
        setError(null);
      } else {
        setError(result.error ?? 'Failed to delete pair rule.');
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
          <p className="font-nunito text-sm text-emerald-700">Pair rule saved.</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-nunito font-semibold text-stone-700">
          Pair Rules{' '}
          <span className="font-normal text-stone-500">
            ({rules.filter(r => r.is_active).length} active / {rules.length} total)
          </span>
        </h2>
        <button
          type="button"
          onClick={() => { setEditingRule(null); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors shadow-sm font-nunito"
        >
          <Plus className="h-4 w-4" />
          Add Pair Rule
        </button>
      </div>

      {/* Empty state */}
      {rules.length === 0 && (
        <div className="text-center py-16 text-stone-400 bg-white border border-[#E8E3DA] rounded-xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#7BBFB5]/10 mb-3">
            <GitMerge className="h-5 w-5 text-[#3D8A80]" />
          </div>
          <p className="text-sm font-nunito font-medium text-stone-600">No pair rules yet</p>
          <p className="text-xs font-nunito text-stone-400 mt-1">
            Create rules to suggest complementary items when customers add to cart
          </p>
        </div>
      )}

      {/* Rules list */}
      {rules.length > 0 && (
        <div className="space-y-3">
          {rules.map(rule => (
            <PairRuleRow
              key={rule.id}
              rule={rule}
              menuItems={menuItems}
              categories={categories}
              bundles={bundles}
              saving={isPending}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <PairRuleForm
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
        <PairRuleForm
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
