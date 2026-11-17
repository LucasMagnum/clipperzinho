import type { Span } from "./sentences";

// Kokoro returns no word timestamps in the browser, so each word gets a share of the
// clip proportional to a rough spoken-length weight. The constants are hand-tuned
// guesses (digits are read out long, punctuation adds a pause), not measurements.
const DIGIT_EXTRA = 2;
const WORD_GAP = 1;
const CLAUSE_PAUSE = 3;
const SENTENCE_PAUSE = 6;

function weight(text: string, word: Span, nextStart: number): number {
  const token = text.slice(word.start, word.end);
  const digits = token.match(/\d/g)?.length ?? 0;
  const trailing = text.slice(word.end, nextStart);
  const pause = /[.!?]/.test(trailing) ? SENTENCE_PAUSE : /[,;:–—()]/.test(trailing) ? CLAUSE_PAUSE : 0;
  return token.length + digits * DIGIT_EXTRA + WORD_GAP + pause;
}

/** Cumulative fraction of the clip at which each word ends. */
export function wordBoundaries(text: string, words: Span[]): number[] {
  const weights = words.map((word, i) => weight(text, word, words[i + 1]?.start ?? text.length));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let elapsed = 0;
  return weights.map((value) => (elapsed += value) / total);
}

export function wordIndexAt(boundaries: number[], fraction: number): number {
  const index = boundaries.findIndex((end) => fraction < end);
  return index === -1 ? boundaries.length - 1 : index;
}
