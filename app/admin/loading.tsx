export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Top bar skeleton */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-4">
        <div className="h-8 w-48 bg-[#E8E3DA] rounded-lg animate-pulse" />
      </div>

      {/* Content skeleton */}
      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-[#E8E3DA] p-5 space-y-3 animate-pulse"
            >
              <div className="h-3 w-20 bg-[#E8E3DA] rounded" />
              <div className="h-7 w-16 bg-[#E8E3DA] rounded" />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="bg-white rounded-xl border border-[#E8E3DA] overflow-hidden animate-pulse">
          {/* Table header */}
          <div className="border-b border-[#E8E3DA] px-5 py-3 flex gap-6">
            <div className="h-4 w-24 bg-[#E8E3DA] rounded" />
            <div className="h-4 w-32 bg-[#E8E3DA] rounded" />
            <div className="h-4 w-20 bg-[#E8E3DA] rounded" />
            <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
          </div>

          {/* Table rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="border-b border-[#E8E3DA] last:border-b-0 px-5 py-4 flex gap-6 items-center"
            >
              <div className="h-4 w-24 bg-[#E8E3DA]/60 rounded" />
              <div className="h-4 w-40 bg-[#E8E3DA]/60 rounded" />
              <div className="h-4 w-20 bg-[#E8E3DA]/60 rounded" />
              <div className="h-6 w-16 bg-[#E8E3DA]/40 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
