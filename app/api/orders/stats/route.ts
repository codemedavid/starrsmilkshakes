import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import type { OrderStats } from '../../../../src/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/stats
 * Get order statistics
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Get total orders
    const { count: totalOrders, error: totalError } = await supabaseServer
      .from('orders')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      console.error('Error fetching total orders:', totalError);
    }

    // Get pending orders
    const { count: pendingOrders, error: pendingError } = await supabaseServer
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingError) {
      console.error('Error fetching pending orders:', pendingError);
    }

    // Get today's orders
    const { count: todayOrders, error: todayError } = await supabaseServer
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart)
      .lt('created_at', todayEnd);

    if (todayError) {
      console.error('Error fetching today\'s orders:', todayError);
    }

    // Get today's revenue (only from completed orders)
    const { data: todayOrdersData, error: revenueError } = await supabaseServer
      .from('orders')
      .select('total')
      .gte('created_at', todayStart)
      .lt('created_at', todayEnd)
      .eq('status', 'completed');

    if (revenueError) {
      console.error('Error fetching today\'s revenue:', revenueError);
    }

    const todayRevenue = (todayOrdersData as any[])?.reduce((sum: number, order: any) => sum + Number(order.total), 0) || 0;

    // Get completed orders
    const { count: completedOrders, error: completedError } = await supabaseServer
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    if (completedError) {
      console.error('Error fetching completed orders:', completedError);
    }

    // Get cancelled orders
    const { count: cancelledOrders, error: cancelledError } = await supabaseServer
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'cancelled');

    if (cancelledError) {
      console.error('Error fetching cancelled orders:', cancelledError);
    }

    const stats: OrderStats = {
      total_orders: totalOrders || 0,
      pending_orders: pendingOrders || 0,
      today_orders: todayOrders || 0,
      today_revenue: todayRevenue,
      completed_orders: completedOrders || 0,
      cancelled_orders: cancelledOrders || 0
    };

    return NextResponse.json({ stats }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in GET /api/orders/stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
