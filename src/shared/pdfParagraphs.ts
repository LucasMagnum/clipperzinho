/** A piece of text as a PDF places it, in page coordinates with y growing downward. */
export interface Run {
  text: string;
  page: number;
  left: number;
  baseline: number;
  size: number;
  endsLine: boolean;
}

/** Flowing text, with the run and the offset inside it that every character came from. */
export interface Paragraph {
  text: string;
  runs: number[];
  offsets: number[];
}

interface Line {
  runs: number[];
  text: string;
  page: number;
  left: number;
  baseline: number;
  size: number;
}

// Superscripts and subscripts shift the baseline by about a third of the font size.
const SAME_LINE = 0.5;
const SAME_SIZE = 0.15;
const INDENT = 0.5;
// Body text is usually set at 1.2 to 1.5 times the font size, and a blank line doubles that.
const FIRST_GAP = 2.2;
const GAP_GROWTH = 1.3;

const SENTENCE_END = /[.!?:]["'”’)\]]*\s*$/;
const STARTS_LOWERCASE = /^\s*\p{Ll}/u;
const HYPHENATED = /\p{L}-$/u;

function linesOf(runs: Run[]): Line[] {
  const lines: Line[] = [];
  let current: Line | undefined;
  runs.forEach((run, index) => {
    if (run.text.trim() === "") {
      if (run.text && current) {
        current.runs.push(index);
        current.text += run.text;
      }
    } else if (
      current &&
      run.page === current.page &&
      Math.abs(run.baseline - current.baseline) <= Math.max(run.size, current.size) * SAME_LINE
    ) {
      current.runs.push(index);
      current.text += run.text;
      current.size = Math.max(current.size, run.size);
    } else {
      current = { runs: [index], text: run.text, page: run.page, left: run.left, baseline: run.baseline, size: run.size };
      lines.push(current);
    }
    if (run.endsLine) current = undefined;
  });
  return lines;
}

function continues(previous: Line, line: Line, spacing: number | undefined): boolean {
  const drop = line.baseline - previous.baseline;
  if (line.page !== previous.page || drop <= 0) {
    // A new page or column carries no usable geometry, so only an unfinished sentence joins across it.
    return !SENTENCE_END.test(previous.text) && STARTS_LOWERCASE.test(line.text);
  }
  const size = Math.max(previous.size, line.size);
  if (Math.abs(previous.size - line.size) > size * SAME_SIZE) return false;
  // An indent opens a paragraph only after a finished sentence, which centered lines rarely end on, and never
  // on a paragraph's second line, which a hanging indent also moves right.
  const indented = line.left - previous.left > size * INDENT;
  if (indented && spacing !== undefined && SENTENCE_END.test(previous.text)) return false;
  return drop <= (spacing === undefined ? size * FIRST_GAP : spacing * GAP_GROWTH);
}

function append(paragraph: Paragraph, char: string, run: number, offset: number): void {
  const isSpace = char.trim() === "";
  if (isSpace && (paragraph.text === "" || paragraph.text.endsWith(" "))) return;
  paragraph.text += isSpace ? " " : char;
  paragraph.runs.push(run);
  paragraph.offsets.push(offset);
}

function appendLine(paragraph: Paragraph, line: Line, runs: Run[]): void {
  if (HYPHENATED.test(paragraph.text) && STARTS_LOWERCASE.test(line.text)) {
    paragraph.text = paragraph.text.slice(0, -1);
    paragraph.runs.pop();
    paragraph.offsets.pop();
  } else if (paragraph.text) {
    append(paragraph, " ", paragraph.runs.at(-1)!, paragraph.offsets.at(-1)!);
  }
  for (const run of line.runs) {
    const { text } = runs[run]!;
    for (let offset = 0; offset < text.length; offset++) append(paragraph, text[offset]!, run, offset);
  }
}

export function paragraphsOf(runs: Run[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let paragraph: Paragraph | undefined;
  let previous: Line | undefined;
  let spacing: number | undefined;
  for (const line of linesOf(runs)) {
    if (paragraph && previous && continues(previous, line, spacing)) {
      const drop = line.baseline - previous.baseline;
      if (line.page === previous.page && drop > 0) spacing = drop;
    } else {
      paragraph = { text: "", runs: [], offsets: [] };
      paragraphs.push(paragraph);
      spacing = undefined;
    }
    appendLine(paragraph, line, runs);
    previous = line;
  }
  return paragraphs;
}
