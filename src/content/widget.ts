import mascot from "../assets/mascot.svg";
import { VOICES, voiceLabel } from "../shared/voices";
import { WIDGET_TAG } from "./extract";
import { saveSettings, type Settings } from "./settings";
import styles from "./widget.css";

export type Mood = "idle" | "thinking" | "talking";

export interface WidgetHandlers {
  toggle(): void;
  previous(): void;
  next(): void;
  stop(): void;
  pick(): void;
  openNotes(): void;
  rate(rate: number): void;
  voice(voice: string): void;
  noteExcerpt(): string;
  saveNote(note: string, excerpt: string): Promise<void>;
  noteClosed(): void;
}

export interface Widget {
  host: HTMLElement;
  setStatus(text: string): void;
  setMood(mood: Mood): void;
  setPlaying(playing: boolean): void;
  setPicking(picking: boolean): void;
}

const MASCOT_SIZE = 60;
const EDGE_GAP = 8;
const PANEL_WIDTH = 286;
const PANEL_HEIGHT = 380;
const DRAG_THRESHOLD = 5;

const PLAY_ICON = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;

const TEMPLATE = `
<div class="root" data-mood="idle">
  <section class="panel" aria-label="Clipperzinho reading controls" hidden>
    <p class="status" role="status" aria-live="polite"></p>
    <div class="controls">
      <button type="button" data-action="previous" aria-label="Previous sentence" title="Previous sentence">
        <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12l8.5 6V6z"/></svg>
      </button>
      <button type="button" class="primary" data-action="toggle" aria-label="Play" title="Play / pause (Alt+Shift+R)">${PLAY_ICON}</button>
      <button type="button" data-action="next" aria-label="Next sentence" title="Next sentence">
        <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>
      </button>
      <button type="button" data-action="stop" aria-label="Stop reading" title="Stop reading">
        <svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
      </button>
      <button type="button" data-action="pick" aria-label="Read from a spot I click" aria-pressed="false" title="Read from a spot I click">
        <svg class="line" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>
      </button>
      <button type="button" data-action="note" aria-label="Add a note" title="Add a note with a snapshot">
        <svg class="line" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>
      </button>
      <button type="button" data-action="notes" aria-label="Open saved notes" title="Open saved notes">
        <svg class="line" viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>
      </button>
    </div>
    <label class="field">Speed
      <input type="range" name="rate" min="0.5" max="3" step="0.1" />
      <output></output>
    </label>
    <label class="field">Voice
      <select name="voice"></select>
    </label>
    <form class="note" hidden>
      <blockquote class="excerpt"></blockquote>
      <textarea name="note" aria-label="Note" placeholder="What do you want to remember?" required></textarea>
      <p class="note-error" role="alert"></p>
      <div class="note-actions">
        <button type="button" data-action="note-cancel">Cancel</button>
        <button type="submit">Save note</button>
      </div>
    </form>
  </section>
  <button type="button" class="mascot" aria-label="Clipperzinho reading assistant" aria-expanded="false">${mascot}</button>
</div>`;

// Parsed rather than assigned to innerHTML, which Trusted Types pages reject.
function parse(markup: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const fragment = document.createDocumentFragment();
  fragment.append(...parsed.body.childNodes);
  return fragment;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, EDGE_GAP), Math.max(EDGE_GAP, max));
}

