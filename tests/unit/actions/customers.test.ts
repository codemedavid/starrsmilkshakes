import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: vi.fn(),
  requireSuperAdmin: vi.fn(),
  getClientIPFromHeaders: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Build a chainable Supabase query mock that supports per-table overrides
function makeQueryChain(result: { data: any; error: any }) {
  const chain: any = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain);
  }
  // Awaiting the chain resolves to { data, error }
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

let defaultChain: ReturnType<typeof makeQueryChain>;
const tableChains: Record<string, ReturnType<typeof makeQueryChain>> = {};
const mockFrom = vi.fn((table: string) => tableChains[table] ?? defaultChain);

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'from') return mockFrom;
        return undefined;
      },
    },
  ),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { requireAdmin, requireSuperAdmin, getClientIPFromHeaders } from '@/lib/admin-guard';
import { revalidatePath } from 'next/cache';
import { linkCustomer, unlinkCustomer } from '@/actions/customers';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin);
const mockGetClientIP = vi.mocked(getClientIPFromHeaders);
const mockRevalidatePath = vi.mocked(revalidatePath);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_ORDER_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_CUSTOMER_ID = '660e8400-e29b-41d4-a716-446655440001';
const FAKE_ADMIN_ID = 'super-admin-uuid-001';
const FAKE_IP = '203.0.113.42';

// ─── Tests: linkCustomer ────────────────────────────────────────────────────

