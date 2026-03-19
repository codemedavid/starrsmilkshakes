'use client';

import { useState } from 'react';
import { X, Plus, AlertTriangle, CheckCircle } from 'lucide-react';
import type { LoyaltyConfig, FilterMode } from '@/types/loyalty';
import { useLoyaltyConfig } from '@/hooks/useLoyaltyConfig';

interface Props {
  initialConfig: LoyaltyConfig;
}

// ─── Toggle Switch ─────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
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
          transition duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ─── Section card ──────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[#E8E3DA] rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-3">
      {children}
    </p>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function LoyaltyConfigTab({ initialConfig }: Props) {
  const { config, saveConfig, saving, error } = useLoyaltyConfig(initialConfig);

  // Local draft state so edits are batched before save
  const [draft, setDraft] = useState<LoyaltyConfig>(initialConfig);
  const [saved, setSaved] = useState(false);

  // Tag pill input state
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newItemId, setNewItemId] = useState('');

  const update = <K extends keyof LoyaltyConfig>(key: K, value: LoyaltyConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const removeCategoryId = (id: string) => {
    update('filtered_category_ids', draft.filtered_category_ids.filter((c) => c !== id));
  };

  const removeItemId = (id: string) => {
    update('filtered_item_ids', draft.filtered_item_ids.filter((i) => i !== id));
  };

  const addCategoryId = () => {
    const trimmed = newCategoryId.trim();
    if (!trimmed || draft.filtered_category_ids.includes(trimmed)) return;
    update('filtered_category_ids', [...draft.filtered_category_ids, trimmed]);
    setNewCategoryId('');
  };

  const addItemId = () => {
    const trimmed = newItemId.trim();
    if (!trimmed || draft.filtered_item_ids.includes(trimmed)) return;
    update('filtered_item_ids', [...draft.filtered_item_ids, trimmed]);
    setNewItemId('');
  };

  const handleSave = async () => {
    const result = await saveConfig(draft);
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <p className="font-nunito text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Success banner */}
      {saved && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
          <p className="font-nunito text-sm text-emerald-700">Configuration saved successfully.</p>
        </div>
      )}

      {/* Stamp System + Point System side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Stamp System */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <SectionLabel>Stamp System</SectionLabel>
              <p className="text-sm font-nunito text-stone-700 font-medium -mt-2">Earn stamps per order</p>
            </div>
            <ToggleSwitch
              checked={draft.stamps_enabled}
              onChange={(v) => update('stamps_enabled', v)}
              label="Enable stamp system"
            />
          </div>
          <div className={draft.stamps_enabled ? '' : 'opacity-40 pointer-events-none'}>
            <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
              Stamps per order
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={draft.stamps_per_order}
              onChange={(e) => update('stamps_per_order', Number(e.target.value))}
              className="w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none"
            />
          </div>
        </Card>

        {/* Point System */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <SectionLabel>Point System</SectionLabel>
              <p className="text-sm font-nunito text-stone-700 font-medium -mt-2">Earn points per peso spent</p>
            </div>
            <ToggleSwitch
              checked={draft.points_enabled}
              onChange={(v) => update('points_enabled', v)}
              label="Enable point system"
            />
          </div>
          <div className={draft.points_enabled ? '' : 'opacity-40 pointer-events-none'}>
            <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-1.5">
              Points per peso
            </label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              max={100}
              value={draft.points_per_peso}
              onChange={(e) => update('points_per_peso', Number(e.target.value))}
              className="w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none"
            />
          </div>
        </Card>
      </div>

      {/* Qualifying Purchases */}
      <Card>
        <SectionLabel>Qualifying Purchases</SectionLabel>
        <p className="text-sm font-nunito text-stone-500 mb-4">
          Choose which orders earn loyalty — allowlist means only listed categories/items qualify; blocklist means all except listed.
        </p>

        {/* Filter mode toggle */}
        <div className="flex gap-2 mb-5">
          {(['allowlist', 'blocklist'] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => update('filter_mode', mode)}
              className={`px-4 py-2 rounded-lg text-sm font-nunito font-medium transition-colors capitalize
                ${draft.filter_mode === mode
                  ? 'bg-[#3D8A80] text-white'
                  : 'bg-[#F8F6F3] text-stone-600 border border-[#E8E3DA] hover:bg-[#F2EEE8]'
                }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Category IDs */}
        <div className="mb-4">
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-2">
            Category IDs
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {draft.filtered_category_ids.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 bg-[#7BBFB5]/10 text-[#3D8A80] px-3 py-1 rounded-full text-xs font-medium"
              >
                {id}
                <button
                  type="button"
                  onClick={() => removeCategoryId(id)}
                  aria-label={`Remove category ${id}`}
                  className="hover:text-[#2C6E65] transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste category ID..."
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategoryId()}
              className="flex-1 bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none"
            />
            <button
              type="button"
              onClick={addCategoryId}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F8F6F3] border border-[#E8E3DA] text-sm font-nunito text-stone-600 hover:bg-[#F2EEE8] transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        {/* Item IDs */}
        <div>
          <label className="block text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide mb-2">
            Item IDs
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {draft.filtered_item_ids.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 bg-[#7BBFB5]/10 text-[#3D8A80] px-3 py-1 rounded-full text-xs font-medium"
              >
                {id}
                <button
                  type="button"
                  onClick={() => removeItemId(id)}
                  aria-label={`Remove item ${id}`}
                  className="hover:text-[#2C6E65] transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste item ID..."
              value={newItemId}
              onChange={(e) => setNewItemId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItemId()}
              className="flex-1 bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none"
            />
            <button
              type="button"
              onClick={addItemId}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#F8F6F3] border border-[#E8E3DA] text-sm font-nunito text-stone-600 hover:bg-[#F2EEE8] transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </Card>

      {/* Claim Window */}
      <Card>
        <SectionLabel>Claim Window</SectionLabel>
        <p className="text-sm font-nunito text-stone-500 mb-4">
          Number of days a customer has to claim a reward after earning it. After this window, the reward expires.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={365}
            value={draft.claim_window_days}
            onChange={(e) => update('claim_window_days', Number(e.target.value))}
            className="w-32 bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none"
          />
          <span className="text-sm font-nunito text-stone-500">days</span>
        </div>
      </Card>

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-[#3D8A80] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
