// tests/api-customers.test.ts
import { describe, it, expect, afterAll } from 'vitest';

const BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const ADMIN_COOKIE = process.env.TEST_ADMIN_COOKIE || '';

async function adminFetch(path: string, options: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: ADMIN_COOKIE,
      ...(options.headers || {}),
    },
  });
}

let createdCustomerId: string | null = null;

afterAll(async () => {
  if (createdCustomerId) {
    await adminFetch(`/api/admin/customers/${createdCustomerId}`, { method: 'DELETE' });
  }
});

describe('GET /api/admin/customers', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/customers`);
    expect(res.status).toBe(401);
  });

  it('returns customer list with pagination', async () => {
    const res = await adminFetch('/api/admin/customers');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('customers');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.customers)).toBe(true);
  });

  it('returns auto_tags on each customer', async () => {
    const res = await adminFetch('/api/admin/customers');
    const data = await res.json();
    if (data.customers.length > 0) {
      expect(data.customers[0]).toHaveProperty('auto_tags');
      expect(Array.isArray(data.customers[0].auto_tags)).toBe(true);
    }
  });
});

describe('POST /api/admin/customers', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/customers`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('creates a customer with name only', async () => {
    const res = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Customer CI' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.customer.name).toBe('Test Customer CI');
    expect(data.customer.source).toBe('manual');
    createdCustomerId = data.customer.id;
  });

  it('rejects missing name', async () => {
    const res = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ email: 'no-name@test.com' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate phone', async () => {
    const phone = '09990000001';
    await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup A', phone }),
    });
    const res = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup B', phone }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(phone);
  });
});

describe('GET /api/admin/customers/[id]', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/customers/nonexistent-id`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown id', async () => {
    const res = await adminFetch('/api/admin/customers/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns full profile with auto_tags and recent_orders', async () => {
    if (!createdCustomerId) return;
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer).toHaveProperty('auto_tags');
    expect(data.customer).toHaveProperty('manual_tags');
    expect(data.customer).toHaveProperty('recent_orders');
  });
});

describe('PATCH /api/admin/customers/[id]', () => {
  it('updates name', async () => {
    if (!createdCustomerId) return;
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name CI' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer.name).toBe('Updated Name CI');
  });

  it('returns 409 on duplicate phone', async () => {
    if (!createdCustomerId) return;
    const other = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Other CI', phone: '09880000001' }),
    });
    const phone = '09880000001';
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ phone }),
    });
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain(phone);
  });
});

describe('DELETE /api/admin/customers/[id]', () => {
  it('deletes customer and returns 200', async () => {
    const createRes = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'To Delete CI' }),
    });
    const { customer } = await createRes.json();
    const res = await adminFetch(`/api/admin/customers/${customer.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for already-deleted customer', async () => {
    const res = await adminFetch('/api/admin/customers/00000000-0000-0000-0000-000000000000', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/customers/[id]/tags', () => {
  it('adds a manual tag', async () => {
    if (!createdCustomerId) return;
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: 'Birthday Girl' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.tag.tag).toBe('Birthday Girl');
    expect(data.tag.tag_type).toBe('manual');
  });

  it('returns 409 on duplicate tag', async () => {
    if (!createdCustomerId) return;
    await adminFetch(`/api/admin/customers/${createdCustomerId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: 'DupTag' }),
    });
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: 'DupTag' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/admin/customers/[id]/tags/[tagId]', () => {
  it('removes a manual tag and returns 200', async () => {
    if (!createdCustomerId) return;
    const addRes = await adminFetch(`/api/admin/customers/${createdCustomerId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: 'ToRemove' }),
    });
    const { tag } = await addRes.json();
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}/tags/${tag.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when tagId does not exist', async () => {
    if (!createdCustomerId) return;
    const res = await adminFetch(
      `/api/admin/customers/${createdCustomerId}/tags/00000000-0000-0000-0000-000000000000`,
      { method: 'DELETE' }
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/customers/suggest', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/customers/suggest?phone=09171234567`);
    expect(res.status).toBe(401);
  });

  it('returns null for no match', async () => {
    const res = await adminFetch('/api/admin/customers/suggest?phone=00000000000');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer).toBeNull();
  });

  it('returns null when phone param is absent', async () => {
    const res = await adminFetch('/api/admin/customers/suggest');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer).toBeNull();
  });

  it('matches by normalized phone', async () => {
    await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Suggest Test', phone: '09770000001' }),
    });
    const res = await adminFetch('/api/admin/customers/suggest?phone=0977-000-0001');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer).not.toBeNull();
    expect(data.customer.name).toBe('Suggest Test');
  });
});

describe('Order linking via PATCH /api/orders/[id]', () => {
  it('rejects invalid UUID format for customer_id', async () => {
    const ordersRes = await adminFetch('/api/orders?limit=1');
    const { orders } = await ordersRes.json();
    if (!orders?.length) return;
    const res = await adminFetch(`/api/orders/${orders[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ customer_id: 'not-a-uuid' }),
    });
    expect(res.status).toBe(422);
  });

  it('accepts customer_id: null to unlink (always returns 200 — idempotent)', async () => {
    const ordersRes = await adminFetch('/api/orders?limit=1');
    const { orders } = await ordersRes.json();
    if (!orders?.length) return;
    const res = await adminFetch(`/api/orders/${orders[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ customer_id: null }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.customer_id).toBeNull();
  });
});

describe('Public POST /api/orders ignores customer_id', () => {
  it('does not set customer_id even if sent in body', async () => {
    const body = {
      items: [{ id: 'test', name: 'Test Item', basePrice: 100, quantity: 1, totalPrice: 100 }],
      customerName: 'Security Test',
      contactNumber: '09123456789',
      serviceType: 'pickup',
      paymentMethod: 'gcash',
      total: 100,
      customer_id: '00000000-0000-0000-0000-000000000000',
    };
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).not.toBe(500);
    if (res.status === 201) {
      const data = await res.json();
      expect(data.order?.customer_id ?? null).toBeNull();
    }
  });
});
