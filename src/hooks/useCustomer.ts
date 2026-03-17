import { useState, useCallback } from 'react';
import type { CustomerProfile } from '@/types/customer';

export const useCustomer = () => {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}`);
      if (!res.ok) throw new Error('Failed to fetch customer');
      const data = await res.json();
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update customer');
    }
    const data = await res.json();
    setCustomer(prev => prev ? { ...prev, ...data.customer } : null);
    return data.customer;
  }, []);

  const addTag = useCallback(async (id: string, tag: string) => {
    const res = await fetch(`/api/admin/customers/${id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to add tag');
    }
    const data = await res.json();
    setCustomer(prev => prev ? { ...prev, manual_tags: [...prev.manual_tags, data.tag] } : null);
  }, []);

  const removeTag = useCallback(async (customerId: string, tagId: string) => {
    const res = await fetch(`/api/admin/customers/${customerId}/tags/${tagId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove tag');
    setCustomer(prev => prev ? { ...prev, manual_tags: prev.manual_tags.filter(t => t.id !== tagId) } : null);
  }, []);

  return { customer, loading, error, fetchCustomer, updateCustomer, addTag, removeTag };
};
