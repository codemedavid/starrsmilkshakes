import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import { normalizePhone, normalizeEmail, computeAutoTags } from '@/lib/customer-utils';
import type { CustomerFilters, CustomerSummary } from '@/types/customer';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const tag = searchParams.get('tag') || '';
    const sort = (searchParams.get('sort') || 'last_order_at') as CustomerFilters['sort'];
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 20)));
    const offset = (page - 1) * limit;

    const AUTO_TAG_LABELS = ['VIP', 'Loyal', 'New', 'At Risk'];
    const isAutoTag = AUTO_TAG_LABELS.includes(tag);

    let query = (supabaseServer.from('customers') as any)
      .select('*, customer_tags(*)', { count: 'exact' });

    if (search) {
      // Sanitize search input: escape PostgREST special characters to prevent filter injection
      const sanitized = search.replace(/[%_\\,().*]/g, '');
      if (sanitized) {
        query = query.or(
          `name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,email.ilike.%${sanitized}%`
        );
      }
    }

    if (tag && !isAutoTag) {
      query = query.eq('customer_tags.tag', tag);
    }

    if (isAutoTag) {
      if (tag === 'VIP')   query = query.gte('total_spent', 5000);
      if (tag === 'Loyal') query = query.gte('order_count', 10);
      if (tag === 'New')   query = query.lte('order_count', 2);
      if (tag === 'At Risk') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.lt('last_order_at', thirtyDaysAgo).gt('order_count', 1);
      }
    }

    const validSorts = ['last_order_at', 'total_spent', 'order_count', 'name', 'created_at'];
    const sortCol = validSorts.includes(sort!) ? sort! : 'last_order_at';
    query = query.order(sortCol, { ascending: sortCol === 'name', nullsFirst: false });
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[api/admin/customers] GET error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
    }

    const customers: CustomerSummary[] = (data || []).map((c: any) => ({
      ...c,
      auto_tags: computeAutoTags(c),
      manual_tags: c.customer_tags || [],
      customer_tags: undefined,
    }));

    return NextResponse.json({ customers, total: count ?? 0, page, limit });
  } catch (err) {
    console.error('[api/admin/customers] GET unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const email = normalizeEmail(body.email as string | null) || null;
    const phone = normalizePhone(body.phone as string | null) || null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 422 });
    }
    if (phone && (phone.length < 10 || phone.length > 11)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 422 });
    }

    const { data, error } = await (supabaseServer.from('customers') as any)
      .insert({ name, email, phone, notes, source: 'manual' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A customer with this phone, email, or Messenger ID already exists' }, { status: 409 });
      }
      console.error('[api/admin/customers] POST error:', error.message);
      return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
    }

    return NextResponse.json({ customer: data }, { status: 201 });
  } catch (err) {
    console.error('[api/admin/customers] POST unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
