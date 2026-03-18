'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Edit3,
  Trash2,
  Phone,
  Mail,
  MessageCircle,
  UserPlus,
  Plus,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import CustomerTagBadge from './CustomerTagBadge';
import CustomerLoyaltyWidget from './CustomerLoyaltyWidget';
import { useCustomer } from '@/hooks/useCustomer';
import type { CustomerProfile, FavoriteItem } from '@/types/customer';

interface CustomerDetailPanelProps {
  customerId: string | null;
  onDelete?: (id: string) => void;
  onCustomerUpdated?: () => void;
}

// Order status badge colors from the design doc
const statusStyles: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border border-yellow-200/60',
  confirmed: 'bg-blue-50 text-blue-700 border border-blue-200/60',
  preparing: 'bg-orange-50 text-orange-700 border border-orange-200/60',
  ready: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
  out_for_delivery: 'bg-purple-50 text-purple-700 border border-purple-200/60',
  completed: 'bg-green-50 text-green-700 border border-green-200/60',
  cancelled: 'bg-red-50 text-red-700 border border-red-200/60',
};

const formatCurrency = (amount: number): string => {
  return `P${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatShortDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const CustomerDetailPanel: React.FC<CustomerDetailPanelProps> = ({ customerId, onDelete, onCustomerUpdated }) => {
  const { customer, loading, error, fetchCustomer, updateCustomer, addTag, removeTag } = useCustomer();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Bar chart animation state
  const [animateBars, setAnimateBars] = useState(false);

  // Fetch customer when ID changes
  useEffect(() => {
    if (customerId) {
      setIsEditing(false);
      setShowAddTag(false);
      setAnimateBars(false);
      fetchCustomer(customerId);
    }
  }, [customerId, fetchCustomer]);

  // Trigger bar animation after data loads
  useEffect(() => {
    if (customer && customer.favorite_items && customer.favorite_items.length > 0) {
      // Delay to let the DOM paint with width 0 first
      const timer = setTimeout(() => setAnimateBars(true), 50);
      return () => clearTimeout(timer);
    }
  }, [customer]);

  // Focus tag input when it appears
  useEffect(() => {
    if (showAddTag && tagInputRef.current) {
      tagInputRef.current.focus();
    }
  }, [showAddTag]);

  // Populate edit form when entering edit mode
  const handleStartEdit = () => {
    if (!customer) return;
    setEditName(customer.name);
    setEditPhone(customer.phone || '');
    setEditEmail(customer.email || '');
    setEditNotes(customer.notes || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!customer) return;
    setIsSaving(true);
    try {
      await updateCustomer(customer.id, {
        name: editName,
        phone: editPhone || null,
        email: editEmail || null,
        notes: editNotes || null,
      });
      setIsEditing(false);
      onCustomerUpdated?.();
    } catch {
      // error is displayed via the hook's error state
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTag = async () => {
    if (!customer || !newTagName.trim()) return;
    setIsAddingTag(true);
    try {
      await addTag(customer.id, newTagName.trim());
      setNewTagName('');
      setShowAddTag(false);
    } catch {
      // error handled by hook
    } finally {
      setIsAddingTag(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!customer) return;
    await removeTag(customer.id, tagId);
  };

  const handleDelete = () => {
    if (!customer || !onDelete) return;
    if (window.confirm(`Are you sure you want to delete ${customer.name}? This cannot be undone.`)) {
      onDelete(customer.id);
    }
  };

  // Empty state
  if (!customerId) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden h-[calc(100vh-180px)]">
        <div className="h-full flex flex-col items-center justify-center text-center px-8">
          <Users className="h-16 w-16 text-[#E8E3DA] mb-4" />
          <h3 className="text-lg font-playfair font-medium text-stone-400 mb-2">
            Select a customer
          </h3>
          <p className="text-sm font-nunito text-stone-400">
            Click on a customer from the list to view their profile
          </p>
        </div>
      </div>
    );
  }

  // Loading skeleton
  if (loading && !customer) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden h-[calc(100vh-180px)]">
        <div className="h-24 bg-[#E8E3DA] rounded-t-xl animate-pulse" />
        <div className="grid grid-cols-3 gap-3 p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-[#E8E3DA]/60 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error && !customer) {
    return (
      <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden h-[calc(100vh-180px)]">
        <div className="h-full flex flex-col items-center justify-center text-center px-8">
          <p className="text-sm font-nunito text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  const favoriteItems: FavoriteItem[] = customer.favorite_items || [];
  const maxFavCount = favoriteItems.length > 0 ? Math.max(...favoriteItems.map(f => f.count)) : 1;

  return (
    <div
      className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden h-[calc(100vh-180px)] overflow-y-auto"
      role="complementary"
      aria-label="Customer details"
      key={customer.id}
    >
      {/* Teal Profile Header */}
      <div className="bg-[#7BBFB5] px-6 py-5">
        <div className="flex items-start justify-between">
          {/* Name + source */}
          <div className="flex-1">
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-xl font-playfair font-semibold text-[#F0EBE0] leading-tight bg-[#F0EBE0]/20 border border-[#F0EBE0]/40 rounded-lg px-2 py-1 w-full focus:outline-none focus:border-[#F0EBE0]/60"
              />
            ) : (
              <h2 className="text-xl font-playfair font-semibold text-[#F0EBE0] leading-tight">
                {customer.name}
              </h2>
            )}
            <div className="inline-flex items-center gap-1.5 mt-1.5">
              <span className="bg-[#F0EBE0]/20 backdrop-blur-sm text-[#F0EBE0] px-2 py-0.5 rounded-full text-xs font-nunito font-medium inline-flex items-center gap-1">
                {customer.source === 'messenger' ? (
                  <>
                    <MessageCircle className="h-3 w-3" />
                    Messenger
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3 w-3" />
                    Manual
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editName.trim()}
                  className="p-2 rounded-lg bg-[#F0EBE0]/15 text-[#F0EBE0] hover:bg-[#F0EBE0]/25 transition-all duration-200 disabled:opacity-50"
                  aria-label="Save changes"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-2 rounded-lg bg-[#F0EBE0]/15 text-[#F0EBE0] hover:bg-[#F0EBE0]/25 transition-all duration-200"
                  aria-label="Cancel editing"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleStartEdit}
                  className="p-2 rounded-lg bg-[#F0EBE0]/15 text-[#F0EBE0] hover:bg-[#F0EBE0]/25 transition-all duration-200"
                  aria-label="Edit customer"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    className="p-2 rounded-lg bg-[#F0EBE0]/15 text-[#F0EBE0] hover:bg-red-400/30 transition-all duration-200"
                    aria-label="Delete customer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {customer.auto_tags.map((tag) => (
            <CustomerTagBadge key={tag} label={tag} type="auto" />
          ))}
          {customer.manual_tags.map((tag) => (
            <CustomerTagBadge
              key={tag.id}
              label={tag.tag}
              type="manual"
              onTeal
              onRemove={() => handleRemoveTag(tag.id)}
            />
          ))}

          {/* Add tag button / input */}
          {showAddTag ? (
            <div className="inline-flex items-center gap-1.5">
              <input
                ref={tagInputRef}
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); }
                  if (e.key === 'Escape') { setShowAddTag(false); setNewTagName(''); }
                }}
                placeholder="Tag name"
                className="bg-[#F0EBE0]/20 border border-[#F0EBE0]/40 text-[#F0EBE0] placeholder:text-[#F0EBE0]/50 px-2 py-0.5 rounded-full text-xs font-nunito w-24 focus:w-32 focus:outline-none focus:border-[#F0EBE0]/60 transition-all duration-200"
              />
              <button
                onClick={handleAddTag}
                disabled={isAddingTag || !newTagName.trim()}
                className="p-0.5 rounded-full bg-[#F0EBE0]/20 text-[#F0EBE0] hover:bg-[#F0EBE0]/30 disabled:opacity-50"
                aria-label="Submit tag"
              >
                {isAddingTag ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
              <button
                onClick={() => { setShowAddTag(false); setNewTagName(''); }}
                className="p-0.5 rounded-full text-[#F0EBE0]/60 hover:text-[#F0EBE0]"
                aria-label="Cancel adding tag"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddTag(true)}
              className="inline-flex items-center gap-1 bg-[#F0EBE0]/10 border border-dashed border-[#F0EBE0]/40 text-[#F0EBE0]/80 hover:bg-[#F0EBE0]/20 hover:text-[#F0EBE0] px-2 py-0.5 rounded-full text-xs font-nunito transition-all duration-200"
            >
              <Plus className="h-3 w-3" />
              Add Tag
            </button>
          )}
        </div>
      </div>

      {/* Contact Row */}
      <div className="px-6 py-4 border-b border-[#E8E3DA] flex flex-wrap gap-x-6 gap-y-2">
        {isEditing ? (
          <div className="flex flex-wrap gap-3 w-full">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-stone-400" />
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Phone"
                className="px-2 py-1 border border-[#E8E3DA] rounded-lg text-sm font-nunito text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-stone-400" />
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Email"
                className="px-2 py-1 border border-[#E8E3DA] rounded-lg text-sm font-nunito text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5]"
              />
            </div>
          </div>
        ) : (
          <>
            {customer.phone && (
              <div className="flex items-center gap-2 text-sm font-nunito">
                <Phone className="h-4 w-4 text-stone-400" />
                <span className="text-stone-900 font-medium">{customer.phone}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2 text-sm font-nunito">
                <Mail className="h-4 w-4 text-stone-400" />
                <span className="text-stone-900 font-medium">{customer.email}</span>
              </div>
            )}
            {customer.source === 'messenger' && customer.messenger_psid && (
              <div className="flex items-center gap-2 text-sm font-nunito">
                <MessageCircle className="h-4 w-4 text-stone-400" />
                <span
                  className="text-stone-900 font-medium cursor-pointer hover:text-[#3D8A80]"
                  title={customer.messenger_psid}
                  onClick={() => navigator.clipboard.writeText(customer.messenger_psid!)}
                >
                  {customer.messenger_psid.slice(0, 12)}...
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Stats Grid */}
      <div className="px-6 py-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-[#F2EEE8] rounded-xl p-3.5 text-center border border-[#E8E3DA]">
            <div className="text-[10px] font-nunito font-medium text-stone-500 uppercase tracking-wider leading-tight mb-1.5">
              Lifetime Value
            </div>
            <div className="text-lg font-nunito font-bold text-[#3D8A80] tabular-nums leading-none">
              {formatCurrency(customer.total_spent)}
            </div>
          </div>
          <div className="bg-[#F2EEE8] rounded-xl p-3.5 text-center border border-[#E8E3DA]">
            <div className="text-[10px] font-nunito font-medium text-stone-500 uppercase tracking-wider leading-tight mb-1.5">
              Avg Order
            </div>
            <div className="text-lg font-nunito font-bold text-[#3D8A80] tabular-nums leading-none">
              {formatCurrency(customer.avg_order_value)}
            </div>
          </div>
          <div className="bg-[#F2EEE8] rounded-xl p-3.5 text-center border border-[#E8E3DA]">
            <div className="text-[10px] font-nunito font-medium text-stone-500 uppercase tracking-wider leading-tight mb-1.5">
              Avg Interval
            </div>
            <div className="text-lg font-nunito font-bold text-[#3D8A80] tabular-nums leading-none">
              {customer.avg_order_interval_days != null
                ? `${customer.avg_order_interval_days.toFixed(1)} days`
                : 'N/A'}
            </div>
          </div>
          <div className="bg-[#F2EEE8] rounded-xl p-3.5 text-center border border-[#E8E3DA]">
            <div className="text-[10px] font-nunito font-medium text-stone-500 uppercase tracking-wider leading-tight mb-1.5">
              Total Orders
            </div>
            <div className="text-lg font-nunito font-bold text-[#3D8A80] tabular-nums leading-none">
              {customer.order_count}
            </div>
          </div>
          <div className="bg-[#F2EEE8] rounded-xl p-3.5 text-center border border-[#E8E3DA]">
            <div className="text-[10px] font-nunito font-medium text-stone-500 uppercase tracking-wider leading-tight mb-1.5">
              Pref. Service
            </div>
            <div className="text-lg font-nunito font-bold text-[#3D8A80] tabular-nums leading-none capitalize">
              {customer.preferred_service_type || 'N/A'}
            </div>
          </div>
          <div className="bg-[#F2EEE8] rounded-xl p-3.5 text-center border border-[#E8E3DA]">
            <div className="text-[10px] font-nunito font-medium text-stone-500 uppercase tracking-wider leading-tight mb-1.5">
              Last Order
            </div>
            <div className="text-lg font-nunito font-bold text-[#3D8A80] tabular-nums leading-none">
              {customer.last_order_at ? formatDate(customer.last_order_at) : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Top Items Ordered */}
      <div className="px-6 py-5 border-t border-[#E8E3DA]">
        <h4 className="text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wider mb-3">
          Top Items Ordered
        </h4>
        {favoriteItems.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm font-nunito text-stone-400">No order history yet</p>
          </div>
        ) : (
          <div>
            {favoriteItems.map((item, index) => {
              const percentage = (item.count / maxFavCount) * 100;
              return (
                <div key={item.id ?? item.name} className="flex items-center gap-3 mb-2.5 last:mb-0">
                  <span className="w-5 text-xs font-nunito font-bold text-stone-400 text-right">
                    {index + 1}
                  </span>
                  <span className="text-sm font-nunito text-stone-700 w-32 truncate flex-shrink-0">
                    {item.name}
                  </span>
                  <div className="flex-1 h-5 bg-[#F2EEE8] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#7BBFB5] rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: animateBars ? `${percentage}%` : '0%',
                        transitionDelay: `${index * 50}ms`,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-nunito font-semibold text-[#3D8A80] tabular-nums">
                    {item.count}x
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Loyalty Card */}
      <div className="px-6">
        <CustomerLoyaltyWidget customerId={customer.id} />
      </div>

      {/* Recent Orders */}
      <div className="px-6 py-5 border-t border-[#E8E3DA]">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wider">
            Recent Orders
          </h4>
        </div>
        {customer.recent_orders.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm font-nunito text-stone-400">No orders yet</p>
          </div>
        ) : (
          <div>
            {customer.recent_orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between py-2.5 border-b border-[#E8E3DA]/60 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-nunito font-semibold text-stone-900">
                    #{order.order_number}
                  </span>
                  <span className="text-xs font-nunito text-stone-500 capitalize">
                    {order.service_type}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-nunito font-semibold text-stone-900 tabular-nums">
                    {formatCurrency(order.total)}
                  </span>
                  <span className="text-xs font-nunito text-stone-400 w-16 text-right">
                    {formatShortDate(order.created_at)}
                  </span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-nunito font-semibold uppercase tracking-wide ${
                      statusStyles[order.status] || 'bg-gray-50 text-gray-700 border border-gray-200/60'
                    }`}
                  >
                    {order.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes Section */}
      <div className="px-6 py-4 border-t border-[#E8E3DA]">
        <h4 className="text-xs font-nunito font-semibold text-stone-500 uppercase tracking-wider mb-2">
          Notes
        </h4>
        {isEditing ? (
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={3}
            placeholder="Any notes about this customer..."
            className="w-full px-3.5 py-2.5 border border-[#E8E3DA] rounded-[10px] text-sm font-nunito text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40 focus:border-[#7BBFB5] transition-all duration-200 resize-none"
          />
        ) : (
          customer.notes ? (
            <p className="text-sm font-nunito text-stone-600 leading-relaxed whitespace-pre-wrap">
              {customer.notes}
            </p>
          ) : (
            <p className="text-sm font-nunito text-stone-400 italic">No notes added</p>
          )
        )}
      </div>
    </div>
  );
};

export default CustomerDetailPanel;
