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
| Whelp | 600 | About 2 weeks |
| Juvenile | 1,500 | About 1 month |
| Adult | 4,000 | About 2 to 3 months |
| Elder | 8,300 | About 5 to 6 months |

Balanced 2026-10-05 after simulation: typical user hatches ~day 3, Juvenile ~day 34, Elder ~6 months. Rebalanced 2026-10-06 for treats (+~10% XP): a typical user with treats reaches Whelp ~day 12, Juvenile ~day 30, Adult ~day 79, Elder ~day 164.

The thresholds are config values and easy to rebalance.

Each stage change is a big moment: a full-screen animation and a short message from the dragon.

### Evolution

When the dragon reaches Juvenile, its highest stat decides its look (colour, markings or features). A Strength dragon looks sturdy, a Wisdom dragon looks scholarly, and so on. The look can shift later if a different stat overtakes it by more than a small margin (`LOOK_CHANGE_MARGIN`: more than 10%), so a balanced dragon doesn't flip back and forth. Ties go to the stat order in config. The first time the dragon takes on each look gets a gentle celebration. Changing back to a look it has had before happens quietly.

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
- Wearing items (decided 2026-10-07): each item has a spot (head, neck or held), and the dragon wears one item per spot. Tap a found item in the Collection to wear it, and tap it again to take it off. A new find goes on by itself only if its spot is free; it never replaces something I chose. What's worn is a setting, not an event, and it's worked out from what's found right now, so undoing a find takes the item off. Choices made while it's still an egg are kept and show once it hatches.
- Bad-luck protection: if the last 30 logs (`ITEM_PITY_LOGS`) since the last item found, or since the start, brought no item, the next log brings one whatever the roll (instead of any treat). It's worked out from the event log, so undoing a log undoes its effect, and it does nothing once every item is found. Once every item is found, a roll in the rare band gives a treat instead.

Added 2026-10-07 after simulation: at 3% with 12 items most users went 6 to 7 weeks without an item at some point; with 18 items and a 30-log rule the longest gap is about 3 weeks and the collection completes around day 204 for a typical user, about 6 weeks after Elder (around day 192 once first-time streak milestone items arrive in Milestone 5).

### Streaks

- Show an overall "days with at least one log" streak, plus the best one ever.
- Wake-up gets its own daily streak. Days with no wake-up target (per the current schedule) are skipped, not missed.
- Every other task shows a weekly count instead of a streak: the number of days it was logged this week (Monday to Sunday), and its best week.
- I earn one streak freeze each time the overall streak reaches a multiple of 7 days (maximum 2 held). A freeze is used automatically when a day ends with no log: the streak carries on, but the frozen day doesn't add to it. With no freeze held, the streak ends quietly. Today never counts as missed while it's still going.
- Streak milestones (7, 30, 100 days) give a guaranteed rare item, the first time each milestone is reached only.

Decided 2026-10-07: per-task streaks became weekly counts, and freezes protect the overall streak only. A daily gym streak would reset on every rest day, which reads as a telling-off and goes against the no-guilt principle. Weekly counts reward showing up without punishing rest. A streak that ends reads as a fresh start, never a loss.

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
3. Collection: items found, with a plain "?" tile for each one not found yet (decided 2026-10-07: items stay a surprise, so no silhouettes).
4. History: streaks (overall, best, freezes held, wake-up and this week's count per task) and a month calendar. Tap a day to see what I logged that day. It's a tab in the bottom bar, and a small streak chip on Home (shown from 2 days) opens it.
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
