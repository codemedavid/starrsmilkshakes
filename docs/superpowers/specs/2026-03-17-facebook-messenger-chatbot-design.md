# Facebook Messenger Chatbot Integration — Design Spec

**Date:** 2026-03-17
**Status:** Approved
**Approach:** Direct Facebook Messenger Platform API (no third-party chatbot platforms)

## Overview

Integrate Facebook Messenger with Starr's Famous Shakes so customers can browse products, add to cart, and check out — all starting from a Facebook Page message. Orders placed via Messenger get live status updates back in Messenger.

## Key Decisions

- **Conversation style:** Structured button-based flow (no NLU). Future update will add RAG-based AI.
- **Product visibility:** Admin-configurable "Show in Messenger" toggle per menu item.
- **Page connection:** Single global Facebook Page (not per-branch).
- **Cart + Checkout:** Customers can add items to a Messenger cart. Checkout redirects to the website via a secure hashed session. After order placement, a receipt is posted back to Messenger.
- **Status updates:** Automatic Messenger notifications on order status changes. Admin can toggle off per order.
- **Access control:** New Super Admin role required for connecting/disconnecting the Facebook Page. Regular admins cannot modify Facebook integration.

---

## Section 1: Authentication & Page Connection

### Super Admin Role

- New `super_admins` Supabase table: `id`, `email`, `password_hash`, `created_at`.
- Password hashed with bcrypt.
- Separate login endpoint: `POST /api/admin/auth/super-login`.
- Session cookie: `super-admin-session` (separate from regular admin cookie).
- Super Admin inherits all regular admin capabilities plus Facebook connection controls.

### Super Admin Account Provisioning

- First super admin account is created via a seed migration script (`supabase/seed-super-admin.sql`).
- The script inserts a bcrypt-hashed password from the `SUPER_ADMIN_PASSWORD` environment variable.
- Alternatively, a CLI script (`scripts/create-super-admin.ts`) can be run locally: `npx ts-node scripts/create-super-admin.ts --email admin@example.com --password <password>`.
- No self-registration — super admin accounts are created manually by someone with database access.

### Facebook Page Connection Flow

1. Super Admin navigates to **Site Settings > Facebook Integration**.
2. Clicks "Connect Facebook Page" — triggers Facebook Login via Facebook JS SDK.
3. OAuth scopes: `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`.
4. Server exchanges short-lived user token for a **long-lived Page Access Token** via Graph API.
5. Page token + Page ID stored in a dedicated `facebook_config` table (super-admin-only RLS policy, separate from `site_settings` to prevent regular admin access).
6. Server subscribes the Page to the webhook via the Subscriptions API.
7. UI shows connected Page name with a "Disconnect" button.

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/auth/super-login` | POST | Super Admin authentication |
| `/api/admin/facebook/connect` | POST | Exchange token, store Page token, subscribe webhook |
| `/api/admin/facebook/disconnect` | POST | Unsubscribe webhook, remove stored tokens |
| `/api/admin/facebook/status` | GET | Check if a Page is connected |

---

## Section 2: Messenger Webhook & Conversation Flow

### Webhook Endpoints

- `GET /api/messenger/webhook` — Verification endpoint. Must validate `hub.verify_token` query param against `FACEBOOK_VERIFY_TOKEN` env var before returning `hub.challenge`. Reject if token does not match.
- `POST /api/messenger/webhook` — Receives incoming messages, postbacks, and events. Must be explicitly excluded from any same-origin/CSRF middleware since requests come from Facebook's servers.
- All POST requests verified via `X-Hub-Signature-256` header using App Secret HMAC-SHA256 signature.

### Conversation State

`messenger_sessions` Supabase table:

| Field | Type | Purpose |
|-------|------|---------|
| `psid` | string (PK) | Facebook Page-Scoped User ID |
| `state` | enum | `idle`, `browsing_categories`, `browsing_products`, `viewing_cart` |
| `current_category` | string (nullable) | Selected category ID |
| `selected_branch` | string (nullable) | Selected branch ID (for checkout) |
| `current_page` | integer (default: 0) | Pagination offset within current category (for 10-card limit) |
| `cart` | jsonb | Array of `{ menu_item_id, variation_id, add_on_ids[], quantity }` |
| `updated_at` | timestamp | For session expiry (24 hours) |

### Conversation Flow

```
Customer: "Hi" / any message
Bot: Welcome message + category quick reply buttons
     "Welcome to Starr's Famous Shakes! What are you craving?"
     [Dim Sum] [Coffee] [Desserts] [More...]

