# Clipperzinho

A Chrome extension that puts a small assistant on every page. It reads the page aloud with a local open-source voice model ([Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), Apache-2.0), highlights the sentence and word being spoken, and saves notes with a snapshot of the page.

## Install

```sh
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked** and select `dist/`. Requires Chrome 128+.

## Use

- Click the mascot (bottom right, draggable) to open the controls.
- **Play** reads the page; if text is selected, only the selection is read. `Alt+Shift+R` toggles play/pause.
- **Previous / next** move one sentence. The **target** button lets you click a spot on the page to read from there.
- **Speed** goes from 0.5× to 3× and applies immediately; **Voice** offers the 28 English Kokoro voices.
- The **pencil** pauses reading and saves a note with a screenshot and the sentence being read. The **list** button (or the toolbar icon) opens the notes page, where notes can be searched, edited, deleted and exported to Markdown.

## What runs where

| Part | Role |
|---|---|
| `src/content/` | Mascot widget (Shadow DOM), text extraction, highlighting via the CSS Custom Highlight API |
| `src/offscreen/offscreen.ts` | Sentence queue and audio playback |
| `src/offscreen/synthesizer.ts` | Web Worker running Kokoro on WebGPU, or multi-threaded WASM when WebGPU is unavailable |
| `src/background.ts` | Message routing, screenshots, notes storage |
| `src/notes/` | Notes page |

Speech is synthesized on this machine; page text is never sent anywhere. The only network access is the first play, which downloads the model (~330 MB) and the chosen voice (~0.5 MB) from Hugging Face into the browser cache.

## Limits

- English only.
- Sentence highlighting is exact; word highlighting is estimated from word lengths, because the model does not return word timings.
- Reads DOM text, so Chrome's PDF viewer, canvas-rendered pages and `chrome://` pages are not supported.

## Develop

```sh
npm run typecheck
npm test
npm run build
```
