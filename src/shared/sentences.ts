export interface Span {
  start: number;
  end: number;
}

// Kokoro truncates input past ~510 phoneme tokens, which is roughly one per character.
export const MAX_SENTENCE_CHARS = 300;

const SPEAKABLE = /[\p{L}\p{N}]/u;
const CLAUSE_BREAK = /[,;:–—)]\s/g;

const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const wordSegmenter = new Intl.Segmenter("en", { granularity: "word" });

function trimmed(text: string, { start, end }: Span): Span {
  while (start < end && text[start]!.trim() === "") start++;
  while (end > start && text[end - 1]!.trim() === "") end--;
  return { start, end };
}

function breakPoint(text: string, start: number): number {
  const window = text.slice(start, start + MAX_SENTENCE_CHARS);
  const earliest = MAX_SENTENCE_CHARS / 2;
  let clause = -1;
  for (const match of window.matchAll(CLAUSE_BREAK)) {
    if (match.index >= earliest) clause = match.index + 1;
  }
  if (clause !== -1) return start + clause;
  const space = window.lastIndexOf(" ");
  return start + (space >= earliest ? space : MAX_SENTENCE_CHARS);
}

function splitLong(text: string, span: Span): Span[] {
  const pieces: Span[] = [];
  let start = span.start;
  while (span.end - start > MAX_SENTENCE_CHARS) {
    const cut = breakPoint(text, start);
    pieces.push(trimmed(text, { start, end: cut }));
    start = cut;
  }
  pieces.push(trimmed(text, { start, end: span.end }));
  return pieces;
}

export function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const { segment, index } of sentenceSegmenter.segment(text)) {
    const sentence = trimmed(text, { start: index, end: index + segment.length });
    for (const piece of splitLong(text, sentence)) {
      if (SPEAKABLE.test(text.slice(piece.start, piece.end))) spans.push(piece);
    }
  }
  return spans;
}

export function wordSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const { segment, index, isWordLike } of wordSegmenter.segment(text)) {
    if (isWordLike) spans.push({ start: index, end: index + segment.length });
  }
  return spans;
}
