# Drag-on: Spec

## Purpose

A personal motivation app. I raise a cute dragon from an egg, and it grows and gets stronger when I do the things I don't want to do: getting up on time, going to the gym, and so on. The point is to make those tasks feel rewarding straight away, not to be a strict productivity tracker.

There is one user per phone: me, and friends who install it to raise their own dragon. Each phone keeps its own data. There are no social features and no monetisation, and accounts only arrive as optional sync (Milestone 11).

Decided 2026-10-13: the dragon is also an accountability buddy. I set one weekly goal, and the dragon cares about it (see Primary goal and Goal mood).

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

The task list is editable in settings. I can add, rename and archive tasks, and say how hard each one is for me, which sets its XP (see the effort picker below; this used to be "set XP"). Starting tasks:

| Task | Stat | Base XP | Rules |
|------|------|---------|-------|
| Got up on time | Discipline | 30 | Only counts if logged before that day's target time + 15 min grace. Only shown on days that have a target time (see Wake-up schedule) |
| Gym / workout | Strength | 40 | Once per day |
| Went for a walk | Strength | 15 | Once per day |
| Read for 20 minutes | Wisdom | 25 | Once per day |
| Looked after myself | Heart | 25 | Once per day |
| Something I've been avoiding | Discipline | 15 | Can be logged up to 2 times a day, with an optional short note |

Self-care set to 25 XP on 2026-10-05 after simulation: at 15 a Heart dragon was unreachable even with daily self-care.

XP reflects how hard a task is for me, not how hard it is in general. I should be able to change it (since Milestone 7, by picking an effort level rather than a number).

Decided 2026-10-09: a task's stat is chosen when the task is added and is fixed after that. Changing it would rewrite past stats and the dragon's look. (Milestone 6, slice 3.)

Task editing (Milestone 6, slice 3): in Settings I can rename a task, change its XP and how many times a day it can be logged, add a task (choosing its stat), and archive or unarchive one. Tasks are never deleted, only archived. Archived tasks are hidden from Home and from History's weekly counts, but their past logs still count towards their stat. XP edits apply from the next log; past logs keep the XP they were made with. (The XP stepper is superseded by the effort picker, Milestone 7, slice 1, below.)

Limits set 2026-10-09 after simulation (Milestone 6, slice 3; the 5–50 XP stepper is superseded by the effort picker below, the other limits still apply): task XP is 5 to 50 in steps of 5, a task can be logged up to 3 times a day, but its XP × times a day can't go over 50, and at most 8 tasks can be active. A task saved before these limits keeps its XP until I next change its XP or times a day. (Replaced by the Milestone 7 rule below: a task with no level keeps its XP until I pick a level.) Raising every task to 60 brought a typical user's Juvenile to ~day 12 and Elder to ~day 69; ten tasks, three times a day at 60, gave Elder by ~day 33 and finished the item collection ~day 90, months before Elder. With these limits the worst case for a typical user is Juvenile ~day 14 and Elder ~day 75, and adding two everyday tasks gives Juvenile ~day 23, Elder ~day 126 and the collection ~day 145. Each stat's XP is a lifetime total, so after months of one stat the look stays put even if habits change (that comes from the totals, not the 10% margin).

### Wake-up schedule

Each day of the week has its own wake-up target, or none. This is set in settings.

| Days | Default target |
|------|----------------|
| Monday to Friday | 06:30 |
| Saturday, Sunday | None |

On a day with no target, the "Got up on time" task is hidden. Those days don't break its streak: they're skipped, not missed.

Decided 2026-10-09: an edit to the wake-up schedule applies from the day of the edit on. Past days keep the schedule that was in force at the time, so an edit can never end an existing streak. (Milestone 6, slice 2.)

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

### Primary goal

I can set one weekly goal: a task and how many days a week I want to do it (for example, gym 3 days a week). Weeks run Monday to Sunday, as in History. Home shows a small goal chip ("Gym 1 of 3 this week"); logging stays exactly as it is. Meeting the goal gets a celebration and a small reward (sized in config by simulation). A goal edit applies from the current week on, so past weeks never change. The goal is optional.

