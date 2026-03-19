// UX Roast: "No thanks, place my order" is fine but "Before you go..." badge
// is a classic guilt pattern. The decline CTA should feel empowering, not dismissive.
// Fixed: Softened decline text, ensured all touch targets hit 44px.
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { ShoppingBag, Tag, Star, X } from 'lucide-react';
import type { InterstitialOffer } from '@/types/upsell';

interface CheckoutInterstitialProps {
  offer: InterstitialOffer;
  onAccept: () => void;
  onDecline: () => void;
}

export default function CheckoutInterstitial({ offer, onAccept, onDecline }: CheckoutInterstitialProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(timer);
  }, []);

  // Focus trapping
  useEffect(() => {
    // Store the previously focused element to restore later
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (!panel) return;

    // Focus the panel after animation starts
    const focusTimer = setTimeout(() => {
      const firstFocusable = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDecline();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableEls = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableEls.length === 0) return;

      const firstEl = focusableEls[0];
      const lastEl = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to previous element
      previousFocusRef.current?.focus();
    };
  }, [onDecline]);

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
        <p className="font-nunito text-2xl font-bold text-[#3D8A80] mt-2">{'\u20B1'}{Number(price).toFixed(0)}</p>
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
          <span className="font-nunito text-2xl font-bold text-[#3D8A80]">{'\u20B1'}{discountedPrice.toFixed(0)}</span>
          <span className="font-nunito text-sm text-stone-400 line-through">{'\u20B1'}{Number(originalPrice).toFixed(0)}</span>
        </div>
      </>
    );
  };

  const renderLoyaltyNudge = () => {
    // Parse loyalty message for progress hints (e.g. "3 of 5 stamps")
    // Attempt to extract current/total from the message for the visual bar
    const message = offer.loyalty_message || '';
    const progressMatch = message.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
    const current = progressMatch ? parseInt(progressMatch[1], 10) : null;
    const total = progressMatch ? parseInt(progressMatch[2], 10) : null;
    const progressPercent = current !== null && total !== null && total > 0
      ? Math.min((current / total) * 100, 100)
      : null;

    return (
      <>
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Star className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="font-nunito font-bold text-lg text-stone-900">Almost there!</h3>
        <p className="font-nunito text-sm text-stone-600 mt-2">{offer.loyalty_message}</p>

        {/* Visual progress indicator */}
        {progressPercent !== null && current !== null && total !== null ? (
          <div className="mt-4 mx-auto max-w-[220px]">
            <div className="flex justify-between mb-1.5">
              <span className="font-nunito text-xs font-semibold text-amber-700">{current} of {total}</span>
              <span className="font-nunito text-xs text-stone-400">
                {total - current} more to go
              </span>
            </div>
            <div className="h-2.5 bg-amber-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* Stamp dots */}
            <div className="flex justify-between mt-2 px-0.5">
              {Array.from({ length: total }, (_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                    i < current
                      ? 'bg-amber-500'
                      : i === current
                        ? 'bg-amber-300 ring-2 ring-amber-200'
                        : 'bg-stone-200'
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="font-nunito text-xs text-stone-400 mt-1">Add one more item to earn your reward</p>
        )}
      </>
    );
  };

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    // Only dismiss if the click is directly on the backdrop button, not a bubble
    if (e.target === e.currentTarget) {
      onDecline();
    }
  }, [onDecline]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Special offer"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close offer"
        className="absolute inset-0 w-full h-full bg-black/50 cursor-default border-none p-0 transition-opacity duration-200"
        style={{ opacity: mounted ? 1 : 0 }}
        onClick={handleBackdropClick}
        tabIndex={-1}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-sm mx-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden transition-transform duration-300 ease-out"
        style={{
          transform: mounted
            ? 'translateY(0)'
            : 'translateY(100%)',
          opacity: mounted ? 1 : 0,
          transitionProperty: 'transform, opacity',
          transitionDuration: '300ms, 200ms',
          transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1), ease-out',
        }}
      >
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onDecline}
          className="absolute top-3 right-3 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-stone-100 rounded-full z-10 transition-colors"
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
              <p className="font-nunito text-2xl font-bold text-[#3D8A80] mt-2">{'\u20B1'}{offer.bundle.base_price.toFixed(0)}</p>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-6 pb-6 space-y-3">
          <button
            type="button"
            onClick={onAccept}
            className="w-full py-3.5 min-h-[48px] bg-[#3D8A80] text-white font-nunito font-bold text-base rounded-xl hover:bg-[#2E6E65] transition-all shadow-lg shadow-[#3D8A80]/20 interstitial-cta-pulse"
          >
            {offer.type === 'loyalty_nudge' ? 'Browse Menu' : 'Add to Order'}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="w-full min-h-[44px] py-2.5 font-nunito text-sm font-medium text-stone-500 bg-stone-50 hover:bg-stone-100 rounded-xl transition-colors"
          >
            Continue with my order
          </button>
        </div>

        {/* Inline styles for CTA pulse animation (no new dependencies) */}
        <style>{`
          @keyframes interstitial-cta-glow {
            0%, 100% { box-shadow: 0 10px 15px -3px rgba(61,138,128,0.2), 0 0 0 0 rgba(123,191,181,0); }
            50% { box-shadow: 0 10px 15px -3px rgba(61,138,128,0.2), 0 0 0 6px rgba(123,191,181,0.15); }
          }
          .interstitial-cta-pulse {
            animation: interstitial-cta-glow 2s ease-in-out 0.5s 3;
          }
        `}</style>
      </div>
    </div>
  );
}
