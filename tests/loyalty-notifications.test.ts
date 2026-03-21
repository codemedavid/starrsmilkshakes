// tests/loyalty-notifications.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildStampEarnedMessage,
  buildGoalAchievedMessage,
  buildGoalClaimedMessage,
  buildMilestoneEarnedMessage,
} from '@/lib/loyalty-notifications';

describe('buildStampEarnedMessage', () => {
  it('includes stamp count, current progress and goal name', () => {
    const msg = buildStampEarnedMessage(1, 5, 10, 'Free Classic Shake', null);
    expect(msg).toContain('+1 starr');
    expect(msg).toContain('5/10');
    expect(msg).toContain('Free Classic Shake');
  });

  it('pluralises "starrs" when more than one stamp is earned', () => {
    const msg = buildStampEarnedMessage(2, 8, 10, 'Free Premium Shake', null);
    expect(msg).toContain('+2 starrs');
  });

  it('uses singular "starr" for exactly one stamp', () => {
    const msg = buildStampEarnedMessage(1, 3, 10, 'Free Shake', null);
    expect(msg).toContain('+1 starr');
    // must NOT say "starrs"
    expect(msg).not.toMatch(/\+1 starrs/);
  });

  it('mentions boost when boosterId is provided', () => {
    const msg = buildStampEarnedMessage(2, 8, 10, 'Free Premium Shake', 'boost-abc');
    expect(msg).toMatch(/boost/i);
  });

  it('does NOT mention boost when boosterId is null', () => {
    const msg = buildStampEarnedMessage(2, 8, 10, 'Free Premium Shake', null);
    expect(msg).not.toMatch(/boost/i);
  });

  it('matches the canonical example format', () => {
    const msg = buildStampEarnedMessage(2, 8, 10, 'Free Premium Shake', 'boost-xyz');
    // "⭐ +2 starrs (Boost applied!)! You now have 8/10 toward Free Premium Shake."
    expect(msg).toContain('⭐');
    expect(msg).toContain('+2 starrs');
    expect(msg).toContain('8/10');
    expect(msg).toContain('Free Premium Shake');
  });
});

describe('buildGoalAchievedMessage', () => {
  it('includes the reward name', () => {
    const msg = buildGoalAchievedMessage('Free Premium Shake', 7);
    expect(msg).toContain('Free Premium Shake');
  });

  it('includes the claim window in days', () => {
    const msg = buildGoalAchievedMessage('Free Premium Shake', 7);
    expect(msg).toContain('7');
  });

  it('matches the canonical example format', () => {
    const msg = buildGoalAchievedMessage('Free Premium Shake', 7);
    // "🎉 You earned a Free Premium Shake! Claim it within 7 days at any branch."
    expect(msg).toContain('🎉');
    expect(msg).toContain('Free Premium Shake');
    expect(msg).toContain('7 days');
    expect(msg).toContain('branch');
  });

  it('uses the provided claim window value', () => {
    const msg = buildGoalAchievedMessage('Reward', 30);
    expect(msg).toContain('30 days');
  });
});

describe('buildGoalClaimedMessage', () => {
  it('includes carryover stamps and points when both are non-zero', () => {
    const msg = buildGoalClaimedMessage(2, 100);
    expect(msg).toContain('2 starrs');
    expect(msg).toContain('100 pts');
  });

  it('omits stamps portion when carryover stamps are 0', () => {
    const msg = buildGoalClaimedMessage(0, 50);
    expect(msg).not.toContain('starr');
    expect(msg).toContain('50 pts');
  });

  it('omits points portion when carryover points are 0', () => {
    const msg = buildGoalClaimedMessage(3, 0);
    expect(msg).toContain('3 starrs');
    expect(msg).not.toContain('pts');
  });

  it('omits both portions when both are 0', () => {
    const msg = buildGoalClaimedMessage(0, 0);
    expect(msg).not.toContain('starr');
    expect(msg).not.toContain('pts');
  });

  it('uses singular "starr" for exactly one carryover stamp', () => {
    const msg = buildGoalClaimedMessage(1, 0);
    expect(msg).toContain('1 starr');
    expect(msg).not.toMatch(/1 starrs/);
  });

  it('matches the canonical example format', () => {
    const msg = buildGoalClaimedMessage(2, 100);
    // "✅ Goal claimed! You have 2 starrs and 100 pts toward your next goal."
    expect(msg).toContain('✅');
    expect(msg).toContain('Goal claimed');
    expect(msg).toContain('2 starrs');
    expect(msg).toContain('100 pts');
    expect(msg).toContain('next goal');
  });
});

describe('buildMilestoneEarnedMessage', () => {
  it('builds a milestone message with the name', () => {
    expect(buildMilestoneEarnedMessage('Free Sticker')).toBe(
      '🏆 You hit a milestone — Free Sticker!',
    );
  });
});
