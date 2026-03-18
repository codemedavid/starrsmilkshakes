import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import CategoriesContent from './CategoriesContent';

export default async function CategoriesPage() {
  await requireAdmin();

  const { data: categories } = await (supabaseServer
    .from('categories') as any)
    .select('*')
    .order('sort_order', { ascending: true });

  return <CategoriesContent categories={categories || []} />;
}
