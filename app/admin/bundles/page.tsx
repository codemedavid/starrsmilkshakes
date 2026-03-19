import { requireAdmin } from '@/lib/admin-guard';
import { getCachedBundles, getCachedCategories, getCachedMenuItems } from '@/lib/cached-queries';
import BundleContent from './BundleContent';

export default async function BundlesPage() {
  await requireAdmin();
  const [bundles, categories, menuItems] = await Promise.all([
    getCachedBundles(),
    getCachedCategories(),
    getCachedMenuItems(),
  ]);
  return <BundleContent bundles={bundles} categories={categories} menuItems={menuItems} />;
}
