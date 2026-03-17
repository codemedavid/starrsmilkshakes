// src/lib/messenger-handler.ts
import { supabaseServer } from '@/lib/supabase-server';
import {
  sendTextMessage,
  sendQuickReplies,
  sendGenericTemplate,
  sendButtonTemplate,
  buildCategoryQuickReplies,
  buildProductCards,
  buildCartSummary,
  type QuickReply,
} from '@/lib/messenger';
import { generateCheckoutHash, getCheckoutExpiresAt } from '@/lib/messenger-session';
import type { MessengerSession, MessengerCartItem } from '@/types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
const PRODUCTS_PER_PAGE = 10;

export async function handleMessengerEvent(event: any, pageToken: string): Promise<void> {
  const psid: string = event.sender?.id;
  if (!psid) return;

  const session = await getOrCreateSession(psid);

  if (event.message?.quick_reply?.payload) {
    await handlePostback(psid, event.message.quick_reply.payload, session, pageToken);
  } else if (event.postback?.payload) {
    await handlePostback(psid, event.postback.payload, session, pageToken);
  } else if (event.message?.text) {
    await handleTextMessage(psid, event.message.text, session, pageToken);
  }
}

async function getOrCreateSession(psid: string): Promise<MessengerSession> {
  const { data } = await supabaseServer
    .from('messenger_sessions')
    .select('*')
    .eq('psid', psid)
    .single();

  if (data) return data as MessengerSession;

  const newSession = {
    psid,
    state: 'idle',
    current_category: null,
    selected_branch: null,
    current_page: 0,
    pending_item_id: null,
    pending_variation_id: null,
    pending_add_ons: [],
    cart: [],
  };

  await supabaseServer.from('messenger_sessions').insert(newSession);
  return newSession as unknown as MessengerSession;
}

async function updateSession(psid: string, updates: Partial<MessengerSession>): Promise<void> {
  await supabaseServer.from('messenger_sessions').update(updates).eq('psid', psid);
}

async function handleTextMessage(psid: string, _text: string, _session: MessengerSession, pageToken: string): Promise<void> {
  // Any text message shows the main menu
  await showCategories(psid, pageToken);
}

async function handlePostback(psid: string, payload: string, session: MessengerSession, pageToken: string): Promise<void> {
  if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') {
    await showCategories(psid, pageToken);
  } else if (payload.startsWith('CATEGORY_')) {
    const categoryId = payload.replace('CATEGORY_', '');
    await showProducts(psid, categoryId, 0, pageToken);
  } else if (payload === 'MORE_PRODUCTS') {
    if (session.current_category) {
      await showProducts(psid, session.current_category, session.current_page + 1, pageToken);
    }
  } else if (payload.startsWith('ADD_TO_CART_')) {
    const itemId = payload.replace('ADD_TO_CART_', '');
    await handleAddToCart(psid, itemId, pageToken);
  } else if (payload.startsWith('SELECT_VARIATION_')) {
    const variationId = payload.replace('SELECT_VARIATION_', '');
    await handleSelectVariation(psid, variationId, pageToken);
  } else if (payload.startsWith('SELECT_ADDON_')) {
    const addonId = payload.replace('SELECT_ADDON_', '');
    await handleSelectAddon(psid, addonId, pageToken);
  } else if (payload === 'SKIP_ADDONS' || payload === 'DONE_ADDONS') {
    await finalizeCartItem(psid, pageToken);
  } else if (payload === 'VIEW_CART') {
    await showCart(psid, pageToken);
  } else if (payload === 'CONTINUE_SHOPPING') {
    await showCategories(psid, pageToken);
  } else if (payload === 'CLEAR_CART') {
    await updateSession(psid, { cart: [], state: 'idle' } as any);
    await sendTextMessage(psid, 'Cart cleared!', pageToken);
    await showCategories(psid, pageToken);
  } else if (payload === 'CHECKOUT') {
    await handleCheckout(psid, pageToken);
  } else if (payload.startsWith('SELECT_BRANCH_')) {
    const branchId = payload.replace('SELECT_BRANCH_', '');
    await handleBranchSelected(psid, branchId, pageToken);
  } else if (payload.startsWith('REMOVE_ITEM_')) {
    const index = parseInt(payload.replace('REMOVE_ITEM_', ''), 10);
    await handleRemoveItem(psid, index, pageToken);
  }
}

