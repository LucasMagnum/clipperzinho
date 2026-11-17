import { formatRate, loadSettings, MAX_RATE, MIN_RATE, RATE_STEP, saveSettings } from "../shared/settings";
import { VOICES, voiceLabel } from "../shared/voices";

const voice = document.querySelector<HTMLSelectElement>("#voice")!;
const rate = document.querySelector<HTMLInputElement>("#rate")!;
const rateValue = document.querySelector<HTMLOutputElement>("#rate-value")!;
const follow = document.querySelector<HTMLInputElement>("#follow")!;
const shortcuts = document.querySelector<HTMLDListElement>("#shortcuts")!;
const changeShortcuts = document.querySelector<HTMLButtonElement>("#change-shortcuts")!;

const IN_PAGE_SHORTCUTS = [
  { description: "Take a note", shortcut: "⌥N / Alt+N" },
  { description: "Highlight sentence", shortcut: "⌥H / Alt+H" },
];

function shortcutRow(description: string, shortcut: string): HTMLElement {
  const row = document.createElement("div");
  const term = Object.assign(document.createElement("dt"), { textContent: description });
  const value = document.createElement("dd");
  value.append(Object.assign(document.createElement("kbd"), { textContent: shortcut || "Not set" }));
  row.append(term, value);
  return row;
}

async function showSettings(): Promise<void> {
  const settings = await loadSettings();
  voice.value = settings.voice;
  rate.value = String(settings.rate);
  rateValue.textContent = formatRate(settings.rate);
  follow.checked = settings.followAlong;
}

async function showShortcuts(): Promise<void> {
  // Chrome also reports its built-in toolbar-button command, which has no description.
  const commands = (await chrome.commands.getAll()).filter((command) => command.description);
  shortcuts.replaceChildren(
    ...[...commands, ...IN_PAGE_SHORTCUTS].map(({ description, shortcut }) => shortcutRow(description ?? "", shortcut ?? "")),
  );
}

for (const id of VOICES) voice.add(new Option(voiceLabel(id), id));
Object.assign(rate, { min: String(MIN_RATE), max: String(MAX_RATE), step: String(RATE_STEP) });

voice.addEventListener("change", () => saveSettings({ voice: voice.value }));
follow.addEventListener("change", () => saveSettings({ followAlong: follow.checked }));
rate.addEventListener("input", () => {
  rateValue.textContent = formatRate(Number(rate.value));
  saveSettings({ rate: Number(rate.value) });
});
changeShortcuts.addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

chrome.storage.onChanged.addListener(() => void showSettings());
addEventListener("focus", () => void showShortcuts());

void showSettings();
void showShortcuts();
