'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCartContext } from '@/contexts/CartContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import * as fpixel from '@/lib/fpixel';
import CheckoutAccordion from '@/components/checkout/CheckoutAccordion';
import UpgradeScreen from '@/components/UpgradeScreen';
import BestPairScreen from '@/components/BestPairScreen';
import CheckoutInterstitial from '@/components/CheckoutInterstitial';
import { getUpgradeOffers, getPairSuggestions } from '@/actions/upsell';
import type { UpsellOffer, PairOffer, InterstitialOffer } from '@/types/upsell';
import type { SlotSelection } from '@/types/bundle';

type UpsellStep = 'upgrade' | 'pair' | 'checkout' | 'interstitial' | 'placing';

export default function CheckoutPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const msession = searchParams.get('msession');
    const cart = useCartContext();
    const { siteSettings } = useSiteSettings();
    const hasTrackedCheckout = useRef(false);

    // Messenger session state
    const [messengerLoading, setMessengerLoading] = useState(!!msession);
    const [messengerError, setMessengerError] = useState<string | null>(null);

    // Upsell state (moved from old Checkout.tsx)
    const [upsellStep, setUpsellStep] = useState<UpsellStep>('upgrade');
    const [upgradeOffers, setUpgradeOffers] = useState<UpsellOffer[]>([]);
    const [pairOffers, setPairOffers] = useState<PairOffer[]>([]);
    const [interstitialOffer, setInterstitialOffer] = useState<InterstitialOffer | null>(null);

    // Interstitial declined = skip and place order directly
    const [skipInterstitial, setSkipInterstitial] = useState(false);

    // Load cart from Messenger session if msession param is present
    useEffect(() => {
        if (!msession) return;
        const loadMessengerSession = async () => {
            try {
                const res = await fetch(`/api/messenger/session/${msession}`);
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setMessengerError(data.error || 'Invalid or expired session link.');
                    return;
                }
                const data = await res.json();
                if (data.cart && Array.isArray(data.cart)) {
                    cart.loadFromMessengerSession(data.cart);
                }
            } catch {
                setMessengerError('Failed to load your session. Please try again.');
            } finally {
                setMessengerLoading(false);
            }
        };
        void loadMessengerSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [msession]);

    // Fetch upsell offers on mount
    useEffect(() => {
        if (cart.cartItems.length === 0) return;
        const fetchUpsellData = async () => {
            try {
                const cartItemsMapped = cart.cartItems.map(i => ({
                    menu_item_id: i.id,
                    category: i.category,
                    quantity: i.quantity,
                    unit_price: i.totalPrice / i.quantity,
                }));
                const [upgradeRes, pairRes] = await Promise.all([
                    getUpgradeOffers(cartItemsMapped),
                    getPairSuggestions(cartItemsMapped),
                ]);
                if (upgradeRes.success && upgradeRes.data?.length > 0) {
                    setUpgradeOffers(upgradeRes.data);
                    setUpsellStep('upgrade');
                } else if (pairRes.success && pairRes.data?.length > 0) {
                    setPairOffers(pairRes.data);
                    setUpsellStep('pair');
                } else {
                    setUpsellStep('checkout');
                }
                if (pairRes.success) setPairOffers(pairRes.data || []);
            } catch (err) {
                console.error('Failed to fetch upsell offers:', err);
                setUpsellStep('checkout'); // Skip upsells on error
            }
        };
        fetchUpsellData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Track InitiateCheckout on page load (only once)
    useEffect(() => {
        if (cart.cartItems.length > 0 && !hasTrackedCheckout.current) {
            hasTrackedCheckout.current = true;
            const currency = siteSettings?.currency_code || 'PHP';
            const contentIds = cart.cartItems.map(item => item.id);
            fpixel.trackInitiateCheckout(
                cart.getTotalPrice(),
                currency,
                cart.getTotalItems(),
                contentIds
            );
        }
    }, [cart, siteSettings?.currency_code]);

    // Redirect to menu if cart is empty (not during msession load)
    useEffect(() => {
        if (!msession && cart.cartItems.length === 0 && cart.bundleItems.length === 0) {
            router.push('/');
        }
    }, [cart.cartItems.length, cart.bundleItems.length, router, msession]);

    // Messenger loading state
    if (messengerLoading) {
        return (
            <div className="min-h-screen bg-starrs-linen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-starrs-sage mx-auto mb-4" />
                    <p className="text-starrs-muted">Loading your order from Messenger...</p>
                </div>
            </div>
        );
    }

    // Messenger error state
    if (messengerError) {
        return (
            <div className="min-h-screen bg-starrs-linen flex items-center justify-center">
                <div className="text-center max-w-sm mx-auto p-6">
                    <p className="text-red-600 font-semibold mb-4">{messengerError}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-2 bg-starrs-sage text-starrs-cream-brand rounded-xl"
                    >
                        Go to Menu
                    </button>
                </div>
            </div>
        );
    }

    // Empty cart redirect state
    if (cart.cartItems.length === 0 && cart.bundleItems.length === 0) {
        return (
            <div className="min-h-screen bg-starrs-linen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-starrs-sage mx-auto mb-4" />
                    <p className="text-starrs-muted">Redirecting to menu...</p>
                </div>
            </div>
        );
    }

    // Phase 1: Upgrade Screen
    if (upsellStep === 'upgrade') {
        return (
            <UpgradeScreen
                offers={upgradeOffers}
                onAcceptBundle={(_bundleId: string, _selections: SlotSelection[], _totalPrice: number) => {
                    setUpsellStep(pairOffers.length > 0 ? 'pair' : 'checkout');
                }}
                onAcceptItem={(_itemId: string) => {
                    setUpsellStep(pairOffers.length > 0 ? 'pair' : 'checkout');
                }}
                onSkip={() => setUpsellStep(pairOffers.length > 0 ? 'pair' : 'checkout')}
            />
        );
    }

    // Phase 3: Best Pair Screen
    if (upsellStep === 'pair') {
        return (
            <BestPairScreen
                offers={pairOffers}
                onAddItem={(_itemId: string) => {
                    setUpsellStep('checkout');
                }}
                onSkip={() => setUpsellStep('checkout')}
            />
        );
    }

    // Phase 2 (checkout): Accordion + interstitial overlay
    return (
        <>
            <CheckoutAccordion
                cartItems={cart.cartItems}
                bundleItems={cart.bundleItems}
                totalPrice={cart.getTotalPrice()}
                onBack={() => router.push('/cart')}
                msession={msession ?? undefined}
                onShowInterstitial={(offer) => {
                    setInterstitialOffer(offer);
                    setUpsellStep('interstitial');
                }}
                skipInterstitial={skipInterstitial}
            />

            {/* Phase 4: Interstitial overlay on top of checkout */}
            {upsellStep === 'interstitial' && interstitialOffer && (
                <CheckoutInterstitial
                    offer={interstitialOffer}
                    onAccept={() => {
                        setInterstitialOffer(null);
                        setUpsellStep('checkout');
                    }}
                    onDecline={() => {
                        setInterstitialOffer(null);
                        setUpsellStep('checkout');
                        // Set flag so ReviewStep skips interstitial check and places order
                        setSkipInterstitial(true);
                    }}
                />
            )}
        </>
    );
}
