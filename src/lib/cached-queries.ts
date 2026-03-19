import { unstable_cache } from 'next/cache';
import { supabaseServer } from './supabase-server';
import { mapMenuRows } from './menu-utils';
import { mapSiteSettingsRows } from './site-settings';
import { computeAutoTags } from '@/lib/customer-utils';
import type { AdminPaymentMethod as PaymentMethod } from '@/types';
import type { AutoTagLabel } from '@/types/customer';

// ── Branches ────────────────────────────────────────────────
export const getCachedBranches = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('branches') as any)
      .select('*')
      .order('created_at', { ascending: true });
    return data || [];
  },
  ['admin-branches'],
  { revalidate: 300, tags: ['branches'] }
);

// Lightweight version for filter dropdowns (id + name only)
export const getCachedBranchOptions = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('branches') as any)
      .select('id, name');
    return data || [];
  },
  ['admin-branch-options'],
  { revalidate: 300, tags: ['branches'] }
);

// ── Categories ──────────────────────────────────────────────
export const getCachedCategories = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('categories') as any)
      .select('*')
      .order('sort_order', { ascending: true });
    return data || [];
  },
  ['admin-categories'],
  { revalidate: 300, tags: ['categories'] }
);

// ── Menu Items (with variations & add-ons, mapped) ─────────
export const getCachedMenuItems = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('menu_items') as any)
      .select(`
        *,
        variations (*),
        add_ons (*)
      `)
      .order('created_at', { ascending: true });
    return mapMenuRows(data);
  },
  ['admin-menu-items'],
  { revalidate: 120, tags: ['menu'] }
);

// ── Payment Methods ─────────────────────────────────────────
export const getCachedPaymentMethods = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('payment_methods') as any)
      .select('*')
      .order('sort_order', { ascending: true });
    return (data as PaymentMethod[]) || [];
  },
  ['admin-payment-methods'],
  { revalidate: 300, tags: ['payments'] }
);

// ── Site Settings ───────────────────────────────────────────
export const getCachedSiteSettings = unstable_cache(
  async () => {
    const { data, error } = await (supabaseServer.from('site_settings') as any)
      .select('*')
      .order('id');
    if (error) throw new Error('Failed to load site settings');
    return mapSiteSettingsRows(data as any[]);
  },
  ['admin-site-settings'],
  { revalidate: 300, tags: ['settings'] }
);

// ── Customers Count ─────────────────────────────────────────
export const getCachedCustomerCount = unstable_cache(
  async () => {
    const { count } = await (supabaseServer.from('customers') as any)
      .select('*', { count: 'exact', head: true });
    return count || 0;
  },
  ['admin-customer-count'],
  { revalidate: 60, tags: ['customers'] }
);

// ── Initial Customers Page (for SSR) ────────────────────────
export const getCachedInitialCustomers = unstable_cache(
  async () => {
    const { data, count } = await (supabaseServer.from('customers') as any)
      .select('*, customer_tags(*)', { count: 'exact' })
      .order('last_order_at', { ascending: false, nullsFirst: false })
      .range(0, 19);

    const customers = (data || []).map((c: any) => ({
      ...c,
      auto_tags: computeAutoTags(c),
      manual_tags: c.customer_tags || [],
      customer_tags: undefined,
    }));

    const total = count ?? 0;
    const totalLtv = customers.reduce((sum: number, c: any) => sum + (c.total_spent || 0), 0);
    const atRiskCount = customers.filter((c: any) => c.auto_tags.includes('At Risk')).length;

    return { customers, total, totalLtv, atRiskCount };
  },
  ['admin-initial-customers'],
  { revalidate: 60, tags: ['customers'] }
);

// ── Loyalty Config ──────────────────────────────────────────
export const getCachedLoyaltyConfig = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('loyalty_config') as any)
      .select('*')
      .single();
    return data;
  },
  ['admin-loyalty-config'],
  { revalidate: 60, tags: ['loyalty-config'] }
);

// ── Loyalty Rewards ─────────────────────────────────────────
export const getCachedLoyaltyRewards = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('loyalty_rewards') as any)
      .select('*')
      .order('sort_order', { ascending: true });
    return data || [];
  },
  ['admin-loyalty-rewards'],
  { revalidate: 60, tags: ['loyalty-rewards'] }
);

// ── Loyalty Boosters ────────────────────────────────────────
export const getCachedLoyaltyBoosters = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('loyalty_boosters') as any)
      .select('*')
      .order('starts_at', { ascending: false });
    return data || [];
  },
  ['admin-loyalty-boosters'],
  { revalidate: 60, tags: ['loyalty-boosters'] }
);

// ── Bundles ──────────────────────────────────────────────────
export const getCachedBundles = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('bundles') as any)
      .select('*, bundle_slots(*, bundle_slot_items(*, menu_items(id, name, base_price, category, image_url)))')
      .order('sort_order', { ascending: true });
    return data || [];
  },
  ['admin-bundles'],
  { revalidate: 300, tags: ['bundles'] }
);

// ── Upsell Rules ─────────────────────────────────────────────
export const getCachedUpsellRules = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('upsell_rules') as any)
      .select('*, menu_items(id, name, base_price, image_url), bundles(id, name, base_price, image_url)')
      .order('priority', { ascending: false });
    return data || [];
  },
  ['admin-upsell-rules'],
  { revalidate: 300, tags: ['upsell-rules'] }
);

export const getCachedAddonSuggestions = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('addon_suggestions') as any)
      .select('*, add_ons(id, name, price, category)')
      .order('sort_order', { ascending: true });
    return data || [];
  },
  ['admin-addon-suggestions'],
  { revalidate: 300, tags: ['addon-suggestions'] }
);

export const getCachedPairRules = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('pair_rules') as any)
      .select('*, menu_items(id, name, base_price, image_url), bundles(id, name, base_price, image_url)')
      .order('priority', { ascending: false });
    return data || [];
  },
  ['admin-pair-rules'],
  { revalidate: 300, tags: ['pair-rules'] }
);

// ── Loyalty Stats ───────────────────────────────────────────
export const getCachedLoyaltyStats = unstable_cache(
  async () => {
    const { count: activeCards } = await (supabaseServer.from('loyalty_cards') as any)
      .select('*', { count: 'exact', head: true });

    const { count: pendingClaims } = await (supabaseServer.from('loyalty_redemptions') as any)
      .select('*', { count: 'exact', head: true })
      .eq('status', 'earned');

    const { count: rewardsClaimed } = await (supabaseServer.from('loyalty_redemptions') as any)
      .select('*', { count: 'exact', head: true })
      .eq('status', 'claimed');

    return {
      active_cards: activeCards || 0,
      pending_claims: pendingClaims || 0,
      rewards_claimed: rewardsClaimed || 0,
    };
  },
  ['admin-loyalty-stats'],
  { revalidate: 60, tags: ['loyalty-cards', 'loyalty-redemptions'] }
);
