import { requireAdmin } from '@/lib/admin-guard';
import { getCachedMenuItems, getCachedCategories } from '@/lib/cached-queries';
import MenuContent from './MenuContent';

export default async function MenuPage() {
  await requireAdmin();

  const [menuItems, categories] = await Promise.all([
    getCachedMenuItems(),
    getCachedCategories(),
  ]);

  return <MenuContent menuItems={menuItems} categories={categories} />;
}