async function showCategories(psid: string, pageToken: string): Promise<void> {
  const { data: categories } = await supabaseServer
    .from('categories')
    .select('id, name, icon')
    .eq('active', true)
    .order('sort_order');

  if (!categories || categories.length === 0) {
    await sendTextMessage(psid, 'No categories available right now.', pageToken);
    return;
  }

  await updateSession(psid, { state: 'browsing_categories', current_category: null, current_page: 0 } as any);

  // Facebook limits quick replies to 13
  const quickReplies = buildCategoryQuickReplies(categories.slice(0, 13));
  await sendQuickReplies(psid, "Welcome to Starr's Famous Shakes! What are you craving?", quickReplies, pageToken);
}

async function showProducts(psid: string, categoryId: string, page: number, pageToken: string): Promise<void> {
  const offset = page * PRODUCTS_PER_PAGE;

  const { data: items, count } = await supabaseServer
    .from('menu_items')
    .select('id, name, description, base_price, image_url, discount_price, discount_active, discount_start_date, discount_end_date', { count: 'exact' })
    .eq('category', categoryId)
    .eq('available', true)
    .eq('show_in_messenger', true)
    .range(offset, offset + PRODUCTS_PER_PAGE - 1);

  if (!items || items.length === 0) {
    await sendTextMessage(psid, 'No items available in this category for Messenger.', pageToken);
    await showCategories(psid, pageToken);
    return;
  }

  await updateSession(psid, { state: 'browsing_products', current_category: categoryId, current_page: page } as any);

  const mapped = items.map((item: any) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    basePrice: item.base_price,
    image: item.image_url,
    discountPrice: item.discount_price,
    discountActive: item.discount_active,
  }));

  const cards = buildProductCards(mapped, getSiteUrl());
  await sendGenericTemplate(psid, cards, pageToken);

  // Show pagination + cart buttons if more products
  const totalCount = count || 0;
  const quickReplies: QuickReply[] = [];
  if (offset + PRODUCTS_PER_PAGE < totalCount) {
    quickReplies.push({ content_type: 'text', title: 'More Products', payload: 'MORE_PRODUCTS' });
  }
  quickReplies.push({ content_type: 'text', title: 'View Cart', payload: 'VIEW_CART' });
  quickReplies.push({ content_type: 'text', title: 'Back to Menu', payload: 'MAIN_MENU' });

  if (quickReplies.length > 0) {
    await sendQuickReplies(psid, 'What would you like to do?', quickReplies, pageToken);
  }
}

async function handleAddToCart(psid: string, itemId: string, pageToken: string): Promise<void> {
  const { data: variations } = await supabaseServer
    .from('variations')
    .select('id, name, price')
    .eq('menu_item_id', itemId);

  if (variations && variations.length > 0) {
    await updateSession(psid, {
      state: 'selecting_variation',
      pending_item_id: itemId,
      pending_variation_id: null,
      pending_add_ons: [],
    } as any);

    const quickReplies: QuickReply[] = variations.map((v: any) => ({
      content_type: 'text' as const,
      title: `${v.name} (+₱${v.price})`,
      payload: `SELECT_VARIATION_${v.id}`,
    }));
    await sendQuickReplies(psid, 'Choose a variation:', quickReplies, pageToken);
  } else {
    await updateSession(psid, {
      pending_item_id: itemId,
      pending_variation_id: null,
      pending_add_ons: [],
    } as any);
    await checkAndShowAddOns(psid, itemId, pageToken);
  }
}

async function handleSelectVariation(psid: string, variationId: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  await updateSession(psid, { pending_variation_id: variationId } as any);
  if (session.pending_item_id) {
    await checkAndShowAddOns(psid, session.pending_item_id, pageToken);
  }
}

