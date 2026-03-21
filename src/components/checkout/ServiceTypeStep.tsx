// src/components/checkout/ServiceTypeStep.tsx
'use client';

import React from 'react';
import { ServiceType } from '@/types';

interface ServiceTypeStepProps {
  selected: ServiceType;
  onSelect: (type: ServiceType) => void;
  onContinue: () => void;
}

const SERVICE_OPTIONS: {
  value: ServiceType;
  label: string;
  description: string;
  icon: string;
  bg: string;
  selectedBg: string;
}[] = [
  {
    value: 'dine-in',
    label: 'Dine-in',
    description:
      'Experience the full nostalgia of our classic creamery. Grab a booth and stay a while.',
    icon: 'restaurant',
    bg: 'bg-[#cdfeed]',
    selectedBg: 'bg-[#cdfeed] ring-2 ring-[#006b5e]',
  },
  {
    value: 'pickup',
    label: 'Pickup',
    description:
      'Ready when you are. Skip the wait and grab your cold treat on the go.',
    icon: 'shopping_basket',
    bg: 'bg-[#bceddc]',
    selectedBg: 'bg-[#bceddc] ring-2 ring-[#006b5e]',
  },
  {
    value: 'delivery',
    label: 'Delivery',
    description:
      'Cravings delivered straight to your doorstep. Fresh, cold, and famous.',
    icon: 'moped',
    bg: 'bg-[#cdfeed]',
    selectedBg: 'bg-[#cdfeed] ring-2 ring-[#006b5e]',
  },
];

export default function ServiceTypeStep({
  selected,
  onSelect,
  onContinue,
}: ServiceTypeStepProps) {
  return (
    <div className="space-y-8">
      {/* Cards */}
      <div className="space-y-5">
        {SERVICE_OPTIONS.map((option) => {
          const isActive = selected === option.value;
          return (
            <button
              key={option.value}
              onClick={() => {
                onSelect(option.value);
                onContinue();
              }}
              className={`w-full text-left rounded-[1rem] p-8 transition-all duration-300 active:scale-[0.98] relative overflow-hidden group ${
                isActive ? option.selectedBg : `${option.bg} hover:opacity-90`
              }`}
            >
              <div className="flex flex-col gap-6 relative z-10">
                <div>
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 transition-transform duration-500 group-hover:scale-110 ${
                      isActive ? 'bg-[#006b5e]' : 'bg-[#7ed2c2]'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-4xl ${
                        isActive ? 'text-[#e6fff5]' : 'text-[#006b5e]'
                      }`}
                    >
                      {option.icon}
                    </span>
                  </div>
                  <h3 className="font-headline text-2xl font-bold text-[#002019] mb-2">
                    {option.label}
                  </h3>
                  <p className="text-[#005b50] leading-relaxed">
                    {option.description}
                  </p>
                </div>
                <div className="flex items-center text-[#006b5e] font-semibold gap-2">
                  <span>{isActive ? 'Selected' : 'Select Experience'}</span>
                  <span className="material-symbols-outlined text-xl">
                    {isActive ? 'check_circle' : 'arrow_forward'}
                  </span>
                </div>
              </div>
              {/* Decorative blur */}
              <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-[#006b5e]/5 rounded-full blur-3xl group-hover:bg-[#006b5e]/10 transition-colors" />
            </button>
          );
        })}
      </div>

    </div>
  );
}
