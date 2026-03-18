export default function CategoriesLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header skeleton */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-36 bg-[#E8E3DA] rounded-lg animate-pulse" />
            <div className="h-4 w-56 bg-[#E8E3DA]/60 rounded animate-pulse" />
          </div>
          <div className="h-10 w-36 bg-[#E8E3DA] rounded-[10px] animate-pulse" />
        </div>
        {/* Tab skeletons */}
        <div className="flex gap-2 mt-4">
          <div className="h-8 w-28 bg-[#E8E3DA]/60 rounded-lg animate-pulse" />
          <div className="h-8 w-20 bg-[#E8E3DA]/60 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Category card skeletons */}
      <div className="p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-[#E8E3DA] p-5 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#E8E3DA] rounded-lg flex-shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-32 bg-[#E8E3DA] rounded" />
                <div className="h-3 w-20 bg-[#E8E3DA]/50 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