async function checkAndShowAddOns(psid: string, itemId: string, pageToken: string): Promise<void> {
  const { data: addOns } = await supabaseServer
    .from('add_ons')
    .select('id, name, price')
    .eq('menu_item_id', itemId);

  if (addOns && addOns.length > 0) {
    await updateSession(psid, { state: 'selecting_addons' } as any);
    const quickReplies: QuickReply[] = [
      ...addOns.slice(0, 10).map((a: any) => ({
        content_type: 'text' as const,
        title: `${a.name} (+₱${a.price})`,
        payload: `SELECT_ADDON_${a.id}`,
      })),
      { content_type: 'text' as const, title: 'Skip', payload: 'SKIP_ADDONS' },
    ];
    await sendQuickReplies(psid, 'Any extras? Tap to add, or skip.', quickReplies, pageToken);
  } else {
    await finalizeCartItem(psid, pageToken);
  }
}

async function handleSelectAddon(psid: string, addonId: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  const addOns = [...(session.pending_add_ons || []), addonId];
  await updateSession(psid, { pending_add_ons: addOns } as any);

  await sendQuickReplies(psid, 'Added! Want more extras?', [
    { content_type: 'text', title: 'Done', payload: 'DONE_ADDONS' },
  ], pageToken);
}

async function finalizeCartItem(psid: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  if (!session.pending_item_id) return;

  const cartItem: MessengerCartItem = {
    menu_item_id: session.pending_item_id,
    variation_id: session.pending_variation_id || null,
    add_on_ids: session.pending_add_ons || [],
    quantity: 1,
  };

  const cart = [...(session.cart || [])];

  // Merge identical items
  const existingIdx = cart.findIndex(
    (c: MessengerCartItem) =>
      c.menu_item_id === cartItem.menu_item_id &&
      c.variation_id === cartItem.variation_id &&
      JSON.stringify([...c.add_on_ids].sort()) === JSON.stringify([...cartItem.add_on_ids].sort())
  );

  if (existingIdx >= 0) {
    cart[existingIdx].quantity += 1;
  } else {
    cart.push(cartItem);
  }

  await updateSession(psid, {
    cart,
    state: 'idle',
    pending_item_id: null,
    pending_variation_id: null,
    pending_add_ons: [],
  } as any);

  // Get item name for confirmation
  const { data: item } = await supabaseServer.from('menu_items').select('name').eq('id', session.pending_item_id).single();
  const itemName = item?.name || 'Item';
  const totalItems = cart.reduce((sum: number, c: MessengerCartItem) => sum + c.quantity, 0);

  await sendQuickReplies(psid, `${itemName} added! Cart: ${totalItems} item(s)`, [
    { content_type: 'text', title: 'Continue Shopping', payload: 'CONTINUE_SHOPPING' },
    { content_type: 'text', title: 'View Cart', payload: 'VIEW_CART' },
    { content_type: 'text', title: 'Checkout', payload: 'CHECKOUT' },
  ], pageToken);
}

async function showCart(psid: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  if (!session.cart || session.cart.length === 0) {
    await sendTextMessage(psid, 'Your cart is empty.', pageToken);
    await showCategories(psid, pageToken);
    return;
  }

  // Hydrate cart items for display
  const cartDisplay = [];
  for (const item of session.cart) {
    const { data: menuItem } = await supabaseServer
      .from('menu_items')
      .select('name, base_price')
      .eq('id', item.menu_item_id)
      .single();

    let variationName = null;
    let variationPrice = 0;
    if (item.variation_id) {
      const { data: variation } = await supabaseServer
        .from('variations')
        .select('name, price')
        .eq('id', item.variation_id)
        .single();
      variationName = variation?.name || null;
      variationPrice = variation?.price || 0;
    }

    const unitPrice = (menuItem?.base_price || 0) + variationPrice;
    cartDisplay.push({
      name: menuItem?.name || 'Unknown',
      variation: variationName,
      quantity: item.quantity,
      unitPrice,
    });
  }

  const summary = buildCartSummary(cartDisplay);
  await updateSession(psid, { state: 'viewing_cart' } as any);

  await sendButtonTemplate(psid, summary, [
    { type: 'postback', title: 'Checkout', payload: 'CHECKOUT' },
    { type: 'postback', title: 'Clear Cart', payload: 'CLEAR_CART' },
    { type: 'postback', title: 'Continue Shopping', payload: 'CONTINUE_SHOPPING' },
  ], pageToken);
}

