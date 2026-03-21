import { describe, it, expect, vi } from 'vitest';
import { matchTrigger, validateRegexPattern } from '@/lib/trigger-matcher';
import type { ChatTrigger } from '@/types';

const makeTrigger = (overrides: Partial<ChatTrigger> = {}): ChatTrigger => ({
  id: '1',
  name: 'Test',
  patterns: ['hello'],
  match_type: 'contains',
  response: 'Hi there!',
  priority: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('matchTrigger', () => {
  it('matches contains pattern (case-insensitive)', () => {
    const triggers = [makeTrigger({ patterns: ['hours', 'open'] })];
    const result = matchTrigger('What are your HOURS?', triggers);
    expect(result).toEqual({ matched: true, response: 'Hi there!' });
  });

  it('matches exact pattern', () => {
    const triggers = [makeTrigger({ patterns: ['hi'], match_type: 'exact' })];
    expect(matchTrigger('hi', triggers).matched).toBe(true);
    expect(matchTrigger('hi there', triggers).matched).toBe(false);
  });

  it('matches regex pattern', () => {
    const triggers = [makeTrigger({ patterns: ['\\d+\\s*shakes?'], match_type: 'regex' })];
    expect(matchTrigger('I want 2 shakes', triggers).matched).toBe(true);
    expect(matchTrigger('I want shakes', triggers).matched).toBe(false);
  });

  it('returns first match by priority order', () => {
    const triggers = [
      makeTrigger({ name: 'Low', patterns: ['hello'], priority: 0, response: 'Low priority' }),
      makeTrigger({ name: 'High', patterns: ['hello'], priority: 10, response: 'High priority' }),
    ];
    const sorted = [...triggers].sort((a, b) => b.priority - a.priority);
    const result = matchTrigger('hello', sorted);
    expect(result.response).toBe('High priority');
  });

  it('returns no match when nothing matches', () => {
    const triggers = [makeTrigger({ patterns: ['goodbye'] })];
    expect(matchTrigger('hello', triggers).matched).toBe(false);
  });

  it('handles invalid regex gracefully', () => {
    const triggers = [makeTrigger({ patterns: ['[invalid'], match_type: 'regex' })];
    expect(matchTrigger('test', triggers).matched).toBe(false);
  });
});

describe('validateRegexPattern', () => {
  it('accepts safe regex', () => {
    expect(validateRegexPattern('\\d+\\s+items?')).toEqual({ valid: true });
  });

  it('rejects invalid syntax', () => {
    const result = validateRegexPattern('[unclosed');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('rejects unsafe regex (catastrophic backtracking)', () => {
    const result = validateRegexPattern('(a+)+$');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unsafe');
  });
});
