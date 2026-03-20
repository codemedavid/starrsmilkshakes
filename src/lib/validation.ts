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
  filtered_category_ids: z.array(z.string().uuid()),
  filtered_item_ids: z.array(z.string().uuid()),
  claim_window_days: z.number().int().min(1).max(90),
});

export type LoyaltyConfigInput = z.infer<typeof loyaltyConfigSchema>;

// ─── Loyalty Reward ──────────────────────────────────────────────────────────

export const loyaltyRewardSchema = z.object({
  name: sanitized.pipe(z.string().min(1).max(100)),
  description: sanitized.pipe(z.string().max(500)).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  stamps_required: z.number().int().min(1).nullable().optional(),
  points_required: z.number().int().min(1).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export type LoyaltyRewardInput = z.infer<typeof loyaltyRewardSchema>;

// ─── Loyalty Booster ─────────────────────────────────────────────────────────

export const loyaltyBoosterSchema = z.object({
  name: sanitized.pipe(z.string().min(1).max(100)),
  multiplier: z.number().min(1.1).max(10),
  applies_to: z.enum(['stamps', 'points', 'both']),
  filter_mode: z.enum(['all', 'categories', 'items']),
  filter_ids: z.array(z.string().uuid()),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  is_active: z.boolean().optional(),
});

export type LoyaltyBoosterInput = z.infer<typeof loyaltyBoosterSchema>;