export function createWidget(settings: Settings, handlers: WidgetHandlers): Widget {
  const host = document.createElement(WIDGET_TAG);
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  shadow.adoptedStyleSheets = [sheet];
  shadow.append(parse(TEMPLATE));

  const find = <T extends Element>(selector: string) => shadow.querySelector<T>(selector)!;
  const root = find<HTMLElement>(".root");
  const panel = find<HTMLElement>(".panel");
  const status = find<HTMLElement>(".status");
  const mascotButton = find<HTMLButtonElement>(".mascot");
  const toggleButton = find<HTMLButtonElement>("[data-action='toggle']");
  const pickButton = find<HTMLButtonElement>("[data-action='pick']");
  const rateInput = find<HTMLInputElement>("[name='rate']");
  const rateOutput = find<HTMLOutputElement>("output");
  const voiceSelect = find<HTMLSelectElement>("[name='voice']");
  const noteForm = find<HTMLFormElement>(".note");
  const noteExcerpt = find<HTMLElement>(".excerpt");
  const noteText = find<HTMLTextAreaElement>("[name='note']");
  const noteError = find<HTMLElement>(".note-error");
  const noteSubmit = find<HTMLButtonElement>("[type='submit']");

  let position = settings.position;

  const place = (next: Settings["position"]) => {
    position = {
      right: clamp(next.right, innerWidth - MASCOT_SIZE - EDGE_GAP),
      bottom: clamp(next.bottom, innerHeight - MASCOT_SIZE - EDGE_GAP),
    };
    host.style.right = `${position.right}px`;
    host.style.bottom = `${position.bottom}px`;
    root.classList.toggle("flip-x", innerWidth - position.right < PANEL_WIDTH + EDGE_GAP);
    root.classList.toggle("flip-y", innerHeight - position.bottom - MASCOT_SIZE < PANEL_HEIGHT);
  };

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    mascotButton.setAttribute("aria-expanded", String(open));
    saveSettings({ open });
  };

  const showRate = (rate: number) => {
    rateOutput.textContent = `${rate.toFixed(1)}×`;
  };

  const closeNote = () => {
    noteForm.hidden = true;
    noteText.value = "";
    noteError.textContent = "";
    handlers.noteClosed();
  };

  const openNote = () => {
    if (!noteForm.hidden) return;
    noteExcerpt.textContent = handlers.noteExcerpt();
    noteForm.hidden = false;
    noteText.focus();
  };

  const actions: Record<string, () => void> = {
    toggle: handlers.toggle,
    previous: handlers.previous,
    next: handlers.next,
    stop: handlers.stop,
    pick: handlers.pick,
    notes: handlers.openNotes,
    note: openNote,
    "note-cancel": closeNote,
  };

  root.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action) actions[action]?.();
  });

  // Keeps the page's text selection alive so "read selection" and note excerpts still see it.
  root.addEventListener("mousedown", (event) => {
    if ((event.target as Element).closest("button")) event.preventDefault();
  });

  // Typing in the widget must not trigger the page's own keyboard shortcuts.
  for (const type of ["keydown", "keyup", "keypress"] as const) {
    root.addEventListener(type, (event) => {
      if (type === "keydown" && event.key === "Escape" && !noteForm.hidden) closeNote();
      event.stopPropagation();
    });
  }

  for (const voice of VOICES) voiceSelect.add(new Option(voiceLabel(voice), voice));
  voiceSelect.value = settings.voice;
  voiceSelect.addEventListener("change", () => {
    saveSettings({ voice: voiceSelect.value });
    handlers.voice(voiceSelect.value);
  });

  rateInput.value = String(settings.rate);
  showRate(settings.rate);
  rateInput.addEventListener("input", () => {
    const rate = Number(rateInput.value);
    showRate(rate);
    saveSettings({ rate });
    handlers.rate(rate);
  });

  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const note = noteText.value.trim();
    if (!note) return;
    noteSubmit.disabled = true;
    noteError.textContent = "";
    try {
      await handlers.saveNote(note, noteExcerpt.textContent ?? "");
      closeNote();
    } catch (error) {
      noteError.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      noteSubmit.disabled = false;
    }
  });

  let drag: { x: number; y: number; origin: Settings["position"]; moved: boolean } | undefined;
  let justDragged = false;

  mascotButton.addEventListener("pointerdown", (event) => {
    drag = { x: event.clientX, y: event.clientY, origin: position, moved: false };
    mascotButton.setPointerCapture(event.pointerId);
  });

  mascotButton.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    place({ right: drag.origin.right - dx, bottom: drag.origin.bottom - dy });
  });

  const endDrag = () => {
    if (drag?.moved) {
      saveSettings({ position });
      justDragged = true;
      setTimeout(() => (justDragged = false));
    }
    drag = undefined;
  };
  mascotButton.addEventListener("pointerup", endDrag);
  mascotButton.addEventListener("pointercancel", endDrag);

  mascotButton.addEventListener("click", () => {
    if (!justDragged) setOpen(panel.hasAttribute("hidden"));
  });

  addEventListener("resize", () => place(position));

  place(position);
  panel.hidden = !settings.open;
  mascotButton.setAttribute("aria-expanded", String(settings.open));

  return {
    host,
    setStatus: (text) => {
      status.textContent = text;
    },
    setMood: (mood) => {
      root.dataset.mood = mood;
    },
    setPlaying: (playing) => {
      toggleButton.replaceChildren(parse(playing ? PAUSE_ICON : PLAY_ICON));
      toggleButton.setAttribute("aria-label", playing ? "Pause" : "Play");
    },
    setPicking: (picking) => {
      pickButton.setAttribute("aria-pressed", String(picking));
    },
  };
}
