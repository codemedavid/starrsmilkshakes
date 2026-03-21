'use client';

import { ArrowLeft } from 'lucide-react';

interface WizardBottomBarProps {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled: boolean;
  totalPrice: number;
  showBack: boolean;
}

export default function WizardBottomBar({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  totalPrice,
  showBack,
}: WizardBottomBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-stone-100 px-4 py-3 pb-6 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      <div className="max-w-lg mx-auto flex items-center gap-3">
        {showBack && (
          <button
            onClick={onBack}
            className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </button>
        )}
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="flex-1 min-h-[48px] py-3 bg-[#7BBFB5] text-white font-nunito font-bold text-sm rounded-xl hover:bg-[#3D8A80] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          aria-label={nextLabel}
        >
          {nextLabel}
          {totalPrice > 0 && (
            <span className="font-normal opacity-90">· ₱{totalPrice.toFixed(0)}</span>
          )}
        </button>
      </div>
    </div>
  );
}
