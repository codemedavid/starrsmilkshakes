// UX Roast: Two buttons that both do the same thing? "Continue to Checkout" AND "Skip"?
// That's not choice, that's confusion. Also, users have no idea this is step 2 of 3.
// Fixed: Merged the redundant buttons, added step dots, consistent with UpgradeScreen.
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Heart, Plus, ArrowRight } from 'lucide-react';
import type { MenuItem } from '@/types';
import type { Bundle } from '@/types/bundle';
import type { PairOffer } from '@/types/upsell';
import { itemNeedsCustomization } from '@/lib/upsell-helpers';

interface BestPairScreenProps {
  offers: PairOffer[];
  onAddItem: (itemId: string) => void;
  onNavigateToProduct: (itemId: string) => void;
  onSkip: () => void;
  asModal?: boolean;
}

function getImage(target: MenuItem | Bundle): string | undefined {
  if ('image_url' in target) return target.image_url ?? undefined;
  return target.image;
}

function getPrice(target: MenuItem | Bundle): number {
  if ('base_price' in target) return target.base_price;
  return target.basePrice;
}

export default function BestPairScreen({ offers, onAddItem, onNavigateToProduct, onSkip, asModal }: BestPairScreenProps) {
  const [mounted, setMounted] = useState(false);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Skip when offers are empty (initial or after becoming empty)
  useEffect(() => {
    if (offers.length === 0) onSkip();
  }, [offers.length, onSkip]);

  // Trigger entrance animations after mount
  useEffect(() => {
    if (offers.length > 0) {
      // Small delay so the initial render paints off-screen, then animate in
      const timer = setTimeout(() => setMounted(true), 50);
      return () => clearTimeout(timer);
    }
  }, [offers.length]);

  // Scroll fade indicators
  const updateScrollFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 8);
    setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Check on mount and after layout settles
    const timer = setTimeout(updateScrollFades, 100);
    el.addEventListener('scroll', updateScrollFades, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', updateScrollFades);
    };
  }, [updateScrollFades, offers.length]);

  if (offers.length === 0) return null;

  return (
    <div className={`${asModal ? '' : 'min-h-screen'} bg-gradient-to-b from-[#FAFAF8] to-white flex flex-col`}>
      {/* Step indicator — step 2 of 3 */}
      {!asModal && (
        <div className="flex items-center justify-center gap-2 pt-4 pb-1">
          <div className="w-2 h-2 rounded-full bg-[#3D8A80]" />
          <div className="w-2 h-2 rounded-full bg-[#3D8A80]" />
          <div className="w-2 h-2 rounded-full bg-stone-200" />
        </div>
      )}

      {/* Header */}
      <div
        className="text-center pt-4 pb-4 px-6 transition-all duration-300 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(-12px)',
        }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-pink-50 rounded-full mb-4">
          <Heart className="w-4 h-4 text-pink-500" aria-hidden="true" />
          <span className="font-nunito text-sm font-semibold text-pink-600">Perfect Pairing</span>
        </div>
        <h1 className="font-playfair text-2xl font-semibold text-stone-900">Complete your order</h1>
        <p className="font-nunito text-sm text-stone-500 mt-2">These go great with what you ordered</p>
      </div>

      {/* Horizontal scroll cards with edge fades */}
      <div className="flex-1 px-4 py-4 relative">
        {/* Left fade */}
        <div
          className="pointer-events-none absolute left-4 top-4 bottom-4 w-8 z-10 bg-gradient-to-r from-[#FAFAF8] to-transparent transition-opacity duration-200"
          style={{ opacity: showLeftFade ? 1 : 0 }}
          aria-hidden="true"
        />
        {/* Right fade */}
        <div
          className="pointer-events-none absolute right-4 top-4 bottom-4 w-8 z-10 bg-gradient-to-l from-white to-transparent transition-opacity duration-200"
          style={{ opacity: showRightFade ? 1 : 0 }}
          aria-hidden="true"
        />

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
        >
          {offers.slice(0, 4).map((offer, index) => {
            const target = offer.item || offer.bundle;
            if (!target) return null;

            const name = target.name;
            const image = getImage(target);
            const price = getPrice(target);
            const itemId = offer.rule.paired_item_id || offer.rule.paired_bundle_id;
            const isPressed = pressedId === offer.rule.id;

            return (
              <div
                key={offer.rule.id}
                className="flex-shrink-0 w-52 snap-center bg-white rounded-2xl border border-[#E8E3DA] overflow-hidden shadow-sm transition-all duration-300 ease-out"
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted
                    ? 'translateX(0)'
                    : 'translateX(40px)',
                  transitionDelay: mounted ? `${index * 80}ms` : '0ms',
                }}
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
                    <span className="font-nunito font-bold text-[#3D8A80]">{'\u20B1'}{price.toFixed(0)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!itemId) return;
                        const needsCustomization = offer.bundle
                          ? true
                          : offer.item
                            ? itemNeedsCustomization(offer.item)
                            : false;
                        if (needsCustomization) {
                          onNavigateToProduct(itemId);
                        } else {
                          onAddItem(itemId);
                        }
                      }}
                      onPointerDown={() => setPressedId(offer.rule.id)}
                      onPointerUp={() => setPressedId(null)}
                      onPointerLeave={() => setPressedId(null)}
                      disabled={!itemId}
                      aria-label={`Add ${name} to order`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[44px] min-w-[44px] justify-center bg-[#7BBFB5] text-white font-nunito font-semibold text-xs rounded-lg hover:bg-[#3D8A80] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                      style={{
                        transform: isPressed ? 'scale(0.92)' : 'scale(1)',
                        transition: 'transform 150ms ease, background-color 150ms ease',
                      }}
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

      {/* Single clear CTA — no more two-buttons-same-action confusion */}
      <div
        className="px-6 py-6 transition-all duration-300 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(16px)',
          transitionDelay: mounted ? '200ms' : '0ms',
        }}
      >
        <button
          type="button"
          onClick={onSkip}
          aria-label="Continue to checkout"
          className="w-full py-3.5 min-h-[48px] bg-[#3D8A80] text-white font-nunito font-bold text-base rounded-xl hover:bg-[#2E6E65] transition-colors shadow-lg shadow-[#3D8A80]/20 flex items-center justify-center gap-2"
        >
          {asModal ? 'No thanks' : 'Continue to Checkout'}
          {!asModal && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
