'use client';

import { useState, useTransition } from 'react';
import { registerLoyaltyCard } from '@/actions/loyalty';

// ─── types ───────────────────────────────────────────────────────────────────

interface RegisterFormProps {
  hash: string;
  psid: string | null;
}

interface SuccessData {
  cardCode: string;
}

// ─── RegisterForm ─────────────────────────────────────────────────────────────

export default function RegisterForm({ hash }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await registerLoyaltyCard(hash, email, phone || undefined);

      if (!result.success) {
        setError(result.error ?? 'Something went wrong. Please try again.');
        return;
      }

      const card = result.data?.card;
      const shouldPickGoal = result.data?.shouldPickGoal ?? false;
      const viewToken = result.data?.viewToken;

      if (shouldPickGoal && viewToken) {
        window.location.href = `/loyalty/card/${viewToken}/goals`;
        return;
      }

      setSuccess({ cardCode: card?.card_code ?? '' });
    });
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5]">
        <div className="max-w-md w-full bg-white border border-[#E8E3DA] rounded-2xl overflow-hidden shadow-md">
          {/* Gradient header */}
          <div className="bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] px-6 py-10 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxLjUiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvc3ZnPg==')] opacity-50" aria-hidden="true" />
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⭐</span>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                You&apos;re In!
              </h1>
              <p className="text-sm text-white/80 mt-1">Welcome to the Starr&apos;s family</p>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-8 text-center">
            <p className="text-stone-600 text-sm mb-6 leading-relaxed">
              Your loyalty card has been created. Start earning starrs with every order!
            </p>

            {/* Card code — make it feel special */}
            <div className="bg-gradient-to-br from-[#FAF8F5] to-[#F0EBE0] border border-[#E8E3DA] rounded-2xl px-6 py-5 inline-block shadow-inner">
              <p className="text-[10px] text-stone-400 mb-1.5 uppercase tracking-[0.2em] font-semibold">
                Your Card Code
              </p>
              <p className="text-2xl font-bold tracking-[0.15em] text-[#3D8A80]">
                {success.cardCode}
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-[#E8E3DA]">
              <p className="text-xs text-stone-400 leading-relaxed">
                Open Messenger to view your card, check your progress, and start collecting rewards.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration form ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5]">
      <div className="max-w-md w-full bg-white border border-[#E8E3DA] rounded-2xl overflow-hidden shadow-md">
        {/* Gradient header */}
        <div className="bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] px-6 py-10 text-center relative overflow-hidden">
          <div className="absolute top-4 right-4 w-20 h-20 rounded-full bg-white/5" aria-hidden="true" />
          <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-white/5" aria-hidden="true" />

          <div className="relative z-10">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">⭐</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Starr&apos;s Famous Shakes
            </h1>
            <p className="text-sm text-white/70 mt-1">Join our loyalty program</p>
          </div>
        </div>

        {/* Form body */}
        <div className="px-6 py-8">
          {/* Value proposition */}
          <div className="flex items-start gap-3 mb-6">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#3D8A80]/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px]" aria-hidden="true">⭐</span>
                </div>
                <span className="text-xs text-stone-600">Earn starrs with every order</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#3D8A80]/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px]" aria-hidden="true">🎁</span>
                </div>
                <span className="text-xs text-stone-600">Unlock free shakes and rewards</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#3D8A80]/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px]" aria-hidden="true">🚀</span>
                </div>
                <span className="text-xs text-stone-600">Get bonus points during promos</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-stone-700 mb-1.5"
              >
                Email <span className="text-[#3D8A80]">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl px-4 py-3 text-sm
                  bg-[#FAF8F5] border border-[#E8E3DA]
                  text-stone-800 placeholder:text-stone-400
                  focus:outline-none focus:ring-2 focus:ring-[#3D8A80]/40 focus:border-[#3D8A80]
                  transition-all"
              />
            </div>

            {/* Phone (optional) */}
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-stone-700 mb-1.5"
              >
                Phone{' '}
                <span className="text-stone-400 font-normal text-xs">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09XX XXX XXXX"
                className="w-full rounded-xl px-4 py-3 text-sm
                  bg-[#FAF8F5] border border-[#E8E3DA]
                  text-stone-800 placeholder:text-stone-400
                  focus:outline-none focus:ring-2 focus:ring-[#3D8A80]/40 focus:border-[#3D8A80]
                  transition-all"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3" role="alert">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full mt-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white
                bg-gradient-to-r from-[#3D8A80] to-[#5AAF9E]
                hover:opacity-90 active:scale-[0.98]
                disabled:opacity-60 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-[#3D8A80]/50 focus:ring-offset-2
                transition-all shadow-sm shadow-[#3D8A80]/20"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  Creating your card...
                </span>
              ) : (
                'Get My Starr Card'
              )}
            </button>

            <p className="text-[11px] text-stone-400 text-center mt-3 leading-relaxed">
              By registering, you agree to receive loyalty-related updates via Messenger.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
