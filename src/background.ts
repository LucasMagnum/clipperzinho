import type { BackgroundMessage, ContentMessage, OffscreenMessage, Reply } from "./shared/messages";
import { addHighlight } from "./shared/highlightIndex";
import { addNote } from "./shared/notesStore";

let creatingOffscreen: Promise<void> | undefined;

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      // Audio-only documents are closed after 30 s of silence, which would drop the
      // loaded model on every long pause; clips are also served from blob URLs.
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK, chrome.offscreen.Reason.BLOBS],
      justification: "Synthesize speech with a local model and play it while a page is read aloud.",
    })
    .finally(() => {
      creatingOffscreen = undefined;
    });
  await creatingOffscreen;
}

function toTab(tabId: number, message: ContentMessage): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

async function commandToTab(tabId: number, message: ContentMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Tabs opened before the extension was installed or reloaded have no live content script.
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tabId, message);
  }
}

async function toOffscreen(message: OffscreenMessage): Promise<Reply> {
  return chrome.runtime.sendMessage(message);
}

async function handle(message: BackgroundMessage, sender: chrome.runtime.MessageSender): Promise<Reply> {
  switch (message.type) {
    case "tts/event":
      toTab(message.tabId, message.event);
      return { ok: true };
    case "settings/open":
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    case "note/save": {
      const { target: _target, type: _type, ...draft } = message;
      const screenshot = await chrome.tabs.captureVisibleTab(sender.tab!.windowId, { format: "jpeg", quality: 85 });
      await addNote(draft, screenshot);
      if (draft.kind === "highlight") await addHighlight(draft.url, draft.excerpt);
      return { ok: true };
    }
    default:
      await ensureOffscreen();
      return toOffscreen({ ...message, target: "offscreen", tabId: sender.tab!.id! });
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  if (message.target !== "background") return;
  handle(message, sender).then(sendResponse, (error: unknown) => sendResponse({ ok: false, error: String(error) }));
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) commandToTab(tab.id, { type: "command/open" }).catch(() => {});
});

const COMMANDS: Record<string, ContentMessage> = {
  "toggle-reading": { type: "command/toggle" },
  "open-command-center": { type: "command/open" },
};

chrome.commands.onCommand.addListener((command, tab) => {
  const message = COMMANDS[command];
  if (message && tab?.id !== undefined) commandToTab(tab.id, message).catch(() => {});
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (await chrome.offscreen.hasDocument()) {
    toOffscreen({ target: "offscreen", type: "tts/tab-closed", tabId }).catch(() => {});
  }
});
