// src/components/checkout/PaymentStep.tsx
'use client';

import React from 'react';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import type { AdminPaymentMethod } from '@/types';

interface PaymentStepProps {
  selectedMethod: string | null;
  referenceNumber: string;
  totalAmount: number;
  onSelectMethod: (methodId: string) => void;
  onReferenceChange: (value: string) => void;
  onContinue: () => void;
}

// Map payment method names to icons
const PAYMENT_ICONS: Record<string, string> = {
  gcash: '📱',
  maya: '💜',
  'bank-transfer': '🏦',
  cash: '💵',
};

export default function PaymentStep({
  selectedMethod,
  referenceNumber,
  totalAmount,
  onSelectMethod,
  onReferenceChange,
  onContinue,
}: PaymentStepProps) {
  const { paymentMethods, loading } = usePaymentMethods();

  const selected = paymentMethods.find((pm) => pm.id === selectedMethod);

  if (loading) {
    return <div className="text-center py-4 text-starrs-muted text-sm">Loading payment methods...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Payment Method Grid */}
      <div className="grid grid-cols-2 gap-2">
        {paymentMethods.map((pm) => (
          <button
            key={pm.id}
            onClick={() => onSelectMethod(pm.id)}
            className={`rounded-xl py-3.5 px-2.5 text-center transition-colors border-2 ${
              selectedMethod === pm.id
                ? 'bg-starrs-deep text-starrs-cream-brand border-starrs-deep'
                : 'bg-starrs-mint-soft text-starrs-deep border-transparent'
            }`}
          >
            <div className="text-2xl mb-1">
              {PAYMENT_ICONS[pm.name?.toLowerCase()] || '💳'}
            </div>
            <div className="text-[13px] font-semibold">{pm.name}</div>
          </button>
        ))}
      </div>

      {/* Selected Method Details */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div className="bg-starrs-cream-brand rounded-xl p-3.5 border-[1.5px] border-amber-200/50 space-y-3">
          {/* QR Code */}
          {selected.qr_code_url && (
            <div className="text-center">
              <div className="w-[100px] h-[100px] bg-white rounded-lg mx-auto border border-gray-200 overflow-hidden">
                <img
                  src={selected.qr_code_url}
                  alt={`${selected.name} QR Code`}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
          )}

          {/* Account Details */}
          <div className="text-center space-y-1">
            <div className="text-xs text-starrs-muted">Send to this number</div>
            <div className="font-mono text-lg font-bold text-starrs-deep bg-white px-3.5 py-2 rounded-lg inline-block tracking-wider">
              {selected.account_number}
            </div>
            <div className="text-xs text-starrs-muted">{selected.account_name}</div>
          </div>

          {/* Amount */}
          <div className="text-center">
            <div className="text-xs text-starrs-muted">Amount to pay</div>
            <div className="text-xl font-extrabold text-starrs-deep">
              ₱{totalAmount.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Reference Number */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div>
          <label className="text-xs font-semibold text-starrs-muted block mb-1">
            Reference Number (optional)
          </label>
          <input
            type="text"
            value={referenceNumber}
            onChange={(e) => onReferenceChange(e.target.value)}
            placeholder="Enter if you've already paid"
            className="w-full px-3 py-2.5 border-[1.5px] border-starrs-mint-soft rounded-xl text-sm bg-gray-50"
          />
        </div>
      )}

      {/* Info Tip */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div className="bg-starrs-mint-soft rounded-xl p-2.5 flex items-start gap-2">
          <span className="text-sm">💡</span>
          <span className="text-xs text-starrs-deep/70 leading-relaxed">
            You&apos;ll send your payment screenshot via Messenger after placing the order.
          </span>
        </div>
      )}

      {/* Continue */}
      <button
        onClick={onContinue}
        disabled={!selectedMethod}
        className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-colors ${
          selectedMethod
            ? 'bg-starrs-sage text-starrs-cream-brand'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        Continue
      </button>
    </div>
  );
}
