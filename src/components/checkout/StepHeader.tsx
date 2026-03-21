'use client';

import React from 'react';
import { Check } from 'lucide-react';

export type StepState = 'completed' | 'active' | 'locked';

interface StepHeaderProps {
  stepNumber: number;
  title: string;
  state: StepState;
  summary?: string;
  onEdit?: () => void;
  children?: React.ReactNode;
}

export default function StepHeader({
  stepNumber,
  title,
  state,
  summary,
  onEdit,
  children,
}: StepHeaderProps) {
  if (state === 'completed') {
    return (
      <div className="bg-white rounded-2xl px-4 py-3.5 mb-2.5 shadow-[0_1px_8px_rgba(0,0,0,0.04)] border border-[#E8E4DE]/50">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#2A5A4A] flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-[#7EDCB5]" strokeWidth={3} />
            </div>
            <div>
              <div className="text-[11px] text-[#8B9E95] font-semibold uppercase tracking-widest">
                {title}
              </div>
              {summary && (
                <div className="font-medium text-[14px] text-[#1A2B22] mt-0.5">{summary}</div>
              )}
            </div>
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              className="text-[13px] text-[#8FB8A8] font-semibold hover:text-[#2A5A4A] transition-colors px-2 py-1 -mr-2 rounded-lg hover:bg-[#F0F7F4]"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    );
  }

  if (state === 'locked') {
    return (
      <div className="bg-[#EBE7E1]/60 rounded-2xl px-4 py-3.5 mb-2.5">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[#D4CFC8] flex items-center justify-center text-[12px] font-bold text-white">
            {stepNumber}
          </div>
          <span className="font-semibold text-[14px] text-[#B8B2A9]">{title}</span>
        </div>
      </div>
    );
  }

  // active
  return (
    <div className="bg-white rounded-2xl p-4 mb-2.5 shadow-[0_4px_20px_rgba(42,90,74,0.08)] border border-[#8FB8A8]/30 ring-1 ring-[#8FB8A8]/10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8FB8A8] to-[#2A5A4A] flex items-center justify-center text-[12px] font-bold text-white shadow-sm">
          {stepNumber}
        </div>
        <span className="font-bold text-[16px] text-[#1A2B22]">{title}</span>
      </div>
      {children}
    </div>
  );
}
