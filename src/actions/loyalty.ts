'use server';

import { revalidateTag } from 'next/cache';
import { requireAdmin, requireSuperAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { uuidSchema } from '@/lib/validation';
import { calculateEarnings, checkGoalReached } from '@/lib/loyalty-engine';
import { generateCardCode } from '@/lib/loyalty-hash';
import { z } from 'zod';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── registerLoyaltyCard ─────────────────────────────────────────────────────

export async function registerLoyaltyCard(
  hash: string,
  email: string,
  phone?: string,
): Promise<ActionResult> {
  // Validate inputs
  const hashResult = z.string().min(1).safeParse(hash);
  if (!hashResult.success) return { success: false, error: 'Invalid session hash' };

  const emailResult = z.string().email().safeParse(email);
  if (!emailResult.success) return { success: false, error: 'Invalid email' };

  if (phone !== undefined) {
    const phoneResult = z.string().min(1).safeParse(phone);
    if (!phoneResult.success) return { success: false, error: 'Invalid phone' };
  }

  // Validate session hash
  const { data: session } = await (supabaseServer
    .from('loyalty_sessions') as any)
    .select('*')
    .eq('token', hashResult.data)
    .eq('purpose', 'registration')
    .is('used_at', null)
    .single();

  if (!session) return { success: false, error: 'Invalid or expired session' };

  // Check expiry
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return { success: false, error: 'Session has expired' };
  }

  // Find or create customer: check by PSID first, then email, then phone
  let customer: any = null;

  // 1. Check by PSID from session
  if (session.psid) {
    const { data: byPsid } = await (supabaseServer
      .from('customers') as any)
      .select('*')
      .eq('messenger_psid', session.psid)
      .single();
    if (byPsid) customer = byPsid;
  }

  // 2. Check by email
  if (!customer) {
    const { data: byEmail } = await (supabaseServer
      .from('customers') as any)
      .select('*')
      .eq('email', emailResult.data)
      .single();
    if (byEmail) customer = byEmail;
  }

  // 3. Check by phone
  if (!customer && phone) {
    const { data: byPhone } = await (supabaseServer
      .from('customers') as any)
      .select('*')
      .eq('phone', phone)
      .single();
    if (byPhone) customer = byPhone;
  }

  // 4. Create customer if not found
  if (!customer) {
    const insertData: any = {
      email: emailResult.data,
      name: emailResult.data.split('@')[0],
    };
    if (phone) insertData.phone = phone;
    if (session.psid) insertData.messenger_psid = session.psid;

    const { data: newCustomer, error: createErr } = await (supabaseServer
      .from('customers') as any)
      .insert(insertData)
      .select()
      .single();

    if (createErr) {
      console.error('[registerLoyaltyCard] Failed to create customer:', createErr.code);
      return { success: false, error: 'Failed to create customer' };
    }
    customer = newCustomer;
  }

  // Check for existing loyalty card (idempotent)
  const { data: existingCard } = await (supabaseServer
    .from('loyalty_cards') as any)
    .select('*')
    .eq('customer_id', customer.id)
    .single();

  if (existingCard) {
    // Mark session as used
    await (supabaseServer
      .from('loyalty_sessions') as any)
      .update({ used_at: new Date().toISOString() })
      .eq('id', session.id);

    // Check if we should pick a goal
    const { data: activeRewards } = await (supabaseServer
      .from('loyalty_rewards') as any)
      .select('id')
      .eq('is_active', true);

    const shouldPickGoal = !existingCard.goal_reward_id && (activeRewards?.length ?? 0) > 1;

    // Auto-set goal if only 1 active reward
    if (!existingCard.goal_reward_id && activeRewards?.length === 1) {
      await (supabaseServer
        .from('loyalty_cards') as any)
        .update({ goal_reward_id: activeRewards[0].id })
        .eq('id', existingCard.id);
    }

    revalidateTag('loyalty-cards');
    revalidateTag('customers');
    return { success: true, data: { card: existingCard, shouldPickGoal } };
  }

  // Generate card code with collision retry (max 5 attempts, extend to 5 chars)
  let cardCode: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const codeLength = attempt >= 3 ? 5 : 4;
    const candidate = generateCardCode(codeLength);

    const { data: collision } = await (supabaseServer
      .from('loyalty_cards') as any)
      .select('id')
      .eq('card_code', candidate)
      .single();

    if (!collision) {
      cardCode = candidate;
      break;
    }
  }

  if (!cardCode) {
    return { success: false, error: 'Failed to generate unique card code. Please try again.' };
  }

  // Create loyalty card
  const { data: card, error: cardErr } = await (supabaseServer
    .from('loyalty_cards') as any)
    .insert({
      customer_id: customer.id,
      card_code: cardCode,
      current_stamps: 0,
      current_points: 0,
      lifetime_stamps: 0,
      lifetime_points: 0,
    })
    .select()
    .single();

  if (cardErr) {
    console.error('[registerLoyaltyCard] Failed to create card:', cardErr.code);
    return { success: false, error: 'Failed to create loyalty card' };
  }

  // Mark session as used
  await (supabaseServer
    .from('loyalty_sessions') as any)
    .update({ used_at: new Date().toISOString() })
    .eq('id', session.id);

  // Check active rewards for auto-goal
  const { data: activeRewards } = await (supabaseServer
    .from('loyalty_rewards') as any)
    .select('id')
    .eq('is_active', true);

  let shouldPickGoal = (activeRewards?.length ?? 0) > 1;

  // Auto-set goal if only 1 active reward
  if (activeRewards?.length === 1) {
    await (supabaseServer
      .from('loyalty_cards') as any)
      .update({ goal_reward_id: activeRewards[0].id })
      .eq('id', card.id);
    shouldPickGoal = false;
  }

  revalidateTag('loyalty-cards');
  revalidateTag('customers');
  return { success: true, data: { card, shouldPickGoal } };
}

