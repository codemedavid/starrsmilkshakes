'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User,
  UserPlus,
  X,
  Loader2,
  Sparkles,
  MessageCircle,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import type { CustomerSummary } from '@/types/customer';
import { linkCustomer as linkCustomerAction, unlinkCustomer as unlinkCustomerAction } from '@/actions/customers';

const LINK_REASONS = ['Phone match', 'Messenger match', 'Manual identification', 'Other'] as const;
const UNLINK_REASONS = ['Incorrect match', 'Customer request', 'Duplicate resolution', 'Other'] as const;

type LinkReason = typeof LINK_REASONS[number];
type UnlinkReason = typeof UNLINK_REASONS[number];

interface CustomerLinkWidgetProps {
  /** The order object that may have customer_id and contact_number */
  order: {
    id: string;
    contact_number: string;
    customer_id?: string | null;
    customer_name?: string;
    messenger_psid?: string | null;
    messenger_name?: string | null;
    linked_customer_name?: string | null;
    status?: string;
  };
  /** Called after a customer is linked/unlinked to refresh the order list */
  onUpdate?: () => void;
  /** Admin type — unlinking is only available for super_admin */
  adminType?: 'admin' | 'super_admin';
}

interface SuggestedCustomer {
  id: string;
  name: string;
  phone: string | null;
}

