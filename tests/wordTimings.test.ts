import { describe, expect, it } from "vitest";
import { wordSpans } from "../src/shared/sentences";
import { wordBoundaries, wordIndexAt } from "../src/shared/wordTimings";

const boundariesOf = (text: string) => wordBoundaries(text, wordSpans(text));

describe("wordBoundaries", () => {
  it("is increasing and ends at the full clip", () => {
    const boundaries = boundariesOf("The cat sat on the mat.");
    expect(boundaries).toHaveLength(6);
    expect([...boundaries].sort((a, b) => a - b)).toEqual(boundaries);
    expect(boundaries.at(-1)).toBeCloseTo(1);
  });

  it("gives longer words a larger share", () => {
    const [short, long] = boundariesOf("a extraordinarily");
    expect(short!).toBeLessThan(long! - short!);
  });

  it("gives a word followed by a comma more time than the same word without one", () => {
    const [withPause] = boundariesOf("wait, wait wait");
    const [withoutPause] = boundariesOf("wait wait wait");
    expect(withPause!).toBeGreaterThan(withoutPause!);
  });
});

describe("wordIndexAt", () => {
  const boundaries = [0.25, 0.5, 1];

  it("maps a playback fraction to the word being spoken", () => {
    expect(wordIndexAt(boundaries, 0)).toBe(0);
    expect(wordIndexAt(boundaries, 0.3)).toBe(1);
    expect(wordIndexAt(boundaries, 0.99)).toBe(2);
  });

  it("stays on the last word once the clip is over", () => {
    expect(wordIndexAt(boundaries, 1.2)).toBe(2);
  });

  it("returns -1 when there are no words", () => {
    expect(wordIndexAt([], 0.5)).toBe(-1);
  });
});