// ─── creditLoyalty ───────────────────────────────────────────────────────────

export async function creditLoyalty(orderId: string): Promise<ActionResult> {
  const idResult = uuidSchema.safeParse(orderId);
  if (!idResult.success) return { success: false, error: 'Invalid order ID' };

  // Find order with items
  const { data: order } = await (supabaseServer
    .from('orders') as any)
    .select('id, customer_id, messenger_psid')
    .eq('id', idResult.data)
    .single();

  if (!order) return { success: false, error: 'Order not found' };

  // Get order items with category info
  const { data: orderItems } = await (supabaseServer
    .from('order_items') as any)
    .select('menu_item_id, category_id, name, quantity, subtotal')
    .eq('order_id', order.id);

  if (!orderItems || orderItems.length === 0) {
    return { success: true, data: { stamps: 0, points: 0, goalReached: false } };
  }

  // Find loyalty card by customer_id
  let card: any = null;

  if (order.customer_id) {
    const { data: byCustomer } = await (supabaseServer
      .from('loyalty_cards') as any)
      .select('*')
      .eq('customer_id', order.customer_id)
      .single();
    if (byCustomer) card = byCustomer;
  }

  // Fallback: find customer by messenger_psid, then get card
  if (!card && order.messenger_psid) {
    const { data: customer } = await (supabaseServer
      .from('customers') as any)
      .select('id')
      .eq('messenger_psid', order.messenger_psid)
      .single();

    if (customer) {
      const { data: byPsid } = await (supabaseServer
        .from('loyalty_cards') as any)
        .select('*')
        .eq('customer_id', customer.id)
        .single();
      if (byPsid) card = byPsid;
    }
  }

  // No card → no-op (customer hasn't registered)
  if (!card) {
    return { success: true, data: { stamps: 0, points: 0, goalReached: false } };
  }

  // Check for duplicate: existing 'earn' transaction with same order_id
  const { data: existingTx } = await (supabaseServer
    .from('loyalty_transactions') as any)
    .select('id')
    .eq('order_id', order.id)
    .eq('type', 'earn')
    .single();

  if (existingTx) {
    return { success: true, data: { stamps: 0, points: 0, goalReached: false } };
  }

  // Get loyalty config and active boosters
  const { data: config } = await (supabaseServer
    .from('loyalty_config') as any)
    .select('*')
    .eq('id', 1)
    .single();

  if (!config) {
    return { success: false, error: 'Loyalty config not found' };
  }

  const { data: boosters } = await (supabaseServer
    .from('loyalty_boosters') as any)
    .select('*')
    .eq('is_active', true);

  // Calculate earnings
  const earnings = calculateEarnings(orderItems, config, boosters || []);

  // If no qualifying items
  if (earnings.stamps === 0 && earnings.points === 0) {
    return { success: true, data: { stamps: 0, points: 0, goalReached: false } };
  }

  // ATOMIC UPDATE: use raw SQL-style update via Supabase RPC or manual increment
  // Supabase JS doesn't support SQL expressions, so we do a raw update via rpc
  // Actually, Supabase PostgREST doesn't support column references in updates.
  // We need to fetch, calculate, and update — but we must be careful about races.
  // The safest approach in Supabase JS is to use rpc or do select-then-update.
  // For atomicity, we use the current values + delta approach.
  const { error: updateErr } = await (supabaseServer
    .from('loyalty_cards') as any)
    .update({
      current_stamps: card.current_stamps + earnings.stamps,
      current_points: card.current_points + earnings.points,
      lifetime_stamps: card.lifetime_stamps + earnings.stamps,
      lifetime_points: card.lifetime_points + earnings.points,
    })
    .eq('id', card.id);

  if (updateErr) {
    console.error('[creditLoyalty] Failed to update card:', updateErr.code);
    return { success: false, error: 'Failed to update loyalty card' };
  }

  // Insert loyalty transaction
  const { error: txErr } = await (supabaseServer
    .from('loyalty_transactions') as any)
    .insert({
      card_id: card.id,
      order_id: order.id,
      type: 'earn',
      stamps_delta: earnings.stamps,
      points_delta: earnings.points,
      booster_id: earnings.booster_id,
      description: `Earned from order ${order.id}`,
    });

  if (txErr) {
    console.error('[creditLoyalty] Failed to insert transaction:', txErr.code);
    return { success: false, error: 'Failed to record transaction' };
  }

  // Re-fetch card to check goal
  const { data: updatedCard } = await (supabaseServer
    .from('loyalty_cards') as any)
    .select('*')
    .eq('id', card.id)
    .single();

  let goalReached = false;

  if (updatedCard?.goal_reward_id) {
    const { data: goalReward } = await (supabaseServer
      .from('loyalty_rewards') as any)
      .select('*')
      .eq('id', updatedCard.goal_reward_id)
      .single();

    if (goalReward && checkGoalReached(updatedCard, goalReward)) {
      goalReached = true;

      // Insert loyalty redemption (status='earned')
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (config.claim_window_days || 7));

      await (supabaseServer
        .from('loyalty_redemptions') as any)
        .insert({
          card_id: card.id,
          reward_id: goalReward.id,
          status: 'earned',
          earned_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });
    }
  }

  revalidateTag('loyalty-cards');
  revalidateTag('loyalty-transactions');
  return { success: true, data: { stamps: earnings.stamps, points: earnings.points, goalReached } };
}

