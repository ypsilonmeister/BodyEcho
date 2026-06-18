# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Body Image Mirror (ボディイメージ・ミラー)** — an AR skeleton-tracking "digital mirror" for children who have difficulty with proprioception (body awareness) and force/pressure regulation. The camera feed is deliberately *not* drawn; only the abstracted skeleton (joints + bones) is rendered on a black background to reduce visual processing load. UI copy is primarily Japanese (target users are Japanese children/therapists); keep new user-facing strings in Japanese to match.

The README describes the design intent in detail; read it for UX rationale (auto-calibration, banzai gesture reset, neon themes, trails, etc.).

## Commands

```bash
npm install          # install deps
npm run dev          # Vite dev server
npm run build        # tsc -b (typecheck) then vite build
npm run lint         # eslint .
npm run preview      # preview production build
```

There is **no test framework** configured. There is **no single-test command**. `npm run build` is the de-facto correctness gate (it runs `tsc -b` first).

Deployment is automatic via `.github/workflows/deploy.yml` on push to `main`/`master` → GitHub Pages. Vite `base` is `/BodyEcho/`, so the app is served from a subpath — keep this in mind for any absolute asset URLs.

## Architecture

The app is a single-page React app with **one continuous canvas render loop** that does almost all the real work. State flows one direction: pose tracking → React state → refs → render loop.

### Data flow / lifecycle
1. [src/App.tsx](src/App.tsx) owns all configuration state (theme, game mode/type, trails, complexity, camera device, kanji settings, volume…) and the lifecycle (`handleStartApp` requests camera, initializes MediaPipe, starts the tracking loop).
2. [src/utils/poseTracker.ts](src/utils/poseTracker.ts) — singleton (`poseTracker`) wrapping MediaPipe `PoseLandmarker` from `@mediapipe/tasks-vision`. Wasm + `.task` models are loaded from CDN (jsdelivr / googleapis), **not** bundled. Its tracking loop calls back into App with raw landmarks (33-point pose). Model complexity (`lite`/`full`/`heavy`) and camera device are hot-swappable — App reinitializes the tracker in `useEffect`s when those change.
3. [src/components/BodyCanvas.tsx](src/components/BodyCanvas.tsx) — receives `landmarks` as a prop and renders everything (skeleton, trails, particles, ripples, calibration overlay, AR air-buttons, game overlays). **This is the largest and most important file.**
4. [src/components/ControlPanel.tsx](src/components/ControlPanel.tsx) — the settings side drawer; pure controlled inputs wired to App state.
5. [src/utils/audioSynth.ts](src/utils/audioSynth.ts) — singleton (`audioSynth`) generating all SFX live via Web Audio API (no audio assets). Lazily inits AudioContext to satisfy browser autoplay policy.

### The render loop pattern (critical to understand before editing BodyCanvas)
The 60fps `requestAnimationFrame` loop in `BodyCanvas` is created **once** in a `useEffect(..., [])` with an empty dependency array. To avoid tearing it down on every prop change, **every prop and callback is mirrored into a `*Ref`** (see the big sync `useEffect` around line 219) and the loop reads `xxxRef.current` instead of the prop directly. When adding a new prop that the loop must react to, you **must** add a matching ref and sync it, or the loop will read a stale value.

Transient visual state (trails, particles, ripples, calibration progress, button hover progress, smoothed joints) also lives in refs, not React state — React state is only used for things that drive DOM/JSX (the HTML overlays at the bottom of `BodyCanvas`, the status indicator, splash screen).

### Joint smoothing & mirroring
Raw landmarks are lerped (25%/frame) into `smoothedJointsRef` for stable lines. Coordinates are **horizontally mirrored** (`x = (1.0 - rawPt.x) * width`) so the canvas behaves like a real mirror. Note MediaPipe's anatomical naming is from the *subject's* perspective, so `joints.lWrist` (index 15) appears on the *right* side of the mirrored canvas. Landmark indices used: nose 0, eyes 2/5, shoulders 11/12, elbows 13/14, wrists 15/16, hips 23/24, knees 25/26, ankles 27/28, hand points 17–22. Right/left coloring (cyan = `--color-right`, magenta = `--color-left`) comes from CSS variables read live via `getComputedStyle` each frame.

### Games
Game logic lives in [src/components/games/](src/components/games/) as custom hooks, each exposing an `updateAndDraw…` function that `BodyCanvas` calls inside the render loop when that game is active:
- `usePoseMatchingGame` — match a target pose (T-pose, etc.); uses `calculateAngle` (exported from `BodyCanvas`).
- `useSlowTraceGame` — "イライラ棒"; follow a moving light along a parametric path scaled to the user's shoulder width.
- `useKanjiWritingGame` — air-draw kanji; owns the `kanjiList` and gesture detection (fist/point/open). Brush trigger can be gesture-gated.

Gestures and "buttons" are **hands-free**: AR air-buttons (mode switch / quit / done) are activated by hovering a hand pointer (index finger, wrist fallback) over an on-canvas circle for ~1s (progress ring). Calibration = whole/upper body in frame for 3s; reset = both wrists above head ("banzai"/Y-pose) for 1.5s.

### Adding a new game (typical change)
1. Create `useXxxGame.ts` in `games/` returning `{ updateAndDrawXxxGame, reset, … }`.
2. Add the game type to the `"pose" | "trace" | "kanji"` union in App and BodyCanvas props.
3. Wire props → refs in BodyCanvas's sync effect; call your `updateAndDraw` in the game-mode dispatch (~line 965).
4. Add the air-button entry in `buttonsConfig` and any controls in `ControlPanel`.

## Conventions

- TypeScript is fairly loose here: landmark/joint objects are typed `any` throughout the render path. Match the surrounding style rather than introducing strict pose types mid-file.
- Styling is vanilla CSS with CSS variables; themes are applied by setting `document.body.className = theme-…`. Colors are pulled from CSS vars at render time, so new themes are added in CSS, not TS.
- All sound goes through the `audioSynth` singleton; never add audio files.
- MediaPipe assets are loaded from pinned CDN URLs in `poseTracker.ts` and cached by the PWA service worker (`vite.config.ts` workbox rules). If you change model/Wasm versions, update both the URL and the expectation that they're CacheFirst.
