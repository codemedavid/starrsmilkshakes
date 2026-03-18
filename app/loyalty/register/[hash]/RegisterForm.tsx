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

      if (shouldPickGoal) {
        // Redirect to goal picker — use window.location for full navigation
        window.location.href = `/loyalty/card/${hash}/goals`;
        return;
      }

      setSuccess({ cardCode: card?.card_code ?? '' });
    });
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5] dark:bg-[#0d1117]">
        <div className="max-w-md w-full bg-white dark:bg-[#161b22] border border-[#E8E3DA] dark:border-[#2a3040] rounded-2xl overflow-hidden shadow-sm">
          {/* Gradient header */}
          <div className="bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] px-6 py-8 text-center">
            <div className="text-4xl mb-3">⭐</div>
            <h1 className="text-xl font-semibold text-white tracking-tight">
              Starr&apos;s Famous Shakes
            </h1>
            <p className="text-sm text-white/80 mt-1">Loyalty Card</p>
          </div>

          {/* Body */}
          <div className="px-6 py-8 text-center">
            <p className="text-stone-800 dark:text-[#e6e6e6] font-medium text-lg mb-2">
              You&apos;re in! Welcome to the club.
            </p>
            <p className="text-stone-500 dark:text-[#999] text-sm mb-6">
              Your loyalty card has been created.
            </p>

            {/* Card code */}
            <div className="bg-[#F8F6F3] dark:bg-[#1a1f2e] border border-[#E8E3DA] dark:border-[#2a3040] rounded-xl px-6 py-4 inline-block">
              <p className="text-xs text-stone-500 dark:text-[#999] mb-1 uppercase tracking-widest">
                Card Code
              </p>
              <p className="text-2xl font-semibold tracking-widest text-[#3D8A80] dark:text-[#7BBFB5]">
                {success.cardCode}
              </p>
            </div>

            <p className="text-stone-500 dark:text-[#999] text-sm mt-6">
              Open Messenger to view your card and start earning starrs.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration form ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5] dark:bg-[#0d1117]">
      <div className="max-w-md w-full bg-white dark:bg-[#161b22] border border-[#E8E3DA] dark:border-[#2a3040] rounded-2xl overflow-hidden shadow-sm">
        {/* Gradient header */}
        <div className="bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] px-6 py-8 text-center">
          <div className="text-4xl mb-3">⭐</div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            Starr&apos;s Famous Shakes
          </h1>
          <p className="text-sm text-white/80 mt-1">Loyalty Card</p>
        </div>

        {/* Form body */}
        <div className="px-6 py-8">
          <p className="text-stone-500 dark:text-[#999] text-sm text-center mb-6">
            Earn starrs with every order and unlock rewards.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-stone-800 dark:text-[#e6e6e6] mb-1.5"
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
                className="w-full rounded-lg px-4 py-2.5 text-sm
                  bg-[#F8F6F3] dark:bg-[#1a1f2e]
                  border border-[#E8E3DA] dark:border-[#2a3040]
                  text-stone-800 dark:text-[#e6e6e6]
                  placeholder:text-stone-400 dark:placeholder:text-[#555]
                  focus:outline-none focus:ring-2 focus:ring-[#3D8A80]/40 focus:border-[#3D8A80]
                  transition-colors"
              />
            </div>

            {/* Phone (optional) */}
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-stone-800 dark:text-[#e6e6e6] mb-1.5"
              >
                Phone{' '}
                <span className="text-stone-400 dark:text-[#555] font-normal">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09XX XXX XXXX"
                className="w-full rounded-lg px-4 py-2.5 text-sm
                  bg-[#F8F6F3] dark:bg-[#1a1f2e]
                  border border-[#E8E3DA] dark:border-[#2a3040]
                  text-stone-800 dark:text-[#e6e6e6]
                  placeholder:text-stone-400 dark:placeholder:text-[#555]
                  focus:outline-none focus:ring-2 focus:ring-[#3D8A80]/40 focus:border-[#3D8A80]
                  transition-colors"
              />
            </div>

            {/* Error message */}
            {error && (
              <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full mt-2 rounded-lg px-4 py-3 text-sm font-semibold text-white
                bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5]
                hover:opacity-90 active:opacity-80
                disabled:opacity-60 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-[#3D8A80]/50
                transition-opacity"
            >
              {isPending ? 'Creating your card…' : 'Get My Starr Card ⭐'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
