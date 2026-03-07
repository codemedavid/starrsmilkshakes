import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, getClientIP } from '../../../src/lib/supabase-server';
import type { Order, OrderFilters, OrderStatus } from '../../../src/types';
import { posthog } from '../../../src/lib/posthog';

export const runtime = 'nodejs';

/**
 * GET /api/orders
 * Fetch orders with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse filters from query parameters
    const filters: OrderFilters = {};
    const status = searchParams.get('status');
    const serviceType = searchParams.get('service_type');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search');

    if (status) filters.status = status as OrderStatus;
    if (serviceType) filters.service_type = serviceType as 'dine-in' | 'pickup' | 'delivery';
    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;
    if (search) filters.search = search;

    // Build query
    let query = supabaseServer
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.service_type) {
      query = query.eq('service_type', filters.service_type);
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      query = query.or(`order_number.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,contact_number.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching orders:', error);
      return NextResponse.json(
        { error: 'Failed to fetch orders', details: error.message },
        { status: 500 }
      );
    }

    // Format orders
    const orders: Order[] = ((data || []) as any[]).map((order: any) => ({
      id: order.id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      contact_number: order.contact_number,
      service_type: order.service_type as 'dine-in' | 'pickup' | 'delivery',
      address: order.address,
      landmark: order.landmark,
      pickup_time: order.pickup_time,
      party_size: order.party_size,
      dine_in_time: order.dine_in_time,
      payment_method: order.payment_method,
      reference_number: order.reference_number,
      status: order.status as OrderStatus,
      total: Number(order.total),
      notes: order.notes,
      customer_ip: order.customer_ip,
      created_at: order.created_at,
      updated_at: order.updated_at,
      completed_at: order.completed_at,
      delivery_fee: order.delivery_fee ? Number(order.delivery_fee) : null,
      lalamove_quotation_id: order.lalamove_quotation_id,
      lalamove_order_id: order.lalamove_order_id,
      lalamove_status: order.lalamove_status,
      lalamove_tracking_url: order.lalamove_tracking_url,
      order_items: (order.order_items as any[])?.map((item: any) => ({
        id: item.id,
        order_id: item.order_id,
        menu_item_id: item.menu_item_id,
        menu_item_name: item.menu_item_name,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total_price: Number(item.total_price),
        selected_variation: item.selected_variation,
        selected_add_ons: item.selected_add_ons,
        created_at: item.created_at
      })) || [],
      branch_id: order.branch_id
    }));

    return NextResponse.json({ orders }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in GET /api/orders:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/orders
 * Create a new order
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientIP = getClientIP(request);

    // Validate required fields
    const {
      cartItems,
      customerName,
      contactNumber,
      serviceType,
      paymentMethod,
      total,
      options
    } = body;

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return NextResponse.json(
        { error: 'Cart items are required' },
        { status: 400 }
      );
    }

    if (!customerName || !contactNumber || !serviceType || !paymentMethod || total === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Rate limiting disabled - allow all orders
    // Generate order number
    const { data: orderNumber, error: orderNumberError } = await supabaseServer
      .rpc('generate_order_number');

    if (orderNumberError || !orderNumber) {
      console.error('Error generating order number:', orderNumberError);
      return NextResponse.json(
        { error: 'Failed to generate order number' },
        { status: 500 }
      );
    }

    // Create order
    const { data: order, error: orderError } = await supabaseServer
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_name: customerName,
        contact_number: contactNumber,
        service_type: serviceType,
        address: options?.address || null,
        landmark: options?.landmark || null,
        pickup_time: options?.pickupTime || null,
        party_size: options?.partySize || null,
        dine_in_time: options?.dineInTime || null,
        payment_method: paymentMethod,
        reference_number: options?.referenceNumber || null,
        status: 'pending',
        total: total,
        delivery_fee: options?.deliveryFee ?? null,
        lalamove_quotation_id: options?.lalamoveQuotationId || null,
        lalamove_order_id: null,
        lalamove_status: null,
        lalamove_tracking_url: null,
        notes: options?.notes || null,
        customer_ip: clientIP,
        branch_id: options?.branchId || null
      } as any)
      .select()
      .single();

    if (orderError || !order) {
      console.error('Error creating order:', orderError);
      return NextResponse.json(
        { error: 'Failed to create order', details: orderError?.message || 'Order creation failed' },
        { status: 500 }
      );
    }

    // Create order items
    const orderData = order as any;
    const orderItems = cartItems.map((item: any) => {
      // Extract menu item ID from cart item ID
      let menuItemId: string | null = null;
      if (item.id) {
        const uuidMatch = item.id.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (uuidMatch && uuidMatch[1]) {
          menuItemId = uuidMatch[1];
        }
      }

      return {
        order_id: orderData.id,
        menu_item_id: menuItemId,
        menu_item_name: item.name,
        quantity: item.quantity,
        unit_price: item.totalPrice,
        total_price: item.totalPrice * item.quantity,
        selected_variation: item.selectedVariation || null,
        selected_add_ons: item.selectedAddOns || null
      };
    });

    const { error: itemsError } = await supabaseServer
      .from('order_items')
      .insert(orderItems as any);

    if (itemsError) {
      console.error('Error creating order items:', itemsError);
      // Try to delete the order if items fail
      await supabaseServer.from('orders').delete().eq('id', orderData.id);
      return NextResponse.json(
        { error: 'Failed to create order items', details: itemsError.message },
        { status: 500 }
      );
    }

    // Fetch complete order with items
    const { data: completeOrder, error: fetchError } = await supabaseServer
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('id', orderData.id)
      .single();

    if (fetchError || !completeOrder) {
      console.error('Error fetching complete order:', fetchError);
      return NextResponse.json(
        { error: 'Order created but failed to fetch details' },
        { status: 500 }
      );
    }

    // Format order
    const completeOrderData = completeOrder as any;
    const formattedOrder: Order = {
      id: completeOrderData.id,
      order_number: completeOrderData.order_number,
      customer_name: completeOrderData.customer_name,
      contact_number: completeOrderData.contact_number,
      service_type: completeOrderData.service_type as 'dine-in' | 'pickup' | 'delivery',
      address: completeOrderData.address,
      landmark: completeOrderData.landmark,
      pickup_time: completeOrderData.pickup_time,
      party_size: completeOrderData.party_size,
      dine_in_time: completeOrderData.dine_in_time,
      payment_method: completeOrderData.payment_method,
      reference_number: completeOrderData.reference_number,
      status: completeOrderData.status as OrderStatus,
      total: Number(completeOrderData.total),
      notes: completeOrderData.notes,
      customer_ip: completeOrderData.customer_ip,
      created_at: completeOrderData.created_at,
      updated_at: completeOrderData.updated_at,
      completed_at: completeOrderData.completed_at,
      delivery_fee: completeOrderData.delivery_fee ? Number(completeOrderData.delivery_fee) : null,
      lalamove_quotation_id: completeOrderData.lalamove_quotation_id,
      lalamove_order_id: completeOrderData.lalamove_order_id,
      lalamove_status: completeOrderData.lalamove_status,
      lalamove_tracking_url: completeOrderData.lalamove_tracking_url,
      order_items: (completeOrderData.order_items as any[])?.map((item: any) => ({
        id: item.id,
        order_id: item.order_id,
        menu_item_id: item.menu_item_id,
        menu_item_name: item.menu_item_name,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total_price: Number(item.total_price),
        selected_variation: item.selected_variation,
        selected_add_ons: item.selected_add_ons,
        created_at: item.created_at
      })) || []
    };

    // Look up payment method full name and branch name for the notification
    let paymentMethodName = formattedOrder.payment_method;
    let branchName = '';
    try {
      const { data: pm } = await supabaseServer
        .from('payment_methods')
        .select('name')
        .eq('id', formattedOrder.payment_method)
        .single();
      if (pm?.name) paymentMethodName = pm.name;
    } catch {}
    try {
      if (completeOrderData.branch_id) {
        const { data: branch } = await supabaseServer
          .from('branches')
          .select('name')
          .eq('id', completeOrderData.branch_id)
          .single();
        if (branch?.name) branchName = branch.name;
      }
    } catch {}

    // Capture PostHog event for order notification
    await posthog.capture(
      `${formattedOrder.customer_name}_${formattedOrder.contact_number}`,
      'starrs_order',
      {
        order_number: formattedOrder.order_number,
        customer_name: formattedOrder.customer_name,
        contact_number: formattedOrder.contact_number,
        service_type: formattedOrder.service_type,
        address: formattedOrder.address || null,
        payment_method: paymentMethodName,
        branch: branchName || 'N/A',
        total: formattedOrder.total,
        delivery_fee: formattedOrder.delivery_fee || null,
        notes: formattedOrder.notes || null,
        items_summary: formattedOrder.order_items.map(item => {
          const variation = item.selected_variation?.name ? ` (${item.selected_variation.name})` : '';
          const addOns = item.selected_add_ons?.length
            ? ` + ${item.selected_add_ons.map((a: any) => a.name).join(', ')}`
            : '';
          return `${item.quantity}x ${item.menu_item_name}${variation}${addOns} — ₱${item.total_price}`;
        }).join(' | '),
        item_count: formattedOrder.order_items.reduce((sum, item) => sum + item.quantity, 0),
        created_at: formattedOrder.created_at
      }
    );

    return NextResponse.json({ order: formattedOrder }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/orders:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

