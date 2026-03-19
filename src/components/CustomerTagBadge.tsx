'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { AutoTagLabel } from '@/types/customer';

interface CustomerTagBadgeProps {
  label: string;
  type: 'auto' | 'manual';
  /** When true, renders with teal-header-aware styling (cream on translucent bg) */
  onTeal?: boolean;
  /** If provided, renders a removable tag with an X button */
  onRemove?: () => void;
}

const autoTagStyles: Record<AutoTagLabel, string> = {
  VIP: 'bg-amber-50 text-amber-600 border border-amber-200/60',
  Loyal: 'bg-green-50 text-green-600 border border-green-200/60',
  New: 'bg-blue-50 text-blue-600 border border-blue-200/60',
  'At Risk': 'bg-red-50 text-red-600 border border-red-200/60',
};

const CustomerTagBadge: React.FC<CustomerTagBadgeProps> = React.memo(function CustomerTagBadge({ label, type, onTeal = false, onRemove }) {
  // Auto tags always use semantic colors (they pop against both white and teal)
  if (type === 'auto') {
    const style = autoTagStyles[label as AutoTagLabel] || 'bg-gray-50 text-gray-600 border border-gray-200/60';
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-nunito font-semibold ${style}`}
        aria-label={`Auto tag: ${label}`}
      >
        {label}
      </span>
    );
  }

  // Manual tag on teal surface (detail panel header)
  if (onTeal) {
    if (onRemove) {
      return (
        <span
          className="group cursor-pointer inline-flex items-center bg-[#F0EBE0]/20 backdrop-blur-sm text-[#F0EBE0] border border-[#F0EBE0]/30 hover:border-red-300 hover:bg-red-50/50 px-2 py-0.5 rounded-full text-xs font-nunito font-medium transition-all duration-200"
          onClick={onRemove}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRemove(); } }}
          aria-label={`Manual tag: ${label}, press to remove`}
        >
          {label}
          <X className="ml-1 h-3 w-3 text-[#F0EBE0]/60 group-hover:text-red-500 transition-colors duration-200" />
        </span>
      );
    }
    return (
      <span
        className="bg-[#F0EBE0]/20 backdrop-blur-sm text-[#F0EBE0] border border-[#F0EBE0]/30 px-2 py-0.5 rounded-full text-xs font-nunito font-medium"
        aria-label={`Manual tag: ${label}`}
      >
        {label}
      </span>
    );
  }

  // Manual tag on white surface (list items)
  if (onRemove) {
    return (
      <span
        className="group cursor-pointer inline-flex items-center bg-[#F2EEE8] text-stone-600 border border-[#E8E3DA] hover:border-red-300 hover:bg-red-50/50 px-2 py-0.5 rounded-full text-xs font-nunito font-medium transition-all duration-200"
        onClick={onRemove}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRemove(); } }}
        aria-label={`Manual tag: ${label}, press to remove`}
      >
        {label}
        <X className="ml-1 h-3 w-3 text-stone-400 group-hover:text-red-500 transition-colors duration-200" />
      </span>
    );
  }

  return (
    <span
      className="bg-[#F2EEE8] text-stone-600 border border-[#E8E3DA] px-2 py-0.5 rounded-full text-xs font-nunito font-medium"
      aria-label={`Manual tag: ${label}`}
    >
      {label}
    </span>
  );
});

export default CustomerTagBadge;
