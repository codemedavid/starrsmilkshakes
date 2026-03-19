'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function FacebookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin/facebook] Error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>

        <h2 className="font-playfair text-2xl font-semibold text-stone-900 mb-2">
          Something went wrong
        </h2>

        <p className="font-nunito text-sm text-stone-500 mb-8">
          An unexpected error occurred while loading the Facebook integration. Please try again or
          contact support if the problem persists.
        </p>

        <button
          type="button"
          onClick={reset}
          className="
            inline-flex items-center gap-2 px-6 py-3
            bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm
            rounded-[10px] shadow-sm
            hover:bg-[#3D8A80] active:bg-[#2C6E65]
            focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2
            transition-all duration-200
          "
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
