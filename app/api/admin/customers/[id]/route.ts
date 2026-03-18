import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import { normalizePhone, normalizeEmail, computeAutoTags } from '@/lib/customer-utils';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    const { data: customer, error } = await (supabaseServer.from('customers') as any)
      .select('*, customer_tags(*)')
      .eq('id', id)
      .single();

    if (error || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const { data: recentOrders } = await (supabaseServer.from('orders') as any)
      .select('id, order_number, total, status, service_type, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      customer: {
        ...customer,
        auto_tags: computeAutoTags(customer),
        manual_tags: customer.customer_tags || [],
        customer_tags: undefined,
        recent_orders: recentOrders || [],
      },
    });
  } catch (err) {
    console.error('[api/admin/customers/[id]] GET unhandled:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const trimmedName = String(body.name).trim();
      if (!trimmedName) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      updates.name = trimmedName;
    }
    if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email as string | null) || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 422 });
      }
      updates.email = email;
    }
    if (body.phone !== undefined) {
      const phone = normalizePhone(body.phone as string | null) || null;
      if (phone && (phone.length < 10 || phone.length > 11)) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 422 });
      }
      updates.phone = phone;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await (supabaseServer.from('customers') as any)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A customer with this phone, email, or Messenger ID already exists' }, { status: 409 });
      }
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
      console.error('[api/admin/customers/[id]] PATCH error:', error.message);
      return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch (err) {
    console.error('[api/admin/customers/[id]] PATCH unhandled:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    const { error } = await (supabaseServer.from('customers') as any)
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
      console.error('[api/admin/customers/[id]] DELETE error:', error.message);
      return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/admin/customers/[id]] DELETE unhandled:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
