export interface SynthesisRequest {
  text: string;
  voice: string;
}

export type SynthesisResponse =
  | { type: "progress"; progress: number }
  | { type: "clip"; wav: ArrayBuffer; duration: number }
  | { type: "error"; message: string };
