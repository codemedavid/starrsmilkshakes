'use client';

import { useState, useId } from 'react';
import { Loader2, Plus, Trash2, ChevronDown, X } from 'lucide-react';
import type { Bundle } from '@/types/bundle';
import type { MenuItem, Category } from '@/types';
import { createBundle, updateBundle } from '@/actions/bundle-admin';
import ImageUpload from '@/components/ImageUpload';

interface SlotItemDraft {
  menu_item_id: string;
  menu_item_name: string;
  price_override: string;
}

interface SlotDraft {
  label: string;
  min_selections: number;
  max_selections: number;
  items: SlotItemDraft[];
}

interface Props {
  bundle: Bundle | null;
  categories: Category[];
  menuItems: MenuItem[];
  onClose: () => void;
}

export default function BundleForm({ bundle, categories, menuItems, onClose }: Props) {
  const isEditing = bundle !== null;
  const formId = useId();

  // ── Basic fields ────────────────────────────────────────────────────────────
  const [name, setName] = useState(bundle?.name ?? '');
  const [description, setDescription] = useState(bundle?.description ?? '');
  const [image, setImage] = useState<string | undefined>(bundle?.image_url ?? undefined);
  const [basePrice, setBasePrice] = useState(bundle?.base_price?.toString() ?? '');
  const [costPrice, setCostPrice] = useState(bundle?.cost_price?.toString() ?? '');
  const [category, setCategory] = useState(bundle?.category ?? (categories[0]?.id ?? ''));
  const [available, setAvailable] = useState(bundle?.available ?? true);
  const [popular, setPopular] = useState(bundle?.popular ?? false);

  // ── Discount fields ─────────────────────────────────────────────────────────
  const [discountActive, setDiscountActive] = useState(bundle?.discount_active ?? false);
  const [discountPrice, setDiscountPrice] = useState(bundle?.discount_price?.toString() ?? '');
  const [discountStartDate, setDiscountStartDate] = useState(bundle?.discount_start_date ?? '');
  const [discountEndDate, setDiscountEndDate] = useState(bundle?.discount_end_date ?? '');

  // ── Slots ───────────────────────────────────────────────────────────────────
  const [slots, setSlots] = useState<SlotDraft[]>(() => {
    if (!bundle?.slots?.length) return [];
    return bundle.slots.map((s) => ({
      label: s.label,
      min_selections: s.min_selections,
      max_selections: s.max_selections,
      items: (s.items ?? []).map((i) => ({
        menu_item_id: i.menu_item_id,
        menu_item_name: i.menu_item?.name ?? i.menu_item_id,
        price_override: i.price_override?.toString() ?? '',
      })),
    }));
  });

  // ── Item picker state (per slot) ────────────────────────────────────────────
  const [pickerSearch, setPickerSearch] = useState<Record<number, string>>({});
  const [pickerOpen, setPickerOpen] = useState<number | null>(null);

  // ── Submission ──────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Slot helpers ────────────────────────────────────────────────────────────
  const addSlot = () => {
    setSlots((prev) => [
      ...prev,
      { label: '', min_selections: 1, max_selections: 1, items: [] },
    ]);
  };

  const updateSlot = (index: number, field: keyof Omit<SlotDraft, 'items'>, value: string | number) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setPickerSearch((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    if (pickerOpen === index) setPickerOpen(null);
  };

  // ── Slot item helpers ───────────────────────────────────────────────────────
  const addItemToSlot = (slotIndex: number, menuItem: MenuItem) => {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== slotIndex) return s;
        // Prevent duplicate items in same slot
        if (s.items.some((si) => si.menu_item_id === menuItem.id)) return s;
        return {
          ...s,
          items: [
            ...s.items,
            { menu_item_id: menuItem.id, menu_item_name: menuItem.name, price_override: '' },
          ],
        };
      }),
    );
    setPickerSearch((prev) => ({ ...prev, [slotIndex]: '' }));
    setPickerOpen(null);
  };

  const updateSlotItemOverride = (slotIndex: number, itemIndex: number, value: string) => {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== slotIndex) return s;
        return {
          ...s,
          items: s.items.map((si, j) =>
            j === itemIndex ? { ...si, price_override: value } : si,
          ),
        };
      }),
    );
  };

  const removeItemFromSlot = (slotIndex: number, itemIndex: number) => {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== slotIndex) return s;
        return { ...s, items: s.items.filter((_, j) => j !== itemIndex) };
      }),
    );
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        image_url: image || null,
        base_price: parseFloat(basePrice),
        cost_price: costPrice ? parseFloat(costPrice) : null,
        category,
        available,
        popular,
        discount_active: discountActive,
        discount_price: discountPrice ? parseFloat(discountPrice) : null,
        discount_start_date: discountStartDate || null,
        discount_end_date: discountEndDate || null,
        sort_order: bundle?.sort_order ?? 0,
        slots: slots.map((s, idx) => ({
          label: s.label,
          sort_order: idx,
          min_selections: s.min_selections,
          max_selections: s.max_selections,
          items: s.items.map((si, jdx) => ({
            menu_item_id: si.menu_item_id,
            price_override: si.price_override ? parseFloat(si.price_override) : null,
            sort_order: jdx,
          })),
        })),
      };

      const result = isEditing
        ? await updateBundle(bundle.id, payload)
        : await createBundle(payload);

      if (!result.success) {
        setError(result.error || 'Something went wrong');
        return;
      }

      onClose();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Shared input class ──────────────────────────────────────────────────────
  const inputClass =
    'w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px] font-nunito text-sm text-stone-900 placeholder:text-stone-400 focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none transition-all duration-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4 bg-white rounded-xl shadow-xl border border-[#E8E3DA]">
        <div className="px-6 py-5 border-b border-[#E8E3DA] flex items-center justify-between">
          <h2 className="font-playfair text-xl font-semibold text-stone-900">
            {isEditing ? 'Edit Bundle' : 'Create Bundle'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-[#F2EEE8] hover:text-stone-600 transition-all duration-200"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form id={formId} onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-[10px] text-sm font-nunito text-red-700">
              {error}
            </div>
          )}

          {/* ── Basic Info ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Family Combo"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>Select a category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Base Price */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Base Price <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>

            {/* Cost Price */}
            <div>
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Cost Price
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className={inputClass}
                placeholder="e.g. 120.00"
              />
              <p className="font-nunito text-xs text-stone-400 mt-1">Leave empty if unknown.</p>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
                placeholder="A short description of this bundle"
              />
            </div>

            {/* Image */}
            <div className="md:col-span-2">
              <ImageUpload
                currentImage={image}
                onImageChange={(url) => setImage(url)}
              />
            </div>
          </div>

          {/* ── Toggles ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => setAvailable(e.target.checked)}
                className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
              />
              <span className="text-sm font-nunito text-stone-700">Available</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={popular}
                onChange={(e) => setPopular(e.target.checked)}
                className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
              />
              <span className="text-sm font-nunito text-stone-700">Popular</span>
            </label>
          </div>

          {/* ── Discount Section ─────────────────────────────────────────── */}
          <div className="border-t border-[#E8E3DA] pt-5">
            <label className="flex items-center gap-2.5 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={discountActive}
                onChange={(e) => setDiscountActive(e.target.checked)}
                className="w-4 h-4 text-[#7BBFB5] rounded border-[#E8E3DA] focus:ring-[#7BBFB5]/40"
              />
              <span className="text-sm font-nunito font-semibold text-stone-700">Enable Discount</span>
            </label>

            {discountActive && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                    Discount Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountPrice}
                    onChange={(e) => setDiscountPrice(e.target.value)}
                    className={inputClass}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={discountStartDate}
                    onChange={(e) => setDiscountStartDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={discountEndDate}
                    onChange={(e) => setDiscountEndDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Slots Editor ─────────────────────────────────────────────── */}
          <div className="border-t border-[#E8E3DA] pt-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-nunito text-sm font-semibold text-stone-700">Bundle Slots</h3>
                <p className="font-nunito text-xs text-stone-400 mt-0.5">Each slot lets the customer pick from a set of menu items.</p>
              </div>
              <button
                type="button"
                onClick={addSlot}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-nunito font-semibold text-[#3D8A80] bg-[#7BBFB5]/10 rounded-lg hover:bg-[#7BBFB5]/20 transition-all duration-200"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Slot
              </button>
            </div>

            {slots.length === 0 && (
              <p className="text-xs font-nunito text-stone-400 py-2">
                No slots added. Click &ldquo;Add Slot&rdquo; to define the choices customers will see.
              </p>
            )}

            <div className="space-y-4">
              {slots.map((slot, slotIdx) => {
                const search = pickerSearch[slotIdx] ?? '';
                const filteredItems = menuItems.filter(
                  (mi) =>
                    !slot.items.some((si) => si.menu_item_id === mi.id) &&
                    mi.name.toLowerCase().includes(search.toLowerCase()),
                );

                return (
                  <div
                    key={slotIdx}
                    className="border border-[#E8E3DA] rounded-xl p-4 bg-[#FAFAF8] space-y-3"
                  >
                    {/* Slot header row */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          required
                          value={slot.label}
                          onChange={(e) => updateSlot(slotIdx, 'label', e.target.value)}
                          className={inputClass}
                          placeholder="Slot label, e.g. Choose your shake"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSlot(slotIdx)}
                        className="p-2 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                        aria-label="Remove slot"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Min / Max selections */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-nunito font-medium text-stone-500 mb-1">
                          Min selections
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={slot.min_selections}
                          onChange={(e) =>
                            updateSlot(slotIdx, 'min_selections', parseInt(e.target.value, 10) || 0)
                          }
                          className={inputClass}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-nunito font-medium text-stone-500 mb-1">
                          Max selections
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={slot.max_selections}
                          onChange={(e) =>
                            updateSlot(slotIdx, 'max_selections', parseInt(e.target.value, 10) || 1)
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Items list */}
                    {slot.items.length > 0 && (
                      <div className="space-y-2">
                        {slot.items.map((si, itemIdx) => (
                          <div key={si.menu_item_id} className="flex items-center gap-2 bg-white rounded-lg border border-[#E8E3DA] px-3 py-2">
                            <span className="flex-1 font-nunito text-sm text-stone-800 truncate">
                              {si.menu_item_name}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={si.price_override}
                              onChange={(e) =>
                                updateSlotItemOverride(slotIdx, itemIdx, e.target.value)
                              }
                              className="w-28 px-2 py-1 border border-[#E8E3DA] rounded-lg font-nunito text-xs text-stone-700 focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none"
                              placeholder="Price override"
                            />
                            <button
                              type="button"
                              onClick={() => removeItemFromSlot(slotIdx, itemIdx)}
                              className="p-1 rounded text-stone-400 hover:text-red-500 transition-colors flex-shrink-0"
                              aria-label={`Remove ${si.menu_item_name}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Item picker */}
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={search}
                            onFocus={() => setPickerOpen(slotIdx)}
                            onChange={(e) => {
                              setPickerSearch((prev) => ({ ...prev, [slotIdx]: e.target.value }));
                              setPickerOpen(slotIdx);
                            }}
                            className="w-full px-3 py-2 border border-[#E8E3DA] rounded-lg font-nunito text-sm text-stone-700 placeholder:text-stone-400 focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] outline-none transition-all"
                            placeholder="Search and add menu items…"
                          />
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
                        </div>
                      </div>

                      {pickerOpen === slotIdx && filteredItems.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-[#E8E3DA] rounded-xl shadow-lg max-h-48 overflow-y-auto">
                          {filteredItems.slice(0, 30).map((mi) => (
                            <button
                              key={mi.id}
                              type="button"
                              onMouseDown={(e) => {
                                // Use mousedown to fire before blur
                                e.preventDefault();
                                addItemToSlot(slotIdx, mi);
                              }}
                              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[#F2EEE8] transition-colors"
                            >
                              <span className="font-nunito text-sm text-stone-800">{mi.name}</span>
                              <span className="font-nunito text-xs text-stone-400 ml-2">
                                ₱{mi.basePrice.toFixed(0)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {pickerOpen === slotIdx && (
                        // Invisible overlay to close picker on outside click
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setPickerOpen(null)}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div className="flex justify-end gap-3 pt-2 border-t border-[#E8E3DA]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-[10px] font-nunito font-semibold text-sm text-stone-600 hover:bg-[#F2EEE8] transition-all duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65] focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? 'Update Bundle' : 'Create Bundle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
