'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Users,
  Loader2,
  X,
} from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import CustomerListItem from './CustomerListItem';
import CustomerDetailPanel from './CustomerDetailPanel';
import type { CustomerFilters } from '@/types/customer';

interface CustomerManagerProps {
  onBack: () => void;
}

const ITEMS_PER_PAGE = 20;

const formatCurrency = (amount: number): string => {
  return `P${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const CustomerManager: React.FC<CustomerManagerProps> = ({ onBack }) => {
  const { customers, total, loading, error, fetchCustomers, createCustomer, deleteCustomer } = useCustomers();

  // Search state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      if (search.length >= 2 || search.length === 0) {
        setDebouncedSearch(search);
        setPage(1);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [search]);

  // Fetch customers when filters change
  const doFetch = useCallback(() => {
    const filters: CustomerFilters = {
      page,
      limit: ITEMS_PER_PAGE,
    };
    if (debouncedSearch) filters.search = debouncedSearch;
    if (tagFilter) filters.tag = tagFilter;
    fetchCustomers(filters);
  }, [page, debouncedSearch, tagFilter, fetchCustomers]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  // Summary strip calculations
  const totalLtv = customers.reduce((sum, c) => sum + c.total_spent, 0);
  const atRiskCount = customers.filter(c => c.auto_tags.includes('At Risk')).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const showStart = total === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1;
  const showEnd = Math.min(page * ITEMS_PER_PAGE, total);

  // Pagination page numbers (show up to 5 pages around current)
  const getPageNumbers = (): number[] => {
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
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
  const handleDeleteCustomer = async (id: string) => {
    try {
      await deleteCustomer(id);
      if (selectedId === id) setSelectedId(null);
      doFetch();
    } catch {
      // handled silently
    }
  };

  // Close modal on Escape
  useEffect(() => {
    if (!showAddModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddModal(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAddModal]);

  // Loading skeleton rows
  const skeletonRows = Array.from({ length: 8 }).map((_, i) => (
    <div key={i} className="p-4 border-b border-[#E8E3DA] animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="h-4 w-32 bg-[#E8E3DA] rounded" />
          <div className="h-3 w-24 bg-[#E8E3DA]/60 rounded mt-2" />
          <div className="flex gap-1.5 mt-2">
            <div className="h-5 w-12 bg-[#E8E3DA]/40 rounded-full" />
            <div className="h-5 w-12 bg-[#E8E3DA]/40 rounded-full" />
            <div className="h-5 w-12 bg-[#E8E3DA]/40 rounded-full" />
          </div>
        </div>
        <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
      </div>
    </div>
  ));

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Topbar */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-stone-600 hover:text-stone-900 transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Dashboard</span>
            </button>
            <h1 className="text-2xl font-playfair font-semibold text-stone-900">
              Customer Management
            </h1>
            <div className="w-20" /> {/* Spacer for centering */}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Strip */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div
            className="bg-[#F2EEE8] rounded-xl p-4 border border-[#E8E3DA] transition-all duration-200 hover:shadow-sm"
            aria-label={`Total Customers: ${total}`}
          >
            <div className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wider mb-1">
              Total Customers
            </div>
            <div className="text-2xl font-nunito font-bold text-[#3D8A80] tabular-nums">
              {total}
            </div>
          </div>
          <div
            className="bg-[#F2EEE8] rounded-xl p-4 border border-[#E8E3DA] transition-all duration-200 hover:shadow-sm"
            aria-label={`Total LTV: ${formatCurrency(totalLtv)}`}
          >
            <div className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wider mb-1">
              Total LTV
            </div>
            <div className="text-2xl font-nunito font-bold text-[#3D8A80] tabular-nums">
              {formatCurrency(totalLtv)}
            </div>
          </div>
          <div
            className="bg-[#F2EEE8] rounded-xl p-4 border border-[#E8E3DA] transition-all duration-200 hover:shadow-sm"
            aria-label={`At Risk: ${atRiskCount}`}
          >
            <div className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wider mb-1">
              At Risk
            </div>
            <div className="text-2xl font-nunito font-bold text-red-600 tabular-nums">
              {atRiskCount}
            </div>
            {atRiskCount > 0 && (
              <div className="text-xs font-nunito text-red-500 mt-0.5">inactive &gt;30 days</div>
            )}
          </div>
        </div>

        {/* Split Pane */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Pane */}
          <div className="w-full lg:w-[40%] lg:min-w-[380px] flex flex-col">
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
                onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
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
                onClick={() => { setShowAddModal(true); setCreateError(null); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:ring-offset-2"
              >
                <UserPlus className="h-4 w-4" />
                Add Customer
              </button>
            </div>

            {/* Customer List */}
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
                      {debouncedSearch || tagFilter ? 'No customers match your filters' : 'No customers yet'}
                    </p>
                  </div>
                ) : (
                  customers.map((customer) => (
                    <CustomerListItem
                      key={customer.id}
                      customer={customer}
                      selected={selectedId === customer.id}
                      onClick={() => setSelectedId(customer.id)}
                    />
                  ))
                )}
              </div>

              {/* Pagination */}
              {total > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8E3DA]" aria-live="polite">
                  <span className="text-xs font-nunito text-stone-500">
                    Showing {showStart}-{showEnd} of {total}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:bg-[#F2EEE8] disabled:text-stone-300 disabled:hover:bg-transparent transition-colors duration-200"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {getPageNumbers().map(p => (
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
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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

          {/* Right Pane */}
          <div className="w-full lg:w-[60%] lg:min-w-[500px] lg:flex-1">
            <CustomerDetailPanel
              customerId={selectedId}
              onDelete={handleDeleteCustomer}
              onCustomerUpdated={doFetch}
            />
          </div>
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />

          {/* Modal card */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" role="dialog" aria-modal="true" aria-labelledby="add-customer-title">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[#E8E3DA]">
              <h2 id="add-customer-title" className="text-lg font-playfair font-semibold text-stone-900">
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
              {/* Name */}
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
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomer(); }}
                  autoFocus
                />
              </div>

              {/* Phone */}
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

              {/* Email */}
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

              {/* Notes */}
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

              {/* Error display */}
              {createError && (
                <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
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
                className="px-5 py-2.5 text-sm font-nunito font-semibold text-[#F0EBE0] bg-[#7BBFB5] rounded-[10px] shadow-sm hover:bg-[#3D8A80] active:bg-[#2C6E65] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerManager;
