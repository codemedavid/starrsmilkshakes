import { NextRequest, NextResponse } from 'next/server';
import { getInternalApiHeaders, requireAdminRequest } from '@/lib/admin-auth';
import { mapSiteSettingsRows } from '@/lib/site-settings';
import { supabaseServer } from '@/lib/supabase-server';
import type { Order, OrderStatus, SiteSettings } from '../../../../src/types';
import { buildLalamoveConfig } from '../../../../src/lib/lalamove';
import type { DeliveryStoreConfig } from '../../../../src/lib/lalamove';

export const runtime = 'nodejs';

/**
 * Normalize phone number for Lalamove API
 * Always ensures phone number starts with +63
 */
function normalizePhoneNumber(phone?: string): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  if (!trimmed) return undefined;
  
  // Remove all non-digits
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return undefined;
  
  // Always normalize to +63 format
  if (digits.startsWith('63')) {
    return `+${digits}`;
  } else if (digits.startsWith('0')) {
    // Remove leading 0 and add 63
    return `+63${digits.slice(1)}`;
  } else if (digits.startsWith('9')) {
    // Add 63 prefix
    return `+63${digits}`;
  } else {
    // Add 63 prefix for any other format
    return `+63${digits}`;
  }
}

/**
 * Fetch site settings from database
 */
async function getSiteSettings(): Promise<SiteSettings | null> {
  try {
    const { data, error } = await supabaseServer
      .from('site_settings')
      .select('*')
      .order('id');

    if (error) {
      console.error('Error fetching site settings:', error);
      return null;
    }

    return mapSiteSettingsRows(data as any[]);
  } catch (error) {
    console.error('Error fetching site settings:', error);
    return null;
  }
}

/**
 * Create Lalamove delivery order via API
 */
