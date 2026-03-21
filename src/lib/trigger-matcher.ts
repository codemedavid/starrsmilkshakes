import safeRegex from 'safe-regex';
import type { ChatTrigger } from '@/types';
import { supabaseServer } from '@/lib/supabase-server';

export function matchTrigger(
  text: string,
  triggers: ChatTrigger[]
): { matched: boolean; response?: string } {
  const normalizedText = text.toLowerCase().trim();

  for (const trigger of triggers) {
    for (const pattern of trigger.patterns) {
      const normalizedPattern = pattern.toLowerCase().trim();
      let matched = false;

      switch (trigger.match_type) {
        case 'exact':
          matched = normalizedText === normalizedPattern;
          break;
        case 'contains':
          matched = normalizedText.includes(normalizedPattern);
          break;
        case 'regex':
          try {
            matched = new RegExp(normalizedPattern, 'i').test(normalizedText);
          } catch {
            matched = false;
          }
          break;
      }

      if (matched) return { matched: true, response: trigger.response };
    }
  }

  return { matched: false };
}

export function validateRegexPattern(
  pattern: string
): { valid: true } | { valid: false; error: string } {
  try {
    new RegExp(pattern);
  } catch (e: any) {
    return { valid: false, error: `Invalid regex syntax: ${e.message}` };
  }

  if (!safeRegex(pattern)) {
    return {
      valid: false,
      error: 'Pattern is unsafe — it could cause catastrophic backtracking. Simplify the pattern.',
    };
  }

  return { valid: true };
}

export async function checkTriggers(
  text: string
): Promise<{ matched: boolean; response?: string }> {
  const { data: triggers } = await supabaseServer
    .from('chat_triggers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (!triggers || triggers.length === 0) return { matched: false };

  return matchTrigger(text, triggers as ChatTrigger[]);
}
