import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import BranchesContent from './BranchesContent';

export default async function BranchesPage() {
  await requireAdmin();

  const { data: branches } = await (supabaseServer
    .from('branches') as any)
    .select('*')
    .order('created_at', { ascending: true });

  return <BranchesContent branches={branches || []} />;
}