async function createLalamoveOrder(
  quotationId: string,
  recipientName: string,
  recipientPhone: string,
  config: DeliveryStoreConfig,
  orderId: string,
  request?: NextRequest
): Promise<{ orderId: string; status: string; shareLink: string; driverId?: string | null } | null> {
  try {
    const FUNCTION_BASE_URL = process.env.NEXT_PUBLIC_LALAMOVE_FUNCTION_URL;

    // Normalize phone number to always start with +63 (e.164 format)
    const normalizePhone = (phone: string): string => {
      if (!phone) return phone;
      const digits = phone.replace(/\D/g, '');
      if (!digits) return phone;
      if (digits.startsWith('63')) {
        return `+${digits}`;
      } else if (digits.startsWith('0')) {
        return `+63${digits.slice(1)}`;
      } else if (digits.startsWith('9')) {
        return `+63${digits}`;
      } else {
        return `+63${digits}`;
      }
    };

    const normalizedPhone = normalizePhone(recipientPhone);
    const normalizedStorePhone = normalizePhone(config.storePhone);
    const proxyBase = FUNCTION_BASE_URL ?? '/api/lalamove';
    const isAbsoluteBase = proxyBase.startsWith('http://') || proxyBase.startsWith('https://');

    // Build absolute URL for server-side fetch
    const buildFunctionUrl = (path: string): string => {
      const base = proxyBase;
      const trimmedPath = path.startsWith('/') ? path : `/${path}`;
      const cleanBase = base.replace(/\/$/, '');
      
      // If base is already absolute (starts with http), use it as is
      if (isAbsoluteBase) {
        return `${cleanBase}${trimmedPath}`;
      }
      
      // For relative URLs, construct absolute URL from request or use environment variable
      let origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
      
      if (!origin && request) {
        // Try to get origin from request headers
        const host = request.headers.get('host');
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        if (host) {
          origin = `${protocol}://${host}`;
        }
      }
      
      // Fallback to localhost for development
      if (!origin) {
        origin = 'http://localhost:3000';
      }
      
      return `${origin}${cleanBase}${trimmedPath}`;
    };

    const buildProxyHeaders = () => ({
      'Content-Type': 'application/json',
      ...(isAbsoluteBase ? {} : getInternalApiHeaders())
    });

    const response = await fetch(buildFunctionUrl('/order'), {
      method: 'POST',
      headers: buildProxyHeaders(),
      body: JSON.stringify({
        quotationId,
        recipientName,
        recipientPhone: normalizedPhone,
        market: config.market,
        sandbox: config.sandbox,
        storeName: config.storeName,
        storePhone: normalizedStorePhone,
        storeAddress: config.storeAddress,
        storeLatitude: config.storeLatitude,
        storeLongitude: config.storeLongitude,
        serviceType: config.serviceType,
        metadata: {
          orderId: orderId
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to create Lalamove order');
    }

    const data = await response.json();
    return {
      orderId: data.orderId,
      status: data.status,
      shareLink: data.shareLink,
      driverId: data.driverId
    };
  } catch (error) {
    console.error('Error creating Lalamove order:', error);
    return null;
  }
}

/**
 * GET /api/orders/[id]
 * Fetch a single order by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('id', id)
      .single() as { data: any; error: any };

    if (error) {
      console.error('Error fetching order:', error);
      return NextResponse.json(
        { error: 'Order not found', details: error.message },
        { status: 404 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Format order
    const order: Order = {
      id: data.id,
      order_number: data.order_number,
      customer_name: data.customer_name,
      contact_number: data.contact_number,
      service_type: data.service_type as 'dine-in' | 'pickup' | 'delivery',
      address: data.address,
      landmark: data.landmark,
      pickup_time: data.pickup_time,
      party_size: data.party_size,
      dine_in_time: data.dine_in_time,
      payment_method: data.payment_method,
      reference_number: data.reference_number,
      status: data.status as OrderStatus,
      total: Number(data.total),
      notes: data.notes,
      customer_ip: data.customer_ip,
      created_at: data.created_at,
      updated_at: data.updated_at,
      completed_at: data.completed_at,
      delivery_fee: data.delivery_fee ? Number(data.delivery_fee) : null,
      lalamove_quotation_id: data.lalamove_quotation_id,
      lalamove_order_id: data.lalamove_order_id,
      lalamove_status: data.lalamove_status,
      lalamove_tracking_url: data.lalamove_tracking_url,
      customer_id: data.customer_id ?? null,
      messenger_psid: data.messenger_psid ?? null,
      messenger_name: data.messenger_name ?? null,
      order_items: (data.order_items as any[])?.map((item: any) => ({
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

    return NextResponse.json({ order }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in GET /api/orders/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/orders/[id]
 * Update order status
 * Admin users bypass rate limiting
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status, lalamove_order_id, lalamove_status, lalamove_tracking_url } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Handle customer_id linking
    const rawCustomerId = body.customer_id;
    let customerId: string | null | undefined = undefined; // undefined = don't update

    if (rawCustomerId !== undefined) {
      if (rawCustomerId === null) {
        customerId = null; // explicit unlink
      } else {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(String(rawCustomerId))) {
          return NextResponse.json({ error: 'Invalid customer_id format' }, { status: 422 });
        }
        // Verify customer exists
        const { data: customerExists } = await (supabaseServer.from('customers') as any)
          .select('id').eq('id', rawCustomerId).maybeSingle();
        if (!customerExists) {
          return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }
        customerId = String(rawCustomerId);
      }
    }

    // Handle retry_messenger_link: re-attempt auto-link from messenger_psid
    if (body.retry_messenger_link === true) {
      // Fetch the current order to get its messenger_psid
      const { data: currentOrderForRetry } = await supabaseServer
        .from('orders')
        .select('messenger_psid, messenger_name, customer_name, customer_id')
        .eq('id', id)
        .single() as { data: any; error: any };

      if (!currentOrderForRetry?.messenger_psid) {
        return NextResponse.json({ error: 'Order has no Messenger PSID to link' }, { status: 400 });
      }
      if (currentOrderForRetry.customer_id) {
        return NextResponse.json({ error: 'Order is already linked to a customer' }, { status: 400 });
      }

      const psid = currentOrderForRetry.messenger_psid;
      const fallbackName = currentOrderForRetry.messenger_name || currentOrderForRetry.customer_name || psid;

      // Fetch FB name
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
        // Non-fatal
      }

      const msgrName = fbName || fallbackName;

      // Upsert customer
      const { data: upsertedCustomer, error: upsertErr } = await (supabaseServer.from('customers') as any)
        .upsert(
          { name: msgrName, messenger_psid: psid, messenger_name: fbName || msgrName, source: 'messenger' },
          { onConflict: 'messenger_psid', ignoreDuplicates: false }
        )
        .select('id')
        .single();

      if (upsertErr || !upsertedCustomer) {
        return NextResponse.json({ error: 'Failed to create/find customer from Messenger PSID' }, { status: 500 });
      }

      // Link to order and update messenger_name if we got a fresh FB name
      const retryUpdate: any = { customer_id: upsertedCustomer.id };
      if (fbName && fbName !== currentOrderForRetry.messenger_name) {
        retryUpdate.messenger_name = fbName;
      }

      const { data: retryData, error: retryErr } = await supabaseServer
        .from('orders')
        // @ts-expect-error - Supabase type definitions may not include all fields
        .update(retryUpdate)
        .eq('id', id)
        .select('*, order_items (*)')
        .single() as { data: any; error: any };

      if (retryErr) {
        return NextResponse.json({ error: 'Failed to link customer' }, { status: 500 });
      }

      const retryOrder: Order = {
        id: retryData.id,
        order_number: retryData.order_number,
        customer_name: retryData.customer_name,
        contact_number: retryData.contact_number,
        service_type: retryData.service_type,
        address: retryData.address,
        landmark: retryData.landmark,
        pickup_time: retryData.pickup_time,
        party_size: retryData.party_size,
        dine_in_time: retryData.dine_in_time,
        payment_method: retryData.payment_method,
        reference_number: retryData.reference_number,
        status: retryData.status,
        total: Number(retryData.total),
        notes: retryData.notes,
        customer_ip: retryData.customer_ip,
        created_at: retryData.created_at,
        updated_at: retryData.updated_at,
        completed_at: retryData.completed_at,
        delivery_fee: retryData.delivery_fee ? Number(retryData.delivery_fee) : null,
        lalamove_quotation_id: retryData.lalamove_quotation_id,
        lalamove_order_id: retryData.lalamove_order_id,
        lalamove_status: retryData.lalamove_status,
        lalamove_tracking_url: retryData.lalamove_tracking_url,
        customer_id: retryData.customer_id ?? null,
        messenger_psid: retryData.messenger_psid ?? null,
        messenger_name: retryData.messenger_name ?? null,
        order_items: (retryData.order_items as any[])?.map((item: any) => ({
          id: item.id,
          order_id: item.order_id,
          menu_item_id: item.menu_item_id,
          menu_item_name: item.menu_item_name,
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          total_price: Number(item.total_price),
          selected_variation: item.selected_variation,
          selected_add_ons: item.selected_add_ons,
          created_at: item.created_at,
        })) || [],
      };

      return NextResponse.json({ order: retryOrder }, { status: 200 });
    }

    // Build update object
    const updateData: any = {};
    
    if (status !== undefined) {
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
      updateData.status = status;
    }

    // Allow updating Lalamove fields
    if (lalamove_order_id !== undefined) {
      updateData.lalamove_order_id = lalamove_order_id;
    }
    if (lalamove_status !== undefined) {
      updateData.lalamove_status = lalamove_status;
    }
    if (lalamove_tracking_url !== undefined) {
      updateData.lalamove_tracking_url = lalamove_tracking_url;
    }

    if (customerId !== undefined) {
      updateData.customer_id = customerId;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Fetch current order to check if we need to create Lalamove order
    const { data: currentOrder } = await supabaseServer
      .from('orders')
      .select('*')
      .eq('id', id)
      .single() as { data: any; error: any };

    // Check if status is changing to 'confirmed' and order is delivery type
    const statusChangingToConfirmed = 
      status === 'confirmed' && 
      currentOrder?.status !== 'confirmed' &&
      currentOrder?.service_type === 'delivery' &&
      currentOrder?.lalamove_quotation_id &&
      !currentOrder?.lalamove_order_id;

    // Update the order
    const { data, error } = await supabaseServer
      .from('orders')
      // @ts-expect-error - Supabase type definitions may not include all fields
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        order_items (*)
      `)
      .single() as { data: any; error: any };

    if (error) {
      console.error('Error updating order:', error);
      return NextResponse.json(
        { error: 'Failed to update order', details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Automatically create Lalamove order if status changed to confirmed (non-blocking)
    if (statusChangingToConfirmed) {
      // Don't await - let it run in the background so it doesn't block the response
      (async () => {
        try {
          const siteSettings = await getSiteSettings();
          if (siteSettings) {
            const lalamoveConfig = buildLalamoveConfig(siteSettings);
            if (lalamoveConfig && data.lalamove_quotation_id) {
              const normalizedPhone = normalizePhoneNumber(data.contact_number) || data.contact_number;
              const lalamoveResult = await createLalamoveOrder(
                data.lalamove_quotation_id,
                data.customer_name,
                normalizedPhone,
                lalamoveConfig,
                data.id,
                request
              );

              if (lalamoveResult) {
                // Update order with Lalamove tracking info
                await supabaseServer
                  .from('orders')
                  // @ts-expect-error - Supabase type definitions may not include all fields
                  .update({
                    lalamove_order_id: lalamoveResult.orderId,
                    lalamove_status: lalamoveResult.status,
                    lalamove_tracking_url: lalamoveResult.shareLink
                  })
                  .eq('id', id);

                console.log(`Lalamove order created automatically for order ${data.order_number}:`, lalamoveResult.orderId);
              } else {
                console.warn(`Failed to create Lalamove order for order ${data.order_number}`);
              }
            }
          }
        } catch (lalamoveError) {
          console.error('Error creating Lalamove order automatically:', lalamoveError);
          // Don't fail the order update if Lalamove creation fails
        }
      })();
    }

    // Send Messenger notification if applicable (non-blocking)
    if (status) {
      (async () => {
        try {
          const { data: messengerLink } = await (supabaseServer
            .from('messenger_order_links') as any)
            .select('psid, notify_enabled')
            .eq('order_id', id)
            .single() as { data: any; error: any };

          if (messengerLink && messengerLink.notify_enabled) {
            const { data: fbConfig } = await (supabaseServer
              .from('facebook_config') as any)
              .select('page_access_token')
              .single() as { data: any; error: any };

            if (fbConfig) {
              const { sendTextMessage, buildStatusMessage } = await import('@/lib/messenger');
              const message = buildStatusMessage(
                currentOrder.order_number,
                status,
                currentOrder.service_type,
                data.lalamove_tracking_url || undefined
              );
              await sendTextMessage(messengerLink.psid, message, fbConfig.page_access_token);
            }
          }
        } catch (err) {
          console.error('Failed to send Messenger status notification:', err);
        }
      })();
    }

    // Format order
    const order: Order = {
      id: data.id,
      order_number: data.order_number,
      customer_name: data.customer_name,
      contact_number: data.contact_number,
      service_type: data.service_type as 'dine-in' | 'pickup' | 'delivery',
      address: data.address,
      landmark: data.landmark,
      pickup_time: data.pickup_time,
      party_size: data.party_size,
      dine_in_time: data.dine_in_time,
      payment_method: data.payment_method,
      reference_number: data.reference_number,
      status: data.status as OrderStatus,
      total: Number(data.total),
      notes: data.notes,
      customer_ip: data.customer_ip,
      created_at: data.created_at,
      updated_at: data.updated_at,
      completed_at: data.completed_at,
      delivery_fee: data.delivery_fee ? Number(data.delivery_fee) : null,
      lalamove_quotation_id: data.lalamove_quotation_id,
      lalamove_order_id: data.lalamove_order_id,
      lalamove_status: data.lalamove_status,
      lalamove_tracking_url: data.lalamove_tracking_url,
      customer_id: data.customer_id ?? null,
      messenger_psid: data.messenger_psid ?? null,
      messenger_name: data.messenger_name ?? null,
      order_items: (data.order_items as any[])?.map((item: any) => ({
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

    return NextResponse.json({ order }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/orders/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
