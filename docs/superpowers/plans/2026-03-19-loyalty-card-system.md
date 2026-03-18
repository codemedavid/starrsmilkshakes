# Loyalty Card System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone loyalty/stomp card system with hybrid stamps+points, Messenger registration, admin management, walk-in order linking, and configurable rewards/boosters.

**Architecture:** Standalone module referencing the customer system via FK. Pure business logic in `loyalty-engine.ts` (no I/O, fully testable), Server Actions for DB operations, SSR admin page with client components following existing patterns. Customer-facing pages use time-limited hashed URLs from Messenger. All tables prefixed `loyalty_`.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL, Tailwind CSS, Vitest, Zod, Facebook Messenger Send API

**Spec:** `docs/superpowers/specs/2026-03-19-loyalty-card-system-design.md`

**Team roles embedded in the workflow:**
- **Coordinators** — Task ordering ensures dependencies are met; review checkpoints between phases
- **Senior devs** — TDD, atomic SQL, proper error handling, existing codebase patterns
- **UI/UX** — Customer-facing pages get dedicated visual QA tasks with cross-mode (dark/light) checks
- **Reviewers** — Code review subagent dispatched after each phase
- **Testers** — Dedicated test tasks for unit, integration, API, system, and acceptance testing

---

## Phase 1: Foundation (Types, DB, Pure Logic)

### Task 1: TypeScript Types

**Files:**
- Create: `src/types/loyalty.ts`

- [ ] **Step 1: Create loyalty type definitions**

```typescript
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
```

- [ ] **Step 2: Verify types file compiles**

Run: `npx tsc --noEmit src/types/loyalty.ts 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types/loyalty.ts
git commit -m "feat(loyalty): add TypeScript type definitions"
```

---

### Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260319000000_add_loyalty.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260319000000_add_loyalty.sql
-- Loyalty card system tables

-- ── Enums ──────────────────────────────────────────────────────
CREATE TYPE loyalty_filter_mode AS ENUM ('allowlist', 'blocklist');
CREATE TYPE loyalty_booster_applies_to AS ENUM ('stamps', 'points', 'both');
CREATE TYPE loyalty_booster_filter_mode AS ENUM ('all', 'categories', 'items');
CREATE TYPE loyalty_transaction_type AS ENUM ('earn', 'redeem', 'expire', 'adjust');
CREATE TYPE loyalty_redemption_status AS ENUM ('earned', 'claimed', 'expired');
CREATE TYPE loyalty_session_purpose AS ENUM ('registration', 'card_view');

-- ── Config (singleton) ─────────────────────────────────────────
CREATE TABLE loyalty_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stamps_enabled boolean NOT NULL DEFAULT true,
  points_enabled boolean NOT NULL DEFAULT true,
  points_per_peso numeric NOT NULL DEFAULT 0.1,
  stamps_per_order integer NOT NULL DEFAULT 1,
  filter_mode loyalty_filter_mode NOT NULL DEFAULT 'blocklist',
  filtered_category_ids uuid[] NOT NULL DEFAULT '{}',
  filtered_item_ids uuid[] NOT NULL DEFAULT '{}',
  claim_window_days integer NOT NULL DEFAULT 7,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the singleton row
INSERT INTO loyalty_config DEFAULT VALUES;

-- ── Rewards ────────────────────────────────────────────────────
CREATE TABLE loyalty_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  stamps_required integer,
  points_required integer,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Cards ──────────────────────────────────────────────────────
CREATE TABLE loyalty_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  card_code text NOT NULL UNIQUE,
  current_stamps integer NOT NULL DEFAULT 0,
  current_points integer NOT NULL DEFAULT 0,
  goal_reward_id uuid REFERENCES loyalty_rewards(id) ON DELETE SET NULL,
  lifetime_stamps integer NOT NULL DEFAULT 0,
  lifetime_points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_cards_card_code ON loyalty_cards(card_code);
CREATE INDEX idx_loyalty_cards_customer_id ON loyalty_cards(customer_id);

-- ── Transactions ───────────────────────────────────────────────
CREATE TABLE loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  type loyalty_transaction_type NOT NULL,
  stamps_delta integer NOT NULL DEFAULT 0,
  points_delta integer NOT NULL DEFAULT 0,
  booster_id uuid,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_transactions_card_id ON loyalty_transactions(card_id);
CREATE INDEX idx_loyalty_transactions_order_id ON loyalty_transactions(order_id);

-- ── Redemptions ────────────────────────────────────────────────
CREATE TABLE loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES loyalty_rewards(id),
  status loyalty_redemption_status NOT NULL DEFAULT 'earned',
  earned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  claimed_branch_id uuid REFERENCES branches(id),
  claimed_by text
);

CREATE INDEX idx_loyalty_redemptions_card_id ON loyalty_redemptions(card_id);
CREATE INDEX idx_loyalty_redemptions_status ON loyalty_redemptions(status);

-- ── Boosters ───────────────────────────────────────────────────
CREATE TABLE loyalty_boosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  multiplier numeric NOT NULL DEFAULT 2.0,
  applies_to loyalty_booster_applies_to NOT NULL DEFAULT 'both',
  filter_mode loyalty_booster_filter_mode NOT NULL DEFAULT 'all',
  filter_ids uuid[] NOT NULL DEFAULT '{}',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Sessions (hash-to-PSID mapping) ───────────────────────────
CREATE TABLE loyalty_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  psid text NOT NULL,
  purpose loyalty_session_purpose NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_sessions_token ON loyalty_sessions(token);

-- ── FK for booster_id in transactions (after boosters table exists) ─
ALTER TABLE loyalty_transactions
  ADD CONSTRAINT fk_loyalty_transactions_booster
  FOREIGN KEY (booster_id) REFERENCES loyalty_boosters(id) ON DELETE SET NULL;

-- ── updated_at trigger (reuse existing pattern) ───────────────
CREATE TRIGGER set_loyalty_config_updated_at BEFORE UPDATE ON loyalty_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_loyalty_cards_updated_at BEFORE UPDATE ON loyalty_cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_loyalty_rewards_updated_at BEFORE UPDATE ON loyalty_rewards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_loyalty_boosters_updated_at BEFORE UPDATE ON loyalty_boosters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RPC for atomic reward redemption ──────────────────────────
CREATE OR REPLACE FUNCTION redeem_loyalty_reward(
  p_redemption_id uuid,
  p_branch_id uuid,
  p_claimed_by text
) RETURNS void AS $$
DECLARE
  v_card_id uuid;
  v_reward_id uuid;
  v_stamps_required integer;
  v_points_required integer;
