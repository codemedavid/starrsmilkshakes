import { requireAdmin } from '@/lib/admin-guard';
import { getCachedInitialCustomers } from '@/lib/cached-queries';
import CustomersContent from './CustomersContent';

export default async function CustomersPage() {
  await requireAdmin();
  const { customers, total, totalLtv, atRiskCount } = await getCachedInitialCustomers();
  return (
    <CustomersContent
      initialCustomers={customers}
      initialTotal={total}
      initialTotalLtv={totalLtv}
      initialAtRiskCount={atRiskCount}
    />
  );
}