Customer: taps [Coffee]
Bot: Generic template with horizontal product cards
     Each card: image, name, price, [Add to Cart] [View Details] buttons
     (Only items with show_in_messenger = true AND available = true)

Customer: taps [Add to Cart] on "Iced Latte"
Bot: If item has variations -> quick replies for variation selection
     After variation (or if none) -> if item has add-ons -> quick replies for add-on selection
       "Any extras? Tap to add, or skip."
       [Extra Shot +20] [Whipped Cream +15] [Skip]
     If no add-ons -> added directly
     "Iced Latte (Large, Extra Shot) added! Cart: 1 item"
     [Continue Shopping] [View Cart] [Checkout]

Customer: taps [View Cart]
Bot: Text summary of cart items with prices + total
     [Remove Item] [Clear Cart] [Checkout] [Continue Shopping]

Customer: taps [Checkout]
Bot: If multiple branches exist -> quick replies for branch selection
     "Which branch would you like to order from?"
     [Main Branch] [Branch 2] ...
     If single branch -> skip, auto-assign
Bot: Generates secure hash, sends button template:
     "Ready to complete your order? Tap below to checkout."
     [Complete Order on Website] (URL button with hash parameter)
```

**Note:** Payment method, service type (dine-in/pickup/delivery), and customer details (name, contact, address) are all collected on the website checkout page, not in Messenger. Messenger handles only product browsing, cart management, and branch selection.

### Message Templates Used

- **Quick Replies** — Category selection, variation selection.
- **Generic Template** — Product cards (max 10 per message, paginated with "More" button).
- **Button Template** — Cart actions, checkout link.
- **Receipt Template** — Order confirmation postback.

---

## Section 3: Secure Hash Session Linking (Messenger <-> Website)

### Purpose

When a customer taps "Checkout" in Messenger, they get a URL to the website with their cart pre-loaded — without exposing their Messenger ID or allowing session forgery.

### `messenger_checkout_sessions` Supabase Table

| Field | Type | Purpose |
|-------|------|---------|
| `id` | uuid (PK) | Auto-generated |
| `hash` | string (unique, indexed) | HMAC-SHA256 hash used as URL parameter |
| `psid` | string | Messenger Page-Scoped User ID |
| `cart` | jsonb | Fully hydrated cart snapshot (full item/variation/add-on objects, not just IDs) |
| `status` | enum | `pending`, `completed`, `expired` |
| `created_at` | timestamp | For expiry calculation |
| `expires_at` | timestamp | 30 minutes after creation |
| `order_id` | string (nullable) | Linked after order is placed |

### Flow

1. **Customer taps "Checkout" in Messenger:**
   - Server generates random UUID + timestamp, hashes with HMAC-SHA256 using a secret key.
   - Hydrates the cart: joins `menu_items`, `variations`, and `add_ons` tables to build a full `CartItem[]`-compatible structure from the ID-only Messenger session cart.
   - Creates row in `messenger_checkout_sessions` with the hydrated cart snapshot.
   - Returns URL: `https://yoursite.com/checkout?msession={hash}`

2. **Customer lands on website checkout:**
   - Website detects `msession` query param.
   - **Important:** Suppress the existing empty-cart redirect when `msession` is present — the cart is initially empty in React context and must be hydrated from the API before the redirect logic runs.
   - Calls `GET /api/messenger/session/{hash}` to validate.
   - If valid and not expired: pre-loads hydrated cart items into CartContext and the checkout page.
   - If expired/invalid: shows "Session expired, please start again in Messenger."

