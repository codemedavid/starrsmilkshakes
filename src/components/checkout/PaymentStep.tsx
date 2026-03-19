'use client';

import React from 'react';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { Loader2 } from 'lucide-react';

interface PaymentStepProps {
  selectedMethod: string | null;
  referenceNumber: string;
  totalAmount: number;
  onSelectMethod: (methodId: string) => void;
  onReferenceChange: (value: string) => void;
  onContinue: () => void;
}

const PAYMENT_COLORS: Record<string, { bg: string; activeBg: string; text: string; icon: string }> = {
  gcash: { bg: 'bg-blue-50', activeBg: 'bg-blue-600', text: 'text-blue-700', icon: '📱' },
  maya: { bg: 'bg-green-50', activeBg: 'bg-green-600', text: 'text-green-700', icon: '💚' },
  'bank transfer': { bg: 'bg-amber-50', activeBg: 'bg-amber-600', text: 'text-amber-700', icon: '🏦' },
  'bank-transfer': { bg: 'bg-amber-50', activeBg: 'bg-amber-600', text: 'text-amber-700', icon: '🏦' },
  cash: { bg: 'bg-emerald-50', activeBg: 'bg-emerald-600', text: 'text-emerald-700', icon: '💵' },
};

const DEFAULT_COLORS = { bg: 'bg-gray-50', activeBg: 'bg-[#2A5A4A]', text: 'text-gray-700', icon: '💳' };

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
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-[#8FB8A8]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Payment Method Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {paymentMethods.map((pm) => {
          const colors = PAYMENT_COLORS[pm.name?.toLowerCase()] || DEFAULT_COLORS;
          const isSelected = selectedMethod === pm.id;

          return (
            <button
              key={pm.id}
              onClick={() => onSelectMethod(pm.id)}
              className={`rounded-2xl py-4 px-3 text-center transition-all border-2 active:scale-[0.97] ${
                isSelected
                  ? `${colors.activeBg} text-white border-transparent shadow-lg`
                  : `${colors.bg} ${colors.text} border-transparent hover:border-[#E8E4DE]`
              }`}
            >
              <div className="text-[26px] mb-1.5">{colors.icon}</div>
              <div className={`text-[13px] font-bold ${isSelected ? 'text-white' : ''}`}>
                {pm.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Method Details */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div className="bg-white rounded-2xl p-4 border border-[#E8E4DE]/50 shadow-sm space-y-4">
          {/* QR Code */}
          {selected.qr_code_url && (
            <div className="text-center">
              <div className="w-28 h-28 bg-white rounded-xl mx-auto border-2 border-[#E8E4DE] overflow-hidden p-1">
                <img
                  src={selected.qr_code_url}
                  alt={`${selected.name} QR Code`}
                  className="w-full h-full object-contain rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
          )}

          {/* Account Details */}
          <div className="text-center space-y-2">
            <div className="text-[12px] text-[#8B9E95] font-medium">Send to this number</div>
            <div className="font-mono text-[20px] font-bold text-[#1A2B22] bg-[#F4F0EB] px-4 py-2.5 rounded-xl inline-block tracking-[0.15em]">
              {selected.account_number}
            </div>
            <div className="text-[13px] text-[#8B9E95]">{selected.account_name}</div>
          </div>

          {/* Amount */}
          <div className="text-center bg-[#2A5A4A] rounded-xl py-3">
            <div className="text-[11px] text-[#8FB8A8] font-medium uppercase tracking-wider mb-0.5">Amount to pay</div>
            <div className="text-[24px] font-bold text-white tabular-nums tracking-tight">
              ₱{totalAmount.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Reference Number */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div>
          <label className="text-[12px] font-semibold text-[#8B9E95] block mb-1.5">
            Reference Number (optional)
          </label>
          <input
            type="text"
            value={referenceNumber}
            onChange={(e) => onReferenceChange(e.target.value)}
            placeholder="Enter if you've already paid"
            className="w-full px-3.5 py-3 border border-[#E8E4DE] rounded-xl text-[14px] bg-white focus:outline-none focus:border-[#8FB8A8] focus:ring-2 focus:ring-[#8FB8A8]/10 transition-all"
          />
        </div>
      )}

      {/* Info Tip */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div className="bg-[#FFF8E7] rounded-xl p-3 flex items-start gap-2.5 border border-[#F0E6C8]/50">
          <span className="text-[14px] mt-0.5">💡</span>
          <span className="text-[12px] text-[#8B7355] leading-relaxed">
            You&apos;ll send your payment screenshot via Messenger after placing the order.
          </span>
        </div>
      )}

      {/* Continue */}
      <button
        onClick={onContinue}
        disabled={!selectedMethod}
        className={`w-full py-3.5 rounded-2xl text-[15px] font-bold transition-all active:scale-[0.98] ${
          selectedMethod
            ? 'bg-[#2A5A4A] text-[#FFF8E7] shadow-lg shadow-[#2A5A4A]/20'
            : 'bg-[#E8E4DE] text-[#B8B2A9] cursor-not-allowed'
        }`}
      >
        Continue
      </button>
    </div>
  );
}