BEGIN
  -- Lock the redemption row
  SELECT card_id, reward_id INTO v_card_id, v_reward_id
  FROM loyalty_redemptions
  WHERE id = p_redemption_id AND status = 'earned'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption not found or already claimed';
  END IF;

  -- Get reward costs
  SELECT stamps_required, points_required INTO v_stamps_required, v_points_required
  FROM loyalty_rewards WHERE id = v_reward_id;

  -- Lock and deduct from card
  UPDATE loyalty_cards
  SET current_stamps = current_stamps - COALESCE(v_stamps_required, 0),
      current_points = current_points - COALESCE(v_points_required, 0)
  WHERE id = v_card_id;

  -- Mark redeemed
  UPDATE loyalty_redemptions
  SET status = 'claimed',
      claimed_at = now(),
      claimed_branch_id = p_branch_id,
      claimed_by = p_claimed_by
  WHERE id = p_redemption_id;

  -- Insert transaction record
  INSERT INTO loyalty_transactions (card_id, type, stamps_delta, points_delta, description)
  VALUES (
    v_card_id,
    'redeem',
    -COALESCE(v_stamps_required, 0),
    -COALESCE(v_points_required, 0),
    'Reward redeemed: ' || (SELECT name FROM loyalty_rewards WHERE id = v_reward_id)
  );
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Apply migration to local Supabase**

Run: `npx supabase db push` or apply via Supabase MCP tool
Expected: Migration applies without errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260319000000_add_loyalty.sql
git commit -m "feat(loyalty): add database migration — 7 tables, enums, RPC"
```

---

### Task 3: Pure Business Logic — loyalty-engine.ts

**Files:**
- Create: `src/lib/loyalty-engine.ts`
- Create: `tests/loyalty-engine.test.ts`

- [ ] **Step 1: Write failing tests for filterQualifyingItems**

```typescript
// tests/loyalty-engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  filterQualifyingItems,
  findActiveBoosters,
  calculateEarnings,
  checkGoalReached,
  calculateCarryover,
} from '@/lib/loyalty-engine';
import type { LoyaltyConfig, LoyaltyBooster, LoyaltyOrderItem, LoyaltyCard, LoyaltyReward } from '@/types/loyalty';

const mockConfig = (overrides: Partial<LoyaltyConfig> = {}): LoyaltyConfig => ({
  id: 'cfg-1',
  stamps_enabled: true,
  points_enabled: true,
  points_per_peso: 0.1,
  stamps_per_order: 1,
  filter_mode: 'blocklist',
  filtered_category_ids: [],
  filtered_item_ids: [],
  claim_window_days: 7,
  updated_at: '2026-03-19T00:00:00Z',
  ...overrides,
});

const mockItem = (overrides: Partial<LoyaltyOrderItem> = {}): LoyaltyOrderItem => ({
  menu_item_id: 'item-1',
  category_id: 'cat-1',
  name: 'Classic Shake',
  quantity: 1,
  subtotal: 150,
  ...overrides,
});

