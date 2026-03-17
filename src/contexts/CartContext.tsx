'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CartItem, MenuItem, Variation, AddOn } from '../types';
import * as fpixel from '../lib/fpixel';

interface CartContextType {
    cartItems: CartItem[];
    isCartOpen: boolean;
    addToCart: (item: MenuItem, quantity?: number, variation?: Variation, addOns?: AddOn[]) => void;
    updateQuantity: (id: string, quantity: number) => void;
    removeFromCart: (id: string) => void;
    clearCart: () => void;
    getTotalPrice: () => number;
    getTotalItems: () => number;
    openCart: () => void;
    closeCart: () => void;
    loadFromMessengerSession: (items: CartItem[]) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);

    const calculateItemPrice = useCallback((item: MenuItem, variation?: Variation, addOns?: AddOn[]) => {
        let price = item.basePrice;
        if (variation) {
            price += variation.price;
        }
        if (addOns) {
            addOns.forEach(addOn => {
                price += addOn.price;
            });
        }
        return price;
    }, []);

    const addToCart = useCallback((item: MenuItem, quantity: number = 1, variation?: Variation, addOns?: AddOn[]) => {
        const totalPrice = calculateItemPrice(item, variation, addOns);

        // Track AddToCart event for Meta Pixel
        fpixel.trackAddToCart(
            totalPrice * quantity,
            'PHP', // Default currency
            item.name,
            item.id
        );

        // Group add-ons by name and sum their quantities
        const groupedAddOns = addOns?.reduce((groups, addOn) => {
            const existing = groups.find(g => g.id === addOn.id);
            if (existing) {
                existing.quantity = (existing.quantity || 1) + 1;
            } else {
                groups.push({ ...addOn, quantity: 1 });
            }
            return groups;
        }, [] as (AddOn & { quantity: number })[]);

        setCartItems(prev => {
            const existingItem = prev.find(cartItem =>
                cartItem.id === item.id &&
                cartItem.selectedVariation?.id === variation?.id &&
                JSON.stringify(cartItem.selectedAddOns?.map(a => `${a.id}-${a.quantity || 1}`).sort()) === JSON.stringify(groupedAddOns?.map(a => `${a.id}-${a.quantity}`).sort())
            );

            if (existingItem) {
                return prev.map(cartItem =>
                    cartItem === existingItem
                        ? { ...cartItem, quantity: cartItem.quantity + quantity }
                        : cartItem
                );
            } else {
                const uniqueId = `${item.id}-${variation?.id || 'default'}-${addOns?.map(a => a.id).join(',') || 'none'}`;
                return [...prev, {
                    ...item,
                    id: uniqueId,
                    menuItemId: item.id, // Preserve original menu item ID
                    quantity,
                    selectedVariation: variation,
                    selectedAddOns: groupedAddOns || [],
                    totalPrice
                }];
            }
        });
    }, [calculateItemPrice]);

    const updateQuantity = useCallback((id: string, quantity: number) => {
        if (quantity <= 0) {
            setCartItems(prev => prev.filter(cartItem => cartItem.id !== id));
            return;
        }

        setCartItems(prev =>
            prev.map(item =>
                item.id === id ? { ...item, quantity } : item
            )
        );
    }, []);

    const removeFromCart = useCallback((id: string) => {
        setCartItems(prev => prev.filter(item => item.id !== id));
    }, []);

    const clearCart = useCallback(() => {
        setCartItems([]);
    }, []);

    const getTotalPrice = useCallback(() => {
        return cartItems.reduce((total, item) => total + (item.totalPrice * item.quantity), 0);
    }, [cartItems]);

    const getTotalItems = useCallback(() => {
        return cartItems.reduce((total, item) => total + item.quantity, 0);
    }, [cartItems]);

    const openCart = useCallback(() => setIsCartOpen(true), []);
    const closeCart = useCallback(() => setIsCartOpen(false), []);

    const loadFromMessengerSession = useCallback((items: CartItem[]) => {
        setCartItems(items.map((item) => ({
            ...item,
            totalPrice: (item.basePrice + (item.selectedVariation?.price || 0) + (item.selectedAddOns?.reduce((sum, a) => sum + a.price * (a.quantity || 1), 0) || 0)) * item.quantity,
        })));
    }, []);

    return (
        <CartContext.Provider value={{
            cartItems,
            isCartOpen,
            addToCart,
            updateQuantity,
            removeFromCart,
            clearCart,
            getTotalPrice,
            getTotalItems,
            openCart,
            closeCart,
            loadFromMessengerSession
        }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCartContext = (): CartContextType => {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCartContext must be used within a CartProvider');
    }
    return context;
};

export default CartContext;
