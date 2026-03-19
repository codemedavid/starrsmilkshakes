'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Checkout from '@/components/Checkout';
import { useCartContext } from '@/contexts/CartContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import * as fpixel from '@/lib/fpixel';

const CheckoutPage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const msession = searchParams.get('msession');
    const cart = useCartContext();
    const { siteSettings } = useSiteSettings();
    const hasTrackedCheckout = useRef(false);
    const [messengerLoading, setMessengerLoading] = useState(!!msession);
    const [messengerError, setMessengerError] = useState<string | null>(null);

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
                if (data.branchId) {
                    // branchId is available for use if needed
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

    // Redirect to menu if cart is empty — but not while waiting for msession to load
    useEffect(() => {
        if (!msession && cart.cartItems.length === 0) {
            router.push('/');
        }
    }, [cart.cartItems.length, router, msession]);

    const handleBack = () => {
        router.push('/?view=cart');
    };

    if (messengerLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-starrs-mint-light to-starrs-cream-light font-inter flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-starrs-teal mx-auto mb-4"></div>
                    <p className="text-starrs-teal-dark">Loading your order from Messenger...</p>
                </div>
            </div>
        );
    }

    if (messengerError) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-starrs-mint-light to-starrs-cream-light font-inter flex items-center justify-center">
                <div className="text-center max-w-sm mx-auto p-6">
                    <p className="text-red-600 font-semibold mb-4">{messengerError}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                        Go to Menu
                    </button>
                </div>
            </div>
        );
    }

    if (cart.cartItems.length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-starrs-mint-light to-starrs-cream-light font-inter flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-starrs-teal mx-auto mb-4"></div>
                    <p className="text-starrs-teal-dark">Redirecting to menu...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-starrs-mint-light to-starrs-cream-light font-inter">
            <Header
                cartItemsCount={cart.getTotalItems()}
                onCartClick={() => router.push('/?view=cart')}
                onMenuClick={() => router.push('/')}
            />
            <Checkout
                cartItems={cart.cartItems}
                bundleItems={cart.bundleItems}
                totalPrice={cart.getTotalPrice()}
                onBack={handleBack}
                msession={msession ?? undefined}
            />
        </div>
    );
};

export default CheckoutPage;