3. **Customer completes order on website:**
   - `POST /api/orders` checks for `msession` param.
   - If present: atomically marks session as `completed` using `UPDATE messenger_checkout_sessions SET status = 'completed', order_id = $1 WHERE hash = $2 AND status = 'pending' RETURNING *` — only proceeds if exactly one row is affected (prevents double-submit race condition).
   - Creates `messenger_order_links` row to enable status notifications.
   - Triggers postback to Messenger via Send API with receipt.

### Security

- HMAC-SHA256 hash (not guessable, not reversible).
- 30-minute TTL.
- One-time use (once `completed`, the hash cannot be reused).
- PSID never exposed to the client.
- Cleanup: expired sessions purged after 24 hours via a Supabase pg_cron job (or a Next.js cron API route triggered by Vercel Cron / external scheduler). Same cleanup mechanism for expired `messenger_sessions`.

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/messenger/checkout-session` | POST | Creates session, returns hashed URL (internal) |
| `/api/messenger/session/[hash]` | GET | Validates hash, returns cart data (called by website) |

---

## Section 4: Order Status Updates via Messenger

### `messenger_order_links` Supabase Table

| Field | Type | Purpose |
|-------|------|---------|
| `id` | uuid (PK) | Auto-generated |
| `order_id` | string (unique) | References `orders` table |
| `psid` | string | Customer's Messenger ID |
| `notify_enabled` | boolean (default: true) | Admin can toggle off per order |
| `created_at` | timestamp | Record creation |

Created automatically when an order is placed via a Messenger checkout session.

### Status Update Messages

| Status | Message |
|--------|---------|
| `confirmed` | "Your order #{number} has been confirmed! We're getting it ready." |
| `preparing` | "Your order #{number} is now being prepared." |
| `ready` | "Your order #{number} is ready! {pickup/delivery-specific message}" |
| `out_for_delivery` | "Your order #{number} is out for delivery! Track it here: {tracking_url}" |
| `completed` | "Your order #{number} is complete. Thank you for ordering with Starr's Famous Shakes!" |
| `cancelled` | "Your order #{number} has been cancelled. Please contact us if you have questions." |

### Integration Point

The existing `PATCH /api/orders/[id]` endpoint is extended:

1. Update order status in database (existing).
2. Trigger Lalamove order if confirmed (existing).
3. **NEW:** Check `messenger_order_links` for this order.
4. If found and `notify_enabled` is true: call Send API with status message.

### Admin Panel Changes

- **Order Manager:** Orders from Messenger get a Messenger icon badge.
- **Per-order toggle:** "Messenger Notifications" switch (on by default).

### Edge Cases

- Customer blocks the bot: Send API returns error, log it, do not retry.
- Order placed on website without Messenger: no `messenger_order_links` row, no notification.
- Admin toggles off notifications mid-order: next status change skips Messenger.
- Facebook API rate limit hit (200 calls/user/hour): log and queue for retry with exponential backoff.
- Page token invalidated/expired: log error, show warning in admin panel, skip notification gracefully.

---

## Section 5: Menu Item "Show in Messenger" Toggle & Admin UI

### Database Change

Add column to `menu_items` table:
- `show_in_messenger` — boolean, default `false`.

### Admin Panel Changes

**Menu Manager:**
- "Show in Messenger" toggle in the item edit form.
- Bulk action: "Enable/Disable Messenger" for selected items.

**Site Settings > Facebook Integration** (new section):
- Connection status: "Connected to: {Page Name}" or "Not connected."
- "Connect Facebook Page" / "Disconnect" button (Super Admin only).
- Webhook status indicator (active/inactive).

**Super Admin UI:**
- Regular admin sees all existing tabs.
- Super Admin sees an additional indicator and access to Facebook connection controls.
- Login page gets a "Super Admin Login" link below the regular admin password field.

### API Changes

- `POST/PATCH /api/admin/menu` — Accept `show_in_messenger` field.
- `GET /api/admin/menu` — Return `show_in_messenger` in response.
- Messenger webhook queries: `WHERE show_in_messenger = true AND available = true`.

### Type Change

```typescript
// Add to MenuItem type
show_in_messenger?: boolean;
```

---

## Section 6: Receipt Postback

After order is placed on the website via Messenger checkout session:

1. `POST /api/orders` completes with `order_id`.
2. If `msession` param present: mark checkout session as `completed`.
3. Server sends **Receipt Template** to customer's PSID:
   - Recipient name, order number.
   - Each item: name, quantity, price, variation info.
   - Summary: subtotal, delivery fee (if any), total.
   - Payment method, service type, branch name.
4. Website confirmation page shows a "Return to Messenger" deep link: `https://m.me/{PAGE_ID}`.

