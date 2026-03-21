'use client';

import { useEffect, useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import type { MenuItem } from '@/types';
import type { Bundle } from '@/types/bundle';
import type { PairOffer } from '@/types/upsell';

interface BundleUpsellPairProps {
  offers: PairOffer[];
  onAddItem: (itemId: string) => void;
  onSkip: () => void;
}

function getImage(target: MenuItem | Bundle): string | undefined {
  if ('image_url' in target) return target.image_url ?? undefined;
  return target.image;
}

function getPrice(target: MenuItem | Bundle): number {
  if ('base_price' in target) return target.base_price;
  return target.basePrice;
}

export default function BundleUpsellPair({ offers, onAddItem, onSkip }: BundleUpsellPairProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (offers.length === 0) { onSkip(); return; }
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, [offers.length, onSkip]);

  if (offers.length === 0) return null;

  return (
    <div className="px-4 pb-28">
      <div className="text-center pt-2 pb-6 transition-all duration-300"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(-12px)' }}>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-pink-50 rounded-full mb-4">
          <Heart className="w-4 h-4 text-pink-500" />
          <span className="font-nunito text-sm font-semibold text-pink-600">Perfect Pairing</span>
        </div>
        <h2 className="font-playfair text-xl font-semibold text-stone-900">Complete your order</h2>
        <p className="font-nunito text-sm text-stone-500 mt-1">These go great with what you ordered</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {offers.slice(0, 4).map((offer, index) => {
          const target = offer.item || offer.bundle;
          if (!target) return null;
          const name = target.name;
          const image = getImage(target);
          const price = getPrice(target);
          const itemId = offer.rule.paired_item_id || offer.rule.paired_bundle_id;
          return (
            <div key={offer.rule.id}
              className="bg-white rounded-xl border border-stone-100 overflow-hidden shadow-sm transition-all duration-300"
              style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)', transitionDelay: `${index * 80}ms` }}>
              {image && (
                <div className="aspect-square bg-stone-100 overflow-hidden">
                  <img src={image} alt={name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3">
                <h3 className="font-nunito font-bold text-sm text-stone-900 truncate">{name}</h3>
                {offer.rule.message && (
                  <p className="font-nunito text-xs text-stone-400 mt-0.5 line-clamp-2">{offer.rule.message}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="font-nunito font-bold text-[#3D8A80]">₱{price.toFixed(0)}</span>
                  <button onClick={() => itemId && onAddItem(itemId)} disabled={!itemId}
                    className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] bg-[#7BBFB5] text-white font-nunito font-semibold text-xs rounded-lg hover:bg-[#3D8A80] transition-colors disabled:opacity-50">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
