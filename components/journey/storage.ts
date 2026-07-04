import type { JourneyLandingPayload } from "./types";
import { JOURNEY_STORAGE_KEY } from "./types";

export function saveJourneyLanding(payload: JourneyLandingPayload): void {
  sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(payload));
}

export function loadJourneyLanding(): JourneyLandingPayload | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(JOURNEY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JourneyLandingPayload;
  } catch {
    return null;
  }
}

export function clearJourneyLanding(): void {
  sessionStorage.removeItem(JOURNEY_STORAGE_KEY);
}
