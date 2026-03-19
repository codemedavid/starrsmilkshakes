/**
 * Schema validation tests for loyalty-related Zod schemas
 * (src/lib/validation.ts)
 *
 * These tests verify that the Zod schemas accept correct values
 * and reject incorrect ones, paying special attention to the
 * filter_mode enum values (BUG: plural vs singular).
 *
 * Requires: vitest (npm install --save-dev vitest)
 * Run:      npx vitest run src/__tests__/loyalty-validation.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  loyaltyConfigSchema,
  loyaltyBoosterSchema,
  loyaltyGoalSchema,
} from '@/lib/validation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A valid loyaltyConfig input to use as a base. */
function validConfig() {
  return {
    stamps_enabled: true,
    points_enabled: true,
    points_per_peso: 0.5,
    stamps_per_order: 1,
    filter_mode: 'blocklist' as const,
    filtered_category_ids: [],
    filtered_item_ids: [],
    claim_window_days: 7,
  };
}

/** A valid loyaltyBooster input to use as a base. */
function validBooster() {
  return {
    name: 'Double Stars',
    multiplier: 2,
    applies_to: 'both' as const,
    filter_mode: 'all' as const,
    filter_ids: [],
    starts_at: '2026-06-01T00:00:00Z',
    ends_at: '2026-12-31T23:59:59Z',
    is_active: true,
  };
}

/** A valid loyaltyReward input to use as a base. */
function validReward() {
  return {
    name: 'Free Premium Shake',
    description: 'A free shake for reaching 10 stamps',
    image_url: 'https://example.com/shake.jpg',
    stamps_required: 10,
    points_required: null,
    is_active: true,
    sort_order: 1,
  };
}

// ---------------------------------------------------------------------------
// loyaltyConfigSchema
// ---------------------------------------------------------------------------

