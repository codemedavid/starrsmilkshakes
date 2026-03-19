import { useState, useCallback } from 'react';
import type { CustomerProfile, CustomerTag } from '@/types/customer';

async function parseResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Request failed');
  }
  return data as T;
}

export const useCustomer = () => {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        credentials: 'include',
      });
      const data = await parseResponse<{ customer: CustomerProfile }>(res);
      setCustomer(data.customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCustomer = useCallback(async (id: string, updates: Partial<{ name: string; email: string | null; phone: string | null; notes: string | null }>) => {
    const res = await fetch(`/api/admin/customers/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await parseResponse<{ customer: CustomerProfile }>(res);
    setCustomer(prev => prev ? { ...prev, ...data.customer } : null);
    return data.customer;
  }, []);

  const addTag = useCallback(async (id: string, tag: string) => {
    const res = await fetch(`/api/admin/customers/${id}/tags`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    });
    const data = await parseResponse<{ tag: CustomerTag }>(res);
    setCustomer(prev => prev ? { ...prev, manual_tags: [...prev.manual_tags, data.tag] } : null);
  }, []);

  const removeTag = useCallback(async (customerId: string, tagId: string) => {
    const res = await fetch(`/api/admin/customers/${customerId}/tags/${tagId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    await parseResponse(res);
    setCustomer(prev => prev ? { ...prev, manual_tags: prev.manual_tags.filter(t => t.id !== tagId) } : null);
  }, []);

  return { customer, loading, error, fetchCustomer, updateCustomer, addTag, removeTag };
};
