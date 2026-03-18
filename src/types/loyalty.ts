// src/types/loyalty.ts

export type FilterMode = 'allowlist' | 'blocklist';
export type BoosterAppliesTo = 'stamps' | 'points' | 'both';
export type BoosterFilterMode = 'all' | 'categories' | 'items';
export type TransactionType = 'earn' | 'redeem' | 'expire' | 'adjust';
export type RedemptionStatus = 'earned' | 'claimed' | 'expired';
export type LoyaltySessionPurpose = 'registration' | 'card_view';

export interface LoyaltyConfig {
  id: string;
  stamps_enabled: boolean;
  points_enabled: boolean;
  points_per_peso: number;
  stamps_per_order: number;
  filter_mode: FilterMode;
  filtered_category_ids: string[];
  filtered_item_ids: string[];
  claim_window_days: number;
  updated_at: string;
}

export interface LoyaltyReward {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  stamps_required: number | null;
  points_required: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyCard {
  id: string;
  customer_id: string;
  card_code: string;
  current_stamps: number;
  current_points: number;
  goal_reward_id: string | null;
  lifetime_stamps: number;
  lifetime_points: number;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyTransaction {
  id: string;
  card_id: string;
  order_id: string | null;
  type: TransactionType;
  stamps_delta: number;
  points_delta: number;
  booster_id: string | null;
  description: string;
  created_at: string;
}

export interface LoyaltyRedemption {
  id: string;
  card_id: string;
  reward_id: string;
  status: RedemptionStatus;
  earned_at: string;
  expires_at: string;
  claimed_at: string | null;
  claimed_branch_id: string | null;
  claimed_by: string | null;
}

export interface LoyaltyBooster {
  id: string;
  name: string;
  multiplier: number;
  applies_to: BoosterAppliesTo;
  filter_mode: BoosterFilterMode;
  filter_ids: string[];
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoyaltySession {
  id: string;
  token: string;
  psid: string;
  purpose: LoyaltySessionPurpose;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface LoyaltyStats {
  active_cards: number;
  total_stamps_earned: number;
  pending_claims: number;
  expiring_soon: number;
  rewards_claimed: number;
}

/** Used for the creditLoyalty calculation — represents an order item */
export interface LoyaltyOrderItem {
  menu_item_id: string;
  category_id: string;
  name: string;
  quantity: number;
  subtotal: number;
}

/** Result from calculateEarnings */
export interface EarningsResult {
  stamps: number;
  points: number;
  booster_id: string | null;
  booster_multiplier: number;
  qualifying_total: number;
}

/** Lookup result combining card + customer info */
export interface LoyaltyCardLookup extends LoyaltyCard {
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  messenger_psid: string | null;
  goal_reward: LoyaltyReward | null;
  pending_redemptions: LoyaltyRedemption[];
}
