// src/components/checkout/BranchStep.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Branch } from '@/types';

interface BranchStepProps {
  selectedBranch: Branch | null;
  onSelect: (branch: Branch) => void;
  onContinue: () => void;
}

const STORAGE_KEY = 'starrs_selected_branch';

export default function BranchStep({ selectedBranch, onSelect, onContinue }: BranchStepProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBranches = async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('is_main', { ascending: false })
        .order('name');
      if (data) setBranches(data);
      setLoading(false);
    };
    fetchBranches();
  }, []);

  // Auto-select from localStorage on mount
  useEffect(() => {
    if (!selectedBranch && branches.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const match = branches.find((b) => b.id === parsed.id);
          if (match) onSelect(match);
        } catch {
          // Invalid stored value, ignore
        }
      }
    }
  }, [branches, selectedBranch, onSelect]);

  const handleSelect = (branch: Branch) => {
    onSelect(branch);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(branch));
    onContinue();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#7ed2c2] border-t-[#006b5e]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {branches.map((branch, index) => {
        const isSelected = selectedBranch?.id === branch.id;
        return (
          <button
            key={branch.id}
            onClick={() => handleSelect(branch)}
            className={`w-full text-left rounded-[1rem] p-6 transition-all duration-300 active:scale-[0.98] ${
              isSelected
                ? 'bg-white shadow-sm ring-2 ring-[#006b5e]'
                : 'bg-[#cdfeed] hover:bg-[#c8f8e8]'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {(isSelected || (index === 0 && !selectedBranch)) && (
                    <span className="bg-[#006b5e] text-[#e6fff5] px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      {isSelected ? 'Selected' : 'Closest'}
                    </span>
                  )}
                  {branch.is_main && !isSelected && (
                    <span className="bg-[#7ed2c2] text-[#005b50] px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      Main
                    </span>
                  )}
                  <h3 className="font-headline text-xl font-bold text-[#002019]">
                    {branch.name}
                  </h3>
                </div>
                <p className="text-[#005b50] text-sm">{branch.address}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-[#bec9c5]/10">
              <div className="flex items-center gap-2 text-[#005b50]">
                {branch.phone && (
                  <>
                    <span className="material-symbols-outlined text-sm">call</span>
                    <span className="text-xs font-medium">{branch.phone}</span>
                  </>
                )}
              </div>
              <span className="text-[#006b5e] font-bold text-xs uppercase tracking-widest flex items-center gap-1">
                {isSelected ? 'Selected' : 'Select'}
                <span className="material-symbols-outlined text-sm">
                  {isSelected ? 'check_circle' : 'chevron_right'}
                </span>
              </span>
            </div>
          </button>
        );
      })}

    </div>
  );
}
