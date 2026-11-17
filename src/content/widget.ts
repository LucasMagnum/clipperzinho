import { formatRate, MAX_RATE, MIN_RATE, saveSettings, steppedRate, type Settings } from "../shared/settings";
import { VOICES, voiceLabel, voiceName } from "../shared/voices";
import { WIDGET_TAG } from "./extract";
import type { Point } from "./reader";
import styles from "./widget.css";

export interface WidgetState {
  title: string;
  detail: string;
  playing: boolean;
  speaking: boolean;
}

export type Anchor = Point | "bar" | undefined;

export interface WidgetHandlers {
  toggle(): void;
  previous(): void;
  next(): void;
  stop(): void;
  expand(): void;
  highlight(): void;
  openSettings(): void;
  rate(rate: number): void;
  voice(voice: string): void;
  noteExcerpt(): string;
  saveNote(note: string, excerpt: string): Promise<void>;
  noteClosed(): void;
}

export interface Widget {
  host: HTMLElement;
  readonly centerOpen: boolean;
  readonly noteOpen: boolean;
  render(state: WidgetState): void;
  showPreferences(): void;
  openCenter(anchor: Anchor): void;
  closeCenter(): void;
  openNote(): void;
  showBar(visible: boolean): void;
  flash(message: string): void;
}

type View = "main" | "voices" | "note";

const EDGE_GAP = 8;
const POINTER_OFFSET = 12;
const ABOVE_BAR = 88;
const METER_SEGMENTS = 10;
const FLASH_MS = 2200;

const filled = (path: string) => `<svg viewBox="0 0 24 24"><path d="${path}"/></svg>`;
const line = (body: string) => `<svg class="line" viewBox="0 0 24 24">${body}</svg>`;

const ICONS = {
  play: filled("M8 5v14l11-7z"),
  pause: filled("M6 5h4v14H6zM14 5h4v14h-4z"),
  previous: filled("M6 6h2v12H6zM9.5 12l8.5 6V6z"),
  next: filled("M16 6h2v12h-2zM6 18l8.5-6L6 6z"),
  note: line(`<path d="M4 20h4L19 9l-4-4L4 16z"/>`),
  highlight: line(`<path d="M9 11l6-6 4 4-6 6zM9 11l-3 3 4 4 3-3M4 21h7"/>`),
  follow: line(`<path d="M12 3a5 5 0 0 1 5 5v8a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5zM12 7v3"/>`),
  speed: line(`<path d="M5 17a8 8 0 1 1 14 0M12 13l4-4"/>`),
  voice: line(`<path d="M4 10v4M8 6v12M12 9v6M16 5v14M20 10v4"/>`),
  stop: line(`<path d="M7 7h10v10H7z"/>`),
  settings: line(`<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>`),
  minus: line(`<path d="M6 12h12"/>`),
  plus: line(`<path d="M12 6v12M6 12h12"/>`),
  right: line(`<path d="M9 6l6 6-6 6"/>`),
  left: line(`<path d="M15 6l-6 6 6 6"/>`),
  up: line(`<path d="M6 15l6-6 6 6"/>`),
  close: line(`<path d="M6 6l12 12M18 6L6 18"/>`),
};

