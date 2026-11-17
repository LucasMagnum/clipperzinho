import { describe, expect, it } from "vitest";
import { MAX_SENTENCE_CHARS, sentenceSpans, wordSpans } from "../src/shared/sentences";

const texts = (text: string) => sentenceSpans(text).map(({ start, end }) => text.slice(start, end));

describe("sentenceSpans", () => {
  it("splits on sentence boundaries and trims whitespace", () => {
    expect(texts("Hello there. How are you?  Fine!")).toEqual(["Hello there.", "How are you?", "Fine!"]);
  });

  it("drops fragments with nothing to pronounce", () => {
    expect(texts("— … ")).toEqual([]);
  });

  it("breaks overlong sentences at a clause boundary without losing text", () => {
    const clause = "the quick brown fox jumps over the lazy dog near the river bank";
    const text = `${Array.from({ length: 8 }, () => clause).join(", ")}.`;
    const pieces = texts(text);

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.length <= MAX_SENTENCE_CHARS)).toBe(true);
    expect(pieces.slice(0, -1).every((piece) => piece.endsWith(","))).toBe(true);
    expect(pieces.join(" ")).toBe(text);
  });

  it("hard-cuts text that has no spaces at all", () => {
    const pieces = texts("a".repeat(MAX_SENTENCE_CHARS * 2 + 10));
    expect(pieces.map((piece) => piece.length)).toEqual([MAX_SENTENCE_CHARS, MAX_SENTENCE_CHARS, 10]);
  });
});

describe("wordSpans", () => {
  it("returns only word-like segments with their offsets", () => {
    const text = "Hi, it's 2024!";
    expect(wordSpans(text).map(({ start, end }) => text.slice(start, end))).toEqual(["Hi", "it's", "2024"]);
  });
});
