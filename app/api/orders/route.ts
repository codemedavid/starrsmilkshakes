import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { checkServerRateLimit } from '@/lib/server-rate-limit';
import { getClientIP, supabaseServer } from '@/lib/supabase-server';
import { posthog } from '@/lib/posthog';
import type { AddOn, Order, OrderFilters, OrderStatus, Variation } from '@/types';

export const runtime = 'nodejs';

const VALID_ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled',
];

const VALID_SERVICE_TYPES = new Set(['dine-in', 'pickup', 'delivery']);
const CONTACT_NUMBER_REGEX = /^[+\d\s().-]{7,24}$/;
const MAX_CART_ITEMS = 50;

const sanitizeSearchTerm = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s+.-]/g, '').trim();
const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const optionalText = (value: unknown) => {
  const normalized = normalizeText(value);
  return normalized || null;
};
const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getEffectiveBasePrice = (menuItem: any) => {
  const now = new Date();
  const discountStart = menuItem.discount_start_date ? new Date(menuItem.discount_start_date) : null;
  const discountEnd = menuItem.discount_end_date ? new Date(menuItem.discount_end_date) : null;
  const isDiscountActive =
    Boolean(menuItem.discount_active) &&
    (!discountStart || now >= discountStart) &&
    (!discountEnd || now <= discountEnd) &&
    menuItem.discount_price !== null;

  return isDiscountActive ? Number(menuItem.discount_price) : Number(menuItem.base_price);
};

const formatOrder = (order: any): Order => ({
  id: order.id,
  order_number: order.order_number,
  customer_name: order.customer_name,
  contact_number: order.contact_number,
  service_type: order.service_type,
  address: order.address,
  landmark: order.landmark,
  pickup_time: order.pickup_time,
  party_size: order.party_size,
  dine_in_time: order.dine_in_time,
  payment_method: order.payment_method,
  reference_number: order.reference_number,
  status: order.status,
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
  branch_id: order.branch_id,
  customer_id: order.customer_id ?? null,
  messenger_psid: order.messenger_psid ?? null,
  messenger_name: order.messenger_name ?? null,
  order_items:
    (order.order_items as any[])?.map((item: any) => ({
      id: item.id,
      order_id: item.order_id,
      menu_item_id: item.menu_item_id,
      menu_item_name: item.menu_item_name,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      total_price: Number(item.total_price),
      selected_variation: item.selected_variation,
      selected_add_ons: item.selected_add_ons,
      created_at: item.created_at,
    })) || [],
});

const extractMenuItemId = (item: any) => {
  const fromField = normalizeText(item.menuItemId);
  if (fromField) {
    return fromField;
  }

  const rawId = normalizeText(item.id);
  const uuidMatch = rawId.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return uuidMatch?.[1] || '';
};

const buildOrderItemsFromCart = (cartItems: any[], menuItemsById: Map<string, any>) => {
  return cartItems.map((item) => {
    const menuItemId = extractMenuItemId(item);
    const menuItem = menuItemsById.get(menuItemId);

    if (!menuItem) {
      throw new Error('One or more cart items are invalid or no longer available');
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 20) {
      throw new Error('Invalid item quantity');
    }

    const selectedVariationId = normalizeText(item.selectedVariation?.id);
    const selectedVariation =
      selectedVariationId
        ? (menuItem.variations || []).find((variation: any) => variation.id === selectedVariationId)
        : null;

    if (selectedVariationId && !selectedVariation) {
      throw new Error('One or more selected variations are invalid');
    }

    const selectedAddOnsInput = Array.isArray(item.selectedAddOns) ? item.selectedAddOns : [];
    const addOnQuantities = new Map<string, number>();

    for (const addOn of selectedAddOnsInput) {
      const addOnId = normalizeText(addOn?.id);
      if (!addOnId) {
        throw new Error('One or more selected add-ons are invalid');
      }

      const quantityValue = Number(addOn?.quantity ?? 1);
      const safeQuantity = Number.isInteger(quantityValue) && quantityValue > 0 ? quantityValue : 1;
      addOnQuantities.set(addOnId, (addOnQuantities.get(addOnId) || 0) + safeQuantity);
    }

    const resolvedAddOns: AddOn[] = Array.from(addOnQuantities.entries()).map(([addOnId, addOnQuantity]) => {
      const resolvedAddOn = (menuItem.add_ons || []).find((candidate: any) => candidate.id === addOnId);
      if (!resolvedAddOn) {
        throw new Error('One or more selected add-ons are invalid');
      }

      return {
        id: resolvedAddOn.id,
        name: resolvedAddOn.name,
        price: Number(resolvedAddOn.price),
        category: resolvedAddOn.category,
        quantity: addOnQuantity,
      };
    });

    const basePrice = getEffectiveBasePrice(menuItem);
    const variationPrice = selectedVariation ? Number(selectedVariation.price) : 0;
    const addOnPrice = resolvedAddOns.reduce((sum, addOn) => sum + Number(addOn.price) * (addOn.quantity || 1), 0);
    const unitPrice = basePrice + variationPrice + addOnPrice;

    const selectedVariationPayload: Variation | null = selectedVariation
      ? {
          id: selectedVariation.id,
          name: selectedVariation.name,
          price: Number(selectedVariation.price),
          image: selectedVariation.image_url || undefined,
        }
      : null;

    return {
      menu_item_id: menuItem.id,
      menu_item_name: menuItem.name,
      quantity,
      unit_price: unitPrice,
      total_price: unitPrice * quantity,
      selected_variation: selectedVariationPayload,
      selected_add_ons: resolvedAddOns.length > 0 ? resolvedAddOns : null,
    };
  });
};

