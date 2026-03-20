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

describe('cleanAiMessage', () => {
  it('strips Filipino instructional text', async () => {
    const { cleanAiMessage } = await import('../../src/lib/ai-intent-parser');
    const msg = "Madali lang po! Sabihin niyo lang kung anong shake gusto niyo";
    expect(cleanAiMessage(msg, 'order')).toBe("Sure! Let me show you our menu 😊");
  });

  it('strips English instructional text', async () => {
    const { cleanAiMessage } = await import('../../src/lib/ai-intent-parser');
    const msg = "Just type what you want to order!";
    expect(cleanAiMessage(msg, 'order')).toBe("Sure! Let me show you our menu 😊");
  });

  it('strips example patterns', async () => {
    const { cleanAiMessage } = await import('../../src/lib/ai-intent-parser');
    const msg = "Halimbawa: 'Order ako ng isang large Ube Shake'";
    expect(cleanAiMessage(msg, 'order')).toBe("Sure! Let me show you our menu 😊");
  });

  it('keeps clean messages untouched', async () => {
    const { cleanAiMessage } = await import('../../src/lib/ai-intent-parser');
    const msg = "We're open 10am to 9pm daily!";
    expect(cleanAiMessage(msg, 'info')).toBe("We're open 10am to 9pm daily!");
  });

  it('returns fallback for empty message', async () => {
    const { cleanAiMessage } = await import('../../src/lib/ai-intent-parser');
    expect(cleanAiMessage('', 'browse')).toBe("Here's what we have! 😊");
  });
});
