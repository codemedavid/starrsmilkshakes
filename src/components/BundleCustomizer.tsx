// UX Roast: Slot progress was a cryptic "(1/3)" that only a dev could love.
// Validation error was a whisper. "Add to Cart" button forgot to mention the price.
// Fixed: Added progress bar per slot, promoted validation, price on the CTA, better touch targets.
'use client';

import { useState, useMemo } from 'react';
import { X, Check, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import type { Bundle, BundleSlot, SlotSelection } from '@/types/bundle';
import type { MenuItem, Variation, AddOn } from '@/types';
import { calculateBundlePrice, validateBundleSelections, calculateBundleSavings } from '@/lib/bundle-engine';

interface BundleCustomizerProps {
  bundle: Bundle;
  onAddToCart: (selections: SlotSelection[], totalPrice: number) => void;
  onClose: () => void;
}

interface SlotState {
  slot_id: string;
  selected_items: {
    menu_item_id: string;
    menu_item: MenuItem;
    selected_variation: Variation | null;
    selected_add_ons: AddOn[];
  }[];
}

export default function BundleCustomizer({ bundle, onAddToCart, onClose }: BundleCustomizerProps) {
  const [slotStates, setSlotStates] = useState<SlotState[]>(
    bundle.slots.map(slot => ({ slot_id: slot.id, selected_items: [] }))
  );
  const [expandedSlot, setExpandedSlot] = useState<string>(bundle.slots[0]?.id ?? '');

  // Build selections for engine — memoized so downstream useMemo deps are stable
  const selections = useMemo<SlotSelection[]>(
    () => slotStates.map(s => ({
      slot_id: s.slot_id,
      selected_items: s.selected_items.map(i => ({
        menu_item_id: i.menu_item_id,
        selected_variation: i.selected_variation,
        selected_add_ons: i.selected_add_ons,
      })),
    })),
    [slotStates]
  );

  const priceInfo = useMemo(
    () => calculateBundlePrice(bundle, selections, new Date()),
    [bundle, selections]
  );

  const savingsInfo = useMemo(
    () => calculateBundleSavings(bundle, selections, new Date()),
    [bundle, selections]
  );

  const validation = useMemo(
    () => validateBundleSelections(bundle, selections),
    [bundle, selections]
  );

  const handleSelectItem = (slotId: string, menuItem: MenuItem, slot: BundleSlot) => {
    setSlotStates(prev => prev.map(s => {
      if (s.slot_id !== slotId) return s;

      const alreadySelected = s.selected_items.find(i => i.menu_item_id === menuItem.id);
      if (alreadySelected) {
        // Deselect
        return { ...s, selected_items: s.selected_items.filter(i => i.menu_item_id !== menuItem.id) };
      }

      // If max = 1, replace selection
      if (slot.max_selections === 1) {
        return {
          ...s,
          selected_items: [{
            menu_item_id: menuItem.id,
            menu_item: menuItem,
            selected_variation: null,
            selected_add_ons: [],
          }],
        };
      }

      // Add if under max
      if (s.selected_items.length < slot.max_selections) {
        return {
          ...s,
          selected_items: [
            ...s.selected_items,
            { menu_item_id: menuItem.id, menu_item: menuItem, selected_variation: null, selected_add_ons: [] },
          ],
        };
      }

      return s;
    }));
  };

  const handleVariation = (slotId: string, menuItemId: string, variation: Variation | null) => {
    setSlotStates(prev => prev.map(s => {
      if (s.slot_id !== slotId) return s;
      return {
        ...s,
        selected_items: s.selected_items.map(i =>
          i.menu_item_id === menuItemId ? { ...i, selected_variation: variation } : i
        ),
      };
    }));
  };

  const handleToggleAddOn = (slotId: string, menuItemId: string, addOn: AddOn) => {
    setSlotStates(prev => prev.map(s => {
      if (s.slot_id !== slotId) return s;
      return {
        ...s,
        selected_items: s.selected_items.map(i => {
          if (i.menu_item_id !== menuItemId) return i;
          const exists = i.selected_add_ons.find(a => a.id === addOn.id);
          if (exists) {
            return { ...i, selected_add_ons: i.selected_add_ons.filter(a => a.id !== addOn.id) };
          }
          return { ...i, selected_add_ons: [...i.selected_add_ons, addOn] };
        }),
      };
    }));
  };

  const handleAddToCart = () => {
    if (!validation.valid) return;
    onAddToCart(selections, priceInfo.total);
  };

  const showSavingsBadge = savingsInfo.savings > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop — keyboard users can press Escape; the overlay itself acts as a close affordance */}
      <div
        role="button"
        tabIndex={-1}
        aria-label="Close bundle customizer"
        className="absolute inset-0 bg-black/50 cursor-default"
        onClick={onClose}
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      />
      <div className="relative w-full max-w-lg mx-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {bundle.image_url && (
              <img
                src={bundle.image_url}
                alt={bundle.name}
                className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-playfair text-xl font-semibold text-stone-900">{bundle.name}</h2>
                {showSavingsBadge && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#7BBFB5]/15 text-[#3D8A80] text-xs font-nunito font-semibold">
                    Save ₱{savingsInfo.savings.toFixed(0)}
                  </span>
                )}
              </div>
              {bundle.description && (
                <p className="text-sm text-stone-500 mt-0.5 line-clamp-2">{bundle.description}</p>
              )}
              <p className="text-sm font-nunito font-semibold text-[#3D8A80] mt-1">
                From ₱{bundle.base_price.toFixed(0)}
                {bundle.discount_active && bundle.discount_price !== null && (
                  <span className="ml-1 line-through text-stone-400 font-normal">
                    ₱{bundle.base_price.toFixed(0)}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-stone-100 rounded-full flex-shrink-0 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        {/* Slots */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {[...bundle.slots].sort((a, b) => a.sort_order - b.sort_order).map(slot => {
            const state = slotStates.find(s => s.slot_id === slot.id)!;
            const isExpanded = expandedSlot === slot.id;
            const selCount = state.selected_items.length;
            const isDone = selCount >= slot.min_selections;

            return (
              <div key={slot.id} className="border rounded-xl overflow-hidden">
                {/* Slot header */}
                <button
                  onClick={() => setExpandedSlot(isExpanded ? '' : slot.id)}
                  className="w-full flex flex-col gap-1.5 p-3 min-h-[48px] bg-stone-50 hover:bg-stone-100 transition-colors"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {isDone ? (
                        <div className="w-5 h-5 rounded-full bg-[#3D8A80] flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      ) : (
                        <span className="w-5 h-5 rounded-full border-2 border-stone-300 flex-shrink-0" />
                      )}
                      <span className="font-nunito font-semibold text-stone-800">{slot.label}</span>
                      {slot.min_selections > 0 && !isDone && (
                        <span className="text-[11px] font-nunito font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Required</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-nunito text-xs text-stone-400">
                        {selCount} of {slot.max_selections}
                      </span>
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-stone-400 flex-shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />
                      }
                    </div>
                  </div>
                  {/* Mini progress bar */}
                  <div className="w-full h-1 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${isDone ? 'bg-[#3D8A80]' : 'bg-[#7BBFB5]'}`}
                      style={{ width: `${Math.min((selCount / slot.max_selections) * 100, 100)}%` }}
                    />
                  </div>
                </button>

                {/* Slot items */}
                {isExpanded && (
                  <div className="p-3 space-y-2">
                    {[...slot.items].sort((a, b) => a.sort_order - b.sort_order).map(slotItem => {
                      const mi = slotItem.menu_item;
                      if (!mi) return null;
                      const isSelected = state.selected_items.some(i => i.menu_item_id === mi.id);
                      const selectedState = state.selected_items.find(i => i.menu_item_id === mi.id);

                      return (
                        <div key={slotItem.id}>
                          {/* Item card — min-h for 44px touch target */}
                          <button
                            onClick={() => handleSelectItem(slot.id, mi, slot)}
                            className={`w-full flex items-center gap-3 p-3 min-h-[48px] rounded-lg border-2 transition-all ${
                              isSelected
                                ? 'border-[#7BBFB5] bg-[#7BBFB5]/5 shadow-sm'
                                : 'border-transparent bg-stone-50 hover:bg-stone-100'
                            }`}
                          >
                            {mi.image && (
                              <img
                                src={mi.image}
                                alt={mi.name}
                                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                              />
                            )}
                            <div className="flex-1 text-left min-w-0">
                              <p className="font-nunito font-semibold text-stone-900 text-sm truncate">
                                {mi.name}
                              </p>
                              {slotItem.price_override !== null ? (
                                <p className="text-xs text-stone-500">₱{slotItem.price_override.toFixed(0)}</p>
                              ) : (
                                <p className="text-xs text-stone-400">Included</p>
                              )}
                            </div>
                            {isSelected && <Check className="w-5 h-5 text-[#7BBFB5] flex-shrink-0" />}
                          </button>

                          {/* Variations & Add-ons for selected item */}
                          {isSelected && selectedState && (
                            <div className="ml-4 mt-2 space-y-3 pb-1">
                              {/* Variations */}
                              {mi.variations && mi.variations.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-stone-500 mb-1.5">Size</p>
                                  <div className="flex gap-2 flex-wrap">
                                    {mi.variations.map(v => (
                                      <button
                                        key={v.id}
                                        onClick={() =>
                                          handleVariation(
                                            slot.id,
                                            mi.id,
                                            selectedState.selected_variation?.id === v.id ? null : v
                                          )
                                        }
                                        className={`px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-nunito font-medium border transition-all ${
                                          selectedState.selected_variation?.id === v.id
                                            ? 'border-[#7BBFB5] bg-[#7BBFB5]/10 text-[#3D8A80]'
                                            : 'border-stone-200 text-stone-600 hover:border-stone-300'
                                        }`}
                                      >
                                        {v.name}{v.price > 0 && ` +₱${v.price}`}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Add-ons */}
                              {mi.addOns && mi.addOns.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-stone-500 mb-1.5">Add-ons</p>
                                  <div className="space-y-1">
                                    {mi.addOns.map(a => {
                                      const isAdded = selectedState.selected_add_ons.some(sa => sa.id === a.id);
                                      return (
                                        <button
                                          key={a.id}
                                          onClick={() => handleToggleAddOn(slot.id, mi.id, a)}
                                          className={`w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-nunito border transition-all ${
                                            isAdded
                                              ? 'border-[#7BBFB5] bg-[#7BBFB5]/5 text-[#3D8A80] font-semibold'
                                              : 'border-stone-200 text-stone-600 hover:border-stone-300'
                                          }`}
                                        >
                                          <span className="flex items-center gap-1.5">
                                            {isAdded && <Check className="w-3 h-3 text-[#3D8A80]" />}
                                            {a.name}
                                          </span>
                                          <span>+₱{a.price}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-white">
          {/* Validation errors — prominent, not an afterthought */}
          {!validation.valid && validation.errors.length > 0 && (
            <div className="flex items-start gap-2 mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 font-nunito font-medium">
                {validation.errors[0]}
              </p>
            </div>
          )}

          {/* Savings line */}
          {showSavingsBadge && (
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="font-nunito text-xs text-[#3D8A80]">Bundle savings</span>
              <span className="font-nunito text-xs font-bold text-[#3D8A80]">
                -₱{savingsInfo.savings.toFixed(0)} ({savingsInfo.savingsPercent.toFixed(0)}% off)
              </span>
            </div>
          )}

          {/* Total */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="font-nunito text-sm text-stone-500">Total</span>
            <span className="font-nunito font-bold text-lg text-stone-900">
              ₱{priceInfo.total.toFixed(0)}
            </span>
          </div>

          {/* Add to Cart — includes price so users don't have to look up */}
          <button
            onClick={handleAddToCart}
            disabled={!validation.valid}
            className="w-full min-h-[48px] py-3 bg-[#7BBFB5] text-white font-nunito font-bold text-sm rounded-xl hover:bg-[#3D8A80] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {validation.valid
              ? `Add to Cart · ₱${priceInfo.total.toFixed(0)}`
              : 'Complete your selections'}
          </button>
        </div>
      </div>
    </div>
  );
}
