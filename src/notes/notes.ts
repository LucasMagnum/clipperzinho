import { removeHighlight } from "../shared/highlightIndex";
import { notesToMarkdown } from "../shared/markdown";
import { deleteNote, listNotes, updateNoteText, type Note } from "../shared/notesStore";

const list = document.querySelector<HTMLUListElement>("#notes")!;
const empty = document.querySelector<HTMLParagraphElement>("#empty")!;
const search = document.querySelector<HTMLInputElement>("#search")!;
const exportButton = document.querySelector<HTMLButtonElement>("#export")!;
const viewer = document.querySelector<HTMLDialogElement>("#viewer")!;
const viewerImage = viewer.querySelector("img")!;

let notes: Note[] = [];

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  properties: Partial<HTMLElementTagNameMap[K]> = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), properties);
  node.append(...children);
  return node;
}

function matches(note: Note, query: string): boolean {
  return [note.title, note.url, note.excerpt, note.note].some((field) => field.toLowerCase().includes(query));
}

function card(note: Note): HTMLLIElement {
  const snapshot = element("button", { type: "button", className: "snapshot", ariaLabel: "View snapshot" }, [
    element("img", { src: note.screenshot, alt: `Snapshot of ${note.title}`, loading: "lazy" }),
  ]);
  snapshot.addEventListener("click", () => {
    viewerImage.src = note.screenshot;
    viewer.showModal();
  });

  const isHighlight = note.kind === "highlight";
  const text = element("textarea", {
    value: note.note,
    ariaLabel: "Note",
    placeholder: isHighlight ? "Highlight — add a note" : "",
  });
  text.addEventListener("change", async () => {
    await updateNoteText(note.id, text.value);
    note.note = text.value;
  });

  const remove = element("button", { type: "button", className: "delete", textContent: "Delete" });
  remove.addEventListener("click", async () => {
    if (!confirm("Delete this note and its snapshot?")) return;
    await deleteNote(note.id);
    if (isHighlight) await removeHighlight(note.url, note.excerpt);
    notes = notes.filter((other) => other.id !== note.id);
    render();
  });

  const created = new Date(note.createdAt);
  const body = element("div", {}, [
    element("h2", {}, [
      element("a", { href: note.url, target: "_blank", rel: "noreferrer", textContent: note.title || note.url }),
    ]),
    element("time", { dateTime: created.toISOString(), textContent: created.toLocaleString() }),
  ]);
  if (note.excerpt) body.append(element("blockquote", { textContent: note.excerpt }));
  body.append(text, element("footer", {}, [remove]));

  return element("li", { className: "note" }, [snapshot, body]);
}

function render(): void {
  const query = search.value.trim().toLowerCase();
  const visible = query ? notes.filter((note) => matches(note, query)) : notes;
  list.replaceChildren(...visible.map(card));
  empty.hidden = visible.length > 0;
  empty.textContent = notes.length
    ? "No notes match that search."
    : "Nothing saved yet. Open Clipperzinho on any page to take a note or highlight a sentence.";
  exportButton.disabled = notes.length === 0;
}

async function refresh(): Promise<void> {
  notes = await listNotes();
  render();
}

function exportMarkdown(): void {
  const url = URL.createObjectURL(new Blob([notesToMarkdown(notes)], { type: "text/markdown" }));
  element("a", { href: url, download: "clipperzinho-notes.md" }).click();
  URL.revokeObjectURL(url);
}

search.addEventListener("input", render);
exportButton.addEventListener("click", exportMarkdown);
viewer.addEventListener("click", () => viewer.close());
addEventListener("focus", () => {
  if (!list.contains(document.activeElement)) void refresh();
});

void refresh();
