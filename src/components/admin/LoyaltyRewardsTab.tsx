'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Pencil, Plus, X } from 'lucide-react';
import type { LoyaltyReward } from '@/types/loyalty';
import { useLoyaltyRewards } from '@/hooks/useLoyaltyRewards';

interface Props {
  initialRewards: LoyaltyReward[];
}

interface RewardFormValues {
  name: string;
  description: string;
  stamps_required: string;
  points_required: string;
}

const emptyForm = (): RewardFormValues => ({
  name: '',
  description: '',
  stamps_required: '',
  points_required: '',
});

function rewardToForm(r: LoyaltyReward): RewardFormValues {
  return {
    name: r.name,
    description: r.description ?? '',
    stamps_required: r.stamps_required != null ? String(r.stamps_required) : '',
    points_required: r.points_required != null ? String(r.points_required) : '',
  };
}

function formToPayload(f: RewardFormValues) {
  return {
    name: f.name.trim(),
    description: f.description.trim() || null,
    stamps_required: f.stamps_required !== '' ? Number(f.stamps_required) : null,
    points_required: f.points_required !== '' ? Number(f.points_required) : null,
  };
}

// ─── Inline Form ───────────────────────────────────────────────────────────────

interface RewardFormProps {
  initialValues: RewardFormValues;
  saving: boolean;
  onSave: (values: RewardFormValues) => Promise<void>;
  onCancel: () => void;
}

function RewardForm({ initialValues, saving, onSave, onCancel }: RewardFormProps) {
  const [values, setValues] = useState<RewardFormValues>(initialValues);

  const set = <K extends keyof RewardFormValues>(key: K, value: RewardFormValues[K]) =>
    setValues(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) return;
    await onSave(values);
  };

  const inputClass =
    'w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none';

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#7BBFB5] rounded-xl p-4 space-y-3">
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

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="border border-[#E8E3DA] text-stone-600 px-3 py-1.5 rounded-lg text-sm hover:bg-[#F2EEE8] transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !values.name.trim()}
          className="bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ─── Reward Card ──────────────────────────────────────────────────────────────

interface RewardCardProps {
  reward: LoyaltyReward;
  saving: boolean;
  onEdit: (reward: LoyaltyReward) => void;
  onToggle: (id: string, isActive: boolean) => void;
}

function RewardCard({ reward, saving, onEdit, onToggle }: RewardCardProps) {
  const hasCost = reward.stamps_required != null || reward.points_required != null;

  return (
    <div className={`bg-white border border-[#E8E3DA] rounded-xl p-4 flex items-start gap-4 transition-opacity ${reward.is_active ? '' : 'opacity-60'}`}>
      {/* Left: name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-stone-800 truncate">{reward.name}</p>
          {!reward.is_active && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 font-medium">
              Disabled
            </span>
          )}
        </div>
        {reward.description && (
          <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{reward.description}</p>
        )}
      </div>

      {/* Middle: cost chips */}
      {hasCost && (
        <div className="flex items-center gap-2 shrink-0">
          {reward.stamps_required != null && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
              {reward.stamps_required} ⭐
            </span>
          )}
          {reward.points_required != null && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
              {reward.points_required} pts
            </span>
          )}
        </div>
      )}

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onEdit(reward)}
          aria-label={`Edit ${reward.name}`}
          className="border border-[#E8E3DA] text-stone-600 px-3 py-1.5 rounded-lg text-sm hover:bg-[#F2EEE8] transition-colors inline-flex items-center gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onToggle(reward.id, !reward.is_active)}
          disabled={saving}
          className={`text-sm transition-colors disabled:opacity-50 ${
            reward.is_active
              ? 'text-red-500 hover:text-red-600'
              : 'text-[#3D8A80] hover:text-[#356E66]'
          }`}
        >
          {reward.is_active ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function LoyaltyRewardsTab({ initialRewards }: Props) {
  const { rewards, addReward, editReward, toggle, saving, error, setError } =
    useLoyaltyRewards(initialRewards);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const activeCount = rewards.filter(r => r.is_active).length;

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleAdd = async (values: RewardFormValues) => {
    const result = await addReward(formToPayload(values));
    if (result.success) {
      setShowAddForm(false);
      flashSaved();
    }
  };

  const handleEdit = async (values: RewardFormValues) => {
    if (!editingId) return;
    const result = await editReward(editingId, formToPayload(values));
    if (result.success) {
      setEditingId(null);
      flashSaved();
    }
  };

  const handleToggle = (id: string, isActive: boolean) => {
    toggle(id, isActive);
  };

  const startEdit = (reward: LoyaltyReward) => {
    setShowAddForm(false);
    setEditingId(reward.id);
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
          <p className="font-nunito text-sm text-emerald-700">Reward saved successfully.</p>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-nunito font-semibold text-stone-700">
          Reward Catalog{' '}
          <span className="font-normal text-stone-500">({activeCount} active)</span>
        </h2>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => { setEditingId(null); setShowAddForm(true); }}
            className="inline-flex items-center gap-1.5 bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Reward
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <RewardForm
          initialValues={emptyForm()}
          saving={saving}
          onSave={handleAdd}
          onCancel={cancelAdd}
        />
      )}

      {/* Reward list */}
      {rewards.length === 0 && !showAddForm ? (
        <div className="text-center py-12 text-stone-400">
          <p className="text-sm">No rewards yet. Add your first reward above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rewards.map(reward =>
            editingId === reward.id ? (
              <div key={reward.id} className="space-y-0">
                <RewardForm
                  initialValues={rewardToForm(reward)}
                  saving={saving}
                  onSave={handleEdit}
                  onCancel={cancelEdit}
                />
              </div>
            ) : (
              <RewardCard
                key={reward.id}
                reward={reward}
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
