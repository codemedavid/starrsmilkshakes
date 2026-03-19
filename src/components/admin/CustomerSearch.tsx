'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Users,
  Loader2,
  X,
  Check,
} from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import CustomerListItem from '@/components/CustomerListItem';
import type { CustomerFilters } from '@/types/customer';

export interface CustomerStats {
  total: number;
  totalLtv: number;
  atRiskCount: number;
}

interface CustomerSearchProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatsChange?: (stats: CustomerStats) => void;
  onCustomerDeleted?: (id: string) => void;
  initialCustomers?: import('@/types/customer').CustomerSummary[];
  initialTotal?: number;
}

const ITEMS_PER_PAGE = 20;

export default function CustomerSearch({
  selectedId,
  onSelect,
  onStatsChange,
  onCustomerDeleted,
  initialCustomers,
  initialTotal,
}: CustomerSearchProps) {
  const { customers, total, loading, error, fetchCustomers, createCustomer, deleteCustomer } =
    useCustomers({ initialCustomers, initialTotal });

  // Search state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);

  // Add customer modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search: 300ms, min 2 chars or empty
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (search.length >= 2 || search.length === 0) {
        setDebouncedSearch(search);
        setPage(1);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // Fetch customers when filters change
  const doFetch = useCallback(() => {
    const filters: CustomerFilters = { page, limit: ITEMS_PER_PAGE };
    if (debouncedSearch) filters.search = debouncedSearch;
    if (tagFilter) filters.tag = tagFilter;
    fetchCustomers(filters);
  }, [page, debouncedSearch, tagFilter, fetchCustomers]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  // Derive stats from current page and bubble up
  useEffect(() => {
    const totalLtv = customers.reduce((sum, c) => sum + c.total_spent, 0);
    const atRiskCount = customers.filter((c) => c.auto_tags.includes('At Risk')).length;
    onStatsChange?.({ total, totalLtv, atRiskCount });
  }, [customers, total, onStatsChange]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const showStart = total === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1;
  const showEnd = Math.min(page * ITEMS_PER_PAGE, total);

  const getPageNumbers = (): number[] => {
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  // Add customer
  const handleAddCustomer = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await createCustomer({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        email: newEmail.trim() || undefined,
        notes: newNotes.trim() || undefined,
      });
      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewNotes('');
      doFetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setIsCreating(false);
    }
  };

  // Delete customer
  const handleDeleteCustomer = useCallback(
    async (id: string) => {
      try {
        await deleteCustomer(id);
        onCustomerDeleted?.(id);
        doFetch();
      } catch {
        // handled silently
      }
    },
    [deleteCustomer, doFetch, onCustomerDeleted],
  );

  // Close modal on Escape
  useEffect(() => {
    if (!showAddModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddModal(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAddModal]);

  // Skeleton rows while loading
  const skeletonRows = Array.from({ length: 8 }).map((_, i) => (
    <div key={i} className="p-4 border-b border-[#E8E3DA] animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="h-4 w-32 bg-[#E8E3DA] rounded" />
          <div className="h-3 w-24 bg-[#E8E3DA]/60 rounded mt-2" />
          <div className="flex gap-1.5 mt-2">
            <div className="h-5 w-12 bg-[#E8E3DA]/40 rounded-full" />
            <div className="h-5 w-12 bg-[#E8E3DA]/40 rounded-full" />
          </div>
        </div>
        <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
      </div>
    </div>
  ));

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Search input */}
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="w-full pl-10 pr-10 py-2.5 bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white transition-all duration-200"
          />
          {loading && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 animate-spin" />
          )}
        </div>

        {/* Tag filter */}
        <div className="relative mb-4">
          <select
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3.5 py-2.5 bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] focus:bg-white appearance-none cursor-pointer transition-all duration-200"
          >
            <option value="">All Tags</option>
            <option value="VIP">VIP</option>
            <option value="Loyal">Loyal</option>
            <option value="New">New</option>
            <option value="At Risk">At Risk</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
        </div>

        {/* Add Customer button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => {
              setShowAddModal(true);
              setCreateError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2"
          >
            <UserPlus className="h-4 w-4" />
            Add Customer
          </button>
        </div>

        {/* Customer list card */}
        <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden flex-1">
          <div className="max-h-[calc(100vh-420px)] overflow-y-auto">
            {error && (
              <div className="p-4 text-center">
                <p className="text-sm font-nunito text-red-600">{error}</p>
              </div>
            )}

            {loading && customers.length === 0 ? (
              skeletonRows
            ) : customers.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="h-12 w-12 text-[#E8E3DA] mx-auto mb-3" />
                <p className="text-sm font-nunito text-stone-400">
                  {debouncedSearch || tagFilter
                    ? 'No customers match your filters'
                    : 'No customers yet'}
                </p>
              </div>
            ) : (
              customers.map((customer) => (
                <CustomerListItem
                  key={customer.id}
                  customer={customer}
                  selected={selectedId === customer.id}
                  onClick={() => onSelect(customer.id)}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div
              className="flex items-center justify-between px-4 py-3 border-t border-[#E8E3DA]"
              aria-live="polite"
            >
              <span className="text-xs font-nunito text-stone-500">
                Showing {showStart}–{showEnd} of {total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:bg-[#F2EEE8] disabled:text-stone-300 disabled:hover:bg-transparent transition-colors duration-200"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {getPageNumbers().map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-nunito transition-colors duration-200 ${
                      p === page
                        ? 'font-semibold bg-[#7BBFB5] text-[#F0EBE0]'
                        : 'font-medium text-stone-600 hover:bg-[#F2EEE8]'
                    }`}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:bg-[#F2EEE8] disabled:text-stone-300 disabled:hover:bg-transparent transition-colors duration-200"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
            aria-hidden="true"
          />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-customer-title"
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[#E8E3DA]">
              <h2
                id="add-customer-title"
                className="text-lg font-playfair font-semibold text-stone-900"
              >
                Add New Customer
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="absolute top-4 right-4 p-2 rounded-lg text-stone-400 hover:bg-[#F2EEE8] hover:text-stone-600 transition-all duration-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] transition-all duration-200"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCustomer();
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="09XX XXX XXXX"
                  className="w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] transition-all duration-200"
                />
                <p className="text-xs font-nunito text-stone-400 mt-1">
                  Used for order matching and deduplication
                </p>
              </div>

              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] transition-all duration-200"
                />
              </div>

              <div>
                <label className="block text-sm font-nunito font-medium text-stone-700 mb-1.5">
                  Notes
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={3}
                  placeholder="Any notes about this customer..."
                  className="w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] transition-all duration-200 resize-none"
                />
              </div>

              {createError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-nunito text-red-700">{createError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 text-sm font-nunito font-medium text-stone-600 bg-[#F2EEE8] rounded-[10px] hover:bg-[#E8E3DA] transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomer}
                disabled={isCreating || !newName.trim()}
                className="px-5 py-2.5 text-sm font-nunito font-semibold text-[#F0EBE0] bg-[#7BBFB5] rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 inline-flex items-center gap-2"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Add Customer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
