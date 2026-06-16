# TriTrack Web — Marathon & Ironman Training Companion

A fully offline, dark-mode training web app: strength workouts with fully custom
exercises, runs/rides/swims with pace, a built-in 20-week marathon plan with an
Ironman cross-training base, progress charts, and a live Race Readiness score +
finish-time predictor.

No frameworks, no build step, no internet needed. Three files: `index.html`,
`styles.css`, `app.js`. All data is saved in your browser's localStorage.

## How to open it

**Easiest:** double-click `index.html` — it opens in your browser and just works.

**Optional local server (same result):** right-click `serve.ps1` → *Run with
PowerShell*, then open <http://localhost:8421>.

On your phone, hosting the folder anywhere static (GitHub Pages, Netlify drop,
etc.) gives you the same app full-screen; the layout is phone-first.

> Data is stored per browser, per device — see **Profiles & privacy** below.

## The five tabs

| Tab | What it does |
|---|---|
| **Home** | Race-day countdown, animated **Race Readiness ring**, predicted race times, weekly stats, next planned sessions |
| **Plan** | The generated 20-week marathon plan — browse weeks, tap sessions to check them off, set your real start date via ⚙ |
| **Train** | Workout templates, quick-start empty workouts, live set/rep/kg logging with a 90s auto rest timer, and the 📚 **Exercise Library** (create / edit / delete fully custom exercises) |
| **Activity** | History of endurance sessions (run/bike/swim with pace & RPE), finished gym workouts (tap for full set detail), and **⤓ Import from Strava** |
| **Trends** | Weekly distance stacked by sport, strength progression per exercise, run pace trend, all-time totals |

## Special feature: Race Readiness + Finish-Time Predictor

The Home tab computes a 0–100 readiness score from your acute (7-day) vs.
chronic (28-day) training load — the ratio coaches use to balance fitness
against injury risk — rendered as an animated ring with coaching advice.
Every logged run also feeds a Riegel-formula forecast of your 5K / 10K / half /
marathon times that updates live.

**Demo on camera:** Activity → ＋ → log a fast 5–10K run → flip to Home and
watch the predicted marathon time drop and the ring move.

## Importing your Strava history

Activity tab → **⤓** → pick your Strava `activities.csv`.

1. In Strava: **Settings → My Account → Download or Delete Your Account →
   Request your archive**. Strava emails a ZIP within a few hours.
2. Unzip it, choose `activities.csv` in the app, review the preview, tap **Import**.

Runs, rides and swims are imported (with distance, moving time and — if present —
Strava's Perceived Exertion as RPE). Gym/walk/other activities are skipped.
Re-importing later is safe: sessions are matched on Strava's activity ID, so
duplicates are detected and skipped. Imported data flows straight into the
readiness score, race predictions and all charts. Everything stays on your
device — the CSV is parsed in the browser and never uploaded anywhere.

> RepCount has no public API and can't sync live; its CSV export could be wired
> up the same way later if you want strength data pulled in too.
>
> The importer reads both Strava's **English and Danish** exports (column names,
> `Løb`/`Cykling`/`Svømning` activity types, Danish dates and comma-decimals).

## Profiles & privacy

Your data lives **only in your own browser's storage and is never uploaded** —
pushing the site to GitHub publishes the *code*, not your runs. So when someone
opens the app on their own phone or laptop, they automatically start fresh and
can never see your progress.

For the case where several people share **one** browser, tap the profile chip
(top-right of Home) to add named profiles. Each profile keeps its own workouts,
plan progress and history, fully separated:

- **＋** add a profile · tap a name to switch · **✎** rename · **✕** delete
- **Clear this profile's progress** wipes that profile's logged data (keeps the
  exercise library and plan)

New profiles start empty so each person builds their own history.

## Your 20-week program

The plan starts the day you first open the app. To anchor it to your real race:
Plan → ⚙ → set the start date (race day is the Sunday of week 20).
Phases: Base (w1–6) → Build (7–12) → Peak (13–17) → Taper (18–19) → Race (20).
Even weeks include swim technique, odd weeks Zone-2 rides — the Ironman base
builds alongside the marathon block.
