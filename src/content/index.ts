import { highlightsFor } from "../shared/highlightIndex";
import type { ContentMessage, NoteKind } from "../shared/messages";
import { loadSettings, type Settings } from "../shared/settings";
import { extractPage, rangeOf, WIDGET_TAG, type Sentence } from "./extract";
import { markSaved } from "./highlighter";
import { findStartTarget, Reader, send, type Point, type ReaderView, type StartTarget } from "./reader";
import { createWidget, type Widget, type WidgetState } from "./widget";

const PREVIEW_CHARS = 14;
const BAR_VIEWS: ReadonlySet<ReaderView["kind"]> = new Set(["downloading", "buffering", "reading", "paused", "error"]);
const ANNOUNCEMENTS: Partial<Record<ReaderView["kind"], string>> = {
  empty: "I couldn't find any text to read here.",
  finished: "Finished reading.",
  interrupted: "Reading moved to another tab.",
};

function preview(text: string): string {
  if (text.length <= PREVIEW_CHARS) return `“${text}”`;
  const cut = text.lastIndexOf(" ", PREVIEW_CHARS);
  return `“${text.slice(0, cut > 0 ? cut : PREVIEW_CHARS)}…”`;
}

function describeTarget(target: StartTarget | undefined): Pick<WidgetState, "title" | "detail"> {
  const first = target?.sentences[target.index];
  if (!target || !first || target.kind === "page") return { title: "Read page", detail: "From the top" };
  return target.kind === "selection"
    ? { title: "Read selection", detail: preview(first.text) }
    : { title: "Read from cursor", detail: `Starts at ${preview(first.text)}` };
}

