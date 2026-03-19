'use client';

import { useState, useTransition } from 'react';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { reorderPaymentMethods } from '@/actions/payments';
import type { AdminPaymentMethod as PaymentMethod } from '@/types';

interface PaymentReorderListProps {
  paymentMethods: PaymentMethod[];
}

export default function PaymentReorderList({ paymentMethods: initial }: PaymentReorderListProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const move = (index: number, direction: 'up' | 'down') => {
    const next = [...methods];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= next.length) return;

    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setMethods(next);

    setError(null);
    startTransition(async () => {
      const result = await reorderPaymentMethods({ ids: next.map((m) => m.id) });
      if (!result.success) {
        setError(result.error || 'Failed to reorder payment methods');
        // Revert on failure
        setMethods(methods);
      }
    });
  };

  return (
    <div className="space-y-2">
      {error && (
        <p className="font-nunito text-sm text-red-600 px-1">{error}</p>
      )}

      {methods.map((method, index) => (
        <div
          key={method.id}
          className="
            flex items-center gap-3 px-4 py-3
            bg-white rounded-xl border border-[#E8E3DA]
            group hover:border-[#7BBFB5]/30 transition-all duration-200
          "
        >
          {/* QR thumbnail */}
          {method.qr_code_url && (
            <img
              src={method.qr_code_url}
              alt={`${method.name} QR code`}
              className="h-10 w-10 rounded-lg object-cover border border-[#E8E3DA] flex-shrink-0"
            />
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-nunito font-semibold text-stone-900 text-sm truncate">
              {method.name}
            </p>
            <p className="font-nunito text-xs text-stone-500 truncate">
              {method.account_name} · {method.account_number}
            </p>
          </div>

          {/* Active badge */}
          <span
            className={`
              inline-flex px-2 py-0.5 text-xs font-nunito font-medium rounded-full flex-shrink-0
              ${method.active
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-stone-100 text-stone-500'}
            `}
          >
            {method.active ? 'Active' : 'Inactive'}
          </span>

          {/* Reorder buttons */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button
              onClick={() => move(index, 'up')}
              disabled={isPending || index === 0}
              aria-label={`Move ${method.name} up`}
              className="
                p-1 rounded text-stone-400
                hover:text-[#3D8A80] hover:bg-[#7BBFB5]/10
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-150
              "
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => move(index, 'down')}
              disabled={isPending || index === methods.length - 1}
              aria-label={`Move ${method.name} down`}
              className="
                p-1 rounded text-stone-400
                hover:text-[#3D8A80] hover:bg-[#7BBFB5]/10
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-150
              "
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Pending indicator */}
          {isPending && (
            <Loader2 className="h-4 w-4 text-[#7BBFB5] animate-spin flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
