import { requireAdmin } from '@/lib/admin-guard';
import {
  getCachedLoyaltyConfig,
  getCachedLoyaltyGoals,
  getCachedLoyaltyMilestones,
  getCachedLoyaltyBoosters,
  getCachedLoyaltyStats,
} from '@/lib/cached-queries';
import LoyaltyContent from './LoyaltyContent';
import type { LoyaltyConfig } from '@/types/loyalty';

const DEFAULT_CONFIG: LoyaltyConfig = {
  id: '',
  stamps_enabled: true,
  points_enabled: true,
  points_per_peso: 0.1,
  stamps_per_order: 1,
  filter_mode: 'blocklist',
  filtered_category_ids: [],
  filtered_item_ids: [],
  claim_window_days: 7,
  updated_at: new Date().toISOString(),
};

export default async function LoyaltyPage() {
  await requireAdmin();
  const [config, goals, milestones, boosters, stats] = await Promise.all([
    getCachedLoyaltyConfig(),
    getCachedLoyaltyGoals(),
    getCachedLoyaltyMilestones(),
    getCachedLoyaltyBoosters(),
    getCachedLoyaltyStats(),
  ]);
  return (
    <LoyaltyContent
      initialConfig={config ?? DEFAULT_CONFIG}
      initialGoals={goals}
      initialMilestones={milestones}
      initialBoosters={boosters}
      initialStats={stats}
    />
  );
}
