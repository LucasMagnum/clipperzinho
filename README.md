# Clipperzinho

A Chrome extension that puts a small assistant on every page. It reads the page aloud with a local open-source voice model ([Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), Apache-2.0), highlights the sentence and word being spoken, and saves notes with a snapshot of the page.

## Install

```sh
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked** and select `dist/`. Requires Chrome 128+.

## Use

- Press `Alt+Shift+C` (or click the toolbar icon) to open the **command center** at the mouse pointer. Drag it by its header or any empty area to move it. Press the shortcut again, `Esc`, or click elsewhere to close it.
- **Play** reads the selection if there is one, otherwise from the sentence under the pointer, otherwise the whole page. The command center then collapses into a **reading bar** at the bottom of the page with play/pause, previous/next sentence, note, expand and close.
- `Alt+Shift+R` plays or pauses without opening anything. Both shortcuts can be changed at `chrome://extensions/shortcuts`.
- **Take a note** (`⌥N` / `Alt+N`) pauses and saves a note with a screenshot and the sentence being read.
- **Highlight sentence** (`⌥H` / `Alt+H`) marks the sentence, saves it, and marks it again on later visits while the same text is on the page.
- **Follow along** scrolls the page to the spoken sentence. **Speed** steps from 0.5× to 3×; **Voice** offers the 28 English Kokoro voices.
- **All settings** opens the settings page, which links to the notes page where notes and highlights can be searched, edited, deleted and exported to Markdown.

## What runs where

| Part | Role |
|---|---|
| `src/content/` | Command center and reading bar (Shadow DOM), text extraction, highlighting via the CSS Custom Highlight API |
| `src/offscreen/offscreen.ts` | Sentence queue and audio playback |
| `src/offscreen/synthesizer.ts` | Web Worker running Kokoro on WebGPU, or multi-threaded WASM when WebGPU is unavailable |
| `src/background.ts` | Message routing, screenshots, notes storage |
| `src/notes/`, `src/settings/` | Notes and settings pages |

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
