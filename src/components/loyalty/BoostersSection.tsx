import { getCachedActiveBoosters } from '@/lib/cached-queries';
import BoosterBanner from './BoosterBanner';

export default async function BoostersSection() {
  const allBoosters = await getCachedActiveBoosters();

  // Filter by current date at render time (not in cache)
  const now = new Date().toISOString();
  const activeBoosters = allBoosters.filter(
    (b: { starts_at: string; ends_at: string }) => b.starts_at <= now && b.ends_at >= now,
  );

  if (activeBoosters.length === 0) return null;

  return (
    <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center">
          <span className="text-xs" aria-hidden="true">🚀</span>
        </div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
          Active Boosters
        </p>
      </div>
      <BoosterBanner boosters={activeBoosters} />
    </div>
  );
}
