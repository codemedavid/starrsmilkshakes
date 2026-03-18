import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import OrdersContent from './OrdersContent';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const { adminType } = await requireAdmin();

  // Prefetch initial orders
  const { data: initialOrders } = await (supabaseServer as any)
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(50);

  // Prefetch branches for filter dropdown
  const { data: branches } = await (supabaseServer as any)
    .from('branches')
    .select('id, name');

  return (
    <OrdersContent
      initialOrders={initialOrders || []}
      branches={branches || []}
      adminType={adminType}
    />
  );
}
