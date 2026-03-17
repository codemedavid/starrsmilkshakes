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

### Facebook Page Connection Flow

1. Super Admin navigates to **Site Settings > Facebook Integration**.
2. Clicks "Connect Facebook Page" — triggers Facebook Login via Facebook JS SDK.
3. OAuth scopes: `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`.
4. Server exchanges short-lived user token for a **long-lived Page Access Token** via Graph API.
5. Page token + Page ID stored in `site_settings` table.
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

- `GET /api/messenger/webhook` — Verification (Facebook sends a challenge token during setup).
- `POST /api/messenger/webhook` — Receives incoming messages, postbacks, and events.
- Request verification via App Secret HMAC-SHA256 signature.

### Conversation State

`messenger_sessions` Supabase table:

| Field | Type | Purpose |
|-------|------|---------|
| `psid` | string (PK) | Facebook Page-Scoped User ID |
| `state` | enum | `idle`, `browsing_categories`, `browsing_products`, `viewing_cart` |
| `current_category` | string (nullable) | Selected category ID |
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
     If no variations -> added directly
     "Iced Latte added! Cart: 1 item"
     [Continue Shopping] [View Cart] [Checkout]

Customer: taps [View Cart]
Bot: Text summary of cart items with prices + total
     [Remove Item] [Clear Cart] [Checkout] [Continue Shopping]

Customer: taps [Checkout]
Bot: Generates secure hash, sends button template:
     "Ready to complete your order? Tap below to checkout."
     [Complete Order on Website] (URL button with hash parameter)
```

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
| `cart` | jsonb | Snapshot of the Messenger cart at checkout time |
| `status` | enum | `pending`, `completed`, `expired` |
| `created_at` | timestamp | For expiry calculation |
| `expires_at` | timestamp | 30 minutes after creation |
| `order_id` | string (nullable) | Linked after order is placed |

### Flow

1. **Customer taps "Checkout" in Messenger:**
   - Server generates random UUID + timestamp, hashes with HMAC-SHA256 using a secret key.
   - Creates row in `messenger_checkout_sessions` with cart snapshot.
   - Returns URL: `https://yoursite.com/checkout?msession={hash}`

2. **Customer lands on website checkout:**
   - Website detects `msession` query param.
   - Calls `GET /api/messenger/session/{hash}` to validate.
   - If valid and not expired: pre-loads cart items into the checkout page.
   - If expired/invalid: shows "Session expired, please start again in Messenger."

3. **Customer completes order on website:**
   - `POST /api/orders` checks for `msession` param.
   - If present: marks session as `completed`, stores `order_id`, links to `psid`.
   - Triggers postback to Messenger via Send API with receipt.

### Security

- HMAC-SHA256 hash (not guessable, not reversible).
- 30-minute TTL.
- One-time use (once `completed`, the hash cannot be reused).
- PSID never exposed to the client.
- Cleanup: expired sessions purged after 24 hours.

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
2. `messenger_sessions` — Conversation state per Messenger user.
3. `messenger_checkout_sessions` — Secure hash linking Messenger cart to website checkout.
4. `messenger_order_links` — Links orders to Messenger PSIDs for status notifications.

## Modified Tables

- `menu_items` — Add `show_in_messenger` boolean column.
- `site_settings` — Store Facebook Page token, Page ID, App ID, App Secret.

---

## Environment Variables

```
# New (add to .env.local)
FACEBOOK_APP_ID=1477113107453692
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
