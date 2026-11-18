import { describe, expect, it } from "vitest";
import { paragraphsOf, type Run } from "../src/shared/pdfParagraphs";

const LEFT = 72;
const SIZE = 10;
const LEADING = 12;

const run = (text: string, baseline: number, overrides: Partial<Run> = {}): Run => ({
  text,
  page: 1,
  left: LEFT,
  baseline,
  size: SIZE,
  endsLine: true,
  ...overrides,
});

const lines = (texts: string[], first = 100, overrides: Partial<Run> = {}): Run[] =>
  texts.map((text, index) => run(text, first + index * LEADING, overrides));

const texts = (runs: Run[]) => paragraphsOf(runs).map((paragraph) => paragraph.text);

describe("paragraphsOf", () => {
  it("joins the lines of a paragraph with single spaces", () => {
    expect(texts(lines(["The quick brown fox ", "jumps over", "the lazy dog."]))).toEqual([
      "The quick brown fox jumps over the lazy dog.",
    ]);
  });

  it("rejoins a word hyphenated across lines", () => {
    expect(texts(lines(["It is an exam-", "ple of hyphenation."]))).toEqual(["It is an example of hyphenation."]);
  });

  it("keeps a line-end hyphen that is not splitting a word", () => {
    expect(texts(lines(["The range is 10-", "20 and the name is Smith-", "Jones."]))).toEqual([
      "The range is 10- 20 and the name is Smith- Jones.",
    ]);
  });

  it("starts a new paragraph after a vertical gap", () => {
    const first = lines(["First paragraph", "ends here."]);
    const second = lines(["Second paragraph", "ends here."], 100 + 4 * LEADING);
    expect(texts([...first, ...second])).toEqual(["First paragraph ends here.", "Second paragraph ends here."]);
  });

  it("starts a new paragraph at a first-line indent", () => {
    const runs = lines(["First paragraph", "ends here.", "Second paragraph", "ends here."]);
    runs[0]!.left = LEFT + 15;
    runs[2]!.left = LEFT + 15;
    expect(texts(runs)).toEqual(["First paragraph ends here.", "Second paragraph ends here."]);
  });

  it("keeps the wrapped lines of a hanging indent together", () => {
    const runs = lines(["• A bullet whose text", "wraps onto a second", "and a third line."]);
    runs[1]!.left = LEFT + 15;
    runs[2]!.left = LEFT + 15;
    expect(texts(runs)).toEqual(["• A bullet whose text wraps onto a second and a third line."]);
  });

  it("keeps centered lines of one sentence together", () => {
    const runs = lines(["A notice that is centered on the page and", "runs over three lines before", "it ends."]);
    runs[1]!.left = LEFT + 40;
    runs[2]!.left = LEFT + 110;
    expect(texts(runs)).toEqual(["A notice that is centered on the page and runs over three lines before it ends."]);
  });

  it("separates a heading set in a larger size", () => {
    const heading = run("Introduction", 100, { size: 16 });
    expect(texts([heading, ...lines(["Body text follows", "the heading."], 120)])).toEqual([
      "Introduction",
      "Body text follows the heading.",
    ]);
  });

  it("merges the runs of one line, superscripts included", () => {
    const runs = [
      run("Energy is mc", 100, { endsLine: false }),
      run("2", 96, { left: 130, size: 7, endsLine: false }),
      run(" as shown.", 100, { left: 135 }),
    ];
    expect(texts(runs)).toEqual(["Energy is mc2 as shown."]);
  });

  it("breaks the line at a baseline change even without an end-of-line mark", () => {
    const runs = lines(["one", "two"], 100, { endsLine: false });
    expect(texts(runs)).toEqual(["one two"]);
  });

  it("carries an unfinished sentence across a page break", () => {
    const runs = [...lines(["The sentence runs", "over the"], 700), ...lines(["page break."], 80, { page: 2 })];
    expect(texts(runs)).toEqual(["The sentence runs over the page break."]);
  });

  it("does not join a finished sentence to the next page", () => {
    const runs = [...lines(["It ends here."], 700), ...lines(["then a caption"], 80, { page: 2 })];
    expect(texts(runs)).toEqual(["It ends here.", "then a caption"]);
  });

  it("does not join a page header that starts with a capital", () => {
    const runs = [...lines(["The sentence runs over"], 700), ...lines(["Journal of Examples"], 40, { page: 2 })];
    expect(texts(runs)).toEqual(["The sentence runs over", "Journal of Examples"]);
  });

  it("lets an empty run end the line without adding text", () => {
    const runs = [run("Left cell", 100, { endsLine: false }), run("", 100), run("Right cell", 100, { left: 200 })];
    expect(texts(runs)).toEqual(["Left cell", "Right cell"]);
  });

  it("maps every character back to its run and offset", () => {
    const runs = lines(["exam-", "ple  text"]);
    const [paragraph] = paragraphsOf(runs);
    expect(paragraph!.text).toBe("example text");
    const source = [...paragraph!.text].map((_, index) => runs[paragraph!.runs[index]!]!.text[paragraph!.offsets[index]!]);
    expect(source.join("")).toBe("example text");
    expect(paragraph!.runs).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]);
  });
});
