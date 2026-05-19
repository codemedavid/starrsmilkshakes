import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AdminPaymentMethod } from '../types';

export type { AdminPaymentMethod };
/** Alias kept for back-compat with imports that use `PaymentMethod` from this hook. */
export type PaymentMethod = AdminPaymentMethod;

/**
 * Fetch active payment methods, optionally filtered by branch.
 * When branchId is provided, returns methods assigned to that branch
 * plus any global methods (branch_id IS NULL).
 */
export const usePaymentMethods = (branchId?: string | null) => {
  const [paymentMethods, setPaymentMethods] = useState<AdminPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('payment_methods')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (branchId) {
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setPaymentMethods(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching payment methods:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch payment methods');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

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
