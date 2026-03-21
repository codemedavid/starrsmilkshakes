'use client';

import { Minus, Plus } from 'lucide-react';
import type { Bundle, SlotState } from '@/types/bundle';
import ReviewItemCard from './ReviewItemCard';

interface BundleReviewStepProps {
  bundle: Bundle;
  slotStates: SlotState[];
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onEditSlot: (slotIndex: number) => void;
  priceInfo: { effectivePrice: number; addOnsTotal: number; variationsExtra: number; total: number };
  savingsInfo: { savings: number; savingsPercent: number };
}

export default function BundleReviewStep({
  bundle, slotStates, quantity, onQuantityChange, onEditSlot, priceInfo, savingsInfo,
}: BundleReviewStepProps) {
  const sortedSlots = [...bundle.slots].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="px-4 pb-28">
      <div className="text-center mb-6">
        <h2 className="font-playfair text-xl font-semibold text-stone-900">{bundle.name}</h2>
        <p className="font-nunito text-sm text-stone-500 mt-1">Review your selections</p>
      </div>
      <div className="space-y-3 mb-6">
        {sortedSlots.map((slot, slotIndex) => {
          const state = slotStates.find(s => s.slot_id === slot.id);
          if (!state || state.selected_items.length === 0) return null;
          return (
            <ReviewItemCard key={slot.id} slot={slot} slotState={state} onEdit={() => onEditSlot(slotIndex)} />
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 mb-6">
        <span className="font-nunito text-sm text-stone-600">Quantity</span>
        <div className="flex items-center gap-3 bg-stone-100 rounded-xl px-3 py-1.5">
          <button onClick={() => quantity > 1 && onQuantityChange(quantity - 1)} disabled={quantity <= 1}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-600 disabled:text-stone-300">
            <Minus className="w-4 h-4" />
          </button>
          <span className="font-nunito font-bold text-lg min-w-[24px] text-center">{quantity}</span>
          <button onClick={() => onQuantityChange(quantity + 1)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-600">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="bg-[#F0FDF9] rounded-xl p-4">
        <div className="flex justify-between text-sm text-stone-600 mb-2">
          <span className="font-nunito">Bundle price {quantity > 1 ? `× ${quantity}` : ''}</span>
          <span className="font-nunito">₱{(priceInfo.effectivePrice * quantity).toFixed(0)}</span>
        </div>
        {(priceInfo.addOnsTotal + priceInfo.variationsExtra) > 0 && (
          <div className="flex justify-between text-sm text-stone-600 mb-2">
            <span className="font-nunito">Customizations</span>
            <span className="font-nunito">+₱{((priceInfo.addOnsTotal + priceInfo.variationsExtra) * quantity).toFixed(0)}</span>
          </div>
        )}
        {savingsInfo.savings > 0 && (
          <div className="flex justify-between text-sm text-[#3D8A80] font-semibold mb-2">
            <span className="font-nunito">You save</span>
            <span className="font-nunito">-₱{(savingsInfo.savings * quantity).toFixed(0)} ({savingsInfo.savingsPercent.toFixed(0)}% off)</span>
          </div>
        )}
        <div className="border-t border-[#D1FAE5] mt-2 pt-2 flex justify-between">
          <span className="font-nunito font-bold text-lg text-stone-900">Total</span>
          <span className="font-nunito font-bold text-lg text-stone-900">₱{(priceInfo.total * quantity).toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}
