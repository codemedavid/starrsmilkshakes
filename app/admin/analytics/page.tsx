import { requireAdmin } from '@/lib/admin-guard';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';

export default async function AnalyticsPage() {
  await requireAdmin();
  return <AnalyticsDashboard />;
}
