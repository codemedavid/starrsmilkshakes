'use client';

import { Check } from 'lucide-react';
import type { MenuItem, Variation, AddOn } from '@/types';

interface ItemCustomizerProps {
  item: MenuItem;
  selectedVariation: Variation | null;
  selectedAddOns: AddOn[];
  onVariation: (variation: Variation | null) => void;
  onToggleAddOn: (addOn: AddOn) => void;
}

export default function ItemCustomizer({
  item,
  selectedVariation,
  selectedAddOns,
  onVariation,
  onToggleAddOn,
}: ItemCustomizerProps) {
  const hasVariations = item.variations && item.variations.length > 0;
  const hasAddOns = item.addOns && item.addOns.length > 0;

  if (!hasVariations && !hasAddOns) return null;

  return (
    <div className="mt-3 space-y-4 px-1">
      {hasVariations && (
        <div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
            Size / Variation
          </p>
          <div className="flex gap-2 flex-wrap">
            {item.variations!.map(v => (
              <button
                key={v.id}
                onClick={() => onVariation(selectedVariation?.id === v.id ? null : v)}
                className={`px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-nunito font-medium border transition-all ${
                  selectedVariation?.id === v.id
                    ? 'border-[#7BBFB5] bg-[#7BBFB5]/10 text-[#3D8A80]'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                {v.name}
                {v.price > 0 && ` +₱${v.price}`}
              </button>
            ))}
          </div>
        </div>
      )}
      {hasAddOns && (
        <div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
            Add-ons
          </p>
          <div className="space-y-1.5">
            {item.addOns!.map(a => {
              const isAdded = selectedAddOns.some(sa => sa.id === a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => onToggleAddOn(a)}
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
  );
}
