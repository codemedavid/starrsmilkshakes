'use client';

import { Check } from 'lucide-react';
import type { MenuItem } from '@/types';

interface ItemCardProps {
  item: MenuItem;
  priceOverride: number | null;
  isSelected: boolean;
  onSelect: () => void;
}

export default function ItemCard({ item, priceOverride, isSelected, onSelect }: ItemCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex flex-col rounded-xl border-2 overflow-hidden transition-all duration-200 ${
        isSelected
          ? 'border-[#7BBFB5] bg-[#7BBFB5]/5 shadow-md'
          : 'border-transparent bg-white hover:shadow-sm'
      }`}
    >
      <div className="w-full aspect-square bg-stone-100 relative overflow-hidden">
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-3xl">🥤</div>
        )}
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#3D8A80] flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>
      <div className="p-3 text-left">
        <p className="font-nunito font-bold text-sm text-stone-900 line-clamp-2 leading-tight">
          {item.name}
        </p>
        {priceOverride !== null ? (
          <p className="text-xs text-stone-500 mt-1">+₱{priceOverride.toFixed(0)}</p>
        ) : (
          <p className="text-xs text-[#3D8A80] font-medium mt-1">Included</p>
        )}
      </div>
    </button>
  );
}