Decided 2026-10-13 (Milestone 8, slice 1): the reward is a goal treat of bonus XP (`GOAL_BONUS_XP`, 30), not an item, because a guaranteed weekly item would empty the collection months early. It goes to the first log of the goal task on a new day once the week's count reaches the target, at most once a week, and takes that log's reward roll. A streak-milestone item still wins its log, and the treat then comes on the next goal day. For the wake-up task the target is capped at the days with a wake-up time that week. If the goal task is archived, the chip hides and the goal rests until another task is picked. Simulation (gym, 3 days a week): at 30 Elder comes 2 to 6 days sooner and the collection about a week later. A gym goal usually makes Strength the top stat by a year, which is a fair reflection of the habit.

### Goal mood

Decided 2026-10-13: for accountability, the dragon can be wistful about the goal. This sits alongside the mood above and never replaces its warmth.

- Wistful shows only while the week's goal is behind pace: the days still needed are more than the days left, less a small buffer (config).
- It's about the goal, never about me. Copy is hopeful ("Still hoping we make it to the gym this week"), never blaming, and never names a failure.
- Logging the goal task lifts it straight away, with a visible cheer.
- It resets every Monday. A missed week isn't carried over or mentioned.
- A welcome-back always comes first: the dragon is always pleased to see me.
- It never affects XP, stats, stage, streaks or rewards.

Decided 2026-10-13 (Milestone 8, slice 2): the dragon is wistful only while all of these hold: the week's goal isn't met yet; the goal task hasn't been logged today (game day), so a log always lifts it at once; the week can still be met (the days still needed fit in the days left, today included); and it's tight (the days still needed are more than the days left less `GOAL_WISTFUL_BUFFER`, 2). For gym 3 days a week that's from Thursday with none done, Friday with one, Saturday with two; a 7-day goal is wistful each morning until logged. Once the week can't be met it goes quiet, so a lost week is never dwelt on. For the wake-up task the days left count only days with a wake-up time, and today only while its window is open. It shows as a small sigh puff by the dragon on Home (on top of the mood, which is unchanged), a softer tint on the goal chip, and a hopeful line at most once a day when opening the app (after any cosy-freeze line or welcome-back, before a backup suggestion; one bubble per opening). A log that lifts it gets a hop, a chip cheer and a happy line, unless goal met, a find, a stage-up or a new look already has the moment.

### Secret mission

Each day the dragon has a small secret wish (for example, log before 9, or log two different stats). It hints at it in its speech bubble, and tapping the bubble reveals it. The day's mission is worked out from the day and a seed saved in settings, so it doesn't change on reload. When a log completes it, the reward is decided at that moment and saved on the event, and the dragon is extra happy. Missions are listed in config.

Decided 2026-10-13 (Milestone 8, slice 3a):

- The wishes: an early bird (any log before 09:00 game time, so 04:00 to 08:59), logs for two different stats today, three logs today, a log for the stat of the day, and a "fresh" task (one not logged yet this week, judged on the logs from before today started, so it holds all day). Each day's wish is drawn only from those the active tasks make possible: every wish needs an active task other than wake-up (its schedule skips days), a stat wish needs a task for that stat, three logs need room for three logs a day, two stats need tasks for two stats, and fresh needs a task not logged yet this week. A wake-up log still counts towards granting one.
- The pick comes from a hash of the day and `Settings.missionSeed`, so it's the same on every reload. If it would repeat yesterday's wish, it moves on to the next one. The seed is made once, the first time the app opens without one, and goes along with export and import.
- Granting it brings a wish bonus (`MISSION_BONUS_XP`, 10), saved on the log in its own `mission` field ({ id, bonusXp }). It stacks with that log's treat, goal treat or find and never replaces them, and it counts towards XP and the logged task's stat like a treat.
- A wish counts even if it was never revealed: a surprise grant. At most one is granted per game day. Undoing the granting log reopens the wish, and the next log that completes it grants it again.
- A wish that's out of reach (the early bird after 09:00) goes quiet and is never mentioned.
- Feedback: the toast always includes the bonus ("Secret wish! +35 XP · Read"), and a "+10 wish" float joins the XP one. When the wish has the moment to itself (no stage-up, new look, find or goal met), the dragon hops, a burst of sparkles goes off, it says "You granted my secret wish: …!", and the treat sound plays. It comes before the wistful-lift cheer.

