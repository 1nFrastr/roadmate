export const MATCH_ROADMATES_KEY = "roadmate:match-to-roadmates";

export function saveMatchRoadmatesEntrance(): void {
  sessionStorage.setItem(MATCH_ROADMATES_KEY, "1");
}

export function consumeMatchRoadmatesEntrance(): boolean {
  if (typeof window === "undefined") return false;
  const value = sessionStorage.getItem(MATCH_ROADMATES_KEY);
  if (!value) return false;
  sessionStorage.removeItem(MATCH_ROADMATES_KEY);
  return true;
}
