export default function FacebookLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header skeleton */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-[#E8E3DA] rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-[#E8E3DA]/60 rounded animate-pulse" />
        </div>
      </div>

      {/* Card skeleton */}
      <div className="p-6">
        <div className="bg-[#F2EEE8] rounded-xl border border-[#E8E3DA] p-6 max-w-lg animate-pulse space-y-4">
          <div className="h-5 w-56 bg-[#E8E3DA] rounded" />
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#E8E3DA] rounded-full" />
            <div className="h-4 w-40 bg-[#E8E3DA]/60 rounded" />
          </div>
          <div className="h-4 w-72 bg-[#E8E3DA]/50 rounded" />
          <div className="h-10 w-48 bg-[#E8E3DA] rounded-[10px]" />
        </div>
      </div>
    </div>
  );
}
