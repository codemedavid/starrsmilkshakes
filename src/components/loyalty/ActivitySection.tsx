import { supabaseServer } from '@/lib/supabase-server';
import ActivityList from './ActivityList';

interface Props {
  cardId: string;
}

export default async function ActivitySection({ cardId }: Props) {
  const { data } = await (supabaseServer.from('loyalty_transactions') as any)
    .select('id, type, stamps_delta, points_delta, description, created_at')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
      <ActivityList transactions={data ?? []} />
    </div>
  );
}
