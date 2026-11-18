import {
  getDocument,
  getPdfFilenameFromUrl,
  GlobalWorkerOptions,
  RenderingCancelledException,
  TextLayer,
  Util,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
import { start } from "../content/app";
import { readBlocksFrom, type Block, type BlockSource } from "../content/extract";
import { paragraphsOf, type Paragraph, type Run } from "../shared/pdfParagraphs";

const ASSETS = chrome.runtime.getURL("pdfjs/");
const MAX_PAGE_WIDTH = 900;
const GUTTER = 16;
// About ten degrees: keeps slightly skewed scans, drops text set sideways in a margin.
const UPRIGHT = 0.17;

GlobalWorkerOptions.workerSrc = `${ASSETS}pdf.worker.mjs`;

const status = document.querySelector<HTMLElement>("#status")!;
const pages = document.querySelector<HTMLElement>("#pages")!;

const proxies = new Map<Element, PDFPageProxy>();
const painting = new Map<Element, RenderTask>();
let scale = 1;

function fitWidth(pageWidth: number): void {
  scale = Math.min(MAX_PAGE_WIDTH, document.documentElement.clientWidth - 2 * GUTTER) / pageWidth;
  pages.style.setProperty("--scale-factor", String(scale));
}

async function paint(element: Element): Promise<void> {
  const page = proxies.get(element);
  if (!page || painting.has(element)) return;
  const canvas = element.querySelector("canvas")!;
  const viewport = page.getViewport({ scale: scale * devicePixelRatio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const task = page.render({ canvas, viewport });
  painting.set(element, task);
  try {
    await task.promise;
  } catch (error) {
    if (!(error instanceof RenderingCancelledException)) throw error;
  }
}

function release(element: Element): void {
  painting.get(element)?.cancel();
  painting.delete(element);
  const canvas = element.querySelector("canvas")!;
  canvas.width = 0;
  canvas.height = 0;
}

// A page's bitmap is tens of megabytes, so only those near the viewport are kept.
const nearViewport = new IntersectionObserver(
  (entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) paint(target).catch(console.error);
      else release(target);
    }
  },
  { rootMargin: "100% 0px" },
);

async function addPage(page: PDFPageProxy, runs: Run[], nodes: (Text | undefined)[]): Promise<void> {
  const viewport = page.getViewport({ scale: 1 });
  const element = document.createElement("section");
  const layer = document.createElement("div");
  element.className = "page";
  element.style.setProperty("--page-width", `${viewport.width}px`);
  element.style.setProperty("--page-height", `${viewport.height}px`);
  layer.className = "textLayer";
  element.append(document.createElement("canvas"), layer);
  pages.append(element);
  proxies.set(element, page);
  nearViewport.observe(element);

  const content = await page.getTextContent();
  const textLayer = new TextLayer({ textContentSource: content, container: layer, viewport });
  await textLayer.render();

  content.items.forEach((item, index) => {
    if (!("str" in item)) return;
    const [a, b, c, d, left, baseline] = Util.transform(viewport.transform, item.transform) as number[];
    const text = textLayer.textDivs[index]?.firstChild;
    const node = text instanceof Text && Math.abs(Math.atan2(b!, a!)) < UPRIGHT ? text : undefined;
    nodes.push(node);
    runs.push({
      text: node?.data ?? "",
      page: page.pageNumber,
      left: left!,
      baseline: baseline!,
      size: Math.hypot(c!, d!),
      endsLine: item.hasEOL,
    });
  });
}

function clip(block: Block, within: Range): Block | undefined {
  const { owners, offsets } = block;
  const last = owners.at(-1);
  if (!last || within.comparePoint(owners[0]!, 0) > 0 || within.comparePoint(last, last.length) < 0) return undefined;
  const inside = (owner: Text, index: number) =>
    within.intersectsNode(owner) &&
    !(owner === within.startContainer && offsets[index]! < within.startOffset) &&
    !(owner === within.endContainer && offsets[index]! >= within.endOffset);
  const from = owners.findIndex(inside);
  if (from === -1) return undefined;
  const to = owners.findLastIndex(inside) + 1;
  return { text: block.text.slice(from, to), owners: owners.slice(from, to), offsets: offsets.slice(from, to) };
}

function blockSource(paragraphs: Paragraph[], nodes: (Text | undefined)[]): BlockSource {
  const blocks: Block[] = paragraphs.map(({ text, runs, offsets }) => ({
    text,
    owners: runs.map((run) => nodes[run]!),
    offsets,
  }));
  return (within) => (within ? blocks.flatMap((block) => clip(block, within) ?? []) : blocks);
}

async function titleOf(pdf: PDFDocumentProxy, url: string): Promise<string> {
  const { info } = await pdf.getMetadata();
  return (info as { Title?: string }).Title?.trim() || getPdfFilenameFromUrl(url);
}

async function open(url: string): Promise<void> {
  const pdf = await getDocument({
    url,
    withCredentials: true,
    cMapUrl: `${ASSETS}cmaps/`,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  }).promise;
  document.title = await titleOf(pdf, url);

  const runs: Run[] = [];
  const nodes: (Text | undefined)[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    status.textContent = `Preparing page ${number} of ${pdf.numPages}…`;
    const page = await pdf.getPage(number);
    if (number === 1) {
      const { width } = page.getViewport({ scale: 1 });
      fitWidth(width);
      addEventListener("resize", () => fitWidth(width));
    }
    await addPage(page, runs, nodes);
  }
  status.remove();

  readBlocksFrom(blockSource(paragraphsOf(runs), nodes));
  start(() => url);
}

const url = new URLSearchParams(location.search).get("src");
if (url) {
  open(url).catch((error: unknown) => {
    status.textContent = `This PDF could not be opened. ${error instanceof Error ? error.message : String(error)}`;
  });
} else {
  status.textContent = "No PDF to open.";
}
