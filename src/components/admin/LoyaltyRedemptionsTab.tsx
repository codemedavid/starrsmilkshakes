'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Clock, X } from 'lucide-react';
import { getRedemptions } from '@/actions/loyalty-admin';
import { redeemReward } from '@/actions/loyalty';

type StatusFilter = 'all' | 'earned' | 'claimed' | 'expired';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'earned', label: 'Earned' },
  { key: 'claimed', label: 'Claimed' },
  { key: 'expired', label: 'Expired' },
];

function statusBadge(status: string) {
  switch (status) {
    case 'earned':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    case 'claimed':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle className="h-3 w-3" />
          Claimed
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
          <X className="h-3 w-3" />
          Expired
        </span>
      );
    default:
      return (
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-500">
          {status}
        </span>
      );
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface RedemptionCardProps {
  redemption: any;
  onMarkRedeemed: (id: string) => Promise<void>;
  redeeming: string | null;
}

function RedemptionCard({ redemption, onMarkRedeemed, redeeming }: RedemptionCardProps) {
  const customer = redemption.loyalty_cards?.customers;
  const rewardName = redemption.loyalty_rewards?.name ?? '—';
  const cardCode = redemption.loyalty_cards?.card_code ?? '—';
  const isRedeeming = redeeming === redemption.id;

  return (
    <div className="bg-white border border-[#E8E3DA] rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-stone-800 truncate">
              {customer?.name ?? 'Unknown Customer'}
            </p>
            <span className="text-xs text-stone-400 font-mono">{cardCode}</span>
          </div>
          {customer?.email && (
            <p className="text-xs text-stone-500 mt-0.5 truncate">{customer.email}</p>
          )}
        </div>
        {statusBadge(redemption.status)}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#7BBFB5]/10 text-[#3D8A80] border border-[#7BBFB5]/30">
          🎁 {rewardName}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-stone-500">
        <div>
          <span className="font-medium text-stone-600">Earned:</span>{' '}
          {formatDate(redemption.earned_at)}
        </div>
        <div>
          <span className="font-medium text-stone-600">Expires:</span>{' '}
          {formatDate(redemption.expires_at)}
        </div>
        {redemption.status === 'claimed' && (
          <>
            <div>
              <span className="font-medium text-stone-600">Claimed:</span>{' '}
              {formatDate(redemption.claimed_at)}
            </div>
            {redemption.claimed_by && (
              <div className="truncate">
                <span className="font-medium text-stone-600">By:</span>{' '}
                {redemption.claimed_by}
              </div>
            )}
          </>
        )}
      </div>

      {redemption.status === 'earned' && (
        <div className="pt-1 border-t border-[#F2EEE8]">
          <RedeemButton
            redemptionId={redemption.id}
            onMarkRedeemed={onMarkRedeemed}
            isRedeeming={isRedeeming}
          />
        </div>
      )}
    </div>
  );
}

interface RedeemButtonProps {
  redemptionId: string;
  onMarkRedeemed: (id: string) => Promise<void>;
  isRedeeming: boolean;
}

function RedeemButton({ redemptionId, onMarkRedeemed, isRedeeming }: RedeemButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onMarkRedeemed(redemptionId)}
      disabled={isRedeeming}
      className="bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#356E66] transition-colors disabled:opacity-50 w-full sm:w-auto"
    >
      {isRedeeming ? 'Marking…' : 'Mark Redeemed'}
    </button>
  );
}

export default function LoyaltyRedemptionsTab() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  // Branch ID for redemption — simplified as text input for now
  const [branchId, setBranchId] = useState('');

  const fetchRedemptions = useCallback(async (filter: StatusFilter) => {
    setLoading(true);
    setError(null);
    const result = await getRedemptions(filter === 'all' ? undefined : filter);
    if (result.success) {
      setRedemptions(result.data || []);
    } else {
      setError(result.error || 'Failed to load redemptions');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRedemptions(statusFilter);
  }, [statusFilter, fetchRedemptions]);

  const handleMarkRedeemed = useCallback(
    async (redemptionId: string) => {
      if (!branchId.trim()) {
        setRedeemError('Please enter a Branch ID before marking as redeemed.');
        return;
      }
      setRedeeming(redemptionId);
      setRedeemError(null);
      const result = await redeemReward(redemptionId, branchId.trim());
      if (result.success) {
        setRedeemSuccess(true);
        setTimeout(() => setRedeemSuccess(false), 3000);
        await fetchRedemptions(statusFilter);
      } else {
        setRedeemError(result.error || 'Failed to mark as redeemed');
      }
      setRedeeming(null);
    },
    [branchId, statusFilter, fetchRedemptions],
  );

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="font-nunito text-sm text-red-700 flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="text-red-400 hover:text-red-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Redeem error banner */}
      {redeemError && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="font-nunito text-sm text-red-700 flex-1">{redeemError}</p>
          <button
            type="button"
            onClick={() => setRedeemError(null)}
            aria-label="Dismiss error"
            className="text-red-400 hover:text-red-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Success banner */}
      {redeemSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="font-nunito text-sm text-emerald-700">Reward marked as redeemed.</p>
        </div>
      )}

      {/* Branch ID input (needed for redemption) */}
      <div className="flex items-center gap-3 bg-[#F8F6F3] border border-[#E8E3DA] rounded-xl px-4 py-3">
        <label className="text-xs font-nunito font-medium text-stone-500 whitespace-nowrap">
          Branch ID (for redemptions):
        </label>
        <input
          type="text"
          value={branchId}
          onChange={e => setBranchId(e.target.value)}
          placeholder="Enter branch UUID…"
          className="flex-1 bg-transparent text-sm text-stone-800 placeholder:text-stone-400 outline-none min-w-0"
        />
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`px-4 py-2 rounded-lg text-sm font-nunito font-medium transition-colors ${
              statusFilter === key
                ? 'bg-[#3D8A80] text-white'
                : 'bg-[#F8F6F3] border border-[#E8E3DA] text-stone-600 hover:bg-[#F2EEE8]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-stone-400">
          <p className="text-sm">Loading redemptions…</p>
        </div>
      ) : redemptions.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          <p className="text-sm">No redemptions found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {redemptions.map((r: any) => (
            <RedemptionCard
              key={r.id}
              redemption={r}
              onMarkRedeemed={handleMarkRedeemed}
              redeeming={redeeming}
            />
          ))}
        </div>
      )}
    </div>
  );
}
