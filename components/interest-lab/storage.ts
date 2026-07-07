import { STORAGE_KEYS } from "./constants";
import type { PostRecord, StoredInterestProfile } from "./types";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export interface InterestLabDraft {
  posts: PostRecord[];
  twitterHandle: string;
}

export function loadDraft(): InterestLabDraft {
  return readJson<InterestLabDraft>(STORAGE_KEYS.draft, { posts: [], twitterHandle: "" });
}

export function saveDraft(draft: InterestLabDraft) {
  writeJson(STORAGE_KEYS.draft, draft);
}

export function loadProfiles(): StoredInterestProfile[] {
  return readJson<StoredInterestProfile[]>(STORAGE_KEYS.profiles, []);
}

export function saveProfile(profile: StoredInterestProfile) {
  const profiles = loadProfiles();
  const next = [profile, ...profiles.filter((item) => item.id !== profile.id)].slice(0, 20);
  writeJson(STORAGE_KEYS.profiles, next);
  return next;
}

export function deleteProfile(id: string) {
  const next = loadProfiles().filter((item) => item.id !== id);
  writeJson(STORAGE_KEYS.profiles, next);
  return next;
}
