'use client';

import type { CategoryBreakdown, ItemPerformanceRow } from '@/types/analytics';
import { getCategoryBreakdown } from '@/lib/analytics-engine';

interface Props {
  items: ItemPerformanceRow[];
  loading?: boolean;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="h-4 w-24 bg-stone-100 rounded flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-6 bg-stone-100 rounded" style={{ width: '70%' }} />
        <div className="h-3 bg-stone-100 rounded" style={{ width: '45%' }} />
      </div>
    </div>
  );
}

export default function AnalyticsCategoryChart({ items, loading = false }: Props) {
  const breakdown: CategoryBreakdown[] = loading ? [] : getCategoryBreakdown(items);
  const maxRevenue = Math.max(...breakdown.map((b) => b.total_revenue), 1);

  if (!loading && breakdown.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3DA] p-8 text-center text-stone-400 text-sm">
        No category data for this period
      </div>
    );
  }

  const sorted = [...breakdown].sort((a, b) => b.total_revenue - a.total_revenue);

  return (
    <div className="bg-white rounded-xl border border-[#E8E3DA] p-5">
      <h3 className="text-sm font-semibold text-stone-700 mb-5">Revenue by Category</h3>
      <div className="space-y-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          : sorted.map((cat) => (
              <div key={cat.category} className="flex items-center gap-3">
                <span className="text-sm text-stone-600 w-28 flex-shrink-0 truncate" title={cat.category}>
                  {cat.category || 'Uncategorized'}
                </span>
                <div className="flex-1 min-w-0">
                  {/* Revenue bar */}
                  <div className="flex items-center gap-2">
                    <div
                      className="h-6 bg-stone-800 rounded transition-all duration-500"
                      style={{ width: `${(cat.total_revenue / maxRevenue) * 100}%`, minWidth: '2px' }}
                    />
                    <span className="text-xs text-stone-500 whitespace-nowrap tabular-nums">
                      ₱{cat.total_revenue.toLocaleString()}
                    </span>
                  </div>
                  {/* Profit bar */}
                  {cat.total_profit !== null && cat.total_profit > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                      <div
                        className="h-3 bg-emerald-500/60 rounded transition-all duration-500"
                        style={{ width: `${(cat.total_profit / maxRevenue) * 100}%`, minWidth: '2px' }}
                      />
                      <span className="text-xs text-stone-400 whitespace-nowrap tabular-nums">
                        ₱{cat.total_profit.toLocaleString()} profit
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
      </div>

      {/* Legend */}
      {!loading && breakdown.length > 0 && (
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-[#E8E3DA]">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-stone-800" />
            <span className="text-xs text-stone-500">Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-emerald-500/60" />
            <span className="text-xs text-stone-500">Profit</span>
          </div>
        </div>
      )}
    </div>
  );
}
