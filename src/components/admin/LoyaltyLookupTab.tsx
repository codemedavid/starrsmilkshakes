'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, CreditCard, Gift, Search, X } from 'lucide-react';
import { useLoyaltyLookup } from '@/hooks/useLoyaltyLookup';

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function LookupSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map(i => (
        <div key={i} className="bg-white border border-[#E8E3DA] rounded-xl p-4 animate-pulse space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-stone-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-stone-200 rounded w-36" />
              <div className="h-3 bg-stone-100 rounded w-48" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-6 w-20 bg-stone-100 rounded-full" />
            <div className="h-6 w-20 bg-stone-100 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, goal, color }: { current: number; goal: number; color: string }) {
  const pct = Math.min((current / goal) * 100, 100);
  return (
    <div className="relative h-2 bg-stone-100 rounded-full overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

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
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

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
      setRedeemSuccess(true);
      setTimeout(() => setRedeemSuccess(false), 3000);
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
      setOrderSuccess(true);
      setTimeout(() => setOrderSuccess(false), 3000);
    }
    setOrderLoading(false);
  };

  return (
    <div className="bg-white border-2 border-[#7BBFB5] rounded-xl overflow-hidden shadow-sm">
      {/* Customer header */}
      <div className="p-4 pb-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[#3D8A80] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 font-nunito">
            {initials(card.customer_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-stone-800 truncate font-nunito">
              {card.customer_name ?? 'Unknown Customer'}
            </p>
            {card.customer_email && (
              <p className="text-xs text-stone-500 truncate font-nunito">{card.customer_email}</p>
            )}
          </div>
          <span className="text-xs font-mono text-stone-400 shrink-0 bg-stone-50 px-2 py-1 rounded-lg">{card.card_code}</span>
        </div>
      </div>

      {/* Progress section */}
      <div className="p-4 space-y-3">
        {/* Stamps progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium font-nunito text-amber-700">Stamps</span>
            <span className="text-xs font-medium font-nunito text-stone-600">
              {currentStamps}{stampsGoal != null ? `/${stampsGoal}` : ''}
            </span>
          </div>
          {stampsGoal != null && (
            <ProgressBar current={currentStamps} goal={stampsGoal} color="bg-amber-400" />
          )}
        </div>

        {/* Points progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium font-nunito text-purple-700">Points</span>
            <span className="text-xs font-medium font-nunito text-stone-600">
              {currentPoints}{pointsGoal != null ? `/${pointsGoal}` : ''}
            </span>
          </div>
          {pointsGoal != null && (
            <ProgressBar current={currentPoints} goal={pointsGoal} color="bg-purple-400" />
          )}
        </div>

        {goal && (
          <p className="text-xs text-stone-500 font-nunito flex items-center gap-1.5">
            <Gift className="h-3 w-3 text-[#3D8A80]" />
            Goal: <span className="font-medium text-stone-700">{goal.name}</span>
          </p>
        )}
      </div>

      {/* Pending redemptions */}
      {pendingRedemptions.length > 0 && (
        <div className="mx-4 mb-4 bg-[#7BBFB5]/10 border border-[#7BBFB5]/30 rounded-lg p-3 space-y-3">
          <p className="text-xs font-nunito font-semibold text-[#3D8A80] uppercase tracking-wide">
            Pending Rewards ({pendingRedemptions.length})
          </p>

          {redeemSuccess && (
            <div className="flex items-center gap-2 text-xs font-nunito text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              <CheckCircle className="h-3.5 w-3.5" />
              Reward redeemed successfully!
            </div>
          )}

          {pendingRedemptions.map((r: any) => (
            <div key={r.id} className="space-y-2">
              <p className="text-sm font-medium text-stone-700 font-nunito flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5 text-[#3D8A80]" />
                {r.reward_name ?? r.reward_id}
              </p>

              {redeemError && (
                <div className="flex items-center gap-2 text-xs text-red-600 font-nunito">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {redeemError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={branchId}
                  onChange={e => { setBranchId(e.target.value); setRedeemError(null); }}
                  placeholder="Branch ID (UUID)..."
                  className="flex-1 bg-white border border-[#E8E3DA] rounded-lg px-3 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none min-w-0 font-nunito"
                />
                <button
                  type="button"
                  onClick={() => handleRedeem(r.id)}
                  disabled={redeemLoading}
                  className="bg-[#3D8A80] text-white px-3 py-1.5 rounded-lg text-xs font-medium font-nunito hover:bg-[#356E66] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {redeemLoading ? 'Processing...' : 'Redeem'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order credit */}
      <div className="mx-4 mb-4 space-y-2">
        <p className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide">
          Credit a Walk-In Order
        </p>

        {orderSuccess && (
          <div className="flex items-center gap-2 text-xs font-nunito text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
            <CheckCircle className="h-3.5 w-3.5" />
            Order credited successfully!
          </div>
        )}

        {orderError && (
          <div className="flex items-center gap-2 text-xs text-red-600 font-nunito">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {orderError}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={orderId}
            onChange={e => { setOrderId(e.target.value); setOrderError(null); }}
            placeholder="Enter order UUID..."
            className="flex-1 bg-[#F8F6F3] border border-[#E8E3DA] rounded-lg px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none min-w-0 font-nunito"
          />
          <button
            type="button"
            onClick={handleCreditOrder}
            disabled={orderLoading}
            className="bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium font-nunito hover:bg-[#356E66] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {orderLoading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Crediting...
              </span>
            ) : (
              'Credit Order'
            )}
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
          placeholder="Search by name, email, phone, or card code..."
          className="w-full bg-[#F8F6F3] border border-[#E8E3DA] rounded-xl pl-10 pr-10 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent outline-none font-nunito"
          autoFocus
        />
        {query && (
          <button
            type="button"
            onClick={() => { handleChange(''); setHasSearched(false); }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors p-1"
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
      {searching && <LookupSkeleton />}

      {/* Results */}
      {!searching && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-nunito text-stone-400">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </p>
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
        <div className="text-center py-16 text-stone-400 bg-white border border-[#E8E3DA] rounded-xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 mb-3">
            <Search className="h-5 w-5 text-stone-400" />
          </div>
          <p className="text-sm font-nunito font-medium text-stone-600">No results for &ldquo;{query}&rdquo;</p>
          <p className="text-xs font-nunito text-stone-400 mt-1">Try a different name, email, or card code</p>
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="text-center py-16 text-stone-400 bg-white border border-[#E8E3DA] rounded-xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#7BBFB5]/10 mb-3">
            <CreditCard className="h-5 w-5 text-[#3D8A80]" />
          </div>
          <p className="text-sm font-nunito font-medium text-stone-600">Customer Lookup</p>
          <p className="text-xs font-nunito text-stone-400 mt-1">
            Search for a customer to view their loyalty card, redeem rewards, or credit orders
          </p>
        </div>
      )}
    </div>
  );
}
