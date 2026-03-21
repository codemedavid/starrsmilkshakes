'use client';

import { useState, useMemo, useTransition } from 'react';
import { AlertTriangle, CheckCircle, Plus, Trash2, GripVertical } from 'lucide-react';
import type { MenuItem, AddOn } from '@/types';
import type { AddonSuggestion } from '@/types/upsell';
import { setAddonSuggestions } from '@/actions/upsell-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  suggestions: any[];
  menuItems: MenuItem[];
}

interface LocalSuggestion {
  add_on_id: string;
  suggestion_text: string;
  sort_order: number;
  is_active: boolean;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UpsellAddonsTab({ suggestions, menuItems }: Props) {
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [localSuggestions, setLocalSuggestions] = useState<LocalSuggestion[]>([]);
  const [addOnPickerId, setAddOnPickerId] = useState<string>('');
  const [pickerText, setPickerText] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Items that have add-ons
  const itemsWithAddOns = useMemo(
    () => menuItems.filter(m => m.addOns && m.addOns.length > 0),
    [menuItems]
  );

  // Currently selected menu item
  const selectedItem = useMemo(
    () => itemsWithAddOns.find(m => m.id === selectedItemId) ?? null,
    [itemsWithAddOns, selectedItemId]
  );

  // Add-ons already in local suggestions (to avoid duplicates)
  const usedAddOnIds = useMemo(
    () => new Set(localSuggestions.map(s => s.add_on_id)),
    [localSuggestions]
  );

  // Available add-ons to pick from (not yet added)
  const availableAddOns = useMemo(
    () => (selectedItem?.addOns ?? []).filter(a => !usedAddOnIds.has(a.id)),
    [selectedItem, usedAddOnIds]
  );

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // When an item is selected, load its suggestions from the SSR data
  const handleSelectItem = (id: string) => {
    setSelectedItemId(id);
    setIsDirty(false);
    setAddOnPickerId('');
    setPickerText('');

    const itemSuggestions = suggestions
      .filter((s: any) => s.menu_item_id === id)
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((s: any): LocalSuggestion => ({
        add_on_id: s.add_on_id,
        suggestion_text: s.suggestion_text ?? '',
        sort_order: s.sort_order,
        is_active: s.is_active,
      }));

    setLocalSuggestions(itemSuggestions);
  };

  const handleAddSuggestion = () => {
    if (!addOnPickerId) return;
    const nextOrder = localSuggestions.length > 0
      ? Math.max(...localSuggestions.map(s => s.sort_order)) + 1
      : 0;
    setLocalSuggestions(prev => [
      ...prev,
      {
        add_on_id: addOnPickerId,
        suggestion_text: pickerText.trim(),
        sort_order: nextOrder,
        is_active: true,
      },
    ]);
    setAddOnPickerId('');
    setPickerText('');
    setIsDirty(true);
  };

  const handleRemove = (addOnId: string) => {
    setLocalSuggestions(prev => prev.filter(s => s.add_on_id !== addOnId));
    setIsDirty(true);
  };

  const handleUpdateText = (addOnId: string, text: string) => {
    setLocalSuggestions(prev =>
      prev.map(s => (s.add_on_id === addOnId ? { ...s, suggestion_text: text } : s))
    );
    setIsDirty(true);
  };

  const handleToggleActive = (addOnId: string, value: boolean) => {
    setLocalSuggestions(prev =>
      prev.map(s => (s.add_on_id === addOnId ? { ...s, is_active: value } : s))
    );
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!selectedItemId) return;
    startTransition(async () => {
      const payload = {
        menu_item_id: selectedItemId,
        suggestions: localSuggestions.map((s, i) => ({
          add_on_id: s.add_on_id,
          suggestion_text: s.suggestion_text || null,
          sort_order: i,
          is_active: s.is_active,
        })),
      };
      const result = await setAddonSuggestions(payload);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to save suggestions.');
        return;
      }
      setIsDirty(false);
      showToast('success', 'Add-on suggestions saved.');
    });
  };

  // Resolve add-on name from selectedItem
  const resolveAddOnName = (addOnId: string): string => {
    const addOn = selectedItem?.addOns?.find(a => a.id === addOnId);
    // Also check in suggestions data (for already-saved ones)
    if (addOn) return addOn.name;
    const fromSuggestions = suggestions.find((s: any) => s.add_on_id === addOnId);
    return fromSuggestions?.add_ons?.name ?? addOnId;
  };

  const inputCls =
    'w-full px-3 py-2 text-sm font-nunito border border-[#E8E3DA] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7BBFB5] bg-white text-stone-800';

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

      {/* Header */}
      <div>
        <h2 className="font-playfair text-lg font-semibold text-stone-800">Add-on Suggestions</h2>
        <p className="text-xs font-nunito text-stone-500 mt-0.5">
          For each menu item, configure which add-ons to suggest and the suggestion copy.
        </p>
      </div>

      {/* Item selector */}
      <div className="bg-white border border-[#E8E3DA] rounded-xl p-5">
        <label className="text-xs font-nunito font-medium text-stone-500 mb-1.5 block">
          Select Menu Item
        </label>
        <select
          className={inputCls}
          value={selectedItemId}
          onChange={e => handleSelectItem(e.target.value)}
        >
          <option value="">— Choose a menu item —</option>
          {itemsWithAddOns.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {itemsWithAddOns.length === 0 && (
          <p className="text-xs text-stone-400 font-nunito mt-2">
            No menu items have add-ons configured yet.
          </p>
        )}
      </div>

      {/* Suggestions for selected item */}
      {selectedItem && (
        <div className="bg-white border border-[#E8E3DA] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8E3DA] bg-[#FAFAF8]">
            <h3 className="font-nunito font-semibold text-stone-700 text-sm">
              Suggestions for <span className="text-[#3D8A80]">{selectedItem.name}</span>
            </h3>
            <p className="text-xs text-stone-400 font-nunito mt-0.5">
              {localSuggestions.length} suggestion{localSuggestions.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Suggestion rows */}
          {localSuggestions.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="font-nunito text-stone-400 text-sm">
                No suggestions yet. Add one below.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#F2EEE8]">
              {localSuggestions.map((s, idx) => (
                <li key={s.add_on_id} className="flex items-start gap-3 px-5 py-4">
                  <GripVertical className="h-4 w-4 text-stone-300 mt-2.5 shrink-0 cursor-grab" aria-hidden="true" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-nunito font-medium text-stone-800">
                      {resolveAddOnName(s.add_on_id)}
                    </p>
                    <input
                      className={inputCls}
                      placeholder="Suggestion text (optional)"
                      value={s.suggestion_text}
                      onChange={e => handleUpdateText(s.add_on_id, e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-2 shrink-0">
                    <ToggleSwitch
                      checked={s.is_active}
                      onChange={v => handleToggleActive(s.add_on_id, v)}
                      label={`Toggle ${resolveAddOnName(s.add_on_id)}`}
                    />
                    <button
                      onClick={() => handleRemove(s.add_on_id)}
                      className="p-1.5 rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      aria-label={`Remove ${resolveAddOnName(s.add_on_id)}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Add suggestion picker */}
          {availableAddOns.length > 0 && (
            <div className="px-5 py-4 border-t border-[#E8E3DA] bg-[#FAFAF8]">
              <p className="text-xs font-nunito font-medium text-stone-500 mb-3">Add a suggestion</p>
              <div className="flex gap-3">
                <select
                  className={inputCls}
                  value={addOnPickerId}
                  onChange={e => setAddOnPickerId(e.target.value)}
                >
                  <option value="">— Select add-on —</option>
                  {availableAddOns.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  className={inputCls}
                  placeholder="Suggestion text (optional)"
                  value={pickerText}
                  onChange={e => setPickerText(e.target.value)}
                />
                <button
                  onClick={handleAddSuggestion}
                  disabled={!addOnPickerId}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-nunito font-semibold text-white bg-[#3D8A80] rounded-lg hover:bg-[#2F6B63] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Save footer */}
          <div className="px-5 py-4 border-t border-[#E8E3DA] flex items-center justify-end gap-3">
            {isDirty && (
              <p className="text-xs font-nunito text-amber-600">Unsaved changes</p>
            )}
            <button
              onClick={handleSave}
              disabled={isPending || !isDirty}
              className="px-5 py-2 text-sm font-nunito font-semibold text-white bg-[#3D8A80] rounded-lg hover:bg-[#2F6B63] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? 'Saving…' : 'Save Suggestions'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
