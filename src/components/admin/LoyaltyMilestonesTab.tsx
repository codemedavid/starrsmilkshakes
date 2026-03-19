'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Info, Pencil, Plus, X } from 'lucide-react';
import type { LoyaltyMilestone } from '@/types/loyalty';
import { useLoyaltyMilestones } from '@/hooks/useLoyaltyMilestones';

interface Props {
  initialMilestones: LoyaltyMilestone[];
}

interface MilestoneFormValues {
  name: string;
  description: string;
  image_url: string;
  stamps_required: string;
  is_active: boolean;
  sort_order: string;
}

const emptyForm = (): MilestoneFormValues => ({
  name: '',
  description: '',
  image_url: '',
  stamps_required: '',
  is_active: true,
  sort_order: '',
});

function milestoneToForm(m: LoyaltyMilestone): MilestoneFormValues {
  return {
    name: m.name,
    description: m.description ?? '',
    image_url: m.image_url ?? '',
    stamps_required: String(m.stamps_required),
    is_active: m.is_active,
    sort_order: m.sort_order != null ? String(m.sort_order) : '',
  };
}

function formToPayload(f: MilestoneFormValues) {
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    image_url: f.image_url.trim() || null,
    stamps_required: Number(f.stamps_required),
    is_active: f.is_active,
    sort_order: f.sort_order !== '' ? Number(f.sort_order) : 0,
  };
}

// ─── Inline Form ───────────────────────────────────────────────────────────────

interface MilestoneFormProps {
  initialValues: MilestoneFormValues;
  saving: boolean;
  onSave: (values: MilestoneFormValues) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
}

