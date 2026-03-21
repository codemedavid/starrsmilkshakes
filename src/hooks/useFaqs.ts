'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFaqEntries } from '@/actions/ai';

export function useFaqs() {
  const [faqs, setFaqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ category?: string; search?: string }>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getFaqEntries(page, filters);
    if (result.success) {
      setFaqs(result.data.faqs);
      setTotal(result.data.total);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { faqs, loading, page, setPage, total, filters, setFilters, refetch: fetchData };
}
