import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AdminPaymentMethod } from '../types';

export type { AdminPaymentMethod };
/** Alias kept for back-compat with imports that use `PaymentMethod` from this hook. */
export type PaymentMethod = AdminPaymentMethod;

export const usePaymentMethods = () => {
  const [paymentMethods, setPaymentMethods] = useState<AdminPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);

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
  }, []);

  useEffect(() => {
    void fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  return {
    paymentMethods,
    loading,
    error,
    refetch: fetchPaymentMethods,
  };
};
