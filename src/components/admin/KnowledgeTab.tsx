'use client';

import { useState, useCallback, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Upload,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  BookOpen,
} from 'lucide-react';
import { useKnowledge } from '@/hooks/useKnowledge';
import { deleteKnowledgeEntry, uploadDocument } from '@/actions/ai';
import type { KnowledgeRow } from '@/types';
import KnowledgeEntryForm from './KnowledgeEntryForm';

// ─── Constants ──────────────────────────────────────────────────────────────

const ADMIN_PAGE_SIZE = 20;

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'custom', label: 'Custom' },
  { value: 'knowledge_documents', label: 'Document' },
  { value: 'menu_items', label: 'Menu' },
  { value: 'branches', label: 'Branch' },
  { value: 'faq_entries', label: 'FAQ' },
  { value: 'categories', label: 'Category' },
  { value: 'bundles', label: 'Bundle' },
  { value: 'loyalty_tiers', label: 'Loyalty' },
  { value: 'site_settings', label: 'Settings' },
];

// ─── Badge helpers ──────────────────────────────────────────────────────────

function getSourceBadge(source: string) {
  const s = source.toLowerCase();
  if (s === 'custom' || s === 'knowledge_entries') {
    return { label: 'Custom', className: 'bg-[#f3e8ff] text-[#7c3aed]' };
  }
  if (s === 'knowledge_documents') {
    return { label: 'Document', className: 'bg-[#fef3c7] text-[#d97706]' };
  }
  // Map source table names to display labels
  const labelMap: Record<string, string> = {
    menu_items: 'Menu',
    branches: 'Branch',
    faq_entries: 'FAQ',
    categories: 'Category',
    bundles: 'Bundle',
    loyalty_tiers: 'Loyalty',
    site_settings: 'Settings',
  };
  return {
    label: labelMap[s] || source,
    className: 'bg-[#dbeafe] text-[#2563eb]',
  };
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
    case 'synced':
      return { label: status, className: 'bg-[#e0f7f4] text-[#2A9D8F]' };
    case 'inactive':
      return { label: 'inactive', className: 'bg-stone-100 text-stone-500' };
    case 'review':
      return { label: 'review', className: 'bg-amber-100 text-amber-700' };
    default:
      return { label: status, className: 'bg-stone-100 text-stone-500' };
  }
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return '--';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function isCustomSource(source: string): boolean {
  return source === 'custom' || source === 'knowledge_entries';
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function KnowledgeTab() {
  const router = useRouter();
  const { rows, loading, page, setPage, total, filters, setFilters, refetch } = useKnowledge();

  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<KnowledgeRow | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      setFilters((prev: Record<string, string | undefined>) => ({
        ...prev,
        [key]: value || undefined,
      }));
      setPage(0);
    },
    [setFilters, setPage]
  );

  function handleEdit(entry: KnowledgeRow) {
    setEditEntry(entry);
    setShowForm(true);
    setOpenMenu(null);
  }

  function handleDelete(id: string) {
    setOpenMenu(null);
    if (!confirm('Are you sure you want to delete this knowledge entry?')) return;
    deleteKnowledgeEntry(id).then(() => refetch());
  }

  function handleUpload() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    startUpload(async () => {
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadDocument(formData);
      if (result.success && result.data?.id) {
        router.push('/admin/ai/documents/' + result.data.id);
      }
    });

    // Reset input so the same file can be re-selected
    e.target.value = '';
  }

  // Skeleton rows
  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="animate-pulse">
      <td className="px-4 py-3.5">
        <div className="h-4 w-48 bg-[#E8E3DA] rounded mb-1.5" />
        <div className="h-3 w-64 bg-[#E8E3DA]/60 rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-5 w-16 bg-[#E8E3DA]/40 rounded-full" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-16 bg-[#E8E3DA]/60 rounded" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-5 w-14 bg-[#E8E3DA]/40 rounded-full" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-4 w-6 bg-[#E8E3DA]/60 rounded" />
      </td>
    </tr>
  ));

  return (
    <div className="space-y-6">
      {/* Filter Row */}
      <div className="bg-white rounded-xl border border-[#E8E3DA] p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Source filter */}
          <div className="relative">
            <select
              value={filters.source || ''}
              onChange={(e) => handleFilterChange('source', e.target.value)}
              className="appearance-none pl-3.5 pr-8 py-2 bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white cursor-pointer transition-all duration-200"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search knowledge..."
              className="w-full pl-9 pr-3.5 py-2 bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white transition-all duration-200"
            />
          </div>

          {/* Action buttons */}
          <button
            type="button"
            onClick={() => {
              setEditEntry(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#7BBFB5] text-white font-nunito font-semibold text-sm rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65] transition-all duration-200 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Entry
          </button>

          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-[#E8E3DA] text-stone-600 font-nunito text-sm rounded-[10px] hover:bg-[#F2EEE8] transition-all duration-200 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {isUploading ? 'Uploading...' : 'Upload Doc'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E3DA] bg-[#FAFAF8]">
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Content
                </th>
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Source
                </th>
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E3DA]">
              {loading && rows.length === 0 ? (
                skeletonRows
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <BookOpen className="h-12 w-12 text-[#E8E3DA] mx-auto mb-3" />
                    <p className="text-sm font-nunito text-stone-400">
                      {filters.source || filters.search
                        ? 'No entries match your filters'
                        : 'No knowledge entries yet. Add one to get started.'}
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const sourceBadge = getSourceBadge(row.source_table);
                  const statusBadge = getStatusBadge(row.status);
                  const isCustom = isCustomSource(row.source_table);

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[#F0EBE4] hover:bg-[#FAFAF8] transition-colors"
                    >
                      {/* Content */}
                      <td className="px-4 py-3.5 min-w-0 max-w-xs">
                        <p className="text-sm font-nunito font-medium text-stone-800 truncate">
                          {row.title || '--'}
                        </p>
                        <p className="text-xs font-nunito text-stone-400 truncate mt-0.5">
                          {truncateText(row.content, 80)}
                        </p>
                      </td>

                      {/* Source badge */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-nunito font-semibold ${sourceBadge.className}`}
                        >
                          {sourceBadge.label}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-nunito text-stone-600">
                          {row.category || '--'}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-nunito font-semibold capitalize ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setOpenMenu(openMenu === row.id ? null : row.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:bg-[#F2EEE8] hover:text-stone-600 transition-colors duration-200"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>

                          {openMenu === row.id && (
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-[#E8E3DA] shadow-lg z-20 py-1">
                              {isCustom ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(row)}
                                    className="w-full text-left px-3 py-2 text-sm font-nunito text-stone-700 hover:bg-[#F2EEE8] transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(row.id)}
                                    className="w-full text-left px-3 py-2 text-sm font-nunito text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <span className="block px-3 py-2 text-sm font-nunito text-stone-400">
                                  View in {sourceBadge.label}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
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
              {Math.min((page + 1) * ADMIN_PAGE_SIZE, total)} of {total} entries
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
        <KnowledgeEntryForm
          entry={editEntry}
          onClose={() => {
            setShowForm(false);
            setEditEntry(null);
          }}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
