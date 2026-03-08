# PostHog Server-Side Order Event Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate PostHog server-side to capture a `starrs_order` event on every new order, enabling webhook-triggered email notifications via PostHog Actions.

**Architecture:** Server-side only using `posthog-node` with lazy initialization (matching the existing Supabase client pattern). The event is captured in `POST /api/orders` after the complete order is fetched, using non-blocking `capture()` + `shutdown()`.

**Tech Stack:** posthog-node, Next.js API Routes, TypeScript

---

### Task 1: Install posthog-node and add environment variables

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.local` (add 2 env vars)

**Step 1: Install posthog-node**

Run: `npm install posthog-node`
Expected: Package added to dependencies in package.json

**Step 2: Add environment variables to .env.local**

Append to `.env.local`:
```
# PostHog
POSTHOG_API_KEY=phc_8BCzInuzjgrDWySCNAU1D7DvlBWGAcfIgBgm0BQj8VO
POSTHOG_HOST=https://us.i.posthog.com
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add posthog-node dependency"
```

Note: Do NOT commit `.env.local` — it contains secrets.

---

### Task 2: Create PostHog server client utility

**Files:**
- Create: `src/lib/posthog.ts`

**Step 1: Create the PostHog server client**

Create `src/lib/posthog.ts` with lazy initialization (matching the pattern in `src/lib/supabase-server.ts`):

```typescript
import { PostHog } from 'posthog-node';

let _posthogClient: PostHog | null = null;

/**
 * Get the server-side PostHog client
 * Uses lazy initialization to prevent build failures when env vars aren't available
 */
function getPostHogClient(): PostHog {
  if (_posthogClient) {
    return _posthogClient;
  }

  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST;

  if (!apiKey) {
    throw new Error('Missing POSTHOG_API_KEY');
  }

  _posthogClient = new PostHog(apiKey, {
    host: host || 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  });

  return _posthogClient;
}

export const posthog = {
  /**
   * Capture a PostHog event. Non-blocking — fires and forgets.
   * Calls shutdown() after capture to ensure the event is flushed
   * before the serverless function terminates.
   */
  async capture(distinctId: string, event: string, properties?: Record<string, any>) {
    try {
      const client = getPostHogClient();
      client.capture({ distinctId, event, properties });
      await client.shutdown();
    } catch (error) {
      console.error('PostHog capture error:', error);
      // Non-blocking: don't throw, just log
    }
  }
};
```

**Step 2: Commit**

```bash
git add src/lib/posthog.ts
git commit -m "feat: add PostHog server client utility"
```

---

### Task 3: Capture starrs_order event in order creation API

**Files:**
- Modify: `app/api/orders/route.ts` (add import + capture call)

**Step 1: Add import at top of file**

Add after the existing imports (line 3) in `app/api/orders/route.ts`:

```typescript
import { posthog } from '../../../src/lib/posthog';
```

**Step 2: Add event capture after complete order is fetched**

In the `POST` handler, after the complete order is successfully fetched and formatted (after line 300, before the return on line 302), add:

```typescript
    // Capture PostHog event for order notification
    posthog.capture(
      `${formattedOrder.customer_name}_${formattedOrder.contact_number}`,
      'starrs_order',
      {
        order_number: formattedOrder.order_number,
        customer_name: formattedOrder.customer_name,
        contact_number: formattedOrder.contact_number,
        service_type: formattedOrder.service_type,
        address: formattedOrder.address || null,
        payment_method: formattedOrder.payment_method,
        total: formattedOrder.total,
        delivery_fee: formattedOrder.delivery_fee || null,
        notes: formattedOrder.notes || null,
        items: formattedOrder.order_items.map(item => ({
          name: item.menu_item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          variation: item.selected_variation?.name || null,
          add_ons: item.selected_add_ons?.map((a: any) => a.name) || null
        })),
        item_count: formattedOrder.order_items.reduce((sum, item) => sum + item.quantity, 0),
        created_at: formattedOrder.created_at
      }
    );
```

Note: `posthog.capture()` is fire-and-forget with internal error handling. It does NOT need to be awaited before returning the response — the `shutdown()` inside ensures flushing, but we don't block the HTTP response on it.

**Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 4: Commit**

```bash
git add app/api/orders/route.ts
git commit -m "feat: capture starrs_order PostHog event on new orders"
```

---

### Task 4: Verify end-to-end (manual)

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Place a test order through the UI**

Go to the app, add items to cart, complete checkout.

**Step 3: Check PostHog dashboard**

Go to PostHog -> Activity -> Live Events. Verify the `starrs_order` event appears with all order properties.

**Step 4: Set up PostHog Action for email webhook**

In PostHog dashboard:
1. Go to Data Management -> Actions
2. Create new action: match event name `starrs_order`
3. Under action settings, add a webhook destination
4. Configure the webhook URL to your email notification service (e.g., Zapier, Make.com, or a custom endpoint)

---

## Summary

| What | Where |
|------|-------|
| Dependency | `posthog-node` in package.json |
| Client utility | `src/lib/posthog.ts` |
| Event capture | `app/api/orders/route.ts` POST handler |
| Env vars | `POSTHOG_API_KEY`, `POSTHOG_HOST` in `.env.local` |
| Event name | `starrs_order` |
| Email trigger | PostHog Action + Webhook (configured in dashboard) |
