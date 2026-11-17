import type { BackgroundMessage, OffscreenMessage, Reply, TtsCommand, TtsEvent } from "../shared/messages";
import type { SynthesisRequest, SynthesisResponse } from "./synthesis";

type EventBody = TtsEvent extends infer E ? (E extends unknown ? Omit<E, "sessionId"> : never) : never;

interface Clip {
  url: string;
  duration: number;
}

interface Session {
  id: string;
  tabId: number;
  sentences: string[];
  voice: string;
  rate: number;
  index: number;
  playing: boolean;
  clips: Map<number, Promise<Clip>>;
}

const LOOKAHEAD = 2;
const KEEP_BEHIND = 2;
const TIME_REPORT_MS = 80;

// Inference runs in a worker so it cannot stall audio events on this page.
const synthesizer = new Worker("synthesizer.js", { type: "module" });
const player = new Audio();
player.preservesPitch = true;

let session: Session | undefined;
let loadedIndex = -1;
let synthesisQueue: Promise<unknown> = Promise.resolve();
let awaitedClip: PromiseWithResolvers<Clip> | undefined;
let timeReporter: ReturnType<typeof setInterval> | undefined;

function emit(target: Session, event: EventBody): void {
  const message: BackgroundMessage = {
    target: "background",
    type: "tts/event",
    tabId: target.tabId,
    event: { ...event, sessionId: target.id } as TtsEvent,
  };
  chrome.runtime.sendMessage(message).catch(() => {});
}

function fail(target: Session, message: string): void {
  target.playing = false;
  emit(target, { type: "event/error", message });
}

function startPlayback(target: Session): void {
  player.play().catch((error: DOMException) => {
    // AbortError only means a pause or seek landed before playback began.
    if (error.name !== "AbortError" && target === session) fail(target, error.message);
  });
}

function isWanted(target: Session, index: number): boolean {
  return target === session && index >= target.index && index <= target.index + LOOKAHEAD;
}

function synthesize(target: Session, index: number): Promise<Clip> {
  if (!isWanted(target, index)) {
    target.clips.delete(index);
    return Promise.reject(new Error("Synthesis no longer needed"));
  }
  awaitedClip = Promise.withResolvers<Clip>();
  const request: SynthesisRequest = { text: target.sentences[index]!, voice: target.voice };
  synthesizer.postMessage(request);
  return awaitedClip.promise;
}

function clipFor(target: Session, index: number): Promise<Clip> {
  let clip = target.clips.get(index);
  if (!clip) {
    // The worker holds one model, so requests go to it one at a time.
    clip = synthesisQueue.then(() => synthesize(target, index));
    synthesisQueue = clip.catch(() => {});
    target.clips.set(index, clip);
  }
  return clip;
}

function release(clip: Promise<Clip>): void {
  clip.then(({ url }) => URL.revokeObjectURL(url)).catch(() => {});
}

function evictDistantClips(target: Session): void {
  for (const [index, clip] of target.clips) {
    if (index < target.index - KEEP_BEHIND || index > target.index + LOOKAHEAD) {
      target.clips.delete(index);
      release(clip);
    }
  }
}

function isCurrent(target: Session, index: number): boolean {
  return target === session && target.index === index;
}

async function playFrom(target: Session, index: number): Promise<void> {
  player.pause();
  loadedIndex = -1;
  if (index >= target.sentences.length) {
    endSession();
    emit(target, { type: "event/finished" });
    return;
  }
  target.index = index;
  evictDistantClips(target);
  emit(target, { type: "event/buffering", index });

  const pending = clipFor(target, index);
  for (let ahead = index + 1; ahead <= index + LOOKAHEAD && ahead < target.sentences.length; ahead++) {
    clipFor(target, ahead).catch(() => {});
  }

  let clip: Clip;
  try {
    clip = await pending;
  } catch (error) {
    if (isCurrent(target, index)) {
      target.clips.delete(index);
      fail(target, error instanceof Error ? error.message : String(error));
    }
    return;
  }
  if (!isCurrent(target, index)) return;

  player.src = clip.url;
  player.defaultPlaybackRate = target.rate;
  player.playbackRate = target.rate;
  loadedIndex = index;
  emit(target, { type: "event/sentence", index, duration: clip.duration });
  if (target.playing) startPlayback(target);
}

function endSession(): void {
  if (!session) return;
  player.pause();
  player.removeAttribute("src");
  loadedIndex = -1;
  for (const clip of session.clips.values()) release(clip);
  session = undefined;
}

function load(command: Extract<TtsCommand, { type: "tts/load" }>, tabId: number): void {
  const previous = session;
  endSession();
  if (previous && previous.tabId !== tabId) emit(previous, { type: "event/stopped" });
  session = {
    id: command.sessionId,
    tabId,
    sentences: command.sentences,
    voice: command.voice,
    rate: command.rate,
    index: command.index,
    playing: command.autoplay,
    clips: new Map(),
  };
  void playFrom(session, command.index);
}

function handle(message: OffscreenMessage): Reply {
  if (message.type === "tts/tab-closed") {
    if (session?.tabId === message.tabId) endSession();
    return { ok: true };
  }
  if (message.type === "tts/load") {
    load(message, message.tabId);
    return { ok: true };
  }
  if (!session || session.id !== message.sessionId) return { ok: false };

  switch (message.type) {
    case "tts/play":
      session.playing = true;
      if (loadedIndex === session.index) startPlayback(session);
      break;
    case "tts/pause":
      session.playing = false;
      player.pause();
      break;
    case "tts/seek":
      void playFrom(session, Math.max(0, message.index));
      break;
    case "tts/rate":
      session.rate = message.rate;
      player.defaultPlaybackRate = message.rate;
      player.playbackRate = message.rate;
      break;
    case "tts/voice":
      session.voice = message.voice;
      for (const clip of session.clips.values()) release(clip);
      session.clips.clear();
      void playFrom(session, session.index);
      break;
    case "tts/stop":
      endSession();
      break;
  }
  return { ok: true };
}

synthesizer.addEventListener("message", ({ data }: MessageEvent<SynthesisResponse>) => {
  switch (data.type) {
    case "progress":
      if (session) emit(session, { type: "event/model", progress: data.progress });
      break;
    case "clip":
      awaitedClip?.resolve({
        url: URL.createObjectURL(new Blob([data.wav], { type: "audio/wav" })),
        duration: data.duration,
      });
      break;
    case "error":
      awaitedClip?.reject(new Error(data.message));
      break;
  }
});

synthesizer.addEventListener("error", (event) => {
  awaitedClip?.reject(new Error(event.message || "The voice engine failed to start."));
});

player.addEventListener("ended", () => {
  if (session) void playFrom(session, session.index + 1);
});

player.addEventListener("error", () => {
  if (session && player.error) fail(session, player.error.message || "The audio clip could not be played.");
});

player.addEventListener("play", () => {
  clearInterval(timeReporter);
  timeReporter = setInterval(() => {
    if (session && loadedIndex === session.index) {
      emit(session, { type: "event/time", index: loadedIndex, time: player.currentTime });
    }
  }, TIME_REPORT_MS);
});

player.addEventListener("pause", () => clearInterval(timeReporter));

chrome.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  if (message.target !== "offscreen") return;
  sendResponse(handle(message));
});
