// ─── Loyalty Page Skeleton Components ─────────────────────────────────────────

function PulseBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-stone-100 ${className ?? ''}`} />;
}

export function RedemptionsSkeleton() {
  return (
    <div className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 border-2 border-emerald-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-emerald-100" />
        <PulseBar className="h-3 w-24 !bg-emerald-100" />
      </div>
      <div className="space-y-2.5">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 bg-white border border-emerald-200/80 rounded-xl px-4 py-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 shrink-0" />
            <div className="flex-1 space-y-2">
              <PulseBar className="h-3.5 w-32 !bg-emerald-100" />
              <PulseBar className="h-2.5 w-24 !bg-emerald-50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoosterSkeleton() {
  return (
    <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-purple-100" />
        <PulseBar className="h-3 w-28 !bg-purple-50" />
      </div>
      <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200/80">
        <div className="w-9 h-9 rounded-lg bg-purple-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <PulseBar className="h-3.5 w-36 !bg-purple-100" />
          <PulseBar className="h-2.5 w-20 !bg-purple-50" />
        </div>
      </div>
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
      <PulseBar className="h-3 w-28 mb-4" />
      <div className="space-y-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-[#F5F1EB] last:border-0">
            <div className="w-8 h-8 rounded-lg bg-stone-100 shrink-0 animate-pulse" />
            <div className="flex-1 space-y-2">
              <PulseBar className="h-3 w-40" />
              <PulseBar className="h-2.5 w-20" />
            </div>
            <PulseBar className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