function describe(view: ReaderView, target: StartTarget | undefined): WidgetState {
  switch (view.kind) {
    case "downloading":
      return {
        title: "Fetching voice…",
        detail: `${Math.round(view.progress * 100)}% · first time only`,
        playing: true,
        speaking: false,
      };
    case "buffering":
      return { title: "Warming up…", detail: "", playing: true, speaking: false };
    case "reading":
      return {
        title: "Reading aloud",
        detail: `Sentence ${view.index + 1} of ${view.total}`,
        playing: true,
        speaking: true,
      };
    case "paused":
      return { title: "Paused", detail: `Sentence ${view.index + 1} of ${view.total}`, playing: false, speaking: false };
    case "error":
      return { title: "Something went wrong", detail: view.message, playing: false, speaking: false };
    default:
      return { ...describeTarget(target), playing: false, speaking: false };
  }
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function isAltKey(event: KeyboardEvent, code: string): boolean {
  // Matched on the physical key: on macOS Option changes the character that is typed.
  return event.code === code && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

async function restoreSavedHighlights(): Promise<void> {
  const saved = new Set(await highlightsFor(location.href));
  if (saved.size === 0) return;
  for (const sentence of extractPage()) {
    const range = saved.has(sentence.text) ? rangeOf(sentence) : undefined;
    if (range) markSaved(range);
  }
}

async function main(): Promise<void> {
  const settings = await loadSettings();
  let widget: Widget;
  let view: ReaderView = { kind: "idle" };
  let target: StartTarget | undefined;
  let pointer: Point | undefined;
  let resumeAfterNote = false;

  const update = () => {
    widget.render(describe(view, target));
    widget.showBar(BAR_VIEWS.has(view.kind));
  };

  const reader = new Reader(settings, (next) => {
    view = next;
    const announcement = ANNOUNCEMENTS[next.kind];
    if (announcement) widget.flash(announcement);
    update();
  });

  const closeCenter = () => {
    widget.closeCenter();
    target = undefined;
  };

  const openCenter = () => {
    target = reader.hasSession ? undefined : findStartTarget(pointer);
    update();
    widget.openCenter(BAR_VIEWS.has(view.kind) ? "bar" : pointer);
  };

  const toggleReading = () => {
    if (target && !reader.hasSession) reader.start(target);
    else reader.toggle(pointer);
    if (reader.isPlaying) closeCenter();
  };

  const save = async (kind: NoteKind, note: string, excerpt: string) => {
    widget.host.style.visibility = "hidden";
    await nextPaint();
    const reply = await send({ type: "note/save", kind, note, excerpt, url: location.href, title: document.title });
    widget.host.style.visibility = "";
    if (!reply.ok) throw new Error(reply.error ?? "It could not be saved.");
  };

  const sentenceToHighlight = (): Sentence | undefined =>
    reader.currentSentence ?? (target && target.kind !== "page" ? target.sentences[target.index] : undefined);

  const highlightSentence = async () => {
    const sentence = sentenceToHighlight();
    const range = sentence && rangeOf(sentence);
    if (!sentence || !range) {
      widget.flash("Start reading or point at a sentence first.");
      return;
    }
    markSaved(range);
    try {
      await save("highlight", "", sentence.text);
      widget.flash("Sentence highlighted.");
    } catch (error) {
      widget.flash(error instanceof Error ? error.message : String(error));
    }
  };

  widget = createWidget(settings, {
    toggle: toggleReading,
    previous: () => reader.previous(),
    next: () => reader.next(),
    stop: () => {
      reader.stop();
      closeCenter();
    },
    expand: () => (widget.centerOpen ? closeCenter() : openCenter()),
    highlight: () => void highlightSentence(),
    openSettings: () => void send({ type: "settings/open" }),
    rate: (rate) => reader.setRate(rate),
    voice: (voice) => reader.setVoice(voice),
    noteExcerpt: () => {
      resumeAfterNote = reader.isPlaying;
      reader.pause();
      return getSelection()?.toString().trim() || sentenceToHighlight()?.text || "";
    },
    saveNote: (note, excerpt) => save("note", note, excerpt),
    noteClosed: () => {
      if (resumeAfterNote) reader.resume();
      resumeAfterNote = false;
    },
  });

  update();
  document.documentElement.append(widget.host);

  addEventListener(
    "pointermove",
    (event) => {
      if (event.target !== widget.host) pointer = { x: event.clientX, y: event.clientY };
    },
    { passive: true },
  );

  addEventListener("pointerdown", (event) => {
    if (widget.centerOpen && event.target !== widget.host) closeCenter();
  });

  // Capture phase on window, so these work whether focus is in the page or in the widget.
  addEventListener(
    "keydown",
    (event) => {
      const visible = widget.centerOpen || BAR_VIEWS.has(view.kind);
      if (!visible) return;
      if (event.key === "Escape" && widget.centerOpen) {
        closeCenter();
      } else if (isAltKey(event, "KeyN") && !widget.noteOpen) {
        widget.openNote();
      } else if (isAltKey(event, "KeyH") && !widget.noteOpen) {
        void highlightSentence();
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true },
  );

  chrome.runtime.onMessage.addListener((message: ContentMessage) => {
    if (message.type === "command/open") widget.centerOpen ? closeCenter() : openCenter();
    else if (message.type === "command/toggle") toggleReading();
    else reader.handle(message);
  });

  chrome.storage.onChanged.addListener((changes) => {
    const changed = <K extends keyof Settings>(key: K): Settings[K] | undefined =>
      changes[key] && changes[key].newValue !== settings[key] ? (changes[key].newValue as Settings[K]) : undefined;
    const rate = changed("rate");
    const voice = changed("voice");
    const followAlong = changed("followAlong");
    if (rate !== undefined) reader.setRate(rate);
    if (voice !== undefined) reader.setVoice(voice);
    if (followAlong !== undefined) settings.followAlong = followAlong;
    widget.showPreferences();
  });

  addEventListener("pagehide", () => reader.stop());

  void restoreSavedHighlights();
}

if (!document.querySelector(WIDGET_TAG)) void main();
