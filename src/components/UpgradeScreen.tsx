// UX Roast: The skip button says "No thanks" in tiny underlined text like a passive-aggressive
// ex. And there's no way to tell where you are in the flow. Users feel lost and guilty.
// Fixed: Added step dots, made skip a proper button, softened the language.
'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { UpsellOffer } from '@/types/upsell';
import type { Bundle, SlotSelection } from '@/types/bundle';
import BundleCustomizer from './BundleCustomizer';

interface UpgradeScreenProps {
  offers: UpsellOffer[];
  onAcceptBundle: (bundleId: string, selections: SlotSelection[], totalPrice: number) => void;
  onAcceptItem: (itemId: string) => void;
  onSkip: () => void;
}

export default function UpgradeScreen({ offers, onAcceptBundle, onAcceptItem, onSkip }: UpgradeScreenProps) {
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);

  // Skip to next step when there are no offers — must be in useEffect,
  // never during the render phase (which would trigger a state update in the parent).
  useEffect(() => {
    if (offers.length === 0) onSkip();
  }, [offers.length, onSkip]);

  if (offers.length === 0) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FAFAF8] to-white flex flex-col">
      {/* Step indicator — lets users know where they are */}
      <div className="flex items-center justify-center gap-2 pt-4 pb-1">
        <div className="w-2 h-2 rounded-full bg-[#3D8A80]" />
        <div className="w-2 h-2 rounded-full bg-stone-200" />
        <div className="w-2 h-2 rounded-full bg-stone-200" />
      </div>

      {/* Header */}
      <div className="text-center pt-4 pb-4 px-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#7BBFB5]/10 rounded-full mb-4">
          <Sparkles className="w-4 h-4 text-[#7BBFB5]" aria-hidden="true" />
          <span className="font-nunito text-sm font-semibold text-[#3D8A80]">Upgrade Available</span>
        </div>
        <h1 className="font-playfair text-2xl font-semibold text-stone-900">Upgrade your order?</h1>
        <p className="font-nunito text-sm text-stone-500 mt-2">Save more with these combo deals</p>
      </div>

      {/* Offer Cards */}
      <div className="flex-1 px-6 py-4 space-y-4 max-w-lg mx-auto w-full">
        {offers.slice(0, 3).map((offer, index) => {
          const isBundle = offer.rule.offer_type === 'bundle' && offer.rule.offer_bundle != null;
          const isItem = offer.rule.offer_type === 'item' && offer.rule.offer_item != null;
          const target = isBundle ? offer.rule.offer_bundle : offer.rule.offer_item;
          if (!target) return null;

          const name = target.name;
          const image = (target as Bundle).image_url ?? (target as { image?: string }).image;
          const price = (target as Bundle).base_price ?? offer.display_price;

          return (
            <div
              key={offer.rule.id}
              className="bg-white rounded-2xl border border-[#E8E3DA] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
            >
              {image && (
                <div className="h-32 bg-[#F2EEE8] overflow-hidden">
                  <img src={image} alt={name} className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              <div className="p-4">
                <h3 className="font-nunito font-bold text-stone-900">{name}</h3>
                {offer.rule.offer_message && (
                  <p className="font-nunito text-sm text-stone-500 mt-1">{offer.rule.offer_message}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <span className="font-nunito font-bold text-lg text-[#3D8A80]">
                      ₱{Number(price).toFixed(0)}
                    </span>
                    {offer.savings != null && offer.savings > 0 && (
                      <span className="inline-flex items-center px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-nunito font-bold rounded-full ring-1 ring-emerald-200 animate-bounce-gentle">
                        Save ₱{offer.savings.toFixed(0)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isBundle && offer.rule.offer_bundle) {
                        setSelectedBundle(offer.rule.offer_bundle);
                      } else if (isItem && offer.rule.offer_item_id) {
                        onAcceptItem(offer.rule.offer_item_id);
                      }
                    }}
                    aria-label={`Upgrade to ${name}`}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] bg-[#7BBFB5] text-white font-nunito font-semibold text-sm rounded-xl hover:bg-[#3D8A80] active:scale-95 transition-all duration-150"
                  >
                    Upgrade
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Skip — proper button, no guilt trip. Easy to tap, easy to find. */}
      <div className="px-6 py-6 text-center">
        <button
          type="button"
          onClick={onSkip}
          aria-label="Skip upgrades and continue to checkout"
          className="min-h-[48px] w-full max-w-lg mx-auto px-6 py-3 font-nunito text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
        >
          Skip, continue to checkout
        </button>
      </div>

      {/* Bundle Customizer modal */}
      {selectedBundle && (
        <BundleCustomizer
          bundle={selectedBundle}
          onAddToCart={(selections, totalPrice) => {
            onAcceptBundle(selectedBundle.id, selections, totalPrice);
            setSelectedBundle(null);
          }}
          onClose={() => setSelectedBundle(null)}
        />
      )}
    </div>
  );
}
