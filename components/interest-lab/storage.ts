import { DEFAULT_EMBEDDING_MODEL, DEFAULT_LLM_MODEL, STORAGE_KEYS } from "./constants";
import type { ApiKeys, StoredInterestProfile } from "./types";

export interface LabSettings {
  llmModel: string;
  embeddingModel: string;
}

const DEPRECATED_LLM_MODELS = new Set([
  "google/gemini-2.5-flash-preview",
  "google/gemini-2.5-flash",
]);

const DEFAULT_SETTINGS: LabSettings = {
  llmModel: DEFAULT_LLM_MODEL,
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
};

function normalizeSettings(settings: LabSettings): LabSettings {
  const llmModel = DEPRECATED_LLM_MODELS.has(settings.llmModel)
    ? DEFAULT_LLM_MODEL
    : settings.llmModel || DEFAULT_LLM_MODEL;
  const embeddingModel = settings.embeddingModel || DEFAULT_EMBEDDING_MODEL;
  return { llmModel, embeddingModel };
}

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

export function loadApiKeys(): ApiKeys {
  return readJson<ApiKeys>(STORAGE_KEYS.apiKeys, {
    openRouterKey: "",
    twitterApiKey: "",
  });
}

export function saveApiKeys(keys: ApiKeys) {
  writeJson(STORAGE_KEYS.apiKeys, keys);
}

export function loadSettings(): LabSettings {
  const settings = readJson<LabSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  const normalized = normalizeSettings(settings);
  if (
    normalized.llmModel !== settings.llmModel ||
    normalized.embeddingModel !== settings.embeddingModel
  ) {
    writeJson(STORAGE_KEYS.settings, normalized);
  }
  return normalized;
}

export function saveSettings(settings: LabSettings) {
  writeJson(STORAGE_KEYS.settings, settings);
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
