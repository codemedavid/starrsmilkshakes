'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAiConversationSessions, getAiSessionMessages, getAiStats } from '@/actions/ai';

export function useAiLogs() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ intent?: string; dateFrom?: string; dateTo?: string }>({});

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const result = await getAiConversationSessions(page, filters);
    if (result.success) {
      setSessions(result.data.sessions);
      setTotal(result.data.total);
    }
    setLoading(false);
  }, [page, filters]);

  const fetchStats = useCallback(async () => {
    const result = await getAiStats();
    if (result.success) setStats(result.data);
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchStats();
  }, [fetchSessions, fetchStats]);

  const fetchMessages = async (sessionId: string) => {
    const result = await getAiSessionMessages(sessionId);
    return result.success ? result.data : [];
  };

  return { sessions, stats, loading, page, setPage, total, filters, setFilters, fetchMessages, refetch: fetchSessions };
}