Balance check 2026-10-13 (simulation, 365 days, 100 runs each): wishes are granted about 5.6 times a week for a keen user, 2.8 typical and 2.1 patchy. The bonus was cut from 15 to 10: with the goal treat, a typical user's Elder comes around day 146 (day 140 at 15), close to the target window, and a patchy user's about a week sooner than before. The collection's timing is unchanged, and no stat is favoured.

## Rewards

### Variable rewards

Each log rolls for a surprise. The result is decided at the moment of logging and saved with the event, so it doesn't change on reload.

- 20% chance: a treat (small bonus XP and a happy animation)
- 3% chance: a rare item (a cosmetic or collectible: hats, scarves, a tiny book, a gem)
- Items go into a collection screen and can be equipped on the dragon.
- Wearing items (decided 2026-10-07): each item has a spot (head, neck or held), and the dragon wears one item per spot. Tap a found item in the Collection to wear it, and tap it again to take it off. A new find goes on by itself only if its spot is free; it never replaces something I chose. What's worn is a setting, not an event, and it's worked out from what's found right now, so undoing a find takes the item off. Choices made while it's still an egg are kept and show once it hatches.
- Bad-luck protection: if the last 30 logs (`ITEM_PITY_LOGS`) since the last item found, or since the start, brought no item, the next log brings one whatever the roll (instead of any treat). It's worked out from the event log, so undoing a log undoes its effect, and it does nothing once every item is found. Once every item is found, a roll in the rare band gives a treat instead.

Added 2026-10-07 after simulation: at 3% with 12 items most users went 6 to 7 weeks without an item at some point; with 18 items and a 30-log rule the longest gap is about 3 weeks and the collection completes around day 204 for a typical user, about 6 weeks after Elder. With streak milestone items (Milestone 5, simulated 2026-10-08) it completes around day 180.

Added 2026-10-09 (Milestone 7, slice 3): the pool grew from 18 to 24 items, 8 for each spot. New items are only ever appended, so saved finds and the relative order of earlier items don't change. The odds are unchanged. Balance check 2026-10-09 (24 items, 30-log rule kept): with the built-in tasks a typical user completes the collection around day 259 (Elder ~day 164), so the last items keep arriving after Elder; a keen user ~day 96, a patchy one ~day 333 (about half finish within a year). With heavy logging (8 nudge tasks, 3 times a day) the collection completes ~day 150 against Elder ~day 167, so the empty stretch before Elder fell from about 8 weeks to about 2.5. The longest stretch with nothing new for a typical user is still about 3 weeks; that's set by the 30-log rule, not the pool size, and a days-based rule is a possible later change. A rule of 20, 25 or 40 logs was tried and was worse overall.

### Streaks

- Show an overall "days with at least one log" streak, plus the best one ever.
- Wake-up gets its own daily streak. Days with no wake-up target (per the schedule in force that day) are skipped, not missed.
- Every other task shows a weekly count instead of a streak: the number of days it was logged this week (Monday to Sunday), and its best week.
- I earn one streak freeze each time the overall streak reaches a multiple of 7 days (maximum 2 held). A freeze is used automatically when a day ends with no log: the streak carries on, but the frozen day doesn't add to it. With no freeze held, the streak ends quietly. Today never counts as missed while it's still going.
- Streak milestones (7, 30, 60, 100 days) give a guaranteed rare item, the first time each milestone is reached only. Changed 2026-10-08 after simulation: 100 days was reached by only 10–19% of typical users in a year; 60 gives a reachable step (about half of typical users, ~day 170). Collection completed ~day 180 for a typical user with 18 items; see the 2026-10-09 note above for 24 items.

