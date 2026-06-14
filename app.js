/* TriTrack — offline marathon & Ironman training companion */
"use strict";

/* ============================== Utils ============================== */

const $ = (sel) => document.querySelector(sel);
const DAY = 86400000;

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now());

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtDur(secs) {
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const fmtKM = (km) => (km === Math.round(km) ? `${km} km` : `${km.toFixed(1)} km`);

const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

const fmtDateLong = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function toLocalDT(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function toLocalDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SPORTS = {
  run: { label: "Run", emoji: "🏃", hex: "#ff9440" },
  bike: { label: "Bike", emoji: "🚴", hex: "#4dd9e6" },
  swim: { label: "Swim", emoji: "🏊", hex: "#669eff" },
  strength: { label: "Strength", emoji: "🏋️", hex: "#c28cff" },
  rest: { label: "Hvile", emoji: "😴", hex: "#8a8a98" },
};

const CATEGORIES = ["Legs", "Push", "Pull", "Core", "Full Body", "Mobility", "Other"];

function sportIcon(sport, size = 38) {
  const s = SPORTS[sport] || SPORTS.run;
  return `<div class="sport-ico" style="width:${size}px;height:${size}px;background:${s.hex}2b">${s.emoji}</div>`;
}

function paceText(c) {
  if (!c.distanceKM || !c.durationSeconds) return "—";
  const pace = c.durationSeconds / c.distanceKM;
  if (c.sport === "bike") return (c.distanceKM / (c.durationSeconds / 3600)).toFixed(1) + " km/h";
  if (c.sport === "swim") return fmtDur(pace / 10) + " /100m";
  return fmtDur(pace) + " /km";
}

/* ============================== Store ============================== */

const STORAGE_KEY = "tritrack-data";
let state = null;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || !Array.isArray(snap.exercises)) return null;
    // Migrate older saves to the personal hybrid program (keeps all logged data)
    if (!snap.planVersion || snap.planVersion < PLAN_VERSION) {
      snap.plan = generatePlan();
      snap.planStartDate = PLAN_START_DEFAULT;
      snap.planVersion = PLAN_VERSION;
    }
    return snap;
  } catch {
    return null;
  }
}

/* ============================== Training plan ============================== */
/* The user's own 20-week hybrid marathon + strength program
   ("marathon_hybrid_program.md"): 4 run days + 3 lift days per week.
   Plan starts Monday 15 June 2026; race day Sunday 1 November 2026. */

const PLAN_START_DEFAULT = new Date(2026, 5, 15).getTime(); // Mon 15 Jun 2026
const PLAN_VERSION = 2;

function phase(week) {
  if (week <= 6) return "Opbygning";
  if (week <= 13) return "Udvikling";
  if (week <= 18) return "Peak";
  if (week <= 19) return "Taper";
  return "Race";
}

const PHASE_COLORS = { Opbygning: "#5ce6b8", Udvikling: "#ff9440", Peak: "#ff5a5a", Taper: "#669eff", Race: "#c7ff59" };

/* Weekly running volume targets (km) from the program */
const WEEK_KM = [24, 27, 30, 22, 33, 36, 40, 30, 43, 46, 35, 49, 52, 55, 40, 57, 58, 42, 28, 8];

const PUSH_FULL = "Bænkpres, incline DB press, skulder DB press, lateral raises, triceps pushdown, face pulls";
const PULL_FULL = "Pull-ups/lat pulldown, rows, seated cable row, bicep curl, hammer curl, rear delt fly";
const LEGS_FULL = "Squat, RDL, leg press, hip thrust, dead bug, bird-dog";

