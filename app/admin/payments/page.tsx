import { requireAdmin } from '@/lib/admin-guard';
import { getCachedPaymentMethods } from '@/lib/cached-queries';
import PaymentsContent from './PaymentsContent';

export default async function PaymentsPage() {
  await requireAdmin();
  const paymentMethods = await getCachedPaymentMethods();
  return <PaymentsContent paymentMethods={paymentMethods} />;
}
