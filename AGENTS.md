<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Roadmate — Agent Guide

## What this project is

**Roadmate** is a near-field social hardware interaction demo (web prototype). It simulates low-power circular NFC Tag devices (AirTag-inspired metal discs with circular e-ink screens), shows multiple skeuomorphic devices on a canvas, and lets the user drag “my device” (RM-01) toward like-minded devices. Matching strength is perceived through **Dock scale-up**, **ring LED strobing**, and **on-screen direction arrows**; after overlap, a tap-to-pair ritual can complete.

**Journey path**: `/` Interest Lab infers interests → transition → `/playground` near-field interaction → `/roadmates` social prototype.

**Implemented**: drag and Matter stacking, near-field ring LEDs (distance maps to frequency/intensity), Dock scale-up, bidirectional direction arrows, overlap ring charge pairing, match-success transition, Interest Lab three-stage timeline inference + embedding, device match score (embedding cosine + tag overlap), TagWordCloud physics word cloud.  
**Not implemented / Phase 2+**: Web Audio effects, real NFC confirmation, radar scan animation, full 6-step meet ritual, etc.

Device form and interaction evolution: [`docs/device-playground.md`](docs/device-playground.md).

## Tech stack

| Layer | Choice |
|------|------|
| Framework | Next.js 16 App Router + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (`app/globals.css` includes skeuomorphic Tag / word-cloud styles) |
| Animation / drag | GSAP + `@gsap/react` + `Draggable` |
| Physics | Matter.js (devices: zero-gravity stacking; word cloud: light gravity + wall collisions) |
| LLM / Embedding | OpenRouter (via Next.js API routes; Key in localStorage, passed from client, not persisted server-side) |
| Twitter data source | twitterapi.io (Interest Lab X mode, via server proxy) |

**Do not** replace LED frequency mapping with Framer Motion or pure CSS `@keyframes` — frequency must change continuously at runtime with distance.

## Directory structure

```
app/
  (journey)/
    page.tsx              # Journey home → Interest Lab
    playground/page.tsx   # Device Playground
    layout.tsx            # JourneyShell + transition Provider
  interests/page.tsx      # Redirect to /
  roadmates/page.tsx      # Roadmates social prototype
  tag-cloud/page.tsx      # TagWordCloud standalone test page
  api/interest-lab/       # openrouter infer-timeline / embed etc.; twitter proxy
  layout.tsx, globals.css

components/device-playground/
  DevicePlayground.tsx    # Main container: Draggable, hook orchestration
  DeviceCard.tsx          # Single circular Tag UI (metal shell, round screen, ring LED)
  MatchPointerArrow.tsx   # Near-field bidirectional bearing arrows
  MatchScoreCounter.tsx   # Match-success screen score / topics
  matchScoring.ts         # embedding cosine + tag overlap → match %
  useDevicePhysics.ts     # Matter engine, rigid bodies, DOM sync
  useProximityEffects.ts  # Dock scale-up + ring LED timeScale / intensity
  match-pairing/          # useMatchPairing, charge progress, success transition
  constants.ts, types.ts, layoutInitialDevices.ts

components/journey/       # Journey transitions, iPhone preview frame, localStorage state

components/tag-word-cloud/
  TagWordCloud.tsx, utils.ts, constants.ts, types.ts, placeholderTags.ts

components/interest-lab/
  InterestLab.tsx         # Web UI orchestration, profile persistence
  PostListEditor.tsx, postImportExport.ts, postUtils.ts
  tagUtils.ts             # aggregateTagsFromTimeline, computeTagWeight
  timelineUtils.ts        # Apply inference results, timelineResultToInterestTags
  prompts.ts              # Three-stage system prompt
  server/                 # timelineInference.ts, timelineFormat.ts, etc. (Scheme C)
  api/openrouter.ts       # inferTagsFromTimeline (NDJSON stream), embedTags
  api/twitter.ts, storage.ts, constants.ts, types.ts

docs/
  device-playground.md    # Device form factor and near-field interaction design
  interest-inference.md   # Scheme C three-stage inference and weighting
```

Path alias: `@/*` → project root.

## Routes

| Path | Description |
|------|------|
| `/` | Journey home — Interest Lab interest inference |
| `/playground` | Device Playground near-field interaction |
| `/roadmates` | Roadmates social prototype |
| `/interests` | Redirect to `/` |
| `/tag-cloud` | TagWordCloud component playground (no API required) |

## Core interaction conventions (device demo)

> Form evolution, state machine, and constant meanings: [`docs/device-playground.md`](docs/device-playground.md).

