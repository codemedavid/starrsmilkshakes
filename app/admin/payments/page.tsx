import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import PaymentsContent from './PaymentsContent';
import type { PaymentMethod } from '@/hooks/usePaymentMethods';

export default async function PaymentsPage() {
  await requireAdmin();

  const { data: paymentMethods } = await (supabaseServer
    .from('payment_methods') as any)
    .select('*')
    .order('sort_order', { ascending: true });

  return <PaymentsContent paymentMethods={(paymentMethods as PaymentMethod[]) || []} />;
}
