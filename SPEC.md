# Drag-on: Spec

## Purpose

A personal motivation app. I raise a cute dragon from an egg, and it grows and gets stronger when I do the things I don't want to do: getting up on time, going to the gym, and so on. The point is to make those tasks feel rewarding straight away, not to be a strict productivity tracker.

There is one user (me). There are no accounts, no social features and no monetisation.

## Platform

- Mobile-first web app, installable to the phone home screen as a PWA.
- Target device: Google Pixel 10 Pro, using Chrome on Android. Its screen is 410×914 CSS pixels in portrait (device pixel ratio 3.125).
- Designed for that screen first, one-handed use, portrait. Layouts should still work down to 360px wide.
- Hosted free on GitHub Pages.
- Works offline. Logging a task must never depend on a network connection.
- Data is stored on the device for now (localStorage or IndexedDB), with a manual export/import backup.
- Cross-device sync is a possible later addition (e.g. Supabase), not part of the first version.

## Core loop

1. I open the app and see my dragon and today's tasks.
2. I tap a task to log it as done. This takes two taps at most, ideally one.
3. Something satisfying happens immediately: an animation, XP gained, a stat ticks up, and sometimes a surprise reward.
4. Over days and weeks the dragon grows through life stages, and its appearance reflects the kinds of habits I've kept.

## Tasks

The task list is editable in settings. I can add, rename, archive and set XP for tasks. Starting tasks:

| Task | Stat | Base XP | Rules |
|------|------|---------|-------|
| Got up on time | Discipline | 30 | Only counts if logged before that day's target time + 15 min grace. Only shown on days that have a target time (see Wake-up schedule) |
| Gym / workout | Strength | 40 | Once per day |
| Went for a walk | Strength | 15 | Once per day |
| Read for 20 minutes | Wisdom | 25 | Once per day |
| Looked after myself | Heart | 25 | Once per day |
| Something I've been avoiding | Discipline | 15 | Can be logged up to 2 times a day, with an optional short note |

Self-care set to 25 XP on 2026-10-05 after simulation: at 15 a Heart dragon was unreachable even with daily self-care.

XP reflects how hard a task is for me, not how hard it is in general. I should be able to change it.

### Wake-up schedule

Each day of the week has its own wake-up target, or none. This is set in settings.

| Days | Default target |
|------|----------------|
| Monday to Friday | 06:30 |
| Saturday, Sunday | None |

On a day with no target, the "Got up on time" task is hidden. Those days don't break its streak: they're skipped, not missed.

### Day boundary

A "day" runs from 04:00 to 03:59 local time (Europe/London), so logging something at 1am counts towards the previous day.

## Dragon

### Stats

There are four stats. Each grows from the tasks mapped to it.

- Strength: exercise and physical tasks
- Discipline: getting up, avoided tasks, routines
- Wisdom: reading, learning
- Heart: self-care, social, rest ("Looked after myself")

### Growth stages

Total XP drives the stage. The thresholds give a fast early win (hatching within a few days) and then a steady pace.

| Stage | XP from | Roughly reached after |
|-------|---------|----------------------|
| Egg | 0 | Day 1 |
| Hatchling | 100 | 2 to 3 days |
| Whelp | 500 | About 2 weeks |
| Juvenile | 1,300 | About 1 month |
| Adult | 3,500 | About 2 to 3 months |
| Elder | 7,000 | About 5 to 6 months |

Balanced 2026-10-05 after simulation: typical user hatches ~day 3, Juvenile ~day 34, Elder ~6 months.

The thresholds are config values and easy to rebalance.

Each stage change is a big moment: a full-screen animation and a short message from the dragon.

### Evolution

When the dragon reaches Juvenile, its highest stat decides its look (colour, markings or features). A Strength dragon looks sturdy, a Wisdom dragon looks scholarly, and so on. The look can shift later if a different stat overtakes it.

### Mood

