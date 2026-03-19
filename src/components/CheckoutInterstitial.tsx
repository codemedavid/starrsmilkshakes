'use client';

import { ShoppingBag, Tag, Star, X } from 'lucide-react';
import type { InterstitialOffer } from '@/types/upsell';

interface CheckoutInterstitialProps {
  offer: InterstitialOffer;
  onAccept: () => void;
  onDecline: () => void;
}

export default function CheckoutInterstitial({ offer, onAccept, onDecline }: CheckoutInterstitialProps) {
  const renderItemOffer = () => {
    const item = offer.item;
    if (!item) return null;
    const image = (item as any).image_url || (item as any).image;
    const price = (item as any).base_price ?? (item as any).basePrice ?? 0;

    return (
      <>
        {image && (
          <div className="h-32 rounded-xl overflow-hidden mb-4 bg-[#F2EEE8]">
            <img src={image} alt={item.name} className="w-full h-full object-cover" />
          </div>
        )}
        <h3 className="font-nunito font-bold text-lg text-stone-900">{item.name}</h3>
        <p className="font-nunito text-2xl font-bold text-[#3D8A80] mt-2">₱{Number(price).toFixed(0)}</p>
        {offer.rule.offer_message && (
          <p className="font-nunito text-sm text-stone-500 mt-1">{offer.rule.offer_message}</p>
        )}
      </>
    );
  };

  const renderDiscountOffer = () => {
    const item = offer.item;
    if (!item) return null;
    const image = (item as any).image_url || (item as any).image;
    const originalPrice = (item as any).base_price ?? (item as any).basePrice ?? 0;
    const discountedPrice = offer.discounted_price ?? originalPrice;

    return (
      <>
        {image && (
          <div className="h-32 rounded-xl overflow-hidden mb-4 bg-[#F2EEE8]">
            <img src={image} alt={item.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 rounded-full mb-3">
          <Tag className="w-3.5 h-3.5 text-red-500" />
          <span className="font-nunito text-xs font-bold text-red-600">{offer.rule.offer_discount_percent}% OFF</span>
        </div>
        <h3 className="font-nunito font-bold text-lg text-stone-900">{item.name}</h3>
        <div className="flex items-center gap-2 mt-2">
          <span className="font-nunito text-2xl font-bold text-[#3D8A80]">₱{discountedPrice.toFixed(0)}</span>
          <span className="font-nunito text-sm text-stone-400 line-through">₱{Number(originalPrice).toFixed(0)}</span>
        </div>
      </>
    );
  };

  const renderLoyaltyNudge = () => (
    <>
      <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <Star className="w-8 h-8 text-amber-500" />
      </div>
      <h3 className="font-nunito font-bold text-lg text-stone-900">Almost there!</h3>
      <p className="font-nunito text-sm text-stone-600 mt-2">{offer.loyalty_message}</p>
      <p className="font-nunito text-xs text-stone-400 mt-1">Add one more item to earn your reward</p>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
          type="button"
          aria-label="Close offer"
          className="absolute inset-0 w-full bg-black/50 cursor-default"
          onClick={onDecline}
        />
      <div className="relative w-full max-w-sm mx-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onDecline}
          className="absolute top-3 right-3 p-2 hover:bg-stone-100 rounded-full z-10"
        >
          <X className="w-5 h-5 text-stone-400" aria-hidden="true" />
        </button>

        <div className="p-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 rounded-full mb-4">
            <ShoppingBag className="w-4 h-4 text-amber-600" />
            <span className="font-nunito text-sm font-semibold text-amber-700">Before you go...</span>
          </div>

          {/* Offer content by type */}
          {offer.type === 'item' && renderItemOffer()}
          {offer.type === 'discount' && renderDiscountOffer()}
          {offer.type === 'loyalty_nudge' && renderLoyaltyNudge()}
          {offer.type === 'bundle' && offer.bundle && (
            <>
              <h3 className="font-nunito font-bold text-lg text-stone-900">{offer.bundle.name}</h3>
              <p className="font-nunito text-2xl font-bold text-[#3D8A80] mt-2">₱{offer.bundle.base_price.toFixed(0)}</p>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-6 pb-6 space-y-3">
          <button
            type="button"
            onClick={onAccept}
            className="w-full py-3 bg-[#7BBFB5] text-white font-nunito font-bold text-sm rounded-xl hover:bg-[#3D8A80] transition-colors"
          >
            {offer.type === 'loyalty_nudge' ? 'Browse Menu' : 'Add to Order'}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="w-full py-2.5 font-nunito text-sm text-stone-500 hover:text-stone-700 transition-colors"
          >
            No thanks, place my order
          </button>
        </div>
      </div>
    </div>
  );
}