async function handleCheckout(psid: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  if (!session.cart || session.cart.length === 0) {
    await sendTextMessage(psid, 'Your cart is empty!', pageToken);
    return;
  }

  // Check for multiple branches
  const { data: branches } = await supabaseServer
    .from('branches')
    .select('id, name')
    .eq('active', true);

  if (branches && branches.length > 1 && !session.selected_branch) {
    await updateSession(psid, { state: 'selecting_branch' } as any);
    const quickReplies: QuickReply[] = branches.map((b: any) => ({
      content_type: 'text' as const,
      title: b.name,
      payload: `SELECT_BRANCH_${b.id}`,
    }));
    await sendQuickReplies(psid, 'Which branch would you like to order from?', quickReplies, pageToken);
    return;
  }

  const branchId = session.selected_branch || (branches && branches.length === 1 ? branches[0].id : null);
  await createCheckoutSession(psid, session.cart, branchId, pageToken);
}

async function handleBranchSelected(psid: string, branchId: string, pageToken: string): Promise<void> {
  await updateSession(psid, { selected_branch: branchId } as any);
  const session = await getOrCreateSession(psid);
  await createCheckoutSession(psid, session.cart, branchId, pageToken);
}

async function createCheckoutSession(
  psid: string,
  cart: MessengerCartItem[],
  branchId: string | null,
  pageToken: string
): Promise<void> {
  // Hydrate cart for the checkout session (full objects, not just IDs)
  const hydratedCart = [];
  for (const item of cart) {
    const { data: menuItem } = await supabaseServer
      .from('menu_items')
      .select('*')
      .eq('id', item.menu_item_id)
      .single();

    if (!menuItem) continue;

    let selectedVariation = null;
    if (item.variation_id) {
      const { data: variation } = await supabaseServer
        .from('variations')
        .select('*')
        .eq('id', item.variation_id)
        .single();
      if (variation) {
        selectedVariation = { id: variation.id, name: variation.name, price: variation.price };
      }
    }

    let selectedAddOns: any[] = [];
    if (item.add_on_ids.length > 0) {
      const { data: addOns } = await supabaseServer
        .from('add_ons')
        .select('*')
        .in('id', item.add_on_ids);
      selectedAddOns = (addOns || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        price: a.price,
        category: a.category,
      }));
    }

    hydratedCart.push({
      id: menuItem.id,
      name: menuItem.name,
      description: menuItem.description,
      basePrice: menuItem.base_price,
      category: menuItem.category,
      image: menuItem.image_url,
      quantity: item.quantity,
      selectedVariation,
      selectedAddOns,
      menuItemId: menuItem.id,
    });
  }

  const hash = generateCheckoutHash();
  const expiresAt = getCheckoutExpiresAt();

  await supabaseServer.from('messenger_checkout_sessions').insert({
    hash,
    psid,
    cart: hydratedCart,
    branch_id: branchId,
    status: 'pending',
    expires_at: expiresAt,
  });

  // Reset branch selection for next conversation
  await updateSession(psid, { selected_branch: null } as any);

  const checkoutUrl = `${getSiteUrl()}/checkout?msession=${hash}`;

  await sendButtonTemplate(
    psid,
    'Ready to complete your order? Tap below to checkout.',
    [{ type: 'web_url', title: 'Complete Order', url: checkoutUrl }],
    pageToken
  );
}

async function handleRemoveItem(psid: string, index: number, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  const cart = [...(session.cart || [])];
  if (index >= 0 && index < cart.length) {
    cart.splice(index, 1);
    await updateSession(psid, { cart } as any);
    await sendTextMessage(psid, 'Item removed.', pageToken);
  }
  await showCart(psid, pageToken);
}

function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
