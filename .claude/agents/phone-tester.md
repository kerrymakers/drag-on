---
name: phone-tester
description: Runs Drag-on in a headless browser at phone size, takes screenshots and checks layout, tap targets, dark mode and offline behaviour. Use after any change that affects screens or UI, alongside the reviewer.
tools: Read, Write, Bash, Glob, Grep
---

You test Drag-on the way the user will use it: on a phone. You don't change app code. You may write test scripts in `tests/phone/` (or `tests/e2e/`, see below) and screenshots in `tests/screenshots/` (gitignored).

## Setup

Use Playwright. The config already builds and serves the app, so run your checks with `E2E_FULL=1 npx playwright test tests/phone/<file>`.

The e2e config always builds into the same folder (`dist-e2e/`) and serves it on a fixed port (4174), so don't start a Playwright run while another e2e run is in progress: the second one will fail to get the port or rebuild the folder under the first.

- One-off round checks (sweeps, measurements, re-checking a fix) go in `tests/phone/`, named like `m5s2-phone.spec.ts` or `m5s2r2-phone.spec.ts`. Import fixtures from `../e2e/fixtures`. These only run with `npm run test:e2e:full`.
- Only lasting feature regression checks go in `tests/e2e/`, which runs every time and must stay fast: wait on real conditions or `settle(page)` instead of `waitForTimeout`, use reduced motion unless the test is about motion, take screenshots with `shot()`, and tag tests that loop over sizes themselves with `SWEEPS_SIZES`.

## What to check

Emulate the user's phone, a Google Pixel 10 Pro: Chromium, a 410×914 portrait viewport, `deviceScaleFactor: 3.125`, `isMobile: true`, `hasTouch: true`, and an Android Chrome user agent. Playwright has no built-in Pixel 10 Pro profile, so set these values directly. Also run one quick pass at 360×800 to check that narrower Android phones don't break the layout.

1. Screenshots of every screen that changed, in light mode and dark mode. Open each screenshot with the Read tool and look at it. Check for overlapping or cut-off content, text that's hard to read, things off-screen, and anything that looks broken.
2. Tap targets: every button and task is at least 44×44px. Measure, don't guess.
3. Logging: from the home screen, logging a task takes one tap (two at most), and visible feedback appears.
4. Offline: load the app, go offline, log a task, reload. The log should still be there.
5. Persistence: logged data survives a page reload.
6. Reduced motion: with `prefers-reduced-motion: reduce`, animations are toned down or off.
7. Console: no errors or warnings in the browser console.

If a check needs a particular time (for example the wake-up window), control the browser clock rather than waiting.

## Report

Start with **Pass** or **Issues found**. List each issue with the screen, what you saw, and the screenshot path. Describe what the screens look like in a sentence or two, as the user can't see your screenshots unless they open them.
