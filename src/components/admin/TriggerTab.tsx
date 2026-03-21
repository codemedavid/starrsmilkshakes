'use client';

import { useState, useCallback, useTransition } from 'react';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Zap,
} from 'lucide-react';
import { useTriggers } from '@/hooks/useTriggers';
import { updateTrigger, deleteTrigger } from '@/actions/ai';
import type { ChatTrigger } from '@/types';
import TriggerForm from './TriggerForm';

// ─── Constants ──────────────────────────────────────────────────────────────

const ADMIN_PAGE_SIZE = 20;

const MATCH_TYPE_BADGE: Record<string, string> = {
  exact: 'bg-stone-100 text-stone-600',
  contains: 'bg-[#dbeafe] text-[#2563eb]',
  regex: 'bg-amber-100 text-amber-700',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function TriggerTab() {
  const { triggers, loading, page, setPage, total, filters, setFilters, refetch } = useTriggers();

  const [showForm, setShowForm] = useState(false);
  const [editTrigger, setEditTrigger] = useState<ChatTrigger | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [, startToggle] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  // Sort by priority DESC (client-side supplement; server may already sort)
  const sortedTriggers = [...triggers].sort((a, b) => b.priority - a.priority);

  const handleSearchChange = useCallback(
    (value: string) => {
      setFilters((prev: Record<string, string | undefined>) => ({
        ...prev,
        search: value || undefined,
      }));
      setPage(0);
    },
    [setFilters, setPage]
  );

  function handleEdit(t: ChatTrigger) {
    setEditTrigger(t);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this trigger?')) return;
    deleteTrigger(id).then(() => refetch());
  }

  function handleToggleActive(t: ChatTrigger) {
    setTogglingId(t.id);
    startToggle(async () => {
      await updateTrigger(t.id, {
        name: t.name,
        patterns: t.patterns,
        match_type: t.match_type,
        response: t.response,
        priority: t.priority,
        is_active: !t.is_active,
      });
      await refetch();
      setTogglingId(null);
    });
  }

  function renderPatterns(patterns: string[]) {
    const shown = patterns.slice(0, 3);
    const remaining = patterns.length - 3;
    return (
      <span className="text-sm font-nunito text-stone-600">
        {shown.join(', ')}
        {remaining > 0 && (
          <span className="text-stone-400 ml-1">+{remaining} more</span>
        )}
      </span>
    );
  }

  // Skeleton rows
  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="animate-pulse">
      <td className="px-4 py-3.5">
        <div className="h-4 w-32 bg-[#E8E3DA] rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-48 bg-[#E8E3DA]/60 rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-5 w-16 bg-[#E8E3DA]/40 rounded-full" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-8 bg-[#E8E3DA]/60 rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-5 w-10 bg-[#E8E3DA]/40 rounded-full" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-16 bg-[#E8E3DA]/60 rounded" />
      </td>
    </tr>
  ));

  return (
    <div className="space-y-6">
      {/* Filter Row */}
      <div className="bg-white rounded-xl border border-[#E8E3DA] p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={filters.search || ''}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search triggers..."
              className="w-full pl-9 pr-3.5 py-2 bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white transition-all duration-200"
            />
          </div>

          {/* Add Trigger */}
          <button
            type="button"
            onClick={() => {
              setEditTrigger(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#7BBFB5] text-white font-nunito font-semibold text-sm rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65] transition-all duration-200 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Trigger
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E3DA] bg-[#FAFAF8]">
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Patterns
                </th>
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Match Type
                </th>
                <th className="text-center px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Priority
                </th>
                <th className="text-center px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Active
                </th>
                <th className="text-right px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E3DA]">
              {loading && triggers.length === 0 ? (
                skeletonRows
              ) : triggers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Zap className="h-12 w-12 text-[#E8E3DA] mx-auto mb-3" />
                    <p className="text-sm font-nunito text-stone-400">
                      {filters.search
                        ? 'No triggers match your search'
                        : 'No triggers yet. Add one to get started.'}
                    </p>
                  </td>
                </tr>
              ) : (
                sortedTriggers.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-[#F0EBE4] hover:bg-[#FAFAF8] transition-colors"
                  >
                    {/* Name */}
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-nunito font-medium text-stone-800">
                        {t.name}
                      </p>
                    </td>

                    {/* Patterns */}
                    <td className="px-4 py-3.5 min-w-0 max-w-[300px]">
                      {renderPatterns(t.patterns)}
                    </td>

                    {/* Match Type badge */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-nunito font-semibold capitalize ${
                          MATCH_TYPE_BADGE[t.match_type] || 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {t.match_type}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-sm font-nunito font-medium text-stone-600">
                        {t.priority}
                      </span>
                    </td>

                    {/* Active toggle */}
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={t.is_active}
                        onChange={() => handleToggleActive(t)}
                        disabled={togglingId === t.id}
                        className="w-4 h-4 rounded border-stone-300 text-[#3D8A80] focus:ring-[#3D8A80] disabled:opacity-50 cursor-pointer"
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(t)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-[#F2EEE8] hover:text-stone-600 transition-colors duration-200"
                          aria-label="Edit trigger"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-200"
                          aria-label="Delete trigger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t border-[#E8E3DA]"
            aria-live="polite"
          >
            <span className="text-xs font-nunito text-stone-500">
              Showing {page * ADMIN_PAGE_SIZE + 1}--
              {Math.min((page + 1) * ADMIN_PAGE_SIZE, total)} of {total} triggers
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page <= 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:bg-[#F2EEE8] disabled:text-stone-300 disabled:hover:bg-transparent transition-colors duration-200"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs font-nunito font-medium text-stone-600">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:bg-[#F2EEE8] disabled:text-stone-300 disabled:hover:bg-transparent transition-colors duration-200"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <TriggerForm
          trigger={editTrigger}
          onClose={() => {
            setShowForm(false);
            setEditTrigger(null);
          }}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
