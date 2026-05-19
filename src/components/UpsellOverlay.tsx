'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUpsell } from '@/contexts/UpsellContext';
import { useCartContext } from '@/contexts/CartContext';
import UpgradeScreen from './UpgradeScreen';
import BestPairScreen from './BestPairScreen';
import CheckoutInterstitial from './CheckoutInterstitial';
import type { MenuItem } from '@/types';
import type { SlotSelection } from '@/types/bundle';

export default function UpsellOverlay() {
  const { activeUpsell, resolveUpsell } = useUpsell();
  const cart = useCartContext();
  const router = useRouter();
  const [addedPairIds, setAddedPairIds] = useState<Set<string>>(new Set());

  // Reset addedPairIds when a new pair upsell is shown
  useEffect(() => {
    if (activeUpsell?.type === 'pair') {
      setAddedPairIds(new Set());
    }
  }, [activeUpsell?.type]);

  if (!activeUpsell) return null;

  // Loading state
  if (activeUpsell.loading) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 shadow-xl text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#3D8A80] mx-auto mb-3" />
          <p className="text-stone-400 text-sm font-nunito">Checking for deals...</p>
        </div>
      </div>
    );
  }

  // Upgrade modal
  if (activeUpsell.type === 'upgrade' && activeUpsell.upgradeOffers) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center">
        <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
          <UpgradeScreen
            offers={activeUpsell.upgradeOffers}
            onAcceptBundle={(bundleId: string, selections: SlotSelection[], totalPrice: number) => {
              const offer = activeUpsell.upgradeOffers!.find(
                (o) => o.rule.offer_bundle?.id === bundleId,
              );
              if (offer?.rule.offer_bundle) {
                cart.addBundleToCart(offer.rule.offer_bundle, selections, totalPrice);
              }
              resolveUpsell('accepted');
            }}
            onAcceptItem={(itemId: string) => {
              const offer = activeUpsell.upgradeOffers!.find(
                (o) => o.rule.offer_item_id === itemId,
              );
              if (offer?.rule.offer_item) {
                cart.addToCart(offer.rule.offer_item as MenuItem);
              }
              resolveUpsell('accepted');
            }}
            onSkip={() => resolveUpsell('skipped')}
          />
        </div>
      </div>
    );
  }

  // Pair modal
  if (activeUpsell.type === 'pair' && activeUpsell.pairOffers) {
    const filteredOffers = activeUpsell.pairOffers.filter(
      (o) => !addedPairIds.has(o.rule.id),
    );

    return (
      <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center">
        <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
          <BestPairScreen
            asModal
            offers={filteredOffers}
            onAddItem={(itemId: string) => {
              // Simple item — add to cart inline, stay on pair screen
              const offer = activeUpsell.pairOffers!.find(
                (o) => o.rule.paired_item_id === itemId || o.rule.paired_bundle_id === itemId,
              );
              if (offer?.item) {
                cart.addToCart(offer.item as MenuItem);
              }
              // Mark as added so it's filtered out on next render
              if (offer) {
                setAddedPairIds((prev) => new Set(prev).add(offer.rule.id));
              }
            }}
            onNavigateToProduct={(itemId: string) => {
              // Item/bundle needs customization — close pair screen, navigate
              const offer = activeUpsell.pairOffers!.find(
                (o) => o.rule.paired_item_id === itemId || o.rule.paired_bundle_id === itemId,
              );
              resolveUpsell('accepted');
              if (offer?.bundle) {
                router.push(`/bundle/${itemId}?source=pair`);
              } else {
                router.push(`/product/${itemId}?source=pair`);
              }
            }}
            onSkip={() => resolveUpsell('skipped')}
          />
        </div>
      </div>
    );
  }

  // Interstitial — already renders as a modal
  if (activeUpsell.type === 'interstitial' && activeUpsell.interstitialOffer) {
    return (
      <CheckoutInterstitial
        offer={activeUpsell.interstitialOffer}
        onAccept={() => {
          const offer = activeUpsell.interstitialOffer!;
          if (offer.type === 'loyalty_nudge') {
            resolveUpsell('accepted');
            return;
          }
          if (offer.item) {
            cart.addToCart(offer.item as MenuItem);
          } else if (offer.bundle) {
            cart.addBundleToCart(offer.bundle, [], offer.bundle.base_price);
          }
          resolveUpsell('accepted');
        }}
        onDecline={() => resolveUpsell('skipped')}
      />
    );
  }

  return null;
}
