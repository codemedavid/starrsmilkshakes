'use client';

import { Check } from 'lucide-react';

interface WizardStepIndicatorProps {
  steps: { label: string }[];
  currentStep: number;
  completedSteps: Set<number>;
}

export default function WizardStepIndicator({ steps, currentStep, completedSteps }: WizardStepIndicatorProps) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-center">
        {steps.map((step, i) => {
          const isCompleted = completedSteps.has(i);
          const isCurrent = i === currentStep;
          const isPast = i < currentStep;

          return (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isCompleted
                      ? 'bg-[#3D8A80] text-white'
                      : isCurrent
                        ? 'bg-[#7BBFB5] text-white'
                        : 'border-2 border-stone-300 text-stone-400'
                  }`}
                  aria-label={`Step ${i + 1} of ${steps.length}: ${step.label}`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span
                  className={`text-[10px] mt-1 font-nunito max-w-[48px] text-center leading-tight truncate ${
                    isCurrent || isCompleted ? 'text-[#3D8A80] font-semibold' : 'text-stone-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-1 mt-[-14px] ${
                    isPast || isCompleted ? 'bg-[#3D8A80]' : 'bg-stone-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
