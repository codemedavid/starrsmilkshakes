import { requireAdmin } from '@/lib/admin-guard';
import { getCachedCategories } from '@/lib/cached-queries';
import CategoriesContent from './CategoriesContent';

export default async function CategoriesPage() {
  await requireAdmin();
  const categories = await getCachedCategories();
  return <CategoriesContent categories={categories} />;
}
