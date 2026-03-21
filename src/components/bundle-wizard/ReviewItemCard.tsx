'use client';

import type { SlotState, BundleSlot } from '@/types/bundle';

interface ReviewItemCardProps {
  slot: BundleSlot;
  slotState: SlotState;
  onEdit: () => void;
}

export default function ReviewItemCard({ slot, slotState, onEdit }: ReviewItemCardProps) {
  return (
    <div className="bg-white rounded-xl p-3 border border-stone-200 space-y-3">
      {slotState.selected_items.map(sel => {
        const mi = sel.menu_item;
        const variationText = sel.selected_variation ? sel.selected_variation.name : null;
        const addOnsText = sel.selected_add_ons.length > 0
          ? sel.selected_add_ons.map(a => a.name).join(', ')
          : null;
        const subtitle = [variationText, addOnsText].filter(Boolean).join(' · ') || 'No customizations';
        return (
          <div key={sel.menu_item_id} className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-100 flex-shrink-0">
              {mi.image ? (
                <img src={mi.image} alt={mi.name} className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-lg">🥤</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-[#3D8A80] uppercase tracking-wide">{slot.label}</p>
              <p className="font-nunito font-bold text-sm text-stone-900 truncate">{mi.name}</p>
              <p className="font-nunito text-xs text-stone-500 truncate">{subtitle}</p>
            </div>
            <button
              onClick={onEdit}
              className="text-xs text-[#3D8A80] font-semibold border border-[#3D8A80] rounded-md px-2.5 py-1 min-h-[32px] hover:bg-[#3D8A80]/5 transition-colors flex-shrink-0"
            >
              Edit
            </button>
          </div>
        );
      })}
    </div>
  );
}
