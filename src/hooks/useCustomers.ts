import { useState, useCallback } from 'react';
import type { CustomerFilters, CustomerSummary } from '@/types/customer';

export const useCustomers = () => {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async (filters: CustomerFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search)  params.set('search', filters.search);
      if (filters.tag)     params.set('tag', filters.tag);
      if (filters.sort)    params.set('sort', filters.sort);
      if (filters.page)    params.set('page', String(filters.page));
      if (filters.limit)   params.set('limit', String(filters.limit));

      const res = await fetch(`/api/admin/customers?${params}`);
      if (!res.ok) throw new Error('Failed to fetch customers');
      const data = await res.json();
      setCustomers(data.customers);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const createCustomer = useCallback(async (input: { name: string; email?: string; phone?: string; notes?: string }) => {
    const res = await fetch('/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create customer');
    }
    return (await res.json()).customer;
  }, []);

  const deleteCustomer = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/customers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete customer');
  }, []);

  return { customers, total, loading, error, fetchCustomers, createCustomer, deleteCustomer };
};
