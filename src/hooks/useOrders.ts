import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Branch, Order, OrderFilters, OrderStats, OrderStatus, CartItem } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface CreateOrderOptions {
  address?: string;
  landmark?: string;
  pickupTime?: string;
  partySize?: number;
  dineInTime?: string;
  referenceNumber?: string;
  notes?: string;
  deliveryFee?: number;
  lalamoveQuotationId?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  branchId?: string;
  branch?: Branch;
}

interface UseOrdersOptions {
  admin?: boolean;
}

export const useOrders = ({ admin = false }: UseOrdersOptions = {}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentFiltersRef = useRef<OrderFilters | undefined>(undefined);

  const fetchOrders = useCallback(async (filters?: OrderFilters) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      setLoading(true);
      setError(null);

      // Build query string
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.service_type) params.append('service_type', filters.service_type);
      if (filters?.date_from) params.append('date_from', filters.date_from);
      if (filters?.date_to) params.append('date_to', filters.date_to);
      if (filters?.search) params.append('search', filters.search);

      const queryString = params.toString();
      const url = `/api/orders${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch orders' }));
        throw new Error(errorData.error || 'Failed to fetch orders');
      }

      const data = await response.json();
      setOrders(data.orders || []);
      currentFiltersRef.current = filters;
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [admin]);

  const fetchOrderById = async (id: string): Promise<Order | null> => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await fetch(`/api/orders/${id}`, { credentials: 'include' });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch order' }));
        throw new Error(errorData.error || 'Failed to fetch order');
      }

      const data = await response.json();
      return data.order || null;
    } catch (err) {
      console.error('Error fetching order:', err);
      throw err;
    }
  };

  const createOrder = async (
    cartItems: CartItem[],
    customerName: string,
    contactNumber: string,
    serviceType: 'dine-in' | 'pickup' | 'delivery',
    paymentMethod: string,
    total: number,
    options?: CreateOrderOptions
  ): Promise<Order> => {
    try {
      // Create order via API
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cartItems,
          customerName,
          contactNumber,
          serviceType,
          paymentMethod,
          total,
          options
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create order' }));
        throw new Error(errorData.error || 'Failed to create order');
      }

      const data = await response.json();
      const order = data.order;

      // Refresh orders list
      if (admin) {
        await fetchOrders(currentFiltersRef.current);
      }

      return order;
    } catch (err) {
      console.error('Error creating order:', err);
      throw err;
    }
  };

  const updateOrderStatus = async (id: string, status: OrderStatus): Promise<void> => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update order' }));
        throw new Error(errorData.error || 'Failed to update order');
      }

      // Refresh orders list (non-blocking - don't wait for it)
      fetchOrders(currentFiltersRef.current).catch(err => {
        console.error('Error refreshing orders after update:', err);
      });
    } catch (err) {
      console.error('Error updating order status:', err);
      throw err;
    }
  };

  const bulkUpdateStatus = async (ids: string[], status: OrderStatus): Promise<void> => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await fetch('/api/orders/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ ids, status }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update orders' }));
        throw new Error(errorData.error || 'Failed to update orders');
      }

      // Refresh orders list (non-blocking - don't wait for it)
      fetchOrders(currentFiltersRef.current).catch(err => {
        console.error('Error refreshing orders after bulk update:', err);
      });
    } catch (err) {
      console.error('Error bulk updating order status:', err);
      throw err;
    }
  };

  const getOrderStats = async (): Promise<OrderStats> => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await fetch('/api/orders/stats', { credentials: 'include' });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch stats' }));
        throw new Error(errorData.error || 'Failed to fetch stats');
      }

      const data = await response.json();
      return data.stats;
    } catch (err) {
      console.error('Error fetching order stats:', err);
      throw err;
    }
  };

  // Set up real-time subscription for live updates
  useEffect(() => {
    let isMounted = true;

    if (!admin) {
      setLoading(false);
      return () => {
        isMounted = false;
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }

    // Initial fetch
    if (isMounted) {
      void fetchOrders();
    }

    // Set up real-time subscription
    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        async (payload) => {
          if (!isMounted) return;
          console.log('Order change received:', payload.eventType, payload.new);

          // Refetch orders to get updated data with order_items
          if (currentFiltersRef.current) {
            await fetchOrders(currentFiltersRef.current);
          } else {
            await fetchOrders();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items'
        },
        async (payload) => {
          if (!isMounted) return;
          console.log('Order item change received:', payload.eventType);

          // Refetch orders when order items change
          if (currentFiltersRef.current) {
            await fetchOrders(currentFiltersRef.current);
          } else {
            await fetchOrders();
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    channelRef.current = channel;

    // Cleanup subscription on unmount
    return () => {
      isMounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [admin, fetchOrders]);

  return {
    orders,
    loading,
    error,
    fetchOrders,
    fetchOrderById,
    createOrder,
    updateOrderStatus,
    bulkUpdateStatus,
    getOrderStats,
    refetch: () => fetchOrders(currentFiltersRef.current)
  };
};
