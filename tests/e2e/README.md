# e2e specs

Lasting user-journey and layout checks. Run only the specs related to a change:

```sh
npm run test:e2e -- tests/e2e/home.spec.ts tests/e2e/treats.spec.ts
```

The whole suite runs in GitHub Actions on every push, and deploy waits for it. Run it all locally (`npm run test:e2e`) only when a change touches layout or styles shared across screens.

| Spec | Covers |
| --- | --- |
| `home.spec.ts` | Home: one-tap logging, feedback, done states, task limits, the wake-up window, hatching |
| `treats.spec.ts` | Treat rolls: the extra float, the hop, the buzz, the toast, reduced motion and dark mode; the secret wish (opening hint, the sparkle, granting it) |
| `items.spec.ts` | Rare item finds: the card, the toast, Collection, undo |
| `wearing.spec.ts` | Wearing found items from Collection, on Home and the Dragon screen |
| `stages.spec.ts` | Stage-ups: the reveal dialog, undo, held stages, older save data |
| `evolution.spec.ts` | Evolution looks: when they appear, celebration, undo, drawing at every stage |
| `moods.spec.ts` | Moods, the mood chip, welcome-back bubbles, recovering after a gap |
| `dragon-motion.spec.ts` | Idle animation and tap reaction stay in view (Collection preview, tall stages) |
| `scene.spec.ts` | Home's time-of-day sky, the nest and grass, motion and reduced motion |
| `history.spec.ts` | Streaks: the Home streak chip and the History screen; offline and reduced motion across the tabs (Dragon screen included) |
| `streak-rewards.spec.ts` | Streak milestone finds, freeze notes, the "kept our streak cosy" line |
| `dragon-screen.spec.ts` | Shared layout and the tab bar, the Dragon screen, scrolling on short screens |
| `short-viewport.spec.ts` | Toasts, the hatch overlay and notices on short screens |
| `settings.spec.ts` | The Settings tab, the sound switch, export, import, the backup reminder, the weekly goal (Home chip, goal met, wistful goal mood) |
| `settings-name-wake.spec.ts` | Settings: the dragon's name and wake-up times |
| `settings-tasks.spec.ts` | Settings: editing tasks and the effort picker |

`fixtures.ts` holds the shared helpers (`settle`, `shot`, seeding, `LAYOUT`). A change there can touch every spec, so run the whole suite.
