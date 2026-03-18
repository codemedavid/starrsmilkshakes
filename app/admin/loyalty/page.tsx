import { requireAdmin } from '@/lib/admin-guard';
import { getCachedLoyaltyConfig, getCachedLoyaltyRewards, getCachedLoyaltyStats } from '@/lib/cached-queries';
import LoyaltyContent from './LoyaltyContent';

export default async function LoyaltyPage() {
  await requireAdmin();
  const [config, rewards, stats] = await Promise.all([
    getCachedLoyaltyConfig(),
    getCachedLoyaltyRewards(),
    getCachedLoyaltyStats(),
  ]);
  return <LoyaltyContent initialConfig={config} initialRewards={rewards} initialStats={stats} />;
}