/* [day 1-7, sport, title, detail] per week */
const PLAN_WEEKS = [
  /* Uge 1 – 24 km */ [
    [1, "strength", "Push", PUSH_FULL],
    [2, "run", "Easy run · 5 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", LEGS_FULL],
    [4, "run", "Intervaller", "400m repeats – 5 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", PULL_FULL],
    [7, "run", "Long run · 8 km", "Roligt og kontrolleret"],
  ],
  /* Uge 2 – 27 km */ [
    [1, "strength", "Push", "Som uge 1 – forsøg lidt tungere"],
    [2, "run", "Easy run · 6 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", "Som uge 1"],
    [4, "run", "Intervaller", "Over/unders – 5 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Som uge 1"],
    [7, "run", "Long run · 10 km", "Roligt og kontrolleret"],
  ],
  /* Uge 3 – 30 km */ [
    [1, "strength", "Push", "Progressiv belastning"],
    [2, "run", "Easy run · 7 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", "Progressiv belastning"],
    [4, "run", "Intervaller", "Korte intervaller – 6 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Progressiv belastning"],
    [7, "run", "Long run · 12 km", "Roligt og kontrolleret"],
  ],
  /* Uge 4 – DELOAD – 22 km */ [
    [1, "strength", "Push (let)", "DELOAD: 60–70% af normal vægt"],
    [2, "run", "Easy run · 5 km", "Easy-tempo"],
    [3, "strength", "Legs + core (let)", "DELOAD: 60–70% af normal vægt"],
    [4, "run", "Easy run · 5 km", "Easy-tempo"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull (let)", "DELOAD: 60–70% af normal vægt"],
    [7, "run", "Long run · 8 km", "Roligt"],
  ],
  /* Uge 5 – 33 km */ [
    [1, "strength", "Push", "Progressiv belastning"],
    [2, "run", "Easy run · 7 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", "Progressiv belastning"],
    [4, "run", "Tempo", "2 km tempo-blokke – 7 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Progressiv belastning"],
    [7, "run", "Long run · 14 km", "Roligt og kontrolleret"],
  ],
  /* Uge 6 – 36 km */ [
    [1, "strength", "Push", "Progressiv belastning"],
    [2, "run", "Easy run · 8 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", "Progressiv belastning"],
    [4, "run", "Intervaller", "1 km repeats – 7 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Progressiv belastning"],
    [7, "run", "Long run · 16 km", "Roligt og kontrolleret"],
  ],
  /* Uge 7 – 40 km */ [
    [1, "strength", "Push", "Fuldt program"],
    [2, "run", "Easy run · 8 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", "Fuldt program"],
    [4, "run", "Tempo", "Drop set tempo – 8 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Fuldt program"],
    [7, "run", "Long run · 18 km", "Roligt og kontrolleret"],
  ],
  /* Uge 8 – DELOAD – 30 km */ [
    [1, "strength", "Push (let)", "DELOAD: 60–70%"],
    [2, "run", "Easy run · 6 km", "Easy-tempo"],
    [3, "strength", "Legs + core (let)", "DELOAD: 60–70%"],
    [4, "run", "Intervaller", "Tempo 1200s – 6 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull (let)", "DELOAD: 60–70%"],
    [7, "run", "Long run · 12 km", "Roligt. Begynd at teste gels på long runs"],
  ],
  /* Uge 9 – 43 km */ [
    [1, "strength", "Push", "Fuldt program"],
    [2, "run", "Easy run · 9 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", "Fuldt program"],
    [4, "run", "Intervaller", "Pyramid intervaller – 8 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Fuldt program"],
    [7, "run", "Long run · 20 km", "Roligt. Test gels undervejs"],
  ],
  /* Uge 10 – 46 km */ [
    [1, "strength", "Push", "Fuldt program"],
    [2, "run", "Easy run · 9 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", "Fuldt program"],
    [4, "run", "Tempo", "Mile up/overs – 9 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Fuldt program"],
    [7, "run", "Long run · 22 km", "Roligt. Kulhydrat-load aftenen før"],
  ],
  /* Uge 11 – DELOAD – 35 km */ [
    [1, "strength", "Push (let)", "DELOAD: 60–70%"],
    [2, "run", "Easy run · 7 km", "Easy-tempo"],
    [3, "strength", "Legs + core (let)", "DELOAD: 60–70%"],
    [4, "run", "Easy run · 7 km", "Easy-tempo"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull (let)", "DELOAD: 60–70%"],
    [7, "run", "Long run · 14 km", "Roligt"],
  ],
  /* Uge 12 – 49 km */ [
    [1, "strength", "Push", "Fuldt program"],
    [2, "run", "Easy run · 9 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", "Fuldt program"],
    [4, "run", "Intervaller", "2 km repeats – 9 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Fuldt program"],
    [7, "run", "Long run · 24 km", "Roligt og kontrolleret"],
  ],
  /* Uge 13 – 52 km */ [
    [1, "strength", "Push", "Fuldt program"],
    [2, "run", "Easy run · 10 km", "Samtale-tempo"],
    [3, "strength", "Legs + core", "Fuldt program"],
    [4, "run", "Tempo", "Half easy / half tempo – 10 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Fuldt program"],
    [7, "run", "Long run · 25 km", "Roligt og kontrolleret"],
  ],
  /* Uge 14 – 55 km */ [
    [1, "strength", "Push", "Fuldt program"],
    [2, "run", "Easy run · 10 km", "Samtale-tempo"],
    [3, "strength", "Legs + core (reduceret)", "Kun 2 sæt per øvelse – benene er under pres fra long runs"],
    [4, "run", "Intervaller", "Pyramid intervaller – 10 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Fuldt program"],
    [7, "run", "Long run · 26 km", "Roligt og kontrolleret"],
  ],
  /* Uge 15 – DELOAD – 40 km */ [
    [1, "strength", "Push (let)", "DELOAD: 60–70%"],
    [2, "run", "Easy run · 8 km", "Easy-tempo"],
    [3, "strength", "Legs + core (let)", "DELOAD: 60–70%"],
    [4, "run", "Easy run · 7 km", "Easy-tempo"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull (let)", "DELOAD: 60–70%"],
    [7, "run", "Long run · 16 km", "Roligt"],
  ],
  /* Uge 16 – 57 km – Race simulation */ [
    [1, "strength", "Push", "Fuldt program"],
    [2, "run", "Easy run · 10 km", "Samtale-tempo"],
    [3, "strength", "Legs + core (reduceret)", "Kun 2 sæt per øvelse"],
    [4, "run", "Tempo", "Race-tempo intervaller – 11 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Fuldt program"],
    [7, "run", "Long run · 28 km ⭐", "RACE SIMULATION: test sko, gel-timing og tøj. Intet nyt på løbsdagen"],
  ],
  /* Uge 17 – 58 km */ [
    [1, "strength", "Push", "Fuldt program"],
    [2, "run", "Easy run · 10 km", "Samtale-tempo"],
    [3, "strength", "Legs + core (reduceret)", "Kun 2 sæt per øvelse"],
    [4, "run", "Intervaller", "2 km repeats – 11 km total"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull", "Fuldt program"],
    [7, "run", "Long run · 30 km", "Roligt og kontrolleret – længste tur i programmet"],
  ],
  /* Uge 18 – DELOAD – 42 km */ [
    [1, "strength", "Push (let)", "DELOAD: 60–70%"],
    [2, "run", "Easy run · 8 km", "Easy-tempo"],
    [3, "strength", "Legs + core (let)", "DELOAD: 60–70%"],
    [4, "run", "Easy run · 7 km", "Easy-tempo"],
    [5, "rest", "Hvile", "Aktiv restitution eller total hvile"],
    [6, "strength", "Pull (let)", "DELOAD: 60–70%"],
    [7, "run", "Long run · 18 km", "Roligt"],
  ],
  /* Uge 19 – Taper – 28 km */ [
    [1, "strength", "Push (let)", "Kun 2–3 sæt, let vægt"],
    [2, "run", "Easy run · 6 km", "Samtale-tempo"],
    [3, "rest", "Hvile / stretch", "Mobilitetsøvelser, foam rolling"],
    [4, "run", "Intervaller", "Taper intervaller – 6 km total"],
    [5, "rest", "Hvile", "Modstå trangen til at løbe mere"],
    [6, "strength", "Pull (let)", "Kun 2–3 sæt, let vægt"],
    [7, "run", "Long run · 12 km", "Roligt"],
  ],
  /* Uge 20 – LØBSUGE */ [
    [1, "rest", "Hvile", "Total hvile"],
    [2, "run", "Easy run · 5 km", "Meget roligt"],
    [3, "rest", "Hvile", "Total hvile"],
    [4, "run", "Let løbetur · 3 km", "Bare for at bevæge sig"],
    [5, "rest", "Hvile", "Pak tasken, læg tøj frem"],
    [6, "rest", "Hvile", "Tidlig middag med kulhydrater, tidlig sengetid"],
    [7, "run", "🏁 MARATHON · 42,2 km", "Morgenmad 2–3 timer før start. Start roligere end du tror – første halvmarathon 10–15 sek/km langsommere end måltempo. Nyd det!"],
  ],
];

function generatePlan() {
  const out = [];
  PLAN_WEEKS.forEach((days, i) => {
    for (const [day, sport, title, detail] of days) {
      out.push({ id: uid(), week: i + 1, day, title, detail, sport, completed: false });
    }
  });
  return out;
}

/* ============================== Derived metrics ============================== */

function currentPlanWeek() {
  // Math.round absorbs the ±1h drift when a DST change falls inside the range
  const days = Math.round((startOfDay(Date.now()) - startOfDay(state.planStartDate)) / DAY);
  return Math.min(20, Math.max(1, Math.floor(days / 7) + 1));
}

const raceDate = () => {
  const d = new Date(state.planStartDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 20 * 7 - 1); // calendar-day add is DST-safe
  return d.getTime();
};
const daysToRace = () => Math.max(0, Math.round((raceDate() - startOfDay(Date.now())) / DAY));

function trainingLoads() {
  const items = state.cardio.map((c) => ({ date: c.date, load: (c.durationSeconds / 60) * c.effort }));
  for (const w of state.history) items.push({ date: w.date, load: Math.max(20, w.durationSeconds / 60) * 5 });
  return items;
}

function readinessScore() {
  const now = Date.now();
  const loads = trainingLoads();
  const acute = loads.filter((l) => l.date > now - 7 * DAY).reduce((a, l) => a + l.load, 0) / 7;
  const chronic = loads.filter((l) => l.date > now - 28 * DAY).reduce((a, l) => a + l.load, 0) / 28;
  if (chronic <= 1) return loads.length ? 60 : 50;
  const ratio = acute / chronic;
  let score;
  if (ratio < 0.8) score = 90 - (0.8 - ratio) * 35;
  else if (ratio <= 1.3) score = 95 - Math.abs(ratio - 1.0) * 25;
  else score = 85 - (ratio - 1.3) * 40;
  return Math.max(10, Math.min(99, Math.round(score)));
}

function readinessLabel(score) {
  if (score >= 85) return "Primed";
  if (score >= 70) return "Ready";
  if (score >= 55) return "Steady";
  if (score >= 40) return "Caution";
  return "Recover";
}

function readinessAdvice(score) {
  if (score >= 85) return "Training load is in the sweet spot. Green light for a hard session.";
  if (score >= 70) return "Solid balance of work and recovery. Stick to the plan.";
  if (score >= 55) return "Load is drifting. Keep easy days truly easy.";
  if (score >= 40) return "You're ramping fast. Watch sleep and consider a cutback day.";
  return "High strain detected. Prioritize recovery before the next hard session.";
}

const RACE_DISTANCES = [["5K", 5], ["10K", 10], ["Half Marathon", 21.0975], ["Marathon", 42.195]];

function predictSeconds(targetKM) {
  const runs = state.cardio.filter((c) => c.sport === "run" && c.distanceKM >= 2 && c.durationSeconds > 0);
  if (!runs.length) return null;
  return Math.round(Math.min(...runs.map((c) => c.durationSeconds * Math.pow(targetKM / c.distanceKM, 1.06))));
}

const totalSets = (w) => w.exercises.reduce((a, e) => a + e.sets.length, 0);
const totalVolume = (w) =>
  w.exercises.reduce((a, e) => a + e.sets.reduce((b, s) => b + s.reps * s.weight, 0), 0);

/* ============================== Seed data ============================== */

function seed() {
  const daysAgo = (d) => Date.now() - d * DAY;
  const ex = (name, category, notes = "") => ({ id: uid(), name, category, notes });

  const exercises = [
    ex("Back Squat", "Legs", "Brace hard, hit depth."),
    ex("Romanian Deadlift", "Legs", "Hinge — feel the hamstrings."),
    ex("Bulgarian Split Squat", "Legs"),
    ex("Calf Raise", "Legs", "Slow 3s lowering. Key for runners."),
    ex("Bench Press", "Push"),
    ex("Overhead Press", "Push"),
    ex("Pull-Up", "Pull"),
    ex("Barbell Row", "Pull"),
    ex("Plank", "Core", "Reps = seconds held."),
    ex("Dead Bug", "Core"),
    ex("Glute Bridge", "Core"),
    ex("Hip Flexor Stretch", "Mobility"),
  ];

  const find = (name) => exercises.find((e) => e.name === name);
  const wex = (name, sets, reps, kg) => {
    const e = find(name);
    return {
      id: uid(),
      exerciseID: e.id,
      name: e.name,
      notes: "",
      sets: Array.from({ length: sets }, () => ({ id: uid(), reps, weight: kg, done: false })),
    };
  };

  const templates = [
    { id: uid(), name: "Runner's Strength A", date: Date.now(), notes: "", durationSeconds: 0,
      exercises: [wex("Back Squat", 3, 8, 60), wex("Romanian Deadlift", 3, 10, 40), wex("Calf Raise", 3, 15, 20), wex("Plank", 3, 45, 0)] },
    { id: uid(), name: "Core & Stability", date: Date.now(), notes: "", durationSeconds: 0,
      exercises: [wex("Plank", 3, 45, 0), wex("Dead Bug", 3, 12, 0), wex("Glute Bridge", 3, 15, 0)] },
    { id: uid(), name: "Upper Body B", date: Date.now(), notes: "", durationSeconds: 0,
      exercises: [wex("Bench Press", 3, 8, 50), wex("Barbell Row", 3, 10, 40), wex("Overhead Press", 3, 8, 30), wex("Pull-Up", 3, 6, 0)] },
  ];

  const sample = JSON.parse(JSON.stringify(templates[0]));
  sample.id = uid();
  sample.date = daysAgo(4);
  sample.durationSeconds = 2580;
  sample.notes = "Felt strong. Squat moving well.";
  sample.exercises.forEach((e) => {
    e.id = uid();
    e.sets.forEach((s) => { s.id = uid(); s.done = true; });
  });

  const cs = (sport, d, km, secs, effort, notes) =>
    ({ id: uid(), sport, date: daysAgo(d), distanceKM: km, durationSeconds: secs, effort, notes });

  const cardio = [
    cs("run", 27, 16, 95 * 60, 6, "Long run, week 1 of base."),
    cs("run", 25, 8, 46 * 60, 5, "Easy aerobic."),
    cs("swim", 22, 1.5, 40 * 60, 5, "Endurance set."),
    cs("run", 20, 12, 68 * 60, 6, "Progression run."),
    cs("bike", 18, 35, 80 * 60, 5, "Sweet-spot intervals."),
    cs("run", 16, 10, 57 * 60, 6, "Hilly route."),
    cs("run", 13, 8, 47 * 60 + 30, 5, "Easy Zone 2."),
    cs("run", 11, 6, 33 * 60, 7, "Hill repeats."),
    cs("bike", 9, 28, 65 * 60, 4, "Steady spin."),
    cs("run", 8, 12, 70 * 60, 6, "Long-ish run with a strong finish."),
    cs("swim", 6, 1.2, 32 * 60, 5, "Drills + 8 × 50m."),
    cs("run", 5, 5, 26 * 60 + 15, 8, "Parkrun effort!"),
    cs("run", 2, 14, 83 * 60, 6, "Long run, felt strong."),
    cs("run", 1, 4, 24 * 60, 3, "Recovery jog."),
  ];

  return {
    exercises,
    templates,
    history: [sample],
    cardio,
    plan: generatePlan(),
    planStartDate: PLAN_START_DEFAULT,
    planVersion: PLAN_VERSION,
  };
}

/* ============================== UI state ============================== */

const ui = {
  tab: "home",
  planWeek: null,
  activitySeg: "endurance",
  trendExercise: null,
};

/* ============================== Tab bar ============================== */

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 8v8M4 10v4M17 8v8M20 10v4M7 12h10"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  trends: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19 10 12l4 4 6-8"/><path d="M15 8h5v5"/></svg>',
};

const TABS = [
  { id: "home", label: "Home" },
  { id: "plan", label: "Plan" },
  { id: "train", label: "Train" },
  { id: "activity", label: "Activity" },
  { id: "trends", label: "Trends" },
];

function renderTabbar() {
  $("#tabbar").innerHTML = TABS.map(
    (t) => `<button class="tab-btn ${ui.tab === t.id ? "active" : ""}" onclick="A.go('${t.id}')">${ICONS[t.id]}${t.label}</button>`
  ).join("");
}

/* ============================== Render: Home ============================== */

function renderHome() {
  const score = readinessScore();
  const hex = score >= 70 ? "#c7ff59" : score >= 40 ? "#ff9440" : "#ff5a5a";
  const C = (2 * Math.PI * 62).toFixed(1);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const week = currentPlanWeek();

  const predictions = predictSeconds(5) === null
    ? `<div class="card-sub" style="margin-top:8px">Log a run in the Activity tab to unlock predictions.</div>`
    : RACE_DISTANCES.map(([name, km]) => {
        const hero = name === "Marathon" ? "pred-hero" : "";
        return `<div class="pred-row"><span class="${hero}">${name}</span><span class="pred-time ${hero}">${fmtDur(predictSeconds(km))}</span></div>`;
      }).join("");

  const weekStart = (() => { const d = new Date(); const off = (d.getDay() + 6) % 7; return startOfDay(Date.now()) - off * DAY; })();
  const wc = state.cardio.filter((c) => c.date >= weekStart);
  const wh = state.history.filter((w) => w.date >= weekStart);
  const wkm = wc.reduce((a, c) => a + c.distanceKM, 0);
  const wsec = wc.reduce((a, c) => a + c.durationSeconds, 0) + wh.reduce((a, w) => a + w.durationSeconds, 0);

  const upNext = state.plan
    .filter((s) => s.week === week && !s.completed)
    .sort((a, b) => a.day - b.day)
    .slice(0, 3);

  $("#view").innerHTML = `
    <div class="view-head" style="margin-bottom:18px">
      <div>
        <div class="screen-title">${greeting}</div>
        <div class="screen-sub">${fmtDateLong(Date.now())}</div>
      </div>
    </div>
    <div class="stack">
      <div class="card">
        <div class="countdown-row">
          <div class="flag-ico">🏁</div>
          <div style="flex:1">
            <div class="card-title">Marathon Race Day</div>
            <div class="card-sub">${fmtDateLong(raceDate())}</div>
            <div class="card-sub">Week ${week} of 20 · ${phase(week)} phase</div>
          </div>
          <div>
            <div class="countdown-num">${daysToRace()}</div>
            <div class="stat-lbl" style="text-align:center">days to go</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="ring-wrap">
          <svg width="146" height="146" viewBox="0 0 150 150" style="flex:none">
            <circle cx="75" cy="75" r="62" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="13"/>
            <circle id="ringFg" cx="75" cy="75" r="62" fill="none" stroke="${hex}" stroke-width="13"
              stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"
              transform="rotate(-90 75 75)"
              style="transition: stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1); filter: drop-shadow(0 0 9px ${hex}55)"/>
            <text x="75" y="82" text-anchor="middle" class="ring-score">${score}</text>
            <text x="75" y="100" text-anchor="middle" class="ring-sub">/ 100</text>
          </svg>
          <div>
            <div class="eyebrow">Race Readiness</div>
            <div class="ready-label" style="color:${hex}">${readinessLabel(score)}</div>
            <div class="card-sub" style="line-height:1.5">${readinessAdvice(score)}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Predicted Race Times</div>
        <div class="card-sub">Live forecast from your best logged runs (Riegel formula)</div>
        <div style="margin-top:6px">${predictions}</div>
      </div>

      <div class="card">
        <div class="card-title">This Week</div>
        <div class="stat-grid">
          <div class="stat-cell"><div class="stat-val">${wkm.toFixed(1)}</div><div class="stat-lbl">km covered</div></div>
          <div class="stat-cell"><div class="stat-val">${wc.length + wh.length}</div><div class="stat-lbl">sessions</div></div>
          <div class="stat-cell"><div class="stat-val">${fmtDur(wsec)}</div><div class="stat-lbl">time trained</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:4px">Up Next · Week ${week}</div>
        ${upNext.length === 0
          ? `<div class="card-sub">All sessions done this week. Outstanding work — recover well.</div>`
          : upNext.map((s) => `
            <div class="next-row">
              ${sportIcon(s.sport, 36)}
              <div style="flex:1;min-width:0">
                <div class="title">${esc(s.title)}</div>
                <div class="detail">${esc(s.detail)}</div>
              </div>
              <div class="small muted" style="font-weight:700">${DAY_NAMES[s.day - 1]}</div>
            </div>`).join("")}
      </div>
    </div>`;

  requestAnimationFrame(() =>
    setTimeout(() => {
      const el = $("#ringFg");
      if (el) el.style.strokeDashoffset = (C * (1 - score / 100)).toFixed(1);
    }, 60)
  );
}

/* ============================== Render: Plan ============================== */

function renderPlan() {
  if (ui.planWeek === null) ui.planWeek = currentPlanWeek();
  const week = ui.planWeek;
  const sessions = state.plan.filter((s) => s.week === week).sort((a, b) => a.day - b.day);
  const done = state.plan.filter((s) => s.completed).length;
  const total = Math.max(1, state.plan.length);
  const ph = phase(week);
  const phc = PHASE_COLORS[ph];

  $("#view").innerHTML = `
    <div class="view-head">
      <div>
        <div class="screen-title">Marathon Plan</div>
        <div class="screen-sub">Din 20-ugers hybridplan · 4 løbedage + 3 styrkedage</div>
      </div>
      <button class="icon-btn" title="Plan settings" onclick="A.openPlanSettings()">⚙</button>
    </div>
    <div class="stack">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div class="card-title">20 Weeks to the Start Line</div>
          <div style="color:var(--accent);font-weight:800;font-size:14px">${done}/${total}</div>
        </div>
        <div class="progressbar"><div style="width:${((done / total) * 100).toFixed(1)}%"></div></div>
      </div>

      <div class="week-strip" id="weekStrip">
        ${Array.from({ length: 20 }, (_, i) => i + 1).map((w) => `
          <button class="week-chip ${w === week ? "sel" : ""} ${w === currentPlanWeek() ? "now" : ""}"
            data-week="${w}" onclick="A.selectWeek(${w})">
            W${w}<span class="dot" style="background:${w === week ? "rgba(0,0,0,.55)" : PHASE_COLORS[phase(w)]}"></span>
          </button>`).join("")}
      </div>

      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="font-size:19px;font-weight:800">Uge ${week}</div>
        <span class="phase-pill" style="background:${phc}22;color:${phc}">${ph.toUpperCase()}</span>
        <span class="phase-pill" style="background:rgba(255,255,255,.07);color:var(--text-sec)">${WEEK_KM[week - 1]} KM LØB</span>
      </div>

      ${sessions.map((s) => `
        <div class="card plan-card ${s.completed ? "done" : ""}" onclick="A.togglePlan('${s.id}')">
          <div class="day-badge">${DAY_NAMES[s.day - 1]}</div>
          <div class="grow">
            <div class="title">${esc(s.title)}</div>
            <div class="detail">${esc(s.detail)}</div>
          </div>
          <div style="font-size:17px">${SPORTS[s.sport].emoji}</div>
          <div class="checkmark ${s.completed ? "on" : ""}">${s.completed ? "✓" : ""}</div>
        </div>`).join("")}
    </div>`;

  const chip = document.querySelector(`.week-chip[data-week="${week}"]`);
  if (chip) chip.scrollIntoView({ inline: "center", block: "nearest" });
}

/* ============================== Render: Train ============================== */

function renderTrain() {
  $("#view").innerHTML = `
    <div class="view-head">
      <div>
        <div class="screen-title">Train</div>
        <div class="screen-sub">Strength work that keeps you running</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="icon-btn" title="Exercise library" onclick="A.openLibrary()">📚</button>
        <button class="icon-btn" title="New workout" onclick="A.editTemplate(null)">＋</button>
      </div>
    </div>
    <div class="stack">
      <button class="btn btn-accent" style="display:flex;align-items:center;justify-content:space-between;padding:16px"
        onclick="A.startEmpty()">
        <span>⚡ Start Empty Workout</span><span>›</span>
      </button>
      <div class="card-title" style="margin-top:6px">My Workouts</div>
      ${state.templates.length === 0
        ? `<div class="empty-note">No workouts yet.<br>Tap ＋ to build one from your exercises.</div>`
        : state.templates.map((t) => `
          <div class="card">
            <div class="tpl-head">
              <div style="min-width:0">
                <div class="tpl-name">${esc(t.name)}</div>
                <div class="tpl-list">${t.exercises.map((e) => esc(e.name)).join(" · ")}</div>
              </div>
              <div class="tpl-actions">
                <button class="icon-btn" title="Edit" onclick="A.editTemplate('${t.id}')">✎</button>
                <button class="icon-btn" title="Delete" onclick="A.deleteTemplate('${t.id}')">🗑</button>
              </div>
            </div>
            <button class="btn btn-ghost" style="margin-top:12px" onclick="A.startTemplate('${t.id}')">Start Workout</button>
          </div>`).join("")}
    </div>`;
}

/* ============================== Render: Activity ============================== */

function renderActivity() {
  const seg = ui.activitySeg;
  let listHTML;

  if (seg === "endurance") {
    const items = [...state.cardio].sort((a, b) => b.date - a.date);
    listHTML = items.length === 0
      ? `<div class="empty-note">No sessions yet.<br>Tap ＋ to log a run, ride or swim.</div>`
      : items.map((c) => `
        <div class="card act-row" onclick="A.editCardio('${c.id}')">
          ${sportIcon(c.sport, 44)}
          <div class="grow">
            <div class="title">${SPORTS[c.sport].label} · ${fmtKM(c.distanceKM)}</div>
            <div class="sub">${fmtDate(c.date)}${c.notes ? " · " + esc(c.notes) : ""}</div>
          </div>
          <div class="right">
            <div class="title" style="font-variant-numeric:tabular-nums">${fmtDur(c.durationSeconds)}</div>
            <div class="sub">${paceText(c)} · RPE ${c.effort}</div>
          </div>
          <button class="icon-btn" style="width:30px;height:30px;font-size:13px" title="Delete"
            onclick="event.stopPropagation();A.deleteCardio('${c.id}')">✕</button>
        </div>`).join("");
  } else {
    const items = [...state.history].sort((a, b) => b.date - a.date);
    listHTML = items.length === 0
      ? `<div class="empty-note">No gym sessions yet.<br>Finish a workout in the Train tab and it appears here.</div>`
      : items.map((w) => `
        <div class="card act-row" onclick="A.showWorkout('${w.id}')">
          ${sportIcon("strength", 44)}
          <div class="grow">
            <div class="title">${esc(w.name)}</div>
            <div class="sub">${fmtDate(w.date)} · ${totalSets(w)} sets · ${Math.round(totalVolume(w))} kg volume</div>
          </div>
          <div class="right">
            <div class="title" style="font-variant-numeric:tabular-nums">${fmtDur(w.durationSeconds)}</div>
            <div class="sub">duration</div>
          </div>
        </div>`).join("");
  }

  $("#view").innerHTML = `
    <div class="view-head">
      <div>
        <div class="screen-title">Activity</div>
        <div class="screen-sub">Everything you've logged, in one place</div>
      </div>
      <button class="icon-btn" title="Log session" onclick="A.editCardio(null)">＋</button>
    </div>
    <div class="seg" style="margin-bottom:14px">
      <button class="${seg === "endurance" ? "on" : ""}" onclick="A.setActivitySeg('endurance')">Endurance</button>
      <button class="${seg === "gym" ? "on" : ""}" onclick="A.setActivitySeg('gym')">Gym</button>
    </div>
    <div class="stack">${listHTML}</div>`;
}

/* ============================== Render: Trends ============================== */

function svgStackedBars(weeks) {
  const W = 360, H = 195, padL = 8, padB = 26, padT = 16;
  const innerW = W - padL * 2;
  const bw = Math.min(30, (innerW / weeks.length) * 0.55);
  const step = innerW / weeks.length;
  const max = Math.max(1, ...weeks.map((w) => w.parts.reduce((a, p) => a + p.value, 0)));
  let bars = "";
  weeks.forEach((w, i) => {
    const x = padL + step * i + (step - bw) / 2;
    let y = H - padB;
    for (const p of w.parts) {
      const h = (p.value / max) * (H - padB - padT);
      if (h > 0.5) {
        y -= h;
        bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h - 1.5).toFixed(1)}" rx="3" fill="${p.color}"/>`;
      }
    }
    bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="rgba(255,255,255,.4)" font-family="inherit">${w.label}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <line x1="${padL}" y1="${H - padB}" x2="${W - padL}" y2="${H - padB}" stroke="rgba(255,255,255,.1)"/>
    <text x="${padL}" y="${padT - 4}" font-size="9.5" fill="rgba(255,255,255,.4)">max ${max % 1 ? max.toFixed(1) : max} km/wk</text>
    ${bars}</svg>`;
}

function svgLine(points, hex, fmtY) {
  const W = 360, H = 175, padL = 10, padR = 10, padT = 18, padB = 24;
  const ys = points.map((p) => p.y);
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  const pad = Math.max(0.5, (ymax - ymin) * 0.15);
  ymin -= pad; ymax += pad;
  const px = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const py = (y) => padT + (1 - (y - ymin) / (ymax - ymin)) * (H - padT - padB);
  const path = points.map((p, i) => `${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  const dots = points.map((p, i) =>
    `<circle cx="${px(i).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="3.4" fill="${hex}"/>`).join("");
  const first = points[0], last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <text x="${padL}" y="${padT - 6}" font-size="9.5" fill="rgba(255,255,255,.4)">${fmtY(Math.max(...ys))} – ${fmtY(Math.min(...ys))}</text>
    <polyline points="${path}" fill="none" stroke="${hex}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${padL}" y="${H - 7}" font-size="9.5" fill="rgba(255,255,255,.4)">${fmtDate(first.t)}</text>
    <text x="${W - padR}" y="${H - 7}" text-anchor="end" font-size="9.5" fill="rgba(255,255,255,.4)">${fmtDate(last.t)}</text>
  </svg>`;
}

function renderTrends() {
  // Weekly distance, last 8 weeks
  const monday = (() => { const d = new Date(); const off = (d.getDay() + 6) % 7; return startOfDay(Date.now()) - off * DAY; })();
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = monday - i * 7 * DAY, end = start + 7 * DAY;
    const d = new Date(start);
    weeks.push({
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      parts: ["run", "bike", "swim"].map((sport) => ({
        color: SPORTS[sport].hex,
        value: state.cardio.filter((c) => c.sport === sport && c.date >= start && c.date < end)
          .reduce((a, c) => a + c.distanceKM, 0),
      })),
    });
  }
  const hasWeekly = weeks.some((w) => w.parts.some((p) => p.value > 0));

  // Strength progression
  const names = [...new Set(state.history.flatMap((w) => w.exercises.map((e) => e.name)))].sort();
  if (!ui.trendExercise || !names.includes(ui.trendExercise)) ui.trendExercise = names[0] || null;
  const strengthPts = state.history
    .map((w) => {
      const maxW = Math.max(0, ...w.exercises.filter((e) => e.name === ui.trendExercise)
        .flatMap((e) => e.sets.map((s) => s.weight)));
      return maxW > 0 ? { t: w.date, y: maxW } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  // Pace trend
  const pacePts = state.cardio
    .filter((c) => c.sport === "run" && c.distanceKM > 0 && c.durationSeconds > 0)
    .map((c) => ({ t: c.date, y: c.durationSeconds / c.distanceKM }))
    .sort((a, b) => a.t - b.t);

  const runKM = state.cardio.filter((c) => c.sport === "run").reduce((a, c) => a + c.distanceKM, 0);
  const bikeKM = state.cardio.filter((c) => c.sport === "bike").reduce((a, c) => a + c.distanceKM, 0);
  const swimKM = state.cardio.filter((c) => c.sport === "swim").reduce((a, c) => a + c.distanceKM, 0);
  const totalSecs = state.cardio.reduce((a, c) => a + c.durationSeconds, 0) +
    state.history.reduce((a, w) => a + w.durationSeconds, 0);

  $("#view").innerHTML = `
    <div class="view-head">
      <div>
        <div class="screen-title">Trends</div>
        <div class="screen-sub">Proof that the work is working</div>
      </div>
    </div>
    <div class="stack">
      <div class="card">
        <div class="card-title">Weekly Distance</div>
        <div class="card-sub">Last 8 weeks, all sports</div>
        ${hasWeekly ? svgStackedBars(weeks) : `<div class="empty-note" style="padding:24px">Log endurance sessions to see weekly volume.</div>`}
        <div class="legend">
          <span><i style="background:${SPORTS.run.hex}"></i>Run</span>
          <span><i style="background:${SPORTS.bike.hex}"></i>Bike</span>
          <span><i style="background:${SPORTS.swim.hex}"></i>Swim</span>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div>
            <div class="card-title">Strength Progression</div>
            <div class="card-sub">Top set weight per session</div>
          </div>
          ${names.length ? `<select class="input" style="width:auto;padding:8px 10px;font-size:13px"
            onchange="A.setTrendExercise(this.value)">
            ${names.map((n) => `<option ${n === ui.trendExercise ? "selected" : ""}>${esc(n)}</option>`).join("")}
          </select>` : ""}
        </div>
        ${strengthPts.length >= 2
          ? svgLine(strengthPts, SPORTS.strength.hex, (y) => y % 1 ? y.toFixed(1) + " kg" : y + " kg")
          : `<div class="empty-note" style="padding:24px">Finish at least two workouts with weighted sets of the same exercise to see a trend.</div>`}
      </div>

      <div class="card">
        <div class="card-title">Run Pace Trend</div>
        <div class="card-sub">min/km — lower is faster</div>
        ${pacePts.length >= 2
          ? svgLine(pacePts, SPORTS.run.hex, (y) => fmtDur(y) + "/km")
          : `<div class="empty-note" style="padding:24px">Log at least two runs to see your pace trend.</div>`}
      </div>

      <div class="card">
        <div class="card-title">All-Time Totals</div>
        <div class="totals-grid">
          <div class="stat-cell"><div class="stat-val" style="color:${SPORTS.run.hex}">${Math.round(runKM)}</div><div class="stat-lbl">km run</div></div>
          <div class="stat-cell"><div class="stat-val" style="color:${SPORTS.bike.hex}">${Math.round(bikeKM)}</div><div class="stat-lbl">km ridden</div></div>
          <div class="stat-cell"><div class="stat-val" style="color:${SPORTS.swim.hex}">${swimKM.toFixed(1)}</div><div class="stat-lbl">km swum</div></div>
          <div class="stat-cell"><div class="stat-val" style="color:${SPORTS.strength.hex}">${state.history.length}</div><div class="stat-lbl">gym sessions</div></div>
          <div class="stat-cell"><div class="stat-val" style="color:var(--accent)">${state.cardio.length}</div><div class="stat-lbl">endurance sessions</div></div>
          <div class="stat-cell"><div class="stat-val">${(totalSecs / 3600).toFixed(1)} h</div><div class="stat-lbl">total time</div></div>
        </div>
      </div>
    </div>`;
}

/* ============================== Modals ============================== */

function openModal(html) {
  $("#overlay-root").innerHTML =
    `<div class="overlay" onclick="if(event.target===this)A.closeModal()"><div class="sheet">${html}</div></div>`;
}
function closeModal() {
  $("#overlay-root").innerHTML = "";
}

/* ---------- Exercise library ---------- */

function openLibrary() {
  const byCat = {};
  for (const e of state.exercises) (byCat[e.category] = byCat[e.category] || []).push(e);
  const cats = [...CATEGORIES.filter((c) => byCat[c]), ...Object.keys(byCat).filter((c) => !CATEGORIES.includes(c)).sort()];

  openModal(`
    <div class="sheet-head">
      <div class="sheet-title">Exercise Library</div>
      <button class="icon-btn" onclick="A.editExercise(null)">＋</button>
    </div>
    <div class="card-sub">Your exercises — fully custom. Tap to edit.</div>
    ${state.exercises.length === 0 ? `<div class="empty-note">No exercises yet. Tap ＋ to create your first one.</div>` : ""}
    ${cats.map((cat) => `
      <div class="cat-head">${esc(cat)}</div>
      ${byCat[cat].sort((a, b) => a.name.localeCompare(b.name)).map((e) => `
        <div class="list-row">
          <div class="grow" onclick="A.editExercise('${e.id}')">
            <div class="name">${esc(e.name)}</div>
            ${e.notes ? `<div class="meta">${esc(e.notes)}</div>` : ""}
          </div>
          <button class="icon-btn" style="width:30px;height:30px;font-size:13px" onclick="A.deleteExercise('${e.id}')">✕</button>
        </div>`).join("")}`).join("")}
    <div class="sheet-actions"><button class="btn btn-ghost" onclick="A.closeModal()">Done</button></div>`);
}

function editExercise(id) {
  const ex = id ? state.exercises.find((e) => e.id === id) : null;
  openModal(`
    <div class="sheet-title">${ex ? "Edit Exercise" : "New Exercise"}</div>
    <div class="field-label">Name</div>
    <input class="input" id="ex-name" placeholder="e.g. Nordic Curl" value="${esc(ex?.name || "")}">
    <div class="field-label">Category</div>
    <select class="input" id="ex-cat">
      ${CATEGORIES.map((c) => `<option ${c === (ex?.category || "Legs") ? "selected" : ""}>${c}</option>`).join("")}
    </select>
    <div class="field-label">Notes</div>
    <textarea class="input" id="ex-notes" placeholder="Cues, setup, tempo…">${esc(ex?.notes || "")}</textarea>
    <div class="sheet-actions">
      <button class="btn btn-ghost" onclick="A.openLibrary()">Cancel</button>
      <button class="btn btn-accent" onclick="A.saveExercise(${ex ? `'${ex.id}'` : "null"})">Save</button>
    </div>`);
  setTimeout(() => $("#ex-name")?.focus(), 80);
}

function saveExercise(id) {
  const name = $("#ex-name").value.trim();
  if (!name) { $("#ex-name").focus(); return; }
  const category = $("#ex-cat").value;
  const notes = $("#ex-notes").value.trim();
  if (id) {
    const e = state.exercises.find((x) => x.id === id);
    if (e) { e.name = name; e.category = category; e.notes = notes; }
  } else {
    state.exercises.push({ id: uid(), name, category, notes });
  }
  save();
  openLibrary();
}

function deleteExercise(id) {
  const e = state.exercises.find((x) => x.id === id);
  if (!e) return;
  if (!confirm(`Delete "${e.name}"? Past workouts that used it keep their data.`)) return;
  state.exercises = state.exercises.filter((x) => x.id !== id);
  save();
  openLibrary();
}

/* ---------- Template editor ---------- */

let tplDraft = null;

function editTemplate(id) {
  const t = id ? state.templates.find((x) => x.id === id) : null;
  tplDraft = t
    ? JSON.parse(JSON.stringify(t))
    : { id: uid(), name: "", date: Date.now(), notes: "", durationSeconds: 0, exercises: [], _new: true };
  renderTplModal();
}

function renderTplModal() {
  const t = tplDraft;
  const opts = [...state.exercises].sort((a, b) => a.name.localeCompare(b.name));
  openModal(`
    <div class="sheet-title">${t._new ? "New Workout" : "Edit Workout"}</div>
    <div class="field-label">Name</div>
    <input class="input" id="tpl-name" placeholder="e.g. Runner's Strength A" value="${esc(t.name)}"
      oninput="A.tplName(this.value)">
    <div class="field-label">Exercises</div>
    ${t.exercises.length === 0 ? `<div class="card-sub" style="padding:8px 0">No exercises yet — add some below.</div>` : ""}
    ${t.exercises.map((e) => `
      <div class="list-row">
        <div class="grow" style="cursor:default">
          <div class="name">${esc(e.name)}</div>
          <div class="meta">${e.sets.length} sets × ${e.sets[0]?.reps ?? 10} reps</div>
        </div>
        <div class="stepper">
          <button onclick="A.tplSets('${e.id}',-1)">−</button><b>${e.sets.length}</b><button onclick="A.tplSets('${e.id}',1)">＋</button>
        </div>
        <button class="icon-btn" style="width:30px;height:30px;font-size:13px" onclick="A.tplRemove('${e.id}')">✕</button>
      </div>`).join("")}
    <div style="display:flex;gap:8px;margin-top:12px">
      <select class="input" id="tpl-add" style="flex:1">
        ${opts.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}
      </select>
      <button class="btn btn-ghost btn-sm" style="flex:none" onclick="A.tplAdd()">Add</button>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" onclick="A.closeModal()">Cancel</button>
      <button class="btn btn-accent" onclick="A.saveTemplate()">Save</button>
    </div>`);
}

function tplName(v) { tplDraft.name = v; }

function tplSets(exId, delta) {
  const e = tplDraft.exercises.find((x) => x.id === exId);
  if (!e) return;
  const target = Math.max(1, Math.min(10, e.sets.length + delta));
  const proto = e.sets[e.sets.length - 1] || { reps: 10, weight: 0 };
  while (e.sets.length < target) e.sets.push({ id: uid(), reps: proto.reps, weight: proto.weight, done: false });
  while (e.sets.length > target) e.sets.pop();
  renderTplModal();
}

function tplRemove(exId) {
  tplDraft.exercises = tplDraft.exercises.filter((x) => x.id !== exId);
  renderTplModal();
}

function tplAdd() {
  const sel = $("#tpl-add");
  if (!sel || !sel.value) return;
  const ex = state.exercises.find((e) => e.id === sel.value);
  if (!ex) return;
  tplDraft.exercises.push({
    id: uid(), exerciseID: ex.id, name: ex.name, notes: "",
    sets: Array.from({ length: 3 }, () => ({ id: uid(), reps: 10, weight: 0, done: false })),
  });
  renderTplModal();
}

function saveTemplate() {
  const t = tplDraft;
  t.name = (t.name || "").trim() || "Untitled Workout";
  delete t._new;
  const i = state.templates.findIndex((x) => x.id === t.id);
  if (i >= 0) state.templates[i] = t; else state.templates.push(t);
  tplDraft = null;
  save();
  closeModal();
  render();
}

function deleteTemplate(id) {
  const t = state.templates.find((x) => x.id === id);
  if (!t || !confirm(`Delete workout "${t.name}"?`)) return;
  state.templates = state.templates.filter((x) => x.id !== id);
  save();
  render();
}

/* ---------- Cardio editor ---------- */

let cardioDraft = null;

function editCardio(id) {
  const c = id ? state.cardio.find((x) => x.id === id) : null;
  cardioDraft = c
    ? JSON.parse(JSON.stringify(c))
    : { id: uid(), sport: "run", date: Date.now(), distanceKM: 5, durationSeconds: 1800, effort: 5, notes: "", _new: true };
  renderCardioModal();
}

function renderCardioModal() {
  const c = cardioDraft;
  const h = Math.floor(c.durationSeconds / 3600);
  const m = Math.floor((c.durationSeconds % 3600) / 60);
  const s = c.durationSeconds % 60;
  openModal(`
    <div class="sheet-title">${c._new ? "Log Session" : "Edit Session"}</div>
    <div class="field-label">Sport</div>
    <div class="sport-seg">
      ${["run", "bike", "swim"].map((sp) => `
        <button class="${c.sport === sp ? "on" : ""}" onclick="A.cardioSport('${sp}')">${SPORTS[sp].emoji} ${SPORTS[sp].label}</button>`).join("")}
    </div>
    <div class="field-label">Date & time</div>
    <input class="input" type="datetime-local" id="cd-date" value="${toLocalDT(c.date)}">
    <div class="field-label">Distance (km)</div>
    <input class="input" type="number" id="cd-dist" inputmode="decimal" step="0.1" min="0" value="${c.distanceKM}">
    <div class="field-label">Duration</div>
    <div class="dur-grid">
      <div><input class="input num-in" type="number" id="cd-h" min="0" max="23" value="${h}"><div class="hint">hours</div></div>
      <div><input class="input num-in" type="number" id="cd-m" min="0" max="59" value="${m}"><div class="hint">min</div></div>
      <div><input class="input num-in" type="number" id="cd-s" min="0" max="59" value="${s}"><div class="hint">sec</div></div>
    </div>
    <div class="field-label">Effort · RPE <span id="cd-rpe-val">${c.effort}</span>/10</div>
    <input type="range" id="cd-rpe" min="1" max="10" step="1" value="${c.effort}"
      oninput="document.getElementById('cd-rpe-val').textContent=this.value">
    <div class="field-label">Notes</div>
    <textarea class="input" id="cd-notes" placeholder="How did it feel?">${esc(c.notes)}</textarea>
    <div class="sheet-actions">
      <button class="btn btn-ghost" onclick="A.closeModal()">Cancel</button>
      <button class="btn btn-accent" onclick="A.saveCardio()">Save</button>
    </div>`);
}

function cardioSport(sp) {
  cardioDraft.sport = sp;
  // Preserve typed values before re-render
  cardioDraft.date = new Date($("#cd-date").value || Date.now()).getTime() || cardioDraft.date;
  cardioDraft.distanceKM = parseFloat($("#cd-dist").value) || cardioDraft.distanceKM;
  cardioDraft.durationSeconds =
    (parseInt($("#cd-h").value) || 0) * 3600 + (parseInt($("#cd-m").value) || 0) * 60 + (parseInt($("#cd-s").value) || 0);
  cardioDraft.effort = parseInt($("#cd-rpe").value) || 5;
  cardioDraft.notes = $("#cd-notes").value;
  renderCardioModal();
}

function saveCardio() {
  const c = cardioDraft;
  const date = new Date($("#cd-date").value);
  c.date = isNaN(date.getTime()) ? Date.now() : date.getTime();
  c.distanceKM = Math.max(0, parseFloat($("#cd-dist").value) || 0);
  c.durationSeconds =
    (parseInt($("#cd-h").value) || 0) * 3600 + (parseInt($("#cd-m").value) || 0) * 60 + (parseInt($("#cd-s").value) || 0);
  c.effort = parseInt($("#cd-rpe").value) || 5;
  c.notes = $("#cd-notes").value.trim();
  if (c.distanceKM <= 0 || c.durationSeconds <= 0) { alert("Enter a distance and duration."); return; }
  delete c._new;
  const i = state.cardio.findIndex((x) => x.id === c.id);
  if (i >= 0) state.cardio[i] = c; else state.cardio.unshift(c);
  cardioDraft = null;
  save();
  closeModal();
  render();
}

function deleteCardio(id) {
  if (!confirm("Delete this session?")) return;
  state.cardio = state.cardio.filter((x) => x.id !== id);
  save();
  render();
}

/* ---------- Workout detail ---------- */

function showWorkout(id) {
  const w = state.history.find((x) => x.id === id);
  if (!w) return;
  openModal(`
    <div class="sheet-title">${esc(w.name)}</div>
    <div class="card-sub">${fmtDate(w.date)} · ${fmtDur(w.durationSeconds)} · ${totalSets(w)} sets · ${Math.round(totalVolume(w))} kg volume</div>
    ${w.exercises.map((e) => `
      <div class="cat-head">${esc(e.name)}</div>
      ${e.sets.map((s, i) => `
        <div class="list-row" style="padding:7px 4px">
          <div class="grow" style="cursor:default"><span class="muted small">Set ${i + 1}</span></div>
          <span style="font-size:13.5px;font-variant-numeric:tabular-nums">${s.weight > 0 ? s.weight + " kg × " : ""}${s.reps}${s.weight > 0 ? "" : " reps"}</span>
          <span style="color:${s.done ? "var(--accent)" : "var(--text-ter)"}">${s.done ? "✓" : "○"}</span>
        </div>`).join("")}
      ${e.notes ? `<div class="card-sub" style="padding:4px">${esc(e.notes)}</div>` : ""}`).join("")}
    ${w.notes ? `<div class="cat-head">Notes</div><div class="card-sub" style="padding:4px">${esc(w.notes)}</div>` : ""}
    <div class="sheet-actions">
      <button class="btn btn-danger" onclick="A.deleteWorkout('${w.id}')">Delete</button>
      <button class="btn btn-ghost" onclick="A.closeModal()">Done</button>
    </div>`);
}

function deleteWorkout(id) {
  if (!confirm("Delete this workout from history?")) return;
  state.history = state.history.filter((x) => x.id !== id);
  save();
  closeModal();
  render();
}

/* ---------- Plan settings ---------- */

function openPlanSettings() {
  openModal(`
    <div class="sheet-title">Plan Settings</div>
    <div class="field-label">Plan start date</div>
    <input class="input" type="date" id="plan-start" value="${toLocalDate(state.planStartDate)}">
    <div class="card-sub" style="margin-top:8px">Race day is the Sunday of week 20 — exactly 20 weeks after the start date.</div>
    <div class="sheet-actions" style="flex-direction:column">
      <button class="btn btn-accent" onclick="A.applyPlanStart(false)">Apply Start Date</button>
      <button class="btn btn-danger" onclick="A.applyPlanStart(true)">Regenerate Plan (resets check-offs)</button>
      <button class="btn btn-ghost" onclick="A.closeModal()">Cancel</button>
    </div>`);
}

function applyPlanStart(regen) {
  const v = $("#plan-start").value;
  const d = v ? new Date(v + "T00:00:00") : null;
  if (!d || isNaN(d.getTime())) return;
  if (regen && !confirm("Regenerate the whole plan? All check-offs will be cleared.")) return;
  state.planStartDate = d.getTime();
  if (regen) state.plan = generatePlan();
  ui.planWeek = null;
  save();
  closeModal();
  render();
}

/* ============================== Active workout ============================== */

let aw = null; // { w, start, restEnd, interval }
const REST_SECONDS = 90;

function startEmpty() {
  startWorkout({ id: uid(), name: "Quick Workout", date: Date.now(), notes: "", durationSeconds: 0, exercises: [] });
}

function startTemplate(id) {
  const t = state.templates.find((x) => x.id === id);
  if (!t) return;
  const w = JSON.parse(JSON.stringify(t));
  w.id = uid();
  w.date = Date.now();
  w.durationSeconds = 0;
  w.notes = "";
  w.exercises.forEach((e) => {
    e.id = uid();
    e.sets.forEach((s) => { s.id = uid(); s.done = false; });
  });
  startWorkout(w);
}

function startWorkout(w) {
  aw = { w, start: Date.now(), restEnd: null };
  renderAW();
  aw.interval = setInterval(awTick, 1000);
}

function renderAW() {
  if (!aw) { $("#aw-root").innerHTML = ""; return; }
  const w = aw.w;
  $("#aw-root").innerHTML = `
    <div class="aw"><div class="aw-inner">
      <div class="aw-top">
        <button class="icon-btn" onclick="A.awDiscard()">✕</button>
        <input class="aw-name" id="aw-name" placeholder="Workout name" value="${esc(w.name)}"
          oninput="A.awName(this.value)">
      </div>
      <div class="aw-meta">
        <span class="aw-timer" id="aw-time">${fmtDur((Date.now() - aw.start) / 1000)}</span>
        <span>${w.exercises.length} exercises · ${totalSets(w)} sets</span>
      </div>
      <div class="aw-body" id="aw-body">${awBodyHTML()}</div>
      <div id="aw-rest"></div>
    </div></div>`;
  awRenderRest();
}

function awBodyHTML() {
  const w = aw.w;
  return `
    <div class="stack">
      ${w.exercises.map((e) => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="card-title">${esc(e.name)}</div>
            <button class="icon-btn" style="width:30px;height:30px;font-size:13px" title="Remove exercise"
              onclick="A.awRemoveExercise('${e.id}')">✕</button>
          </div>
          <div class="set-head"><span>SET</span><span>KG</span><span>REPS</span><span>✓</span></div>
          ${e.sets.map((s, i) => `
            <div class="set-row">
              <div class="set-num">${i + 1}</div>
              <input class="num-in" type="number" inputmode="decimal" step="0.5" min="0" value="${s.weight}"
                onchange="A.awEditSet('${e.id}','${s.id}','weight',this.value)">
              <input class="num-in" type="number" inputmode="numeric" min="0" value="${s.reps}"
                onchange="A.awEditSet('${e.id}','${s.id}','reps',this.value)">
              <button class="check ${s.done ? "on" : ""}" onclick="A.awToggleSet('${e.id}','${s.id}')">${s.done ? "✓" : ""}</button>
            </div>`).join("")}
          <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px" onclick="A.awAddSet('${e.id}')">＋ Add Set</button>
          <input class="input" style="margin-top:10px;font-size:13px" placeholder="Exercise notes…"
            value="${esc(e.notes)}" onchange="A.awExNotes('${e.id}',this.value)">
        </div>`).join("")}
      <button class="btn btn-ghost" onclick="A.awAddExercise()">＋ Add Exercise</button>
      <textarea class="input" placeholder="Workout notes…" onchange="A.awNotes(this.value)">${esc(w.notes)}</textarea>
      <button class="btn btn-accent" ${w.exercises.length === 0 ? "disabled style='opacity:.4'" : ""}
        onclick="A.awFinish()">Finish Workout</button>
    </div>`;
}

function awRefreshBody() {
  const body = $("#aw-body");
  if (body) body.innerHTML = awBodyHTML();
  const meta = document.querySelector(".aw-meta span:last-child");
  if (meta && aw) meta.textContent = `${aw.w.exercises.length} exercises · ${totalSets(aw.w)} sets`;
}

function awTick() {
  if (!aw) return;
  const t = $("#aw-time");
  if (t) t.textContent = fmtDur((Date.now() - aw.start) / 1000);
  awRenderRest();
}

function awRenderRest() {
  const host = $("#aw-rest");
  if (!host || !aw) return;
  if (!aw.restEnd || aw.restEnd <= Date.now()) {
    if (host.innerHTML) host.innerHTML = "";
    return;
  }
  const remaining = Math.ceil((aw.restEnd - Date.now()) / 1000);
  const pct = Math.max(0, Math.min(100, 100 * (1 - remaining / REST_SECONDS)));
  // Build the banner once; per-second ticks only touch the text node and bar width
  if (!host.querySelector(".rest-banner")) {
    host.innerHTML = `
      <div class="rest-banner">
        <span style="font-size:18px">⏳</span>
        <div class="bar">
          <div class="t" id="rest-t"></div>
          <div class="progressbar" style="margin-top:0"><div id="rest-bar" style="transition:width 1s linear"></div></div>
        </div>
        <button class="skip" onclick="A.awSkipRest()">Skip</button>
      </div>`;
  }
  $("#rest-t").textContent = `REST · ${fmtDur(remaining)}`;
  $("#rest-bar").style.width = pct + "%";
}

function awName(v) { if (aw) aw.w.name = v; }
function awNotes(v) { if (aw) aw.w.notes = v; }

function awExNotes(exId, v) {
  const e = aw?.w.exercises.find((x) => x.id === exId);
  if (e) e.notes = v;
}

function awEditSet(exId, setId, field, value) {
  const e = aw?.w.exercises.find((x) => x.id === exId);
  const s = e?.sets.find((x) => x.id === setId);
  if (!s) return;
  if (field === "weight") s.weight = Math.max(0, parseFloat(value) || 0);
  else s.reps = Math.max(0, parseInt(value) || 0);
}

function awToggleSet(exId, setId) {
  const e = aw?.w.exercises.find((x) => x.id === exId);
  const s = e?.sets.find((x) => x.id === setId);
  if (!s) return;
  s.done = !s.done;
  if (s.done) aw.restEnd = Date.now() + REST_SECONDS * 1000;
  awRefreshBody();
  awRenderRest();
}

function awAddSet(exId) {
  const e = aw?.w.exercises.find((x) => x.id === exId);
  if (!e) return;
  const proto = e.sets[e.sets.length - 1] || { reps: 10, weight: 0 };
  e.sets.push({ id: uid(), reps: proto.reps, weight: proto.weight, done: false });
  awRefreshBody();
}

function awRemoveExercise(exId) {
  if (!aw) return;
  if (!confirm("Remove this exercise from the workout?")) return;
  aw.w.exercises = aw.w.exercises.filter((x) => x.id !== exId);
  awRefreshBody();
}

function awAddExercise() {
  const opts = [...state.exercises].sort((a, b) => a.name.localeCompare(b.name));
  openModal(`
    <div class="sheet-title">Add Exercise</div>
    <input class="input" id="pick-search" placeholder="Search…" style="margin-top:10px"
      oninput="A.awFilterPick(this.value)">
    <div id="pick-list">${awPickListHTML(opts)}</div>
    <div class="sheet-actions"><button class="btn btn-ghost" onclick="A.closeModal()">Cancel</button></div>`);
  setTimeout(() => $("#pick-search")?.focus(), 80);
}

function awPickListHTML(list) {
  if (!list.length) return `<div class="empty-note" style="padding:20px">No matches.</div>`;
  return list.map((e) => `
    <div class="list-row">
      <div class="grow" onclick="A.awPick('${e.id}')">
        <div class="name">${esc(e.name)}</div>
        <div class="meta">${esc(e.category)}</div>
      </div>
    </div>`).join("");
}

function awFilterPick(q) {
  q = q.trim().toLowerCase();
  const list = state.exercises
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const host = $("#pick-list");
  if (host) host.innerHTML = awPickListHTML(list);
}

function awPick(id) {
  const ex = state.exercises.find((e) => e.id === id);
  if (!ex || !aw) return;
  aw.w.exercises.push({
    id: uid(), exerciseID: ex.id, name: ex.name, notes: "",
    sets: Array.from({ length: 3 }, () => ({ id: uid(), reps: 10, weight: 0, done: false })),
  });
  closeModal();
  awRefreshBody();
}

function awFinish() {
  if (!aw || aw.w.exercises.length === 0) return;
  aw.w.durationSeconds = Math.round((Date.now() - aw.start) / 1000);
  aw.w.date = Date.now();
  aw.w.name = (aw.w.name || "").trim() || "Workout";
  state.history.unshift(aw.w);
  endAW();
  save();
  render();
}

function awDiscard() {
  if (!aw) return;
  if (!confirm("Discard this workout? Nothing will be saved.")) return;
  endAW();
}

function awSkipRest() {
  if (aw) aw.restEnd = null;
  awRenderRest();
}

function endAW() {
  if (aw?.interval) clearInterval(aw.interval);
  aw = null;
  $("#aw-root").innerHTML = "";
}

/* ============================== Router ============================== */

function render() {
  renderTabbar();
  if (ui.tab === "home") renderHome();
  else if (ui.tab === "plan") renderPlan();
  else if (ui.tab === "train") renderTrain();
  else if (ui.tab === "activity") renderActivity();
  else renderTrends();
}

/* ============================== Public API ============================== */

window.A = {
  go(tab) { ui.tab = tab; $("#view").scrollTop = 0; render(); },
  closeModal,
  // plan
  selectWeek(w) { ui.planWeek = w; render(); },
  togglePlan(id) {
    const s = state.plan.find((x) => x.id === id);
    if (s) { s.completed = !s.completed; save(); render(); }
  },
  openPlanSettings, applyPlanStart,
  // library
  openLibrary, editExercise, saveExercise, deleteExercise,
  // templates
  editTemplate, deleteTemplate, saveTemplate, tplName, tplSets, tplRemove, tplAdd,
  // activity
  setActivitySeg(seg) { ui.activitySeg = seg; render(); },
  editCardio, cardioSport, saveCardio, deleteCardio, showWorkout, deleteWorkout,
  // trends
  setTrendExercise(name) { ui.trendExercise = name; render(); },
  // active workout
  startEmpty, startTemplate, awName, awNotes, awExNotes, awEditSet, awToggleSet,
  awAddSet, awRemoveExercise, awAddExercise, awFilterPick, awPick, awFinish, awDiscard, awSkipRest,
};

/* ============================== Boot ============================== */

state = load() || seed();
save();
render();
