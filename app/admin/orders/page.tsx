import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { getCachedBranchOptions } from '@/lib/cached-queries';
import OrdersContent from './OrdersContent';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const { adminType } = await requireAdmin();

  // Parallelize: orders are always fresh, branches come from cache
  const [{ data: initialOrders }, branches] = await Promise.all([
    (supabaseServer as any)
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(50),
    getCachedBranchOptions(),
  ]);

  return (
    <OrdersContent
      initialOrders={initialOrders || []}
      branches={branches}
      adminType={adminType}
    />
  );
}
