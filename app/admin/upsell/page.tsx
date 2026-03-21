import { requireAdmin } from '@/lib/admin-guard';
import {
  getCachedUpsellRules,
  getCachedAddonSuggestions,
  getCachedPairRules,
  getCachedMenuItems,
  getCachedCategories,
  getCachedBundles,
} from '@/lib/cached-queries';
import UpsellContent from './UpsellContent';

export default async function UpsellPage() {
  await requireAdmin();
  const [rules, suggestions, pairRules, menuItems, categories, bundles] = await Promise.all([
    getCachedUpsellRules(),
    getCachedAddonSuggestions(),
    getCachedPairRules(),
    getCachedMenuItems(),
    getCachedCategories(),
    getCachedBundles(),
  ]);
  return (
    <UpsellContent
      rules={rules}
      suggestions={suggestions}
      pairRules={pairRules}
      menuItems={menuItems}
      categories={categories}
      bundles={bundles}
    />
  );
}
