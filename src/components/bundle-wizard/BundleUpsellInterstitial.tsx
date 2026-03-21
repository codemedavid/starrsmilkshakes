'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag, Tag, Star } from 'lucide-react';
import type { InterstitialOffer } from '@/types/upsell';

interface BundleUpsellInterstitialProps {
  offer: InterstitialOffer;
  onAccept: () => void;
  onDecline: () => void;
}

export default function BundleUpsellInterstitial({ offer, onAccept, onDecline }: BundleUpsellInterstitialProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const item = offer.item;
  const image = item ? ((item as any).image_url || (item as any).image) : null;
  const price = item ? ((item as any).base_price ?? (item as any).basePrice ?? 0) : 0;

  return (
    <div className="px-4 pb-28 flex flex-col items-center justify-center min-h-[60vh] transition-all duration-300"
      style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)' }}>
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 rounded-full mb-6">
          <ShoppingBag className="w-4 h-4 text-amber-600" />
          <span className="font-nunito text-sm font-semibold text-amber-700">Before you go...</span>
        </div>
        {(offer.type === 'item' || offer.type === 'discount') && item && (
          <>
            {image && (
              <div className="h-40 w-40 mx-auto rounded-2xl overflow-hidden mb-4 bg-stone-100">
                <img src={image} alt={item.name} className="w-full h-full object-cover" />
              </div>
            )}
            <h3 className="font-nunito font-bold text-lg text-stone-900">{item.name}</h3>
            {offer.type === 'discount' ? (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 rounded-full">
                  <Tag className="w-3 h-3 text-red-500" />
                  <span className="text-xs font-bold text-red-600">{offer.rule.offer_discount_percent}% OFF</span>
                </span>
                <span className="font-nunito text-xl font-bold text-[#3D8A80]">₱{(offer.discounted_price ?? price).toFixed(0)}</span>
                <span className="font-nunito text-sm text-stone-400 line-through">₱{Number(price).toFixed(0)}</span>
              </div>
            ) : (
              <p className="font-nunito text-xl font-bold text-[#3D8A80] mt-2">₱{Number(price).toFixed(0)}</p>
            )}
            {offer.rule.offer_message && (
              <p className="font-nunito text-sm text-stone-500 mt-2">{offer.rule.offer_message}</p>
            )}
          </>
        )}
        {offer.type === 'bundle' && offer.bundle && (
          <>
            <h3 className="font-nunito font-bold text-lg text-stone-900">{offer.bundle.name}</h3>
            <p className="font-nunito text-xl font-bold text-[#3D8A80] mt-2">₱{offer.bundle.base_price.toFixed(0)}</p>
          </>
        )}
        {offer.type === 'loyalty_nudge' && (
          <>
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Star className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="font-nunito font-bold text-lg text-stone-900">Almost there!</h3>
            <p className="font-nunito text-sm text-stone-600 mt-2">{offer.loyalty_message}</p>
          </>
        )}
        <div className="mt-8 space-y-3">
          <button onClick={onAccept}
            className="w-full py-3.5 min-h-[48px] bg-[#3D8A80] text-white font-nunito font-bold text-base rounded-xl hover:bg-[#2E6E65] transition-colors shadow-lg shadow-[#3D8A80]/20">
            {offer.type === 'loyalty_nudge' ? 'Browse Menu' : 'Add to Order'}
          </button>
          <button onClick={onDecline}
            className="w-full min-h-[44px] py-2.5 font-nunito text-sm font-medium text-stone-500 bg-stone-50 hover:bg-stone-100 rounded-xl transition-colors">
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
