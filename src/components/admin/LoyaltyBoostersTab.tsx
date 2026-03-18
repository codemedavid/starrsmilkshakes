'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Pencil, Plus, X } from 'lucide-react';
import type { LoyaltyBooster, BoosterAppliesTo, BoosterFilterMode } from '@/types/loyalty';
import { useLoyaltyBoosters } from '@/hooks/useLoyaltyBoosters';

interface Props {
  initialBoosters: LoyaltyBooster[];
}

// ─── Form Types ────────────────────────────────────────────────────────────────

interface BoosterFormValues {
  name: string;
  multiplier: string;
  applies_to: BoosterAppliesTo;
  filter_mode: BoosterFilterMode;
  filter_ids_raw: string; // newline-separated UUIDs
  starts_at: string;
  ends_at: string;
}

const emptyForm = (): BoosterFormValues => ({
  name: '',
  multiplier: '2',
  applies_to: 'both',
  filter_mode: 'all',
  filter_ids_raw: '',
  starts_at: '',
  ends_at: '',
});

function boosterToForm(b: LoyaltyBooster): BoosterFormValues {
  // datetime-local expects "YYYY-MM-DDTHH:mm" — trim the seconds/timezone
  const toLocal = (iso: string) => iso ? iso.slice(0, 16) : '';
  return {
    name: b.name,
    multiplier: String(b.multiplier),
    applies_to: b.applies_to,
    filter_mode: b.filter_mode,
    filter_ids_raw: b.filter_ids.join('\n'),
    starts_at: toLocal(b.starts_at),
    ends_at: toLocal(b.ends_at),
  };
}

