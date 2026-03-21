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

/** Icon + background color per transaction type */
function txMeta(type: string): { icon: string; bgClass: string; label: string } {
  switch (type) {
    case 'earn':
      return { icon: '+', bgClass: 'bg-emerald-100 text-emerald-700', label: 'Earned' };
    case 'redeem':
      return { icon: '🎁', bgClass: 'bg-purple-100 text-purple-700', label: 'Redeemed' };
    case 'expire':
      return { icon: '−', bgClass: 'bg-stone-100 text-stone-500', label: 'Expired' };
    case 'adjust':
      return { icon: '~', bgClass: 'bg-amber-100 text-amber-700', label: 'Adjusted' };
    default:
      return { icon: '·', bgClass: 'bg-stone-100 text-stone-500', label: 'Activity' };
  }
}

function DeltaBadge({ value, unit, positive }: { value: number; unit: string; positive: boolean }) {
  if (value === 0) return null;
  const sign = value > 0 ? '+' : '';
  return (
    <span
      className={[
        'inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full',
        positive
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-purple-50 text-purple-700',
      ].join(' ')}
    >
      {sign}{value} {unit}
    </span>
  );
}

export default function ActivityList({ transactions }: ActivityListProps) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">
        Recent Activity
      </h2>

      {transactions.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-[#F0EBE0] flex items-center justify-center mx-auto mb-3">
            <span className="text-xl text-stone-300" aria-hidden="true">⭐</span>
          </div>
          <p className="text-sm font-medium text-stone-500 mb-1">
            No activity yet
          </p>
          <p className="text-xs text-stone-400">
            Your stamps and points will show up here after your first order.
          </p>
        </div>
      ) : (
        <ul className="space-y-0.5" role="list" aria-label="Transaction history">
          {transactions.map((tx) => {
            const meta = txMeta(tx.type);
            const isPositive = tx.type === 'earn';
            return (
              <li
                key={tx.id}
                className="flex items-center gap-3 py-3 border-b border-[#F5F1EB] last:border-0"
              >
                {/* Type icon */}
                <div
                  className={[
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold',
                    meta.bgClass,
                  ].join(' ')}
                  aria-label={meta.label}
                >
                  {meta.icon}
                </div>

                {/* Description + date */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-stone-800 truncate leading-snug">
                    {tx.description}
                  </p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    {formatDate(tx.created_at)}
                  </p>
                </div>

                {/* Delta badges */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {tx.stamps_delta !== 0 && (
                    <DeltaBadge
                      value={tx.stamps_delta}
                      unit="⭐"
                      positive={isPositive}
                    />
                  )}
                  {tx.points_delta !== 0 && (
                    <DeltaBadge
                      value={tx.points_delta}
                      unit="pts"
                      positive={isPositive}
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