const CustomerLinkWidget: React.FC<CustomerLinkWidgetProps> = ({ order, onUpdate, adminType }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Suggestion state
  const [suggestion, setSuggestion] = useState<SuggestedCustomer | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Link reason flow — show reason picker before confirming
  const [pendingLinkCustomerId, setPendingLinkCustomerId] = useState<string | null>(null);
  const [linkReason, setLinkReason] = useState<LinkReason>(LINK_REASONS[0]);

  // Unlink modal state
  const [showUnlinkModal, setShowUnlinkModal] = useState(false);
  const [unlinkReason, setUnlinkReason] = useState<UnlinkReason>(UNLINK_REASONS[0]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen && !showUnlinkModal) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setPendingLinkCustomerId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, showUnlinkModal]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen && !showUnlinkModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showUnlinkModal) {
          setShowUnlinkModal(false);
        } else {
          setIsOpen(false);
          setPendingLinkCustomerId(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, showUnlinkModal]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current && !pendingLinkCustomerId) {
      searchInputRef.current.focus();
    }
  }, [isOpen, pendingLinkCustomerId]);

  // Auto-suggest on open using order contact_number
  const fetchSuggestion = useCallback(async () => {
    if (!order.contact_number) return;
    try {
      const res = await fetch(`/api/admin/customers/suggest?phone=${encodeURIComponent(order.contact_number)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.customer) {
          setSuggestion(data.customer);
        }
      }
    } catch {
      // silently fail — suggestions are a nice-to-have
    }
  }, [order.contact_number]);

  useEffect(() => {
    if (isOpen && !order.customer_id) {
      setSuggestionDismissed(false);
      fetchSuggestion();
    }
  }, [isOpen, order.customer_id, fetchSuggestion]);

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      if (search.length >= 2 || search.length === 0) {
        setDebouncedSearch(search);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [search]);

  // Search customers
  useEffect(() => {
    if (!isOpen || !debouncedSearch) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const doSearch = async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/customers?search=${encodeURIComponent(debouncedSearch)}&limit=5`, {
          credentials: 'include',
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setResults(data.customers || []);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    doSearch();
    return () => { cancelled = true; };
  }, [isOpen, debouncedSearch]);

  // Start link flow — show reason picker
  const startLink = (customerId: string) => {
    setPendingLinkCustomerId(customerId);
    setLinkReason(LINK_REASONS[0]);
    setActionError(null);
  };

  // Confirm link with reason via Server Action
  const confirmLink = async () => {
    if (!pendingLinkCustomerId) return;
    setLinking(true);
    setActionError(null);
    try {
      const result = await linkCustomerAction({
        order_id: order.id,
        customer_id: pendingLinkCustomerId,
        reason: linkReason,
      });
      if (result.success) {
        setIsOpen(false);
        setPendingLinkCustomerId(null);
        onUpdate?.();
      } else {
        setActionError(result.error || 'Failed to link customer');
      }
    } catch {
      setActionError('An unexpected error occurred');
    } finally {
      setLinking(false);
    }
  };

  // Open unlink modal
  const startUnlink = () => {
    setShowUnlinkModal(true);
    setUnlinkReason(UNLINK_REASONS[0]);
    setActionError(null);
  };

  // Confirm unlink with reason via Server Action
  const confirmUnlink = async () => {
    setLinking(true);
    setActionError(null);
    try {
      const result = await unlinkCustomerAction({
        order_id: order.id,
        reason: unlinkReason,
      });
      if (result.success) {
        setShowUnlinkModal(false);
        onUpdate?.();
      } else {
        setActionError(result.error || 'Failed to unlink customer');
      }
    } catch {
      setActionError('An unexpected error occurred');
    } finally {
      setLinking(false);
    }
  };

  // Retry Messenger auto-link
  const retryMessengerLink = async () => {
    if (!order.messenger_psid) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ retry_messenger_link: true }),
      });
      if (res.ok) {
        onUpdate?.();
      }
    } catch {
      // silently fail
    } finally {
      setLinking(false);
    }
  };

  // Linked state — show chip with the customer record's name (not order.customer_name)
  const isCompleted = order.status === 'completed';
  const canUnlink = adminType === 'super_admin' && !isCompleted;

  if (order.customer_id) {
    return (
      <>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#7BBFB5]/10 border border-[#7BBFB5]/30 rounded-full cursor-pointer hover:bg-[#7BBFB5]/20 transition-all duration-200 group">
          <User className="h-3 w-3 text-[#3D8A80]" />
          <span className="text-xs font-nunito font-medium text-[#3D8A80] truncate max-w-[120px]">
            {order.linked_customer_name || order.customer_name || 'Customer'}
          </span>
          {canUnlink && (
            <button
              onClick={(e) => { e.stopPropagation(); startUnlink(); }}
              className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 rounded-full hover:bg-red-100 transition-all duration-200"
              aria-label="Unlink customer"
              disabled={linking}
            >
              {linking ? (
                <Loader2 className="h-3 w-3 text-stone-400 animate-spin" />
              ) : (
                <X className="h-3 w-3 text-red-400 hover:text-red-600" />
              )}
            </button>
          )}
        </span>

        {/* Unlink Confirmation Modal */}
        {showUnlinkModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
            onClick={(e) => { if (e.target === e.currentTarget) setShowUnlinkModal(false); }}
          >
            <div className="bg-white rounded-xl shadow-2xl w-80 p-5 mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <h3 className="text-sm font-nunito font-bold text-stone-900">Unlink Customer</h3>
              </div>
              <p className="text-xs font-nunito text-stone-600 mb-3">
                Remove <span className="font-semibold">{order.linked_customer_name || order.customer_name || 'Customer'}</span> from this order? This action will be logged.
              </p>

              <label className="block text-xs font-nunito font-medium text-stone-700 mb-1">Reason</label>
              <select
                value={unlinkReason}
                onChange={(e) => setUnlinkReason(e.target.value as UnlinkReason)}
                className="w-full px-2.5 py-2 border border-[#E8E3DA] rounded-lg text-xs font-nunito text-stone-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 mb-3"
              >
                {UNLINK_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              {actionError && (
                <p className="text-xs font-nunito text-red-600 mb-2">{actionError}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowUnlinkModal(false)}
                  disabled={linking}
                  className="px-3 py-1.5 text-xs font-nunito font-medium text-stone-600 hover:text-stone-900 transition-colors duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmUnlink}
                  disabled={linking}
                  className="px-3 py-1.5 bg-red-500 text-white text-xs font-nunito font-semibold rounded-lg hover:bg-red-600 transition-colors duration-200 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {linking && <Loader2 className="h-3 w-3 animate-spin" />}
                  Unlink
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Messenger PSID present but auto-link failed — show Messenger indicator with retry
  if (order.messenger_psid) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full transition-all duration-200 group">
        <MessageCircle className="h-3 w-3 text-blue-500" />
        <span className="text-xs font-nunito font-medium text-blue-700 truncate max-w-[120px]">
          {order.messenger_name || 'Messenger'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); retryMessengerLink(); }}
          className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 rounded-full hover:bg-blue-100 transition-all duration-200"
          aria-label="Retry auto-link"
          title="Retry auto-link"
          disabled={linking}
        >
          {linking ? (
            <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3 text-blue-400 hover:text-blue-600" />
          )}
        </button>
      </span>
    );
  }

  // Unlinked state — show link button + dropdown
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F2EEE8] border border-dashed border-[#E8E3DA] rounded-full text-xs font-nunito font-medium text-stone-500 hover:border-[#7BBFB5] hover:text-[#3D8A80] hover:bg-[#7BBFB5]/5 transition-all duration-200"
      >
        <UserPlus className="h-3 w-3" />
        Link Customer
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-[#E8E3DA] rounded-xl shadow-lg overflow-hidden">
          {/* Link Reason Picker — shown after selecting a customer */}
          {pendingLinkCustomerId ? (
            <div className="p-3">
              <h4 className="text-xs font-nunito font-bold text-stone-900 mb-2">Select a reason</h4>
              <select
                value={linkReason}
                onChange={(e) => setLinkReason(e.target.value as LinkReason)}
                className="w-full px-2.5 py-2 border border-[#E8E3DA] rounded-lg text-xs font-nunito text-stone-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 mb-2"
              >
                {LINK_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              {actionError && (
                <p className="text-xs font-nunito text-red-600 mb-2">{actionError}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setPendingLinkCustomerId(null); setActionError(null); }}
                  disabled={linking}
                  className="px-2.5 py-1 text-xs font-nunito font-medium text-stone-500 hover:text-stone-700 transition-colors duration-200 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={confirmLink}
                  disabled={linking}
                  className="px-3 py-1.5 bg-[#3D8A80] text-white text-xs font-nunito font-semibold rounded-lg hover:bg-[#2E6F66] transition-colors duration-200 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {linking && <Loader2 className="h-3 w-3 animate-spin" />}
                  Confirm Link
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Suggestion Banner */}
              {suggestion && !suggestionDismissed && (
                <div className="mx-2 mt-2 mb-1 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <span className="text-xs font-nunito text-amber-800">
                      Possible match: <span className="font-semibold">{suggestion.name}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => startLink(suggestion.id)}
                      disabled={linking}
                      className="px-2.5 py-1 bg-amber-500 text-white text-xs font-nunito font-semibold rounded-lg hover:bg-amber-600 transition-colors duration-200 disabled:opacity-50"
                    >
                      {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Select'}
                    </button>
                    <button
                      onClick={() => setSuggestionDismissed(true)}
                      className="px-2 py-1 text-amber-600 text-xs font-nunito hover:text-amber-800 transition-colors duration-200"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Search input */}
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or phone..."
                className="w-full px-3 py-2.5 border-b border-[#E8E3DA] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none"
              />

              {/* Results */}
              <div className="max-h-48 overflow-y-auto">
                {searching ? (
                  <div className="px-3 py-4 text-center">
                    <Loader2 className="h-4 w-4 text-stone-400 animate-spin mx-auto" />
                  </div>
                ) : debouncedSearch && results.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm font-nunito text-stone-400">
                    No customers found
                  </div>
                ) : (
                  results.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => startLink(c.id)}
                      disabled={linking}
                      className="w-full px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-[#F2EEE8] transition-colors duration-150 border-b border-[#E8E3DA]/50 last:border-b-0 text-left disabled:opacity-50"
                    >
                      <div>
                        <div className="text-sm font-nunito font-medium text-stone-900">{c.name}</div>
                        {c.phone && (
                          <div className="text-xs font-nunito text-stone-500">{c.phone}</div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerLinkWidget;
