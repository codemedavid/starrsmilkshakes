const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// --- Types ---

export interface QuickReply {
  content_type: 'text';
  title: string;
  payload: string;
}

export interface GenericElement {
  title: string;
  subtitle?: string;
  image_url?: string;
  buttons?: Button[];
}

export interface Button {
  type: 'postback' | 'web_url';
  title: string;
  payload?: string;
  url?: string;
  webview_height_ratio?: 'compact' | 'tall' | 'full';
}

// --- Typing Indicator ---

export async function sendTypingOn(psid: string, pageToken: string): Promise<void> {
  await fetch(`${GRAPH_API_BASE}/me/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pageToken}`,
    },
    body: JSON.stringify({
      recipient: { id: psid },
      sender_action: 'typing_on',
    }),
  });
}

// --- Send API Calls ---

export async function sendTextMessage(
  psid: string,
  text: string,
  pageToken: string,
  messagingType: string = 'RESPONSE',
  tag?: string
): Promise<void> {
  await callSendAPI(psid, { text }, pageToken, messagingType, tag);
}

export async function sendQuickReplies(
  psid: string,
  text: string,
  quickReplies: QuickReply[],
  pageToken: string
): Promise<void> {
  await callSendAPI(psid, { text, quick_replies: quickReplies }, pageToken);
}

export async function sendGenericTemplate(
  psid: string,
  elements: GenericElement[],
  pageToken: string
): Promise<void> {
  await callSendAPI(psid, {
    attachment: {
      type: 'template',
      payload: { template_type: 'generic', elements },
    },
  }, pageToken);
}

export async function sendButtonTemplate(
  psid: string,
  text: string,
  buttons: Button[],
  pageToken: string
): Promise<void> {
  await callSendAPI(psid, {
    attachment: {
      type: 'template',
      payload: { template_type: 'button', text, buttons },
    },
  }, pageToken);
}

async function callSendAPI(
  psid: string,
  message: Record<string, unknown>,
  pageToken: string,
  messagingType: string = 'RESPONSE',
  tag?: string
): Promise<void> {
  const body: Record<string, unknown> = {
    recipient: { id: psid },
    messaging_type: messagingType,
    message,
  };
  if (tag) body.tag = tag;

  const response = await fetch(`${GRAPH_API_BASE}/me/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pageToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('Send API error:', error);
  }
}

// --- Template Builders ---

export function buildCategoryQuickReplies(
  categories: Array<{ id: string; name: string; icon: string }>
): QuickReply[] {
  return categories.map((cat) => ({
    content_type: 'text' as const,
    title: `${cat.icon} ${cat.name}`,
    payload: `CATEGORY_${cat.id}`,
  }));
}

export function buildProductCards(
  items: Array<{
    id: string;
    name: string;
    description?: string;
    basePrice: number;
    image?: string;
    discountPrice?: number;
    discountActive?: boolean;
  }>,
  siteUrl: string
): GenericElement[] {
  return items.map((item) => {
    const priceText = item.discountActive && item.discountPrice
      ? `₱${item.discountPrice} (was ₱${item.basePrice})`
      : `₱${item.basePrice}`;

    return {
      title: item.name,
      subtitle: `${priceText}\n${(item.description || '').slice(0, 60)}`,
      image_url: item.image || undefined,
      buttons: [
        { type: 'postback' as const, title: 'Add to Cart', payload: `ADD_TO_CART_${item.id}` },
        { type: 'web_url' as const, title: 'View Details', url: `${siteUrl}/product/${item.id}` },
      ],
    };
  });
}

export function buildCartSummary(
  cart: Array<{ name: string; variation: string | null; quantity: number; unitPrice: number; addOns?: string[] }>
): string {
  if (cart.length === 0) return 'Your cart is empty.';

  let total = 0;
  const lines = cart.map((item, i) => {
    const itemTotal = item.unitPrice * item.quantity;
    total += itemTotal;
    const variationStr = item.variation ? ` (${item.variation})` : '';
    const addOnStr = item.addOns && item.addOns.length > 0 ? ` + ${item.addOns.join(', ')}` : '';
    return `${i + 1}. ${item.name}${variationStr}${addOnStr} x${item.quantity} — ₱${itemTotal}`;
  });

  lines.push(`\nTotal: ₱${total}`);
  return lines.join('\n');
}

export async function getUserProfile(
  psid: string,
  pageToken: string
): Promise<{ name: string | null }> {
  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/${psid}?fields=name&access_token=${pageToken}`
    );
    if (!response.ok) return { name: null };
    const data = await response.json();
    return { name: data.name || null };
  } catch {
    return { name: null };
  }
}

export function buildStatusMessage(
  orderNumber: string,
  status: string,
  serviceType?: string,
  trackingUrl?: string
): string {
  const messages: Record<string, string> = {
    confirmed: `Your order #${orderNumber} has been confirmed! We're getting it ready.`,
    preparing: `Your order #${orderNumber} is now being prepared.`,
    ready: `Your order #${orderNumber} is ready! ${serviceType === 'delivery' ? 'Your rider is on the way.' : 'Please proceed to pick it up.'}`,
    out_for_delivery: `Your order #${orderNumber} is out for delivery!${trackingUrl ? ` Track it here: ${trackingUrl}` : ''}`,
    completed: `Your order #${orderNumber} is complete. Thank you for ordering with Starr's Famous Shakes!`,
    cancelled: `Your order #${orderNumber} has been cancelled. Please contact us if you have questions.`,
  };
  return messages[status] || `Your order #${orderNumber} status has been updated to: ${status}`;
}

export async function setupMessengerProfile(pageToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Set persistent menu
    const menuResponse = await fetch(`${GRAPH_API_BASE}/me/messenger_profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pageToken}`,
      },
      body: JSON.stringify({
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: [
              { type: 'web_url', title: 'Order Online', url: 'https://starrsmilkshake.com' },
              { type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' },
              { type: 'postback', title: 'My Loyalty Card', payload: 'LOYALTY_CARD' },
            ],
          },
        ],
      }),
    });

    if (!menuResponse.ok) {
      const error = await menuResponse.json().catch(() => ({}));
      return { success: false, error: `Persistent menu failed: ${JSON.stringify(error)}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
