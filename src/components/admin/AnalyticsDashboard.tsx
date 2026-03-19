'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, DollarSign, ShoppingCart, Percent, Award } from 'lucide-react';
import { getDashboardSummary, getItemPerformance, refreshPerformanceView } from '@/actions/analytics';
import type { DashboardSummary, ItemPerformanceRow, DateRange } from '@/types/analytics';
import AnalyticsItemTable from './AnalyticsItemTable';
import AnalyticsCategoryChart from './AnalyticsCategoryChart';

// ─── Period helpers ────────────────────────────────────────────────────────────

type PeriodKey = 'today' | '7d' | '30d';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Today',
  '7d': '7 Days',
  '30d': '30 Days',
};

function buildDateRange(period: PeriodKey): DateRange {
  const now = new Date();
  const to = now.toISOString();
  let from: string;

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    from = start.toISOString();
  } else if (period === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    from = start.toISOString();
  } else {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    from = start.toISOString();
  }

  return { from, to };
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  direction: 'up' | 'down' | 'flat';
  growthPercent: number;
  icon: React.ElementType;
  loading?: boolean;
}

function KpiCard({ label, value, subtitle, direction, growthPercent, icon: Icon, loading }: KpiCardProps) {
  const trendColor =
    direction === 'up' ? 'text-emerald-600' :
    direction === 'down' ? 'text-red-500' :
    'text-stone-400';

  const TrendIcon =
    direction === 'up' ? TrendingUp :
    direction === 'down' ? TrendingDown :
    Minus;

  return (
    <div className="bg-white border border-[#E8E3DA] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide">{label}</span>
        <div className="h-8 w-8 rounded-lg bg-[#F2EEE8] flex items-center justify-center">
          <Icon className="h-4 w-4 text-[#3D8A80]" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-7 w-28 bg-stone-100 rounded" />
          <div className="h-4 w-20 bg-stone-100 rounded" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-semibold text-stone-900 tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-stone-400 mt-0.5 truncate">{subtitle}</p>
          )}
          <div className={`flex items-center gap-1 mt-2 ${trendColor}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">
              {direction === 'flat' ? 'No change' : `${Math.abs(growthPercent).toFixed(1)}% vs prev period`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [items, setItems] = useState<ItemPerformanceRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: PeriodKey) => {
    setLoadingSummary(true);
    setLoadingItems(true);
    setError(null);
    const range = buildDateRange(p);

    const [summaryResult, itemsResult] = await Promise.all([
      getDashboardSummary(range),
      getItemPerformance({ date_from: range.from, date_to: range.to }),
    ]);

    if (!summaryResult.success) {
      setError(summaryResult.error ?? 'Failed to load analytics');
    } else {
      setSummary(summaryResult.data as DashboardSummary);
    }
    setLoadingSummary(false);

    if (itemsResult.success) {
      setItems(itemsResult.data as ItemPerformanceRow[]);
    }
    setLoadingItems(false);
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshPerformanceView();
    await fetchData(period);
    setRefreshing(false);
  };

  const kpiCards: KpiCardProps[] = [
    {
      label: 'Revenue',
      value: summary ? `₱${summary.total_revenue.toLocaleString()}` : '—',
      direction: summary?.trends.revenue.direction ?? 'flat',
      growthPercent: summary?.trends.revenue.growth_percent ?? 0,
      icon: DollarSign,
      loading: loadingSummary,
    },
    {
      label: 'Orders',
      value: summary ? summary.total_orders.toLocaleString() : '—',
      direction: summary?.trends.orders.direction ?? 'flat',
      growthPercent: summary?.trends.orders.growth_percent ?? 0,
      icon: ShoppingCart,
      loading: loadingSummary,
    },
    {
      label: 'Avg Margin',
      value: summary?.avg_margin_percent != null ? `${summary.avg_margin_percent.toFixed(1)}%` : '—',
      direction: summary?.trends.margin.direction ?? 'flat',
      growthPercent: summary?.trends.margin.growth_percent ?? 0,
      icon: Percent,
      loading: loadingSummary,
    },
    {
      label: 'Top Item',
      value: summary?.top_item?.name ?? '—',
      subtitle: summary?.top_item ? `₱${summary.top_item.revenue.toLocaleString()} revenue` : undefined,
      direction: 'flat',
      growthPercent: 0,
      icon: Award,
      loading: loadingSummary,
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">Analytics</h1>
            <p className="text-sm text-stone-500 mt-0.5">Sales performance &amp; item metrics</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="
              flex items-center gap-2 px-3 py-2 text-sm font-nunito font-medium
              border border-[#E8E3DA] rounded-lg bg-white text-stone-600
              hover:bg-[#F2EEE8] hover:text-stone-900
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200
            "
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 mb-6">
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`
                px-4 py-1.5 rounded-full text-sm font-nunito font-medium
                transition-all duration-200
                ${period === key
                  ? 'bg-stone-900 text-white'
                  : 'bg-white border border-[#E8E3DA] text-stone-600 hover:bg-[#F2EEE8]'
                }
              `}
            >
              {PERIOD_LABELS[key]}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {kpiCards.map((card) => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div>

        {/* Charts + Table */}
        <div className="space-y-6">
          <AnalyticsCategoryChart items={items} loading={loadingItems} />
          <AnalyticsItemTable items={items} loading={loadingItems} />
        </div>

      </div>
    </div>
  );
}
