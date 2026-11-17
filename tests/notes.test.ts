import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { withHighlight, withoutHighlight } from "../src/shared/highlightIndex";
import { notesToMarkdown } from "../src/shared/markdown";
import { addNote, deleteNote, listNotes, updateNoteText } from "../src/shared/notesStore";

const draft = (note: string) => ({
  kind: "note" as const,
  note,
  excerpt: "A sentence from the page.",
  url: "https://example.com/article",
  title: "An article",
});

describe("notesStore", () => {
  it("stores, edits and deletes notes", async () => {
    const first = await addNote(draft("first"), "data:image/jpeg;base64,AAAA");
    const second = await addNote(draft("second"), "data:image/jpeg;base64,BBBB");

    expect((await listNotes()).map((note) => note.id).sort()).toEqual([first.id, second.id].sort());

    await updateNoteText(first.id, "first, edited");
    const stored = (await listNotes()).find((note) => note.id === first.id);
    expect(stored).toMatchObject({ note: "first, edited", screenshot: "data:image/jpeg;base64,AAAA" });

    await deleteNote(first.id);
    expect((await listNotes()).map((note) => note.id)).toEqual([second.id]);
  });

  it("refuses to edit a note that was deleted", async () => {
    await expect(updateNoteText("missing", "text")).rejects.toThrow("no longer exists");
  });
});

describe("highlight index", () => {
  const url = "https://example.com/article";

  it("groups highlights by page, ignoring the URL fragment", () => {
    const index = withHighlight(withHighlight({}, `${url}#intro`, "First."), `${url}#end`, "Second.");
    expect(index).toEqual({ [url]: ["First.", "Second."] });
  });

  it("does not store the same sentence twice", () => {
    const index = withHighlight({}, url, "First.");
    expect(withHighlight(index, url, "First.")).toBe(index);
  });

  it("drops the page entry when its last highlight is removed", () => {
    const index = withHighlight(withHighlight({}, url, "First."), url, "Second.");
    expect(withoutHighlight(index, url, "First.")).toEqual({ [url]: ["Second."] });
    expect(withoutHighlight(withoutHighlight(index, url, "First."), url, "Second.")).toEqual({});
  });
});

describe("notesToMarkdown", () => {
  it("renders title link, quoted excerpt and note text", () => {
    const markdown = notesToMarkdown([
      { ...draft("Remember this."), id: "1", createdAt: 0, screenshot: "", excerpt: "line one\nline two" },
    ]);

    expect(markdown).toContain("## [An article](https://example.com/article)");
    expect(markdown).toContain("> line one\n> line two");
    expect(markdown).toContain("Remember this.");
    expect(markdown).not.toContain("data:image");
  });
});
