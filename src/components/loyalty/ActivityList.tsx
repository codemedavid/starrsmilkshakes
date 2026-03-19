// ─── ActivityList ─────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: string;
  stamps_delta: number;
  points_delta: number;
  description: string;
  created_at: string;
}

interface ActivityListProps {
  transactions: Transaction[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function DeltaBadge({ value, unit, color }: { value: number; unit: string; color: string }) {
  if (value === 0) return null;
  const sign = value > 0 ? '+' : '';
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {sign}{value} {unit}
    </span>
  );
}

export default function ActivityList({ transactions }: ActivityListProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-3">
        Recent Activity
      </h2>

      {transactions.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-6">
          No activity yet
        </p>
      ) : (
        <ul className="space-y-1">
          {transactions.map((tx) => {
            const isRedemption = tx.type === 'redeem';
            return (
              <li
                key={tx.id}
                className="flex items-center justify-between py-3 border-b border-[#F0EBE0] last:border-0"
              >
                {/* Left: description + date */}
                <div className="min-w-0 pr-3">
                  <p className="text-sm text-stone-800 truncate">
                    {tx.description}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {formatDate(tx.created_at)}
                  </p>
                </div>

                {/* Right: deltas */}
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  {tx.stamps_delta !== 0 && (
                    <DeltaBadge
                      value={tx.stamps_delta}
                      unit="⭐"
                      color={
                        isRedemption
                          ? 'text-purple-600'
                          : 'text-emerald-600'
                      }
                    />
                  )}
                  {tx.points_delta !== 0 && (
                    <DeltaBadge
                      value={tx.points_delta}
                      unit="pts"
                      color={
                        isRedemption
                          ? 'text-purple-600'
                          : 'text-amber-600'
                      }
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
