import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { notesToMarkdown } from "../src/shared/markdown";
import { addNote, deleteNote, listNotes, updateNoteText } from "../src/shared/notesStore";

const draft = (note: string) => ({
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
