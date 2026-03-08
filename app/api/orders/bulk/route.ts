import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import type { OrderStatus } from '../../../../src/types';

export const runtime = 'nodejs';

/**
 * PATCH /api/orders/bulk
 * Bulk update order statuses
 * Admin users bypass rate limiting
 */
export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = await request.json();
    const { ids, status } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Order IDs array is required' },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses: OrderStatus[] = [
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'out_for_delivery',
      'completed',
      'cancelled'
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Validate all IDs are strings
    if (!ids.every((id: any) => typeof id === 'string')) {
      return NextResponse.json(
        { error: 'All order IDs must be strings' },
        { status: 400 }
      );
    }

    const { data, error } = await (supabaseServer
      .from('orders') as any)
      .update({ status })
      .in('id', ids)
      .select();

    if (error) {
      console.error('Error bulk updating orders:', error);
      return NextResponse.json(
        { error: 'Failed to update orders', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        updated: data?.length || 0,
        message: `Successfully updated ${data?.length || 0} order(s)`
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in PATCH /api/orders/bulk:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
