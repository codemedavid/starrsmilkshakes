// src/types/upsell.ts

import type { MenuItem, AddOn } from '@/types';
import type { Bundle } from '@/types/bundle';

export type UpsellPhase = 'upgrade' | 'best_pair' | 'interstitial';
export type UpsellTriggerType = 'item' | 'category' | 'cart_total' | 'cart_empty_category';
export type UpsellOfferType = 'item' | 'bundle' | 'discount' | 'loyalty_nudge';

export interface UpsellRule {
  id: string;
  name: string;
  phase: UpsellPhase;
  trigger_type: UpsellTriggerType;
  trigger_item_ids: string[];
  trigger_category_ids: string[];
  trigger_min_total: number | null;
  offer_type: UpsellOfferType;
  offer_item_id: string | null;
  offer_bundle_id: string | null;
  offer_discount_percent: number | null;
  offer_message: string | null;
  priority: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  offer_item?: MenuItem;
  offer_bundle?: Bundle;
}

export interface UpsellOffer {
  rule: UpsellRule;
  savings: number | null;
  display_price: number;
}

export interface AddonSuggestion {
  id: string;
  menu_item_id: string;
  add_on_id: string;
  suggestion_text: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  add_on?: AddOn;
}

export interface PairRule {
  id: string;
  source_item_id: string | null;
  source_category_id: string | null;
  paired_item_id: string | null;
  paired_bundle_id: string | null;
  message: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  paired_item?: MenuItem;
  paired_bundle?: Bundle;
}

export interface PairOffer {
  rule: PairRule;
  item: MenuItem | null;
  bundle: Bundle | null;
}

export interface InterstitialOffer {
  rule: UpsellRule;
  type: UpsellOfferType;
  item: MenuItem | null;
  bundle: Bundle | null;
  discounted_price: number | null;
  loyalty_message: string | null;
}

export interface UpsellCartItem {
  menu_item_id: string;
  category: string;
  quantity: number;
  unit_price: number;
}

export interface UpsellCart {
  items: UpsellCartItem[];
  total: number;
}