describe('loyaltyConfigSchema', () => {
  it('valid input passes', () => {
    const result = loyaltyConfigSchema.safeParse(validConfig());
    expect(result.success).toBe(true);
  });

  it('allowlist filter_mode passes', () => {
    const input = { ...validConfig(), filter_mode: 'allowlist' };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('blocklist filter_mode passes', () => {
    const input = { ...validConfig(), filter_mode: 'blocklist' };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('invalid filter_mode rejected', () => {
    const input = { ...validConfig(), filter_mode: 'invalid' };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('negative stamps_per_order rejected (min is 1)', () => {
    const input = { ...validConfig(), stamps_per_order: 0 };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('stamps_per_order of -1 rejected', () => {
    const input = { ...validConfig(), stamps_per_order: -1 };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('stamps_per_order of 1 passes', () => {
    const input = { ...validConfig(), stamps_per_order: 1 };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('claim_window_days = 1 passes (minimum)', () => {
    const input = { ...validConfig(), claim_window_days: 1 };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('claim_window_days = 90 passes (maximum)', () => {
    const input = { ...validConfig(), claim_window_days: 90 };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('claim_window_days = 0 rejected (below minimum)', () => {
    const input = { ...validConfig(), claim_window_days: 0 };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('claim_window_days = 366 rejected (above maximum)', () => {
    const input = { ...validConfig(), claim_window_days: 366 };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('negative points_per_peso rejected', () => {
    const input = { ...validConfig(), points_per_peso: -0.1 };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('points_per_peso = 0 passes', () => {
    const input = { ...validConfig(), points_per_peso: 0 };
    const result = loyaltyConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('missing required field rejected', () => {
    const { stamps_enabled, ...rest } = validConfig();
    const result = loyaltyConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loyaltyBoosterSchema
// ---------------------------------------------------------------------------

describe('loyaltyBoosterSchema', () => {
  it('valid input passes', () => {
    const result = loyaltyBoosterSchema.safeParse(validBooster());
    expect(result.success).toBe(true);
  });

  // ── filter_mode accepted values (singular, matching DB enum) ────────

  it('filter_mode accepts "all"', () => {
    const input = { ...validBooster(), filter_mode: 'all' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('filter_mode accepts "category" (singular, matches DB)', () => {
    const input = { ...validBooster(), filter_mode: 'category' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('filter_mode accepts "item" (singular, matches DB)', () => {
    const input = { ...validBooster(), filter_mode: 'item' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('filter_mode rejects "categories" (old plural value)', () => {
    const input = { ...validBooster(), filter_mode: 'categories' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('filter_mode rejects "items" (old plural value)', () => {
    const input = { ...validBooster(), filter_mode: 'items' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('filter_mode rejects "invalid"', () => {
    const input = { ...validBooster(), filter_mode: 'invalid' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  // ── multiplier range ────────────────────────────────────────────────

  it('multiplier = 1.1 passes (minimum)', () => {
    const input = { ...validBooster(), multiplier: 1.1 };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('multiplier = 10 passes (maximum)', () => {
    const input = { ...validBooster(), multiplier: 10 };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('multiplier = 1.0 rejected (below minimum 1.1)', () => {
    const input = { ...validBooster(), multiplier: 1.0 };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('multiplier = 10.1 rejected (above maximum 10)', () => {
    const input = { ...validBooster(), multiplier: 10.1 };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('multiplier = 0 rejected', () => {
    const input = { ...validBooster(), multiplier: 0 };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('negative multiplier rejected', () => {
    const input = { ...validBooster(), multiplier: -2 };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  // ── Required fields ─────────────────────────────────────────────────

  it('name is required', () => {
    const { name, ...rest } = validBooster();
    const result = loyaltyBoosterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('starts_at is required', () => {
    const { starts_at, ...rest } = validBooster();
    const result = loyaltyBoosterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('ends_at is required', () => {
    const { ends_at, ...rest } = validBooster();
    const result = loyaltyBoosterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('empty name rejected', () => {
    const input = { ...validBooster(), name: '' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('empty starts_at rejected', () => {
    const input = { ...validBooster(), starts_at: '' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('empty ends_at rejected', () => {
    const input = { ...validBooster(), ends_at: '' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  // ── applies_to ──────────────────────────────────────────────────────

  it('applies_to accepts "stamps"', () => {
    const input = { ...validBooster(), applies_to: 'stamps' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('applies_to accepts "points"', () => {
    const input = { ...validBooster(), applies_to: 'points' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('applies_to accepts "both"', () => {
    const input = { ...validBooster(), applies_to: 'both' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('applies_to rejects "all"', () => {
    const input = { ...validBooster(), applies_to: 'all' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  // ── XSS sanitization on name ────────────────────────────────────────

  it('name strips HTML tags', () => {
    const input = { ...validBooster(), name: 'Double <script>alert("xss")</script>Stars' };
    const result = loyaltyBoosterSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).not.toContain('<script>');
      expect(result.data.name).toContain('Double');
      expect(result.data.name).toContain('Stars');
    }
  });
});

// ---------------------------------------------------------------------------
// loyaltyGoalSchema
// ---------------------------------------------------------------------------

describe('loyaltyGoalSchema', () => {
  it('valid input passes', () => {
    const result = loyaltyGoalSchema.safeParse(validReward());
    expect(result.success).toBe(true);
  });

  it('name is required', () => {
    const { name, ...rest } = validReward();
    const result = loyaltyGoalSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('empty name rejected', () => {
    const input = { ...validReward(), name: '' };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('stamps_required is optional/nullable', () => {
    const input1 = { ...validReward(), stamps_required: null };
    expect(loyaltyGoalSchema.safeParse(input1).success).toBe(true);

    const { stamps_required, ...input2 } = validReward();
    expect(loyaltyGoalSchema.safeParse(input2).success).toBe(true);
  });

  it('points_required is optional/nullable', () => {
    const input1 = { ...validReward(), points_required: null };
    expect(loyaltyGoalSchema.safeParse(input1).success).toBe(true);

    const { points_required, ...input2 } = validReward();
    expect(loyaltyGoalSchema.safeParse(input2).success).toBe(true);
  });

  it('stamps_required = 0 rejected (min is 1 when present)', () => {
    const input = { ...validReward(), stamps_required: 0 };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('points_required = 0 rejected (min is 1 when present)', () => {
    const input = { ...validReward(), points_required: 0 };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('stamps_required = 1 passes', () => {
    const input = { ...validReward(), stamps_required: 1 };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('negative stamps_required rejected', () => {
    const input = { ...validReward(), stamps_required: -5 };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('description is nullable/optional', () => {
    const input1 = { ...validReward(), description: null };
    expect(loyaltyGoalSchema.safeParse(input1).success).toBe(true);

    const { description, ...input2 } = validReward();
    expect(loyaltyGoalSchema.safeParse(input2).success).toBe(true);
  });

  it('image_url must be a valid URL when present', () => {
    const input = { ...validReward(), image_url: 'not-a-url' };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('image_url null passes', () => {
    const input = { ...validReward(), image_url: null };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('name longer than 100 chars rejected', () => {
    const input = { ...validReward(), name: 'A'.repeat(101) };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('name exactly 100 chars passes', () => {
    const input = { ...validReward(), name: 'A'.repeat(100) };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  // ── XSS sanitization on name ────────────────────────────────────────

  it('name strips HTML tags', () => {
    const input = { ...validReward(), name: 'Free <b>Shake</b>' };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).not.toContain('<b>');
      expect(result.data.name).toBe('Free Shake');
    }
  });

  // ── Minimal valid reward ────────────────────────────────────────────

  it('minimal reward (name only) passes', () => {
    const input = { name: 'Free Shake' };
    const result = loyaltyGoalSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
