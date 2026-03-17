import { cookies } from 'next/headers';
import { isAdminSessionValid, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import { mapMenuRows } from '@/lib/menu-utils';
import { mapSiteSettingsRows } from '@/lib/site-settings';
import type { OrderStats } from '@/types';
import type { AdminPrefetchedData } from '@/types/admin';
import AdminDashboard from '@/components/AdminDashboard';

export const dynamic = 'force-dynamic';

async function prefetchAdminData(): Promise<AdminPrefetchedData> {
  const defaults: AdminPrefetchedData = {
    isAuthenticated: false,
    adminConfigured: false,
    menuItems: [],
    categories: [],
    siteSettings: null,
    orderStats: null,
  };

  try {
    // Check admin session from cookies
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    const isAuthenticated = isAdminSessionValid(sessionCookie);

    // Check if admin auth is configured
    const adminPassword = process.env.ADMIN_PASSWORD?.trim() || '';
    const adminSecret = process.env.ADMIN_SESSION_SECRET?.trim() || '';
    const adminConfigured = Boolean(adminPassword && adminSecret);

    if (!isAuthenticated) {
      return { ...defaults, adminConfigured };
    }

    // Prefetch all data in parallel for authenticated admins
    const [menuResult, categoriesResult, settingsResult, statsResult] = await Promise.all([
      // Menu items with variations and add-ons
      (supabaseServer.from('menu_items') as any)
        .select(`*, variations (*), add_ons (*)`)
        .order('created_at', { ascending: true }),

      // Categories
      (supabaseServer.from('categories') as any)
        .select('*')
        .order('sort_order', { ascending: true }),

      // Site settings
      (supabaseServer.from('site_settings') as any)
        .select('*')
        .order('id'),

      // Order stats - all 6 queries in parallel
      prefetchOrderStats(),
    ]);

    return {
      isAuthenticated: true,
      adminConfigured,
      menuItems: menuResult.error ? [] : mapMenuRows(menuResult.data as any[]),
      categories: categoriesResult.error ? [] : (categoriesResult.data || []),
      siteSettings: settingsResult.error ? null : mapSiteSettingsRows(settingsResult.data as any[]),
      orderStats: statsResult,
    };
  } catch (error) {
    console.error('[admin/page] Error prefetching admin data:', error);
    return defaults;
  }
}

async function prefetchOrderStats(): Promise<OrderStats | null> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const [totalResult, pendingResult, todayResult, revenueResult, completedResult, cancelledResult] =
      await Promise.all([
        supabaseServer.from('orders').select('*', { count: 'exact', head: true }),
        supabaseServer.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabaseServer.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayStart).lt('created_at', todayEnd),
        supabaseServer.from('orders').select('total').gte('created_at', todayStart).lt('created_at', todayEnd).eq('status', 'completed'),
        supabaseServer.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        supabaseServer.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
      ]);

    const todayRevenue = (revenueResult.data as any[])?.reduce(
      (sum: number, order: any) => sum + Number(order.total), 0
    ) || 0;

    return {
      total_orders: totalResult.count || 0,
      pending_orders: pendingResult.count || 0,
      today_orders: todayResult.count || 0,
      today_revenue: todayRevenue,
      completed_orders: completedResult.count || 0,
      cancelled_orders: cancelledResult.count || 0,
    };
  } catch (error) {
    console.error('[admin/page] Error prefetching order stats:', error);
    return null;
  }
}

export default async function AdminPage() {
  const prefetchedData = await prefetchAdminData();

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminDashboard prefetchedData={prefetchedData} />
    </div>
  );
}