---

## New Files

| File | Purpose |
|------|---------|
| `app/api/messenger/webhook/route.ts` | Webhook verification + message handling |
| `app/api/messenger/session/[hash]/route.ts` | Validate checkout session hash |
| `src/lib/messenger.ts` | Send API helpers, template builders, cart logic |
| `src/lib/messenger-auth.ts` | Token exchange, Page subscription |
| `app/api/admin/facebook/connect/route.ts` | OAuth token exchange + webhook subscribe |
| `app/api/admin/facebook/disconnect/route.ts` | Unsubscribe + remove tokens |
| `app/api/admin/facebook/status/route.ts` | Connection status check |
| `app/api/admin/auth/super-login/route.ts` | Super Admin login |
| `src/components/FacebookConnect.tsx` | Facebook Login button + connection UI |
| `src/components/SuperAdminLogin.tsx` | Super Admin login form |
| `supabase/migrations/XXXX_messenger_integration.sql` | All new tables + column additions |

---

## New Supabase Tables

1. `super_admins` — Super Admin credentials.
2. `facebook_config` — Facebook credentials with super-admin-only RLS (Page token, App ID, Page ID).
3. `messenger_sessions` — Conversation state per Messenger user.
4. `messenger_checkout_sessions` — Secure hash linking Messenger cart to website checkout.
5. `messenger_order_links` — Links orders to Messenger PSIDs for status notifications.

## Modified Tables

- `menu_items` — Add `show_in_messenger` boolean column.
- `site_settings` — Store non-sensitive Facebook config (Page name, connection status display only).

## New Table: `facebook_config`

Dedicated table for Facebook credentials with super-admin-only RLS policy:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | uuid (PK) | Auto-generated |
| `page_id` | string | Connected Facebook Page ID |
| `page_name` | string | Page display name |
| `page_access_token` | string | Long-lived Page Access Token |
| `app_id` | string | Facebook App ID |
| `connected_at` | timestamp | When the Page was connected |
| `connected_by` | uuid | Super Admin who connected it |

RLS policy: only accessible by super admin role. Regular admin endpoints cannot read this table.

### Token Refresh Strategy

Long-lived Page tokens obtained via user tokens expire in ~60 days. The system should:
- Store token expiry date alongside the token.
- Show a warning in the admin panel when the token is within 7 days of expiry.
- Super Admin must re-authenticate via Facebook Login to refresh the token.
- Future: consider using a System User for permanent tokens.

---

## Environment Variables

```
# New (add to .env.local)
FACEBOOK_APP_ID=<your_app_id>
FACEBOOK_APP_SECRET=<app_secret>
FACEBOOK_VERIFY_TOKEN=<random_string_for_webhook_verification>
MESSENGER_SESSION_SECRET=<random_string_for_HMAC_hashing>
```

---

## Future: RAG-Based AI

The architecture is RAG-friendly:
- `messenger_sessions` stores full conversation state — extend with message history logs.
- Cart structure is normalized — product data is clean for embeddings.
- Webhook handler can be extended with an AI routing layer between message parsing and response generation.
- Menu data in Supabase is already structured for retrieval.