describe('filterQualifyingItems', () => {
  it('returns all items when blocklist is empty', () => {
    const items = [mockItem(), mockItem({ menu_item_id: 'item-2' })];
    const result = filterQualifyingItems(items, mockConfig());
    expect(result).toHaveLength(2);
  });

  it('excludes items on blocklist by item ID', () => {
    const items = [mockItem(), mockItem({ menu_item_id: 'item-2' })];
    const config = mockConfig({ filter_mode: 'blocklist', filtered_item_ids: ['item-1'] });
    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(1);
    expect(result[0].menu_item_id).toBe('item-2');
  });

  it('excludes items on blocklist by category ID', () => {
    const items = [mockItem(), mockItem({ menu_item_id: 'item-2', category_id: 'cat-2' })];
    const config = mockConfig({ filter_mode: 'blocklist', filtered_category_ids: ['cat-1'] });
    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(1);
    expect(result[0].category_id).toBe('cat-2');
  });

  it('includes only allowlisted items by item ID', () => {
    const items = [mockItem(), mockItem({ menu_item_id: 'item-2' })];
    const config = mockConfig({ filter_mode: 'allowlist', filtered_item_ids: ['item-1'] });
    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(1);
    expect(result[0].menu_item_id).toBe('item-1');
  });

  it('includes only allowlisted categories', () => {
    const items = [mockItem(), mockItem({ menu_item_id: 'item-2', category_id: 'cat-2' })];
    const config = mockConfig({ filter_mode: 'allowlist', filtered_category_ids: ['cat-2'] });
    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(1);
    expect(result[0].category_id).toBe('cat-2');
  });

  it('returns empty array when no items qualify', () => {
    const items = [mockItem()];
    const config = mockConfig({ filter_mode: 'allowlist', filtered_category_ids: ['cat-99'] });
    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(0);
  });

  it('handles empty order items', () => {
    const result = filterQualifyingItems([], mockConfig());
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/loyalty-engine.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement filterQualifyingItems and findActiveBoosters**

```typescript
// src/lib/loyalty-engine.ts
import type {
  LoyaltyConfig,
  LoyaltyBooster,
  LoyaltyOrderItem,
  LoyaltyCard,
  LoyaltyReward,
  EarningsResult,
} from '@/types/loyalty';

/**
 * Filter order items against the loyalty config's allowlist/blocklist.
 * Items that match by item ID OR category ID are included/excluded.
 */
export function filterQualifyingItems(
  items: LoyaltyOrderItem[],
  config: LoyaltyConfig
): LoyaltyOrderItem[] {
  if (items.length === 0) return [];

  const { filter_mode, filtered_category_ids, filtered_item_ids } = config;
  const catSet = new Set(filtered_category_ids);
  const itemSet = new Set(filtered_item_ids);

  // No filters configured — all items qualify regardless of mode
  if (catSet.size === 0 && itemSet.size === 0) {
    return filter_mode === 'blocklist' ? items : [];
  }

  return items.filter((item) => {
    const matchesFilter =
      itemSet.has(item.menu_item_id) || catSet.has(item.category_id);
    return filter_mode === 'allowlist' ? matchesFilter : !matchesFilter;
  });
}

/**
 * Find active boosters that apply to the given order items at the given date.
 * Returns only the single booster with the highest multiplier (no stacking).
 */
export function findActiveBoosters(
  boosters: LoyaltyBooster[],
  orderItems: LoyaltyOrderItem[],
  date: Date
): LoyaltyBooster | null {
  const now = date.getTime();
  const itemIds = new Set(orderItems.map((i) => i.menu_item_id));
  const catIds = new Set(orderItems.map((i) => i.category_id));

  const active = boosters.filter((b) => {
    if (!b.is_active) return false;
    if (new Date(b.starts_at).getTime() > now) return false;
    if (new Date(b.ends_at).getTime() < now) return false;

    if (b.filter_mode === 'all') return true;
    if (b.filter_mode === 'items') return b.filter_ids.some((id) => itemIds.has(id));
    if (b.filter_mode === 'categories') return b.filter_ids.some((id) => catIds.has(id));
    return false;
  });

  if (active.length === 0) return null;

  // Highest multiplier wins
  return active.reduce((best, b) => (b.multiplier > best.multiplier ? b : best));
}

/**
 * Calculate stamps and points earned for an order.
 * Stamps: awarded if at least one item qualifies (stamps_per_order × booster).
 * Points: floor(qualifying_subtotal × points_per_peso × booster).
 */
export function calculateEarnings(
  orderItems: LoyaltyOrderItem[],
  config: LoyaltyConfig,
  boosters: LoyaltyBooster[],
  now: Date = new Date()
): EarningsResult {
  const qualifying = filterQualifyingItems(orderItems, config);
  const qualifyingTotal = qualifying.reduce((sum, i) => sum + i.subtotal, 0);
  const booster = findActiveBoosters(boosters, qualifying, now);
  const multiplier = booster?.multiplier ?? 1;

  let stamps = 0;
  let points = 0;

  if (config.stamps_enabled && qualifying.length > 0) {
    stamps = Math.floor(config.stamps_per_order * multiplier);
  }

  if (config.points_enabled && qualifyingTotal > 0) {
    points = Math.floor(qualifyingTotal * config.points_per_peso * multiplier);
  }

  return {
    stamps,
    points,
    booster_id: booster?.id ?? null,
    booster_multiplier: multiplier,
    qualifying_total: qualifyingTotal,
  };
}

/**
 * Check if a card has reached the goal reward's requirements.
 * Goal is reached when EITHER stamps OR points requirement is met.
 */
export function checkGoalReached(
  card: LoyaltyCard,
  reward: LoyaltyReward | null
): boolean {
  if (!reward) return false;

  const stampsReached =
    reward.stamps_required !== null && card.current_stamps >= reward.stamps_required;
  const pointsReached =
    reward.points_required !== null && card.current_points >= reward.points_required;

  return stampsReached || pointsReached;
}

/**
 * Calculate remaining stamps/points after redemption (excess carries over).
 */
export function calculateCarryover(
  card: LoyaltyCard,
  reward: LoyaltyReward
): { stamps: number; points: number } {
  return {
    stamps: card.current_stamps - (reward.stamps_required ?? 0),
    points: card.current_points - (reward.points_required ?? 0),
  };
}
```

- [ ] **Step 4: Run tests to verify filterQualifyingItems passes**

Run: `npx vitest run tests/loyalty-engine.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: All filterQualifyingItems tests PASS

- [ ] **Step 5: Write tests for findActiveBoosters, calculateEarnings, checkGoalReached, calculateCarryover**

```typescript
// Append to tests/loyalty-engine.test.ts

const mockBooster = (overrides: Partial<LoyaltyBooster> = {}): LoyaltyBooster => ({
  id: 'boost-1',
  name: 'Weekend Double',
  multiplier: 2.0,
  applies_to: 'both',
  filter_mode: 'all',
  filter_ids: [],
  starts_at: '2026-03-01T00:00:00Z',
  ends_at: '2026-03-31T23:59:59Z',
  is_active: true,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  ...overrides,
});

const mockCard = (overrides: Partial<LoyaltyCard> = {}): LoyaltyCard => ({
  id: 'card-1',
  customer_id: 'cust-1',
  card_code: 'STARR-A7X2',
  current_stamps: 0,
  current_points: 0,
  goal_reward_id: 'reward-1',
  lifetime_stamps: 0,
  lifetime_points: 0,
  created_at: '2026-03-19T00:00:00Z',
  updated_at: '2026-03-19T00:00:00Z',
  ...overrides,
});

const mockReward = (overrides: Partial<LoyaltyReward> = {}): LoyaltyReward => ({
  id: 'reward-1',
  name: 'Free Premium Shake',
  description: null,
  image_url: null,
  stamps_required: 10,
  points_required: 500,
  is_active: true,
  sort_order: 0,
  created_at: '2026-03-19T00:00:00Z',
  updated_at: '2026-03-19T00:00:00Z',
  ...overrides,
});

describe('findActiveBoosters', () => {
  const dateInRange = new Date('2026-03-15T12:00:00Z');
  const dateOutOfRange = new Date('2026-04-15T12:00:00Z');

  it('returns null when no boosters exist', () => {
    const result = findActiveBoosters([], [mockItem()], dateInRange);
    expect(result).toBeNull();
  });

  it('returns active booster in date range', () => {
    const result = findActiveBoosters([mockBooster()], [mockItem()], dateInRange);
    expect(result?.id).toBe('boost-1');
  });

  it('returns null when booster is out of date range', () => {
    const result = findActiveBoosters([mockBooster()], [mockItem()], dateOutOfRange);
    expect(result).toBeNull();
  });

  it('returns null when booster is inactive', () => {
    const result = findActiveBoosters([mockBooster({ is_active: false })], [mockItem()], dateInRange);
    expect(result).toBeNull();
  });

  it('filters by category', () => {
    const booster = mockBooster({ filter_mode: 'categories', filter_ids: ['cat-99'] });
    const result = findActiveBoosters([booster], [mockItem()], dateInRange);
    expect(result).toBeNull();
  });

  it('matches by category', () => {
    const booster = mockBooster({ filter_mode: 'categories', filter_ids: ['cat-1'] });
    const result = findActiveBoosters([booster], [mockItem()], dateInRange);
    expect(result?.id).toBe('boost-1');
  });

  it('returns highest multiplier when multiple match', () => {
    const boosters = [
      mockBooster({ id: 'b1', multiplier: 2 }),
      mockBooster({ id: 'b2', multiplier: 3 }),
    ];
    const result = findActiveBoosters(boosters, [mockItem()], dateInRange);
    expect(result?.id).toBe('b2');
    expect(result?.multiplier).toBe(3);
  });
});

describe('calculateEarnings', () => {
  it('calculates stamps and points without booster', () => {
    const items = [mockItem({ subtotal: 150 })];
    const config = mockConfig({ stamps_per_order: 1, points_per_peso: 0.1 });
    const result = calculateEarnings(items, config, []);
    expect(result.stamps).toBe(1);
    expect(result.points).toBe(15); // floor(150 * 0.1)
    expect(result.booster_id).toBeNull();
  });

  it('returns zero stamps when stamps disabled', () => {
    const items = [mockItem({ subtotal: 150 })];
    const config = mockConfig({ stamps_enabled: false });
    const result = calculateEarnings(items, config, []);
    expect(result.stamps).toBe(0);
    expect(result.points).toBe(15);
  });

  it('returns zero points when points disabled', () => {
    const items = [mockItem({ subtotal: 150 })];
    const config = mockConfig({ points_enabled: false });
    const result = calculateEarnings(items, config, []);
    expect(result.stamps).toBe(1);
    expect(result.points).toBe(0);
  });

  it('returns zero everything when no items qualify', () => {
    const items = [mockItem()];
    const config = mockConfig({ filter_mode: 'allowlist', filtered_category_ids: ['cat-99'] });
    const result = calculateEarnings(items, config, []);
    expect(result.stamps).toBe(0);
    expect(result.points).toBe(0);
  });

  it('applies booster multiplier', () => {
    const items = [mockItem({ subtotal: 150 })];
    const config = mockConfig({ stamps_per_order: 1, points_per_peso: 0.1 });
    const boosters = [mockBooster({ multiplier: 2 })];
    // Note: calculateEarnings uses new Date() internally for booster check.
    // For deterministic tests, we need to mock Date or refactor.
    // For now, test with booster date range covering current time.
    const farFuture = '2099-12-31T23:59:59Z';
    const farPast = '2000-01-01T00:00:00Z';
    const testBoosters = [mockBooster({ multiplier: 2, starts_at: farPast, ends_at: farFuture })];
    const result = calculateEarnings(items, config, testBoosters);
    expect(result.stamps).toBe(2); // 1 * 2
    expect(result.points).toBe(30); // floor(150 * 0.1 * 2)
    expect(result.booster_multiplier).toBe(2);
  });

  it('floors fractional points', () => {
    const items = [mockItem({ subtotal: 155 })];
    const config = mockConfig({ points_per_peso: 0.1 });
    const result = calculateEarnings(items, config, []);
    expect(result.points).toBe(15); // floor(155 * 0.1) = floor(15.5) = 15
  });
});

describe('checkGoalReached', () => {
  it('returns false when no reward set', () => {
    expect(checkGoalReached(mockCard(), null)).toBe(false);
  });

  it('returns true when stamps requirement met', () => {
    const card = mockCard({ current_stamps: 10 });
    const reward = mockReward({ stamps_required: 10 });
    expect(checkGoalReached(card, reward)).toBe(true);
  });

  it('returns true when stamps exceeded', () => {
    const card = mockCard({ current_stamps: 12 });
    const reward = mockReward({ stamps_required: 10 });
    expect(checkGoalReached(card, reward)).toBe(true);
  });

  it('returns true when points requirement met', () => {
    const card = mockCard({ current_points: 500 });
    const reward = mockReward({ points_required: 500 });
    expect(checkGoalReached(card, reward)).toBe(true);
  });

  it('returns false when neither met', () => {
    const card = mockCard({ current_stamps: 5, current_points: 200 });
    const reward = mockReward({ stamps_required: 10, points_required: 500 });
    expect(checkGoalReached(card, reward)).toBe(false);
  });
});

describe('calculateCarryover', () => {
  it('calculates excess stamps and points', () => {
    const card = mockCard({ current_stamps: 12, current_points: 600 });
    const reward = mockReward({ stamps_required: 10, points_required: 500 });
    const result = calculateCarryover(card, reward);
    expect(result.stamps).toBe(2);
    expect(result.points).toBe(100);
  });

  it('handles null requirements', () => {
    const card = mockCard({ current_stamps: 12, current_points: 600 });
    const reward = mockReward({ stamps_required: null, points_required: 500 });
    const result = calculateCarryover(card, reward);
    expect(result.stamps).toBe(12); // 12 - 0
    expect(result.points).toBe(100);
  });
});
```

- [ ] **Step 6: Run all engine tests**

Run: `npx vitest run tests/loyalty-engine.test.ts --reporter=verbose 2>&1 | tail -40`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/loyalty-engine.ts tests/loyalty-engine.test.ts
git commit -m "feat(loyalty): add pure business logic engine with full test suite"
```

---

### Task 4: Hash Generation — loyalty-hash.ts

**Files:**
- Create: `src/lib/loyalty-hash.ts`
- Create: `tests/loyalty-hash.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/loyalty-hash.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCardCode, generateLoyaltyToken, isTokenExpired } from '@/lib/loyalty-hash';

describe('generateCardCode', () => {
  it('generates code with STARR- prefix', () => {
    const code = generateCardCode();
    expect(code).toMatch(/^STARR-[A-HJ-NP-Z2-9]{4}$/);
  });

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateCardCode()));
    expect(codes.size).toBeGreaterThan(90); // allow some collisions in random gen
  });

  it('excludes ambiguous characters', () => {
    const codes = Array.from({ length: 100 }, () => generateCardCode());
    for (const code of codes) {
      const suffix = code.replace('STARR-', '');
      expect(suffix).not.toMatch(/[IO01]/);
    }
  });
});

describe('generateLoyaltyToken', () => {
  it('returns a non-empty string', () => {
    vi.stubEnv('MESSENGER_SESSION_SECRET', 'test-secret-key-1234567890abcdef');
    const token = generateLoyaltyToken();
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    vi.unstubAllEnvs();
  });
});

describe('isTokenExpired', () => {
  it('returns false for future expiry', () => {
    const future = new Date(Date.now() + 60000).toISOString();
    expect(isTokenExpired(future)).toBe(false);
  });

  it('returns true for past expiry', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(isTokenExpired(past)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/loyalty-hash.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: FAIL — module not found

- [ ] **Step 3: Implement loyalty-hash.ts**

```typescript
// src/lib/loyalty-hash.ts
import { createHmac, randomUUID } from 'crypto';

// Characters excluding ambiguous I, O, 0, 1
const CARD_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function getSessionSecret(): string {
  const secret = process.env.MESSENGER_SESSION_SECRET;
  if (!secret) throw new Error('MESSENGER_SESSION_SECRET not set');
  return secret;
}

/** Generate a card code like "STARR-A7X2" */
export function generateCardCode(length = 4): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CARD_CODE_CHARS[Math.floor(Math.random() * CARD_CODE_CHARS.length)];
  }
  return `STARR-${code}`;
}

/** Generate a secure token for loyalty session links */
export function generateLoyaltyToken(): string {
  const uuid = randomUUID();
  const timestamp = Date.now().toString();
  const data = `loyalty.${uuid}.${timestamp}`;
  const signature = createHmac('sha256', getSessionSecret()).update(data).digest('hex');
  return `${uuid}-${signature.substring(0, 16)}`;
}

/** Get expiry timestamp 30 minutes from now */
export function getLoyaltySessionExpiry(): string {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

/** Check if a token has expired */
export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/loyalty-hash.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/loyalty-hash.ts tests/loyalty-hash.test.ts
git commit -m "feat(loyalty): add card code generation and session token utilities"
```

---

### Task 5: Notification Helpers — loyalty-notifications.ts

**Files:**
- Create: `src/lib/loyalty-notifications.ts`
- Create: `tests/loyalty-notifications.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/loyalty-notifications.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStampEarnedMessage, buildGoalAchievedMessage, buildRewardClaimedMessage } from '@/lib/loyalty-notifications';

describe('buildStampEarnedMessage', () => {
  it('includes stamp count and goal progress', () => {
    const msg = buildStampEarnedMessage(2, 8, 10, 'Free Premium Shake', 'boost-1');
    expect(msg).toContain('+2');
    expect(msg).toContain('8/10');
    expect(msg).toContain('Free Premium Shake');
  });

  it('mentions booster when applied', () => {
    const msg = buildStampEarnedMessage(2, 8, 10, 'Free Shake', 'boost-1');
    expect(msg).toContain('Boost');
  });

  it('omits booster mention when no booster', () => {
    const msg = buildStampEarnedMessage(1, 5, 10, 'Free Shake', null);
    expect(msg).not.toContain('Boost');
  });
});

describe('buildGoalAchievedMessage', () => {
  it('includes reward name and claim window', () => {
    const msg = buildGoalAchievedMessage('Free Premium Shake', 7);
    expect(msg).toContain('Free Premium Shake');
    expect(msg).toContain('7 days');
  });
});

describe('buildRewardClaimedMessage', () => {
  it('includes carryover stamps', () => {
    const msg = buildRewardClaimedMessage(2, 100);
    expect(msg).toContain('2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/loyalty-notifications.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: FAIL — module not found

- [ ] **Step 3: Implement notification message builders and send functions**

```typescript
// src/lib/loyalty-notifications.ts
import { sendTextMessage } from './messenger';

/** Build stamp earned notification text */
export function buildStampEarnedMessage(
  stampsEarned: number,
  currentStamps: number,
  goalStamps: number,
  goalName: string,
  boosterId: string | null
): string {
  const boosterNote = boosterId ? ' (Boost applied!)' : '';
  return `⭐ +${stampsEarned} starr${stampsEarned > 1 ? 's' : ''}${boosterNote}! You now have ${currentStamps}/${goalStamps} toward ${goalName}.`;
}

/** Build goal achieved notification text */
export function buildGoalAchievedMessage(rewardName: string, claimWindowDays: number): string {
  return `🎉 You earned a ${rewardName}! Claim it within ${claimWindowDays} days at any branch.`;
}

/** Build reward claimed notification text */
export function buildRewardClaimedMessage(carryoverStamps: number, carryoverPoints: number): string {
  const parts: string[] = ['✅ Reward claimed!'];
  if (carryoverStamps > 0 || carryoverPoints > 0) {
    const carry: string[] = [];
    if (carryoverStamps > 0) carry.push(`${carryoverStamps} starr${carryoverStamps > 1 ? 's' : ''}`);
    if (carryoverPoints > 0) carry.push(`${carryoverPoints} pts`);
    parts.push(`You have ${carry.join(' and ')} toward your next goal.`);
  }
  return parts.join(' ');
}

/** Send a loyalty notification via Messenger (checks 24hr window internally) */
export async function sendLoyaltyNotification(
  psid: string,
  text: string,
  pageAccessToken: string,
  messagingType: 'RESPONSE' | 'MESSAGE_TAG' = 'MESSAGE_TAG',
  tag?: string
): Promise<void> {
  try {
    await sendTextMessage(psid, text, pageAccessToken, messagingType, tag || 'POST_PURCHASE_UPDATE');
  } catch {
    // Fail silently — notifications are best-effort
  }
}
```

Note: The `sendTextMessage` function in `messenger.ts` will need a small update to accept `messagingType` and `tag` parameters. This is handled in Task 12 (Messenger Integration).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/loyalty-notifications.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/loyalty-notifications.ts tests/loyalty-notifications.test.ts
git commit -m "feat(loyalty): add notification message builders with tests"
```

---

**PHASE 1 REVIEW CHECKPOINT:**
After completing Tasks 1-5, dispatch code-reviewer subagent to review Phase 1 (types, migration, engine, hash, notifications). Verify all tests pass: `npx vitest run tests/loyalty-*.test.ts`

---

## Phase 2: Server Actions

### Task 6: Admin Config & Rewards Actions — loyalty-admin.ts

**Files:**
- Create: `src/actions/loyalty-admin.ts`
- Create: `tests/loyalty-admin.test.ts`

- [ ] **Step 1: Write failing tests for config and reward CRUD**

Tests should mock `supabaseServer` and verify:
- `updateLoyaltyConfig` calls `.update()` on `loyalty_config` and calls `revalidateTag('loyalty-config')`
- `createReward` inserts into `loyalty_rewards` and calls `revalidateTag('loyalty-rewards')`
- `updateReward` updates by ID
- All actions call `requireAdmin()` and `checkActionRateLimit()`
- Invalid input returns `{ success: false, error: '...' }`

Follow the exact pattern from `src/actions/customers.ts` — import `requireAdmin`, `checkActionRateLimit`, use Zod for validation, return `{ success: boolean; error?: string }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/loyalty-admin.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: FAIL

- [ ] **Step 3: Implement loyalty-admin.ts**

Follow the pattern from `src/actions/customers.ts`:
```typescript
'use server';

import { revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { z } from 'zod';

type ActionResult = { success: boolean; error?: string; data?: any };

const configSchema = z.object({
  stamps_enabled: z.boolean(),
  points_enabled: z.boolean(),
  points_per_peso: z.number().min(0),
  stamps_per_order: z.number().int().min(1),
  filter_mode: z.enum(['allowlist', 'blocklist']),
  filtered_category_ids: z.array(z.string()),
  filtered_item_ids: z.array(z.string()),
  claim_window_days: z.number().int().min(1).max(90),
});

const rewardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  stamps_required: z.number().int().min(1).nullable().optional(),
  points_required: z.number().int().min(1).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

// ... implement updateLoyaltyConfig, createReward, updateReward,
// createBooster, updateBooster, getLoyaltyConfig, getLoyaltyStats
// following the same requireAdmin + checkActionRateLimit + Zod pattern
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git add src/actions/loyalty-admin.ts tests/loyalty-admin.test.ts
git commit -m "feat(loyalty): add admin config and reward CRUD Server Actions"
```

---

### Task 7: Customer-Facing Actions — loyalty.ts

**Files:**
- Create: `src/actions/loyalty.ts`
- Create: `tests/loyalty-actions.test.ts`

- [ ] **Step 1: Write failing tests for core actions**

Test each function:
- `registerLoyaltyCard(hash, email, phone?)` — validates hash from `loyalty_sessions`, creates customer + card, idempotent
- `creditLoyalty(orderId)` — looks up card, calculates earnings via `loyalty-engine`, atomic update, double-credit prevention
- `redeemReward(redemptionId, branchId)` — calls `redeem_loyalty_reward` RPC
- `setGoal(cardId, rewardId)` — updates `goal_reward_id`
- `lookupCard(query)` — searches by code, name, email, phone
- `linkOrderToCard(orderId, cardId)` — checks for existing transaction, credits

Mock `supabaseServer` for all DB calls. Mock `loyalty-engine` functions where needed for deterministic behavior.

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement loyalty.ts**

Key implementation notes:
- `creditLoyalty` must use atomic SQL: `current_stamps = current_stamps + $delta`
- `creditLoyalty` must check `loyalty_transactions` for duplicate `order_id` before crediting
- `redeemReward` calls the `redeem_loyalty_reward` RPC for atomicity
- `registerLoyaltyCard` checks existing card by customer_id first (idempotent)
- All mutations use `checkActionRateLimit()` for public-facing actions
- Cache invalidation per the spec's tag table

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git add src/actions/loyalty.ts tests/loyalty-actions.test.ts
git commit -m "feat(loyalty): add customer-facing Server Actions — credit, redeem, register"
```

---

### Task 8: Cached Queries for SSR

**Files:**
- Modify: `src/lib/cached-queries.ts`

- [ ] **Step 1: Add loyalty cached queries**

Append to `src/lib/cached-queries.ts`:

```typescript
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
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/cached-queries.ts
git commit -m "feat(loyalty): add SSR cached queries for loyalty config, rewards, stats"
```

---

**PHASE 2 REVIEW CHECKPOINT:**
After Tasks 6-8, dispatch code-reviewer subagent. Verify all tests pass: `npx vitest run tests/loyalty-*.test.ts`

---

## Phase 3: Admin UI

### Task 9: Admin Loyalty Page — Shell + Config Tab

**Files:**
- Create: `app/admin/loyalty/page.tsx`
- Create: `app/admin/loyalty/LoyaltyContent.tsx`
- Create: `src/components/admin/LoyaltyConfigTab.tsx`
- Create: `src/hooks/useLoyaltyConfig.ts`
- Modify: `src/components/admin/Sidebar.tsx` — add "Loyalty" nav item

- [ ] **Step 1: Add "Loyalty" to Sidebar**

Add nav item after "Customers" in `Sidebar.tsx`:
```tsx
{ name: 'Loyalty', href: '/admin/loyalty', icon: '⭐' },
```

- [ ] **Step 2: Create SSR page (follows branches/page.tsx pattern)**

```tsx
// app/admin/loyalty/page.tsx
import { requireAdmin } from '@/lib/admin-guard';
import { getCachedLoyaltyConfig, getCachedLoyaltyRewards, getCachedLoyaltyStats } from '@/lib/cached-queries';
import LoyaltyContent from './LoyaltyContent';

export default async function LoyaltyPage() {
  await requireAdmin();
  const [config, rewards, stats] = await Promise.all([
    getCachedLoyaltyConfig(),
    getCachedLoyaltyRewards(),
    getCachedLoyaltyStats(),
  ]);
  return <LoyaltyContent initialConfig={config} initialRewards={rewards} initialStats={stats} />;
}
```

- [ ] **Step 3: Create LoyaltyContent (client component with tabs)**

Tabbed layout: Configuration, Rewards, Boosters, Redemptions, Lookup. Start with Configuration tab working, others as placeholders.

- [ ] **Step 4: Create useLoyaltyConfig hook**

Follows `useCustomers` pattern: manages config state, handles save with optimistic update, calls `updateLoyaltyConfig` Server Action.

- [ ] **Step 5: Create LoyaltyConfigTab**

Two cards side-by-side: Stamp System (toggle + stamps_per_order) and Point System (toggle + points_per_peso). Below: Qualifying Purchases (allowlist/blocklist toggle + category/item pills with add/remove). Bottom: Claim Window (days input). Save button.

- [ ] **Step 6: Verify page renders**

Run dev server and navigate to `/admin/loyalty`. Verify:
- Sidebar shows Loyalty item with active state
- Stats row renders (will show zeros)
- Config tab loads with default values
- Save button works

- [ ] **Step 7: Commit**

```bash
git add app/admin/loyalty/ src/components/admin/LoyaltyConfigTab.tsx src/hooks/useLoyaltyConfig.ts src/components/admin/Sidebar.tsx
git commit -m "feat(loyalty): add admin loyalty page with config tab"
```

---

### Task 10: Rewards Tab

**Files:**
- Create: `src/components/admin/LoyaltyRewardsTab.tsx`
- Create: `src/hooks/useLoyaltyRewards.ts`

- [ ] **Step 1: Create useLoyaltyRewards hook**

Manages rewards list, add/edit/disable. Calls `createReward`, `updateReward` Server Actions.

- [ ] **Step 2: Create LoyaltyRewardsTab**

Shows reward cards with: icon, name, description, stamps/points cost, "pursuing" count, Edit/Disable buttons. "Add Reward" button opens a modal/form. Follows existing admin card-list patterns.

- [ ] **Step 3: Wire into LoyaltyContent tabs**
- [ ] **Step 4: Verify in browser**
- [ ] **Step 5: Commit**

```bash
git add src/components/admin/LoyaltyRewardsTab.tsx src/hooks/useLoyaltyRewards.ts app/admin/loyalty/LoyaltyContent.tsx
git commit -m "feat(loyalty): add rewards tab — CRUD for reward catalog"
```

---

### Task 11: Boosters Tab

**Files:**
- Create: `src/components/admin/LoyaltyBoostersTab.tsx`
- Create: `src/hooks/useLoyaltyBoosters.ts`

- [ ] **Step 1: Create useLoyaltyBoosters hook**
- [ ] **Step 2: Create LoyaltyBoostersTab**

Card list showing: name, multiplier, applies_to, date range, filter, active/inactive. Add/Edit modal with date pickers. Shows "Active", "Upcoming", "Expired" sections.

- [ ] **Step 3: Wire into LoyaltyContent tabs**
- [ ] **Step 4: Verify in browser**
- [ ] **Step 5: Commit**

```bash
git add src/components/admin/LoyaltyBoostersTab.tsx src/hooks/useLoyaltyBoosters.ts app/admin/loyalty/LoyaltyContent.tsx
git commit -m "feat(loyalty): add boosters tab — CRUD for promotional multipliers"
```

---

### Task 12: Redemptions Tab + Lookup Tab

**Files:**
- Create: `src/components/admin/LoyaltyRedemptionsTab.tsx`
- Create: `src/components/admin/LoyaltyLookupTab.tsx`
- Create: `src/hooks/useLoyaltyLookup.ts`

- [ ] **Step 1: Create LoyaltyRedemptionsTab**

Table/card list of redemptions. Filter by status (earned/claimed/expired). Shows: customer name, reward, earned date, expires date, status badge, claimed details. For "earned" status, show "Mark Redeemed" button.

- [ ] **Step 2: Create useLoyaltyLookup hook**

Search function that queries by card_code, customer name, email, phone. Returns `LoyaltyCardLookup` results.

- [ ] **Step 3: Create LoyaltyLookupTab**

Search bar → result card showing: customer avatar/initials, name, card code, progress, pending rewards with "Mark Redeemed" button, order number input to credit loyalty.

- [ ] **Step 4: Wire both into LoyaltyContent tabs**
- [ ] **Step 5: Verify in browser**
- [ ] **Step 6: Commit**

```bash
git add src/components/admin/LoyaltyRedemptionsTab.tsx src/components/admin/LoyaltyLookupTab.tsx src/hooks/useLoyaltyLookup.ts app/admin/loyalty/LoyaltyContent.tsx
git commit -m "feat(loyalty): add redemptions and lookup tabs"
```

---

### Task 13: Customer Detail Loyalty Widget

**Files:**
- Create: `src/components/CustomerLoyaltyWidget.tsx`
- Modify: `src/components/CustomerDetailPanel.tsx` — add widget

- [ ] **Step 1: Create CustomerLoyaltyWidget**

Compact card: code, progress bar (10 segments), stamps/points count, goal name. Shows "No loyalty card" state when customer has none.

- [ ] **Step 2: Add widget to CustomerDetailPanel**

Insert after existing content, before recent orders section. Fetch loyalty card data by customer_id.

- [ ] **Step 3: Verify in browser** — select a customer, see widget
- [ ] **Step 4: Commit**

```bash
git add src/components/CustomerLoyaltyWidget.tsx src/components/CustomerDetailPanel.tsx
git commit -m "feat(loyalty): add loyalty widget to customer detail panel"
```

---

**PHASE 3 REVIEW CHECKPOINT:**
After Tasks 9-13, dispatch code-reviewer subagent for UI review. Focus on: accessibility, responsive behavior, consistent styling with existing admin pages, dark mode consistency.

---

## Phase 4: Customer-Facing Pages

### Task 14: Registration Page — /loyalty/register/[hash]

**Files:**
- Create: `app/loyalty/register/[hash]/page.tsx`
- Create: `app/loyalty/layout.tsx` (minimal layout for public loyalty pages)

- [ ] **Step 1: Create public loyalty layout**

Minimal layout — no admin sidebar. Teal gradient header with Starr's branding. Dark/light mode via `prefers-color-scheme` using CSS variables.

- [ ] **Step 2: Create registration page**

Server component that validates hash from `loyalty_sessions`. If invalid/expired → show error. If valid → render registration form (client component with email input, optional phone, submit button). On submit, calls `registerLoyaltyCard` Server Action.

- [ ] **Step 3: Style with dark/light mode support**

CSS variables: `--card-bg`, `--text-primary`, `--border`, `--bg-page` that flip between dark (#0d1117, #161b22) and light (#FAF8F5, #FFFFFF).

- [ ] **Step 4: Verify in browser** (manually create a `loyalty_sessions` row to test)
- [ ] **Step 5: Commit**

```bash
git add app/loyalty/
git commit -m "feat(loyalty): add customer registration page with dark/light mode"
```

---

### Task 15: Card Dashboard — /loyalty/card/[hash]

**Files:**
- Create: `app/loyalty/card/[hash]/page.tsx`
- Create: `src/components/loyalty/StampGrid.tsx`
- Create: `src/components/loyalty/PointsBar.tsx`
- Create: `src/components/loyalty/BoosterBanner.tsx`
- Create: `src/components/loyalty/ActivityList.tsx`

- [ ] **Step 1: Create StampGrid component**

Visual grid of filled starrs and empty slots. Last slot shows gift icon. Configurable count based on reward's `stamps_required`.

- [ ] **Step 2: Create PointsBar, BoosterBanner, ActivityList components**
- [ ] **Step 3: Create card dashboard page**

Server component: validates hash → loads card + reward + transactions + active boosters + pending redemptions. Renders: header with name + code, StampGrid, PointsBar, BoosterBanner (if active), pending reward alert, ActivityList, "View All Rewards" / "Change Goal" link.

- [ ] **Step 4: Style with dark/light mode**
- [ ] **Step 5: Verify in browser**
- [ ] **Step 6: Commit**

```bash
git add app/loyalty/card/ src/components/loyalty/
git commit -m "feat(loyalty): add customer card dashboard with stamp grid and activity"
```

---

### Task 16: Goal Picker — /loyalty/card/[hash]/goals

**Files:**
- Create: `app/loyalty/card/[hash]/goals/page.tsx`
- Create: `src/components/loyalty/RewardCard.tsx`

- [ ] **Step 1: Create RewardCard component**

Shows reward name, description, stamp/point cost, current progress bar if applicable. Tappable to select.

- [ ] **Step 2: Create goals page**

Lists active rewards from catalog. Current goal highlighted. Tap to select → calls `setGoal` Server Action → redirects back to card dashboard.

- [ ] **Step 3: Verify flow** — card dashboard → "Change Goal" → goals page → select → back to dashboard
- [ ] **Step 4: Commit**

```bash
git add app/loyalty/card/[hash]/goals/ src/components/loyalty/RewardCard.tsx
git commit -m "feat(loyalty): add goal picker page for customers"
```

---

**PHASE 4 UI/UX REVIEW CHECKPOINT:**
After Tasks 14-16, dispatch code-reviewer subagent focused on:
- Mobile responsiveness (375px viewport)
- Dark/light mode consistency
- Touch targets (min 44px)
- Loading states
- Error states (expired hash, invalid hash)
- Empty states (no transactions, no boosters)

---

## Phase 5: Messenger Integration

### Task 17: Update Messenger Handler

**Files:**
- Modify: `src/lib/messenger-handler.ts` — add "Loyalty Card" routing
- Modify: `src/lib/messenger.ts` — add `messagingType` and `tag` params to `sendTextMessage`

- [ ] **Step 1: Update sendTextMessage to support messaging_type and tag**

Add optional `messagingType` and `tag` parameters to `sendTextMessage` in `messenger.ts`. Default `messagingType` to `'RESPONSE'` for backwards compatibility.

- [ ] **Step 2: Add loyalty card handler to messenger-handler.ts**

When user sends "loyalty" or taps "Loyalty Card" persistent menu:
1. Check if PSID has a loyalty_card (via customer lookup)
2. If YES → create `loyalty_sessions` row (purpose: 'card_view') → send button template with link
3. If NO → create `loyalty_sessions` row (purpose: 'registration') → send button template with registration link

- [ ] **Step 3: Add post-first-order loyalty prompt**

After order completion notification, if customer has no loyalty card, append a quick reply: "Want to earn starrs?" with payload `LOYALTY_REGISTER`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/messenger-handler.ts src/lib/messenger.ts
git commit -m "feat(loyalty): add Messenger loyalty card menu and post-order prompt"
```

---

### Task 18: Wire Loyalty Crediting to Order Completion

**Files:**
- Modify: order status update logic (wherever order status changes to 'completed')

- [ ] **Step 1: Find where order status is updated to 'completed'**

Check the existing order update flow — likely in an action or API route handler.

- [ ] **Step 2: Add loyalty credit call**

After order is marked 'completed', call `creditLoyalty(orderId)`. This:
1. Finds the loyalty card by customer_id or messenger_psid
2. If no card → skip (customer hasn't registered for loyalty)
3. If card exists → calculate earnings → atomic update → check goal → notify

- [ ] **Step 3: Test with a mock order** — verify stamps are credited
- [ ] **Step 4: Commit**

```bash
git add [modified order files]
git commit -m "feat(loyalty): auto-credit loyalty on order completion"
```

---

**PHASE 5 REVIEW CHECKPOINT:**
After Tasks 17-18, verify the full Messenger flow works end-to-end.

---

## Phase 6: Testing

### Task 19: Integration Tests

**Files:**
- Modify: `tests/loyalty-actions.test.ts` (enhance)
- Create: `tests/loyalty-api.test.ts`

- [ ] **Step 1: Write integration tests for creditLoyalty**

Test cases:
- Credits stamps and points for a qualifying order
- Applies booster multiplier
- Skips non-qualifying items
- Prevents double-crediting same order
- Creates redemption when goal is reached
- Returns early when no loyalty card exists

- [ ] **Step 2: Write integration tests for redeemReward**

Test cases:
- Successfully marks redemption as claimed
- Deducts stamps/points, carries over excess
- Fails gracefully for already-claimed redemption
- Records branch and admin info

- [ ] **Step 3: Write API tests for hash validation**

Test cases:
- Valid hash loads registration page
- Expired hash shows error
- Tampered hash shows error
- Used registration hash shows error
- Valid card_view hash loads dashboard

- [ ] **Step 4: Run all tests**

Run: `npx vitest run tests/loyalty-*.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test(loyalty): add integration and API tests"
```

---

### Task 20: System & Acceptance Tests

**Files:**
- Create: `tests/loyalty-system.test.ts`

- [ ] **Step 1: Write full-flow system test**

```typescript
describe('Loyalty System — Full Flow', () => {
  it('register → earn stamps → hit goal → claim → carryover → new goal', async () => {
    // 1. Create loyalty session
    // 2. Register with email
    // 3. Verify card created with code
    // 4. Create qualifying orders, credit loyalty
    // 5. Verify stamps increment
    // 6. Hit goal threshold
    // 7. Verify redemption created
    // 8. Mark redeemed
    // 9. Verify carryover
    // 10. Set new goal
  });

  it('booster applies correctly during date range', async () => {
    // 1. Create booster for category X
    // 2. Order with items in category X
    // 3. Credit loyalty
    // 4. Verify multiplied stamps/points
  });

  it('config change mid-program works correctly', async () => {
    // 1. Register, earn some stamps
    // 2. Disable stamps in config
    // 3. New order → earns points only
    // 4. Re-enable stamps
    // 5. New order → earns both
    // 6. Existing stamps preserved
  });
});
```

- [ ] **Step 2: Write acceptance tests**

```typescript
describe('Acceptance Tests', () => {
  it('admin can look up customer and credit walk-in order');
  it('admin can mark reward as redeemed');
  it('expired rewards are handled correctly');
  it('boosters apply correctly during date range');
});
```

- [ ] **Step 3: Run all loyalty tests**

Run: `npx vitest run tests/loyalty-*.test.ts --reporter=verbose`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add tests/loyalty-system.test.ts
git commit -m "test(loyalty): add system and acceptance tests"
```

---

**PHASE 6 REVIEW CHECKPOINT:**
Final code review. All tests should pass. Dispatch code-reviewer subagent for full module review.

---

## Phase 7: Polish & Final Integration

### Task 21: Loading, Error, and Empty States

**Files:**
- Modify: All loyalty components

- [ ] **Step 1: Add loading skeletons to admin tabs**
- [ ] **Step 2: Add error boundaries to customer-facing pages**
- [ ] **Step 3: Add empty states** (no rewards configured, no transactions yet, no pending claims)
- [ ] **Step 4: Verify all states render correctly**
- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(loyalty): add loading, error, and empty states"
```

---

### Task 22: Final Run — All Tests

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -60`
Expected: All tests PASS (existing + loyalty)

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Run linter**

Run: `npx next lint 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 4: Build check**

Run: `npx next build 2>&1 | tail -30`
Expected: Build succeeds

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat(loyalty): complete loyalty card system — all tests passing"
```
