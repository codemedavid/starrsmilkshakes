'use client';

import type { BundleSlot, SlotState } from '@/types/bundle';
import type { MenuItem, Variation, AddOn } from '@/types';
import ItemCard from './ItemCard';
import ItemCustomizer from './ItemCustomizer';

interface SlotStepProps {
  slot: BundleSlot;
  slotState: SlotState;
  onSelectItem: (menuItem: MenuItem) => void;
  onVariation: (menuItemId: string, variation: Variation | null) => void;
  onToggleAddOn: (menuItemId: string, addOn: AddOn) => void;
}

export default function SlotStep({
  slot,
  slotState,
  onSelectItem,
  onVariation,
  onToggleAddOn,
}: SlotStepProps) {
  const sortedItems = [...slot.items].sort((a, b) => a.sort_order - b.sort_order);
  const selCount = slotState.selected_items.length;

  return (
    <div className="px-4 pb-28">
      <div className="mb-4">
        <h2 className="font-playfair text-xl font-semibold text-stone-900">{slot.label}</h2>
        <p className="font-nunito text-sm text-stone-500 mt-1">
          {slot.min_selections === slot.max_selections
            ? `Pick ${slot.min_selections}`
            : `Pick ${slot.min_selections} to ${slot.max_selections}`}
          {selCount > 0 && (
            <span className="text-[#3D8A80] font-semibold"> · {selCount} selected</span>
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {sortedItems.map(slotItem => {
          const mi = slotItem.menu_item;
          if (!mi) return null;
          const isSelected = slotState.selected_items.some(i => i.menu_item_id === mi.id);
          return (
            <div key={slotItem.id}>
              <ItemCard
                item={mi}
                priceOverride={slotItem.price_override}
                isSelected={isSelected}
                onSelect={() => onSelectItem(mi)}
              />
            </div>
          );
        })}
      </div>
      {slotState.selected_items.map(sel => {
        const mi = sel.menu_item;
        return (
          <div
            key={sel.menu_item_id}
            className="mt-4 p-3 bg-[#7BBFB5]/5 border border-[#7BBFB5]/20 rounded-xl"
          >
            <p className="font-nunito font-bold text-sm text-stone-800 mb-1">
              Customize: {mi.name}
            </p>
            <ItemCustomizer
              item={mi}
              selectedVariation={sel.selected_variation}
              selectedAddOns={sel.selected_add_ons}
              onVariation={(v) => onVariation(sel.menu_item_id, v)}
              onToggleAddOn={(a) => onToggleAddOn(sel.menu_item_id, a)}
            />
          </div>
        );
      })}
    </div>
  );
}
