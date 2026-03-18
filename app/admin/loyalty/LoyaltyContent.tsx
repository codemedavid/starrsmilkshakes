'use client';

import { useState } from 'react';
import type { LoyaltyConfig, LoyaltyReward } from '@/types/loyalty';
import LoyaltyConfigTab from '@/components/admin/LoyaltyConfigTab';
import LoyaltyRewardsTab from '@/components/admin/LoyaltyRewardsTab';

interface Props {
  initialConfig: LoyaltyConfig;
  initialRewards: LoyaltyReward[];
  initialStats: { active_cards: number; pending_claims: number; rewards_claimed: number };
}

const tabs = ['Configuration', 'Rewards', 'Boosters', 'Redemptions', 'Lookup'] as const;
type Tab = typeof tabs[number];

export default function LoyaltyContent({ initialConfig, initialRewards, initialStats }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Configuration');

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-playfair font-semibold text-stone-800">Loyalty Program</h1>
          <p className="text-sm text-stone-500 mt-1">Manage rewards, boosters, and track customer loyalty</p>
        </div>
        <span className="text-xs font-medium px-3 py-1 rounded-full bg-[#7BBFB5]/10 text-[#3D8A80]">
          Active
        </span>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active Cards" value={initialStats.active_cards} accent="teal" />
        <StatCard label="Pending Claims" value={initialStats.pending_claims} accent="amber" />
        <StatCard label="Rewards Claimed" value={initialStats.rewards_claimed} accent="purple" />
        <StatCard label="Rewards Available" value={initialRewards.filter((r) => r.is_active).length} accent="blue" />
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[#E8E3DA] mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-nunito font-medium transition-colors ${
              activeTab === tab
                ? 'text-[#3D8A80] border-b-2 border-[#7BBFB5]'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Configuration' && <LoyaltyConfigTab initialConfig={initialConfig} />}
      {activeTab === 'Rewards' && <LoyaltyRewardsTab initialRewards={initialRewards} />}
      {activeTab === 'Boosters' && <PlaceholderTab name="Boosters" />}
      {activeTab === 'Redemptions' && <PlaceholderTab name="Redemptions" />}
      {activeTab === 'Lookup' && <PlaceholderTab name="Lookup" />}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const colors: Record<string, string> = {
    teal: 'text-[#3D8A80]',
    amber: 'text-amber-600',
    purple: 'text-purple-600',
    blue: 'text-blue-600',
  };
  return (
    <div className="bg-white border border-[#E8E3DA] rounded-xl p-4">
      <p className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colors[accent] ?? 'text-stone-800'}`}>{value}</p>
    </div>
  );
}

function PlaceholderTab({ name }: { name: string }) {
  return (
    <div className="text-center py-12 text-stone-400">
      <p className="text-lg">{name} tab — coming soon</p>
    </div>
  );
}
