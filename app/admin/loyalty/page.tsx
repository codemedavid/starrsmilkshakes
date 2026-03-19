import { requireAdmin } from '@/lib/admin-guard';
import {
  getCachedLoyaltyConfig,
  getCachedLoyaltyRewards,
  getCachedLoyaltyBoosters,
  getCachedLoyaltyStats,
} from '@/lib/cached-queries';
import LoyaltyContent from './LoyaltyContent';

export default async function LoyaltyPage() {
  await requireAdmin();
  const [config, rewards, boosters, stats] = await Promise.all([
    getCachedLoyaltyConfig(),
    getCachedLoyaltyRewards(),
    getCachedLoyaltyBoosters(),
    getCachedLoyaltyStats(),
  ]);
  return (
    <LoyaltyContent
      initialConfig={config}
      initialRewards={rewards}
      initialBoosters={boosters}
      initialStats={stats}
    />
  );
}
