export default function BranchesLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header skeleton */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-32 bg-[#E8E3DA] rounded-lg animate-pulse" />
            <div className="h-4 w-48 bg-[#E8E3DA]/60 rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-[#E8E3DA] rounded-[10px] animate-pulse" />
        </div>
      </div>

      {/* Branch card skeletons */}
      <div className="p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-[#E8E3DA] p-5 animate-pulse"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-5 w-36 bg-[#E8E3DA] rounded" />
              <div className="h-5 w-14 bg-[#E8E3DA]/60 rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-64 bg-[#E8E3DA]/50 rounded" />
              <div className="h-4 w-40 bg-[#E8E3DA]/50 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
