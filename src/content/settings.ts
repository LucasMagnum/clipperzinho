import { DEFAULT_VOICE } from "../shared/voices";

export interface Settings {
  rate: number;
  voice: string;
  open: boolean;
  position: { right: number; bottom: number };
}

const DEFAULTS: Settings = {
  rate: 1,
  voice: DEFAULT_VOICE,
  open: false,
  position: { right: 24, bottom: 24 },
};

export async function loadSettings(): Promise<Settings> {
  return chrome.storage.local.get<Settings>(DEFAULTS);
}

export function saveSettings(changes: Partial<Settings>): void {
  chrome.storage.local.set(changes).catch(() => {});
}