/**
 * GET /api/orders
 * Fetch orders with optional filters
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    const filters: OrderFilters = {};
    const status = searchParams.get('status');
    const serviceType = searchParams.get('service_type');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search');

    if (status) {
      if (!VALID_ORDER_STATUSES.includes(status as OrderStatus)) {
        return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
      }
      filters.status = status as OrderStatus;
    }

    if (serviceType) {
      if (!VALID_SERVICE_TYPES.has(serviceType)) {
        return NextResponse.json({ error: 'Invalid service type filter' }, { status: 400 });
      }
      filters.service_type = serviceType as 'dine-in' | 'pickup' | 'delivery';
    }

    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;
    if (search) filters.search = sanitizeSearchTerm(search);

    let query = supabaseServer
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .order('created_at', { ascending: false });

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
      query = query.or(
        `order_number.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%,contact_number.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching orders:', error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const orders: Order[] = ((data || []) as any[]).map(formatOrder);

    return NextResponse.json({ orders }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in GET /api/orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/orders
 * Create a new order
 */
export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimit = checkServerRateLimit(`order:${clientIP}`, 5, 5 * 60 * 1000);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many orders from this address. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body = await request.json();

    const cartItems = Array.isArray(body.cartItems) ? body.cartItems : [];
    const customerName = normalizeText(body.customerName);
    const contactNumber = normalizeText(body.contactNumber);
    const serviceType = normalizeText(body.serviceType);
    const paymentMethod = normalizeText(body.paymentMethod);
    const options = typeof body.options === 'object' && body.options ? body.options : {};
    const submittedTotal = toFiniteNumber(body.total);

    if (cartItems.length === 0 || cartItems.length > MAX_CART_ITEMS) {
      return NextResponse.json({ error: 'Cart items are required' }, { status: 400 });
    }

    if (!customerName || customerName.length > 120) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    if (!contactNumber || !CONTACT_NUMBER_REGEX.test(contactNumber)) {
      return NextResponse.json({ error: 'A valid contact number is required' }, { status: 400 });
    }

    if (!VALID_SERVICE_TYPES.has(serviceType)) {
      return NextResponse.json({ error: 'Invalid service type' }, { status: 400 });
    }

    if (!paymentMethod) {
      return NextResponse.json({ error: 'Payment method is required' }, { status: 400 });
    }

    if (submittedTotal === null || submittedTotal < 0) {
      return NextResponse.json({ error: 'Invalid total amount' }, { status: 400 });
    }

    if (serviceType === 'delivery' && !normalizeText((options as any).address)) {
      return NextResponse.json({ error: 'Delivery address is required' }, { status: 400 });
    }

    const menuItemIds = cartItems.map(extractMenuItemId);
    if (menuItemIds.some((id) => !id)) {
      return NextResponse.json({ error: 'One or more cart items are invalid' }, { status: 400 });
    }

    const { data: menuItemsData, error: menuItemsError } = await supabaseServer
      .from('menu_items')
      .select(`
        id,
        name,
        base_price,
        discount_price,
        discount_start_date,
        discount_end_date,
        discount_active,
        available,
        variations (
          id,
          name,
          price,
          image_url
        ),
        add_ons (
          id,
          name,
          price,
          category
        )
      `)
      .in('id', menuItemIds);

    if (menuItemsError) {
      console.error('Error validating cart menu items:', menuItemsError);
      return NextResponse.json({ error: 'Failed to validate cart items' }, { status: 500 });
    }

    const menuItemsById = new Map(((menuItemsData || []) as any[]).map((item) => [item.id, item]));
    if (menuItemsById.size !== new Set(menuItemIds).size) {
      return NextResponse.json({ error: 'One or more cart items are invalid or unavailable' }, { status: 400 });
    }

    const unavailableItem = Array.from(menuItemsById.values()).find((item) => item.available === false);
    if (unavailableItem) {
      return NextResponse.json({ error: `${unavailableItem.name} is currently unavailable` }, { status: 400 });
    }

    const { data: paymentMethodData, error: paymentMethodError } = await (supabaseServer
      .from('payment_methods') as any)
      .select('id, active')
      .eq('id', paymentMethod)
      .single();

    if (paymentMethodError || !paymentMethodData || !paymentMethodData.active) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
    }

    const branchId = optionalText((options as any).branchId);
    if (branchId) {
      const { data: branchData, error: branchError } = await (supabaseServer
        .from('branches') as any)
        .select('id, is_active')
        .eq('id', branchId)
        .single();

      if (branchError || !branchData || !branchData.id || branchData.is_active === false) {
        return NextResponse.json({ error: 'Invalid branch selection' }, { status: 400 });
      }
    }

    let orderItems;
    try {
      orderItems = buildOrderItemsFromCart(cartItems, menuItemsById);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid cart item data' },
        { status: 400 }
      );
    }

    const deliveryFee = serviceType === 'delivery' ? toFiniteNumber((options as any).deliveryFee) ?? 0 : 0;
    if (deliveryFee < 0) {
      return NextResponse.json({ error: 'Invalid delivery fee' }, { status: 400 });
    }

    const computedSubtotal = orderItems.reduce((sum: number, item: any) => sum + Number(item.total_price), 0);
    const computedTotal = Number((computedSubtotal + deliveryFee).toFixed(2));

    if (Math.abs(computedTotal - submittedTotal) > 0.01) {
      return NextResponse.json({ error: 'Order total does not match current menu pricing' }, { status: 400 });
    }

    const { data: orderNumber, error: orderNumberError } = await supabaseServer.rpc('generate_order_number');

    if (orderNumberError || !orderNumber) {
      console.error('Error generating order number:', orderNumberError);
      return NextResponse.json({ error: 'Failed to generate order number' }, { status: 500 });
    }

    const { data: order, error: orderError } = await supabaseServer
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_name: customerName,
        contact_number: contactNumber,
        service_type: serviceType,
        address: optionalText((options as any).address),
        landmark: optionalText((options as any).landmark),
        pickup_time: optionalText((options as any).pickupTime),
        party_size: toFiniteNumber((options as any).partySize),
        dine_in_time: optionalText((options as any).dineInTime),
        payment_method: paymentMethod,
        reference_number: optionalText((options as any).referenceNumber),
        status: 'pending',
        total: computedTotal,
        delivery_fee: serviceType === 'delivery' ? deliveryFee : null,
        lalamove_quotation_id: optionalText((options as any).lalamoveQuotationId),
        lalamove_order_id: null,
        lalamove_status: null,
        lalamove_tracking_url: null,
        notes: optionalText((options as any).notes),
        customer_ip: clientIP,
        branch_id: branchId,
      } as any)
      .select()
      .single();

    if (orderError || !order) {
      console.error('Error creating order:', orderError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    const orderData = order as any;
    const itemsToInsert = orderItems.map((item: any) => ({
      order_id: orderData.id,
      ...item,
    }));

    const { error: itemsError } = await supabaseServer.from('order_items').insert(itemsToInsert as any);

    if (itemsError) {
      console.error('Error creating order items:', itemsError);
      await supabaseServer.from('orders').delete().eq('id', orderData.id);
      return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 });
    }

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
      return NextResponse.json({ error: 'Order created but failed to load details' }, { status: 500 });
    }

    const formattedOrder = formatOrder(completeOrder);

    let paymentMethodName = formattedOrder.payment_method;
    let branchName = '';
    try {
      const { data: pm } = await (supabaseServer
        .from('payment_methods') as any)
        .select('name')
        .eq('id', formattedOrder.payment_method)
        .single();
      if (pm && pm.name) paymentMethodName = pm.name;
    } catch {}

    try {
      if (formattedOrder.branch_id) {
        const { data: branch } = await (supabaseServer
          .from('branches') as any)
          .select('name')
          .eq('id', formattedOrder.branch_id)
          .single();
        if (branch && branch.name) branchName = branch.name;
      }
    } catch {}

    try {
      await posthog.capture(`${formattedOrder.customer_name}_${formattedOrder.contact_number}`, 'starrs_order', {
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
        items_summary: formattedOrder.order_items.map((item) => {
          const variation = item.selected_variation?.name ? ` (${item.selected_variation.name})` : '';
          const addOns = item.selected_add_ons?.length
            ? ` + ${item.selected_add_ons
                .map((a: any) =>
                  a.quantity && a.quantity > 1 ? `${a.name} x${a.quantity}` : a.name
                )
                .join(', ')}`
            : '';
          return `${item.quantity}x ${item.menu_item_name}${variation}${addOns} - PHP ${item.total_price}`;
        }).join(' | '),
        item_count: formattedOrder.order_items.reduce((sum, item) => sum + item.quantity, 0),
        created_at: formattedOrder.created_at,
      });
    } catch (analyticsError) {
      console.error('PostHog capture failed for order:', analyticsError);
    }

    // Handle Messenger checkout session linking
    const msession = body.msession || null;
    if (msession && typeof msession === 'string') {
      // Atomically mark session as completed (prevents race condition)
      const { data: checkoutSession } = await (supabaseServer
        .from('messenger_checkout_sessions') as any)
        .update({ status: 'completed', order_id: formattedOrder.id })
        .eq('hash', msession)
        .eq('status', 'pending')
        .select('psid')
        .single() as { data: any; error: any };

      if (checkoutSession) {
        // Create messenger order link for status notifications
        await (supabaseServer.from('messenger_order_links') as any).insert({
          order_id: formattedOrder.id,
          psid: checkoutSession.psid,
          notify_enabled: true,
        });

        // Send receipt to Messenger (non-blocking)
        (async () => {
          try {
            const { data: fbConfig } = await (supabaseServer
              .from('facebook_config') as any)
              .select('page_access_token')
              .single() as { data: any; error: any };

            if (fbConfig) {
              const { sendTextMessage } = await import('@/lib/messenger');
              const itemLines = (formattedOrder.order_items || [])
                .map((oi: any) => `${oi.quantity}x ${oi.menu_item_name} — ₱${oi.total_price}`)
                .join('\n');

              const receipt = [
                `Order #${formattedOrder.order_number} confirmed!`,
                '',
                itemLines,
                '',
                `Total: ₱${formattedOrder.total}`,
                `Payment: ${paymentMethodName}`,
                `Service: ${formattedOrder.service_type}`,
                '',
                'Thank you for your order!',
              ].join('\n');

              await sendTextMessage(checkoutSession.psid, receipt, fbConfig.page_access_token);
            }
          } catch (err) {
            console.error('Failed to send Messenger receipt:', err);
          }
        })();

        // Auto-create or link customer from Messenger PSID
        try {
          const psid = checkoutSession.psid;

          // Fetch the customer's actual Facebook name from Graph API
          let fbName: string | null = null;
          try {
            const { data: fbConfig } = await (supabaseServer
              .from('facebook_config') as any)
              .select('page_access_token')
              .single() as { data: any; error: any };
            if (fbConfig) {
              const { getUserProfile } = await import('@/lib/messenger');
              const profile = await getUserProfile(psid, fbConfig.page_access_token);
              fbName = profile?.name || null;
            }
          } catch {
            // Non-fatal — fall back to checkout form name
          }

          // Prefer Facebook name, fall back to checkout form name, then PSID
          const msgrName = fbName || customerName || psid;

          // Atomic upsert on messenger_psid (ON CONFLICT DO UPDATE).
          // Prevents duplicate customers when two concurrent orders arrive with the same PSID.
          const { data: upsertedCustomer, error: upsertErr } = await (supabaseServer.from('customers') as any)
            .upsert(
              { name: msgrName, messenger_psid: psid, messenger_name: fbName || msgrName, source: 'messenger' },
              { onConflict: 'messenger_psid', ignoreDuplicates: false }
            )
            .select('id')
            .single();
          if (upsertErr) throw upsertErr;
          const linkedCustomerId = upsertedCustomer.id;

          const orderPatch: Record<string, any> = { customer_id: linkedCustomerId, messenger_psid: psid };
          if (fbName || msgrName) {
            orderPatch.messenger_name = fbName || msgrName;
          }
          const { error: linkErr } = await (supabaseServer.from('orders') as any)
            .update(orderPatch)
            .eq('id', orderData.id);

          if (linkErr) {
            console.error('[orders/route] Failed to link customer to order:', { orderId: orderData.id, customerId: linkedCustomerId, error: linkErr.message });
          }
        } catch (customerErr) {
          console.error('[orders/route] Messenger customer upsert failed:', { orderId: orderData.id, error: String(customerErr) });
          // Non-fatal — order is valid, customer link is missing
        }
      }
    }

    return NextResponse.json({ order: formattedOrder }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