Decided 2026-10-07: per-task streaks became weekly counts, and freezes protect the overall streak only. A daily gym streak would reset on every rest day, which reads as a telling-off and goes against the no-guilt principle. Weekly counts reward showing up without punishing rest. A streak that ends reads as a fresh start, never a loss.

Decided 2026-10-08: wake-up isn't in History's weekly counts, only in its own "Up on time" streak. It has a schedule, so a weekly count would be ambiguous, and it already has a fair streak.
Decided 2026-10-08: with one freeze held and two quiet days in a row, the freeze covers the first day and stays spent even though the second day ends the streak. Past days don't change after the fact.

Decided 2026-10-09 (Milestone 7, slice 1): choosing an XP number was too much overhead, so the add/edit sheet's 5–50 XP stepper is replaced by a "How hard is this for you?" picker with three levels. Each level sets the task's XP and the most times a day it can be logged:

| Level | XP | Times a day |
|-------|----|-------------|
| A little nudge | 15 | up to 3 |
| Takes effort | 25 | up to 2 |
| Really hard | 40 | once |

XP × times a day stays within the existing 50-a-day limit, and the 8-active-task cap is unchanged. Choosing a harder level lowers times a day to fit; an easier one never raises it by itself. New tasks start at "A little nudge", once a day. Task rows in Settings show the level instead of a number. The starting tasks get the level that matches their XP exactly (gym: Really hard; read and self-care: Takes effort; walk and avoiding: A little nudge). The wake-up task (30 XP) has none. This only applies while the task list has never been saved: once I've edited any task, the saved list is used as it is.

A task with no level (the wake-up task, and any task saved before this) keeps its XP and times a day until I pick a level: its row shows its XP (e.g. "30 XP"), the sheet says "Currently 30 XP. Pick a level to change it.", and saving without picking keeps its XP. Its times a day can still be changed as far as its XP allows within the daily limit. This replaces the earlier "keeps its XP until next changed" rule. A task with no level whose XP matches a level exactly (15, 25 or 40) is shown as that level, on its row and already chosen in its sheet, and tapping Done saves that level onto it. Saved data isn't migrated otherwise. When a level is picked its XP is also written onto the task, so exports and older versions read the same XP. A level this version doesn't recognise (from a later version) is ignored and the task's stored XP is used. As before, changes apply from the next log and past logs keep their XP. If an older version of the app (for example a stale cached copy) changes the XP of a task that has a level, this version ignores that XP and uses the level's.

Balance note 2026-10-09 (balance-checker): with the built-in tasks unchanged, a typical user still reaches Juvenile ~day 30 and Elder ~day 164; the worst case with the levels is Juvenile ~day 15 and Elder ~day 83. No level values were changed.

## Data model

Store an append-only log of events. Work out everything else from it.

```
Task      { id, name, stat, xp, rules, archived, effort? }
Event     { id, taskId, timestamp, xpAwarded, reward?, mission?, note? }
Settings  { wakeSchedule: { mon: "06:30", ..., sat: null, sun: null }, wakeScheduleHistory?: [{ from: "YYYY-MM-DD", schedule }], dragonName, lastBackupAt?, ... }
```

Dragon state (total XP, stats, stage, mood, streaks, inventory) is calculated from the events and config by pure functions. This makes rebalancing safe: change a threshold and the dragon recalculates from history.

The user can also undo the most recent log, in case of a mis-tap.

### Backup

