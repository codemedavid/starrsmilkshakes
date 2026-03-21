import { describe, it, expect } from 'vitest';
import { knowledgeEntrySchema, faqEntrySchema, triggerSchema } from '@/lib/validation';

describe('knowledgeEntrySchema', () => {
  it('accepts valid input', () => {
    const result = knowledgeEntrySchema.safeParse({
      title: 'Refund Policy',
      content: 'We offer full refunds within 30 minutes.',
      category: 'Policies',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = knowledgeEntrySchema.safeParse({
      title: '',
      content: 'Some content',
    });
    expect(result.success).toBe(false);
  });

  it('strips HTML from title', () => {
    const result = knowledgeEntrySchema.safeParse({
      title: '<script>alert("xss")</script>Refund Policy',
      content: 'Content here',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('alert("xss")Refund Policy');
    }
  });
});

describe('faqEntrySchema', () => {
  it('accepts valid input', () => {
    const result = faqEntrySchema.safeParse({
      question: 'What are your hours?',
      answer: 'We are open 10am-9pm daily.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing answer', () => {
    const result = faqEntrySchema.safeParse({
      question: 'What are your hours?',
    });
    expect(result.success).toBe(false);
  });
});

describe('triggerSchema', () => {
  it('accepts valid contains trigger', () => {
    const result = triggerSchema.safeParse({
      name: 'Store Hours',
      patterns: ['hours', 'open', 'close'],
      match_type: 'contains',
      response: 'We are open 10am-9pm daily!',
      priority: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty patterns array', () => {
    const result = triggerSchema.safeParse({
      name: 'Test',
      patterns: [],
      match_type: 'exact',
      response: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid match_type', () => {
    const result = triggerSchema.safeParse({
      name: 'Test',
      patterns: ['hello'],
      match_type: 'fuzzy',
      response: 'Hi',
    });
    expect(result.success).toBe(false);
  });
});
