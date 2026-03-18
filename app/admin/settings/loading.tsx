export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header skeleton */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="space-y-2">
          <div className="h-7 w-36 bg-[#E8E3DA] rounded-lg animate-pulse" />
          <div className="h-4 w-60 bg-[#E8E3DA]/60 rounded animate-pulse" />
        </div>
      </div>

      {/* Section skeletons */}
      <div className="p-6 max-w-3xl space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-[#F2EEE8] rounded-xl border border-[#E8E3DA] overflow-hidden animate-pulse"
          >
            {/* Section header */}
            <div className="px-6 py-4 border-b border-[#E8E3DA] bg-white/60">
              <div className="h-5 w-40 bg-[#E8E3DA] rounded" />
            </div>

            {/* Fields */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className={j === 0 ? 'md:col-span-2' : ''}>
                  <div className="h-4 w-24 bg-[#E8E3DA] rounded mb-2" />
                  <div className="h-10 w-full bg-[#E8E3DA]/60 rounded-[10px]" />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Save button skeleton */}
        <div className="flex justify-end pt-2">
          <div className="h-10 w-32 bg-[#E8E3DA] rounded-[10px] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
