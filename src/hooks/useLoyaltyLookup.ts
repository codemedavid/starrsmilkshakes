'use client';

import { useState, useCallback } from 'react';
import { lookupCard, redeemReward, linkOrderToCard } from '@/actions/loyalty';

type ActionResult = { success: boolean; error?: string; data?: any };

export function useLoyaltyLookup() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    const result: ActionResult = await lookupCard(q);
    if (result.success) {
      setResults(result.data || []);
    } else {
      setError(result.error || 'Search failed');
    }
    setSearching(false);
  }, []);

  const redeem = useCallback(
    async (redemptionId: string, branchId: string): Promise<ActionResult> => {
      const result = await redeemReward(redemptionId, branchId);
      if (result.success && query) {
        await search(query);
      }
      return result;
    },
    [query, search],
  );

  const creditOrder = useCallback(
    async (orderId: string, cardId: string): Promise<ActionResult> => {
      const result = await linkOrderToCard(orderId, cardId);
      if (result.success && query) {
        await search(query);
      }
      return result;
    },
    [query, search],
  );

  return { query, setQuery, results, search, searching, error, redeem, creditOrder };
}
