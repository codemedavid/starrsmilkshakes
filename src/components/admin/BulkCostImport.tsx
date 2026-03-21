'use client';

import { useState } from 'react';
import { Loader2, Upload, X, Check, AlertTriangle } from 'lucide-react';
import { previewBulkImportCosts, applyBulkImportCosts } from '@/actions/cost-admin';

interface BulkCostImportProps {
  onClose: () => void;
}

interface CostEntry {
  name: string;
  costPrice: number;
}

type Step = 'input' | 'preview' | 'done';

export default function BulkCostImport({ onClose }: BulkCostImportProps) {
  const [step, setStep] = useState<Step>('input');
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [matches, setMatches] = useState<{ name: string; menuItemId: string; menuItemName: string; costPrice: number }[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedCount, setUpdatedCount] = useState(0);

  const handlePaste = (text: string) => {
    const lines = text.trim().split('\n');
    const parsed: CostEntry[] = [];
    for (const line of lines) {
      const parts = line.split(/[\t,]/).map(s => s.trim());
      if (parts.length >= 2) {
        const name = parts[0];
        const cost = parseFloat(parts[1]);
        if (name && !isNaN(cost) && cost >= 0) {
          parsed.push({ name, costPrice: Math.round(cost * 100) / 100 });
        }
      }
    }
    setEntries(parsed);
  };

  const handlePreview = async () => {
    if (entries.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await previewBulkImportCosts({ items: entries });
      if (res.success) {
        setMatches(res.data.matches);
        setNotFound(res.data.notFound);
        setStep('preview');
      } else {
        setError(res.error ?? 'Preview failed');
      }
    } catch {
      setError('An unexpected error occurred during preview');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await applyBulkImportCosts(matches.map(m => ({ menuItemId: m.menuItemId, costPrice: m.costPrice })));
      if (res.success) {
        setUpdatedCount(res.data.updated);
        setStep('done');
      } else {
        setError(res.error ?? 'Import failed');
      }
    } catch {
      setError('An unexpected error occurred during import');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto border border-[#E8E3DA]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-playfair text-lg font-semibold text-stone-900">Bulk Import Costs</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 hover:bg-[#F2EEE8] rounded-lg transition-colors">
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="font-nunito text-sm text-red-700">{error}</p>
          </div>
        )}

        {step === 'input' && (
          <>
            <p className="font-nunito text-sm text-stone-500 mb-3">
              Paste tab-separated or comma-separated data from your spreadsheet. One item per line: Item Name, Cost.
            </p>
            <textarea
              className="w-full h-40 border border-[#E8E3DA] rounded-lg p-3 font-nunito text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#7BBFB5]/40"
              placeholder={"BELGIAN FRIES\t36.58\nCROSSTRAX FRIES\t39.68"}
              onChange={(e) => handlePaste(e.target.value)}
            />
            {entries.length > 0 && (
              <p className="font-nunito text-sm text-stone-500 mt-2">{entries.length} items parsed</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handlePreview}
                disabled={entries.length === 0 || loading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm rounded-[10px] hover:bg-[#3D8A80] disabled:opacity-50 transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Preview Matches
              </button>
              <button onClick={onClose} className="px-4 py-2.5 font-nunito text-sm text-stone-500 hover:bg-[#F2EEE8] rounded-[10px] transition-colors">
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            {matches.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-green-700 mb-2">
                  <Check className="w-4 h-4" />
                  <span className="font-nunito text-sm font-medium">{matches.length} items matched</span>
                </div>
                <div className="max-h-40 overflow-y-auto border border-[#E8E3DA] rounded-lg p-2">
                  {matches.map((m) => (
                    <div key={m.menuItemId} className="flex justify-between py-1 font-nunito text-sm">
                      <span className="text-stone-700">{m.menuItemName}</span>
                      <span className="text-stone-400">₱{m.costPrice.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {notFound.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-nunito text-sm font-medium">{notFound.length} not matched</span>
                </div>
                <div className="max-h-28 overflow-y-auto border border-amber-200 rounded-lg p-2 bg-amber-50/50">
                  {notFound.map((name) => (
                    <div key={name} className="font-nunito text-sm text-amber-700 py-0.5">{name}</div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                disabled={matches.length === 0 || loading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm rounded-[10px] hover:bg-[#3D8A80] disabled:opacity-50 transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Apply {matches.length} Costs
              </button>
              <button onClick={() => setStep('input')} className="px-4 py-2.5 font-nunito text-sm text-stone-500 hover:bg-[#F2EEE8] rounded-[10px]">
                Back
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="flex items-center gap-2 text-green-700 mb-4">
              <Check className="w-5 h-5" />
              <span className="font-nunito font-medium">{updatedCount} items updated successfully</span>
            </div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm rounded-[10px] hover:bg-[#3D8A80] transition-all"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
