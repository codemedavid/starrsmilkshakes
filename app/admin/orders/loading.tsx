export default function OrdersLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header skeleton */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-44 bg-[#E8E3DA] rounded-lg animate-pulse" />
            <div className="h-4 w-32 bg-[#E8E3DA]/60 rounded animate-pulse" />
          </div>
          <div className="h-9 w-24 bg-[#E8E3DA] rounded-[10px] animate-pulse" />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto space-y-6">
        {/* Stats strip skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#F2EEE8] rounded-xl border border-[#E8E3DA] p-5 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-24 bg-[#E8E3DA] rounded" />
                  <div className="h-7 w-14 bg-[#E8E3DA] rounded" />
                </div>
                <div className="h-11 w-11 bg-[#E8E3DA] rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        {/* Filters bar skeleton */}
        <div className="bg-white rounded-xl border border-[#E8E3DA] p-5 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 h-10 bg-[#E8E3DA] rounded-[10px]" />
            <div className="h-10 bg-[#E8E3DA] rounded-[10px]" />
            <div className="h-10 bg-[#E8E3DA] rounded-[10px]" />
            <div className="h-10 bg-[#E8E3DA] rounded-[10px]" />
          </div>
        </div>

        {/* Table skeleton */}
        <div className="bg-white rounded-xl border border-[#E8E3DA] overflow-hidden">
          {/* Table header */}
          <div className="bg-[#F2EEE8] border-b border-[#E8E3DA] px-4 py-3 hidden lg:grid grid-cols-9 gap-4 animate-pulse">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-3 bg-[#E8E3DA] rounded" />
            ))}
          </div>

          {/* Table rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="px-4 py-4 border-b border-[#E8E3DA] last:border-b-0 animate-pulse"
            >
              <div className="hidden lg:grid grid-cols-9 gap-4 items-center">
                <div className="h-4 w-4 bg-[#E8E3DA] rounded" />
                <div className="space-y-1.5">
                  <div className="h-4 w-20 bg-[#E8E3DA] rounded" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-4 w-28 bg-[#E8E3DA] rounded" />
                  <div className="h-3 w-20 bg-[#E8E3DA]/60 rounded" />
                </div>
                <div className="h-6 w-16 bg-[#E8E3DA] rounded-md" />
                <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
                <div className="h-6 w-20 bg-[#E8E3DA] rounded-md" />
                <div className="h-4 w-12 bg-[#E8E3DA] rounded" />
                <div className="h-3 w-24 bg-[#E8E3DA]/60 rounded" />
                <div className="h-4 w-10 bg-[#E8E3DA] rounded" />
              </div>

              {/* Mobile card skeleton */}
              <div className="lg:hidden flex items-start gap-3">
                <div className="h-5 w-5 bg-[#E8E3DA] rounded mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-[#E8E3DA] rounded" />
                  <div className="h-4 w-32 bg-[#E8E3DA]/70 rounded" />
                  <div className="h-3 w-24 bg-[#E8E3DA]/50 rounded" />
                </div>
                <div className="h-6 w-20 bg-[#E8E3DA] rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
