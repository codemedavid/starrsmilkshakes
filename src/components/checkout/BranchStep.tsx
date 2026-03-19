// src/components/checkout/BranchStep.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
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
  const [expanded, setExpanded] = useState(!selectedBranch);

  useEffect(() => {
    const fetchBranches = async () => {
      const supabase = createClient();
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

  // Auto-select from localStorage on mount (current code stores full JSON object)
  useEffect(() => {
    if (!selectedBranch && branches.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Match by ID from the fetched branches to get fresh data
          const match = branches.find((b) => b.id === parsed.id);
          if (match) {
            onSelect(match);
            setExpanded(false);
          }
        } catch {
          // Invalid stored value, ignore
        }
      }
    }
  }, [branches, selectedBranch, onSelect]);

  const handleSelect = (branch: Branch) => {
    onSelect(branch);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(branch));
    setExpanded(false);
  };

  if (loading) {
    return <div className="text-center py-4 text-starrs-muted text-sm">Loading branches...</div>;
  }

  if (!expanded && selectedBranch) {
    return (
      <div className="space-y-2">
        <div className="bg-starrs-mint-soft rounded-xl p-3 flex justify-between items-center">
          <div>
            <div className="font-semibold text-sm">{selectedBranch.name}</div>
            <div className="text-xs text-starrs-muted">{selectedBranch.address}</div>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-starrs-sage font-semibold"
          >
            Change
          </button>
        </div>
        <button
          onClick={onContinue}
          className="w-full py-3.5 bg-starrs-sage text-starrs-cream-brand rounded-xl text-[15px] font-bold"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {branches.map((branch) => (
        <button
          key={branch.id}
          onClick={() => handleSelect(branch)}
          className={`w-full text-left rounded-xl p-3 border-2 transition-colors ${
            selectedBranch?.id === branch.id
              ? 'border-starrs-sage bg-starrs-mint-soft'
              : 'border-transparent bg-gray-50 hover:bg-starrs-mint-soft'
          }`}
        >
          <div className="font-semibold text-sm">{branch.name}</div>
          <div className="text-xs text-starrs-muted">{branch.address}</div>
          {branch.phone && (
            <div className="text-xs text-starrs-muted">{branch.phone}</div>
          )}
        </button>
      ))}
      {selectedBranch && (
        <button
          onClick={onContinue}
          className="w-full py-3.5 bg-starrs-sage text-starrs-cream-brand rounded-xl text-[15px] font-bold"
        >
          Continue
        </button>
      )}
    </div>
  );
}
