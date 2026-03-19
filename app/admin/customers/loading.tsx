export default function CustomersLoading() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header skeleton */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="space-y-2">
          <div className="h-7 w-52 bg-[#E8E3DA] rounded-lg animate-pulse" />
          <div className="h-4 w-64 bg-[#E8E3DA]/60 rounded animate-pulse" />
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary strip skeleton */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-[#F2EEE8] rounded-xl p-4 border border-[#E8E3DA] animate-pulse"
            >
              <div className="h-3 w-24 bg-[#E8E3DA]/80 rounded mb-2" />
              <div className="h-7 w-16 bg-[#E8E3DA] rounded" />
            </div>
          ))}
        </div>

        {/* Split pane skeleton */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left pane */}
          <div className="w-full lg:w-[40%] lg:min-w-[380px]">
            {/* Search input skeleton */}
            <div className="h-10 w-full bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] mb-3 animate-pulse" />
            {/* Tag filter skeleton */}
            <div className="h-10 w-full bg-[#F2EEE8] border border-[#E8E3DA] rounded-[10px] mb-4 animate-pulse" />
            {/* Add button skeleton */}
            <div className="flex justify-end mb-4">
              <div className="h-10 w-36 bg-[#E8E3DA] rounded-[10px] animate-pulse" />
            </div>
            {/* List skeleton */}
            <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="p-4 border-b border-[#E8E3DA] animate-pulse">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="h-4 w-32 bg-[#E8E3DA] rounded" />
                      <div className="h-3 w-24 bg-[#E8E3DA]/60 rounded mt-2" />
                      <div className="flex gap-1.5 mt-2">
                        <div className="h-5 w-12 bg-[#E8E3DA]/40 rounded-full" />
                        <div className="h-5 w-12 bg-[#E8E3DA]/40 rounded-full" />
                      </div>
                    </div>
                    <div className="h-4 w-16 bg-[#E8E3DA] rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right pane */}
          <div className="w-full lg:w-[60%] lg:min-w-[500px] lg:flex-1">
            <div className="bg-white rounded-xl border border-[#E8E3DA] shadow-sm overflow-hidden h-[calc(100vh-180px)]">
              {/* Teal header skeleton */}
              <div className="h-28 bg-[#E8E3DA] rounded-t-xl animate-pulse" />
              {/* Stats grid skeleton */}
              <div className="grid grid-cols-3 gap-3 p-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 bg-[#E8E3DA]/60 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
