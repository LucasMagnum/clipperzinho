import { KokoroTTS, env } from "kokoro-js";
import type { SynthesisRequest, SynthesisResponse } from "./synthesis";

type Voice = NonNullable<Parameters<KokoroTTS["generate"]>[1]>["voice"];

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

env.wasmPaths = new URL("ort/", self.location.href).href;

let model: Promise<KokoroTTS> | undefined;
let reportedPercent = -1;

function post(message: SynthesisResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

async function preferredDevice(): Promise<"webgpu" | "wasm"> {
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
  return adapter ? "webgpu" : "wasm";
}

// Measured on a 28 s passage (16-core Mac, 4 WASM threads), synthesis time as a share
// of audio length: q8/wasm 0.80, fp32/wasm 0.45, fp32/webgpu under 0.34. Only fp32
// stays ahead of playback at the faster reading speeds; its WebGPU output was checked
// against WASM (waveform correlation above 0.99), which quantized dtypes do not guarantee.
async function createModel(): Promise<KokoroTTS> {
  return KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: "fp32",
    device: await preferredDevice(),
    progress_callback: (progress) => {
      if (progress.status !== "progress" || !progress.file.endsWith(".onnx")) return;
      const percent = Math.floor(progress.progress);
      if (percent === reportedPercent) return;
      reportedPercent = percent;
      post({ type: "progress", progress: percent / 100 });
    },
  });
}

function loadModel(): Promise<KokoroTTS> {
  model ??= createModel();
  model.catch(() => {
    model = undefined;
  });
  return model;
}

self.addEventListener("message", async ({ data }: MessageEvent<SynthesisRequest>) => {
  try {
    const tts = await loadModel();
    const audio = await tts.generate(data.text, { voice: data.voice as Voice });
    const wav = audio.toWav();
    post({ type: "clip", wav, duration: audio.audio.length / audio.sampling_rate }, [wav]);
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
