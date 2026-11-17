const sentenceHighlight = new Highlight();
const wordHighlight = new Highlight();
wordHighlight.priority = 1;

CSS.highlights.set("clipperzinho-sentence", sentenceHighlight);
CSS.highlights.set("clipperzinho-word", wordHighlight);

const REVEAL_AT = 0.35;
const TOP_MARGIN = 80;
const BOTTOM_MARGIN = 160;

function replace(highlight: Highlight, range: Range | undefined): void {
  highlight.clear();
  if (range) highlight.add(range);
}

function scrollContainer(node: Node): Element {
  for (let element = node.parentElement; element; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element);
    if ((overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight) {
      return element;
    }
  }
  return document.scrollingElement ?? document.documentElement;
}

function reveal(range: Range): void {
  const rect = range.getBoundingClientRect();
  if (rect.top >= TOP_MARGIN && rect.bottom <= innerHeight - BOTTOM_MARGIN) return;
  scrollContainer(range.startContainer).scrollBy({
    top: rect.top - innerHeight * REVEAL_AT,
    behavior: "smooth",
  });
}

export function showSentence(range: Range | undefined): void {
  replace(sentenceHighlight, range);
  replace(wordHighlight, undefined);
  if (range) reveal(range);
}

export function showWord(range: Range | undefined): void {
  replace(wordHighlight, range);
}

export function clearHighlights(): void {
  sentenceHighlight.clear();
  wordHighlight.clear();
}
