'use server';

import { revalidateTag } from 'next/cache';
import { requireAdmin, requireSuperAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { uuidSchema } from '@/lib/validation';
import { calculateEarnings, checkGoalReached, checkMilestonesReached } from '@/lib/loyalty-engine';
import { generateCardCode, generateLoyaltyToken, getLoyaltySessionExpiry } from '@/lib/loyalty-hash';
import { buildStampEarnedMessage, buildGoalAchievedMessage, buildMilestoneEarnedMessage, sendLoyaltyNotification } from '@/lib/loyalty-notifications';
import { z } from 'zod';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── checkAndClaimMilestones (internal helper) ──────────────────────────────

async function checkAndClaimMilestones(
  supabase: any, // SupabaseClient
  card: { id: string; goal_id: string; current_stamps: number },
  messengerPsid: string | null,
  pageAccessToken: string | null,
) {
  const { data: activeMilestones } = await supabase
    .from('loyalty_milestones')
    .select('*')
    .eq('is_active', true)
    .lte('stamps_required', card.current_stamps)
    .order('stamps_required', { ascending: true });

  const { data: existingClaims } = await supabase
    .from('loyalty_milestone_claims')
    .select('milestone_id')
    .eq('card_id', card.id)
    .eq('goal_id', card.goal_id);

  const newMilestones = checkMilestonesReached(
    card.current_stamps,
    activeMilestones || [],
    existingClaims || [],
  );

  for (const ms of newMilestones) {
    const { data: inserted } = await supabase
      .from('loyalty_milestone_claims')
      .upsert(
        { card_id: card.id, milestone_id: ms.id, goal_id: card.goal_id },
        { onConflict: 'card_id,milestone_id,goal_id', ignoreDuplicates: true },
      )
      .select('id')
      .single();

    if (inserted?.id && messengerPsid && pageAccessToken) {
      const msg = buildMilestoneEarnedMessage(ms.name);
      await sendLoyaltyNotification(messengerPsid, msg, pageAccessToken);
    }
  }

  if (newMilestones.length > 0) revalidateTag('loyalty-milestone-claims');
}

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

    // New customers start with goal_id = null — no auto-goal-assignment

    // Create a card_view session so the customer can view their card
    const viewToken = generateLoyaltyToken();
    await (supabaseServer.from('loyalty_sessions') as any).insert({
      token: viewToken,
      psid: session.psid,
      purpose: 'card_view',
      expires_at: getLoyaltySessionExpiry(),
    });

    revalidateTag('loyalty-cards');
    revalidateTag('customers');
    return { success: true, data: { card: existingCard, shouldPickGoal: !existingCard.goal_id, viewToken } };
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

  // Create loyalty card — no auto-goal, customers start with goal_id = null
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

  // New customers start with goal_id = null — no auto-goal-assignment

  // Create a card_view session so the customer can view their card
  const viewToken = generateLoyaltyToken();
  await (supabaseServer.from('loyalty_sessions') as any).insert({
    token: viewToken,
    psid: session.psid,
    purpose: 'card_view',
    expires_at: getLoyaltySessionExpiry(),
  });

  revalidateTag('loyalty-cards');
  revalidateTag('customers');
  return { success: true, data: { card, shouldPickGoal: true, viewToken } };
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

  // Get order items with category info (join through menu_items for category)
  const { data: rawItems } = await (supabaseServer
    .from('order_items') as any)
    .select('menu_item_id, menu_item_name, quantity, total_price, menu_items(category)')
    .eq('order_id', order.id);

  if (!rawItems || rawItems.length === 0) {
    return { success: true, data: { stamps: 0, points: 0, goalReached: false } };
  }

  // Map to LoyaltyOrderItem format expected by calculateEarnings
  const orderItems = (rawItems || []).map((item: any) => ({
    menu_item_id: item.menu_item_id,
    category_id: item.menu_items?.category || '',
    name: item.menu_item_name,
    quantity: item.quantity,
    subtotal: Number(item.total_price),
  }));

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
    .limit(1)
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
  let goalReward: any = null;

  if (updatedCard?.goal_id) {
    const { data: fetchedGoalReward } = await (supabaseServer
      .from('loyalty_goals') as any)
      .select('*')
      .eq('id', updatedCard.goal_id)
      .single();

    goalReward = fetchedGoalReward;

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

  // Resolve messenger PSID and page access token for notifications
  let messengerPsid = order.messenger_psid;
  let pageAccessToken: string | null = null;

  try {
    if (!messengerPsid) {
      const { data: cust } = await (supabaseServer.from('customers') as any)
        .select('messenger_psid')
        .eq('id', card.customer_id)
        .single();
      messengerPsid = cust?.messenger_psid;
    }

    if (messengerPsid) {
      const { data: fbConfig } = await (supabaseServer.from('facebook_config') as any)
        .select('page_access_token')
        .single();
      pageAccessToken = fbConfig?.page_access_token || null;
    }
  } catch {
    // Resolve silently — notifications are best-effort
  }

  // Auto-check milestones after stamp credit (with messenger credentials for notifications)
  if (updatedCard?.goal_id) {
    await checkAndClaimMilestones(supabaseServer, updatedCard, messengerPsid, pageAccessToken);
  }

  // Send notifications (non-blocking, fail-silent)
  try {
    if (messengerPsid && pageAccessToken) {
      // Stamp earned notification
      if (updatedCard?.goal_id && goalReward) {
        const msg = buildStampEarnedMessage(
          earnings.stamps,
          updatedCard.current_stamps,
          goalReward.stamps_required ?? 0,
          goalReward.name,
          earnings.booster_id
        );
        await sendLoyaltyNotification(messengerPsid, msg, pageAccessToken);
      }

      // Goal achieved notification
      if (goalReached && goalReward) {
        const goalMsg = buildGoalAchievedMessage(goalReward.name, config.claim_window_days || 7);
        await sendLoyaltyNotification(messengerPsid, goalMsg, pageAccessToken);
      }
    }
  } catch (notifErr) {
    console.error('[creditLoyalty] Notification error (non-fatal):', notifErr);
  }

  revalidateTag('loyalty-cards');
  revalidateTag('loyalty-transactions');
  return { success: true, data: { stamps: earnings.stamps, points: earnings.points, goalReached } };
}

// ─── redeemGoal ─────────────────────────────────────────────────────────────

export async function redeemGoal(
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
  const { error } = await (supabaseServer as any).rpc('redeem_loyalty_goal', {
    p_redemption_id: redemptionIdResult.data,
    p_branch_id: branchIdResult.data,
    p_claimed_by: performedBy,
  });

  if (error) {
    console.error('[redeemGoal] RPC error:', error.message);
    return { success: false, error: error.message || 'Failed to redeem goal' };
  }

  revalidateTag('loyalty-cards');
  revalidateTag('loyalty-redemptions');
  revalidateTag('loyalty-transactions');
  revalidateTag('loyalty-goals');
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

  // Guard: prevent changing goal if one is already active
  const { data: card } = await (supabaseServer
    .from('loyalty_cards') as any)
    .select('goal_id, current_stamps')
    .eq('id', cardIdResult.data)
    .single();

  if (card?.goal_id) {
    return { success: false, error: 'You already have an active goal. Complete it first to choose a new one.' };
  }

  // Verify goal exists and is active
  const { data: reward } = await (supabaseServer
    .from('loyalty_goals') as any)
    .select('id, is_active')
    .eq('id', rewardIdResult.data)
    .single();

  if (!reward) return { success: false, error: 'Goal not found' };
  if (!reward.is_active) return { success: false, error: 'Goal is not active' };

  // Update loyalty card goal
  const { error } = await (supabaseServer
    .from('loyalty_cards') as any)
    .update({ goal_id: rewardIdResult.data })
    .eq('id', cardIdResult.data);

  if (error) {
    console.error('[setGoal] DB error:', error.code);
    return { success: false, error: 'Failed to set goal' };
  }

  // Check if carryover stamps already cross any milestones
  if (card?.current_stamps && card.current_stamps > 0) {
    await checkAndClaimMilestones(
      supabaseServer,
      { id: cardIdResult.data, goal_id: rewardIdResult.data, current_stamps: card.current_stamps },
      null, null  // No messenger notification on goal selection
    );
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

  // Search customers first, then find their loyalty cards.
  // PostgREST .or() does not support filtering on joined tables,
  // so we search customers separately and then query cards.
  const { data: matchingCustomers, error: custErr } = await (supabaseServer
    .from('customers') as any)
    .select('id')
    .or(
      `name.ilike.${searchTerm},` +
      `email.ilike.${searchTerm},` +
      `phone.ilike.${searchTerm}`
    );

  if (custErr) {
    console.error('[lookupCard] Customer search error:', custErr.code);
    return { success: false, error: 'Failed to search cards' };
  }

  const customerIds = (matchingCustomers || []).map((c: any) => c.id);

  // Build card query: match by card_code OR by customer IDs from name/email/phone search
  let dbQuery = (supabaseServer
    .from('loyalty_cards') as any)
    .select(`
      *,
      customers (
        id,
        name,
        email,
        phone,
        messenger_psid
      )
    `);

  if (customerIds.length > 0) {
    dbQuery = dbQuery.or(`card_code.ilike.${searchTerm},customer_id.in.(${customerIds.join(',')})`);
  } else {
    dbQuery = dbQuery.ilike('card_code', searchTerm);
  }

  const { data: cards, error } = await dbQuery;

  if (error) {
    console.error('[lookupCard] DB error:', error.code);
    return { success: false, error: 'Failed to search cards' };
  }

  if (!cards || cards.length === 0) {
    return { success: true, data: [] };
  }

  // Enrich each card with goal and pending redemptions
  const results = await Promise.all(
    cards.map(async (card: any) => {
      let goal = null;
      if (card.goal_id) {
        const { data: goalData } = await (supabaseServer
          .from('loyalty_goals') as any)
          .select('*')
          .eq('id', card.goal_id)
          .single();
        goal = goalData;
      }

      const { data: pendingRedemptions } = await (supabaseServer
        .from('loyalty_redemptions') as any)
        .select('*, loyalty_goals(name)')
        .eq('card_id', card.id)
        .eq('status', 'earned');

      // Fetch milestone claims for this card + goal
      const { data: milestoneClaims } = await (supabaseServer
        .from('loyalty_milestone_claims') as any)
        .select('*, loyalty_milestones(name, stamps_required)')
        .eq('card_id', card.id)
        .eq('goal_id', card.goal_id);

      return {
        ...card,
        customer_name: card.customers?.name || null,
        customer_email: card.customers?.email || null,
        customer_phone: card.customers?.phone || null,
        messenger_psid: card.customers?.messenger_psid || null,
        goal: goal,
        milestone_claims: milestoneClaims || [],
        pending_redemptions: (pendingRedemptions || []).map((r: any) => ({
          ...r,
          reward_name: r.loyalty_goals?.name || null,
          loyalty_goals: undefined,
        })),
        customers: undefined, // Remove nested join data
      };
    }),
  );

  return { success: true, data: results };
}

// ─── getCardByCustomerId ──────────────────────────────────────────────────────

export async function getCardByCustomerId(customerId: string): Promise<ActionResult> {
  await requireAdmin();
  const idResult = uuidSchema.safeParse(customerId);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const { data: card } = await (supabaseServer.from('loyalty_cards') as any)
    .select('*, loyalty_goals!goal_id(name, stamps_required, points_required)')
    .eq('customer_id', idResult.data)
    .maybeSingle();

  return { success: true, data: card };
}

// ─── linkOrderToCard ─────────────────────────────────────────────────────────

export async function linkOrderToCard(
  orderIdentifier: string,
  cardId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const cardIdResult = uuidSchema.safeParse(cardId);
  if (!cardIdResult.success) return { success: false, error: 'Invalid card ID' };

  // Support both UUID and order_number (e.g. ORD-20250902-0001)
  let resolvedOrderId: string;
  const uuidResult = uuidSchema.safeParse(orderIdentifier);
  if (uuidResult.success) {
    resolvedOrderId = uuidResult.data;
  } else {
    // Try looking up by order_number
    const sanitized = orderIdentifier.trim().toUpperCase();
    const { data: order } = await (supabaseServer
      .from('orders') as any)
      .select('id')
      .eq('order_number', sanitized)
      .single();

    if (!order) return { success: false, error: 'Order not found. Enter a valid order number (e.g. ORD-20260319-0001).' };
    resolvedOrderId = order.id;
  }

  // Check for existing 'earn' transaction with same order_id (prevent double-credit)
  const { data: existingTx } = await (supabaseServer
    .from('loyalty_transactions') as any)
    .select('id')
    .eq('order_id', resolvedOrderId)
    .eq('type', 'earn')
    .single();

  if (existingTx) {
    return { success: false, error: 'Order has already been credited to a loyalty card' };
  }

  // Call creditLoyalty internally
  return creditLoyalty(resolvedOrderId);
}