Settings include "Export data" (downloads a JSON file) and "Import data". Browser storage can occasionally be cleared (for example if Chrome's site data is wiped), so the app should gently remind me to export if it's been more than 14 days since the last backup.

Decided 2026-10-09: the reminder is the dragon mentioning it in its speech bubble on Home, at most once a day (a welcome back comes first), plus a small dot on the Settings tab. If there's never been a backup, the 14 days (`BACKUP_REMINDER_DAYS`) count from the first log; with no logs it never shows. Import shows what's in the file and asks before replacing anything, and keeps a copy of what was on the phone first.

## Screens

1. Home: the dragon front and centre with mood and stage, today's tasks as large tap targets underneath, and the XP bar to the next stage.
2. Dragon: stats, stage history and equipped items.
3. Collection: items found, with a plain "?" tile for each one not found yet (decided 2026-10-07: items stay a surprise, so no silhouettes).
4. History: streaks (overall, best, freezes held, wake-up and this week's count for each other task) and a month calendar. Tap a day to see what I logged that day. It's a tab in the bottom bar, and a small streak chip on Home (shown from 2 days) opens it.
5. Settings: edit tasks, wake-up schedule (per day), dragon name, export/import. Decided 2026-10-09: it's a fifth tab in the bottom bar.

## Art and feel

- Cute, warm and soft. Rounded shapes, gentle animations, nothing aggressive.
- The first version uses simple SVG or CSS-drawn placeholders for each stage and mood. The art lives in its own module so it can be swapped for a pixel-art asset pack or commissioned art later without touching game logic.
- Small touches matter more than detail: blinking, a little bounce when tapped, happy wiggles on log.
- Haptic feedback on log where the phone supports it.
- Light and dark mode.

Decided 2026-10-12 (Milestone 7, slice 5): Home has a cosy background scene behind the dragon: a sky, soft rolling hills, and a grassy patch under the dragon (a nest for the egg). The sky follows the real London clock, not the 04:00 game day: dawn and evening run from half an hour before to half an hour after sunrise and sunset, day is in between, and night is the rest. Sunrise and sunset come from a small table of London times for the 15th of each month (`src/config/scene.ts`), blended in a straight line for the days in between so there's no jump at the turn of a month. In dark mode each sky is a dimmer, muted version of itself. The scene moves gently (drifting clouds, twinkling stars) and stands still under reduced motion. On the egg, when there's no room for a speech bubble above or beside it, the bubble may sit on the lower part of the egg, above the nest, but never over its middle or its face.

Decided 2026-10-13 (Milestone 7, slice 2): sounds are off by default, with a switch in Settings (saved in settings and in backups; older backups without it import as off). They're made on the spot with Web Audio, no audio files, so they work offline: a chirp on every log, a jingle for a treat, a sparkle for a find (and for a new look), a small fanfare when the new stage is revealed, and a squeak when the dragon is tapped. One log never plays a pile of sounds at once: the tap gets one sound, and a stage-up's fanfare or a find's card after it plays when that moment arrives. Sound follows only the switch, not reduced motion, and a phone that can't play it just stays quiet; logging never waits for it.

## Milestones

Each milestone is usable on its own.

1. MVP: egg, the starting tasks, logging, XP bar, hatching into a Hatchling, data saved locally, installable PWA, deployed to GitHub Pages.
2. Growth: all stages, stage-up animations, mood states.
3. Stats and evolution: four stats, a Dragon screen and an evolution look at Juvenile.
4. Rewards: variable treats, rare items, collection screen, equipping items.
5. Streaks and history: streaks, freezes, History screen.
6. Settings and backup: task editing, export/import, backup reminder.
7. Polish: better art, sounds (off by default), more items.

Added 2026-10-13. Everything that works without a server comes first.

8. Accountability buddy: primary weekly goal, goal mood (wistful), daily secret mission.
9. Make it yours: choose the dragon's colour, and a first-run setup (name, colour, tasks, wake-up times, optional goal) so friends can raise their own dragon. My existing dragon is unaffected.
10. Walks and nature: logging a walk brings back a seasonal UK nature find, a spotting guide with no advice on picking or eating. Finds show in Collection.
11. Optional sync: Supabase, magic-link sign-in, offline-first. The app keeps working fully without an account.
12. Reminders: opt-in push notifications (goal pace, wake-up, mission hint), at most one a day, with quiet hours.

## Out of scope for now

- Automatic verification (step counts, gym check-ins). Honesty-based logging is fine. Garmin or Strava steps get a research spike after Milestone 11.
- Social features (seeing friends' dragons), to decide after Milestone 11.
- GPS walk tracking.

## Open questions

- Dragon name
- ~~Whether to add Heart tasks from the start~~ Decided in Milestone 3: yes, "Looked after myself"
- The art direction once the MVP works
