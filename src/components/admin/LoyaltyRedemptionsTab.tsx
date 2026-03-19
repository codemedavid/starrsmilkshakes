'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Clock, Gift, RefreshCw, X } from 'lucide-react';
import { getRedemptions } from '@/actions/loyalty-admin';
import { redeemReward } from '@/actions/loyalty';

type StatusFilter = 'all' | 'earned' | 'claimed' | 'expired';

const STATUS_FILTERS: { key: StatusFilter; label: string; color?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'earned', label: 'Pending', color: 'text-amber-700' },
  { key: 'claimed', label: 'Claimed', color: 'text-emerald-700' },
  { key: 'expired', label: 'Expired', color: 'text-red-600' },
];

function statusBadge(status: string) {
  switch (status) {
    case 'earned':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-nunito">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    case 'claimed':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-nunito">
          <CheckCircle className="h-3 w-3" />
          Claimed
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-nunito">
          <X className="h-3 w-3" />
          Expired
        </span>
      );
    default:
      return (
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-500 font-nunito">
          {status}
        </span>
      );
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelative(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  return `in ${diffDays}d`;
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function RedemptionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white border border-[#E8E3DA] rounded-xl p-4 animate-pulse">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-stone-200 rounded w-40" />
              <div className="h-3 bg-stone-100 rounded w-24" />
            </div>
            <div className="h-6 w-16 bg-stone-100 rounded-full" />
          </div>
          <div className="mt-3 h-6 bg-stone-50 rounded-full w-32" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="h-3 bg-stone-100 rounded w-28" />
            <div className="h-3 bg-stone-100 rounded w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Redemption Card ──────────────────────────────────────────────────────────

interface RedemptionCardProps {
  redemption: any;
  onMarkRedeemed: (id: string) => Promise<void>;
  redeeming: string | null;
  branchId: string;
  onBranchIdNeeded: () => void;
}

function RedemptionCard({ redemption, onMarkRedeemed, redeeming, branchId, onBranchIdNeeded }: RedemptionCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const customer = redemption.loyalty_cards?.customers;
  const rewardName = redemption.loyalty_rewards?.name ?? '--';
  const cardCode = redemption.loyalty_cards?.card_code ?? '--';
  const isRedeeming = redeeming === redemption.id;
  const isPending = redemption.status === 'earned';

  const handleMarkRedeemed = () => {
    if (!branchId.trim()) {
      onBranchIdNeeded();
      return;
    }
    setShowConfirm(true);
  };

  const confirmRedeem = async () => {
    setShowConfirm(false);
    await onMarkRedeemed(redemption.id);
  };

  return (
    <div className={`bg-white border rounded-xl p-4 space-y-3 transition-all ${
      isPending ? 'border-amber-200 hover:shadow-sm' : 'border-[#E8E3DA]'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-stone-800 truncate font-nunito">
              {customer?.name ?? 'Unknown Customer'}
            </p>
            <span className="text-xs text-stone-400 font-mono">{cardCode}</span>
          </div>
          {customer?.email && (
            <p className="text-xs text-stone-500 mt-0.5 truncate font-nunito">{customer.email}</p>
          )}
        </div>
        {statusBadge(redemption.status)}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#7BBFB5]/10 text-[#3D8A80] border border-[#7BBFB5]/30 font-nunito">
          <Gift className="h-3 w-3" />
          {rewardName}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-stone-500 font-nunito">
        <div>
          <span className="font-medium text-stone-600">Earned:</span>{' '}
          {formatDate(redemption.earned_at)}
        </div>
        <div>
          <span className="font-medium text-stone-600">Expires:</span>{' '}
          {formatDate(redemption.expires_at)}
          {isPending && redemption.expires_at && (
            <span className="ml-1 text-amber-600 font-medium">
              ({formatRelative(redemption.expires_at)})
            </span>
          )}
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

      {isPending && !showConfirm && (
        <div className="pt-1 border-t border-[#F2EEE8]">
          <button
            type="button"
            onClick={handleMarkRedeemed}
            disabled={isRedeeming}
            className="bg-[#3D8A80] text-white px-4 py-2 rounded-lg text-sm font-medium font-nunito hover:bg-[#356E66] transition-colors disabled:opacity-50 w-full sm:w-auto"
          >
            {isRedeeming ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              'Mark Redeemed'
            )}
          </button>
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="pt-3 border-t border-[#E8E3DA] space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-xs font-nunito text-emerald-800 font-medium">
              Confirm redemption for {customer?.name ?? 'this customer'}?
            </p>
            <p className="text-xs font-nunito text-emerald-700 mt-1">
              Reward: <span className="font-semibold">{rewardName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="text-sm font-nunito text-stone-500 hover:text-stone-700 px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRedeem}
              disabled={isRedeeming}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium font-nunito hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {isRedeeming ? 'Processing...' : 'Confirm Redemption'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function LoyaltyRedemptionsTab() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [branchIdError, setBranchIdError] = useState(false);

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

  const handleRefresh = () => {
    fetchRedemptions(statusFilter);
  };

  const handleMarkRedeemed = useCallback(
    async (redemptionId: string) => {
      if (!branchId.trim()) {
        setRedeemError('Please enter a Branch ID before marking as redeemed.');
        setBranchIdError(true);
        return;
      }
      setRedeeming(redemptionId);
      setRedeemError(null);
      const result = await redeemReward(redemptionId, branchId.trim());
      if (result.success) {
        setRedeemSuccess(true);
        setTimeout(() => setRedeemSuccess(false), 4000);
        await fetchRedemptions(statusFilter);
      } else {
        setRedeemError(result.error || 'Failed to mark as redeemed');
      }
      setRedeeming(null);
    },
    [branchId, statusFilter, fetchRedemptions],
  );

  const handleBranchIdNeeded = useCallback(() => {
    setBranchIdError(true);
    setRedeemError('Please enter a Branch ID first.');
  }, []);

  const pendingCount = redemptions.filter(r => r.status === 'earned').length;

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
            onClick={() => { setRedeemError(null); setBranchIdError(false); }}
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
          <p className="font-nunito text-sm text-emerald-700">
            Reward redeemed successfully! The customer has been notified.
          </p>
        </div>
      )}

      {/* Branch ID input */}
      <div className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
        branchIdError
          ? 'bg-red-50 border-2 border-red-300'
          : 'bg-[#F8F6F3] border border-[#E8E3DA]'
      }`}>
        <label className="text-xs font-nunito font-medium text-stone-500 whitespace-nowrap">
          Branch ID:
        </label>
        <input
          type="text"
          value={branchId}
          onChange={e => { setBranchId(e.target.value); setBranchIdError(false); setRedeemError(null); }}
          placeholder="Enter branch UUID..."
          className="flex-1 bg-transparent text-sm text-stone-800 placeholder:text-stone-400 outline-none min-w-0 font-nunito"
        />
        {branchId && (
          <span className="text-[10px] font-nunito text-emerald-600 font-medium shrink-0">Set</span>
        )}
      </div>

      {/* Filter bar + refresh */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-4 py-2 rounded-lg text-sm font-nunito font-medium transition-colors ${
                statusFilter === key
                  ? 'bg-[#3D8A80] text-white shadow-sm'
                  : 'bg-[#F8F6F3] border border-[#E8E3DA] text-stone-600 hover:bg-[#F2EEE8]'
              }`}
            >
              {label}
              {key === 'earned' && pendingCount > 0 && statusFilter !== 'earned' && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="border border-[#E8E3DA] text-stone-500 p-2 rounded-lg hover:bg-[#F2EEE8] transition-colors disabled:opacity-50"
          aria-label="Refresh list"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <RedemptionSkeleton />
      ) : redemptions.length === 0 ? (
        <div className="text-center py-16 text-stone-400 bg-white border border-[#E8E3DA] rounded-xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 mb-3">
            <Gift className="h-5 w-5 text-stone-400" />
          </div>
          <p className="text-sm font-nunito font-medium text-stone-600">No redemptions found</p>
          <p className="text-xs font-nunito text-stone-400 mt-1">
            {statusFilter === 'all' ? 'No rewards have been earned yet' : `No ${statusFilter} redemptions`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-nunito text-stone-400">
            Showing {redemptions.length} {statusFilter === 'all' ? '' : statusFilter} redemption{redemptions.length !== 1 ? 's' : ''}
          </p>
          {redemptions.map((r: any) => (
            <RedemptionCard
              key={r.id}
              redemption={r}
              onMarkRedeemed={handleMarkRedeemed}
              redeeming={redeeming}
              branchId={branchId}
              onBranchIdNeeded={handleBranchIdNeeded}
            />
          ))}
        </div>
      )}
    </div>
  );
}
