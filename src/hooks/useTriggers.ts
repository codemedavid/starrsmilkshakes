'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTriggers } from '@/actions/ai';
import type { ChatTrigger } from '@/types';

export function useTriggers() {
  const [triggers, setTriggers] = useState<ChatTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ search?: string }>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getTriggers(page, filters);
    if (result.success) {
      setTriggers(result.data.triggers);
      setTotal(result.data.total);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { triggers, loading, page, setPage, total, filters, setFilters, refetch: fetchData };
}
