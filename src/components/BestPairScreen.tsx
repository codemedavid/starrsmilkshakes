'use client';

import { useEffect } from 'react';
import { Heart, Plus, ArrowRight } from 'lucide-react';
import type { MenuItem } from '@/types';
import type { Bundle } from '@/types/bundle';
import type { PairOffer } from '@/types/upsell';

interface BestPairScreenProps {
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

export default function BestPairScreen({ offers, onAddItem, onSkip }: BestPairScreenProps) {
  useEffect(() => {
    if (offers.length === 0) onSkip();
  }, [offers.length, onSkip]);

  if (offers.length === 0) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FAFAF8] to-white flex flex-col">
      {/* Header */}
      <div className="text-center pt-8 pb-4 px-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-pink-50 rounded-full mb-4">
          <Heart className="w-4 h-4 text-pink-500" aria-hidden="true" />
          <span className="font-nunito text-sm font-semibold text-pink-600">Perfect Pairing</span>
        </div>
        <h1 className="font-playfair text-2xl font-semibold text-stone-900">Complete your order</h1>
        <p className="font-nunito text-sm text-stone-500 mt-2">These go great with what you ordered</p>
      </div>

      {/* Horizontal scroll cards */}
      <div className="flex-1 px-4 py-4">
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
          {offers.slice(0, 4).map((offer) => {
            const target = offer.item || offer.bundle;
            if (!target) return null;

            const name = target.name;
            const image = getImage(target);
            const price = getPrice(target);
            const itemId = offer.rule.paired_item_id || offer.rule.paired_bundle_id;

            return (
              <div
                key={offer.rule.id}
                className="flex-shrink-0 w-52 snap-center bg-white rounded-2xl border border-[#E8E3DA] overflow-hidden shadow-sm"
              >
                {image && (
                  <div className="h-28 bg-[#F2EEE8] overflow-hidden">
                    <img src={image} alt={name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="p-3">
                  <h3 className="font-nunito font-bold text-sm text-stone-900 truncate">{name}</h3>
                  {offer.rule.message && (
                    <p className="font-nunito text-xs text-stone-400 mt-0.5 line-clamp-2">{offer.rule.message}</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <span className="font-nunito font-bold text-[#3D8A80]">₱{price.toFixed(0)}</span>
                    <button
                      type="button"
                      onClick={() => itemId && onAddItem(itemId)}
                      disabled={!itemId}
                      aria-label={`Add ${name} to order`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#7BBFB5] text-white font-nunito font-semibold text-xs rounded-lg hover:bg-[#3D8A80] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skip + Continue */}
      <div className="px-6 py-6 space-y-3">
        <button
          type="button"
          onClick={onSkip}
          className="w-full py-3 bg-[#7BBFB5] text-white font-nunito font-bold text-sm rounded-xl hover:bg-[#3D8A80] transition-colors flex items-center justify-center gap-2"
        >
          Continue to Checkout
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full font-nunito text-sm text-stone-500 hover:text-stone-700 transition-colors text-center"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
