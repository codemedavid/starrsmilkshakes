import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, isSameOriginRequest, isTrustedInternalRequest } from '@/lib/admin-auth';
import { checkServerRateLimit } from '@/lib/server-rate-limit';
import { getClientIP } from '@/lib/supabase-server';

type DeliveryCoordinates = { lat: number; lng: number };

type DeliveryStoreConfig = {
  market: string;
  serviceType: string;
  sandbox: boolean;
  storeName: string;
  storePhone: string;
  storeAddress: string;
  storeLatitude: number;
  storeLongitude: number;
};

const API_BASE_URL = 'https://rest.lalamove.com/v3';
const API_SANDBOX_URL = 'https://rest.sandbox.lalamove.com/v3';

const respond = (body: unknown, status = 200) => NextResponse.json(body, { status });

const getEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env var ${key}`);
  }
  return value;
};

const signPayload = async (method: string, path: string, body: string, secret: string) => {
  const timestamp = new Date().getTime().toString();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const message = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signature = Buffer.from(signatureBuffer).toString('hex');
  return { timestamp, signature };
};

const getLanguageForMarket = (market: string) => {
  const map: Record<string, string> = {
    HK: 'en_HK',
    SG: 'en_SG',
    TH: 'th_TH',
    PH: 'en_PH',
    TW: 'zh_TW',
    MY: 'ms_MY',
    VN: 'vi_VN'
  };
  return map[market] || 'en_US';
};

const createStops = (
  config: DeliveryStoreConfig,
  deliveryAddress: string,
  deliveryCoordinates: DeliveryCoordinates,
  language: string
) => [
    {
      coordinates: {
        lat: config.storeLatitude.toString(),
        lng: config.storeLongitude.toString()
      },
      address: config.storeAddress
    },
    {
      coordinates: {
        lat: deliveryCoordinates.lat.toString(),
        lng: deliveryCoordinates.lng.toString()
      },
      address: deliveryAddress
    }
  ];

const buildUpstreamUrl = (path: string, sandbox: boolean) => {
  const base = sandbox ? API_SANDBOX_URL : API_BASE_URL;
  return `${base}${path}`;
};

const proxyRequest = async (
  path: string,
  payload: Record<string, unknown>,
  market: string,
  sandbox: boolean,
  method: string = 'POST'
) => {
  const secret = getEnv('LALAMOVE_API_SECRET');
  const apiKey = getEnv('LALAMOVE_API_KEY');

  const bodyString = method === 'GET' ? '' : JSON.stringify(payload);
  // Lalamove expects the path in the signature to include the version (e.g., /v3/quotations)
  const signaturePath = `/v3${path}`;

  const { signature, timestamp } = await signPayload(method, signaturePath, bodyString, secret);
  const upstreamUrl = buildUpstreamUrl(path, sandbox);

  const upstreamResponse = await fetch(upstreamUrl, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Market': market,
      Authorization: `hmac ${apiKey}:${timestamp}:${signature}`,
      'Accept': 'application/json',
    },
    ...(method !== 'GET' && { body: bodyString })
  });

  const responseBody = await upstreamResponse.text();
  if (!upstreamResponse.ok) {
    console.error('Lalamove upstream error', {
      status: upstreamResponse.status,
      body: responseBody,
      url: upstreamUrl,
      payload
    });
    return {
      error: responseBody || 'Lalamove upstream error',
      status: upstreamResponse.status
    };
  }

  return { data: JSON.parse(responseBody) };
};

const buildConfig = (body: Record<string, unknown> | null): DeliveryStoreConfig | null => {
  if (!body) return null;
  const market = String(body.market || '');
  const serviceType = String(body.serviceType || '');
  const storeName = String(body.storeName || '');
  const storePhone = String(body.storePhone || '');
  const storeAddress = String(body.storeAddress || '');
  const storeLatitude = Number(body.storeLatitude);
  const storeLongitude = Number(body.storeLongitude);
  const sandbox = Boolean(body.sandbox);

  if (
    !market ||
    !serviceType ||
    !storeName ||
    !storePhone ||
    !storeAddress ||
    Number.isNaN(storeLatitude) ||
    Number.isNaN(storeLongitude)
  ) {
    return null;
  }

  return {
    market,
    serviceType,
    sandbox,
    storeName,
    storePhone,
    storeAddress,
    storeLatitude,
    storeLongitude
  };
};

const handleQuote = async (
  body: Record<string, unknown>,
  config: DeliveryStoreConfig
) => {
  const deliveryAddress = String(body.deliveryAddress || '');
  const deliveryLat = Number(body.deliveryLat);
  const deliveryLng = Number(body.deliveryLng);

  if (!deliveryAddress || Number.isNaN(deliveryLat) || Number.isNaN(deliveryLng)) {
    return respond({ error: 'Missing delivery fields' }, 400);
  }

  const language = getLanguageForMarket(config.market);
  const quotePayload = {
    data: {
      serviceType: config.serviceType,
      language,
      stops: createStops(
        config,
        deliveryAddress,
        { lat: deliveryLat, lng: deliveryLng },
        language
      ),
      item: {
        quantity: '1',
        weight: 'LESS_THAN_3_KG',
        categories: ['FOOD_DELIVERY'],
        handlingInstructions: ['KEEP_UPRIGHT']
      }
    }
  };

  const result = await proxyRequest('/quotations', quotePayload, config.market, config.sandbox);
  if ('error' in result) {
    return respond({ error: result.error }, result.status || 500);
  }

  return respond({
    quotationId: result.data.data?.quotationId,
    price: result.data.data?.priceBreakdown?.total,
    currency: result.data.data?.priceBreakdown?.currency,
    expiresAt: result.data.data?.expiresAt
  });
};

const handleOrder = async (
  body: Record<string, unknown>,
  config: DeliveryStoreConfig
) => {
  const quotationId = String(body.quotationId || '');
  const recipientName = String(body.recipientName || '');
  const recipientPhone = String(body.recipientPhone || '');

  if (!quotationId || !recipientName || !recipientPhone) {
    return respond({ error: 'Missing order fields' }, 400);
  }

  // Normalize phone numbers to e.164 format
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

  // Fetch quotation to get stop IDs (if not provided)
  let senderStopId = body.senderStopId as string | undefined;
  let recipientStopId = body.recipientStopId as string | undefined;
  let quotationScheduleAt: string | undefined = undefined;
  let shouldUseScheduleAt = false;

  if (!senderStopId || !recipientStopId) {
    try {
      // Fetch quotation to get stop IDs
      const quoteResult = await proxyRequest(`/quotations/${quotationId}`, {}, config.market, config.sandbox, 'GET');
      if ('error' in quoteResult) {
        console.error('Failed to fetch quotation:', quoteResult.error);
        return respond({ error: `Failed to fetch quotation: ${quoteResult.error}` }, quoteResult.status || 500);
      }
      const quotation = quoteResult.data?.data || quoteResult.data;
      
      // Log quotation structure for debugging
      console.log('Quotation response structure:', JSON.stringify(quotation, null, 2));
      
      // Check if quotation has expired
      const expiresAt = quotation?.expiresAt;
      const now = new Date();
      
      if (expiresAt) {
        const expirationTime = new Date(expiresAt);
        if (now > expirationTime) {
          console.error('Quotation has expired:', {
            quotationId,
            expiresAt,
            currentTime: now.toISOString(),
            timeDifference: now.getTime() - expirationTime.getTime()
          });
          return respond({ 
            error: `Quotation has expired. Expired at ${expiresAt}. Please request a new quotation.` 
          }, 400);
        }
      }
      
      // Check scheduleAt time if present
      const scheduleAt = quotation?.scheduleAt;
      quotationScheduleAt = scheduleAt;
      if (scheduleAt) {
        const scheduleTime = new Date(scheduleAt);
        const timeDiff = scheduleTime.getTime() - now.getTime();
        const minutesDiff = timeDiff / (1000 * 60);
        
        // If schedule time is in the past but within 10 minutes, treat as immediate delivery
        // This handles cases where Lalamove sets a scheduleAt time that passes quickly
        if (scheduleTime < now) {
          const minutesPast = Math.abs(minutesDiff);
          if (minutesPast <= 10) {
            // Schedule time is in the past but within tolerance - treat as immediate
            console.warn('Quotation schedule time is in the past but within tolerance, treating as immediate delivery:', {
              quotationId,
              scheduleAt,
              currentTime: now.toISOString(),
              minutesPast: minutesPast.toFixed(2)
            });
            shouldUseScheduleAt = false; // Don't include scheduleAt in order payload
          } else {
            // Schedule time is significantly in the past - reject
            console.error('Quotation schedule time is too far in the past:', {
              quotationId,
              scheduleAt,
              currentTime: now.toISOString(),
              minutesPast: minutesPast.toFixed(2)
            });
            return respond({ 
              error: `Quotation schedule time (${scheduleAt}) is too far in the past (${minutesPast.toFixed(0)} minutes). Please request a new quotation for immediate delivery.` 
            }, 400);
          }
        } else {
          // Schedule time is in the future
          const hoursUntilSchedule = timeDiff / (1000 * 60 * 60);
          
          // If schedule time is too far in the future (more than 24 hours), warn but allow
          if (hoursUntilSchedule > 24) {
            console.warn('Quotation schedule time is more than 24 hours away:', {
              quotationId,
              scheduleAt,
              hoursUntilSchedule
            });
          }
          
          // Use the scheduleAt for future scheduled deliveries
          shouldUseScheduleAt = true;
          console.log('Using scheduled quotation:', {
            quotationId,
            scheduleAt,
            hoursUntilSchedule: hoursUntilSchedule.toFixed(2)
          });
        }
      }
      
      // Try different possible response structures
      // Lalamove returns stops with 'stopId' field (not 'id')
      const stops = quotation?.stops || quotation?.data?.stops || [];
      senderStopId = stops[0]?.stopId || stops[0]?.id || '';
      recipientStopId = stops[1]?.stopId || stops[1]?.id || '';
      
      if (!senderStopId || !recipientStopId) {
        console.error('Missing stop IDs in quotation:', {
          quotationId,
          stops,
          quotationStructure: Object.keys(quotation || {})
        });
        return respond({ 
          error: 'Failed to extract stop IDs from quotation. Please check quotation response structure.' 
        }, 500);
      }
    } catch (error) {
      console.error('Error fetching quotation:', error);
      return respond({ error: 'Failed to fetch quotation for stop IDs' }, 500);
    }
  }

  // Normalize all phone numbers
  const normalizedStorePhone = normalizePhone(config.storePhone);
  const normalizedRecipientPhone = normalizePhone(recipientPhone);

  // Build order payload
  const orderPayload: any = {
    data: {
      quotationId,
      sender: {
        stopId: senderStopId,
        name: config.storeName,
        phone: normalizedStorePhone
      },
      recipients: [
        {
          stopId: recipientStopId,
          name: recipientName,
          phone: normalizedRecipientPhone,
          remarks: body.recipientRemarks || ''
        }
      ],
      isPODEnabled: true,
      metadata: body.metadata || {}
    }
  };

  // Only include scheduleAt if it's valid and in the future (not treated as immediate)
  // If scheduleAt is in the past but within tolerance, we omit it to treat as immediate delivery
  if (shouldUseScheduleAt && quotationScheduleAt) {
    orderPayload.data.scheduleAt = quotationScheduleAt;
  }

  // Log payload for debugging (without sensitive data)
  console.log('Lalamove order payload:', {
    quotationId,
    senderStopId,
    recipientStopId,
    senderPhone: normalizedStorePhone,
    recipientPhone: normalizedRecipientPhone
  });

  const result = await proxyRequest('/orders', orderPayload, config.market, config.sandbox);
  if ('error' in result) {
    return respond({ error: result.error }, result.status || 500);
  }

  return respond({
    orderId: result.data.data?.orderId,
    status: result.data.data?.status,
    shareLink: result.data.data?.shareLink,
    driverId: result.data.data?.driverId
  });
};

export const runtime = 'nodejs';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  if (action !== 'quote' && action !== 'order') {
    return respond({ error: 'Action not supported' }, 405);
  }

  const trustedInternalRequest = isTrustedInternalRequest(request);
  const sameOriginRequest = isSameOriginRequest(request);

  if (action === 'quote') {
    if (!sameOriginRequest && !trustedInternalRequest) {
      return respond({ error: 'Same-origin access is required' }, 403);
    }

    const rateLimit = checkServerRateLimit(`lalamove-quote:${getClientIP(request)}`, 15, 5 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many delivery quote requests. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }
  }

  if (action === 'order' && !trustedInternalRequest && !isAdminRequest(request)) {
    return respond({ error: 'Admin authentication required' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (error) {
    return respond({ error: 'Invalid JSON payload' }, 400);
  }

  const config = buildConfig(body);
  if (!config) {
    return respond({ error: 'Invalid delivery store configuration' }, 400);
  }

  if (action === 'quote') {
    return handleQuote(body, config);
  }

  return handleOrder(body, config);
}
