// src/components/checkout/ReviewStep.tsx
'use client';

import React, { useState, useRef } from 'react';
import { CartItem, Branch, ServiceType } from '@/types';
import { BundleCartItem } from '@/types/bundle';
import { useOrders } from '@/hooks/useOrders';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import * as fpixel from '@/lib/fpixel';
import { sendPurchaseEvent } from '@/lib/meta-conversions';

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
  } = props;

  const { createOrder } = useOrders();
  const { paymentMethods } = usePaymentMethods();
  const { siteSettings } = useSiteSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPlacingRef = useRef(false); // Synchronous guard against double placement

  const selectedPayment = paymentMethods.find((pm) => pm.id === paymentMethodId);
  const grandTotal = totalPrice + (deliveryFee || 0);

  const handlePlaceOrder = async () => {
    if (isSubmitting || isPlacingRef.current) return;
    isPlacingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const order = await createOrder(
        cartItems,
        customerName,
        contactNumber,
        serviceType,
        paymentMethodId || 'cash',
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
        },
        bundleItems
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
      } else {
        // No Messenger redirect configured — reset submission state
        setIsSubmitting(false);
        isPlacingRef.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order. Please try again.');
      setIsSubmitting(false);
      isPlacingRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      {/* Order Items */}
      <div className="bg-white rounded-[1rem] p-6 space-y-4">
        <span className="font-label text-xs font-bold uppercase tracking-widest text-[#005b50]">
          Order Summary
        </span>
        {cartItems.map((item) => (
          <div key={item.id} className="flex items-center gap-4 pt-3 border-t border-[#bec9c5]/10 first:border-t-0 first:pt-0">
            <div className="w-14 h-14 rounded-[1rem] overflow-hidden bg-[#cdfeed] flex-shrink-0">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#006b5e]">icecream</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-headline font-bold text-[15px] text-[#002019] truncate">{item.name}</div>
              <div className="text-[12px] text-[#005b50]">
                {item.selectedVariation?.name}
                {item.selectedAddOns?.length
                  ? ` + ${item.selectedAddOns.map((a) => a.name).join(', ')}`
                  : ''}
                {' '}x{item.quantity}
              </div>
            </div>
            <div className="font-headline font-bold text-[15px] text-[#006b5e] tabular-nums flex-shrink-0">
              ₱{item.totalPrice.toLocaleString()}
            </div>
          </div>
        ))}
        {bundleItems.map((item, index) => (
          <div key={`bundle-${index}`} className="flex items-center gap-4 pt-3 border-t border-[#bec9c5]/10">
            <div className="w-14 h-14 rounded-[1rem] overflow-hidden bg-[#7ed2c2]/20 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#006b5e]">redeem</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-headline font-bold text-[15px] text-[#002019] truncate">{item.bundle.name}</div>
              <div className="text-[12px] text-[#005b50]">Bundle x{item.quantity}</div>
            </div>
            <div className="font-headline font-bold text-[15px] text-[#006b5e] tabular-nums flex-shrink-0">
              ₱{item.totalPrice.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Customer & Service Summary */}
      <div className="bg-[#cdfeed] rounded-[1rem] p-6 space-y-3">
        <span className="font-label text-xs font-bold uppercase tracking-widest text-[#005b50]">
          Details
        </span>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#005b50]">Customer</span>
            <span className="font-semibold text-[#002019]">{customerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#005b50]">Phone</span>
            <span className="font-semibold text-[#002019]">{contactNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#005b50]">Service</span>
            <span className="font-semibold text-[#002019]">
              {serviceType === 'dine-in' ? 'Dine In' : serviceType === 'pickup' ? 'Pickup' : 'Delivery'}
            </span>
          </div>
          {serviceType === 'pickup' && (
            <div className="flex justify-between">
              <span className="text-[#005b50]">Pickup Time</span>
              <span className="font-semibold text-[#002019]">{customTime || `${pickupTime} min`}</span>
            </div>
          )}
          {serviceType === 'delivery' && address && (
            <div className="flex justify-between">
              <span className="text-[#005b50]">Address</span>
              <span className="font-semibold text-[#002019] text-right max-w-[200px] truncate">{address}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[#005b50]">Payment</span>
            <span className="font-semibold text-[#002019]">{selectedPayment?.name || 'Cash'}</span>
          </div>
          {branch && (
            <div className="flex justify-between">
              <span className="text-[#005b50]">Branch</span>
              <span className="font-semibold text-[#002019]">{branch.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Total */}
      <div className="bg-[#006b5e] rounded-[1rem] p-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[#7ed2c2]/70">Subtotal</span>
          <span className="text-white font-medium tabular-nums">₱{totalPrice.toLocaleString()}</span>
        </div>
        {deliveryFee !== null && deliveryFee > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-[#7ed2c2]/70">Delivery Fee</span>
            <span className="text-white font-medium tabular-nums">₱{deliveryFee.toLocaleString()}</span>
          </div>
        )}
        <div className="border-t border-white/15 pt-3 flex justify-between items-center">
          <span className="font-headline font-bold text-white">Grand Total</span>
          <span className="font-headline text-3xl font-extrabold text-white tabular-nums tracking-tight">
            ₱{grandTotal.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[#fb5151]/10 text-[#ba1a1a] text-sm rounded-[1rem] p-4 flex items-center gap-3">
          <span className="material-symbols-outlined">error</span>
          {error}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handlePlaceOrder}
        disabled={isSubmitting}
        className="w-full rounded-full font-headline font-bold text-lg py-5 transition-all active:scale-95 disabled:opacity-60 bg-[#006b5e] text-[#e6fff5] shadow-xl shadow-[#006b5e]/20 flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            Placing Order...
          </>
        ) : (
          <>
            Place Order — ₱{grandTotal.toLocaleString()}
            <span className="material-symbols-outlined">send</span>
          </>
        )}
      </button>
      <p className="text-center text-xs text-[#005b50]">
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
