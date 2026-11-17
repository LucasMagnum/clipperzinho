export const DEFAULT_VOICE = "af_heart";

export const VOICES = [
  "af_heart",
  "af_alloy",
  "af_aoede",
  "af_bella",
  "af_jessica",
  "af_kore",
  "af_nicole",
  "af_nova",
  "af_river",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_echo",
  "am_eric",
  "am_fenrir",
  "am_liam",
  "am_michael",
  "am_onyx",
  "am_puck",
  "am_santa",
  "bf_alice",
  "bf_emma",
  "bf_isabella",
  "bf_lily",
  "bm_daniel",
  "bm_fable",
  "bm_george",
  "bm_lewis",
] as const;

const ACCENTS: Record<string, string> = { a: "American", b: "British" };
const GENDERS: Record<string, string> = { f: "female", m: "male" };

export function voiceLabel(id: string): string {
  const name = id.slice(3);
  return `${name[0]!.toUpperCase()}${name.slice(1)} · ${ACCENTS[id[0]!]} ${GENDERS[id[1]!]}`;
}
