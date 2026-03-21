'use client';

import { useState, useEffect, useCallback } from 'react';
import { getKnowledgeEntries } from '@/actions/ai';
import type { KnowledgeRow } from '@/types';

export function useKnowledge() {
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ source?: string; category?: string; search?: string }>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getKnowledgeEntries(page, filters);
    if (result.success) {
      setRows(result.data.rows);
      setTotal(result.data.total);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { rows, loading, page, setPage, total, filters, setFilters, refetch: fetchData };
}
