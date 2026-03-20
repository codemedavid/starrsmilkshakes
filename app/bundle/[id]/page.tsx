'use client';

import React, { use, useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Minus, Plus, Share2, ShoppingCart, Check, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useCartContext } from '@/contexts/CartContext';
import { supabase } from '@/lib/supabase';
import type { Bundle, BundleSlot, SlotSelection } from '@/types/bundle';
import type { MenuItem, Variation, AddOn } from '@/types';
import { calculateBundlePrice, validateBundleSelections, calculateBundleSavings, getBundleEffectivePrice } from '@/lib/bundle-engine';

interface BundlePageProps {
    params: Promise<{ id: string }>;
}

// Map raw Supabase menu_item row to the camelCase shape the bundle engine expects
function mapSlotMenuItem(raw: any): MenuItem {
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description ?? '',
        basePrice: Number(raw.base_price),
        category: raw.category,
        image: raw.image_url || undefined,
        popular: Boolean(raw.popular),
        available: raw.available ?? true,
        variations: raw.variations?.map((v: any) => ({
            id: v.id,
            name: v.name,
            price: Number(v.price),
        })) || [],
        addOns: raw.add_ons?.map((a: any) => ({
            id: a.id,
            name: a.name,
            price: Number(a.price),
            category: a.category,
        })) || [],
    };
}

interface SlotState {
    slot_id: string;
    selected_items: {
        menu_item_id: string;
        menu_item: MenuItem;
        selected_variation: Variation | null;
        selected_add_ons: AddOn[];
    }[];
}

