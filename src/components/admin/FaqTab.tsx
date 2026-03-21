'use client';

import { useState, useCallback, useTransition } from 'react';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  HelpCircle,
} from 'lucide-react';
import { useFaqs } from '@/hooks/useFaqs';
import { updateFaqEntry, deleteFaqEntry } from '@/actions/ai';
import type { FaqEntry } from '@/types';
import FaqForm from './FaqForm';

// ─── Constants ──────────────────────────────────────────────────────────────

const ADMIN_PAGE_SIZE = 20;

function truncateText(text: string, maxLength: number): string {
  if (!text) return '--';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FaqTab() {
  const { faqs, loading, page, setPage, total, filters, setFilters, refetch } = useFaqs();

  const [showForm, setShowForm] = useState(false);
  const [editFaq, setEditFaq] = useState<FaqEntry | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [, startToggle] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

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

  function handleEdit(faq: FaqEntry) {
    setEditFaq(faq);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this FAQ?')) return;
    deleteFaqEntry(id).then(() => refetch());
  }

  function handleToggleActive(faq: FaqEntry) {
    setTogglingId(faq.id);
    startToggle(async () => {
      await updateFaqEntry(faq.id, {
        question: faq.question,
        answer: faq.answer,
        category: faq.category || undefined,
      });
      await refetch();
      setTogglingId(null);
    });
  }

  // Skeleton rows
  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="animate-pulse">
      <td className="px-4 py-3.5">
        <div className="h-4 w-48 bg-[#E8E3DA] rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-64 bg-[#E8E3DA]/60 rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-16 bg-[#E8E3DA]/60 rounded" />
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
              placeholder="Search FAQs..."
              className="w-full pl-9 pr-3.5 py-2 bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white transition-all duration-200"
            />
          </div>

          {/* Add FAQ */}
          <button
            type="button"
            onClick={() => {
              setEditFaq(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#7BBFB5] text-white font-nunito font-semibold text-sm rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65] transition-all duration-200 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add FAQ
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
                  Question
                </th>
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Answer
                </th>
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Category
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
              {loading && faqs.length === 0 ? (
                skeletonRows
              ) : faqs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <HelpCircle className="h-12 w-12 text-[#E8E3DA] mx-auto mb-3" />
                    <p className="text-sm font-nunito text-stone-400">
                      {filters.search
                        ? 'No FAQs match your search'
                        : 'No FAQs yet. Add one to get started.'}
                    </p>
                  </td>
                </tr>
              ) : (
                faqs.map((faq: FaqEntry) => (
                  <tr
                    key={faq.id}
                    className="border-b border-[#F0EBE4] hover:bg-[#FAFAF8] transition-colors"
                  >
                    {/* Question */}
                    <td className="px-4 py-3.5 min-w-0 max-w-[240px]">
                      <p className="text-sm font-nunito font-medium text-stone-800 truncate">
                        {truncateText(faq.question, 60)}
                      </p>
                    </td>

                    {/* Answer */}
                    <td className="px-4 py-3.5 min-w-0 max-w-[320px]">
                      <p className="text-sm font-nunito text-stone-600 truncate">
                        {truncateText(faq.answer, 80)}
                      </p>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-nunito text-stone-600">
                        {faq.category || '--'}
                      </span>
                    </td>

                    {/* Active toggle */}
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={faq.is_active}
                        onChange={() => handleToggleActive(faq)}
                        disabled={togglingId === faq.id}
                        className="w-4 h-4 rounded border-stone-300 text-[#3D8A80] focus:ring-[#3D8A80] disabled:opacity-50 cursor-pointer"
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(faq)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-[#F2EEE8] hover:text-stone-600 transition-colors duration-200"
                          aria-label="Edit FAQ"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(faq.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-500 transition-colors duration-200"
                          aria-label="Delete FAQ"
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
              {Math.min((page + 1) * ADMIN_PAGE_SIZE, total)} of {total} FAQs
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
        <FaqForm
          faq={editFaq}
          onClose={() => {
            setShowForm(false);
            setEditFaq(null);
          }}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