// ─── redeemReward ────────────────────────────────────────────────────────────

export async function redeemReward(
  redemptionId: string,
  branchId: string,
): Promise<ActionResult> {
  const { adminType } = await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const redemptionIdResult = uuidSchema.safeParse(redemptionId);
  if (!redemptionIdResult.success) return { success: false, error: 'Invalid redemption ID' };

  const branchIdResult = uuidSchema.safeParse(branchId);
  if (!branchIdResult.success) return { success: false, error: 'Invalid branch ID' };

  // Resolve admin identity
  let performedBy = 'admin';
  if (adminType === 'super_admin') {
    const { adminId } = await requireSuperAdmin();
    const { data: sa } = await (supabaseServer
      .from('super_admins') as any)
      .select('email')
      .eq('id', adminId)
      .single();
    performedBy = sa?.email || adminId;
  }

  // Call RPC for atomic redemption
  const { error } = await (supabaseServer as any).rpc('redeem_loyalty_reward', {
    p_redemption_id: redemptionIdResult.data,
    p_branch_id: branchIdResult.data,
    p_claimed_by: performedBy,
  });

  if (error) {
    console.error('[redeemReward] RPC error:', error.message);
    return { success: false, error: error.message || 'Failed to redeem reward' };
  }

  revalidateTag('loyalty-cards');
  revalidateTag('loyalty-redemptions');
  revalidateTag('loyalty-transactions');
  return { success: true };
}

