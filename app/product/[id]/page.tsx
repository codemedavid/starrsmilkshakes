'use client';

import React, { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Minus, Plus, Share2, Star, ShoppingCart } from 'lucide-react';
import { useMenu } from '@/hooks/useMenu';
import { useCartContext } from '@/contexts/CartContext';
import { useUpsell } from '@/contexts/UpsellContext';
import { Variation, AddOn, MenuItem } from '@/types';
import type { UpsellCartItem } from '@/types/upsell';

interface ProductPageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function ProductPage({ params }: ProductPageProps) {
    const { id } = use(params);
    const router = useRouter();
    const { menuItems, loading } = useMenu();
    const cart = useCartContext();
    const { showPair } = useUpsell();
    const searchParams = useSearchParams();
    const fromPair = searchParams.get('source') === 'pair';
    const [product, setProduct] = useState<MenuItem | null>(null);

    // Customization State
    const [quantity, setQuantity] = useState(1);
    const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>(undefined);
    const [selectedAddOns, setSelectedAddOns] = useState<(AddOn & { quantity: number })[]>([]);

    // Find product when menuItems are loaded
    useEffect(() => {
        if (menuItems.length > 0) {
            const foundProduct = menuItems.find(item => item.id === id);
            if (foundProduct) {
                setProduct(foundProduct);
                // Reset state when product changes
                setQuantity(1);
                setSelectedAddOns([]);
                // Set default variation if available
                if (foundProduct.variations && foundProduct.variations.length > 0) {
                    setSelectedVariation(foundProduct.variations[0]);
                }
            }
        }
    }, [id, menuItems]);

    const handleBack = () => {
        router.back();
    };

    const calculatePrice = () => {
        if (!product) return 0;

        // Use effective price (discounted or regular) as base
        let price = product.effectivePrice || product.basePrice;

        // Add variation price
        if (selectedVariation) {
            price = (product.effectivePrice || product.basePrice) + selectedVariation.price;
        }

        // Add add-ons price
        selectedAddOns.forEach(addOn => {
            price += addOn.price * addOn.quantity;
        });

        return price;
    };

    const calculateTotalPrice = () => {
        return calculatePrice() * quantity;
    };

    const handleIncrement = () => {
        setQuantity(prev => prev + 1);
    };

    const handleDecrement = () => {
        if (quantity > 1) {
            setQuantity(prev => prev - 1);
        }
    };

    const updateAddOnQuantity = (addOn: AddOn, qty: number) => {
        setSelectedAddOns(prev => {
            const existingIndex = prev.findIndex(a => a.id === addOn.id);

            if (qty === 0) {
                // Remove add-on if quantity is 0
                return prev.filter(a => a.id !== addOn.id);
            }

            if (existingIndex >= 0) {
                // Update existing add-on quantity
                const updated = [...prev];
                updated[existingIndex] = { ...updated[existingIndex], quantity: qty };
                return updated;
            } else {
                // Add new add-on with quantity
                return [...prev, { ...addOn, quantity: qty }];
            }
        });
    };

    // Group add-ons by category
    const groupedAddOns = product?.addOns?.reduce((groups, addOn) => {
        const category = addOn.category;
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(addOn);
        return groups;
    }, {} as Record<string, AddOn[]>) || {};

    // Get Recommended Products (same category, excluding current)
    const recommendedProducts = menuItems
        .filter(item => item.id !== product?.id && item.category === product?.category && item.available)
        .slice(0, 4); // Limit to 4

    const [showToast, setShowToast] = useState(false);
    const [showShareToast, setShowShareToast] = useState(false);
    const [checkingPairs, setCheckingPairs] = useState(false);

    const handleShare = async () => {
        const shareUrl = window.location.href;
        const shareTitle = product?.name || 'Check out this product!';
        const shareText = product?.description || 'Check out this delicious shake from Starr\'s Famous Shakes!';

        // Check if Web Share API is available
        if (navigator.share) {
            try {
                await navigator.share({
                    title: shareTitle,
                    text: shareText,
                    url: shareUrl,
                });
            } catch (error) {
                // User cancelled or error occurred, silently ignore
                if ((error as Error).name !== 'AbortError') {
                    console.error('Error sharing:', error);
                }
            }
        } else {
            // Fallback: Copy to clipboard
            try {
                await navigator.clipboard.writeText(shareUrl);
                setShowShareToast(true);
                setTimeout(() => setShowShareToast(false), 3000);
            } catch (error) {
                console.error('Error copying to clipboard:', error);
                // Final fallback: Show alert with URL
                alert(`Share this link: ${shareUrl}`);
            }
        }
    };

