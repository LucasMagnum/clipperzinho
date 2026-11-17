import type { NoteDraft } from "./messages";

export interface Note extends NoteDraft {
  id: string;
  createdAt: number;
  screenshot: string;
}

const DATABASE = "clipperzinho";
const STORE = "notes";

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE, { keyPath: "id" });
  };
  return settled(request);
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await settled(run(database.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    database.close();
  }
}

export async function addNote(draft: NoteDraft, screenshot: string): Promise<Note> {
  const note: Note = { ...draft, screenshot, id: crypto.randomUUID(), createdAt: Date.now() };
  await withStore("readwrite", (store) => store.add(note));
  return note;
}

export async function listNotes(): Promise<Note[]> {
  const notes = await withStore<Note[]>("readonly", (store) => store.getAll());
  return notes.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateNoteText(id: string, text: string): Promise<void> {
  const note = await withStore<Note | undefined>("readonly", (store) => store.get(id));
  if (!note) throw new Error(`Note ${id} no longer exists`);
  await withStore("readwrite", (store) => store.put({ ...note, note: text }));
}

export async function deleteNote(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}