function MilestoneForm({ initialValues, saving, onSave, onCancel, isEditing = false }: MilestoneFormProps) {
  const [values, setValues] = useState<MilestoneFormValues>(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);

  const set = <K extends keyof MilestoneFormValues>(key: K, value: MilestoneFormValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setValidationError('Milestone name is required.');
      return;
    }
    if (!values.stamps_required || Number(values.stamps_required) < 1) {
      setValidationError('Stamps required must be at least 1.');
      return;
    }
    setValidationError(null);
    await onSave(values);
  };

  const inputClass =
    'w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none font-nunito';

  return (
    <form onSubmit={handleSubmit} className="bg-white border-2 border-[#7BBFB5] rounded-xl p-4 space-y-3 shadow-sm">
      <p className="text-xs font-nunito font-semibold text-[#3D8A80] uppercase tracking-wide">
        {isEditing ? 'Edit Milestone' : 'New Milestone'}
      </p>

      {validationError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <Info className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <p className="font-nunito text-xs text-amber-700">{validationError}</p>
        </div>
      )}

      <div>
        <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={values.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. First Timer"
          className={inputClass}
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
          Description
        </label>
        <textarea
          rows={2}
          value={values.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Optional description shown to customers"
          className={`${inputClass} resize-none`}
        />
      </div>

      <div>
        <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
          Image URL
        </label>
        <input
          type="url"
          value={values.image_url}
          onChange={e => set('image_url', e.target.value)}
          placeholder="https://..."
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
            Stamps Required <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            required
            value={values.stamps_required}
            onChange={e => set('stamps_required', e.target.value)}
            placeholder="e.g. 5"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
            Sort Order
          </label>
          <input
            type="number"
            min={0}
            value={values.sort_order}
            onChange={e => set('sort_order', e.target.value)}
            placeholder="e.g. 1"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="milestone-is-active"
          type="checkbox"
          checked={values.is_active}
          onChange={e => set('is_active', e.target.checked)}
          className="h-4 w-4 rounded border-[#E8E3DA] text-[#3D8A80] focus:ring-[#7BBFB5]"
        />
        <label htmlFor="milestone-is-active" className="text-xs font-nunito font-medium text-stone-600 cursor-pointer">
          Active (visible to customers)
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
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
          className="bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors disabled:opacity-50"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </span>
          ) : (
            isEditing ? 'Update Milestone' : 'Create Milestone'
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Milestone Card ────────────────────────────────────────────────────────────

interface MilestoneCardProps {
  milestone: LoyaltyMilestone;
  saving: boolean;
  onEdit: (milestone: LoyaltyMilestone) => void;
  onToggle: (id: string, isActive: boolean) => void;
}

function MilestoneCard({ milestone, saving, onEdit, onToggle }: MilestoneCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleToggle = () => {
    if (milestone.is_active) {
      setShowConfirm(true);
    } else {
      onToggle(milestone.id, true);
    }
  };

  const confirmDisable = () => {
    setShowConfirm(false);
    onToggle(milestone.id, false);
  };

  return (
    <div className={`bg-white border border-[#E8E3DA] rounded-xl p-4 transition-all hover:shadow-sm ${milestone.is_active ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-4">
        {/* Left: name + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-stone-800 truncate font-nunito">{milestone.name}</p>
            {!milestone.is_active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium uppercase tracking-wide">
                Disabled
              </span>
            )}
          </div>
          {milestone.description && (
            <p className="text-xs text-stone-500 mt-0.5 line-clamp-2 font-nunito">{milestone.description}</p>
          )}
        </div>

        {/* Middle: stamps chip */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap font-nunito">
            {milestone.stamps_required} stamps
          </span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(milestone)}
            aria-label={`Edit ${milestone.name}`}
            className="border border-[#E8E3DA] text-stone-600 px-3 py-1.5 rounded-lg text-sm font-nunito hover:bg-[#F2EEE8] transition-colors inline-flex items-center gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            type="button"
            onClick={handleToggle}
            disabled={saving}
            className={`text-sm font-nunito font-medium transition-colors disabled:opacity-50 px-2 py-1.5 rounded-lg ${
              milestone.is_active
                ? 'text-red-500 hover:text-red-600 hover:bg-red-50'
                : 'text-[#3D8A80] hover:text-[#356E66] hover:bg-[#7BBFB5]/10'
            }`}
          >
            {milestone.is_active ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {/* Confirmation dialog for disable */}
      {showConfirm && (
        <div className="mt-3 pt-3 border-t border-[#E8E3DA] flex items-center justify-between gap-4">
          <p className="text-xs font-nunito text-stone-600">
            Disable <span className="font-semibold">{milestone.name}</span>? Customers won&apos;t see this milestone.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="text-xs font-nunito text-stone-500 hover:text-stone-700 px-2 py-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDisable}
              className="text-xs font-nunito font-medium text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg"
            >
              Yes, Disable
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function LoyaltyMilestonesTab({ initialMilestones }: Props) {
  const { milestones, addMilestone, editMilestone, toggle, saving, error, setError } =
    useLoyaltyMilestones(initialMilestones);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const activeCount = milestones.filter(m => m.is_active).length;

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleAdd = async (values: MilestoneFormValues) => {
    const result = await addMilestone(formToPayload(values));
    if (result.success) {
      setShowAddForm(false);
      flashSaved();
    }
  };

  const handleEdit = async (values: MilestoneFormValues) => {
    if (!editingId) return;
    const result = await editMilestone(editingId, formToPayload(values));
    if (result.success) {
      setEditingId(null);
      flashSaved();
    }
  };

  const handleToggle = (id: string, isActive: boolean) => {
    toggle(id, isActive);
  };

  const startEdit = (milestone: LoyaltyMilestone) => {
    setShowAddForm(false);
    setEditingId(milestone.id);
  };

  const cancelEdit = () => setEditingId(null);
  const cancelAdd = () => setShowAddForm(false);

  // Sort by stamps_required ascending
  const sorted = [...milestones].sort((a, b) => a.stamps_required - b.stamps_required);

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
          <p className="font-nunito text-sm text-emerald-700">Milestone saved successfully.</p>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-nunito font-semibold text-stone-700">
          Milestone Catalog{' '}
          <span className="font-normal text-stone-500">
            ({activeCount} active / {milestones.length} total)
          </span>
        </h2>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => { setEditingId(null); setShowAddForm(true); }}
            className="inline-flex items-center gap-1.5 bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Milestone
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <MilestoneForm
          initialValues={emptyForm()}
          saving={saving}
          onSave={handleAdd}
          onCancel={cancelAdd}
        />
      )}

      {/* Milestone list */}
      {sorted.length === 0 && !showAddForm ? (
        <div className="text-center py-16 text-stone-400 bg-white border border-[#E8E3DA] rounded-xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#7BBFB5]/10 mb-3">
            <Plus className="h-5 w-5 text-[#3D8A80]" />
          </div>
          <p className="text-sm font-nunito font-medium text-stone-600">No milestones yet</p>
          <p className="text-xs font-nunito text-stone-400 mt-1">Add your first milestone to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(milestone =>
            editingId === milestone.id ? (
              <MilestoneForm
                key={milestone.id}
                initialValues={milestoneToForm(milestone)}
                saving={saving}
                onSave={handleEdit}
                onCancel={cancelEdit}
                isEditing
              />
            ) : (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                saving={saving}
                onEdit={startEdit}
                onToggle={handleToggle}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