    const handleAddToCart = async (buyNow = false) => {
        if (!product) return;

        const addOnsForCart: AddOn[] = selectedAddOns.flatMap(addOn =>
            Array(addOn.quantity).fill({ ...addOn, quantity: undefined })
        );

        cart.addToCart(product, quantity, selectedVariation, addOnsForCart);

        if (buyNow) {
            router.push('/checkout');
            return;
        }

        if (fromPair) {
            // Came from pair screen — go back to menu, no pair recursion
            router.push('/');
            return;
        }

        // Show pair suggestions for just the newly added item (not entire cart)
        setCheckingPairs(true);
        try {
            const newItem: UpsellCartItem = {
                menu_item_id: product.id,
                category: product.category,
                quantity: quantity,
                unit_price: calculatePrice(),
            };
            await showPair([newItem]);
        } catch {
            // Ignore pair errors
        }

        setCheckingPairs(false);
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-starrs-cream-light flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-starrs-teal"></div>
            </div>
        );
    }

    if (!product && !loading) {
        return (
            <div className="min-h-screen bg-starrs-cream-light flex flex-col items-center justify-center p-4">
                <h2 className="text-2xl font-bold text-starrs-teal-dark mb-4">Product Not Found</h2>
                <button
                    onClick={handleBack}
                    className="px-6 py-2 bg-starrs-teal text-white rounded-xl font-semibold"
                >
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-starrs-cream-light font-pretendard pb-32">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-starrs-teal/10 shadow-sm">
                <button
                    onClick={handleBack}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
                >
                    <ArrowLeft className="h-6 w-6 text-starrs-teal-dark" />
                </button>
                <div className="flex gap-2 items-center">
                    <button
                        onClick={() => router.push('/?view=cart')}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95 relative"
                    >
                        <ShoppingCart className="h-6 w-6 text-starrs-teal-dark" />
                        {cart.getTotalItems() > 0 && (
                            <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                {cart.getTotalItems()}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={handleShare}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
                    >
                        <Share2 className="h-5 w-5 text-starrs-teal-dark" />
                    </button>
                </div>
            </div>

            <div className="pt-20 px-4 md:max-w-2xl md:mx-auto">
                {/* Product Image - Rounded & Premium */}
                <div className="relative w-full aspect-square max-w-sm mx-auto mb-8">
                    {/* Decorative Background Blob */}
                    <div className="absolute inset-4 bg-gradient-to-tr from-starrs-teal/20 to-starrs-mint-light rounded-[2.5rem] rotate-3 blur-md scale-95"></div>

                    <div className="relative h-full w-full rounded-[2.5rem] overflow-hidden bg-white shadow-xl shadow-starrs-teal/5 flex items-center justify-center border border-white/50">
                        {product?.image ? (
                            <img
                                src={product.image}
                                alt={product.name}
                                className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-out"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full w-full bg-starrs-mint-light/30">
                                <span className="text-6xl animate-bounce-gentle">🥤</span>
                            </div>
                        )}

                        {/* Floating Badges */}
                        {(product?.popular || product?.isOnDiscount) && (
                            <div className="absolute top-4 left-4 flex flex-col gap-2">
                                {product.isOnDiscount && (
                                    <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md backdrop-blur-sm">SALE</span>
                                )}
                                {product.popular && (
                                    <span className="bg-starrs-teal text-white text-xs font-bold px-3 py-1 rounded-full shadow-md backdrop-blur-sm flex items-center gap-1">
                                        <Star className="w-3 h-3 fill-current" /> POPULAR
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Product Info */}
                <div className="mb-10 text-center md:text-left">
                    <h1 className="text-3xl md:text-4xl font-extrabold text-starrs-teal-dark mb-3 tracking-tight">
                        {product?.name}
                    </h1>
                    <p className="text-gray-600 leading-relaxed text-lg font-light">
                        {product?.description}
                    </p>
                </div>

                {/* Customization Options */}
                <div className="space-y-8 mb-12">

                    {/* Variations Section */}
                    {product?.variations && product.variations.length > 0 && (
                        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-starrs-teal-dark">Size / Variation</h3>
                                <span className="text-xs bg-starrs-teal-light text-starrs-teal-dark font-bold px-2 py-1 rounded-md uppercase tracking-wider">Required</span>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                {product.variations.map((variation) => (
                                    <label
                                        key={variation.id}
                                        className={`relative flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-all duration-300 ${selectedVariation?.id === variation.id
                                            ? 'border-starrs-teal bg-starrs-mint-light shadow-md scale-[1.01]'
                                            : 'border-transparent bg-white hover:bg-gray-50 hover:shadow-sm'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedVariation?.id === variation.id ? 'border-starrs-teal' : 'border-gray-300'}`}>
                                                {selectedVariation?.id === variation.id && <div className="w-2.5 h-2.5 rounded-full bg-starrs-teal" />}
                                            </div>
                                            <span className={`font-bold text-lg ${selectedVariation?.id === variation.id ? 'text-starrs-teal-dark' : 'text-gray-700'}`}>
                                                {variation.name}
                                            </span>
                                        </div>
                                        {variation.price > 0 && (
                                            <span className="text-sm font-medium text-starrs-teal-dark bg-starrs-teal/10 px-2 py-1 rounded-lg">
                                                +{variation.price.toFixed(2)}
                                            </span>
                                        )}
                                        <input
                                            type="radio"
                                            name="variation"
                                            className="hidden"
                                            checked={selectedVariation?.id === variation.id}
                                            onChange={() => setSelectedVariation(variation)}
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add-ons Section */}
                    {Object.entries(groupedAddOns).map(([category, addOns]) => (
                        <div key={category} className="bg-white/60 backdrop-blur-sm rounded-2xl p-5 border border-white/50 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-starrs-teal-dark capitalize">{category}</h3>
                                <span className="text-xs text-gray-400 font-medium">Optional</span>
                            </div>

                            <div className="space-y-3">
                                {addOns.map((addOn) => {
                                    const currentQty = selectedAddOns.find(a => a.id === addOn.id)?.quantity || 0;
                                    return (
                                        <div
                                            key={addOn.id}
                                            className={`flex items-center justify-between p-4 rounded-xl transition-all duration-200 border-2 ${currentQty > 0 ? 'border-starrs-teal/30 bg-starrs-mint-light/30' : 'border-transparent bg-white hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className="flex flex-col">
                                                <span className={`font-semibold ${currentQty > 0 ? 'text-starrs-teal-dark' : 'text-gray-700'}`}>{addOn.name}</span>
                                                <span className="text-sm text-gray-500">{addOn.price > 0 ? `+₱${addOn.price.toFixed(2)}` : 'Free'}</span>
                                            </div>

                                            {/* Control Logic */}
                                            {category.toLowerCase().includes('sweetness') || category.toLowerCase().includes('ice') ? (
                                                <button
                                                    onClick={() => {
                                                        if (category.toLowerCase().includes('sweetness')) {
                                                            // Exclusive select logic for strict categories if desired
                                                            const others = selectedAddOns.filter(a => a.category !== category);
                                                            setSelectedAddOns([...others, { ...addOn, quantity: 1 }]);
                                                        } else {
                                                            updateAddOnQuantity(addOn, currentQty > 0 ? 0 : 1);
                                                        }
                                                    }}
                                                    className={`px-5 py-2 rounded-xl text-sm font-bold transition-all transform active:scale-95 ${currentQty > 0
                                                        ? 'bg-starrs-teal text-white shadow-lg shadow-starrs-teal/20'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                        }`}
                                                >
                                                    {currentQty > 0 ? 'Selected' : 'Add'}
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-3 bg-white rounded-full p-1 shadow-sm border border-gray-100">
                                                    <button
                                                        onClick={() => updateAddOnQuantity(addOn, Math.max(0, currentQty - 1))}
                                                        disabled={currentQty === 0}
                                                        className={`p-2 rounded-full transition-colors ${currentQty === 0 ? 'text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                                                    >
                                                        <Minus className="h-4 w-4" />
                                                    </button>

                                                    <span className="font-bold w-6 text-center text-starrs-teal-dark">{currentQty}</span>

                                                    <button
                                                        onClick={() => updateAddOnQuantity(addOn, currentQty + 1)}
                                                        className="p-2 rounded-full bg-starrs-teal text-white hover:bg-starrs-teal-dark shadow-md active:scale-95 transition-transform"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Recommended Products */}
                {recommendedProducts.length > 0 && (
                    <div className="mb-8">
                        <h3 className="text-xl font-bold text-starrs-teal-dark mb-4">You might also like</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {recommendedProducts.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => router.push(`/product/${item.id}`)}
                                    className="bg-white rounded-2xl p-3 shadow-md border border-gray-100 cursor-pointer hover:shadow-lg transition-all active:scale-95"
                                >
                                    <div className="aspect-square rounded-xl overflow-hidden bg-starrs-mint-light/20 mb-3 relative">
                                        {item.image ? (
                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center w-full h-full text-2xl">🥤</div>
                                        )}
                                    </div>
                                    <h4 className="font-bold text-gray-800 text-sm line-clamp-1">{item.name}</h4>
                                    <p className="text-starrs-teal font-bold text-sm mt-1">
                                        ₱{(item.effectivePrice || item.basePrice).toFixed(2)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky Bottom Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-100 p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] z-50 md:max-w-2xl md:mx-auto md:rounded-t-3xl transition-transform duration-300 pb-8 md:pb-4">
                <div className="flex flex-col gap-4">
                    {/* Price & Quantity Row */}
                    <div className="flex items-end justify-between px-1">
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Total Amount</span>
                            <span className="text-3xl font-extrabold text-starrs-teal-dark leading-none">
                                ₱{calculateTotalPrice().toFixed(2)}
                            </span>
                        </div>

                        {/* Quantity Control Pill */}
                        <div className="flex items-center gap-4 bg-gray-100/80 px-4 py-2 rounded-2xl">
                            <button
                                onClick={handleDecrement}
                                disabled={quantity <= 1}
                                className={`p-1 transition-colors ${quantity > 1 ? 'text-gray-800 hover:text-starrs-teal' : 'text-gray-300'}`}
                            >
                                <Minus className="h-6 w-6" strokeWidth={2.5} />
                            </button>
                            <span className="font-extrabold text-xl min-w-[24px] text-center text-gray-900">{quantity}</span>
                            <button
                                onClick={handleIncrement}
                                className="p-1 text-gray-800 hover:text-starrs-teal transition-colors"
                            >
                                <Plus className="h-6 w-6" strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 h-14">
                        <button
                            onClick={() => handleAddToCart(true)}
                            disabled={checkingPairs}
                            className="flex-1 rounded-2xl border-2 border-starrs-teal text-starrs-teal font-extrabold text-lg hover:bg-starrs-teal hover:text-white transition-all duration-300 active:scale-95 disabled:opacity-50"
                        >
                            Buy Now
                        </button>
                        <button
                            onClick={() => handleAddToCart(false)}
                            disabled={checkingPairs}
                            className="flex-1 rounded-2xl bg-gradient-to-r from-starrs-teal to-starrs-teal-dark text-white font-extrabold text-lg shadow-lg shadow-starrs-teal/30 hover:shadow-starrs-teal/50 transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70"
                        >
                            {checkingPairs ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Adding...
                                </>
                            ) : (
                                <>
                                    <ShoppingCart className="w-5 h-5 fill-current" />
                                    Add to Cart
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Success Toast */}
            {showToast && (
                <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-slide-up">
                    <div className="bg-starrs-teal-dark text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2">
                        <div className="bg-white rounded-full p-1">
                            <svg className="w-3 h-3 text-starrs-teal-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                        <span className="font-semibold text-sm">Added to cart!</span>
                    </div>
                </div>
            )}

            {/* Share Toast */}
            {showShareToast && (
                <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-slide-up">
                    <div className="bg-starrs-teal-dark text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2">
                        <Share2 className="w-4 h-4" />
                        <span className="font-semibold text-sm">Link copied to clipboard!</span>
                    </div>
                </div>
            )}
        </div>
    );
}
