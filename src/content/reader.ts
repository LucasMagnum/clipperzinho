import type { ContentRequest, Reply, TtsCommand, TtsEvent } from "../shared/messages";
import { wordSpans } from "../shared/sentences";
import type { Settings } from "../shared/settings";
import { wordBoundaries, wordIndexAt } from "../shared/wordTimings";
import {
  extractPage,
  extractSelection,
  rangeOf,
  selectedRange,
  sentenceIndexAtPoint,
  type Sentence,
} from "./extract";
import { clearHighlights, showSentence, showWord } from "./highlighter";

export type ReaderView =
  | { kind: "idle" }
  | { kind: "empty" }
  | { kind: "downloading"; progress: number }
  | { kind: "buffering" }
  | { kind: "reading"; index: number; total: number }
  | { kind: "paused"; index: number; total: number }
  | { kind: "finished" }
  | { kind: "interrupted" }
  | { kind: "error"; message: string };

export interface Point {
  x: number;
  y: number;
}

export interface StartTarget {
  kind: "selection" | "cursor" | "page";
  sentences: Sentence[];
  index: number;
  selectionText: string;
}

type SessionCommand = TtsCommand extends infer C ? (C extends unknown ? Omit<C, "sessionId"> : never) : never;

export async function send(request: ContentRequest): Promise<Reply> {
  try {
    return await chrome.runtime.sendMessage({ ...request, target: "background" });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function findStartTarget(pointer: Point | undefined): StartTarget {
  const selection = selectedRange();
  if (selection) {
    return {
      kind: "selection",
      sentences: extractSelection(selection),
      index: 0,
      selectionText: selection.toString(),
    };
  }
  const sentences = extractPage();
  const index = pointer ? sentenceIndexAtPoint(sentences, pointer.x, pointer.y) : -1;
  return index === -1
    ? { kind: "page", sentences, index: 0, selectionText: "" }
    : { kind: "cursor", sentences, index, selectionText: "" };
}

export class Reader {
  private sentences: Sentence[] = [];
  private sessionId: string | undefined;
  private index = 0;
  private playing = false;
  private selectionText = "";
  private duration = 0;
  private wordRanges: (Range | undefined)[] = [];
  private boundaries: number[] = [];
  private shownWord = -1;

  constructor(
    private readonly preferences: Settings,
    private readonly render: (view: ReaderView) => void,
  ) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  get hasSession(): boolean {
    return this.sessionId !== undefined;
  }

  get currentSentence(): Sentence | undefined {
    return this.sessionId ? this.sentences[this.index] : undefined;
  }

  toggle(pointer: Point | undefined): void {
    if (this.playing) {
      this.pause();
      return;
    }
    const selectionText = selectedRange()?.toString() ?? "";
    if (this.sessionId && (!selectionText || selectionText === this.selectionText)) {
      this.resume();
    } else {
      this.start(findStartTarget(pointer));
    }
  }

  start(target: StartTarget): void {
    if (target.sentences.length === 0) {
      this.reset({ kind: "empty" });
      return;
    }
    this.sentences = target.sentences;
    // crypto.randomUUID is unavailable to content scripts on plain-http pages.
    this.sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.selectionText = target.selectionText;
    this.playing = true;
    void this.load(target.index);
  }

  pause(): void {
    if (!this.sessionId) return;
    this.playing = false;
    void this.command({ type: "tts/pause" });
    this.renderProgress();
  }

  resume(): void {
    if (!this.sessionId) return;
    this.playing = true;
    void this.sync({ type: "tts/play" });
    this.renderProgress();
  }

  previous(): void {
    this.seek(this.index - 1);
  }

  next(): void {
    this.seek(this.index + 1);
  }

  setRate(rate: number): void {
    this.preferences.rate = rate;
    if (this.sessionId) void this.sync({ type: "tts/rate", rate });
  }

  setVoice(voice: string): void {
    this.preferences.voice = voice;
    if (this.sessionId) void this.sync({ type: "tts/voice", voice });
  }

  stop(): void {
    if (this.sessionId) void this.command({ type: "tts/stop" });
    this.reset({ kind: "idle" });
  }

  handle(event: TtsEvent): void {
    if (event.sessionId !== this.sessionId) return;
    switch (event.type) {
      case "event/model":
        this.render({ kind: "downloading", progress: event.progress });
        break;
      case "event/buffering":
        this.index = event.index;
        this.render({ kind: "buffering" });
        break;
      case "event/sentence":
        this.index = event.index;
        this.duration = event.duration;
        this.showCurrentSentence();
        this.renderProgress();
        break;
      case "event/time":
        if (event.index === this.index) this.showWordAt(event.time);
        break;
      case "event/finished":
        this.reset({ kind: "finished" });
        break;
      case "event/stopped":
        this.reset({ kind: "interrupted" });
        break;
      case "event/error":
        this.reset({ kind: "error", message: event.message });
        break;
    }
  }

  private async load(index: number): Promise<void> {
    this.index = index;
    this.render({ kind: "buffering" });
    const reply = await this.command({
      type: "tts/load",
      sentences: this.sentences.map((sentence) => sentence.text),
      index,
      voice: this.preferences.voice,
      rate: this.preferences.rate,
      autoplay: this.playing,
    });
    if (!reply.ok) this.reset({ kind: "error", message: reply.error ?? "The voice engine did not start." });
  }

  private seek(index: number): void {
    if (!this.sessionId || index < 0 || index >= this.sentences.length) return;
    this.index = index;
    void this.sync({ type: "tts/seek", index });
  }

  private command(command: SessionCommand): Promise<Reply> {
    return send({ ...command, sessionId: this.sessionId! } as TtsCommand);
  }

  // Chrome may close the offscreen document while reading is paused, dropping the
  // session there; the queue lives here, so it is replayed from the current sentence.
  private async sync(command: SessionCommand): Promise<void> {
    const reply = await this.command(command);
    if (!reply.ok && this.sessionId) await this.load(this.index);
  }

  private showCurrentSentence(): void {
    const sentence = this.sentences[this.index]!;
    const words = wordSpans(sentence.text);
    this.boundaries = wordBoundaries(sentence.text, words);
    this.wordRanges = words.map(({ start, end }) => rangeOf(sentence, start, end));
    this.shownWord = -1;
    showSentence(rangeOf(sentence), this.preferences.followAlong);
  }

  private showWordAt(time: number): void {
    const word = wordIndexAt(this.boundaries, time / this.duration);
    if (word === this.shownWord) return;
    this.shownWord = word;
    showWord(this.wordRanges[word]);
  }

  private renderProgress(): void {
    this.render({
      kind: this.playing ? "reading" : "paused",
      index: this.index,
      total: this.sentences.length,
    });
  }

  private reset(view: ReaderView): void {
    this.sessionId = undefined;
    this.sentences = [];
    this.playing = false;
    clearHighlights();
    this.render(view);
  }
}
