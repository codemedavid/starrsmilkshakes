/**
 * Zod validation schemas for all admin mutations.
 *
 * Uses Zod v4 (imported from 'zod').  All string inputs that end up stored
 * or displayed go through `sanitizeString` to strip HTML tags and prevent XSS.
 */

import { z } from 'zod';

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Strip HTML tags from a string to prevent XSS. */
const sanitizeString = (s: string): string => s.replace(/<[^>]*>/g, '');

/** Reusable sanitized string builder. */
const sanitized = z.string().transform(sanitizeString);

// ─── UUID ─────────────────────────────────────────────────────────────────────

export const uuidSchema = z.string().uuid();

export type UUID = z.infer<typeof uuidSchema>;

// ─── Branch ───────────────────────────────────────────────────────────────────

export const branchSchema = z.object({
  name: sanitized
    .pipe(z.string().min(1, 'Branch name is required').max(200, 'Branch name must be 200 characters or fewer')),
  address: sanitized.pipe(z.string().min(1, 'Address is required')),
  phone: sanitized.pipe(z.string().min(1, 'Phone is required')),
  latitude: z.string().min(1, 'Latitude is required'),
  longitude: z.string().min(1, 'Longitude is required'),
  is_active: z.boolean().optional().default(true),
  is_main: z.boolean().optional().default(false),
  messenger_username: z.string().nullable().optional(),
});

export type BranchInput = z.infer<typeof branchSchema>;

// ─── Category ─────────────────────────────────────────────────────────────────

