'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Checkout from '@/components/Checkout';
import { useCartContext } from '@/contexts/CartContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import * as fpixel from '@/lib/fpixel';

const CheckoutPage = () => {
    const router = useRouter();
    const cart = useCartContext();
    const { siteSettings } = useSiteSettings();
    const hasTrackedCheckout = useRef(false);

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

    // Redirect to menu if cart is empty
    useEffect(() => {
        if (cart.cartItems.length === 0) {
            router.push('/');
        }
    }, [cart.cartItems.length, router]);

    const handleBack = () => {
        router.push('/?view=cart');
    };

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
                totalPrice={cart.getTotalPrice()}
                onBack={handleBack}
            />
        </div>
    );
};

export default CheckoutPage;