function formToPayload(f: BoosterFormValues) {
  const filter_ids = f.filter_ids_raw
    .split(/[\n,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
  return {
    name: f.name.trim(),
    multiplier: Number(f.multiplier),
    applies_to: f.applies_to,
    filter_mode: f.filter_mode,
    filter_ids,
    starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
    ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(starts_at: string, ends_at: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (!starts_at && !ends_at) return '—';
  if (!starts_at) return `Until ${fmt(ends_at)}`;
  if (!ends_at) return `From ${fmt(starts_at)}`;
  return `${fmt(starts_at)} – ${fmt(ends_at)}`;
}

function filterLabel(mode: BoosterFilterMode, ids: string[]): string {
  if (mode === 'all') return 'All items';
  const count = ids.length;
  const noun = mode === 'categories' ? 'categor' : 'item';
  const plural = mode === 'categories'
    ? count === 1 ? 'category' : 'categories'
    : count === 1 ? 'item' : 'items';
  return `${count} ${count === 1 ? noun + (mode === 'categories' ? 'y' : '') : plural}`;
}

function appliesToLabel(v: BoosterAppliesTo): string {
  if (v === 'stamps') return 'Stamps';
  if (v === 'points') return 'Points';
  return 'Both';
}

function isExpired(ends_at: string): boolean {
  return !!ends_at && new Date(ends_at) < new Date();
}

function isUpcoming(starts_at: string): boolean {
  return !!starts_at && new Date(starts_at) > new Date();
}

// ─── Inline Form ──────────────────────────────────────────────────────────────

interface BoosterFormProps {
  initialValues: BoosterFormValues;
  saving: boolean;
  onSave: (values: BoosterFormValues) => Promise<void>;
  onCancel: () => void;
}

function BoosterForm({ initialValues, saving, onSave, onCancel }: BoosterFormProps) {
  const [values, setValues] = useState<BoosterFormValues>(initialValues);

  const set = <K extends keyof BoosterFormValues>(key: K, value: BoosterFormValues[K]) =>
    setValues(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim() || !values.multiplier) return;
    await onSave(values);
  };

  const inputClass =
    'w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none';

  const showFilterIds = values.filter_mode !== 'all';

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#7BBFB5] rounded-xl p-4 space-y-3">
      {/* Name */}
      <div>
        <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={values.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. Weekend Double Points"
          className={inputClass}
        />
      </div>

      {/* Multiplier + Applies To */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
            Multiplier <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            required
            min={1.1}
            step={0.1}
            value={values.multiplier}
            onChange={e => set('multiplier', e.target.value)}
            placeholder="e.g. 2"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
            Applies To
          </label>
          <select
            value={values.applies_to}
            onChange={e => set('applies_to', e.target.value as BoosterAppliesTo)}
            className={inputClass}
          >
            <option value="both">Both (Stamps &amp; Points)</option>
            <option value="stamps">Stamps only</option>
            <option value="points">Points only</option>
          </select>
        </div>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
            Starts At
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
          </label>
          <input
            type="datetime-local"
            value={values.ends_at}
            onChange={e => set('ends_at', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Filter Mode */}
      <div>
        <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
          Item Filter
        </label>
        <select
          value={values.filter_mode}
          onChange={e => set('filter_mode', e.target.value as BoosterFilterMode)}
          className={inputClass}
        >
          <option value="all">All items</option>
          <option value="categories">Specific categories</option>
          <option value="items">Specific items</option>
        </select>
      </div>

      {/* Filter IDs */}
      {showFilterIds && (
        <div>
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
            {values.filter_mode === 'categories' ? 'Category' : 'Item'} IDs
            <span className="ml-1 font-normal normal-case">(one UUID per line)</span>
          </label>
          <textarea
            rows={3}
            value={values.filter_ids_raw}
            onChange={e => set('filter_ids_raw', e.target.value)}
            placeholder="Paste UUIDs here, one per line"
            className={`${inputClass} resize-none font-mono text-xs`}
          />
        </div>
      )}

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
          disabled={saving || !values.name.trim() || !values.multiplier}
          className="bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ─── Booster Card ─────────────────────────────────────────────────────────────

interface BoosterCardProps {
  booster: LoyaltyBooster;
  saving: boolean;
  onEdit: (booster: LoyaltyBooster) => void;
  onToggle: (id: string, isActive: boolean) => void;
}

function BoosterCard({ booster, saving, onEdit, onToggle }: BoosterCardProps) {
  const expired = isExpired(booster.ends_at);
  const upcoming = isUpcoming(booster.starts_at);
  const dimmed = !booster.is_active || expired;

  let statusDot: React.ReactNode;
  if (expired) {
    statusDot = <span className="inline-block w-2 h-2 rounded-full bg-stone-300" aria-label="Expired" />;
  } else if (booster.is_active && !upcoming) {
    statusDot = <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" aria-label="Active" />;
  } else {
    statusDot = <span className="inline-block w-2 h-2 rounded-full bg-stone-300" aria-label="Inactive" />;
  }

  return (
    <div className={`bg-white border border-[#E8E3DA] rounded-xl p-4 flex items-start gap-4 transition-opacity ${dimmed ? 'opacity-60' : ''}`}>
      {/* Left: status dot + name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {statusDot}
          <p className="text-sm font-medium text-stone-800 truncate">{booster.name}</p>
          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">
            {booster.multiplier}x
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
            {appliesToLabel(booster.applies_to)}
          </span>
          {expired && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">
              Expired
            </span>
          )}
          {!booster.is_active && !expired && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">
              Disabled
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <p className="text-xs text-stone-500">
            {formatDateRange(booster.starts_at, booster.ends_at)}
          </p>
          <span className="text-stone-300 text-xs">·</span>
          <p className="text-xs text-stone-500">
            {filterLabel(booster.filter_mode, booster.filter_ids)}
          </p>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onEdit(booster)}
          aria-label={`Edit ${booster.name}`}
          className="border border-[#E8E3DA] text-stone-600 px-3 py-1.5 rounded-lg text-sm hover:bg-[#F2EEE8] transition-colors inline-flex items-center gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        {!expired && (
          <button
            type="button"
            onClick={() => onToggle(booster.id, !booster.is_active)}
            disabled={saving}
            className={`text-sm transition-colors disabled:opacity-50 ${
              booster.is_active
                ? 'text-red-500 hover:text-red-600'
                : 'text-[#3D8A80] hover:text-[#356E66]'
            }`}
          >
            {booster.is_active ? 'Disable' : 'Enable'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  boosters: LoyaltyBooster[];
  saving: boolean;
  editingId: string | null;
  onEdit: (booster: LoyaltyBooster) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onSaveEdit: (values: BoosterFormValues) => Promise<void>;
  onCancelEdit: () => void;
  collapsible?: boolean;
}

function BoosterSection({
  title, boosters, saving, editingId,
  onEdit, onToggle, onSaveEdit, onCancelEdit,
  collapsible = false,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(collapsible);

  if (boosters.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => collapsible && setCollapsed(c => !c)}
        className={`flex items-center gap-1.5 text-sm font-medium text-stone-600 ${collapsible ? 'hover:text-stone-800 cursor-pointer' : 'cursor-default'}`}
      >
        {collapsible && (
          collapsed
            ? <ChevronRight className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />
        )}
        {title}
        <span className="text-stone-400 font-normal">({boosters.length})</span>
      </button>
      {!collapsed && (
        <div className="space-y-3">
          {boosters.map(b =>
            editingId === b.id ? (
              <BoosterForm
                key={b.id}
                initialValues={boosterToForm(b)}
                saving={saving}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
              />
            ) : (
              <BoosterCard
                key={b.id}
                booster={b}
                saving={saving}
                onEdit={onEdit}
                onToggle={onToggle}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function LoyaltyBoostersTab({ initialBoosters }: Props) {
  const { boosters, addBooster, editBooster, toggle, saving, error, setError } =
    useLoyaltyBoosters(initialBoosters);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const now = new Date();

  const activeBoosters = boosters.filter(
    b => b.is_active && new Date(b.ends_at) > now && new Date(b.starts_at) <= now
  );
  const upcomingBoosters = boosters.filter(
    b => b.is_active && new Date(b.starts_at) > now
  );
  const pastBoosters = boosters.filter(
    b => b.ends_at && new Date(b.ends_at) < now
  );

  const activeCount = activeBoosters.length;

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleAdd = async (values: BoosterFormValues) => {
    const result = await addBooster(formToPayload(values));
    if (result.success) {
      setShowAddForm(false);
      flashSaved();
    }
  };

  const handleEdit = async (values: BoosterFormValues) => {
    if (!editingId) return;
    const result = await editBooster(editingId, formToPayload(values));
    if (result.success) {
      setEditingId(null);
      flashSaved();
    }
  };

  const handleToggle = (id: string, isActive: boolean) => {
    toggle(id, isActive);
  };

  const startEdit = (booster: LoyaltyBooster) => {
    setShowAddForm(false);
    setEditingId(booster.id);
  };

  const cancelEdit = () => setEditingId(null);
  const cancelAdd = () => setShowAddForm(false);

  const isEmpty = boosters.length === 0;

  const sectionProps = {
    saving,
    editingId,
    onEdit: startEdit,
    onToggle: handleToggle,
    onSaveEdit: handleEdit,
    onCancelEdit: cancelEdit,
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
          <p className="font-nunito text-sm text-emerald-700">Booster saved successfully.</p>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-nunito font-semibold text-stone-700">
          Promotional Boosters{' '}
          <span className="font-normal text-stone-500">({activeCount} active)</span>
        </h2>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => { setEditingId(null); setShowAddForm(true); }}
            className="inline-flex items-center gap-1.5 bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Booster
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <BoosterForm
          initialValues={emptyForm()}
          saving={saving}
          onSave={handleAdd}
          onCancel={cancelAdd}
        />
      )}

      {/* Empty state */}
      {isEmpty && !showAddForm && (
        <div className="text-center py-12 text-stone-400">
          <p className="text-sm">No boosters yet. Add your first promotional multiplier above.</p>
        </div>
      )}

      {/* Grouped sections */}
      {!isEmpty && (
        <div className="space-y-6">
          <BoosterSection title="Active" boosters={activeBoosters} {...sectionProps} />
          <BoosterSection title="Upcoming" boosters={upcomingBoosters} {...sectionProps} />
          <BoosterSection title="Past" boosters={pastBoosters} collapsible {...sectionProps} />
        </div>
      )}
    </div>
  );
}
