/**
 * Unit tests for src/lib/loyalty-notifications.ts (pure message builders)
 *
 * Requires: vitest (npm install --save-dev vitest)
 * Run:      npx vitest run src/__tests__/loyalty-notifications.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  buildStampEarnedMessage,
  buildGoalAchievedMessage,
  buildGoalClaimedMessage,
} from '@/lib/loyalty-notifications';

// ---------------------------------------------------------------------------
// buildStampEarnedMessage
// ---------------------------------------------------------------------------

describe('buildStampEarnedMessage', () => {
  it('singular "starr" for 1 stamp', () => {
    const msg = buildStampEarnedMessage(1, 5, 10, 'Free Shake', null);
    expect(msg).toContain('+1 starr');
    expect(msg).not.toContain('starrs');
  });

  it('plural "starrs" for multiple stamps', () => {
    const msg = buildStampEarnedMessage(3, 8, 10, 'Free Shake', null);
    expect(msg).toContain('+3 starrs');
  });

  it('boost suffix when boosterId provided', () => {
    const msg = buildStampEarnedMessage(2, 6, 10, 'Free Shake', 'boost-abc');
    expect(msg).toContain('(Boost applied!)');
  });

  it('no boost suffix when boosterId is null', () => {
    const msg = buildStampEarnedMessage(2, 6, 10, 'Free Shake', null);
    expect(msg).not.toContain('Boost');
  });

  it('includes current/goal/name in message', () => {
    const msg = buildStampEarnedMessage(1, 7, 10, 'Premium Shake', null);
    expect(msg).toContain('7/10');
    expect(msg).toContain('Premium Shake');
  });

  it('full message format matches expected shape', () => {
    const msg = buildStampEarnedMessage(2, 8, 10, 'Free Premium Shake', 'boost-xyz');
    expect(msg).toBe(
      '\u2B50 +2 starrs (Boost applied!)! You now have 8/10 toward Free Premium Shake.',
    );
  });

  it('full message format without booster', () => {
    const msg = buildStampEarnedMessage(1, 1, 10, 'Free Shake', null);
    expect(msg).toBe(
      '\u2B50 +1 starr! You now have 1/10 toward Free Shake.',
    );
  });
});

// ---------------------------------------------------------------------------
// buildGoalAchievedMessage
// ---------------------------------------------------------------------------

describe('buildGoalAchievedMessage', () => {
  it('includes reward name', () => {
    const msg = buildGoalAchievedMessage('Free Premium Shake', 7);
    expect(msg).toContain('Free Premium Shake');
  });

  it('includes claim window days', () => {
    const msg = buildGoalAchievedMessage('Free Shake', 14);
    expect(msg).toContain('14 days');
  });

  it('full message format', () => {
    const msg = buildGoalAchievedMessage('Free Premium Shake', 7);
    expect(msg).toBe(
      '\uD83C\uDF89 You earned a Free Premium Shake! Claim it within 7 days at any branch.',
    );
  });

  it('handles 1 day claim window', () => {
    const msg = buildGoalAchievedMessage('Free Shake', 1);
    expect(msg).toContain('1 days');
  });
});

// ---------------------------------------------------------------------------
// buildGoalClaimedMessage
// ---------------------------------------------------------------------------

describe('buildGoalClaimedMessage', () => {
  it('both stamps and points > 0 → shows both', () => {
    const msg = buildGoalClaimedMessage(2, 100);
    expect(msg).toContain('2 starrs');
    expect(msg).toContain('100 pts');
    expect(msg).toContain(' and ');
  });

  it('only stamps > 0 → shows only stamps', () => {
    const msg = buildGoalClaimedMessage(3, 0);
    expect(msg).toContain('3 starrs');
    expect(msg).not.toContain('pts');
    expect(msg).not.toContain(' and ');
  });

  it('only points > 0 → shows only points', () => {
    const msg = buildGoalClaimedMessage(0, 50);
    expect(msg).toContain('50 pts');
    expect(msg).not.toContain('starr');
    expect(msg).not.toContain(' and ');
  });

  it('both 0 → no "You have" portion', () => {
    const msg = buildGoalClaimedMessage(0, 0);
    expect(msg).toBe('\u2705 Goal claimed!');
    expect(msg).not.toContain('You have');
  });

  it('1 stamp uses singular "starr"', () => {
    const msg = buildGoalClaimedMessage(1, 0);
    expect(msg).toContain('1 starr');
    expect(msg).not.toContain('starrs');
  });

  it('full message with both carryovers', () => {
    const msg = buildGoalClaimedMessage(2, 100);
    expect(msg).toBe(
      '\u2705 Goal claimed! You have 2 starrs and 100 pts toward your next goal.',
    );
  });
});
