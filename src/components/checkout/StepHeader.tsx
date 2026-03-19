'use client';

import React from 'react';

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
      <div className="bg-white rounded-[14px] px-4 py-3 mb-2 border-l-[3px] border-starrs-sage shadow-sm">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-starrs-sage text-white flex items-center justify-center text-[11px] font-bold">
              ✓
            </div>
            <div>
              <div className="text-[11px] text-starrs-sage font-semibold uppercase tracking-wider">
                {title}
              </div>
              {summary && (
                <div className="font-semibold text-sm text-gray-800">{summary}</div>
              )}
            </div>
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              className="text-xs text-starrs-sage font-semibold"
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
      <div className="bg-gray-100 rounded-[14px] px-4 py-3 mb-2 opacity-60">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-300 text-white flex items-center justify-center text-xs">
            {stepNumber}
          </div>
          <span className="font-semibold text-gray-400">{title}</span>
        </div>
      </div>
    );
  }

  // active
  return (
    <div className="bg-white rounded-[14px] p-4 mb-2 border-2 border-starrs-sage shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-starrs-deep text-starrs-cream-brand flex items-center justify-center text-xs font-bold">
          {stepNumber}
        </div>
        <span className="font-bold text-[15px]">{title}</span>
      </div>
      {children}
    </div>
  );
}
