/** Product-spec / feature-copy posts: per-post LLM easily mis-extracts feature names — skip them */
const PRODUCT_SPEC_SIGNALS = [
  /road\s*mate/i,
  /cloud feature design/i,
  /\[light identity management\]/i,
  /\[light link management\]/i,
  /product principle:/i,
  /strangers.*utopia/i,
  /radar auto.?scan/i,
  /device tap/i,
  /match success animation/i,
  /digital identity\s*\(app/i,
];

/** Pure discussion of others / quote-replies with no matchable author anchor */
const THIRD_PARTY_ONLY_SIGNALS = [
  /this guest/i,
  /the host/i,
  /up.?s main/i,
  /comments? (?:section|said).*(?:well|right)/i,
];

export function shouldSkipTagExtraction(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const productHits = PRODUCT_SPEC_SIGNALS.filter((pattern) => pattern.test(trimmed)).length;
  if (productHits >= 2) return true;
  if (productHits >= 1 && /feature design|product principle|vision/i.test(trimmed)) return true;

  if (THIRD_PARTY_ONLY_SIGNALS.some((pattern) => pattern.test(trimmed))) {
    const selfSignals = /\b(?:i(?:'m| am| was)?|my|our team|i(?:'m)? (?:doing|working|planning))\b/i.test(
      trimmed,
    );
    if (!selfSignals) return true;
  }

  return false;
}
