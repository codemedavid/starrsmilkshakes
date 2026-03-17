// src/lib/messenger-auth.ts
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface PageInfo {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  tokenExpiresAt: string | null;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Facebook app credentials not configured');

  const url = `${GRAPH_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.access_token;
}

export async function getPageAccessToken(userAccessToken: string): Promise<PageInfo[]> {
  const url = `${GRAPH_API_BASE}/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to get pages: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return (data.data || []).map((page: any) => ({
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    tokenExpiresAt: null,
  }));
}

export async function subscribePageToWebhook(pageId: string, pageAccessToken: string): Promise<void> {
  const url = `${GRAPH_API_BASE}/${pageId}/subscribed_apps`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: pageAccessToken,
      subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_optins'],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Webhook subscription failed: ${JSON.stringify(err)}`);
  }
}

export async function unsubscribePageFromWebhook(pageId: string, pageAccessToken: string): Promise<void> {
  const url = `${GRAPH_API_BASE}/${pageId}/subscribed_apps`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: pageAccessToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Webhook unsubscription failed:', err);
  }
}
