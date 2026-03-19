'use client';

import { useState } from 'react';
import { CreditCard, Clock, Gift, Star, Settings, Zap, Ticket, Search, Trophy } from 'lucide-react';
import type { LoyaltyConfig, LoyaltyGoal, LoyaltyBooster, LoyaltyMilestone } from '@/types/loyalty';
import LoyaltyConfigTab from '@/components/admin/LoyaltyConfigTab';
import LoyaltyGoalsTab from '@/components/admin/LoyaltyGoalsTab';
import LoyaltyMilestonesTab from '@/components/admin/LoyaltyMilestonesTab';
import LoyaltyBoostersTab from '@/components/admin/LoyaltyBoostersTab';
import LoyaltyRedemptionsTab from '@/components/admin/LoyaltyRedemptionsTab';
import LoyaltyLookupTab from '@/components/admin/LoyaltyLookupTab';

interface Props {
  initialConfig: LoyaltyConfig;
  initialGoals: LoyaltyGoal[];
  initialMilestones: LoyaltyMilestone[];
  initialBoosters: LoyaltyBooster[];
  initialStats: { active_cards: number; pending_claims: number; rewards_claimed: number };
}

const TAB_DEFS = [
  { key: 'Configuration', icon: Settings, label: 'Config' },
  { key: 'Goals', icon: Gift, label: 'Goals' },
  { key: 'Milestones', icon: Trophy, label: 'Milestones' },
  { key: 'Boosters', icon: Zap, label: 'Boosters' },
  { key: 'Redemptions', icon: Ticket, label: 'Redemptions' },
  { key: 'Lookup', icon: Search, label: 'Lookup' },
] as const;

type Tab = typeof TAB_DEFS[number]['key'];

export default function LoyaltyContent({ initialConfig, initialGoals, initialMilestones, initialBoosters, initialStats }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Configuration');

  const activeRewardsCount = initialGoals.filter((r) => r.is_active).length;

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-playfair font-semibold text-stone-800">Loyalty Program</h1>
          <p className="text-sm font-nunito text-stone-500 mt-1">Manage rewards, boosters, and track customer loyalty</p>
        </div>
        <span className="text-xs font-nunito font-medium px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          Active
        </span>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Active Cards"
          value={initialStats.active_cards}
          icon={<CreditCard className="h-4 w-4" />}
          accentBg="bg-[#7BBFB5]/10"
          accentText="text-[#3D8A80]"
          accentBorder="border-[#7BBFB5]/30"
        />
        <StatCard
          label="Pending Claims"
          value={initialStats.pending_claims}
          icon={<Clock className="h-4 w-4" />}
          accentBg="bg-amber-50"
          accentText="text-amber-700"
          accentBorder="border-amber-200"
          highlight={initialStats.pending_claims > 0}
        />
        <StatCard
          label="Rewards Claimed"
          value={initialStats.rewards_claimed}
          icon={<Gift className="h-4 w-4" />}
          accentBg="bg-purple-50"
          accentText="text-purple-700"
          accentBorder="border-purple-200"
        />
        <StatCard
          label="Goals Available"
          value={activeRewardsCount}
          icon={<Star className="h-4 w-4" />}
          accentBg="bg-blue-50"
          accentText="text-blue-700"
          accentBorder="border-blue-200"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[#E8E3DA] mb-6 overflow-x-auto scrollbar-none">
        {TAB_DEFS.map(({ key, icon: Icon, label }) => {
          const isActive = activeTab === key;
          // Show badge on Redemptions if there are pending claims
          const badge = key === 'Redemptions' && initialStats.pending_claims > 0
            ? initialStats.pending_claims
            : null;

          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-nunito font-medium transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'text-[#3D8A80] border-b-2 border-[#7BBFB5]'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-[#3D8A80]' : 'text-stone-400'}`} />
              <span className="hidden sm:inline">{key}</span>
              <span className="sm:hidden">{label}</span>
              {badge != null && (
                <span className="ml-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'Configuration' && <LoyaltyConfigTab initialConfig={initialConfig} />}
      {activeTab === 'Goals' && <LoyaltyGoalsTab initialGoals={initialGoals} />}
      {activeTab === 'Milestones' && <LoyaltyMilestonesTab initialMilestones={initialMilestones} />}
      {activeTab === 'Boosters' && <LoyaltyBoostersTab initialBoosters={initialBoosters} />}
      {activeTab === 'Redemptions' && <LoyaltyRedemptionsTab />}
      {activeTab === 'Lookup' && <LoyaltyLookupTab />}
    </div>
  );
}

/* ─── Stat Card ─────────────────────────────────────────────────────────────── */

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  highlight?: boolean;
}

function StatCard({ label, value, icon, accentBg, accentText, accentBorder, highlight }: StatCardProps) {
  return (
    <div className={`bg-white border rounded-xl p-4 transition-all ${
      highlight ? `${accentBorder} border-2 shadow-sm` : 'border-[#E8E3DA]'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-nunito font-medium text-stone-500 uppercase tracking-wide">{label}</p>
        <div className={`p-1.5 rounded-lg ${accentBg} ${accentText}`}>
          {icon}
        </div>
      </div>
      <p className={`text-2xl font-bold ${accentText}`}>{value.toLocaleString()}</p>
    </div>
  );
}