The dragon's mood depends on how recently I logged something. It never dies, never loses XP and never goes backwards a stage.

| Days since last log | Mood |
|---------------------|------|
| 0 | Happy |
| 1 to 2 | Content |
| 3 to 4 | Sleepy |
| 5+ | Grumpy (curled up, but clearly pleased when I return) |

Rebalanced 2026-10-05 after simulation: sleepy after one missed day felt like a telling-off; typical user now sees a welcome-back about monthly.

When I come back after a gap, the dragon gives a warm "welcome back" reaction. It doesn't guilt-trip me. There's no big bonus either, so lapsing isn't rewarded.

## Rewards

### Variable rewards

Each log rolls for a surprise. The result is decided at the moment of logging and saved with the event, so it doesn't change on reload.

- 20% chance: a treat (small bonus XP and a happy animation)
- 3% chance: a rare item (a cosmetic or collectible: hats, scarves, a tiny book, a gem)
- Items go into a collection screen and can be equipped on the dragon.

### Streaks

- Show the current streak for each task and an overall "days with at least one log" streak.
- I earn one streak freeze per 7-day streak (maximum 2 held). A freeze is used automatically to protect a streak when I miss a day.
- Streak milestones (7, 30, 100 days) give a guaranteed rare item.

## Data model

Store an append-only log of events. Work out everything else from it.

```
Task      { id, name, stat, xp, rules, archived }
Event     { id, taskId, timestamp, xpAwarded, reward?, note? }
Settings  { wakeSchedule: { mon: "06:30", ..., sat: null, sun: null }, dragonName, ... }
```

Dragon state (total XP, stats, stage, mood, streaks, inventory) is calculated from the events and config by pure functions. This makes rebalancing safe: change a threshold and the dragon recalculates from history.

The user can also undo the most recent log, in case of a mis-tap.

### Backup

Settings include "Export data" (downloads a JSON file) and "Import data". Browser storage can occasionally be cleared (for example if Chrome's site data is wiped), so the app should gently remind me to export if it's been more than 14 days since the last backup.

## Screens

1. Home: the dragon front and centre with mood and stage, today's tasks as large tap targets underneath, and the XP bar to the next stage.
2. Dragon: stats, stage history and equipped items.
3. Collection: items found, with locked silhouettes for undiscovered ones.
4. History: a simple calendar or list of what I logged each day, and streaks.
5. Settings: edit tasks, wake-up schedule (per day), dragon name, export/import.

## Art and feel

- Cute, warm and soft. Rounded shapes, gentle animations, nothing aggressive.
- The first version uses simple SVG or CSS-drawn placeholders for each stage and mood. The art lives in its own module so it can be swapped for a pixel-art asset pack or commissioned art later without touching game logic.
- Small touches matter more than detail: blinking, a little bounce when tapped, happy wiggles on log.
- Haptic feedback on log where the phone supports it.
- Light and dark mode.

## Milestones

Each milestone is usable on its own.

1. MVP: egg, the starting tasks, logging, XP bar, hatching into a Hatchling, data saved locally, installable PWA, deployed to GitHub Pages.
2. Growth: all stages, stage-up animations, mood states.
3. Stats and evolution: four stats, a Dragon screen and an evolution look at Juvenile.
4. Rewards: variable treats, rare items, collection screen, equipping items.
5. Streaks and history: streaks, freezes, History screen.
6. Settings and backup: task editing, export/import, backup reminder.
7. Polish: better art, sounds (off by default), more items.

## Out of scope for now

- Push notifications and reminders (possible later; Chrome on Android supports them for installed PWAs)
- Accounts, sync and multiple devices
- Automatic verification (step counts, gym check-ins). Honesty-based logging is fine.
- Any social or sharing features

## Open questions

- Dragon name
- ~~Whether to add Heart tasks from the start~~ Decided in Milestone 3: yes, "Looked after myself"
- The art direction once the MVP works