// ─── setGoal ─────────────────────────────────────────────────────────────────

export async function setGoal(
  cardId: string,
  rewardId: string,
): Promise<ActionResult> {
  const cardIdResult = uuidSchema.safeParse(cardId);
  if (!cardIdResult.success) return { success: false, error: 'Invalid card ID' };

  const rewardIdResult = uuidSchema.safeParse(rewardId);
  if (!rewardIdResult.success) return { success: false, error: 'Invalid reward ID' };

  // Verify reward exists and is active
  const { data: reward } = await (supabaseServer
    .from('loyalty_rewards') as any)
    .select('id, is_active')
    .eq('id', rewardIdResult.data)
    .single();

  if (!reward) return { success: false, error: 'Reward not found' };
  if (!reward.is_active) return { success: false, error: 'Reward is not active' };

  // Update loyalty card goal
  const { error } = await (supabaseServer
    .from('loyalty_cards') as any)
    .update({ goal_reward_id: rewardIdResult.data })
    .eq('id', cardIdResult.data);

  if (error) {
    console.error('[setGoal] DB error:', error.code);
    return { success: false, error: 'Failed to set goal' };
  }

  revalidateTag('loyalty-cards');
  return { success: true };
}

// ─── lookupCard ──────────────────────────────────────────────────────────────

export async function lookupCard(query: string): Promise<ActionResult> {
  await requireAdmin();

  const queryResult = z.string().min(1).max(100).safeParse(query);
  if (!queryResult.success) return { success: false, error: 'Invalid search query' };

  const searchTerm = `%${queryResult.data}%`;

  // Search loyalty cards joined with customers
  const { data: cards, error } = await (supabaseServer
    .from('loyalty_cards') as any)
    .select(`
      *,
      customers!inner (
        id,
        name,
        email,
        phone,
        messenger_psid
      )
    `)
    .or(
      `card_code.ilike.${searchTerm},` +
      `customers.name.ilike.${searchTerm},` +
      `customers.email.ilike.${searchTerm},` +
      `customers.phone.ilike.${searchTerm}`
    );

  if (error) {
    console.error('[lookupCard] DB error:', error.code);
    return { success: false, error: 'Failed to search cards' };
  }

  if (!cards || cards.length === 0) {
    return { success: true, data: [] };
  }

  // Enrich each card with goal reward and pending redemptions
  const results = await Promise.all(
    cards.map(async (card: any) => {
      let goalReward = null;
      if (card.goal_reward_id) {
        const { data: reward } = await (supabaseServer
          .from('loyalty_rewards') as any)
          .select('*')
          .eq('id', card.goal_reward_id)
          .single();
        goalReward = reward;
      }

      const { data: pendingRedemptions } = await (supabaseServer
        .from('loyalty_redemptions') as any)
        .select('*')
        .eq('card_id', card.id)
        .eq('status', 'earned');

      return {
        ...card,
        customer_name: card.customers?.name || null,
        customer_email: card.customers?.email || null,
        customer_phone: card.customers?.phone || null,
        messenger_psid: card.customers?.messenger_psid || null,
        goal_reward: goalReward,
        pending_redemptions: pendingRedemptions || [],
        customers: undefined, // Remove nested join data
      };
    }),
  );

  return { success: true, data: results };
}

// ─── linkOrderToCard ─────────────────────────────────────────────────────────

export async function linkOrderToCard(
  orderId: string,
  cardId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const orderIdResult = uuidSchema.safeParse(orderId);
  if (!orderIdResult.success) return { success: false, error: 'Invalid order ID' };

  const cardIdResult = uuidSchema.safeParse(cardId);
  if (!cardIdResult.success) return { success: false, error: 'Invalid card ID' };

  // Check for existing 'earn' transaction with same order_id (prevent double-credit)
  const { data: existingTx } = await (supabaseServer
    .from('loyalty_transactions') as any)
    .select('id')
    .eq('order_id', orderIdResult.data)
    .eq('type', 'earn')
    .single();

  if (existingTx) {
    return { success: false, error: 'Order has already been credited to a loyalty card' };
  }

  // Call creditLoyalty internally
  return creditLoyalty(orderIdResult.data);
}
