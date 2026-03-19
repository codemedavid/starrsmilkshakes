'use server';

import { supabaseServer } from '@/lib/supabase-server';
import {
  matchUpgradeOffers,
  suggestAddOns,
  matchPairOffers,
  matchInterstitialOffers,
} from '@/lib/upsell-engine';
import type { UpsellCartItem, UpsellCart } from '@/types/upsell';

type ActionResult = { success: boolean; error?: string; data?: any };

export async function getUpgradeOffers(cartItems: UpsellCartItem[]): Promise<ActionResult> {
  try {
    const { data: rules, error } = await (supabaseServer.from('upsell_rules') as any)
      .select('*, menu_items(*), bundles(*)')
      .eq('phase', 'upgrade')
      .eq('is_active', true);

    if (error) return { success: false, error: 'Failed to fetch upgrade rules' };

    // Map joined data to offer_item/offer_bundle
    const mappedRules = (rules || []).map((r: any) => ({
      ...r,
      offer_item: r.menu_items ?? null,
      offer_bundle: r.bundles ?? null,
    }));

    const offers = matchUpgradeOffers(cartItems, mappedRules, new Date());
    return { success: true, data: offers };
  } catch {
    return { success: false, error: 'Failed to get upgrade offers' };
  }
}

export async function getAddonSuggestions(menuItemId: string): Promise<ActionResult> {
  try {
    const { data: suggestions, error } = await (supabaseServer.from('addon_suggestions') as any)
      .select('*, add_ons(*)')
      .eq('menu_item_id', menuItemId);

    if (error) return { success: false, error: 'Failed to fetch suggestions' };

    // Map joined add_on data
    const mapped = (suggestions || []).map((s: any) => ({
      ...s,
      add_on: s.add_ons ?? null,
    }));

    const filtered = suggestAddOns(menuItemId, mapped, new Date());
    return { success: true, data: filtered };
  } catch {
    return { success: false, error: 'Failed to get addon suggestions' };
  }
}

export async function getPairSuggestions(cartItems: UpsellCartItem[]): Promise<ActionResult> {
  try {
    const { data: rules, error } = await (supabaseServer.from('pair_rules') as any)
      .select('*, menu_items(*), bundles(*)')
      .eq('is_active', true);

    if (error) return { success: false, error: 'Failed to fetch pair rules' };

    // Map joined data
    const mapped = (rules || []).map((r: any) => ({
      ...r,
      paired_item: r.paired_item_id ? r.menu_items : null,
      paired_bundle: r.paired_bundle_id ? r.bundles : null,
    }));

    const offers = matchPairOffers(cartItems, mapped);
    return { success: true, data: offers };
  } catch {
    return { success: false, error: 'Failed to get pair suggestions' };
  }
}

export async function getInterstitialOffers(
  cart: UpsellCart,
  loyaltyCardId?: string,
): Promise<ActionResult> {
  try {
    const { data: rules, error } = await (supabaseServer.from('upsell_rules') as any)
      .select('*, menu_items(*), bundles(*)')
      .eq('phase', 'interstitial')
      .eq('is_active', true);

    if (error) return { success: false, error: 'Failed to fetch interstitial rules' };

    const mappedRules = (rules || []).map((r: any) => ({
      ...r,
      offer_item: r.menu_items ?? null,
      offer_bundle: r.bundles ?? null,
    }));

    // Optionally fetch loyalty data for loyalty_nudge offers
    let loyaltyCard = null;
    let loyaltyConfig = null;
    let goalReward = null;

    if (loyaltyCardId) {
      const { data: card } = await (supabaseServer.from('loyalty_cards') as any)
        .select('*').eq('id', loyaltyCardId).single();
      loyaltyCard = card;

      if (card) {
        const { data: config } = await (supabaseServer.from('loyalty_config') as any)
          .select('*').limit(1).single();
        loyaltyConfig = config;

        if (card.goal_reward_id) {
          const { data: reward } = await (supabaseServer.from('loyalty_rewards') as any)
            .select('*').eq('id', card.goal_reward_id).single();
          goalReward = reward;
        }
      }
    }

    const offer = matchInterstitialOffers(cart, mappedRules, loyaltyCard, loyaltyConfig, goalReward, new Date());
    return { success: true, data: offer };
  } catch {
    return { success: false, error: 'Failed to get interstitial offers' };
  }
}
