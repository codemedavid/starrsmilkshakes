import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { mapMenuRows } from '@/lib/menu-utils';
import MenuContent from './MenuContent';

export default async function MenuPage() {
  await requireAdmin();

  const [{ data: menuItemsRaw }, { data: categories }] = await Promise.all([
    (supabaseServer.from('menu_items') as any)
      .select(`
        *,
        variations (*),
        add_ons (*)
      `)
      .order('created_at', { ascending: true }),
    (supabaseServer.from('categories') as any)
      .select('*')
      .order('sort_order', { ascending: true }),
  ]);

  const menuItems = mapMenuRows(menuItemsRaw);

  return <MenuContent menuItems={menuItems} categories={categories || []} />;
}
