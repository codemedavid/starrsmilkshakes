export interface ChunkResult {
  chunk_index: number;
  content: string;
  section_header?: string;
}

const TARGET_MIN = 500;
const TARGET_MAX = 800;
const ABSOLUTE_MAX = 1200;
const MERGE_MIN = 100;
const OVERLAP = 50;

const HEADER_PATTERNS = [
  /^#{1,6}\s+(.+)$/,
  /^\*\*(.+)\*\*$/,
  /^([A-Z][A-Z\s]{4,})$/,
];

const HEADER_MAX_LEN = 100;

function detectHeader(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length > HEADER_MAX_LEN) return null;
  for (const pattern of HEADER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function splitAtSentence(text: string, maxLen: number): [string, string] {
  if (text.length <= maxLen) return [text, ''];

  const sub = text.slice(0, maxLen);
  const lastPeriod = sub.lastIndexOf('. ');
  const lastQuestion = sub.lastIndexOf('? ');
  const lastExclaim = sub.lastIndexOf('! ');
  const splitAt = Math.max(lastPeriod, lastQuestion, lastExclaim);

  if (splitAt > MERGE_MIN) {
    return [text.slice(0, splitAt + 1).trim(), text.slice(splitAt + 1).trim()];
  }

  const lastSpace = sub.lastIndexOf(' ');
  if (lastSpace > MERGE_MIN) {
    return [text.slice(0, lastSpace).trim(), text.slice(lastSpace).trim()];
  }

  return [text.slice(0, maxLen).trim(), text.slice(maxLen).trim()];
}

export function smartChunk(text: string): ChunkResult[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/);
  const rawChunks: { content: string; header?: string }[] = [];
  let currentChunk = '';
  let currentHeader: string | undefined;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const firstLine = trimmed.split('\n')[0];
    const detectedHeader = detectHeader(firstLine);

    if (detectedHeader) {
      if (currentChunk.length >= MERGE_MIN) {
        rawChunks.push({ content: currentChunk.trim(), header: currentHeader });
        currentChunk = '';
      }
      currentHeader = detectedHeader;
      const rest = trimmed.split('\n').slice(1).join('\n').trim();
      if (rest) {
        currentChunk += (currentChunk ? '\n\n' : '') + rest;
      }
      continue;
    }

    const wouldBe = currentChunk
      ? currentChunk.length + 2 + trimmed.length
      : trimmed.length;

    if (wouldBe <= TARGET_MAX) {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    } else if (currentChunk.length >= TARGET_MIN) {
      rawChunks.push({ content: currentChunk.trim(), header: currentHeader });
      currentChunk = trimmed;
      currentHeader = undefined;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    }
  }

  if (currentChunk.trim()) {
    rawChunks.push({ content: currentChunk.trim(), header: currentHeader });
  }

  const splitChunks: { content: string; header?: string }[] = [];
  for (const chunk of rawChunks) {
    if (chunk.content.length <= ABSOLUTE_MAX) {
      splitChunks.push(chunk);
    } else {
      let remaining = chunk.content;
      let first = true;
      while (remaining.length > 0) {
        const [piece, rest] = splitAtSentence(remaining, TARGET_MAX);
        splitChunks.push({
          content: piece,
          header: first ? chunk.header : undefined,
        });
        remaining = rest;
        first = false;
      }
    }
  }

  const merged: { content: string; header?: string }[] = [];
  for (const chunk of splitChunks) {
    if (
      chunk.content.length < MERGE_MIN &&
      merged.length > 0 &&
      !chunk.header
    ) {
      merged[merged.length - 1].content += '\n\n' + chunk.content;
    } else {
      merged.push(chunk);
    }
  }

  const results: ChunkResult[] = [];
  for (let i = 0; i < merged.length; i++) {
    let content = merged[i].content;

    if (i > 0 && OVERLAP > 0) {
      const prevContent = merged[i - 1].content;
      const overlapText = prevContent.slice(-OVERLAP);
      content = overlapText + content;
    }

    results.push({
      chunk_index: i,
      content,
      section_header: merged[i].header,
    });
  }

  return results;
}
