import type { ContentMessage } from "../shared/messages";
import { WIDGET_TAG } from "./extract";
import { Reader, send, type ReaderView } from "./reader";
import { loadSettings } from "./settings";
import { createWidget, type Mood, type Widget } from "./widget";

const PICKING_CLASS = "clipperzinho-picking";

function describe(view: ReaderView): { status: string; mood: Mood; playing: boolean } {
  switch (view.kind) {
    case "idle":
      return { status: "Press play and I'll read this page, or select some text first.", mood: "idle", playing: false };
    case "empty":
      return { status: "I couldn't find any text to read here.", mood: "idle", playing: false };
    case "downloading":
      return {
        status: `Fetching my voice… ${Math.round(view.progress * 100)}% (first time only)`,
        mood: "thinking",
        playing: true,
      };
    case "buffering":
      return { status: "Warming up…", mood: "thinking", playing: true };
    case "reading":
      return { status: `Reading sentence ${view.index + 1} of ${view.total}`, mood: "talking", playing: true };
    case "paused":
      return { status: `Paused at sentence ${view.index + 1} of ${view.total}`, mood: "idle", playing: false };
    case "finished":
      return { status: "That's everything!", mood: "idle", playing: false };
    case "interrupted":
      return { status: "I started reading in another tab.", mood: "idle", playing: false };
    case "error":
      return { status: `Something went wrong: ${view.message}`, mood: "idle", playing: false };
  }
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function main(): Promise<void> {
  const settings = await loadSettings();
  let widget: Widget;
  let resumeAfterNote = false;
  let stopPicking: (() => void) | undefined;

  const reader = new Reader(settings, (view) => {
    const { status, mood, playing } = describe(view);
    widget.setStatus(status);
    widget.setMood(mood);
    widget.setPlaying(playing);
  });

  const startPicking = () => {
    const controller = new AbortController();
    const stop = () => {
      controller.abort();
      document.documentElement.classList.remove(PICKING_CLASS);
      widget.setPicking(false);
      stopPicking = undefined;
    };
    document.documentElement.classList.add(PICKING_CLASS);
    widget.setPicking(true);
    stopPicking = stop;

    document.addEventListener(
      "click",
      (event) => {
        if (event.composedPath().includes(widget.host)) return;
        event.preventDefault();
        event.stopPropagation();
        stop();
        const caret = document.caretPositionFromPoint(event.clientX, event.clientY);
        if (caret) reader.startAt(caret.offsetNode, caret.offset);
      },
      { capture: true, signal: controller.signal },
    );
    document.addEventListener("keydown", (event) => event.key === "Escape" && stop(), {
      capture: true,
      signal: controller.signal,
    });
  };

  widget = createWidget(settings, {
    toggle: () => reader.toggle(),
    previous: () => reader.previous(),
    next: () => reader.next(),
    stop: () => reader.stop(),
    pick: () => (stopPicking ? stopPicking() : startPicking()),
    openNotes: () => void send({ type: "notes/open" }),
    rate: (rate) => reader.setRate(rate),
    voice: (voice) => reader.setVoice(voice),
    noteExcerpt: () => {
      resumeAfterNote = reader.isPlaying;
      reader.pause();
      return getSelection()?.toString().trim() || reader.currentText;
    },
    saveNote: async (note, excerpt) => {
      widget.host.style.visibility = "hidden";
      await nextPaint();
      const reply = await send({ type: "note/save", note, excerpt, url: location.href, title: document.title });
      widget.host.style.visibility = "";
      if (!reply.ok) throw new Error(reply.error ?? "The note could not be saved.");
    },
    noteClosed: () => {
      if (resumeAfterNote) reader.resume();
      resumeAfterNote = false;
    },
  });

  widget.setStatus(describe({ kind: "idle" }).status);
  document.documentElement.append(widget.host);

  chrome.runtime.onMessage.addListener((message: ContentMessage) => {
    if (message.type === "command/toggle") reader.toggle();
    else reader.handle(message);
  });

  addEventListener("pagehide", () => reader.stop());
}

if (!document.querySelector(WIDGET_TAG)) void main();
