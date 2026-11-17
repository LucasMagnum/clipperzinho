import { sentenceSpans } from "../shared/sentences";

export const WIDGET_TAG = "clipperzinho-widget";

interface Block {
  text: string;
  owners: Text[];
  offsets: number[];
}

export interface Sentence {
  text: string;
  block: Block;
  start: number;
  end: number;
}

const NEVER_READ = `script, style, noscript, template, svg, canvas, textarea, select, ${WIDGET_TAG}`;
const PAGE_CHROME =
  "nav, footer, aside, button, [aria-hidden='true'], [role='navigation'], [role='banner'], [role='contentinfo'], [role='complementary']";
const MIN_ROOT_TEXT = 200;

function contentRoot(): Element {
  const articles = document.querySelectorAll("article");
  const candidates = [articles.length === 1 ? articles[0] : null, document.querySelector("main, [role='main']")];
  const root = candidates.find((element) => element && (element.textContent ?? "").trim().length >= MIN_ROOT_TEXT);
  return root ?? document.body;
}

function isInline(element: Element): boolean {
  const { display } = getComputedStyle(element);
  return display === "inline" || display === "contents";
}

function memoized<K, V>(compute: (key: K) => V): (key: K) => V {
  const cache = new Map<K, V>();
  return (key) => {
    if (!cache.has(key)) cache.set(key, compute(key));
    return cache.get(key)!;
  };
}

function collectBlocks(root: Node, skipped: string, within?: Range): Block[] {
  const blockOf = memoized((element: Element): Element => {
    let block = element;
    while (block.parentElement && isInline(block)) block = block.parentElement;
    return block;
  });
  const isVisible = memoized((element: Element) =>
    element.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
  );

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, (node) => {
    if (node instanceof Text || node instanceof HTMLBRElement) return NodeFilter.FILTER_ACCEPT;
    return (node as Element).matches(skipped) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
  });

  const blocks: Block[] = [];
  let chars: string[] = [];
  let current: Block | undefined;
  let currentContainer: Element | undefined;

  const close = () => {
    if (current && chars.length) {
      current.text = chars.join("");
      blocks.push(current);
    }
    current = undefined;
    currentContainer = undefined;
    chars = [];
  };

  for (let node = root instanceof Text ? root : walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) {
      close();
      continue;
    }
    const parent = node.parentElement;
    if (!parent || !isVisible(parent) || (within && !within.intersectsNode(node))) continue;

    const container = blockOf(parent);
    if (container !== currentContainer) {
      close();
      current = { text: "", owners: [], offsets: [] };
      currentContainer = container;
    }

    const from = within && node === within.startContainer ? within.startOffset : 0;
    const to = within && node === within.endContainer ? within.endOffset : node.data.length;
    for (let offset = from; offset < to; offset++) {
      const char = node.data[offset]!;
      const isSpace = char.trim() === "";
      if (isSpace && (chars.length === 0 || chars[chars.length - 1] === " ")) continue;
      chars.push(isSpace ? " " : char);
      current!.owners.push(node);
      current!.offsets.push(offset);
    }
  }
  close();
  return blocks;
}

function toSentences(blocks: Block[]): Sentence[] {
  return blocks.flatMap((block) =>
    sentenceSpans(block.text).map(({ start, end }) => ({ text: block.text.slice(start, end), block, start, end })),
  );
}

export function selectedRange(): Range | undefined {
  const selection = getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return undefined;
  return selection.getRangeAt(0);
}

export function extractSelection(range: Range): Sentence[] {
  return toSentences(collectBlocks(range.commonAncestorContainer, NEVER_READ, range));
}

export function extractPage(): Sentence[] {
  return toSentences(collectBlocks(contentRoot(), `${NEVER_READ}, ${PAGE_CHROME}`));
}

/** Undefined when the page has changed underneath the sentence since it was extracted. */
export function rangeOf(sentence: Sentence, start = 0, end = sentence.text.length): Range | undefined {
  const { owners, offsets } = sentence.block;
  const first = sentence.start + start;
  const last = sentence.start + end - 1;
  try {
    const range = new Range();
    range.setStart(owners[first]!, offsets[first]!);
    range.setEnd(owners[last]!, offsets[last]! + 1);
    return range;
  } catch {
    return undefined;
  }
}

export function sentenceIndexAt(sentences: Sentence[], node: Node, offset: number): number {
  const index = sentences.findIndex((sentence) => {
    const range = rangeOf(sentence);
    return range !== undefined && range.comparePoint(node, offset) <= 0;
  });
  return index === -1 ? 0 : index;
}
