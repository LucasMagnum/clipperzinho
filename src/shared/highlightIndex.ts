export type HighlightIndex = Record<string, string[]>;

// Kept in chrome.storage rather than with the notes in IndexedDB so every page load
// can check for saved highlights without waking the service worker or reading snapshots.
const KEY = "highlights";

function pageKey(url: string): string {
  return url.split("#")[0]!;
}

export function withHighlight(index: HighlightIndex, url: string, text: string): HighlightIndex {
  const key = pageKey(url);
  const existing = index[key] ?? [];
  return existing.includes(text) ? index : { ...index, [key]: [...existing, text] };
}

export function withoutHighlight(index: HighlightIndex, url: string, text: string): HighlightIndex {
  const key = pageKey(url);
  const remaining = (index[key] ?? []).filter((saved) => saved !== text);
  const { [key]: _removed, ...rest } = index;
  return remaining.length ? { ...rest, [key]: remaining } : rest;
}

async function readIndex(): Promise<HighlightIndex> {
  const stored = await chrome.storage.local.get<{ [KEY]: HighlightIndex }>({ [KEY]: {} });
  return stored[KEY];
}

export async function highlightsFor(url: string): Promise<string[]> {
  return (await readIndex())[pageKey(url)] ?? [];
}

export async function addHighlight(url: string, text: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: withHighlight(await readIndex(), url, text) });
}

export async function removeHighlight(url: string, text: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: withoutHighlight(await readIndex(), url, text) });
}
