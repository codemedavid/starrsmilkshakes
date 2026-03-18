'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User,
  UserPlus,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { CustomerSummary } from '@/types/customer';

interface CustomerLinkWidgetProps {
  /** The order object that may have customer_id and contact_number */
  order: {
    id: string;
    contact_number: string;
    customer_id?: string | null;
    customer_name?: string;
  };
  /** Called after a customer is linked/unlinked to refresh the order list */
  onUpdate?: () => void;
}

interface SuggestedCustomer {
  id: string;
  name: string;
  phone: string | null;
}

const CustomerLinkWidget: React.FC<CustomerLinkWidgetProps> = ({ order, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  // Suggestion state
  const [suggestion, setSuggestion] = useState<SuggestedCustomer | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

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

  // Link a customer
  const linkCustomer = async (customerId: string) => {
    setLinking(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ customer_id: customerId }),
      });
      if (res.ok) {
        setIsOpen(false);
        onUpdate?.();
      }
    } catch {
      // silently fail
    } finally {
      setLinking(false);
    }
  };

  // Unlink customer
  const unlinkCustomer = async () => {
    if (!window.confirm('Unlink this customer from the order?')) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ customer_id: null }),
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

  // Linked state — show chip
  if (order.customer_id) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#7BBFB5]/10 border border-[#7BBFB5]/30 rounded-full cursor-pointer hover:bg-[#7BBFB5]/20 transition-all duration-200 group">
        <User className="h-3 w-3 text-[#3D8A80]" />
        <span className="text-xs font-nunito font-medium text-[#3D8A80] truncate max-w-[120px]">
          {order.customer_name || 'Customer'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); unlinkCustomer(); }}
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
                  onClick={() => linkCustomer(suggestion.id)}
                  disabled={linking}
                  className="px-2.5 py-1 bg-amber-500 text-white text-xs font-nunito font-semibold rounded-lg hover:bg-amber-600 transition-colors duration-200 disabled:opacity-50"
                >
                  {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
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
                  onClick={() => linkCustomer(c.id)}
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
        </div>
      )}
    </div>
  );
};

export default CustomerLinkWidget;
