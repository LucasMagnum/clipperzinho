import { DEFAULT_VOICE } from "./voices";

export interface Settings {
  rate: number;
  voice: string;
  followAlong: boolean;
}

export const MIN_RATE = 0.5;
export const MAX_RATE = 3;
export const RATE_STEP = 0.25;

const DEFAULTS: Settings = {
  rate: 1,
  voice: DEFAULT_VOICE,
  followAlong: true,
};

export async function loadSettings(): Promise<Settings> {
  return chrome.storage.local.get<Settings>(DEFAULTS);
}

export function saveSettings(changes: Partial<Settings>): void {
  chrome.storage.local.set(changes).catch(() => {});
}

export function steppedRate(rate: number, direction: 1 | -1): number {
  const stepped = Math.round(rate / RATE_STEP + direction) * RATE_STEP;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, stepped));
}

export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}
