import type { SiteSettings, Branch } from '../types';

type DeliveryCoordinates = { lat: number; lng: number };

export interface DeliveryStoreConfig {
  market: string;
  serviceType: string;
  sandbox: boolean;
  storeName: string;
  storePhone: string;
  storeAddress: string;
  storeLatitude: number;
  storeLongitude: number;
}

export interface DeliveryQuote {
  quotationId: string;
  price: number;
  currency: string;
  expiresAt: Date;
}

export interface DeliveryOrderResult {
  orderId: string;
  status: string;
  shareLink: string;
  driverId?: string | null;
}

const FUNCTION_BASE_URL = process.env.NEXT_PUBLIC_LALAMOVE_FUNCTION_URL;

const getProxyBase = () => FUNCTION_BASE_URL ?? '/api/lalamove';

const buildFunctionUrl = (path: string) => {
  const base = getProxyBase();
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  const cleanBase = base.replace(/\/$/, '');
  return `${cleanBase}${trimmedPath}`;
};

const buildProxyHeaders = () => {
  return {
    'Content-Type': 'application/json',
  };
};

const ensureSuccess = async (response: Response) => {
  if (response.ok) {
    return response.json();
  }
  const errorText = await response.text();
  throw new Error(errorText || 'Delivery proxy request failed');
};

const readEnvNumber = (input?: string) => {
  if (!input) return undefined;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const buildLalamoveConfig = (settings: SiteSettings | null, branch: Branch | null = null): DeliveryStoreConfig | null => {
  if (!settings) return null;

  const market = settings.lalamove_market?.trim();
  const serviceType = settings.lalamove_service_type?.trim();
  const sandboxFlag = settings.lalamove_sandbox?.trim().toLowerCase() !== 'false';

  // Use branch details if provided, otherwise fallback to settings
  const storeName = branch ? branch.name : settings.lalamove_store_name?.trim();
  const storePhone = branch ? branch.phone : settings.lalamove_store_phone?.trim();
  const storeAddress = branch ? branch.address : settings.lalamove_store_address?.trim();
  const storeLatitude = branch ? readEnvNumber(branch.latitude) : readEnvNumber(settings.lalamove_store_latitude ?? undefined);
  const storeLongitude = branch ? readEnvNumber(branch.longitude) : readEnvNumber(settings.lalamove_store_longitude ?? undefined);

  if (
    !market ||
    !serviceType ||
    !storeName ||
    !storePhone ||
    !storeAddress ||
    storeLatitude === undefined ||
    storeLongitude === undefined
  ) {
    return null;
  }

  return {
    market,
    serviceType,
    sandbox: sandboxFlag === undefined ? true : sandboxFlag,
    storeName,
    storePhone,
    storeAddress,
    storeLatitude,
    storeLongitude,
  };
};

export const fetchDeliveryQuotation = async (
  deliveryAddress: string,
  deliveryCoordinates: DeliveryCoordinates,
  config: DeliveryStoreConfig
): Promise<DeliveryQuote> => {
  const response = await fetch(buildFunctionUrl('/quote'), {
    method: 'POST',
    headers: buildProxyHeaders(),
    body: JSON.stringify({
      deliveryAddress,
      deliveryLat: deliveryCoordinates.lat,
      deliveryLng: deliveryCoordinates.lng,
      market: config.market,
      serviceType: config.serviceType,
      sandbox: config.sandbox,
      storeName: config.storeName,
      storePhone: config.storePhone,
      storeAddress: config.storeAddress,
      storeLatitude: config.storeLatitude,
      storeLongitude: config.storeLongitude
    })
  });

  const data = await ensureSuccess(response);
  return {
    quotationId: data.quotationId,
    price: Number(data.price),
    currency: data.currency,
    expiresAt: new Date(data.expiresAt)
  };
};

export const createDeliveryOrder = async (
  quotationId: string,
  recipientName: string,
  recipientPhone: string,
  config: DeliveryStoreConfig,
  metadata?: Record<string, unknown>
): Promise<DeliveryOrderResult> => {
  const response = await fetch(buildFunctionUrl('/order'), {
    method: 'POST',
    headers: buildProxyHeaders(),
    body: JSON.stringify({
      quotationId,
      recipientName,
      recipientPhone,
      market: config.market,
      sandbox: config.sandbox,
      storeName: config.storeName,
      storePhone: config.storePhone,
      metadata
    })
  });

  const data = await ensureSuccess(response);
  return {
    orderId: data.orderId,
    status: data.status,
    shareLink: data.shareLink,
    driverId: data.driverId
  };
};
