// src/components/checkout/CheckoutStickyBar.tsx
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
    <div className="fixed bottom-0 left-0 right-0 bg-starrs-deep px-5 py-3.5 flex justify-between items-center z-40">
      <div>
        <div className="text-xs text-starrs-sage-light">{itemCount} items</div>
        <div className="font-extrabold text-lg text-starrs-cream-brand">
          ₱{totalPrice.toLocaleString()}
        </div>
      </div>
      <div className="text-xs text-starrs-sage-light">
        Step {currentStep} of {totalSteps}
      </div>
    </div>
  );
}
