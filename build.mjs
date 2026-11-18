import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const outdir = "dist";
const ortDist = "node_modules/@huggingface/transformers/dist";
const pdfjs = "node_modules/pdfjs-dist";

const shared = {
  bundle: true,
  outdir,
  platform: "browser",
  target: "chrome128",
  loader: { ".css": "text" },
  logLevel: "info",
};

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/ort`, { recursive: true });

await Promise.all([
  build({
    ...shared,
    format: "esm",
    entryPoints: {
      background: "src/background.ts",
      offscreen: "src/offscreen/offscreen.ts",
      synthesizer: "src/offscreen/synthesizer.ts",
      notes: "src/notes/notes.ts",
      settings: "src/settings/settings.ts",
      pdf: "src/pdf/pdf.ts",
    },
  }),
  // Content scripts cannot be ES modules.
  build({ ...shared, format: "iife", entryPoints: { content: "src/content/index.ts" } }),
  cp("src/manifest.json", `${outdir}/manifest.json`),
  cp("src/offscreen/offscreen.html", `${outdir}/offscreen.html`),
  cp("src/notes/notes.html", `${outdir}/notes.html`),
  cp("src/notes/notes.css", `${outdir}/notes.css`),
  cp("src/settings/settings.html", `${outdir}/settings.html`),
  cp("src/settings/settings.css", `${outdir}/settings.css`),
  cp("src/content/page.css", `${outdir}/content.css`),
  cp("src/pdf/pdf.html", `${outdir}/pdf.html`),
  cp("src/pdf/pdf.css", `${outdir}/pdf.css`),
  cp(`${pdfjs}/build/pdf.worker.min.mjs`, `${outdir}/pdfjs/pdf.worker.mjs`),
  ...["cmaps", "standard_fonts", "wasm", "iccs"].map((assets) =>
    cp(`${pdfjs}/${assets}`, `${outdir}/pdfjs/${assets}`, { recursive: true }),
  ),
  cp("src/assets/icons", `${outdir}/icons`, { recursive: true }),
  // MV3 forbids remote code, so the ONNX runtime ships inside the extension.
  cp(`${ortDist}/ort-wasm-simd-threaded.jsep.mjs`, `${outdir}/ort/ort-wasm-simd-threaded.jsep.mjs`),
  cp(`${ortDist}/ort-wasm-simd-threaded.jsep.wasm`, `${outdir}/ort/ort-wasm-simd-threaded.jsep.wasm`),
]);
