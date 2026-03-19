'use client';

import { useState } from 'react';
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

  if (offers.length === 0) {
    onSkip();
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FAFAF8] to-white flex flex-col">
      {/* Header */}
      <div className="text-center pt-8 pb-4 px-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#7BBFB5]/10 rounded-full mb-4">
          <Sparkles className="w-4 h-4 text-[#7BBFB5]" />
          <span className="font-nunito text-sm font-semibold text-[#3D8A80]">Upgrade Available</span>
        </div>
        <h1 className="font-playfair text-2xl font-semibold text-stone-900">Upgrade your order?</h1>
        <p className="font-nunito text-sm text-stone-500 mt-2">Save more with these combo deals</p>
      </div>

      {/* Offer Cards */}
      <div className="flex-1 px-6 py-4 space-y-4 max-w-lg mx-auto w-full">
        {offers.slice(0, 3).map((offer) => {
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
              className="bg-white rounded-2xl border border-[#E8E3DA] overflow-hidden shadow-sm hover:shadow-md transition-shadow"
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
                      <span className="inline-flex px-2 py-0.5 bg-green-50 text-green-700 text-xs font-nunito font-semibold rounded-full">
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
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#7BBFB5] text-white font-nunito font-semibold text-sm rounded-xl hover:bg-[#3D8A80] transition-colors"
                  >
                    Upgrade
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Skip button */}
      <div className="px-6 py-6 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="font-nunito text-sm text-stone-500 hover:text-stone-700 underline underline-offset-2 transition-colors"
        >
          No thanks, continue to checkout
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
