export default function MenuLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header skeleton */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-24 bg-[#E8E3DA] rounded-lg animate-pulse" />
            <div className="h-4 w-56 bg-[#E8E3DA]/60 rounded animate-pulse" />
          </div>
          <div className="h-10 w-28 bg-[#E8E3DA] rounded-[10px] animate-pulse" />
        </div>
      </div>

      {/* Category group skeletons */}
      <div className="p-6 space-y-8">
        {Array.from({ length: 2 }).map((_, groupIdx) => (
          <div key={groupIdx}>
            {/* Category heading skeleton */}
            <div className="flex items-center gap-2 mb-4">
              <div className="h-6 w-6 bg-[#E8E3DA] rounded animate-pulse" />
              <div className="h-5 w-32 bg-[#E8E3DA] rounded animate-pulse" />
              <div className="h-5 w-6 bg-[#E8E3DA]/60 rounded-full animate-pulse" />
            </div>

            {/* Card grid skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-[#E8E3DA] overflow-hidden animate-pulse"
                >
                  {/* Image placeholder */}
                  <div className="h-36 bg-[#E8E3DA]/40" />

                  <div className="p-4 space-y-3">
                    {/* Title */}
                    <div className="h-5 w-40 bg-[#E8E3DA] rounded" />
                    {/* Description */}
                    <div className="h-3 w-full bg-[#E8E3DA]/50 rounded" />
                    {/* Price */}
                    <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
                    {/* Badges */}
                    <div className="flex gap-1.5">
                      <div className="h-4 w-14 bg-[#E8E3DA]/50 rounded-full" />
                      <div className="h-4 w-12 bg-[#E8E3DA]/50 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
