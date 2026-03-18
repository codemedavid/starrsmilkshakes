'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Search, X } from 'lucide-react';
import { useLoyaltyLookup } from '@/hooks/useLoyaltyLookup';

// ─── Customer Card ─────────────────────────────────────────────────────────────

interface LookupCardProps {
  card: any;
  onRedeem: (redemptionId: string, branchId: string) => Promise<{ success: boolean; error?: string }>;
  onCreditOrder: (orderId: string, cardId: string) => Promise<{ success: boolean; error?: string }>;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function LookupCard({ card, onRedeem, onCreditOrder }: LookupCardProps) {
  const [branchId, setBranchId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);

  const goal = card.goal_reward as any | null;
  const stampsGoal = goal?.stamps_required ?? null;
  const pointsGoal = goal?.points_required ?? null;
  const currentStamps: number = card.current_stamps ?? 0;
  const currentPoints: number = card.current_points ?? 0;

  const pendingRedemptions: any[] = card.pending_redemptions ?? [];

  const handleRedeem = async (redemptionId: string) => {
    if (!branchId.trim()) {
      setRedeemError('Please enter a Branch ID.');
      return;
    }
    setRedeemLoading(true);
    setRedeemError(null);
    const result = await onRedeem(redemptionId, branchId.trim());
    if (!result.success) {
      setRedeemError(result.error || 'Failed to redeem');
    } else {
      setBranchId('');
    }
    setRedeemLoading(false);
  };

  const handleCreditOrder = async () => {
    if (!orderId.trim()) {
      setOrderError('Please enter an order number.');
      return;
    }
    setOrderLoading(true);
    setOrderError(null);
    const result = await onCreditOrder(orderId.trim(), card.id);
    if (!result.success) {
      setOrderError(result.error || 'Failed to credit order');
    } else {
      setOrderId('');
    }
    setOrderLoading(false);
  };

  return (
    <div className="bg-white border-2 border-[#7BBFB5] rounded-xl p-4 space-y-4">
      {/* Customer header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-[#3D8A80] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
          {initials(card.customer_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-stone-800 truncate">
            {card.customer_name ?? 'Unknown Customer'}
          </p>
          {card.customer_email && (
            <p className="text-xs text-stone-500 truncate">{card.customer_email}</p>
          )}
        </div>
        <span className="text-xs font-mono text-stone-400 shrink-0">{card.card_code}</span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 flex-wrap">
        {stampsGoal != null ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
            {currentStamps}/{stampsGoal} ⭐
          </span>
        ) : (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
            {currentStamps} ⭐
          </span>
        )}
        {pointsGoal != null ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
            {currentPoints}/{pointsGoal} pts
          </span>
        ) : (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
            {currentPoints} pts
          </span>
        )}
        {goal && (
          <span className="text-xs text-stone-500 truncate">
            Goal: {goal.name}
          </span>
        )}
      </div>

      {/* Pending redemptions */}
      {pendingRedemptions.length > 0 && (
        <div className="bg-[#7BBFB5]/10 border border-[#7BBFB5]/30 rounded-lg p-3 space-y-3">
          {pendingRedemptions.map((r: any) => (
            <div key={r.id} className="space-y-2">
              <p className="text-sm font-medium text-stone-700">
                🎁 Has pending reward:{' '}
                <span className="text-[#3D8A80]">{r.reward_id}</span>
              </p>

              {redeemError && (
                <div className="flex items-center gap-2 text-xs text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {redeemError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={branchId}
                  onChange={e => setBranchId(e.target.value)}
                  placeholder="Branch ID (UUID)…"
                  className="flex-1 bg-white border border-[#E8E3DA] rounded-lg px-3 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none min-w-0"
                />
                <button
                  type="button"
                  onClick={() => handleRedeem(r.id)}
                  disabled={redeemLoading}
                  className="bg-[#3D8A80] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#356E66] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {redeemLoading ? 'Marking…' : 'Mark Redeemed'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order credit */}
      <div className="space-y-2">
        <p className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide">
          Credit a Walk-In Order
        </p>

        {orderError && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {orderError}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={orderId}
            onChange={e => setOrderId(e.target.value)}
            placeholder="Enter order UUID…"
            className="flex-1 bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none min-w-0"
          />
          <button
            type="button"
            onClick={handleCreditOrder}
            disabled={orderLoading}
            className="bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {orderLoading ? 'Crediting…' : 'Credit Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function LoyaltyLookupTab() {
  const { query, setQuery, results, search, searching, error, redeem, creditOrder } =
    useLoyaltyLookup();

  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value.length >= 2) {
        setHasSearched(true);
        await search(value);
      } else {
        setHasSearched(false);
      }
    }, 400);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const showNoResults = hasSearched && !searching && results.length === 0 && query.length >= 2;
  const showEmpty = !hasSearched && results.length === 0;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Search name, email, phone, or enter card code…"
          className="w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-xl pl-10 pr-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => { handleChange(''); setHasSearched(false); }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="font-nunito text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Searching indicator */}
      {searching && (
        <p className="text-sm text-stone-400 text-center py-4">Searching…</p>
      )}

      {/* Results */}
      {!searching && results.length > 0 && (
        <div className="space-y-3">
          {results.map((card: any) => (
            <LookupCard
              key={card.id}
              card={card}
              onRedeem={redeem}
              onCreditOrder={creditOrder}
            />
          ))}
        </div>
      )}

      {/* No results */}
      {showNoResults && (
        <div className="text-center py-12 text-stone-400">
          <p className="text-sm">No loyalty cards found for &ldquo;{query}&rdquo;</p>
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="text-center py-12 text-stone-400">
          <p className="text-sm">Search for a customer to view their loyalty card</p>
        </div>
      )}
    </div>
  );
}
