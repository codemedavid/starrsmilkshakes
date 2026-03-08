import { useCallback, useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-api';
import { supabase } from '../lib/supabase';

export interface PaymentMethod {
  id: string;
  name: string;
  account_number: string;
  account_name: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface UsePaymentMethodsOptions {
  admin?: boolean;
}

export const usePaymentMethods = ({ admin = false }: UsePaymentMethodsOptions = {}) => {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);

      if (admin) {
        const response = await adminFetch('/api/admin/payment-methods');
        const data = await parseApiResponse<{ paymentMethods: PaymentMethod[] }>(response);
        setPaymentMethods(data.paymentMethods || []);
        setError(null);
        return;
      }
      
      const { data, error: fetchError } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;

      setPaymentMethods(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching payment methods:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch payment methods');
    } finally {
      setLoading(false);
    }
  }, [admin]);

  const fetchAllPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);

      if (admin) {
        const response = await adminFetch('/api/admin/payment-methods');
        const data = await parseApiResponse<{ paymentMethods: PaymentMethod[] }>(response);
        setPaymentMethods(data.paymentMethods || []);
        setError(null);
        return;
      }
      
      const { data, error: fetchError } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;

      setPaymentMethods(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching all payment methods:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch payment methods');
    } finally {
      setLoading(false);
    }
  }, [admin]);

  const addPaymentMethod = async (method: Omit<PaymentMethod, 'created_at' | 'updated_at'>) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch('/api/admin/payment-methods', {
        method: 'POST',
        body: JSON.stringify(method),
      });
      const data = await parseApiResponse<{ paymentMethod: PaymentMethod }>(response);

      await fetchAllPaymentMethods();
      return data.paymentMethod;
    } catch (err) {
      console.error('Error adding payment method:', err);
      throw err;
    }
  };

  const updatePaymentMethod = async (id: string, updates: Partial<PaymentMethod>) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch(`/api/admin/payment-methods/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      await parseApiResponse<{ paymentMethod: PaymentMethod }>(response);

      await fetchAllPaymentMethods();
    } catch (err) {
      console.error('Error updating payment method:', err);
      throw err;
    }
  };

  const deletePaymentMethod = async (id: string) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch(`/api/admin/payment-methods/${id}`, {
        method: 'DELETE',
      });
      await parseApiResponse<{ success: boolean }>(response);

      await fetchAllPaymentMethods();
    } catch (err) {
      console.error('Error deleting payment method:', err);
      throw err;
    }
  };

  const reorderPaymentMethods = async (reorderedMethods: PaymentMethod[]) => {
    try {
      if (!admin) {
        throw new Error('Admin access required');
      }

      for (const [index, method] of reorderedMethods.entries()) {
        const response = await adminFetch(`/api/admin/payment-methods/${method.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sort_order: index + 1 }),
        });
        await parseApiResponse<{ paymentMethod: PaymentMethod }>(response);
      }

      await fetchAllPaymentMethods();
    } catch (err) {
      console.error('Error reordering payment methods:', err);
      throw err;
    }
  };

  useEffect(() => {
    void fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  return {
    paymentMethods,
    loading,
    error,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    reorderPaymentMethods,
    refetch: fetchPaymentMethods,
    refetchAll: fetchAllPaymentMethods
  };
};