export default function BundlePage({ params }: BundlePageProps) {
    const { id } = use(params);
    const router = useRouter();
    const searchParams = useSearchParams();
    const fromPair = searchParams.get('source') === 'pair';
    const cart = useCartContext();
    const [bundle, setBundle] = useState<Bundle | null>(null);
    const [loading, setLoading] = useState(true);
    const [quantity, setQuantity] = useState(1);
    const [slotStates, setSlotStates] = useState<SlotState[]>([]);
    const [expandedSlot, setExpandedSlot] = useState<string>('');
    const [showToast, setShowToast] = useState(false);
    const [showShareToast, setShowShareToast] = useState(false);

    // Fetch bundle data
    useEffect(() => {
        async function fetchBundle() {
            const { data } = await (supabase.from('bundles') as any)
                .select(`
                    *,
                    slots:bundle_slots (
                        *,
                        items:bundle_slot_items (
                            *,
                            menu_item:menu_items (
                                *,
                                variations (*),
                                add_ons (*)
                            )
                        )
                    )
                `)
                .eq('id', id)
                .single();

            if (data) {
                // Map nested menu_item rows to camelCase MenuItem
                const mapped = {
                    ...data,
                    slots: data.slots.map((slot: any) => ({
                        ...slot,
                        items: slot.items.map((si: any) => ({
                            ...si,
                            menu_item: si.menu_item ? mapSlotMenuItem(si.menu_item) : undefined,
                        })),
                    })),
                } as Bundle;

                setBundle(mapped);
                setSlotStates(mapped.slots.map(slot => ({ slot_id: slot.id, selected_items: [] })));
                setExpandedSlot(mapped.slots[0]?.id ?? '');
            }
            setLoading(false);
        }
        void fetchBundle();
    }, [id]);

    // Build selections for the engine
    const selections = useMemo<SlotSelection[]>(
        () => slotStates.map(s => ({
            slot_id: s.slot_id,
            selected_items: s.selected_items.map(i => ({
                menu_item_id: i.menu_item_id,
                selected_variation: i.selected_variation,
                selected_add_ons: i.selected_add_ons,
            })),
        })),
        [slotStates]
    );

    const priceInfo = useMemo(
        () => bundle ? calculateBundlePrice(bundle, selections, new Date()) : { effectivePrice: 0, addOnsTotal: 0, variationsExtra: 0, total: 0 },
        [bundle, selections]
    );

    const savingsInfo = useMemo(
        () => bundle ? calculateBundleSavings(bundle, selections, new Date()) : { individualTotal: 0, bundleTotal: 0, savings: 0, savingsPercent: 0 },
        [bundle, selections]
    );

    const validation = useMemo(
        () => bundle ? validateBundleSelections(bundle, selections) : { valid: false, errors: [] },
        [bundle, selections]
    );

    // Total completed slots
    const completedSlots = useMemo(() => {
        if (!bundle) return 0;
        return bundle.slots.filter(slot => {
            const state = slotStates.find(s => s.slot_id === slot.id);
            return state && state.selected_items.length >= slot.min_selections;
        }).length;
    }, [bundle, slotStates]);

    const handleSelectItem = (slotId: string, menuItem: MenuItem, slot: BundleSlot) => {
        setSlotStates(prev => prev.map(s => {
            if (s.slot_id !== slotId) return s;

            const alreadySelected = s.selected_items.find(i => i.menu_item_id === menuItem.id);
            if (alreadySelected) {
                return { ...s, selected_items: s.selected_items.filter(i => i.menu_item_id !== menuItem.id) };
            }

            if (slot.max_selections === 1) {
                return {
                    ...s,
                    selected_items: [{
                        menu_item_id: menuItem.id,
                        menu_item: menuItem,
                        selected_variation: null,
                        selected_add_ons: [],
                    }],
                };
            }

            if (s.selected_items.length < slot.max_selections) {
                return {
                    ...s,
                    selected_items: [
                        ...s.selected_items,
                        { menu_item_id: menuItem.id, menu_item: menuItem, selected_variation: null, selected_add_ons: [] },
                    ],
                };
            }

            return s;
        }));
    };

    const handleVariation = (slotId: string, menuItemId: string, variation: Variation | null) => {
        setSlotStates(prev => prev.map(s => {
            if (s.slot_id !== slotId) return s;
            return {
                ...s,
                selected_items: s.selected_items.map(i =>
                    i.menu_item_id === menuItemId ? { ...i, selected_variation: variation } : i
                ),
            };
        }));
    };

    const handleToggleAddOn = (slotId: string, menuItemId: string, addOn: AddOn) => {
        setSlotStates(prev => prev.map(s => {
            if (s.slot_id !== slotId) return s;
            return {
                ...s,
                selected_items: s.selected_items.map(i => {
                    if (i.menu_item_id !== menuItemId) return i;
                    const exists = i.selected_add_ons.find(a => a.id === addOn.id);
                    if (exists) {
                        return { ...i, selected_add_ons: i.selected_add_ons.filter(a => a.id !== addOn.id) };
                    }
                    return { ...i, selected_add_ons: [...i.selected_add_ons, addOn] };
                }),
            };
        }));
    };

    const handleBack = () => router.back();

    const handleShare = async () => {
        const shareUrl = window.location.href;
        const shareTitle = bundle?.name || 'Check out this combo!';
        const shareText = bundle?.description || 'Check out this combo from Starr\'s Famous Shakes!';

        if (navigator.share) {
            try {
                await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
            } catch (error) {
                if ((error as Error).name !== 'AbortError') {
                    console.error('Error sharing:', error);
                }
            }
        } else {
            try {
                await navigator.clipboard.writeText(shareUrl);
                setShowShareToast(true);
                setTimeout(() => setShowShareToast(false), 3000);
            } catch {
                alert(`Share this link: ${shareUrl}`);
            }
        }
    };

    const handleAddToCart = (buyNow = false) => {
        if (!bundle || !validation.valid) return;
        cart.addBundleToCart(bundle, selections, priceInfo.total);

        if (buyNow) {
            router.push('/checkout');
        } else if (fromPair) {
            // Came from pair screen — go back to menu, no pair recursion
            router.push('/');
        } else {
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
            // Reset for adding another
            setQuantity(1);
            setSlotStates(bundle.slots.map(slot => ({ slot_id: slot.id, selected_items: [] })));
            setExpandedSlot(bundle.slots[0]?.id ?? '');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-starrs-cream-light flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-starrs-teal"></div>
            </div>
        );
    }

    if (!bundle) {
        return (
            <div className="min-h-screen bg-starrs-cream-light flex flex-col items-center justify-center p-4">
                <h2 className="text-2xl font-bold text-starrs-teal-dark mb-4">Combo Not Found</h2>
                <button onClick={handleBack} className="px-6 py-2 bg-starrs-teal text-white rounded-xl font-semibold">
                    Go Back
                </button>
            </div>
        );
    }

    const effectivePrice = getBundleEffectivePrice(bundle, new Date());
    const isOnDiscount = bundle.discount_active && bundle.discount_price !== null && effectivePrice < bundle.base_price;

    return (
        <div className="min-h-screen bg-starrs-cream-light font-pretendard pb-32">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-starrs-teal/10 shadow-sm">
                <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95">
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
                    <button onClick={handleShare} className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95">
                        <Share2 className="h-5 w-5 text-starrs-teal-dark" />
                    </button>
                </div>
            </div>

            <div className="pt-20 px-4 md:max-w-2xl md:mx-auto">
                {/* Hero Image */}
                <div className="relative w-full aspect-square max-w-sm mx-auto mb-8">
                    <div className="absolute inset-4 bg-gradient-to-tr from-starrs-teal/20 to-starrs-mint-light rounded-[2.5rem] rotate-3 blur-md scale-95"></div>
                    <div className="relative h-full w-full rounded-[2.5rem] overflow-hidden bg-white shadow-xl shadow-starrs-teal/5 flex items-center justify-center border border-white/50">
                        {bundle.image_url ? (
                            <img
                                src={bundle.image_url}
                                alt={bundle.name}
                                className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-out"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full w-full bg-starrs-mint-light/30">
                                <span className="text-6xl animate-bounce-gentle">🎁</span>
                            </div>
                        )}

                        {/* Floating Badges */}
                        <div className="absolute top-4 left-4 flex flex-col gap-2">
                            <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md backdrop-blur-sm">COMBO</span>
                            {isOnDiscount && (
                                <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md backdrop-blur-sm">SALE</span>
                            )}
                            {bundle.popular && (
                                <span className="bg-starrs-teal text-white text-xs font-bold px-3 py-1 rounded-full shadow-md backdrop-blur-sm flex items-center gap-1">
                                    POPULAR
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Bundle Info */}
                <div className="mb-6 text-center md:text-left">
                    <h1 className="text-3xl md:text-4xl font-extrabold text-starrs-teal-dark mb-3 tracking-tight">
                        {bundle.name}
                    </h1>
                    {bundle.description && (
                        <p className="text-gray-600 leading-relaxed text-lg font-light">
                            {bundle.description}
                        </p>
                    )}
                    <div className="mt-3 flex items-center justify-center md:justify-start gap-3">
                        <span className="text-2xl font-extrabold text-starrs-teal-dark">
                            ₱{effectivePrice.toFixed(2)}
                        </span>
                        {isOnDiscount && (
                            <span className="text-lg text-gray-400 line-through">₱{bundle.base_price.toFixed(2)}</span>
                        )}
                        {savingsInfo.savings > 0 && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-starrs-teal/10 text-starrs-teal text-sm font-bold">
                                Save ₱{savingsInfo.savings.toFixed(0)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Progress indicator */}
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/50 shadow-sm mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-starrs-teal-dark">Build Your Combo</h3>
                        <span className="text-xs font-semibold text-starrs-teal bg-starrs-teal/10 px-2 py-1 rounded-lg">
                            {completedSlots} of {bundle.slots.length} done
                        </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-starrs-teal to-starrs-teal-dark transition-all duration-500"
                            style={{ width: `${bundle.slots.length > 0 ? (completedSlots / bundle.slots.length) * 100 : 0}%` }}
                        />
                    </div>
                </div>

                {/* Slot Sections */}
                <div className="space-y-6 mb-12">
                    {[...bundle.slots].sort((a, b) => a.sort_order - b.sort_order).map((slot, slotIndex) => {
                        const state = slotStates.find(s => s.slot_id === slot.id)!;
                        if (!state) return null;
                        const isExpanded = expandedSlot === slot.id;
                        const selCount = state.selected_items.length;
                        const isDone = selCount >= slot.min_selections;

                        return (
                            <div key={slot.id} className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-sm overflow-hidden">
                                {/* Slot Header */}
                                <button
                                    onClick={() => setExpandedSlot(isExpanded ? '' : slot.id)}
                                    className="w-full flex items-center justify-between p-5 hover:bg-white/40 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                                            isDone
                                                ? 'bg-starrs-teal text-white'
                                                : 'bg-gray-200 text-gray-500'
                                        }`}>
                                            {isDone ? (
                                                <Check className="w-4 h-4" />
                                            ) : (
                                                <span className="text-sm font-bold">{slotIndex + 1}</span>
                                            )}
                                        </div>
                                        <div className="text-left">
                                            <h3 className="text-lg font-bold text-starrs-teal-dark">{slot.label}</h3>
                                            <p className="text-xs text-gray-500">
                                                {selCount === 0
                                                    ? `Choose ${slot.min_selections === slot.max_selections ? slot.min_selections : `${slot.min_selections}-${slot.max_selections}`}`
                                                    : `${selCount} of ${slot.max_selections} selected`
                                                }
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {slot.min_selections > 0 && !isDone && (
                                            <span className="text-xs bg-starrs-teal-light text-starrs-teal-dark font-bold px-2 py-1 rounded-md uppercase tracking-wider">Required</span>
                                        )}
                                        {isExpanded
                                            ? <ChevronUp className="w-5 h-5 text-gray-400" />
                                            : <ChevronDown className="w-5 h-5 text-gray-400" />
                                        }
                                    </div>
                                </button>

                                {/* Progress bar */}
                                <div className="px-5">
                                    <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${isDone ? 'bg-starrs-teal' : 'bg-starrs-teal/50'}`}
                                            style={{ width: `${Math.min((selCount / slot.max_selections) * 100, 100)}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Slot Items */}
                                {isExpanded && (
                                    <div className="p-5 pt-4 space-y-3">
                                        {[...slot.items].sort((a, b) => a.sort_order - b.sort_order).map(slotItem => {
                                            const mi = slotItem.menu_item;
                                            if (!mi) return null;
                                            const isSelected = state.selected_items.some(i => i.menu_item_id === mi.id);
                                            const selectedState = state.selected_items.find(i => i.menu_item_id === mi.id);

                                            return (
                                                <div key={slotItem.id}>
                                                    {/* Item Selection Card */}
                                                    <button
                                                        onClick={() => handleSelectItem(slot.id, mi, slot)}
                                                        className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 ${
                                                            isSelected
                                                                ? 'border-starrs-teal bg-starrs-mint-light shadow-md scale-[1.01]'
                                                                : 'border-transparent bg-white hover:bg-gray-50 hover:shadow-sm'
                                                        }`}
                                                    >
                                                        {/* Item image */}
                                                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                                                            {mi.image ? (
                                                                <img src={mi.image} alt={mi.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="flex items-center justify-center w-full h-full text-2xl">🥤</div>
                                                            )}
                                                        </div>

                                                        <div className="flex-1 text-left min-w-0">
                                                            <p className={`font-bold text-base ${isSelected ? 'text-starrs-teal-dark' : 'text-gray-800'}`}>
                                                                {mi.name}
                                                            </p>
                                                            {slotItem.price_override !== null ? (
                                                                <p className="text-sm text-gray-500 mt-0.5">₱{slotItem.price_override.toFixed(0)}</p>
                                                            ) : (
                                                                <p className="text-sm text-starrs-teal font-medium mt-0.5">Included</p>
                                                            )}
                                                        </div>

                                                        {/* Selection indicator */}
                                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                                            isSelected ? 'border-starrs-teal bg-starrs-teal' : 'border-gray-300'
                                                        }`}>
                                                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                                        </div>
                                                    </button>

                                                    {/* Variations & Add-ons for selected item */}
                                                    {isSelected && selectedState && (
                                                        <div className="ml-4 mt-3 space-y-4 pl-4 border-l-2 border-starrs-teal/20">
                                                            {/* Variations */}
                                                            {mi.variations && mi.variations.length > 0 && (
                                                                <div>
                                                                    <p className="text-xs font-bold text-starrs-teal-dark uppercase tracking-wider mb-2">Size / Variation</p>
                                                                    <div className="grid grid-cols-1 gap-2">
                                                                        {mi.variations.map(v => (
                                                                            <label
                                                                                key={v.id}
                                                                                className={`relative flex items-center justify-between p-3 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                                                                                    selectedState.selected_variation?.id === v.id
                                                                                        ? 'border-starrs-teal bg-starrs-mint-light shadow-sm'
                                                                                        : 'border-transparent bg-white hover:bg-gray-50'
                                                                                }`}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleVariation(
                                                                                        slot.id,
                                                                                        mi.id,
                                                                                        selectedState.selected_variation?.id === v.id ? null : v
                                                                                    );
                                                                                }}
                                                                            >
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                                                        selectedState.selected_variation?.id === v.id ? 'border-starrs-teal' : 'border-gray-300'
                                                                                    }`}>
                                                                                        {selectedState.selected_variation?.id === v.id && (
                                                                                            <div className="w-2 h-2 rounded-full bg-starrs-teal" />
                                                                                        )}
                                                                                    </div>
                                                                                    <span className={`font-semibold ${
                                                                                        selectedState.selected_variation?.id === v.id ? 'text-starrs-teal-dark' : 'text-gray-700'
                                                                                    }`}>
                                                                                        {v.name}
                                                                                    </span>
                                                                                </div>
                                                                                {v.price > 0 && (
                                                                                    <span className="text-sm font-medium text-starrs-teal-dark bg-starrs-teal/10 px-2 py-0.5 rounded-lg">
                                                                                        +₱{v.price}
                                                                                    </span>
                                                                                )}
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Add-ons */}
                                                            {mi.addOns && mi.addOns.length > 0 && (
                                                                <div>
                                                                    <p className="text-xs font-bold text-starrs-teal-dark uppercase tracking-wider mb-2">Add-ons</p>
                                                                    <div className="space-y-2">
                                                                        {mi.addOns.map(a => {
                                                                            const isAdded = selectedState.selected_add_ons.some(sa => sa.id === a.id);
                                                                            return (
                                                                                <button
                                                                                    key={a.id}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleToggleAddOn(slot.id, mi.id, a);
                                                                                    }}
                                                                                    className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all duration-200 ${
                                                                                        isAdded
                                                                                            ? 'border-starrs-teal/30 bg-starrs-mint-light/30'
                                                                                            : 'border-transparent bg-white hover:bg-gray-50'
                                                                                    }`}
                                                                                >
                                                                                    <span className={`flex items-center gap-2 font-semibold ${isAdded ? 'text-starrs-teal-dark' : 'text-gray-700'}`}>
                                                                                        {isAdded && <Check className="w-3.5 h-3.5 text-starrs-teal" />}
                                                                                        {a.name}
                                                                                    </span>
                                                                                    <span className="text-sm text-gray-500">+₱{a.price}</span>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Validation errors */}
                {!validation.valid && validation.errors.length > 0 && (
                    <div className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-700 font-medium">
                            {validation.errors[0]}
                        </p>
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
                                ₱{(priceInfo.total * quantity).toFixed(2)}
                            </span>
                            {savingsInfo.savings > 0 && (
                                <span className="text-xs text-starrs-teal font-semibold mt-1">
                                    You save ₱{savingsInfo.savings.toFixed(0)} ({savingsInfo.savingsPercent.toFixed(0)}% off)
                                </span>
                            )}
                        </div>

                        {/* Quantity Control */}
                        <div className="flex items-center gap-4 bg-gray-100/80 px-4 py-2 rounded-2xl">
                            <button
                                onClick={() => quantity > 1 && setQuantity(q => q - 1)}
                                disabled={quantity <= 1}
                                className={`p-1 transition-colors ${quantity > 1 ? 'text-gray-800 hover:text-starrs-teal' : 'text-gray-300'}`}
                            >
                                <Minus className="h-6 w-6" strokeWidth={2.5} />
                            </button>
                            <span className="font-extrabold text-xl min-w-[24px] text-center text-gray-900">{quantity}</span>
                            <button
                                onClick={() => setQuantity(q => q + 1)}
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
                            disabled={!validation.valid}
                            className="flex-1 rounded-2xl border-2 border-starrs-teal text-starrs-teal font-extrabold text-lg hover:bg-starrs-teal hover:text-white transition-all duration-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Buy Now
                        </button>
                        <button
                            onClick={() => handleAddToCart(false)}
                            disabled={!validation.valid}
                            className="flex-1 rounded-2xl bg-gradient-to-r from-starrs-teal to-starrs-teal-dark text-white font-extrabold text-lg shadow-lg shadow-starrs-teal/30 hover:shadow-starrs-teal/50 transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ShoppingCart className="w-5 h-5 fill-current" />
                            Add to Cart
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
                        <span className="font-semibold text-sm">Combo added to cart!</span>
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
