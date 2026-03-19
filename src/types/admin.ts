import type { MenuItem, OrderStats, SiteSettings, Category } from '@/types';

export interface AdminPrefetchedData {
  isAuthenticated: boolean;
  adminConfigured: boolean;
  menuItems: MenuItem[];
  categories: Category[];
  siteSettings: SiteSettings | null;
  orderStats: OrderStats | null;
}
