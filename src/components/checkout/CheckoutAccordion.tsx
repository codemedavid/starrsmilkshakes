// src/components/checkout/CheckoutAccordion.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { CartItem, Branch, ServiceType } from '@/types';
import { BundleCartItem } from '@/types/bundle';
import ServiceTypeStep from './ServiceTypeStep';
import BranchStep from './BranchStep';
import ServiceDetailsStep from './ServiceDetailsStep';
import PaymentStep from './PaymentStep';
import ReviewStep from './ReviewStep';

interface CheckoutAccordionProps {
  cartItems: CartItem[];
  bundleItems: BundleCartItem[];
  totalPrice: number;
  onBack: () => void;
  msession?: string;
}

const TOTAL_STEPS = 5;

const STEP_HEADERS: {
  label: string;
  title: string | ((st: ServiceType) => string);
  subtitle: string | ((st: ServiceType) => string);
}[] = [
  {
    label: 'Order Type',
    title: 'How would you like your shake?',
    subtitle: 'Choose your preferred way to enjoy our signature hand-spun creations.',
  },
  {
    label: 'Location',
    title: 'Pick your nearest creamery.',
    subtitle: 'Freshly whipped joy is closer than you think.',
  },
  {
    label: 'Service Details',
    title: (st: ServiceType) =>
      st === 'dine-in'
        ? 'Dine-in Information'
        : st === 'pickup'
        ? "Let's get your order ready for pickup."
        : 'Where is the Starr landing?',
    subtitle: (st: ServiceType) =>
      st === 'dine-in'
        ? "Grab a seat, we'll bring the magic."
        : st === 'pickup'
        ? 'Tell us when you\u2019re arriving so your shakes are chilled to perfection.'
        : "Give us the details and we'll have your shakes whisked over.",
  },
  {
    label: 'Payment',
    title: 'How would you like to pay?',
    subtitle: 'Choose your preferred payment method.',
  },
  {
    label: 'Review',
    title: 'Review your order',
    subtitle: 'Make sure everything looks perfect before we start whipping.',
  },
];

export default function CheckoutAccordion({
  cartItems,
  bundleItems,
  totalPrice,
  onBack,
  msession,
}: CheckoutAccordionProps) {
  const [currentStep, setCurrentStep] = useState(1);

  // Form state
  const [serviceType, setServiceType] = useState<ServiceType>('dine-in');
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [serviceData, setServiceData] = useState({
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
  const [paymentMethodName, setPaymentMethodName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');

  const totalItemCount = useMemo(
    () =>
      cartItems.reduce((sum, item) => sum + item.quantity, 0) +
      bundleItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems, bundleItems]
  );

  const grandTotal = totalPrice + (serviceData.deliveryFee || 0);

  const goNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }, []);

  const goBack = useCallback(() => {
    if (currentStep === 1) {
      onBack();
    } else {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep, onBack]);

  const header = STEP_HEADERS[currentStep - 1];
  const title =
    typeof header.title === 'function' ? header.title(serviceType) : header.title;
  const subtitle =
    typeof header.subtitle === 'function'
      ? header.subtitle(serviceType)
      : header.subtitle;

  return (
    <div className="min-h-screen bg-[#e6fff5] font-body text-[#002019] relative overflow-hidden">
      {/* Decorative background blurs */}
      <div className="fixed -top-24 -right-24 w-96 h-96 bg-[#7ed2c2]/20 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-32 -left-24 w-64 h-64 bg-[#2cbcff]/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* Top Navigation */}
      <header className="bg-[#e6fff5]/80 backdrop-blur-xl fixed top-0 w-full z-50">
        <div className="flex items-center justify-between px-6 h-16 max-w-xl mx-auto">
          <button
            onClick={goBack}
            className="text-[#006b5e] active:scale-95 duration-200 hover:opacity-80 transition-opacity p-2"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="font-headline font-bold tracking-tight text-[#006b5e] text-lg">
            {header.label}
          </h1>
          <div className="w-10" />
        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#bec9c5]/15 to-transparent" />
      </header>

      {/* Step Content */}
      <main className="pt-24 pb-40 px-6 max-w-xl mx-auto relative">
        {/* Editorial Section Header */}
        <section className="mb-10 relative">
          <span className="font-label text-xs font-bold uppercase tracking-[0.2em] text-[#005b50] mb-3 block">
            Step {currentStep} of {TOTAL_STEPS}
          </span>
          <h2 className="font-headline text-4xl font-extrabold tracking-tighter text-[#006b5e] leading-tight mb-4">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            <div className="h-1 w-12 bg-[#7ed2c2] rounded-full" />
            <p className="text-[#005b50] leading-relaxed">{subtitle}</p>
          </div>
        </section>

        {/* Step Bodies */}
        {currentStep === 1 && (
          <ServiceTypeStep
            selected={serviceType}
            onSelect={setServiceType}
            onContinue={goNext}
          />
        )}

        {currentStep === 2 && (
          <BranchStep
            selectedBranch={selectedBranch}
            onSelect={setSelectedBranch}
            onContinue={goNext}
          />
        )}

        {currentStep === 3 && (
          <ServiceDetailsStep
            data={{ serviceType, ...serviceData }}
            onChange={(partial) =>
              setServiceData((prev) => ({ ...prev, ...partial }))
            }
            selectedBranch={selectedBranch}
            onContinue={goNext}
            hideServiceToggle
          />
        )}

        {currentStep === 4 && (
          <PaymentStep
            selectedMethod={paymentMethodId}
            referenceNumber={referenceNumber}
            totalAmount={grandTotal}
            branchId={selectedBranch?.id}
            onSelectMethod={setPaymentMethodId}
            onReferenceChange={setReferenceNumber}
            onContinue={goNext}
            onMethodNameChange={setPaymentMethodName}
          />
        )}

        {currentStep === 5 && (
          <ReviewStep
            cartItems={cartItems}
            bundleItems={bundleItems}
            branch={selectedBranch}
            serviceType={serviceType}
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
          />
        )}
      </main>

      {/* Sticky Bottom — Back button (only for steps 2-4; step 5 has Place Order) */}
      {currentStep > 1 && currentStep < 5 && (
        <div className="fixed bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#e6fff5] via-[#e6fff5]/90 to-transparent pt-12 z-40 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <button
              onClick={goBack}
              className="w-full h-14 rounded-full font-headline font-bold text-[#006b5e] bg-[#bceddc] active:scale-95 transition-all hover:bg-[#c8f8e8]"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
