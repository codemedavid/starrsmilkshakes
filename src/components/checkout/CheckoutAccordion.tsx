// src/components/checkout/CheckoutAccordion.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CartItem, Branch, ServiceType } from '@/types';
import { BundleCartItem } from '@/types/bundle';
import StepHeader from './StepHeader';
import BranchStep from './BranchStep';
import ServiceDetailsStep from './ServiceDetailsStep';
import PaymentStep from './PaymentStep';
import ReviewStep from './ReviewStep';
import CheckoutStickyBar from './CheckoutStickyBar';
import type { InterstitialOffer } from '@/types/upsell';

interface CheckoutAccordionProps {
  cartItems: CartItem[];
  bundleItems: BundleCartItem[];
  totalPrice: number;
  onBack: () => void;
  msession?: string;
  onShowInterstitial?: (offer: InterstitialOffer) => void;
  skipInterstitial?: boolean; // true after user declines interstitial
}

const TOTAL_STEPS = 4;

export default function CheckoutAccordion({
  cartItems,
  bundleItems,
  totalPrice,
  onBack,
  msession,
  onShowInterstitial,
  skipInterstitial,
}: CheckoutAccordionProps) {
  const [activeStep, setActiveStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  // Form state
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [serviceData, setServiceData] = useState({
    serviceType: 'dine-in' as ServiceType,
    customerName: '',
    contactNumber: '',
    address: '',
    landmark: '',
    pickupTime: '5-10',
    customTime: '',
    notes: '',
    deliveryCoordinates: null as { lat: number; lng: number } | null,
    deliveryFee: null as number | null,
    lalamoveQuotationId: null as string | null,
  });
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState('');

  const totalItemCount = useMemo(
    () =>
      cartItems.reduce((sum, item) => sum + item.quantity, 0) +
      bundleItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems, bundleItems]
  );

  const grandTotal = totalPrice + (serviceData.deliveryFee || 0);

  const completeStep = (step: number) => {
    setCompletedSteps((prev) => ({ ...prev, [step]: true }));
    setActiveStep(step + 1);
  };

  const editStep = (step: number) => {
    setActiveStep(step);
  };

  const getStepState = (step: number) => {
    if (completedSteps[step] && activeStep !== step) return 'completed' as const;
    if (step === activeStep) return 'active' as const;
    return 'locked' as const;
  };

  // Step summaries for collapsed state
  const branchSummary = selectedBranch ? selectedBranch.name : undefined;
  const serviceSummary = completedSteps[2]
    ? `${serviceData.serviceType === 'dine-in' ? '🪑 Dine In' : serviceData.serviceType === 'pickup' ? '🚶 Pickup' : '🛵 Delivery'} • ${serviceData.customerName} • ${serviceData.contactNumber.slice(-4)}`
    : undefined;
  // Payment summary uses the actual method name (fetched from usePaymentMethods in PaymentStep)
  const [paymentMethodName, setPaymentMethodName] = useState('');
  const paymentSummary = paymentMethodId ? `💳 ${paymentMethodName || 'Selected'}` : undefined;

  return (
    <div className="min-h-screen bg-[#F4F0EB] pb-24">
      {/* Header */}
      <div className="bg-[#8FB8A8] px-5 pt-12 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-[18px] h-[18px] text-white" />
          </button>
          <span className="text-white font-bold text-[20px] tracking-tight">
            Checkout
          </span>
        </div>
        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => (
            <React.Fragment key={step}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  completedSteps[step]
                    ? 'bg-starrs-cream-brand text-starrs-deep'
                    : step === activeStep
                    ? 'bg-starrs-cream-brand text-starrs-deep'
                    : 'bg-white/30 text-starrs-cream-brand'
                }`}
              >
                {completedSteps[step] ? '✓' : step}
              </div>
              {step < TOTAL_STEPS && (
                <div
                  className={`w-6 h-0.5 ${
                    completedSteps[step] ? 'bg-starrs-cream-brand' : 'bg-white/30'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="px-4 pt-4">
        {/* Step 1: Branch */}
        <StepHeader
          stepNumber={1}
          title="Branch"
          state={getStepState(1)}
          summary={branchSummary}
          onEdit={() => editStep(1)}
        >
          <BranchStep
            selectedBranch={selectedBranch}
            onSelect={setSelectedBranch}
            onContinue={() => completeStep(1)}
          />
        </StepHeader>

        {/* Step 2: Service & Details */}
        <StepHeader
          stepNumber={2}
          title="Service & Details"
          state={getStepState(2)}
          summary={serviceSummary}
          onEdit={() => editStep(2)}
        >
          <ServiceDetailsStep
            data={serviceData}
            onChange={(partial) => setServiceData((prev) => ({ ...prev, ...partial }))}
            selectedBranch={selectedBranch}
            onContinue={() => completeStep(2)}
          />
        </StepHeader>

        {/* Step 3: Payment */}
        <StepHeader
          stepNumber={3}
          title="Payment Method"
          state={getStepState(3)}
          summary={paymentSummary}
          onEdit={() => editStep(3)}
        >
          <PaymentStep
            selectedMethod={paymentMethodId}
            referenceNumber={referenceNumber}
            totalAmount={grandTotal}
            onSelectMethod={setPaymentMethodId}
            onReferenceChange={setReferenceNumber}
            onContinue={() => completeStep(3)}
          />
        </StepHeader>

        {/* Step 4: Review & Order */}
        <StepHeader
          stepNumber={4}
          title="Review & Order"
          state={getStepState(4)}
        >
          <ReviewStep
            cartItems={cartItems}
            bundleItems={bundleItems}
            branch={selectedBranch}
            serviceType={serviceData.serviceType}
            customerName={serviceData.customerName}
            contactNumber={serviceData.contactNumber}
            address={serviceData.address}
            landmark={serviceData.landmark}
            pickupTime={serviceData.pickupTime}
            customTime={serviceData.customTime}
            notes={serviceData.notes}
            paymentMethodId={paymentMethodId}
            referenceNumber={referenceNumber}
            deliveryFee={serviceData.deliveryFee}
            deliveryCoordinates={serviceData.deliveryCoordinates}
            lalamoveQuotationId={serviceData.lalamoveQuotationId}
            totalPrice={totalPrice}
            msession={msession}
            onShowInterstitial={onShowInterstitial}
            skipInterstitial={skipInterstitial}
          />
        </StepHeader>
      </div>

      {/* Sticky Bar */}
      <CheckoutStickyBar
        itemCount={totalItemCount}
        totalPrice={grandTotal}
        currentStep={activeStep}
        totalSteps={TOTAL_STEPS}
      />
    </div>
  );
}
