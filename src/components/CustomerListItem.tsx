'use client';

import React from 'react';
import CustomerTagBadge from './CustomerTagBadge';
import type { CustomerSummary } from '@/types/customer';

interface CustomerListItemProps {
  customer: CustomerSummary;
  selected: boolean;
  onClick: () => void;
}

const formatCurrency = (amount: number): string => {
  return `P${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const CustomerListItem: React.FC<CustomerListItemProps> = React.memo(function CustomerListItem({ customer, selected, onClick }) {
  const isAtRisk = customer.auto_tags.includes('At Risk');
  const contact = customer.phone || customer.email || 'No contact';

  // Build container classes based on state
  let containerClasses = 'p-4 border-b border-[#E8E3DA] cursor-pointer transition-all duration-200';

  if (selected) {
    containerClasses += ' bg-[#7BBFB5]/[0.08] border-l-[3px] border-l-[#7BBFB5]';
  } else if (isAtRisk) {
    containerClasses += ' bg-red-50/50 border-l-[3px] border-l-red-300 hover:bg-red-50/70';
  } else {
    containerClasses += ' hover:bg-[#F2EEE8]/60';
  }

  return (
    <div
      className={containerClasses}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      aria-label={`${customer.name}${isAtRisk ? ', at risk' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left block */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-nunito font-semibold text-stone-900 truncate">
            {customer.name}
          </div>
          <div className="text-xs font-nunito text-stone-500 mt-0.5 truncate">
            {contact}
          </div>
          {/* Tags */}
          {(customer.auto_tags.length > 0 || customer.manual_tags.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {customer.auto_tags.map((tag) => (
                <CustomerTagBadge key={tag} label={tag} type="auto" />
              ))}
              {customer.manual_tags.map((tag) => (
                <CustomerTagBadge key={tag.id} label={tag.tag} type="manual" />
              ))}
            </div>
          )}
        </div>

        {/* Right block */}
        <div className="flex flex-col items-end flex-shrink-0 text-right">
          <div className="text-sm font-nunito font-bold text-[#3D8A80] tabular-nums">
            {formatCurrency(customer.total_spent)}
          </div>
          <div className="text-xs font-nunito text-stone-500 mt-0.5">
            {customer.order_count} order{customer.order_count !== 1 ? 's' : ''}
          </div>
          {customer.last_order_at && (
            <div className={`text-xs font-nunito mt-0.5 ${isAtRisk ? 'text-red-500' : 'text-stone-400'}`}>
              {formatDate(customer.last_order_at)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default CustomerListItem;
