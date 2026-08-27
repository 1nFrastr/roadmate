import { DEVICE_W } from "../constants";

export const DEVICE_DOCK_TRANSFORM_ORIGIN = "center center";
export const DEVICE_STAGE_TRANSFORM_ORIGIN = "center center";

/** Two device discs overlap when center distance is less than one diameter */
export const PAIRING_OVERLAP_DISTANCE = DEVICE_W;

/** During pairing countdown, cancel only after pulling apart past this distance (hysteresis against edge jitter) */
export const PAIRING_OVERLAP_EXIT_DISTANCE = DEVICE_W * 1.08;

/** How long to keep contact after overlap before match success (ms) */
export const MATCH_CONFIRM_HOLD_MS = 1000;

/** Demo shared-topic pool (show up to 3) */
export const PLACEHOLDER_MATCH_TOPICS = [
  "Indie Games",
  "Vinyl Records",
  "Road Trips",
  "Specialty Coffee",
  "Film Photography",
  "City Walk",
  "Sci-Fi Movies",
  "Hiking & Camping",
] as const;

export function pickMatchTopics(count = 3): string[] {
  const pool = [...PLACEHOLDER_MATCH_TOPICS];
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]!);
  }
  return picked;
}
