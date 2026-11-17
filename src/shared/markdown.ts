import type { Note } from "./notesStore";

function quoted(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function noteToMarkdown(note: Note): string {
  const parts = [`## [${note.title || note.url}](${note.url})`, `_${new Date(note.createdAt).toLocaleString()}_`];
  if (note.excerpt) parts.push(quoted(note.excerpt));
  parts.push(note.note);
  return parts.join("\n\n");
}

export function notesToMarkdown(notes: Note[]): string {
  return [`# Clipperzinho notes`, ...notes.map(noteToMarkdown)].join("\n\n") + "\n";
}
