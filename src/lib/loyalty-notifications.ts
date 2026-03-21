import { sendTextMessage } from './messenger';

// ---------------------------------------------------------------------------
// Pure message builders
// ---------------------------------------------------------------------------

function pluraliseStarr(count: number): string {
  return count === 1 ? 'starr' : 'starrs';
}

/**
 * Build the "you just earned stamps" message.
 *
 * @example
 * buildStampEarnedMessage(2, 8, 10, 'Free Premium Shake', 'boost-abc')
 * // "⭐ +2 starrs (Boost applied!)! You now have 8/10 toward Free Premium Shake."
 */
export function buildStampEarnedMessage(
  stampsEarned: number,
  currentStamps: number,
  goalStamps: number,
  goalName: string,
  boosterId: string | null
): string {
  const stampWord = pluraliseStarr(stampsEarned);
  const boostSuffix = boosterId !== null ? ' (Boost applied!)' : '';
  return (
    `⭐ +${stampsEarned} ${stampWord}${boostSuffix}! ` +
    `You now have ${currentStamps}/${goalStamps} toward ${goalName}.`
  );
}

/**
 * Build the "you hit your reward goal" message.
 *
 * @example
 * buildGoalAchievedMessage('Free Premium Shake', 7)
 * // "🎉 You earned a Free Premium Shake! Claim it within 7 days at any branch."
 */
export function buildGoalAchievedMessage(
  rewardName: string,
  claimWindowDays: number
): string {
  return (
    `🎉 You earned a ${rewardName}! ` +
    `Claim it within ${claimWindowDays} days at any branch.`
  );
}

/**
 * Build the "you hit a milestone" message.
 *
 * @example
 * buildMilestoneEarnedMessage('Free Sticker')
 * // "🏆 You hit a milestone — Free Sticker!"
 */
export function buildMilestoneEarnedMessage(milestoneName: string): string {
  return `🏆 You hit a milestone — ${milestoneName}!`;
}

/**
 * Build the "goal was claimed" confirmation message.
 * Omits stamps or points portions when their value is 0.
 *
 * @example
 * buildGoalClaimedMessage(2, 100)
 * // "✅ Goal claimed! You have 2 starrs and 100 pts toward your next goal."
 *
 * buildGoalClaimedMessage(0, 50)
 * // "✅ Goal claimed! You have 50 pts toward your next goal."
 */
export function buildGoalClaimedMessage(
  carryoverStamps: number,
  carryoverPoints: number
): string {
  const parts: string[] = [];

  if (carryoverStamps > 0) {
    parts.push(`${carryoverStamps} ${pluraliseStarr(carryoverStamps)}`);
  }
  if (carryoverPoints > 0) {
    parts.push(`${carryoverPoints} pts`);
  }

  const havePart = parts.length > 0 ? ` You have ${parts.join(' and ')} toward your next goal.` : '';
  return `✅ Goal claimed!${havePart}`;
}

// ---------------------------------------------------------------------------
// Send helper
// ---------------------------------------------------------------------------

/**
 * Send a loyalty notification via Facebook Messenger.
 * Fails silently — errors are swallowed so the caller's flow is never interrupted.
 *
 * NOTE: messagingType and tag are accepted for forward-compatibility with Task 17
 * (Messenger Integration) but are not yet passed through to sendTextMessage,
 * which currently only accepts (psid, text, pageAccessToken).
 */
export async function sendLoyaltyNotification(
  psid: string,
  text: string,
  pageAccessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  messagingType: string = 'MESSAGE_TAG',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tag: string = 'POST_PURCHASE_UPDATE'
): Promise<void> {
  try {
    await sendTextMessage(psid, text, pageAccessToken);
  } catch {
    // Fails silently — loyalty notifications must never break the caller
  }
}
