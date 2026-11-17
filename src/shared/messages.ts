export type TtsCommand =
  | {
      type: "tts/load";
      sessionId: string;
      sentences: string[];
      index: number;
      voice: string;
      rate: number;
      autoplay: boolean;
    }
  | { type: "tts/play"; sessionId: string }
  | { type: "tts/pause"; sessionId: string }
  | { type: "tts/seek"; sessionId: string; index: number }
  | { type: "tts/rate"; sessionId: string; rate: number }
  | { type: "tts/voice"; sessionId: string; voice: string }
  | { type: "tts/stop"; sessionId: string };

export type TtsEvent = { sessionId: string } & (
  | { type: "event/model"; progress: number }
  | { type: "event/buffering"; index: number }
  | { type: "event/sentence"; index: number; duration: number }
  | { type: "event/time"; index: number; time: number }
  | { type: "event/finished" }
  | { type: "event/stopped" }
  | { type: "event/error"; message: string }
);

export interface NoteDraft {
  note: string;
  excerpt: string;
  url: string;
  title: string;
}

export type ContentRequest =
  | TtsCommand
  | ({ type: "note/save" } & NoteDraft)
  | { type: "notes/open" };

export type BackgroundMessage = { target: "background" } & (
  | ContentRequest
  | { type: "tts/event"; tabId: number; event: TtsEvent }
);

export type OffscreenMessage = { target: "offscreen"; tabId: number } & (
  | TtsCommand
  | { type: "tts/tab-closed" }
);

export type ContentMessage = TtsEvent | { type: "command/toggle" };

export interface Reply {
  ok: boolean;
  error?: string;
}
