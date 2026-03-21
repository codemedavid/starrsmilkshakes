import { describe, it, expect } from 'vitest';
import { smartChunk } from '@/lib/document-chunker';

describe('smartChunk', () => {
  it('returns single chunk for short text', () => {
    const chunks = smartChunk('This is a short paragraph.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('This is a short paragraph.');
    expect(chunks[0].chunk_index).toBe(0);
  });

  it('splits on paragraph boundaries', () => {
    const text = 'A'.repeat(600) + '\n\n' + 'B'.repeat(600);
    const chunks = smartChunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].content).toContain('A');
    expect(chunks[1].content).toContain('B');
  });

  it('detects markdown section headers', () => {
    const text = '# Introduction\n\nThis is the intro paragraph. ' + 'More text. '.repeat(60) +
      '\n\n## Details\n\nThis is the details section. ' + 'More details. '.repeat(60);
    const chunks = smartChunk(text);
    const headerChunk = chunks.find(c => c.section_header === 'Introduction');
    expect(headerChunk).toBeDefined();
  });

  it('merges small chunks with previous', () => {
    const text = 'Normal paragraph here. '.repeat(30) + '\n\nTiny.\n\n' + 'Another paragraph. '.repeat(30);
    const chunks = smartChunk(text);
    const tinyChunk = chunks.find(c => c.content === 'Tiny.');
    expect(tinyChunk).toBeUndefined();
  });

  it('includes overlap between chunks', () => {
    const text = 'Sentence one. '.repeat(50) + '\n\n' + 'Sentence two. '.repeat(50);
    const chunks = smartChunk(text);
    if (chunks.length >= 2) {
      const endOfFirst = chunks[0].content.slice(-50);
      expect(chunks[1].content.startsWith(endOfFirst)).toBe(true);
    }
  });

  it('assigns sequential chunk_index values', () => {
    const text = ('Paragraph content here. '.repeat(40) + '\n\n').repeat(5);
    const chunks = smartChunk(text);
    chunks.forEach((chunk, i) => {
      expect(chunk.chunk_index).toBe(i);
    });
  });
});
