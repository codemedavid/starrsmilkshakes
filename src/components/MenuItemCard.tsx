'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, X, ShoppingCart } from 'lucide-react';
import { MenuItem, Variation, AddOn } from '../types';
import { getAddonSuggestions } from '@/actions/upsell';
import { useUpsell } from '@/contexts/UpsellContext';
import type { AddonSuggestion, UpsellCartItem } from '@/types/upsell';

interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem, quantity?: number, variation?: Variation, addOns?: AddOn[]) => void;
  quantity: number;
  onUpdateQuantity: (id: string, quantity: number) => void;
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  onAddToCart,
  quantity,
  onUpdateQuantity
}) => {
  const router = useRouter();
  const { showUpgrade, showPair } = useUpsell();
  const [navigating, setNavigating] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>(
    item.variations?.[0]
  );
  const [selectedAddOns, setSelectedAddOns] = useState<(AddOn & { quantity: number })[]>([]);
  const [addonSuggestions, setAddonSuggestions] = useState<AddonSuggestion[]>([]);

  useEffect(() => {
    if (!showCustomization) return;

    let cancelled = false;
    getAddonSuggestions(item.id).then((result) => {
      if (!cancelled && result.success && Array.isArray(result.data)) {
        setAddonSuggestions(result.data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [showCustomization, item.id]);

  const calculatePrice = () => {
    // Use effective price (discounted or regular) as base
    let price = item.effectivePrice || item.basePrice;
    if (selectedVariation) {
      price = (item.effectivePrice || item.basePrice) + selectedVariation.price;
    }
    selectedAddOns.forEach(addOn => {
      price += addOn.price * addOn.quantity;
    });
    return price;
  };

  const handleAddToCart = () => {
    // Navigate to product detail page for customization & add-to-cart
    router.push(`/product/${item.id}`);
  };

  const handleCustomizedAddToCart = () => {
    // Convert selectedAddOns back to regular AddOn array for cart
    const addOnsForCart: AddOn[] = selectedAddOns.flatMap(addOn =>
      Array(addOn.quantity).fill({ ...addOn, quantity: undefined })
    );
    onAddToCart(item, 1, selectedVariation, addOnsForCart);
    setShowCustomization(false);
    setSelectedAddOns([]);
  };

  const handleIncrement = () => {
    onUpdateQuantity(item.id, quantity + 1);
  };

  const handleDecrement = () => {
    if (quantity > 0) {
      onUpdateQuantity(item.id, quantity - 1);
    }
  };

  const updateAddOnQuantity = (addOn: AddOn, quantity: number) => {
    setSelectedAddOns(prev => {
      const existingIndex = prev.findIndex(a => a.id === addOn.id);

      if (quantity === 0) {
        // Remove add-on if quantity is 0
        return prev.filter(a => a.id !== addOn.id);
      }

      if (existingIndex >= 0) {
        // Update existing add-on quantity
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], quantity };
        return updated;
      } else {
        // Add new add-on with quantity
        return [...prev, { ...addOn, quantity }];
      }
    });
  };

  const groupedAddOns = item.addOns?.reduce((groups, addOn) => {
    const category = addOn.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(addOn);
    return groups;
  }, {} as Record<string, AddOn[]>);

  // Calculate minimum price (for "from ₱" display)
  const getMinPrice = () => {
    if (item.isOnDiscount && item.discountPrice) {
      return item.discountPrice;
    }
    if (item.variations && item.variations.length > 0) {
      const minVariationPrice = Math.min(...item.variations.map(v => v.price));
      return (item.effectivePrice || item.basePrice) + minVariationPrice;
    }
    return item.effectivePrice || item.basePrice;
  };

  return (
    <>
      <div className={`flex flex-col ${!item.available ? 'opacity-60' : ''}`}>
        {/* Card Container - Square with Dark Green Background */}
        <div
          className={`relative aspect-square rounded-2xl overflow-hidden transition-all duration-200 ${!item.available ? 'cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'
            }`}
          style={{ backgroundColor: '#00704A' }}
          onClick={!item.available ? undefined : async () => {
            if (navigating) return;
            setNavigating(true);

            const result = await showUpgrade(item.id, item.category, item.effectivePrice || item.basePrice);

            if (result === 'accepted') {
              // Upgrade was accepted and added to cart by the overlay.
              // Show pair suggestions using the original item's category context,
              // then go back to menu.
              const upgradeItem: UpsellCartItem = {
                menu_item_id: item.id,
                category: item.category,
                quantity: 1,
                unit_price: item.effectivePrice || item.basePrice,
              };
              await showPair([upgradeItem]);
              setNavigating(false);
              router.push('/');
            } else {
              // No upgrade or skipped — go to product detail for customization
              router.push(`/product/${item.id}`);
              setNavigating(false);
            }
          }}
        >
          {/* Product Image - Cover Entire Card */}
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-300"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`absolute inset-0 flex items-center justify-center ${item.image ? 'hidden' : ''}`}>
            <div className="text-4xl md:text-6xl opacity-30 text-white">🥤</div>
          </div>

          {/* Badge - Top Left */}
          {(item.isOnDiscount || item.popular) && (
            <div className="absolute top-3 left-3 z-10">
              {item.isOnDiscount && item.discountPrice && (
                <span className="inline-block bg-orange-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded">
                  SALE
                </span>
              )}
              {item.popular && !item.isOnDiscount && (
                <span className="inline-block bg-orange-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded">
                  POPULAR
                </span>
              )}
            </div>
          )}

          {/* Circular Add Button - Bottom Right */}
          {item.available && (
            <div className="absolute bottom-3 right-3 z-10">
              {quantity === 0 ? (
                <button
                  id={`add-to-cart-${item.id}`}
                  data-fb-action="AddToCart"
                  data-fb-content-id={item.id}
                  data-fb-content-name={item.name}
                  data-fb-value={item.effectivePrice || item.basePrice}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToCart();
                  }}
                  className="w-12 h-12 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] flex items-center justify-center transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] active:scale-95 touch-manipulation"
                  aria-label="Add to cart"
                >
                  <Plus className="h-5 w-5 text-[#1E1E1E]" strokeWidth={2.5} />
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.15)] px-1 py-1 touch-manipulation">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDecrement();
                    }}
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors duration-200 active:scale-90"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4 text-[#1E1E1E]" strokeWidth={2.5} />
                  </button>
                  <span className="font-semibold text-[#1E1E1E] text-sm min-w-[20px] text-center">{quantity}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleIncrement();
                    }}
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors duration-200 active:scale-90"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4 text-[#1E1E1E]" strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product Info - Below Card */}
        <div className="mt-2 space-y-1">
          {/* Product Name */}
          <h4 className="text-[18px] font-semibold text-[#1E1E1E] leading-tight line-clamp-2" style={{ fontWeight: 600 }}>
            {item.name}
          </h4>

          {/* Price */}
          <p className="text-[16px] text-[#666666]" style={{ fontWeight: 400 }}>
            {item.variations && item.variations.length > 0 ? (
              <>from ₱{getMinPrice().toFixed(2)}</>
            ) : item.isOnDiscount && item.discountPrice ? (
              <>
                <span className="text-[#000000]">₱{item.discountPrice.toFixed(2)}</span>
                {item.basePrice !== item.discountPrice && (
                  <span className="text-[#666666] line-through ml-2">₱{item.basePrice.toFixed(2)}</span>
                )}
              </>
            ) : (
              <>from ₱{getMinPrice().toFixed(2)}</>
            )}
          </p>
        </div>
      </div>

      {/* Customization Modal */}
      {showCustomization && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-starrs-teal/20">
            <div className="sticky top-0 bg-gradient-to-r from-starrs-mint-light to-starrs-teal-light border-b border-starrs-teal/30 p-6 flex items-center justify-between rounded-t-2xl">
              <div>
                <h3 className="text-xl font-bold text-starrs-teal-dark">Customize {item.name}</h3>
                <p className="text-sm text-starrs-teal-dark/70 mt-1 font-medium">Choose your preferences</p>
              </div>
              <button
                onClick={() => setShowCustomization(false)}
                className="p-2 hover:bg-starrs-teal/20 rounded-full transition-colors duration-200"
              >
                <X className="h-5 w-5 text-starrs-teal-dark" />
              </button>
            </div>

            <div className="p-6">
              {/* Size Variations */}
              {item.variations && item.variations.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-starrs-teal-dark mb-4">Choose Flavor</h4>
                  <div className="space-y-3">
                    {item.variations.map((variation) => (
                      <label
                        key={variation.id}
                        className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${selectedVariation?.id === variation.id
                          ? 'border-starrs-teal bg-starrs-teal-light'
                          : 'border-starrs-teal/30 hover:border-starrs-teal hover:bg-starrs-mint-light'
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="radio"
                            name="variation"
                            checked={selectedVariation?.id === variation.id}
                            onChange={() => setSelectedVariation(variation)}
                            className="text-starrs-teal focus:ring-starrs-teal"
                          />
                          <span className="font-semibold text-starrs-teal-dark">{variation.name}</span>
                        </div>
                        <span className="text-starrs-teal-dark font-bold">
                          ₱{((item.effectivePrice || item.basePrice) + variation.price).toFixed(2)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Add-ons */}
              {groupedAddOns && Object.keys(groupedAddOns).length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-starrs-teal-dark mb-4">Add-ons</h4>

                  {/* Suggested add-ons */}
                  {addonSuggestions.length > 0 && (
                    <div className="mb-4">
                      <div className="space-y-3">
                        {addonSuggestions.map((suggestion) => {
                          const addOn = suggestion.add_on;
                          if (!addOn) return null;
                          const selected = selectedAddOns.find((a) => a.id === addOn.id);
                          return (
                            <div
                              key={suggestion.id}
                              className="flex items-center justify-between p-4 border-2 border-starrs-teal/40 rounded-xl bg-starrs-teal-light/40 hover:border-starrs-teal transition-all duration-200"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                  <span className="inline-block bg-starrs-teal text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                                    Recommended
                                  </span>
                                  <span className="font-semibold text-starrs-teal-dark">{addOn.name}</span>
                                </div>
                                <div className="text-sm text-starrs-teal-dark/70">
                                  {addOn.price > 0 ? `+₱${addOn.price.toFixed(2)}` : 'Free'}
                                </div>
                                {suggestion.suggestion_text && (
                                  <p className="text-xs text-gray-500 mt-1 italic">{suggestion.suggestion_text}</p>
                                )}
                              </div>

                              <div className="flex items-center space-x-2 ml-3">
                                {selected ? (
                                  <div className="flex items-center space-x-2 bg-starrs-teal-light rounded-xl p-1 border-2 border-starrs-teal/30">
                                    <button
                                      type="button"
                                      onClick={() => updateAddOnQuantity(addOn, (selected.quantity || 1) - 1)}
                                      className="p-1.5 hover:bg-starrs-teal/20 rounded-lg transition-colors duration-200"
                                    >
                                      <Minus className="h-3 w-3 text-starrs-teal-dark" />
                                    </button>
                                    <span className="font-semibold text-starrs-teal-dark min-w-[24px] text-center text-sm">
                                      {selected.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => updateAddOnQuantity(addOn, (selected.quantity || 0) + 1)}
                                      className="p-1.5 hover:bg-starrs-teal/20 rounded-lg transition-colors duration-200"
                                    >
                                      <Plus className="h-3 w-3 text-starrs-teal-dark" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => updateAddOnQuantity(addOn, 1)}
                                    className="flex items-center space-x-1 px-4 py-2 bg-gradient-to-r from-starrs-teal to-starrs-teal-dark text-white rounded-xl hover:from-starrs-teal-dark hover:to-starrs-teal-darker transition-all duration-200 text-sm font-semibold shadow-lg"
                                  >
                                    <Plus className="h-3 w-3" />
                                    <span>Add</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {Object.entries(groupedAddOns).map(([category, addOns]) => (
                    <div key={category} className="mb-4">
                      <h5 className="text-sm font-semibold text-starrs-teal-dark/80 mb-3 capitalize">
                        {category.replace('-', ' ')}
                      </h5>
                      <div className="space-y-3">
                        {addOns.map((addOn) => (
                          <div
                            key={addOn.id}
                            className="flex items-center justify-between p-4 border-2 border-starrs-teal/20 rounded-xl hover:border-starrs-teal hover:bg-starrs-mint-light transition-all duration-200"
                          >
                            <div className="flex-1">
                              <span className="font-semibold text-starrs-teal-dark">{addOn.name}</span>
                              <div className="text-sm text-starrs-teal-dark/70">
                                {addOn.price > 0 ? `₱${addOn.price.toFixed(2)} each` : 'Free'}
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              {selectedAddOns.find(a => a.id === addOn.id) ? (
                                <div className="flex items-center space-x-2 bg-starrs-teal-light rounded-xl p-1 border-2 border-starrs-teal/30">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const current = selectedAddOns.find(a => a.id === addOn.id);
                                      updateAddOnQuantity(addOn, (current?.quantity || 1) - 1);
                                    }}
                                    className="p-1.5 hover:bg-starrs-teal/20 rounded-lg transition-colors duration-200"
                                  >
                                    <Minus className="h-3 w-3 text-starrs-teal-dark" />
                                  </button>
                                  <span className="font-semibold text-starrs-teal-dark min-w-[24px] text-center text-sm">
                                    {selectedAddOns.find(a => a.id === addOn.id)?.quantity || 0}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const current = selectedAddOns.find(a => a.id === addOn.id);
                                      updateAddOnQuantity(addOn, (current?.quantity || 0) + 1);
                                    }}
                                    className="p-1.5 hover:bg-starrs-teal/20 rounded-lg transition-colors duration-200"
                                  >
                                    <Plus className="h-3 w-3 text-starrs-teal-dark" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => updateAddOnQuantity(addOn, 1)}
                                  className="flex items-center space-x-1 px-4 py-2 bg-gradient-to-r from-starrs-teal to-starrs-teal-dark text-white rounded-xl hover:from-starrs-teal-dark hover:to-starrs-teal-darker transition-all duration-200 text-sm font-semibold shadow-lg"
                                >
                                  <Plus className="h-3 w-3" />
                                  <span>Add</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Price Summary */}
              <div className="border-t-2 border-starrs-teal/20 pt-4 mb-6">
                <div className="flex items-center justify-between text-2xl font-bold text-starrs-teal-dark">
                  <span>Total:</span>
                  <span className="text-starrs-green">₱{calculatePrice().toFixed(2)}</span>
                </div>
              </div>

              <button
                id={`add-to-cart-customized-${item.id}`}
                data-fb-action="AddToCart"
                data-fb-content-id={item.id}
                data-fb-content-name={item.name}
                data-fb-value={calculatePrice()}
                onClick={handleCustomizedAddToCart}
                className="w-full bg-gradient-to-r from-starrs-teal to-starrs-teal-dark text-white py-4 rounded-xl hover:from-starrs-teal-dark hover:to-starrs-teal-darker transition-all duration-200 font-semibold flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <ShoppingCart className="h-5 w-5" />
                <span>Add to Cart - ₱{calculatePrice().toFixed(2)}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MenuItemCard;
