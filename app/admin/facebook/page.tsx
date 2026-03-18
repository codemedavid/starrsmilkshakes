import { requireSuperAdmin } from '@/lib/admin-guard';
import FacebookContent from './FacebookContent';

export default async function FacebookPage() {
  await requireSuperAdmin(); // Only super admins can access
  return <FacebookContent />;
}