export const categorySchema = z.object({
  name: sanitized.pipe(
    z.string().min(1, 'Category name is required').max(100, 'Category name must be 100 characters or fewer'),
  ),
  icon: z.string().optional(),
  /** Kebab-case slug, e.g. "milkshakes" or "add-ons". */
  id_slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id_slug must be kebab-case (lowercase letters, numbers, and hyphens)')
    .optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;

// ─── Menu Item ────────────────────────────────────────────────────────────────

export const menuItemSchema = z.object({
  name: sanitized.pipe(
    z.string().min(1, 'Menu item name is required').max(200, 'Menu item name must be 200 characters or fewer'),
  ),
  /** Maps to base_price in the DB; kept as basePrice to match the frontend type. */
  basePrice: z.number().positive('Price must be greater than zero'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional().default(''),
  image: z.string().url('Image must be a valid URL').optional().nullable(),
  popular: z.boolean().optional().default(false),
  available: z.boolean().optional().default(true),
  show_in_messenger: z.boolean().optional().default(false),
  discountPrice: z.number().nonnegative().optional().nullable(),
  discountStartDate: z.string().optional().nullable(),
  discountEndDate: z.string().optional().nullable(),
  discountActive: z.boolean().optional().default(false),
  costPrice: z.number().min(0).nullable().optional(),
});

export type MenuItemInput = z.infer<typeof menuItemSchema>;

// ─── Payment Method ───────────────────────────────────────────────────────────

export const paymentMethodSchema = z.object({
  id: z.string().min(1, 'Payment method id is required'),
  name: sanitized.pipe(z.string().min(1, 'Payment method name is required')),
  account_name: z.string().min(1, 'Account name is required'),
  account_number: z.string().min(1, 'Account number is required'),
  qr_code_url: z.string().min(1, 'QR code URL is required'),
  active: z.boolean().optional().default(true),
  sort_order: z.number().int().nonnegative().optional(),
});

export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

// ─── Site Settings ────────────────────────────────────────────────────────────

/**
 * All fields are optional — site settings are updated via partial PATCH.
 * The shape mirrors `SiteSettings` from src/types/index.ts.
 */
export const siteSettingsSchema = z
  .object({
    site_name: z.string(),
    site_logo: z.string(),
    site_description: z.string(),
    currency: z.string(),
    currency_code: z.string(),
    lalamove_market: z.string(),
    lalamove_service_type: z.string(),
    lalamove_sandbox: z.string(),
    lalamove_api_key: z.string(),
    lalamove_api_secret: z.string(),
    lalamove_store_name: z.string(),
    lalamove_store_phone: z.string(),
    lalamove_store_address: z.string(),
    lalamove_store_latitude: z.string(),
    lalamove_store_longitude: z.string(),
    meta_pixel_id: z.string(),
    meta_access_token: z.string(),
    meta_test_event_code: z.string(),
    header_scripts: z.string(),
    ai_faq_enabled: z.string().optional(),
  })
  .partial();

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

// ─── Customer Link / Unlink ───────────────────────────────────────────────────

const LINK_REASONS = ['Phone match', 'Messenger match', 'Manual identification', 'Other'] as const;
const UNLINK_REASONS = ['Incorrect match', 'Customer request', 'Duplicate resolution', 'Other'] as const;

export const customerLinkSchema = z.object({
  order_id: uuidSchema,
  customer_id: uuidSchema,
  reason: z.enum(LINK_REASONS),
});

export type CustomerLinkInput = z.infer<typeof customerLinkSchema>;

export const customerUnlinkSchema = z.object({
  order_id: uuidSchema,
  reason: z.enum(UNLINK_REASONS),
});

export type CustomerUnlinkInput = z.infer<typeof customerUnlinkSchema>;

// ─── Reorder ──────────────────────────────────────────────────────────────────

export const reorderSchema = z.object({
  ids: z.array(uuidSchema),
});

export type ReorderInput = z.infer<typeof reorderSchema>;

// ─── Loyalty Config ──────────────────────────────────────────────────────────

export const loyaltyConfigSchema = z.object({
  stamps_enabled: z.boolean(),
  points_enabled: z.boolean(),
  points_per_peso: z.number().min(0),
  stamps_per_order: z.number().int().min(1),
  filter_mode: z.enum(['allowlist', 'blocklist']),
  filtered_category_ids: z.array(z.string().min(1)),
  filtered_item_ids: z.array(z.string().min(1)),
  claim_window_days: z.number().int().min(1).max(365),
});

export type LoyaltyConfigInput = z.infer<typeof loyaltyConfigSchema>;

// ─── Loyalty Goal ────────────────────────────────────────────────────────────

export const loyaltyGoalSchema = z.object({
  name: sanitized.pipe(z.string().min(1).max(100)),
  description: sanitized.pipe(z.string().max(500)).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  stamps_required: z.number().int().min(1).nullable().optional(),
  points_required: z.number().int().min(1).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export type LoyaltyGoalInput = z.infer<typeof loyaltyGoalSchema>;

// ─── Loyalty Milestone ────────────────────────────────────────────────────────

export const loyaltyMilestoneSchema = z.object({
  name: sanitized.pipe(z.string().min(1).max(100)),
  description: sanitized.pipe(z.string().max(500)).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  stamps_required: z.number().int().min(1),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export type LoyaltyMilestoneInput = z.infer<typeof loyaltyMilestoneSchema>;

// ─── Loyalty Booster ─────────────────────────────────────────────────────────

export const loyaltyBoosterSchema = z.object({
  name: sanitized.pipe(z.string().min(1).max(100)),
  multiplier: z.number().min(1.1).max(10),
  applies_to: z.enum(['stamps', 'points', 'both']),
  filter_mode: z.enum(['all', 'category', 'item']),
  filter_ids: z.array(z.string().min(1)),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  is_active: z.boolean().optional(),
});

export type LoyaltyBoosterInput = z.infer<typeof loyaltyBoosterSchema>;

// ─── Cost Tracking ──────────────────────────────────────────────────────────

export const updateItemCostSchema = z.object({
  itemId: z.string().uuid(),
  costPrice: z.number().min(0).nullable(),
});

export type UpdateItemCostInput = z.infer<typeof updateItemCostSchema>;

export const updateVariationCostSchema = z.object({
  variationId: z.string().uuid(),
  costPrice: z.number().min(0).nullable(),
});

export type UpdateVariationCostInput = z.infer<typeof updateVariationCostSchema>;

export const updateAddOnCostSchema = z.object({
  addOnId: z.string().uuid(),
  costPrice: z.number().min(0).nullable(),
});

export type UpdateAddOnCostInput = z.infer<typeof updateAddOnCostSchema>;

export const bulkImportCostItemSchema = z.object({
  name: z.string().min(1),
  costPrice: z.number().min(0),
});

export const bulkImportCostsSchema = z.object({
  items: z.array(bulkImportCostItemSchema).min(1),
});

export type BulkImportCostsInput = z.infer<typeof bulkImportCostsSchema>;

// ─── Bundle ─────────────────────────────────────────────────────────────────

const bundleSlotItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  price_override: z.number().min(0).nullable().optional(),
  sort_order: z.number().int().min(0).optional().default(0),
});

const bundleSlotSchema = z.object({
  label: z.string().min(1, 'Slot label is required').max(100),
  sort_order: z.number().int().min(0).optional().default(0),
  min_selections: z.number().int().min(0).default(1),
  max_selections: z.number().int().min(1).default(1),
  items: z.array(bundleSlotItemSchema).min(1, 'Each slot needs at least one item'),
}).refine(
  (data) => data.max_selections >= data.min_selections,
  { message: 'max_selections must be >= min_selections' }
);

export const createBundleSchema = z.object({
  name: sanitized.pipe(z.string().min(1, 'Bundle name is required').max(200)),
  description: z.string().max(500).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  base_price: z.number().positive('Price must be greater than zero'),
  cost_price: z.number().min(0).nullable().optional(),
  category: z.string().min(1, 'Category is required'),
  discount_price: z.number().min(0).nullable().optional(),
  discount_active: z.boolean().optional().default(false),
  discount_start_date: z.string().nullable().optional(),
  discount_end_date: z.string().nullable().optional(),
  available: z.boolean().optional().default(true),
  popular: z.boolean().optional().default(false),
  sort_order: z.number().int().min(0).optional().default(0),
  slots: z.array(bundleSlotSchema).min(1, 'Bundle needs at least one slot'),
});

export type CreateBundleInput = z.infer<typeof createBundleSchema>;

export const updateBundleSchema = createBundleSchema;

export type UpdateBundleInput = z.infer<typeof updateBundleSchema>;

// ─── Upsell ─────────────────────────────────────────────────────────────────

export const upsellRuleSchema = z.object({
  name: sanitized.pipe(z.string().min(1, 'Rule name is required').max(200)),
  phase: z.enum(['upgrade', 'best_pair', 'interstitial']),
  trigger_type: z.enum(['item', 'category', 'cart_total', 'cart_empty_category']),
  trigger_item_ids: z.array(z.string().uuid()).optional().default([]),
  trigger_category_ids: z.array(z.string().min(1)).optional().default([]),
  trigger_min_total: z.number().min(0).nullable().optional(),
  offer_type: z.enum(['item', 'bundle', 'discount', 'loyalty_nudge']),
  offer_item_id: z.string().uuid().nullable().optional(),
  offer_bundle_id: z.string().uuid().nullable().optional(),
  offer_discount_percent: z.number().min(1).max(100).nullable().optional(),
  offer_message: z.string().max(500).nullable().optional(),
  priority: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
});

export type UpsellRuleInput = z.infer<typeof upsellRuleSchema>;

export const addonSuggestionInputSchema = z.object({
  add_on_id: z.string().uuid(),
  suggestion_text: z.string().max(200).nullable().optional(),
  sort_order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
});

export const setAddonSuggestionsSchema = z.object({
  menu_item_id: z.string().uuid(),
  suggestions: z.array(addonSuggestionInputSchema),
});

export type SetAddonSuggestionsInput = z.infer<typeof setAddonSuggestionsSchema>;

export const pairRuleSchema = z.object({
  source_item_id: z.string().uuid().nullable().optional(),
  source_category_id: z.string().min(1).nullable().optional(),
  paired_item_id: z.string().uuid().nullable().optional(),
  paired_bundle_id: z.string().uuid().nullable().optional(),
  message: z.string().max(500).nullable().optional(),
  priority: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
}).refine(
  (data) => (data.source_item_id != null) !== (data.source_category_id != null),
  { message: 'Exactly one of source_item_id or source_category_id must be set' }
).refine(
  (data) => (data.paired_item_id != null) !== (data.paired_bundle_id != null),
  { message: 'Exactly one of paired_item_id or paired_bundle_id must be set' }
);

export type PairRuleInput = z.infer<typeof pairRuleSchema>;
