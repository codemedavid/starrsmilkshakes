import { useState, useCallback } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-api';
import type { CustomerProfile, CustomerTag } from '@/types/customer';

export const useCustomer = () => {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/customers/${id}`);
      const data = await parseApiResponse<{ customer: CustomerProfile }>(res);
      setCustomer(data.customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCustomer = useCallback(async (id: string, updates: Partial<{ name: string; email: string | null; phone: string | null; notes: string | null }>) => {
    const res = await adminFetch(`/api/admin/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    const data = await parseApiResponse<{ customer: CustomerProfile }>(res);
    setCustomer(prev => prev ? { ...prev, ...data.customer } : null);
    return data.customer;
  }, []);

  const addTag = useCallback(async (id: string, tag: string) => {
    const res = await adminFetch(`/api/admin/customers/${id}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    });
    const data = await parseApiResponse<{ tag: CustomerTag }>(res);
    setCustomer(prev => prev ? { ...prev, manual_tags: [...prev.manual_tags, data.tag] } : null);
  }, []);

  const removeTag = useCallback(async (customerId: string, tagId: string) => {
    const res = await adminFetch(`/api/admin/customers/${customerId}/tags/${tagId}`, { method: 'DELETE' });
    await parseApiResponse(res);
    setCustomer(prev => prev ? { ...prev, manual_tags: prev.manual_tags.filter(t => t.id !== tagId) } : null);
  }, []);

  return { customer, loading, error, fetchCustomer, updateCustomer, addTag, removeTag };
};
