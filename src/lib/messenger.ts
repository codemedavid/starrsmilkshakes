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

// --- Send API Calls ---

export async function sendTextMessage(psid: string, text: string, pageToken: string): Promise<void> {
  await callSendAPI(psid, { text }, pageToken);
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

async function callSendAPI(psid: string, message: Record<string, unknown>, pageToken: string): Promise<void> {
  const response = await fetch(`${GRAPH_API_BASE}/me/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pageToken}`,
    },
    body: JSON.stringify({
      recipient: { id: psid },
      messaging_type: 'RESPONSE',
      message,
    }),
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
  cart: Array<{ name: string; variation: string | null; quantity: number; unitPrice: number }>
): string {
  if (cart.length === 0) return 'Your cart is empty.';

  let total = 0;
  const lines = cart.map((item, i) => {
    const itemTotal = item.unitPrice * item.quantity;
    total += itemTotal;
    const variationStr = item.variation ? ` (${item.variation})` : '';
    return `${i + 1}. ${item.name}${variationStr} x${item.quantity} — ₱${itemTotal}`;
  });

  lines.push(`\nTotal: ₱${total}`);
  return lines.join('\n');
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
