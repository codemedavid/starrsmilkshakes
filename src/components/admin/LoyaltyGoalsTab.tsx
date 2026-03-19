'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Info, Pencil, Plus, X } from 'lucide-react';
import type { LoyaltyGoal } from '@/types/loyalty';
import { useLoyaltyGoals } from '@/hooks/useLoyaltyGoals';

interface Props {
  initialGoals: LoyaltyGoal[];
}

interface GoalFormValues {
  name: string;
  description: string;
  stamps_required: string;
  points_required: string;
}

const emptyForm = (): GoalFormValues => ({
  name: '',
  description: '',
  stamps_required: '',
  points_required: '',
});

function goalToForm(r: LoyaltyGoal): GoalFormValues {
  return {
    name: r.name,
    description: r.description ?? '',
    stamps_required: r.stamps_required != null ? String(r.stamps_required) : '',
    points_required: r.points_required != null ? String(r.points_required) : '',
  };
}

function formToPayload(f: GoalFormValues) {
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    stamps_required: f.stamps_required !== '' ? Number(f.stamps_required) : null,
    points_required: f.points_required !== '' ? Number(f.points_required) : null,
  };
}

// ─── Inline Form ───────────────────────────────────────────────────────────────

interface GoalFormProps {
  initialValues: GoalFormValues;
  saving: boolean;
  onSave: (values: GoalFormValues) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
}

function GoalForm({ initialValues, saving, onSave, onCancel, isEditing = false }: GoalFormProps) {
  const [values, setValues] = useState<GoalFormValues>(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);

  const set = <K extends keyof GoalFormValues>(key: K, value: GoalFormValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setValidationError('Goal name is required.');
      return;
    }
    if (!values.stamps_required && !values.points_required) {
      setValidationError('Set at least one requirement: stamps or points.');
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
        {isEditing ? 'Edit Goal' : 'New Goal'}
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
          placeholder="e.g. Free Shake"
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
            Stamps Required
          </label>
          <input
            type="number"
            min={1}
            value={values.stamps_required}
            onChange={e => set('stamps_required', e.target.value)}
            placeholder="e.g. 5"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
            Points Required
          </label>
          <input
            type="number"
            min={1}
            value={values.points_required}
            onChange={e => set('points_required', e.target.value)}
            placeholder="e.g. 200"
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-[11px] font-nunito text-stone-400">
        Set at least one requirement. If both are set, the customer can redeem with either.
      </p>

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
            isEditing ? 'Update Goal' : 'Create Goal'
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Goal Card ──────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: LoyaltyGoal;
  saving: boolean;
  onEdit: (goal: LoyaltyGoal) => void;
  onToggle: (id: string, isActive: boolean) => void;
}

function GoalCard({ goal, saving, onEdit, onToggle }: GoalCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleToggle = () => {
    if (goal.is_active) {
      // Disabling requires confirmation
      setShowConfirm(true);
    } else {
      onToggle(goal.id, true);
    }
  };

  const confirmDisable = () => {
    setShowConfirm(false);
    onToggle(goal.id, false);
  };

  return (
    <div className={`bg-white border border-[#E8E3DA] rounded-xl p-4 transition-all hover:shadow-sm ${goal.is_active ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-4">
        {/* Left: name + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-stone-800 truncate font-nunito">{goal.name}</p>
            {!goal.is_active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium uppercase tracking-wide">
                Disabled
              </span>
            )}
          </div>
          {goal.description && (
            <p className="text-xs text-stone-500 mt-0.5 line-clamp-2 font-nunito">{goal.description}</p>
          )}
        </div>

        {/* Middle: cost chips */}
        <div className="flex items-center gap-2 shrink-0">
          {goal.stamps_required != null && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap font-nunito">
              {goal.stamps_required} stamps
            </span>
          )}
          {goal.points_required != null && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap font-nunito">
              {goal.points_required} pts
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(goal)}
            aria-label={`Edit ${goal.name}`}
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
              goal.is_active
                ? 'text-red-500 hover:text-red-600 hover:bg-red-50'
                : 'text-[#3D8A80] hover:text-[#356E66] hover:bg-[#7BBFB5]/10'
            }`}
          >
            {goal.is_active ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {/* Confirmation dialog for disable */}
      {showConfirm && (
        <div className="mt-3 pt-3 border-t border-[#E8E3DA] flex items-center justify-between gap-4">
          <p className="text-xs font-nunito text-stone-600">
            Disable <span className="font-semibold">{goal.name}</span>? Customers won&apos;t be able to earn or claim this goal.
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

export default function LoyaltyGoalsTab({ initialGoals }: Props) {
  const { goals, addGoal, editGoal, toggle, saving, error, setError } =
    useLoyaltyGoals(initialGoals);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const activeCount = goals.filter(r => r.is_active).length;

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleAdd = async (values: GoalFormValues) => {
    const result = await addGoal(formToPayload(values));
    if (result.success) {
      setShowAddForm(false);
      flashSaved();
    }
  };

  const handleEdit = async (values: GoalFormValues) => {
    if (!editingId) return;
    const result = await editGoal(editingId, formToPayload(values));
    if (result.success) {
      setEditingId(null);
      flashSaved();
    }
  };

  const handleToggle = (id: string, isActive: boolean) => {
    toggle(id, isActive);
  };

  const startEdit = (goal: LoyaltyGoal) => {
    setShowAddForm(false);
    setEditingId(goal.id);
  };

  const cancelEdit = () => setEditingId(null);
  const cancelAdd = () => setShowAddForm(false);

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
          <p className="font-nunito text-sm text-emerald-700">Goal saved successfully.</p>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-nunito font-semibold text-stone-700">
          Goal Catalog{' '}
          <span className="font-normal text-stone-500">
            ({activeCount} active / {goals.length} total)
          </span>
        </h2>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => { setEditingId(null); setShowAddForm(true); }}
            className="inline-flex items-center gap-1.5 bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Goal
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <GoalForm
          initialValues={emptyForm()}
          saving={saving}
          onSave={handleAdd}
          onCancel={cancelAdd}
        />
      )}

      {/* Goal list */}
      {goals.length === 0 && !showAddForm ? (
        <div className="text-center py-16 text-stone-400 bg-white border border-[#E8E3DA] rounded-xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#7BBFB5]/10 mb-3">
            <Plus className="h-5 w-5 text-[#3D8A80]" />
          </div>
          <p className="text-sm font-nunito font-medium text-stone-600">No goals yet</p>
          <p className="text-xs font-nunito text-stone-400 mt-1">Add your first goal to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map(goal =>
            editingId === goal.id ? (
              <GoalForm
                key={goal.id}
                initialValues={goalToForm(goal)}
                saving={saving}
                onSave={handleEdit}
                onCancel={cancelEdit}
                isEditing
              />
            ) : (
              <GoalCard
                key={goal.id}
                goal={goal}
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