1. **Form (v3)**: 120 px circular metal Tag shell + 85 px circular e-ink screen; ring LED outside the screen (`device-tag-led-ring`); no physical buttons. Owner RM-01 has a cyan outer halo (`device-tag-owner-halo`).
2. **Owner device**: `OWNER_DEVICE_INDEX = 0`, `isOwner: true`.
3. **Matchable devices**: 3 of 10 have `matchable: true`; match score is driven by Interest Lab embeddings (`matchScoring.ts`); screen shows `match XX%`.
4. **Near-field lights** (`useProximityEffects`): only while dragging the **owner**, the **nearest pair** of matchable devices participate in amber (`#ffb020`) ring strobing; effective range `LED_MATCH_RANGE = DEVICE_D × 3`; `distanceToLedTimeScale` / `distanceToLedIntensity` map frequency and glow intensity. Use a persistent GSAP timeline + `timeScale` for speed control; do not kill/recreate every frame.
5. **Direction arrows** (`MatchPointerArrow`): within effective range both round screens show real-time rotating arrows (`bearingBetweenCenters`); idle shows the ROADMATE brand wordmark, which yields when the arrow is active.
6. **Tap-to-pair** (`useMatchPairing`): overlap → emerald ring (`#34d399`) charge for 1s (`MATCH_CONFIRM_HOLD_MS`) → success transition (confetti, score, shared topics). Formerly used an off-screen confirm button; now uses ring progress, aligned with “no physical keys, NFC proximity” direction.
7. **Dock scale-up**: when the owner enters `DOCK_RADIUS` (225 px), the target device scales to `DOCK_MAX_SCALE` (1.35).
8. **Physics**: while dragging, rigid body `setStatic(true)`, restored on release; `afterUpdate` syncs non-dragged device body positions back to the DOM.

## Interest Lab conventions

> Three-scheme evolution, stage details, weight formula, CLI evaluation: [`docs/interest-inference.md`](docs/interest-inference.md).

1. **Current architecture (Scheme C)**: preprocess (parallel noise filter + summary) → timeline merge (7-day window semantic dedupe) → tag extraction → code `aggregateTagsFromTimeline` → embedding. Main path is `inferTagsFromTimeline`; Scheme A/B code is kept for comparison — do not use as the main path.
2. **Input modes**: post list (paste; supports `roadmate-posts/1` txt import/export) or X username (twitterapi.io fetch → same `PostRecord` schema).
3. **Inference trigger**: each “Infer and save” **fully re-runs** all three stages (no incremental skip); the post list is **not** written to localStorage.
4. **Weight formula**: `weight = 0.40×frequency + 0.20×sentiment×recency + 0.40×recency`; `frequency` / `recency` are computed in code via the `sourcePostIds` → `createdAt` attribution chain, not LLM output. Coefficients: `WEIGHT_FACTORS`, `RECENCY_DECAY_LAMBDA` in `constants.ts`.
5. **Default models** (`constants.ts`): LLM `minimax/minimax-m3`, Embedding `openai/text-embedding-3-small`; overridable in the UI.
6. **Local storage**: API Key, settings, profile (tags + embedding, **no posts**) in `localStorage`; **do not** commit the Key to git or persist it on the server.
7. **Output**: JSON preview includes tags + embeddings; `TagWordCloud` below updates live (inferred tag weights are min-max normalized within the batch, then mapped to size).

## TagWordCloud conventions

1. **Props**: `tags: { name, weight }[]`; inferred tag `weight` is **min-max normalized within the current batch**, then mapped to sphere diameter (relative rank, not absolute linear); custom tags map absolute slider weights.
2. **Physics**: light gravity fall, bottom/side wall collisions; initial layout via `createTagLayouts`, and `separateOverlappingBodies` when needed to prevent overlap.
3. **Drag**: GSAP `Draggable`; while dragging, body `setStatic(true)`; `afterUpdate` syncs non-dragged tag positions.
4. **Styles**: `.tag-word-cloud` / `.tag-word-cloud-shape-circle` etc. in `globals.css`; hue assigned by `visualWeight`.
5. **Reuse**: Interest Lab imports `TagWordCloud` directly; standalone test at `/tag-cloud`.

## When changing code

- All canvas / GSAP / Matter logic must live in `'use client'` components.
- Prefer `useGSAP({ scope: ref })` for animation setup; auto-reverts on unmount.
- Keep tunables in each module’s `constants.ts` (devices: `DOCK_RADIUS`, `LED_MATCH_RANGE`, etc.; word cloud: `PHYSICS`, `TAG_SIZE`; Lab: `WEIGHT_FACTORS`, `TIMELINE_MERGE_WINDOW_DAYS`).
- Keep diffs small: do not introduce a generic skeuomorphic UI library; the device form is a custom circular Tag.
- Respect `prefers-reduced-motion` (see `useProximityEffects`, `MatchPointerArrow`).
- OpenRouter / twitterapi.io are proxied via **Next.js API routes** (no CORS); API Key is passed from the client from localStorage; the server does not persist it.
- Before changing device form or interaction, read `docs/device-playground.md`; before changing the inference pipeline, read `docs/interest-inference.md`.

## Common commands

```bash
npm run dev              # http://localhost:3000
npm run build
npm run lint
npm run bench:timeline   # Scheme C inference CLI benchmark (see docs/interest-inference.md)
npm run bench:corpus     # Scheme B historical comparison (not the main path)
```
