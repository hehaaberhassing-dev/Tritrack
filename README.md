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

> Data is stored per browser. Clearing site data (or using a different browser)
> resets the app to its sample data.

## The five tabs

| Tab | What it does |
|---|---|
| **Home** | Race-day countdown, animated **Race Readiness ring**, predicted race times, weekly stats, next planned sessions |
| **Plan** | The generated 20-week marathon plan — browse weeks, tap sessions to check them off, set your real start date via ⚙ |
| **Train** | Workout templates, quick-start empty workouts, live set/rep/kg logging with a 90s auto rest timer, and the 📚 **Exercise Library** (create / edit / delete fully custom exercises) |
| **Activity** | History of endurance sessions (run/bike/swim with pace & RPE) and finished gym workouts (tap for full set detail) |
| **Trends** | Weekly distance stacked by sport, strength progression per exercise, run pace trend, all-time totals |

## Special feature: Race Readiness + Finish-Time Predictor

The Home tab computes a 0–100 readiness score from your acute (7-day) vs.
chronic (28-day) training load — the ratio coaches use to balance fitness
against injury risk — rendered as an animated ring with coaching advice.
Every logged run also feeds a Riegel-formula forecast of your 5K / 10K / half /
marathon times that updates live.

**Demo on camera:** Activity → ＋ → log a fast 5–10K run → flip to Home and
watch the predicted marathon time drop and the ring move.

## Your 20-week program

The plan starts the day you first open the app. To anchor it to your real race:
Plan → ⚙ → set the start date (race day is the Sunday of week 20).
Phases: Base (w1–6) → Build (7–12) → Peak (13–17) → Taper (18–19) → Race (20).
Even weeks include swim technique, odd weeks Zone-2 rides — the Ironman base
builds alongside the marathon block.
