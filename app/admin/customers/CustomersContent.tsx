'use client';

import { useState, useCallback } from 'react';
import CustomerSearch from '@/components/admin/CustomerSearch';
import CustomerDetailPanel from '@/components/CustomerDetailPanel';
import type { CustomerStats } from '@/components/admin/CustomerSearch';
import type { CustomerSummary } from '@/types/customer';

interface CustomersContentProps {
  initialCustomers: CustomerSummary[];
  initialTotal: number;
  initialTotalLtv: number;
  initialAtRiskCount: number;
}

const formatCurrency = (amount: number): string =>
  `P${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function CustomersContent({
  initialCustomers,
  initialTotal,
  initialTotalLtv,
  initialAtRiskCount,
}: CustomersContentProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Stats are seeded from SSR with real data, then kept current via onStatsChange callback.
  const [stats, setStats] = useState<CustomerStats>({
    total: initialTotal,
    totalLtv: initialTotalLtv,
    atRiskCount: initialAtRiskCount,
  });

  const handleStatsChange = useCallback((next: CustomerStats) => {
    setStats(next);
  }, []);

  const handleCustomerDeleted = useCallback((id: string) => {
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Page header */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <h1 className="font-playfair text-2xl font-semibold text-stone-900">
          Customer Management
        </h1>
        <p className="font-nunito text-sm text-stone-500 mt-1">
          View and manage your customer profiles
        </p>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div
            className="bg-[#F2EEE8] rounded-xl p-4 border border-[#E8E3DA] transition-all duration-200 hover:shadow-sm"
            aria-label={`Total Customers: ${stats.total}`}
          >
            <div className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wider mb-1">
              Total Customers
            </div>
            <div className="text-2xl font-nunito font-bold text-[#3D8A80] tabular-nums">
              {stats.total}
            </div>
          </div>

          <div
            className="bg-[#F2EEE8] rounded-xl p-4 border border-[#E8E3DA] transition-all duration-200 hover:shadow-sm"
            aria-label={`Total LTV: ${formatCurrency(stats.totalLtv)}`}
          >
            <div className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wider mb-1">
              Total LTV
            </div>
            <div className="text-2xl font-nunito font-bold text-[#3D8A80] tabular-nums">
              {formatCurrency(stats.totalLtv)}
            </div>
          </div>

          <div
            className="bg-[#F2EEE8] rounded-xl p-4 border border-[#E8E3DA] transition-all duration-200 hover:shadow-sm"
            aria-label={`At Risk: ${stats.atRiskCount}`}
          >
            <div className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wider mb-1">
              At Risk
            </div>
            <div className="text-2xl font-nunito font-bold text-red-600 tabular-nums">
              {stats.atRiskCount}
            </div>
            {stats.atRiskCount > 0 && (
              <div className="text-xs font-nunito text-red-500 mt-0.5">inactive &gt;30 days</div>
            )}
          </div>
        </div>

        {/* Split pane */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left pane — 40% */}
          <div className="w-full lg:w-[40%] lg:min-w-[380px] flex flex-col">
            <CustomerSearch
              selectedId={selectedId}
              onSelect={setSelectedId}
              onStatsChange={handleStatsChange}
              onCustomerDeleted={handleCustomerDeleted}
              initialCustomers={initialCustomers}
              initialTotal={initialTotal}
            />
          </div>

          {/* Right pane — 60% */}
          <div className="w-full lg:w-[60%] lg:min-w-[500px] lg:flex-1">
            <CustomerDetailPanel
              customerId={selectedId}
              onDelete={handleCustomerDeleted}
              onCustomerUpdated={() => {
                // CustomerDetailPanel refetches its own customer on update;
                // the list will stay consistent on next search/filter change.
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
