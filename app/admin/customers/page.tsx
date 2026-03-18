import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import CustomersContent from './CustomersContent';

export default async function CustomersPage() {
  await requireAdmin();

  const { count: totalCustomers } = await (supabaseServer
    .from('customers') as any)
    .select('*', { count: 'exact', head: true });

  return <CustomersContent initialTotal={totalCustomers || 0} />;
}
