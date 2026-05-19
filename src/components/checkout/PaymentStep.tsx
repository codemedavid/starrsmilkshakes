'use client';

import React from 'react';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';

interface PaymentStepProps {
  selectedMethod: string | null;
  referenceNumber: string;
  totalAmount: number;
  branchId?: string | null;
  onSelectMethod: (methodId: string) => void;
  onReferenceChange: (value: string) => void;
  onContinue: () => void;
  onMethodNameChange?: (name: string) => void;
}

const PAYMENT_ICONS: Record<string, string> = {
  gcash: 'smartphone',
  maya: 'account_balance_wallet',
  'bank transfer': 'account_balance',
  'bank-transfer': 'account_balance',
  cash: 'payments',
};

export default function PaymentStep({
  selectedMethod,
  referenceNumber,
  totalAmount,
  branchId,
  onSelectMethod,
  onReferenceChange,
  onContinue,
  onMethodNameChange,
}: PaymentStepProps) {
  const { paymentMethods, loading } = usePaymentMethods(branchId);
  const selected = paymentMethods.find((pm) => pm.id === selectedMethod);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#7ed2c2] border-t-[#006b5e]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Method Cards */}
      <div className="space-y-4">
        {paymentMethods.map((pm) => {
          const isSelected = selectedMethod === pm.id;
          const icon = PAYMENT_ICONS[pm.name?.toLowerCase()] || 'credit_card';

          return (
            <button
              key={pm.id}
              onClick={() => {
                onSelectMethod(pm.id);
                onMethodNameChange?.(pm.name);
              }}
              className={`w-full text-left rounded-[1rem] p-6 transition-all duration-300 active:scale-[0.98] ${
                isSelected
                  ? 'bg-white ring-2 ring-[#006b5e] shadow-sm'
                  : 'bg-[#cdfeed] hover:bg-[#c8f8e8]'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center ${
                    isSelected ? 'bg-[#006b5e]' : 'bg-[#bceddc]'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-2xl ${
                      isSelected ? 'text-[#e6fff5]' : 'text-[#006b5e]'
                    }`}
                  >
                    {icon}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-headline text-lg font-bold text-[#002019]">
                    {pm.name}
                  </h3>
                  {pm.name?.toLowerCase() !== 'cash' && (
                    <p className="text-[#005b50] text-sm">{pm.account_name}</p>
                  )}
                </div>
                <span
                  className={`material-symbols-outlined text-xl ${
                    isSelected ? 'text-[#006b5e]' : 'text-[#bec9c5]'
                  }`}
                >
                  {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Method Details */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div className="bg-white rounded-[1rem] p-6 space-y-5">
          {/* QR Code */}
          {selected.qr_code_url && (
            <div className="text-center">
              <div className="w-32 h-32 bg-white rounded-[1rem] mx-auto overflow-hidden p-1">
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
            <span className="font-label text-xs font-bold uppercase tracking-widest text-[#005b50]">
              Send to this number
            </span>
            <div className="font-mono text-2xl font-bold text-[#002019] bg-[#cdfeed] px-6 py-3 rounded-[1rem] inline-block tracking-[0.15em]">
              {selected.account_number}
            </div>
            <p className="text-[#005b50] text-sm">{selected.account_name}</p>
          </div>

          {/* Amount */}
          <div className="text-center bg-[#006b5e] rounded-[1rem] py-4">
            <span className="font-label text-[10px] font-bold uppercase tracking-widest text-[#7ed2c2] block mb-1">
              Amount to pay
            </span>
            <span className="text-3xl font-headline font-extrabold text-white tabular-nums">
              ₱{totalAmount.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Reference Number */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div>
          <label className="block font-label text-xs font-bold uppercase tracking-widest text-[#005b50] mb-2 ml-4">
            Reference Number (optional)
          </label>
          <div className="relative">
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => onReferenceChange(e.target.value)}
              placeholder="Enter if you've already paid"
              className="w-full bg-[#bceddc] border-none rounded-[1rem] h-16 px-6 focus:ring-2 focus:ring-[#006b5e]/20 focus:bg-white transition-all placeholder:text-[#bec9c5] font-medium text-lg"
            />
            <span className="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-[#006b5e]/40">
              receipt
            </span>
          </div>
        </div>
      )}

      {/* Info Tip */}
      {selected && selected.name?.toLowerCase() !== 'cash' && (
        <div className="bg-[#cdfeed] rounded-[1rem] p-5 flex items-start gap-4">
          <div className="bg-white p-2 rounded-full shadow-sm">
            <span className="material-symbols-outlined text-[#006b5e]">info</span>
          </div>
          <p className="text-[#005b50] text-sm leading-relaxed">
            You&apos;ll send your payment screenshot via Messenger after placing the order.
          </p>
        </div>
      )}

      {/* Continue */}
      <button
        onClick={onContinue}
        disabled={!selectedMethod}
        className={`w-full rounded-full font-headline font-bold text-lg py-5 transition-all active:scale-95 flex items-center justify-center gap-2 ${
          selectedMethod
            ? 'bg-[#006b5e] text-[#e6fff5] shadow-lg shadow-[#006b5e]/20'
            : 'bg-[#bceddc] text-[#bec9c5] cursor-not-allowed'
        }`}
      >
        Next Step
        <span className="material-symbols-outlined">arrow_forward</span>
      </button>
    </div>
  );
}
