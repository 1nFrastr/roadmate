import { STORAGE_KEYS } from "./constants";
import { resolveLlmModel, type LlmModelId } from "./llmModels";
import type { StoredInterestProfile } from "./types";

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

/** 帖子列表仅会话内使用，不写入 localStorage */
function stripPostsForStorage(profile: StoredInterestProfile): StoredInterestProfile {
  const { posts: _posts, ...rest } = profile;
  return rest;
}

export function loadProfiles(): StoredInterestProfile[] {
  const raw = readJson<StoredInterestProfile[]>(STORAGE_KEYS.profiles, []);
  const stripped = raw.map(stripPostsForStorage);
  if (raw.some((item) => item.posts?.length)) {
    writeJson(STORAGE_KEYS.profiles, stripped);
  }
  return stripped;
}

export function saveProfile(profile: StoredInterestProfile) {
  const profiles = loadProfiles();
  const stored = stripPostsForStorage(profile);
  const next = [stored, ...profiles.filter((item) => item.id !== stored.id)].slice(0, 20);
  writeJson(STORAGE_KEYS.profiles, next);
  return next;
}

export function deleteProfile(id: string) {
  const next = loadProfiles().filter((item) => item.id !== id);
  writeJson(STORAGE_KEYS.profiles, next);
  return next;
}

export function loadLlmModel(fallback?: string): LlmModelId {
  if (typeof window === "undefined") return resolveLlmModel(fallback);
  const stored = localStorage.getItem(STORAGE_KEYS.llmModel);
  return resolveLlmModel(stored ?? undefined, fallback);
}

export function saveLlmModel(model: LlmModelId) {
  localStorage.setItem(STORAGE_KEYS.llmModel, model);
}
