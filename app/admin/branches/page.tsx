import { requireAdmin } from '@/lib/admin-guard';
import { getCachedBranches } from '@/lib/cached-queries';
import BranchesContent from './BranchesContent';

export default async function BranchesPage() {
  await requireAdmin();
  const branches = await getCachedBranches();
  return <BranchesContent branches={branches} />;
}
