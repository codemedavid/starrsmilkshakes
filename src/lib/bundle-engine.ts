// src/lib/bundle-engine.ts
// Pure business logic for bundles — no I/O, no DB, no network.

import type { Bundle, SlotSelection, SlotItemAvailability } from '@/types/bundle';

export function validateBundleSelections(
  bundle: Bundle, slotSelections: SlotSelection[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const slot of (bundle.slots || [])) {
    const selection = slotSelections.find(s => s.slot_id === slot.id);
    const count = selection?.selected_items.length ?? 0;

    if (count < slot.min_selections) {
      errors.push(`"${slot.label}" requires at least ${slot.min_selections} selection(s), got ${count}`);
    }
    if (count > slot.max_selections) {
      errors.push(`"${slot.label}" allows at most ${slot.max_selections} selection(s), got ${count}`);
    }

    // Check each selected item is eligible for the slot
    if (selection) {
      const eligibleIds = new Set(slot.items.map(i => i.menu_item_id));
      for (const sel of selection.selected_items) {
        if (!eligibleIds.has(sel.menu_item_id)) {
          errors.push(`Item "${sel.menu_item_id}" is not eligible for slot "${slot.label}"`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getBundleEffectivePrice(bundle: Bundle, now: Date): number {
  if (!bundle.discount_active || bundle.discount_price === null) {
    return bundle.base_price;
  }
  const start = bundle.discount_start_date ? new Date(bundle.discount_start_date) : null;
  const end = bundle.discount_end_date ? new Date(bundle.discount_end_date) : null;
  const inRange = (!start || now >= start) && (!end || now <= end);
  return inRange ? bundle.discount_price : bundle.base_price;
}

export function calculateBundlePrice(
  bundle: Bundle, slotSelections: SlotSelection[], now: Date,
): { effectivePrice: number; addOnsTotal: number; variationsExtra: number; total: number } {
  const effectivePrice = getBundleEffectivePrice(bundle, now);
  let addOnsTotal = 0;
  let variationsExtra = 0;

  for (const sel of slotSelections) {
    for (const item of sel.selected_items) {
      if (item.selected_add_ons) {
        for (const addon of item.selected_add_ons) {
          addOnsTotal += Number(addon.price) * ((addon as any).quantity || 1);
        }
      }
      if (item.selected_variation) {
        variationsExtra += Number(item.selected_variation.price);
      }
    }
  }

  return { effectivePrice, addOnsTotal, variationsExtra, total: effectivePrice + addOnsTotal + variationsExtra };
}

export function calculateBundleSavings(
  bundle: Bundle, slotSelections: SlotSelection[], now: Date,
): { individualTotal: number; bundleTotal: number; savings: number; savingsPercent: number } {
  let individualTotal = 0;

  for (const sel of slotSelections) {
    const slot = (bundle.slots || []).find(s => s.id === sel.slot_id);
    if (!slot) continue;
    for (const item of sel.selected_items) {
      const slotItem = slot.items.find(si => si.menu_item_id === item.menu_item_id);
      if (slotItem?.menu_item) {
        individualTotal += (slotItem.menu_item as any).basePrice ?? (slotItem.menu_item as any).base_price ?? 0;
      }
    }
  }

  const bundleTotal = getBundleEffectivePrice(bundle, now);
  const savings = individualTotal - bundleTotal;
  const savingsPercent = individualTotal > 0 ? (savings / individualTotal) * 100 : 0;

  return { individualTotal, bundleTotal, savings, savingsPercent };
}

export function isBundleAvailable(bundle: Bundle, slotAvailability: SlotItemAvailability[]): boolean {
  if (!bundle.available) return false;

  for (const slot of (bundle.slots || [])) {
    const avail = slotAvailability.find(a => a.slot_id === slot.id);
    if (!avail || avail.available_count < slot.min_selections) return false;
  }

  return true;
}