describe('linkCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ adminType: 'admin' });
    mockGetClientIP.mockResolvedValue(FAKE_IP);
    // Reset per-table overrides
    Object.keys(tableChains).forEach((k) => delete tableChains[k]);
    defaultChain = makeQueryChain({ data: { id: VALID_CUSTOMER_ID }, error: null });
  });

  it('creates an audit log entry on successful link', async () => {
    // customers.select -> customer found
    tableChains['customers'] = makeQueryChain({ data: { id: VALID_CUSTOMER_ID }, error: null });
    // orders.update -> success
    tableChains['orders'] = makeQueryChain({ data: null, error: null });
    // customer_link_audit.insert -> success
    const auditChain = makeQueryChain({ data: null, error: null });
    tableChains['customer_link_audit'] = auditChain;

    const result = await linkCustomer({
      order_id: VALID_ORDER_ID,
      customer_id: VALID_CUSTOMER_ID,
      reason: 'Phone match',
    });

    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('customer_link_audit');
    expect(auditChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: VALID_ORDER_ID,
        customer_id: VALID_CUSTOMER_ID,
        action: 'link',
        reason: 'Phone match',
        performed_by: 'admin',
        admin_type: 'admin',
        ip_address: FAKE_IP,
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/orders');
  });

  it('requires a valid reason', async () => {
    const result = await linkCustomer({
      order_id: VALID_ORDER_ID,
      customer_id: VALID_CUSTOMER_ID,
      reason: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input');
    expect(mockFrom).not.toHaveBeenCalledWith('orders');
  });

  it('rejects if customer does not exist', async () => {
    // customers.select -> not found
    tableChains['customers'] = makeQueryChain({ data: null, error: null });

    const result = await linkCustomer({
      order_id: VALID_ORDER_ID,
      customer_id: VALID_CUSTOMER_ID,
      reason: 'Phone match',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Customer not found');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('rejects completely invalid input', async () => {
    const result = await linkCustomer('not-an-object');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input');
  });

  it('returns error on DB failure when updating order', async () => {
    tableChains['customers'] = makeQueryChain({ data: { id: VALID_CUSTOMER_ID }, error: null });
    tableChains['orders'] = makeQueryChain({ data: null, error: { code: '23503', message: 'fk violation' } });

    const result = await linkCustomer({
      order_id: VALID_ORDER_ID,
      customer_id: VALID_CUSTOMER_ID,
      reason: 'Manual identification',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to link customer');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('resolves performer email for super admins', async () => {
    mockRequireAdmin.mockResolvedValue({ adminType: 'super_admin' });
    mockRequireSuperAdmin.mockResolvedValue({ adminId: FAKE_ADMIN_ID });

    tableChains['customers'] = makeQueryChain({ data: { id: VALID_CUSTOMER_ID }, error: null });
    tableChains['orders'] = makeQueryChain({ data: null, error: null });
    tableChains['super_admins'] = makeQueryChain({ data: { email: 'boss@starrs.com' }, error: null });
    const auditChain = makeQueryChain({ data: null, error: null });
    tableChains['customer_link_audit'] = auditChain;

    const result = await linkCustomer({
      order_id: VALID_ORDER_ID,
      customer_id: VALID_CUSTOMER_ID,
      reason: 'Phone match',
    });

    expect(result.success).toBe(true);
    expect(auditChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        performed_by: 'boss@starrs.com',
        admin_type: 'super_admin',
      }),
    );
  });

  it('throws (redirects) when auth fails', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

    await expect(
      linkCustomer({
        order_id: VALID_ORDER_ID,
        customer_id: VALID_CUSTOMER_ID,
        reason: 'Phone match',
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/admin/login');
  });
});

// ─── Tests: unlinkCustomer ──────────────────────────────────────────────────

describe('unlinkCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSuperAdmin.mockResolvedValue({ adminId: FAKE_ADMIN_ID });
    mockGetClientIP.mockResolvedValue(FAKE_IP);
    Object.keys(tableChains).forEach((k) => delete tableChains[k]);
    defaultChain = makeQueryChain({ data: null, error: null });
  });

  it('requires super admin — regular admin is rejected', async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error('Super admin access required'));

    await expect(
      unlinkCustomer({
        order_id: VALID_ORDER_ID,
        reason: 'Incorrect match',
      }),
    ).rejects.toThrow('Super admin access required');
  });

  it('creates an audit log with IP on successful unlink', async () => {
    // super_admins.select -> email
    tableChains['super_admins'] = makeQueryChain({ data: { email: 'boss@starrs.com' }, error: null });
    const auditChain = makeQueryChain({ data: null, error: null });
    tableChains['customer_link_audit'] = auditChain;

    // from('orders') is called twice: select (get customer_id), then update (set null)
    let fromOrdersCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        fromOrdersCallCount++;
        if (fromOrdersCallCount === 1) {
          return makeQueryChain({ data: { customer_id: VALID_CUSTOMER_ID }, error: null });
        }
        return makeQueryChain({ data: null, error: null });
      }
      return tableChains[table] ?? defaultChain;
    });

    const result = await unlinkCustomer({
      order_id: VALID_ORDER_ID,
      reason: 'Incorrect match',
    });

    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('customer_link_audit');
    expect(auditChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: VALID_ORDER_ID,
        customer_id: VALID_CUSTOMER_ID,
        action: 'unlink',
        reason: 'Incorrect match',
        performed_by: 'boss@starrs.com',
        admin_type: 'super_admin',
        ip_address: FAKE_IP,
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/orders');
  });

  it('requires a valid reason', async () => {
    const result = await unlinkCustomer({
      order_id: VALID_ORDER_ID,
      reason: 'Bad reason not in enum',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input');
  });

  it('returns error if order has no linked customer', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return makeQueryChain({ data: { customer_id: null }, error: null });
      }
      return tableChains[table] ?? defaultChain;
    });

    const result = await unlinkCustomer({
      order_id: VALID_ORDER_ID,
      reason: 'Customer request',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No linked customer');
  });

  it('returns error on DB failure when updating order', async () => {
    // First call: orders.select -> has customer
    // Second call: orders.update -> fails
    let orderCallCount = 0;
    const orderSelectChain = makeQueryChain({ data: { customer_id: VALID_CUSTOMER_ID }, error: null });
    const orderUpdateChain = makeQueryChain({ data: null, error: { code: '42P01', message: 'relation' } });

    tableChains['orders'] = new Proxy({} as any, {
      get(_, prop) {
        if (prop === 'then') {
          // Should not be directly awaited
          return undefined;
        }
        if (prop === 'select') {
          orderCallCount++;
          return orderSelectChain.select;
        }
        if (prop === 'update') {
          return orderUpdateChain.update;
        }
        // For chaining: delegate to the appropriate chain
        return orderCallCount <= 1 ? (orderSelectChain as any)[prop] : (orderUpdateChain as any)[prop];
      },
    });

    // Use mockFrom to return different chains per call
    let fromOrdersCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        fromOrdersCallCount++;
        if (fromOrdersCallCount === 1) return orderSelectChain;
        return orderUpdateChain;
      }
      return tableChains[table] ?? defaultChain;
    });

    tableChains['super_admins'] = makeQueryChain({ data: { email: 'boss@starrs.com' }, error: null });

    const result = await unlinkCustomer({
      order_id: VALID_ORDER_ID,
      reason: 'Incorrect match',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to unlink');
  });

  it('falls back to adminId when super admin email not found', async () => {
    tableChains['super_admins'] = makeQueryChain({ data: null, error: null });
    const auditChain = makeQueryChain({ data: null, error: null });
    tableChains['customer_link_audit'] = auditChain;

    // from('orders') is called twice: select then update
    let fromOrdersCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        fromOrdersCallCount++;
        if (fromOrdersCallCount === 1) {
          return makeQueryChain({ data: { customer_id: VALID_CUSTOMER_ID }, error: null });
        }
        return makeQueryChain({ data: null, error: null });
      }
      return tableChains[table] ?? defaultChain;
    });

    const result = await unlinkCustomer({
      order_id: VALID_ORDER_ID,
      reason: 'Duplicate resolution',
    });

    expect(result.success).toBe(true);
    expect(auditChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        performed_by: FAKE_ADMIN_ID,
      }),
    );
  });
});
