// src/components/checkout/ReviewStep.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { CartItem, Branch, ServiceType } from '@/types';
import { BundleCartItem } from '@/types/bundle';
import { useOrders } from '@/hooks/useOrders';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import * as fpixel from '@/lib/fpixel';
import { sendPurchaseEvent } from '@/lib/meta-conversions';
import { getInterstitialOffers } from '@/actions/upsell';
import type { InterstitialOffer } from '@/types/upsell';

interface ReviewStepProps {
  cartItems: CartItem[];
  bundleItems: BundleCartItem[];
  branch: Branch | null;
  serviceType: ServiceType;
  customerName: string;
  contactNumber: string;
  address: string;
  landmark: string;
  pickupTime: string;
  customTime: string;
  notes: string;
  paymentMethodId: string | null;
  referenceNumber: string;
  deliveryFee: number | null;
  deliveryCoordinates: { lat: number; lng: number } | null;
  lalamoveQuotationId: string | null;
  totalPrice: number;
  msession?: string;
  onShowInterstitial?: (offer: InterstitialOffer) => void;
  skipInterstitial?: boolean; // Set true after interstitial is declined (proceed to order)
}

export default function ReviewStep(props: ReviewStepProps) {
  const {
    cartItems,
    bundleItems,
    branch,
    serviceType,
    customerName,
    contactNumber,
    address,
    landmark,
    pickupTime,
    customTime,
    notes,
    paymentMethodId,
    referenceNumber,
    deliveryFee,
    deliveryCoordinates,
    lalamoveQuotationId,
    totalPrice,
    msession,
    onShowInterstitial,
    skipInterstitial,
  } = props;

  const { createOrder } = useOrders();
  const { paymentMethods } = usePaymentMethods();
  const { siteSettings } = useSiteSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPayment = paymentMethods.find((pm) => pm.id === paymentMethodId);
  const grandTotal = totalPrice + (deliveryFee || 0);

  // Auto-place order when interstitial is declined (skipInterstitial flips to true)
  useEffect(() => {
    if (skipInterstitial && !isSubmitting) {
      handlePlaceOrder();
    }
  }, [skipInterstitial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for interstitial offers before placing order (same as current handlePrePlaceOrder)
  const handlePrePlaceOrder = async () => {
    if (isSubmitting) return;

    // Skip interstitial check if we've already shown it (user declined)
    if (!skipInterstitial && onShowInterstitial) {
      const cartItemsMapped = cartItems.map(i => ({
        menu_item_id: i.id,
        category: i.category,
        quantity: i.quantity,
        unit_price: i.totalPrice / i.quantity,
      }));
      const cart = { items: cartItemsMapped, total: grandTotal };
      const res = await getInterstitialOffers(cart);
      if (res.success && res.data) {
        onShowInterstitial(res.data);
        return; // Don't place order yet — interstitial will handle it
      }
    }

    // No interstitial, proceed to place order
    await handlePlaceOrder();
  };

  const handlePlaceOrder = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const order = await createOrder(
        cartItems,
        customerName,
        contactNumber,
        serviceType,
        selectedPayment?.name || 'cash',
        grandTotal,
        {
          address: serviceType === 'delivery' ? address : undefined,
          landmark: serviceType === 'delivery' ? landmark : undefined,
          pickupTime: serviceType === 'pickup' ? (customTime || pickupTime) : undefined,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
          deliveryFee: deliveryFee || undefined,
          lalamoveQuotationId: lalamoveQuotationId || undefined,
          deliveryLat: deliveryCoordinates?.lat,
          deliveryLng: deliveryCoordinates?.lng,
          branchId: branch?.id,
          branch: branch || undefined,
          msession,
        }
      );

      // Track purchase events (must match exact signatures from fpixel.ts and meta-conversions.ts)
      const currency = siteSettings?.currency_code || 'PHP';
      const contentIds = cartItems.map(item => item.id);
      const numItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

      fpixel.trackPurchase(grandTotal, currency, contentIds, numItems);

      if (siteSettings?.meta_pixel_id) {
        sendPurchaseEvent({
          testEventCode: siteSettings.meta_test_event_code,
          orderId: order.order_number,
          value: grandTotal,
          currency,
          contentIds,
          numItems,
          customerPhone: contactNumber,
        }).catch(err => {
          console.error('[Meta Conversions API] Failed to send purchase event:', err);
        });
      }

      // Build Messenger redirect
      const messengerUsername = branch?.messenger_username || siteSettings?.messenger_username || 'StarrsFamousShakes';
      if (messengerUsername) {
        const orderText = buildOrderText(order, cartItems, bundleItems, selectedPayment?.name);
        const encodedText = encodeURIComponent(orderText);
        window.location.href = `https://m.me/${messengerUsername}?text=${encodedText}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Order Items */}
      <div className="space-y-2">
        {cartItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 py-1.5"
          >
            <div className="w-11 h-11 rounded-lg overflow-hidden bg-[#F0EDE8] flex-shrink-0">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg">🥤</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-[#1A2B22] truncate">{item.name}</div>
              <div className="text-[11px] text-[#8B9E95]">
                {item.selectedVariation?.name}
                {item.selectedAddOns?.length
                  ? ` · ${item.selectedAddOns.map((a) => a.name).join(', ')}`
                  : ''}
                {' '}×{item.quantity}
              </div>
            </div>
            <div className="font-bold text-sm text-[#2A5A4A] tabular-nums flex-shrink-0">
              ₱{item.totalPrice.toLocaleString()}
            </div>
          </div>
        ))}
        {bundleItems.map((item, index) => (
          <div
            key={`bundle-${index}`}
            className="flex items-center gap-3 py-1.5"
          >
            <div className="w-11 h-11 rounded-lg overflow-hidden bg-[#8FB8A8]/10 flex items-center justify-center flex-shrink-0 text-lg">
              🎁
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-[#1A2B22] truncate">{item.bundle.name}</div>
              <div className="text-[11px] text-[#8B9E95]">Bundle ×{item.quantity}</div>
            </div>
            <div className="font-bold text-sm text-[#2A5A4A] tabular-nums flex-shrink-0">
              ₱{item.totalPrice.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Customer Summary */}
      <div className="bg-starrs-mint-soft rounded-xl p-3 space-y-1.5 text-[13px]">
        <div className="flex justify-between">
          <span className="text-starrs-muted">Customer</span>
          <span className="font-semibold">{customerName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-starrs-muted">Phone</span>
          <span className="font-semibold">{contactNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-starrs-muted">Service</span>
          <span className="font-semibold">
            {serviceType === 'dine-in' ? '🪑 Dine In' : serviceType === 'pickup' ? '🚶 Pickup' : '🛵 Delivery'}
          </span>
        </div>
        {serviceType === 'pickup' && (
          <div className="flex justify-between">
            <span className="text-starrs-muted">Pickup Time</span>
            <span className="font-semibold">{customTime || `${pickupTime} min`}</span>
          </div>
        )}
        {serviceType === 'delivery' && address && (
          <div className="flex justify-between">
            <span className="text-starrs-muted">Address</span>
            <span className="font-semibold text-right max-w-[200px] truncate">{address}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-starrs-muted">Payment</span>
          <span className="font-semibold">{selectedPayment?.name || 'Cash'}</span>
        </div>
        {branch && (
          <div className="flex justify-between">
            <span className="text-starrs-muted">Branch</span>
            <span className="font-semibold">{branch.name}</span>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="border-t-2 border-starrs-deep pt-3 space-y-1">
        {deliveryFee !== null && deliveryFee > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-starrs-muted">Delivery Fee</span>
            <span className="font-semibold">₱{deliveryFee.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-base font-bold">Total</span>
          <span className="text-2xl font-extrabold text-starrs-deep">
            ₱{grandTotal.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3">{error}</div>
      )}

      {/* CTA */}
      <button
        onClick={handlePrePlaceOrder}
        disabled={isSubmitting}
        className="w-full py-4 bg-starrs-deep text-starrs-cream-brand rounded-[14px] text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" /> Placing Order...
          </>
        ) : (
          <>
            Send Order via Messenger <span className="text-lg">💬</span>
          </>
        )}
      </button>
      <p className="text-center text-[11px] text-gray-400">
        You&apos;ll be redirected to Messenger to confirm your order
      </p>
    </div>
  );
}

// Build formatted order text for Messenger
function buildOrderText(
  order: { order_number: string },
  cartItems: CartItem[],
  bundleItems: BundleCartItem[],
  paymentMethod?: string
): string {
  const lines = [
    `📋 Order #${order.order_number}`,
    '',
    '🛒 Items:',
  ];
  cartItems.forEach((item) => {
    let line = `• ${item.name}`;
    if (item.selectedVariation) line += ` (${item.selectedVariation.name})`;
    if (item.selectedAddOns?.length) line += ` +${item.selectedAddOns.map((a) => a.name).join(', ')}`;
    line += ` ×${item.quantity} — ₱${item.totalPrice}`;
    lines.push(line);
  });
  bundleItems.forEach((item) => {
    lines.push(`• ${item.bundle.name} ×${item.quantity} — ₱${item.totalPrice}`);
  });
  lines.push('', `💳 Payment: ${paymentMethod || 'Cash'}`);
  return lines.join('\n');
}
