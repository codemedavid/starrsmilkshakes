'use client';

import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react';
import type { ItemPerformanceRow } from '@/types/analytics';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'item_name' | 'category' | 'sell_price' | 'cost_price' | 'margin_percent' | 'total_quantity' | 'total_revenue' | 'gross_profit';
type SortDir = 'asc' | 'desc';

interface Props {
  items: ItemPerformanceRow[];
  loading?: boolean;
}

// ─── Margin badge ─────────────────────────────────────────────────────────────

function MarginBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-400">
        N/A
      </span>
    );
  }
  const className =
    value >= 60
      ? 'bg-emerald-100 text-emerald-700'
      : value >= 40
      ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-600';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {value.toFixed(1)}%
    </span>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-stone-300" />;
  return dir === 'asc'
    ? <ChevronUp className="h-3.5 w-3.5 text-stone-700" />
    : <ChevronDown className="h-3.5 w-3.5 text-stone-700" />;
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'item_name', label: 'Item', align: 'left' },
  { key: 'category', label: 'Category', align: 'left' },
  { key: 'sell_price', label: 'Sell Price', align: 'right' },
  { key: 'cost_price', label: 'Cost', align: 'right' },
  { key: 'margin_percent', label: 'Margin', align: 'right' },
  { key: 'total_quantity', label: 'Qty Sold', align: 'right' },
  { key: 'total_revenue', label: 'Revenue', align: 'right' },
  { key: 'gross_profit', label: 'Profit', align: 'right' },
];

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-t border-[#E8E3DA] animate-pulse">
      {COLUMNS.map((col) => (
        <td key={col.key} className="px-4 py-3">
          <div className="h-4 bg-stone-100 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

export default function AnalyticsItemTable({ items, loading = false }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total_revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? items.filter(
          (i) =>
            i.item_name.toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q),
        )
      : items;

    return [...base].sort((a, b) => {
      const va = a[sortKey] as number | string | null;
      const vb = b[sortKey] as number | string | null;

      if (va === null && vb === null) return 0;
      if (va === null) return sortDir === 'asc' ? -1 : 1;
      if (vb === null) return sortDir === 'asc' ? 1 : -1;

      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }

      return sortDir === 'asc'
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number);
    });
  }, [items, search, sortKey, sortDir]);

  const formatCurrency = (v: number | null) =>
    v !== null ? `₱${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  return (
    <div className="bg-white border border-[#E8E3DA] rounded-xl overflow-hidden">
      {/* Table header bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E3DA]">
        <h3 className="text-sm font-semibold text-stone-700 flex-1">Item Performance</h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              pl-8 pr-3 py-1.5 text-sm border border-[#E8E3DA] rounded-lg
              bg-[#FAF8F5] text-stone-700 placeholder:text-stone-400
              focus:outline-none focus:ring-2 focus:ring-[#7BBFB5] focus:border-transparent
              w-48
            "
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#FAF8F5]">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`
                    px-4 py-2.5 text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide
                    cursor-pointer select-none hover:text-stone-700 transition-colors
                    ${col.align === 'right' ? 'text-right' : 'text-left'}
                  `}
                >
                  <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                    {col.label}
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-stone-400 text-sm">
                  {search ? `No items matching "${search}"` : 'No item data for this period'}
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr
                  key={item.menu_item_id}
                  className="border-t border-[#E8E3DA] hover:bg-[#FAF8F5] transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-stone-800 max-w-[180px] truncate">
                    {item.item_name}
                  </td>
                  <td className="px-4 py-3 text-stone-500">
                    {item.category || '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-700 tabular-nums">
                    {formatCurrency(item.sell_price)}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-500 tabular-nums">
                    {formatCurrency(item.cost_price)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MarginBadge value={item.margin_percent} />
                  </td>
                  <td className="px-4 py-3 text-right text-stone-700 tabular-nums">
                    {item.total_quantity.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-700 tabular-nums font-medium">
                    {formatCurrency(item.total_revenue)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={item.gross_profit !== null && item.gross_profit >= 0 ? 'text-emerald-600' : 'text-stone-500'}>
                      {formatCurrency(item.gross_profit)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <div className="px-4 py-2.5 border-t border-[#E8E3DA] text-xs text-stone-400">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          {search && items.length !== filtered.length ? ` of ${items.length}` : ''}
        </div>
      )}
    </div>
  );
}
