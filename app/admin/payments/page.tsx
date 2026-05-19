import { requireAdmin } from '@/lib/admin-guard';
import { getCachedPaymentMethods, getCachedBranches } from '@/lib/cached-queries';
import PaymentsContent from './PaymentsContent';

export default async function PaymentsPage() {
  await requireAdmin();
  const [paymentMethods, branches] = await Promise.all([
    getCachedPaymentMethods(),
    getCachedBranches(),
  ]);
  return <PaymentsContent paymentMethods={paymentMethods} branches={branches} />;
}
