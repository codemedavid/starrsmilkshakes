'use client';

import { useState, useTransition } from 'react';
import { Edit2, Trash2, AlertTriangle, Package } from 'lucide-react';
import type { Bundle } from '@/types/bundle';
import { deleteBundle, toggleBundleAvailability } from '@/actions/bundle-admin';
import { calculateItemMargin } from '@/lib/cost-engine';

interface Props {
  bundles: Bundle[];
  onEdit: (bundle: Bundle) => void;
}

export default function BundleList({ bundles, onEdit }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [togglePending, startToggleTransition] = useTransition();

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteBundle(id);
      setConfirmDelete(null);
    });
  };

  const handleToggle = (id: string) => {
    startToggleTransition(async () => {
      await toggleBundleAvailability(id);
    });
  };

  if (bundles.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-dashed border-[#E8E3DA]">
        <Package className="h-10 w-10 text-stone-300 mx-auto mb-4" />
        <h3 className="font-playfair text-lg font-semibold text-stone-700 mb-1">No bundles yet</h3>
        <p className="font-nunito text-sm text-stone-400">Create your first combo bundle to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E8E3DA] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-[#E8E3DA] bg-[#FAFAF8]">
          <tr>
            <th className="px-4 py-3 text-left font-nunito font-semibold text-stone-600">Name</th>
            <th className="px-4 py-3 text-right font-nunito font-semibold text-stone-600">Price</th>
            <th className="px-4 py-3 text-right font-nunito font-semibold text-stone-600">Cost</th>
            <th className="px-4 py-3 text-center font-nunito font-semibold text-stone-600">Margin</th>
            <th className="px-4 py-3 text-center font-nunito font-semibold text-stone-600">Slots</th>
            <th className="px-4 py-3 text-center font-nunito font-semibold text-stone-600">Status</th>
            <th className="px-4 py-3 text-right font-nunito font-semibold text-stone-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E8E3DA]">
          {bundles.map((bundle) => {
            const { margin_percent } = calculateItemMargin(bundle.base_price, bundle.cost_price ?? null);
            const marginColor =
              margin_percent === null
                ? 'text-stone-400'
                : margin_percent > 60
                  ? 'text-green-600'
                  : margin_percent > 40
                    ? 'text-amber-600'
                    : 'text-red-600';

            return (
              <tr key={bundle.id} className="hover:bg-[#FAFAF8]">
                <td className="px-4 py-3">
                  <div className="font-nunito font-semibold text-stone-900">{bundle.name}</div>
                  <div className="font-nunito text-xs text-stone-400">{bundle.category}</div>
                </td>
                <td className="px-4 py-3 text-right font-nunito">₱{bundle.base_price.toFixed(0)}</td>
                <td className="px-4 py-3 text-right font-nunito text-stone-500">
                  {bundle.cost_price != null ? `₱${bundle.cost_price.toFixed(0)}` : '—'}
                </td>
                <td className={`px-4 py-3 text-center font-nunito font-medium ${marginColor}`}>
                  {margin_percent !== null ? `${margin_percent.toFixed(0)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-center font-nunito">{bundle.slots?.length ?? 0}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleToggle(bundle.id)}
                    disabled={togglePending}
                    className={`inline-flex px-2 py-0.5 text-[10px] font-nunito font-medium rounded-full transition-colors ${
                      bundle.available ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {bundle.available ? 'Available' : 'Unavailable'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => onEdit(bundle)}
                      className="p-2 rounded-lg text-stone-400 hover:text-[#3D8A80] hover:bg-[#7BBFB5]/10 transition-all"
                      aria-label={`Edit ${bundle.name}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(bundle.id)}
                      className="p-2 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      aria-label={`Delete ${bundle.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmDelete(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm mx-4 bg-white rounded-xl shadow-xl border border-[#E8E3DA] p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-3" />
            <h3 className="font-playfair text-lg font-semibold text-stone-900 mb-2">Delete Bundle</h3>
            <p className="font-nunito text-sm text-stone-500 mb-6">
              This will delete the bundle and all its slots. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={isPending}
                className="px-5 py-2.5 rounded-[10px] font-nunito font-semibold text-sm text-stone-600 hover:bg-[#F2EEE8] transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={isPending}
                className="px-5 py-2.5 rounded-[10px] font-nunito font-semibold text-sm bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-50"
              >
                {isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
