'use client';

import React from 'react';

interface CheckoutStickyBarProps {
  itemCount: number;
  totalPrice: number;
  currentStep: number;
  totalSteps: number;
}

export default function CheckoutStickyBar({
  itemCount,
  totalPrice,
  currentStep,
  totalSteps,
}: CheckoutStickyBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#2A5A4A] px-5 py-3.5 flex justify-between items-center z-40 border-t border-white/5">
      <div>
        <div className="text-[12px] text-[#8FB8A8]/70">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </div>
        <div className="font-bold text-[20px] text-[#FFF8E7] tracking-tight tabular-nums">
          ₱{totalPrice.toLocaleString()}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i + 1 <= currentStep
                ? 'w-5 bg-[#8FB8A8]'
                : 'w-1.5 bg-white/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
