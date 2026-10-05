# CLAUDE.md

## Project

Drag-on: a personal, mobile-first PWA where I raise a dragon from an egg by logging habits I find hard (getting up on time, the gym, etc.). The full spec is in `SPEC.md`. Read it before starting any milestone, and follow its milestone order.

There's one user (me), using it on my phone. No accounts, no backend for now.

## Design principles (non-negotiable)

These matter more than features. If a request conflicts with one, flag it before building.

- Logging a task takes two taps at most. Never add steps, confirmations or forms to the main logging path.
- The dragon never dies, never loses XP and never goes down a stage. Bad states are gentle (sleepy, grumpy) and fully recoverable.
- No guilt-tripping copy. The dragon is always pleased to see me.
- Every log gets immediate, satisfying feedback.
- Logging works offline.

## Stack

- Vite + TypeScript, no UI framework unless one becomes clearly necessary (ask first)
- `vite-plugin-pwa` for the manifest and service worker
- Vitest for tests
- Deployed to GitHub Pages via GitHub Actions
- Local storage only (localStorage or IndexedDB behind a small storage module)

## Architecture

- `src/game/`: pure game logic. Functions take the event log + config and return derived state (XP, stats, stage, mood, streaks, inventory). No DOM, no storage, no `Date.now()` calls inside; pass the current time in.
- `src/config/`: tasks, XP values, stage thresholds, reward odds, item list. All balancing numbers live here, never hard-coded in logic.
- `src/storage/`: reading and writing the event log and settings, export/import.
- `src/art/`: everything about how the dragon looks (SVG/CSS per stage, mood, evolution and item). Game logic must never import from here, so the art can be replaced wholesale later.
- `src/ui/`: screens and components.

The event log is append-only and is the source of truth. Never store derived values like total XP. Calculate them. Random reward rolls happen once, at log time, and are saved on the event.

Days run 04:00 to 03:59, Europe/London. Use one shared helper for "which day is this timestamp", never ad-hoc date maths.

## UI rules

- The target device is a Google Pixel 10 Pro running Chrome: 410×914 CSS pixels in portrait, device pixel ratio 3.125. Design for that first, and make sure layouts still work down to 360px wide.
- Tap targets at least 44×44px. Main task buttons should be big and thumb-reachable in the lower half of the screen.
- Respect `prefers-reduced-motion` and support light and dark mode.
- Cute, soft, rounded, warm. Animations are short and bouncy, not flashy.

## Testing

- Every function in `src/game/` has unit tests, including edge cases: logging around 04:00, the wake-up grace window, days with no wake-up target (skipped, not missed), streak freezes, undoing a log, and recalculating after a threshold change.
- Run the tests before saying a milestone is done.

## Commands

- Dev server: `npm run dev`
- Tests: `npm test`
- End-to-end phone tests (Playwright): `npm run test:e2e`
- Build: `npm run build` (type-checks, then builds to `dist/`)
- Preview the production build: `npm run preview` (served under `/drag-on/`)
- Regenerate icons from `public/favicon.svg`: `npm run icons`
- Deploy: push to `main` (GitHub Actions)

## Agents

The agents are in `.claude/agents/`. Subagents can't call each other, so the main session runs the loop:

1. Plan the slice in plan mode and agree it with me.
2. `builder` builds the slice.
3. `reviewer` reviews it. If the UI changed, run `phone-tester` at the same time.
4. If either reports problems, send the findings back to `builder`, then review again. Stop after two rounds and ask me.
5. Once it's approved, commit.

Run `balance-checker` whenever anything in `src/config/` changes, when tasks or stages are added, or when I ask whether progress feels right.

## Working with me

- Work one milestone at a time. Start each one in plan mode and show me the plan before writing code.
- Keep slices small enough that I can try them on my phone the same day.
- Commit at the end of each working slice with a clear message.
- When you change balancing numbers, tell me what changed and why.
- If something in `SPEC.md` turns out to be a bad idea in practice, say so and suggest an alternative. Don't silently change it.
