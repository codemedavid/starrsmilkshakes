export interface MenuItemRow {
  id: string;
  name: string;
  base_price: number;
}

export interface MatchResult {
  item: MenuItemRow;
  confidence: number;
}

const MIN_CONFIDENCE = 0.3;

export function fuzzyMatchMenuItem(
  query: string,
  items: MenuItemRow[]
): MatchResult | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  let best: MatchResult | null = null;

  for (const item of items) {
    const name = item.name.toLowerCase();
    let confidence = 0;

    // Exact match
    if (name === q) {
      confidence = 1.0;
    }
    // Query is substring of name or name is substring of query
    else if (name.includes(q)) {
      // Check if query matches a whole word in the name for a higher base score
      const nameWords = name.split(/\s+/);
      const isWholeWord = nameWords.some((nw) => nw === q);
      const base = isWholeWord ? 0.7 : 0.8 * (q.length / name.length);
      confidence = Math.max(base, 0.8 * (q.length / name.length));
    } else if (q.includes(name)) {
      confidence = 0.7 * (name.length / q.length);
    }
    // Word overlap scoring
    else {
      const queryWords = q.split(/\s+/);
      const nameWords = name.split(/\s+/);
      let matchedWords = 0;
      for (const qw of queryWords) {
        if (nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))) {
          matchedWords++;
        }
      }
      if (matchedWords > 0) {
        // Use query word count as denominator -- all query words matching is high confidence
        confidence = 0.6 * (matchedWords / queryWords.length);
      }
    }

    // Levenshtein fallback for typos
    if (confidence < 0.5) {
      const dist = levenshtein(q, name);
      const maxLen = Math.max(q.length, name.length);
      const similarity = 1 - dist / maxLen;
      if (similarity > confidence) {
        confidence = similarity * 0.8; // Scale down Levenshtein matches
      }
    }

    if (confidence > (best?.confidence ?? 0)) {
      best = { item, confidence };
    }
  }

  if (!best || best.confidence < MIN_CONFIDENCE) return null;
  return best;
}

export function fuzzyMatchMenuItems(
  queries: { name: string; size?: string; quantity: number }[],
  items: MenuItemRow[]
): { matched: (MatchResult & { size?: string; quantity: number })[]; unmatched: string[] } {
  const matched: (MatchResult & { size?: string; quantity: number })[] = [];
  const unmatched: string[] = [];

  for (const q of queries) {
    const result = fuzzyMatchMenuItem(q.name, items);
    if (result && result.confidence >= 0.5) {
      matched.push({ ...result, size: q.size, quantity: q.quantity });
    } else {
      unmatched.push(q.name);
    }
  }

  return { matched, unmatched };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}
