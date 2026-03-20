import { describe, it, expect } from 'vitest';
import { parseAiResponse } from '../../src/lib/ai-intent-parser';

describe('ai-intent-parser', () => {
  it('parses valid JSON response', () => {
    const raw = '{"intent":"order","data":{"items":[{"name":"Chocolate Shake","size":"Large","quantity":1}],"message":"Great choice!"}}';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('order');
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items![0].name).toBe('Chocolate Shake');
  });

  it('extracts JSON from markdown code fences', () => {
    const raw = '```json\n{"intent":"info","data":{"message":"We are open daily!"}}\n```';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('info');
    expect(result.data.message).toBe('We are open daily!');
  });

  it('extracts first JSON object from mixed text', () => {
    const raw = 'Sure! Here is the answer: {"intent":"browse","data":{"category":"shakes","message":"Check these out!"}} Hope that helps!';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('browse');
  });

  it('falls back to info intent on unparseable response', () => {
    const raw = 'I cannot understand that request.';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('info');
    expect(result.data.message).toBe('I cannot understand that request.');
  });

  it('falls back to info intent on invalid JSON structure', () => {
    const raw = '{"foo":"bar"}';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('info');
    expect(result.data.message).toContain('{');
  });

  it('handles empty string', () => {
    const result = parseAiResponse('');
    expect(result.intent).toBe('info');
    expect(result.data.message).toBe("Sorry, I couldn't process that. What are you craving?");
  });

  it('strips <think> tags from model thinking output', () => {
    const raw = '<think>The user wants a shake...</think>\n{"intent":"order","data":{"items":[{"name":"Chocolate Shake","quantity":1}],"message":"Coming right up!"}}';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('order');
    expect(result.data.items![0].name).toBe('Chocolate Shake');
  });
});