const TEMPLATE = `
<div class="root">
  <section class="center surface" role="dialog" aria-label="Clipperzinho command center" hidden>
    <div data-view="main">
      <header class="hero">
        <button type="button" class="play" data-action="toggle" aria-label="Play">${ICONS.play}</button>
        <div class="heading"><strong class="title"></strong><span class="detail"></span></div>
        <button type="button" class="round" data-action="previous" aria-label="Previous sentence">${ICONS.previous}</button>
        <button type="button" class="round" data-action="next" aria-label="Next sentence">${ICONS.next}</button>
      </header>
      <button type="button" class="row" data-action="note">${ICONS.note}<span>Take a note</span><kbd>⌥N</kbd></button>
      <button type="button" class="row" data-action="highlight">${ICONS.highlight}<span>Highlight sentence</span><kbd>⌥H</kbd></button>
      <label class="row">${ICONS.follow}<span>Follow along</span><input type="checkbox" role="switch" name="follow" /></label>
      <div class="row speed">
        ${ICONS.speed}
        <div class="speed-label"><span>Speed</span><div class="meter" aria-hidden="true"></div></div>
        <button type="button" class="round" data-action="slower" aria-label="Slower">${ICONS.minus}</button>
        <output class="rate" aria-live="polite"></output>
        <button type="button" class="round" data-action="faster" aria-label="Faster">${ICONS.plus}</button>
      </div>
      <button type="button" class="row" data-action="voices">${ICONS.voice}<span>Voice</span><span class="value voice-name"></span>${ICONS.right}</button>
      <footer>
        <button type="button" data-action="stop">${ICONS.stop}Stop</button>
        <button type="button" data-action="settings">${ICONS.settings}All settings</button>
      </footer>
    </div>
    <div data-view="voices" hidden>
      <button type="button" class="row back" data-action="back">${ICONS.left}<span>Voice</span></button>
      <div class="voices" role="group" aria-label="Voices"></div>
    </div>
    <form data-view="note" hidden>
      <blockquote class="excerpt"></blockquote>
      <textarea name="note" aria-label="Note" placeholder="What do you want to remember?" required></textarea>
      <p class="note-error" role="alert"></p>
      <div class="note-actions">
        <button type="button" data-action="note-cancel">Cancel</button>
        <button type="submit">Save note</button>
      </div>
    </form>
  </section>
  <section class="bar surface" aria-label="Clipperzinho reading bar" hidden>
    <button type="button" class="play" data-action="toggle" aria-label="Play">${ICONS.play}</button>
    <div class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="heading"><strong class="title"></strong><span class="detail"></span></div>
    <button type="button" class="ghost" data-action="previous" aria-label="Previous sentence">${ICONS.previous}</button>
    <button type="button" class="ghost" data-action="next" aria-label="Next sentence">${ICONS.next}</button>
    <button type="button" class="ghost" data-action="note" aria-label="Take a note">${ICONS.note}</button>
    <button type="button" class="ghost" data-action="expand" aria-label="Open command center">${ICONS.up}</button>
    <button type="button" class="ghost" data-action="stop" aria-label="Stop and close">${ICONS.close}</button>
  </section>
  <p class="flash surface" role="status" hidden></p>
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
  const center = find<HTMLElement>(".center");
  const bar = find<HTMLElement>(".bar");
  const flashMessage = find<HTMLElement>(".flash");
  const views = [...center.querySelectorAll<HTMLElement>("[data-view]")];
  const meter = find<HTMLElement>(".meter");
  const rateOutput = find<HTMLOutputElement>(".rate");
  const followSwitch = find<HTMLInputElement>("[name='follow']");
  const voiceList = find<HTMLElement>(".voices");
  const noteForm = find<HTMLFormElement>("form");
  const noteExcerpt = find<HTMLElement>(".excerpt");
  const noteText = find<HTMLTextAreaElement>("[name='note']");
  const noteError = find<HTMLElement>(".note-error");
  const noteSubmit = find<HTMLButtonElement>("[type='submit']");

  let anchor: Anchor;
  let view: View = "main";
  let noteReturnsToMain = false;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const isOpen = () => !center.hasAttribute("hidden");

  const place = () => {
    // Layout size, because the bounding rect is scaled while the open animation runs.
    const { offsetWidth: width, offsetHeight: height } = center;
    const centered = (innerWidth - width) / 2;
    const [left, top] =
      anchor === "bar"
        ? [centered, innerHeight - ABOVE_BAR - height]
        : anchor
          ? [anchor.x + POINTER_OFFSET, anchor.y + POINTER_OFFSET]
          : [centered, (innerHeight - height) / 3];
    center.style.left = `${clamp(left, innerWidth - width - EDGE_GAP)}px`;
    center.style.top = `${clamp(top, innerHeight - height - EDGE_GAP)}px`;
  };

  const showView = (next: View) => {
    view = next;
    for (const element of views) element.hidden = element.dataset.view !== next;
    place();
  };

  const closeCenter = () => {
    center.hidden = true;
    if (shadow.activeElement instanceof HTMLElement) shadow.activeElement.blur();
  };

  const openCenter = (next: Anchor) => {
    anchor = next;
    center.hidden = false;
    showView("main");
    find<HTMLButtonElement>(".center .play").focus({ preventScroll: true });
  };

  const showPreferences = () => {
    rateOutput.textContent = formatRate(settings.rate);
    const lit = Math.round(((settings.rate - MIN_RATE) / (MAX_RATE - MIN_RATE)) * METER_SEGMENTS);
    [...meter.children].forEach((segment, index) => segment.classList.toggle("lit", index < lit));
    followSwitch.checked = settings.followAlong;
    find<HTMLElement>(".voice-name").textContent = voiceName(settings.voice);
    find<HTMLElement>(".bar .detail").textContent = `${voiceName(settings.voice)} · ${formatRate(settings.rate)}`;
    for (const option of voiceList.querySelectorAll<HTMLElement>("[data-voice]")) {
      option.setAttribute("aria-pressed", String(option.dataset.voice === settings.voice));
    }
  };

  const stepRate = (direction: 1 | -1) => {
    const rate = steppedRate(settings.rate, direction);
    saveSettings({ rate });
    handlers.rate(rate);
    showPreferences();
  };

  const closeNote = () => {
    noteText.value = "";
    noteError.textContent = "";
    if (noteReturnsToMain) showView("main");
    else closeCenter();
    handlers.noteClosed();
  };

  const openNote = () => {
    if (isOpen() && view === "note") return;
    noteReturnsToMain = isOpen();
    if (!isOpen()) {
      anchor = bar.hasAttribute("hidden") ? anchor : "bar";
      center.hidden = false;
    }
    noteExcerpt.textContent = handlers.noteExcerpt();
    showView("note");
    noteText.focus({ preventScroll: true });
  };

  const actions: Record<string, () => void> = {
    toggle: handlers.toggle,
    previous: handlers.previous,
    next: handlers.next,
    stop: handlers.stop,
    expand: handlers.expand,
    highlight: handlers.highlight,
    settings: handlers.openSettings,
    note: openNote,
    "note-cancel": closeNote,
    voices: () => showView("voices"),
    back: () => showView("main"),
    slower: () => stepRate(-1),
    faster: () => stepRate(1),
  };

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const voice = target.closest<HTMLElement>("[data-voice]")?.dataset.voice;
    if (voice) {
      saveSettings({ voice });
      handlers.voice(voice);
      showPreferences();
      showView("main");
      return;
    }
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action) actions[action]?.();
  });

  // Keeps the page's text selection alive so "read selection" and note excerpts still see it.
  root.addEventListener("mousedown", (event) => {
    if ((event.target as Element).closest("button")) event.preventDefault();
  });

  // Typing in the widget must not trigger the page's own keyboard shortcuts.
  for (const type of ["keydown", "keyup", "keypress"] as const) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }

  followSwitch.addEventListener("change", () => {
    settings.followAlong = followSwitch.checked;
    saveSettings({ followAlong: followSwitch.checked });
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

  for (let segment = 0; segment < METER_SEGMENTS; segment++) meter.append(document.createElement("i"));
  for (const voice of VOICES) {
    const option = document.createElement("button");
    option.type = "button";
    option.dataset.voice = voice;
    option.textContent = voiceLabel(voice);
    voiceList.append(option);
  }
  showPreferences();

  addEventListener("resize", () => {
    if (isOpen()) place();
  });

  return {
    host,
    get centerOpen() {
      return isOpen();
    },
    get noteOpen() {
      return isOpen() && view === "note";
    },
    render: ({ title, detail, playing, speaking }) => {
      find<HTMLElement>(".center .title").textContent = title;
      find<HTMLElement>(".center .detail").textContent = detail;
      find<HTMLElement>(".bar .title").textContent = title;
      root.classList.toggle("speaking", speaking);
      for (const button of shadow.querySelectorAll<HTMLButtonElement>(".play")) {
        button.replaceChildren(parse(playing ? ICONS.pause : ICONS.play));
        button.setAttribute("aria-label", playing ? "Pause" : "Play");
      }
    },
    showPreferences,
    openCenter,
    closeCenter,
    openNote,
    showBar: (visible) => {
      bar.hidden = !visible;
    },
    flash: (message) => {
      flashMessage.textContent = message;
      flashMessage.hidden = false;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => (flashMessage.hidden = true), FLASH_MS);
    },
  };
}
