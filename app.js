/* Prime: one place for food, training, body and activity.
   Static app. Data lives in a private GitHub repo (JSON files), read and written
   through the GitHub API with a token kept only in this browser.
   Without a token the app runs on sample data that is never saved. */
'use strict';

/* ---------- small helpers ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const fmtDay = s => parseYmd(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtShort = s => parseYmd(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtLong = s => parseYmd(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mondayOf = s => { const d = parseYmd(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d); };
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const dowKey = s => DOW[(parseYmd(s).getDay() + 6) % 7];
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmt = (n, dp = 0) => n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const sum = a => a.reduce((s, x) => s + (x || 0), 0);
const avg = a => { const v = a.filter(x => x != null && Number.isFinite(x)); return v.length ? sum(v) / v.length : null; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked' || k === 'open' || k === 'selected') e[k] = !!v;
    else if (k === 'style') e.setAttribute('style', v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    e.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return e;
}
function store(key, val) {
  try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); }
  catch { return null; }
}

/* ---------- data model ---------- */
const FILES = ['food', 'training', 'body', 'activities', 'health', 'settings'];
const DEFAULTS = {
  food: { meals: [] },
  training: { sessions: [] },
  body: { weighins: [], measurements: [] },
  activities: { activities: [] },
  health: { days: {}, workouts: [] },
  settings: {
    targets: { kcal: 2350, protein: 160 },
    goalWeight: 79,
    tenKGoalMin: 45,
    schedule: { mon: 'Rest · walk', tue: 'Rest', wed: 'Rest', thu: 'Upper B', fri: 'Lower B + athletics', sat: 'Upper A', sun: 'Lower A' },
  },
};
const COLL = { food: 'meals', training: 'sessions', activities: 'activities' };

function applyOps(data, ops) {
  for (const op of ops) {
    if (op.t === 'upsert') {
      const arr = data[op.c] || (data[op.c] = []);
      const i = arr.findIndex(r => r.id === op.r.id);
      if (i >= 0) arr[i] = op.r; else arr.push(op.r);
    } else if (op.t === 'remove') {
      data[op.c] = (data[op.c] || []).filter(r => r.id !== op.id);
    } else if (op.t === 'set') {
      data[op.k] = op.v;
    } else if (op.t === 'health') {
      data.days = Object.assign(data.days || {}, op.days);
      data.days = Object.fromEntries(Object.entries(data.days).sort());
      const seen = new Set(op.workouts.map(w => w.start));
      data.workouts = (data.workouts || []).filter(w => !seen.has(w.start)).concat(op.workouts).sort((a, b) => a.start < b.start ? -1 : 1);
      data.importedAt = op.at;
    }
  }
  return data;
}

/* ---------- app state ---------- */
const state = {
  mode: 'sample',         // 'sample' | 'github'
  loading: false,
  data: clone(DEFAULTS),
  sha: {},
  pending: {},            // file -> ops not yet saved to GitHub
  sync: { status: '', msg: '' },
  ui: { foodDay: todayStr(), trainTab: 'log', bodyTab: 'weight', moveTab: 'activities', foodMetric: 'kcal', bodyRange: 90, healthMetric: 'steps', progressEx: '', confirm: null },
  draft: null,
};

function gh() { return store('prime.gh') || {}; }
function connected() { const g = gh(); return !!(g.owner && g.repo && g.token); }
function persistCache() {
  if (state.mode !== 'github') return;
  store('prime.cache', { data: state.data, sha: state.sha, pending: state.pending, at: Date.now() });
}

/* ---------- GitHub ---------- */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
class GhError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(path, opts = {}) {
  const g = gh();
  const r = await fetch(`https://api.github.com/repos/${g.owner}/${g.repo}${path}`, {
    ...opts,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${g.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
  });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).message || msg; } catch { /* keep statusText */ }
    throw new GhError(r.status, msg);
  }
  return r.status === 204 ? null : r.json();
}
async function ghGet(file) {
  try {
    const j = await api(`/contents/${file}.json`);
    return { data: Object.assign(clone(DEFAULTS[file]), JSON.parse(b64decode(j.content))), sha: j.sha };
  } catch (e) {
    if (e.status === 404) return { data: clone(DEFAULTS[file]), sha: null };
    throw e;
  }
}
async function ghPut(file, body, sha) {
  return api(`/contents/${file}.json`, {
    method: 'PUT',
    body: JSON.stringify({ message: `Update ${file} from app`, content: b64encode(body), ...(sha ? { sha } : {}) }),
  });
}
function explain(e) {
  if (e.status === 401) return 'The token was refused. Make a new one in Settings.';
  if (e.status === 403) return 'The token can’t write to this repo. Give it Contents: Read and write.';
  if (e.status === 404) return 'Repo not found, or the token can’t see it.';
  if (e instanceof TypeError) return 'No connection. Your change is kept here and will save when you’re back online.';
  return e.message || 'Something went wrong.';
}

async function loadAll() {
  if (!connected()) { state.mode = 'sample'; state.data = sampleData(); render(); return; }
  state.mode = 'github';
  const cache = store('prime.cache');
  if (cache && cache.data) {
    state.data = Object.assign(clone(DEFAULTS), cache.data);
    state.sha = cache.sha || {};
    state.pending = cache.pending || {};
  } else state.loading = true;
  render();
  setSync('loading', 'Loading…');
  try {
    await api('');
    const results = await Promise.all(FILES.map(f => ghGet(f)));
    FILES.forEach((f, i) => {
      const ops = state.pending[f] || [];
      state.data[f] = applyOps(results[i].data, ops);
      state.sha[f] = results[i].sha;
    });
    state.loading = false;
    persistCache();
    setSync('ok', 'Synced');
    render();
    FILES.forEach(f => { if ((state.pending[f] || []).length) flush(f); });
  } catch (e) {
    state.loading = false;
    setSync('err', explain(e));
    render();
  }
}

const flushing = {};
async function flush(file) {
  if (flushing[file]) { flushing[file] = 'again'; return; }
  flushing[file] = true;
  setSync('saving', 'Saving…');
  try {
    let tries = 0;
    while ((state.pending[file] || []).length) {
      const n = state.pending[file].length;
      const body = JSON.stringify(state.data[file], null, 1) + '\n';
      try {
        const res = await ghPut(file, body, state.sha[file]);
        state.sha[file] = res.content.sha;
        state.pending[file] = state.pending[file].slice(n);
        tries = 0;
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && tries++ < 3) {
          const fresh = await ghGet(file);
          state.data[file] = applyOps(fresh.data, state.pending[file]);
          state.sha[file] = fresh.sha;
          continue;
        }
        throw e;
      }
    }
    setSync('ok', 'Saved');
  } catch (e) {
    setSync('err', explain(e));
  } finally {
    const again = flushing[file] === 'again';
    flushing[file] = false;
    persistCache();
    if (again) flush(file);
  }
}

function commit(file, ops, message) {
  applyOps(state.data[file], ops);
  if (state.mode === 'github') {
    state.pending[file] = (state.pending[file] || []).concat(ops);
    persistCache();
    flush(file);
    if (message) toast(message);
  } else {
    toast('Sample mode: not saved. Connect your data in Settings.');
  }
  render();
}

function setSync(status, msg) {
  state.sync = { status, msg };
  const el = document.getElementById('sync');
  if (!el) return;
  el.textContent = state.mode === 'github' ? msg : '';
  el.className = 'sync' + (status === 'err' ? ' err' : '');
  el.title = msg;
  if (status === 'err') toast(msg);
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ---------- domain helpers ---------- */
const T = () => state.data.settings.targets || DEFAULTS.settings.targets;
function mealsOn(day) { return state.data.food.meals.filter(m => m.date === day).sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1); }
function dayTotals(day) { const ms = mealsOn(day); return { kcal: sum(ms.map(m => +m.kcal || 0)), protein: sum(ms.map(m => +m.protein || 0)), n: ms.length }; }

function weightSeries() {
  const byDay = {};
  for (const [d, v] of Object.entries(state.data.health.days || {})) if (v.weightKg) byDay[d] = { kg: v.weightKg, src: 'Apple Health' };
  for (const w of state.data.body.weighins) byDay[w.date] = { kg: +w.kg, src: 'Logged', id: w.id };
  return Object.entries(byDay).sort().map(([date, v]) => ({ date, ...v }));
}
function rollingAvg(series, day, n = 7) {
  const from = addDays(day, -(n - 1));
  return avg(series.filter(p => p.date >= from && p.date <= day).map(p => p.kg));
}

const KIND = { weight: 'Weight × reps', bw: 'Bodyweight reps', hold: 'Hold (seconds)' };
function guessKind(name) {
  const n = name.toLowerCase();
  if (/push-?up|hspu|dip|pull-?up|chin-?up|muscle-?up|pistol|leg raise|toes to bar|burpee|jump/.test(n)) return 'bw';
  if (/hold|lever|plank|handstand|l-?sit|hang\b|dead hang/.test(n)) return 'hold';
  return 'weight';
}
const EXERCISES = [
  'Bench press', 'Incline dumbbell press', 'Dumbbell shoulder press', 'Overhead press', 'Dips', 'Weighted dips', 'Push-ups',
  'Pull-ups', 'Weighted pull-ups', 'Chin-ups', 'Muscle-ups', 'Lat pulldown', 'Chest-supported row', 'Cable row', 'Face pull',
  'Hack squat', 'Leg press', 'Bulgarian split squat', 'Romanian deadlift', 'Leg curl', 'Leg extension', 'Hip thrust',
  'Hanging leg raise', 'Tuck front lever hold', 'Front lever hold', 'Wall handstand hold', 'Wall handstand push-ups', 'Plank',
  'Biceps curl', 'Box jump', 'Broad jump',
];
function e1rm(kg, reps) { return reps <= 1 ? kg : kg * (1 + reps / 30); }
function setMetric(kind, st) {
  if (kind === 'weight') return st.kg && st.reps ? e1rm(+st.kg, +st.reps) : null;
  if (kind === 'hold') return st.sec ? +st.sec : null;
  return st.reps ? +st.reps : null;
}
function exMetric(ex) { return Math.max(-Infinity, ...ex.sets.map(st => setMetric(ex.kind, st)).filter(v => v != null)); }
function fmtSet(kind, st) {
  const plus = st.kg ? ` +${fmt(+st.kg, +st.kg % 1 ? 1 : 0)}` : '';
  if (kind === 'weight') return `${fmt(+st.kg, +st.kg % 1 ? 1 : 0)}×${st.reps}`;
  if (kind === 'hold') return `${st.sec}s${plus}`;
  return `${st.reps}${plus}`;
}
const metricUnit = kind => kind === 'weight' ? 'kg e1RM' : kind === 'hold' ? 's best hold' : 'best reps';
function exHistory(name) {
  const out = [];
  for (const sess of [...state.data.training.sessions].sort((a, b) => a.date < b.date ? -1 : 1))
    for (const ex of sess.exercises) if (ex.name.toLowerCase() === name.toLowerCase()) out.push({ date: sess.date, sess, ex, m: exMetric(ex) });
  return out;
}
function lastOf(name, beforeDate) {
  const hst = exHistory(name).filter(x => !beforeDate || x.date < beforeDate);
  return hst[hst.length - 1] || null;
}

function parseDur(str) {
  const p = String(str || '').trim().split(':').map(Number);
  if (!p.length || p.some(x => !Number.isFinite(x))) return null;
  if (p.length === 1) return p[0] * 60;
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] * 3600 + p[1] * 60 + p[2];
}
function fmtDur(sec) {
  if (sec == null) return '–';
  sec = Math.round(sec);
  const hh = Math.floor(sec / 3600), mm = Math.floor(sec % 3600 / 60), ss = sec % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}
const pace = a => a.distanceKm && a.durationSec ? a.durationSec / a.distanceKm : null;
function allActivities() {
  const watch = (state.data.health.workouts || []).map(w => ({
    id: 'w' + w.start, date: w.start.slice(0, 10), type: w.type.replace(/([a-z])([A-Z])/g, '$1 $2'),
    distanceKm: w.distanceKm, durationSec: w.durationMin * 60, avgHr: w.avgHr, kcal: w.activeKcal, source: 'Apple Watch',
  }));
  return [...state.data.activities.activities.map(a => ({ ...a, source: 'Logged' })), ...watch].sort((a, b) => a.date < b.date ? 1 : -1);
}

/* ---------- charts ---------- */
const charts = new WeakMap();
function chartBox(cfg) { const el = h('div', { class: 'chart', role: 'img', 'aria-label': cfg.aria || '' }); charts.set(el, cfg); return el; }
function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}
function drawChart(el) {
  const cfg = charts.get(el);
  if (!cfg) return;
  el.textContent = '';
  const W = Math.max(260, Math.round(el.clientWidth || 320)), H = cfg.height || 170;
  const padL = 38, padR = 10, padT = 14, padB = 22;
  const n = cfg.x.length;
  const vals = cfg.series.flatMap(sr => sr.values).filter(v => v != null);
  if (!vals.length || !n) { el.appendChild(h('p', { class: 'empty', text: cfg.empty || 'Nothing to chart yet.' })); return; }
  if (cfg.target != null) vals.push(cfg.target);
  let lo = cfg.zero ? 0 : Math.min(...vals), hi = Math.max(...vals);
  if (!cfg.zero) { const padV = (hi - lo) * 0.12 || 1; lo -= padV; hi += padV; }
  const ticks = niceTicks(lo, hi, 3);
  lo = ticks[0]; hi = ticks[ticks.length - 1];
  const band = (W - padL - padR) / n;
  const X = i => padL + band * (i + 0.5);
  const Y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const grid = s('g', { class: 'grid' }), axis = s('g', { class: 'axis' });
  for (const t of ticks) {
    grid.appendChild(s('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t) }));
    axis.appendChild(s('text', { x: padL - 6, y: Y(t) + 4, 'text-anchor': 'end' }, cfg.yFmt ? cfg.yFmt(t) : fmt(t, t % 1 ? 1 : 0)));
  }
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - padL) / 62))));
  cfg.x.forEach((d, i) => {
    if ((n - 1 - i) % labelEvery === 0) axis.appendChild(s('text', { x: X(i), y: H - 5, 'text-anchor': 'middle' }, fmtShort(d)));
  });
  svg.append(grid, axis);
  const marks = s('g');
  for (const sr of cfg.series) {
    if (sr.kind === 'bar') {
      const bw = Math.max(2, Math.min(26, band - 2) * (band > 10 ? 0.7 : 0.9));
      sr.values.forEach((v, i) => {
        if (v == null || v <= 0) return;
        const x = X(i) - bw / 2, y = Y(v), base = Y(Math.max(lo, 0)), r = Math.min(4, bw / 2, (base - y) / 2);
        marks.appendChild(s('path', {
          d: `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${base}Z`,
          style: `fill:${(sr.colorAt && sr.colorAt(v, i)) || sr.color}`, 'data-i': i,
        }));
      });
    } else if (sr.kind === 'dots') {
      sr.values.forEach((v, i) => { if (v != null) marks.appendChild(s('circle', { cx: X(i), cy: Y(v), r: 3.5, style: `fill:${sr.color};opacity:.55` })); });
    } else {
      let d = '', pen = false;
      sr.values.forEach((v, i) => { if (v == null) { pen = sr.gaps ? false : pen; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
      marks.appendChild(s('path', { d, style: `fill:none;stroke:${sr.color};stroke-width:2.25;stroke-linejoin:round;stroke-linecap:round` }));
      const lastI = sr.values.map((v, i) => v != null ? i : -1).filter(i => i >= 0).pop();
      if (lastI != null) marks.appendChild(s('circle', { cx: X(lastI), cy: Y(sr.values[lastI]), r: 4.5, style: `fill:${sr.color};stroke:var(--surface);stroke-width:2` }));
      if (sr.markers) sr.values.forEach((v, i) => { if (v != null && i !== lastI) marks.appendChild(s('circle', { cx: X(i), cy: Y(v), r: 3.5, style: `fill:${sr.color};stroke:var(--surface);stroke-width:1.5` })); });
    }
  }
  svg.appendChild(marks);
  if (cfg.target != null) {
    svg.appendChild(s('line', { class: 'target', x1: padL, x2: W - padR, y1: Y(cfg.target), y2: Y(cfg.target) }));
    if (cfg.targetLabel) svg.appendChild(s('text', { class: 'target-lbl', x: W - padR, y: Y(cfg.target) - 5, 'text-anchor': 'end' }, cfg.targetLabel));
  }
  const cross = s('line', { class: 'cross', y1: padT, y2: H - padB, visibility: 'hidden' });
  svg.appendChild(cross);
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const hit = s('rect', { x: padL, y: 0, width: W - padL - padR, height: H, style: 'fill:transparent;cursor:crosshair' });
  svg.appendChild(hit);
  const show = ev => {
    const rect = svg.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * (W / rect.width);
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - padL) / band)));
    const lines = cfg.series.map(sr => sr.values[i] == null ? null : `${sr.label ? sr.label + ': ' : ''}<b>${cfg.tipFmt ? cfg.tipFmt(sr.values[i], sr) : fmt(sr.values[i])}</b>`).filter(Boolean);
    if (!lines.length) { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); return; }
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = '';
    tip.append(h('div', { text: fmtDay(cfg.x[i]) }));
    for (const l of lines) { const d = h('div'); d.innerHTML = l; tip.append(d); }
    const top = Math.min(...cfg.series.map(sr => sr.values[i]).filter(v => v != null).map(Y));
    tip.style.left = Math.max(60, Math.min(rect.width - 60, X(i) * rect.width / W)) + 'px';
    tip.style.top = top * rect.height / H + 'px';
    tip.hidden = false;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
  el.append(svg, tip);
}
function drawAll() { document.querySelectorAll('.chart').forEach(drawChart); }
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawAll, 150); });

/* ---------- shared UI pieces ---------- */
function meter(label, value, target, unit, cls) {
  const pct = target ? value / target : 0;
  const left = target - value;
  return h('div', { class: 'meter' },
    h('div', { class: 'meter-top' },
      h('span', { class: 'lbl', text: label }),
      h('span', { class: 'val' }, fmt(value), ' ', h('small', { text: `/ ${fmt(target)} ${unit}` }))),
    h('div', { class: 'lane-track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': target, 'aria-valuenow': Math.round(value), 'aria-label': label },
      h('div', { class: `fill ${cls}`, style: `width:${Math.min(100, pct * 100)}%` }),
      pct > 1 ? h('div', { class: 'over', style: `width:${Math.min(100, (pct - 1) / pct * 100)}%` }) : null),
    h('div', { class: 'meter-foot', text: left >= 0 ? `${fmt(left)} ${unit} left` : `${fmt(-left)} ${unit} over` }));
}
function seg(options, current, onPick, label) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label || '' },
    options.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === current), onclick: () => onPick(v) }, l)));
}
function field(label, input, opts = {}) {
  return h('div', { class: 'field' + (opts.wide ? ' wide' : '') }, h('label', { for: input.id, text: label }), input);
}
function confirmDelete(key, onYes) {
  if (state.ui.confirm === key) {
    return h('span', { class: 'confirm' }, 'Delete?',
      h('button', { class: 'btn small danger', type: 'button', onclick: () => { state.ui.confirm = null; onYes(); } }, 'Delete'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { state.ui.confirm = null; render(); } }, 'Keep'));
  }
  return h('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'Delete', onclick: () => { state.ui.confirm = key; render(); } }, 'Delete');
}
function statTile(k, v, unit, d) {
  return h('div', { class: 'stat stat-tile' }, h('span', { class: 'k', text: k }), h('span', { class: 'v' }, v, unit ? h('small', { text: unit }) : null), h('span', { class: 'd', text: d || '' }));
}
function viewHead(kicker, title, right) {
  return h('div', { class: 'view-head' }, h('div', null, h('div', { class: 'kicker', text: kicker }), h('h1', { text: title })), right || null);
}

/* ---------- TODAY ---------- */
function viewToday() {
  const t = todayStr(), tot = dayTotals(t), tg = T();
  const sched = state.data.settings.schedule || {};
  const plan = sched[dowKey(t)] || 'Rest';
  const isRest = /^rest/i.test(plan);
  const sessToday = state.data.training.sessions.find(x => x.date === t);
  const mon = mondayOf(t);

  const ws = weightSeries();
  const wAvg = rollingAvg(ws, t), wPrev = rollingAvg(ws, addDays(t, -7));
  const hd = state.data.health.days || {};
  const hDays = Object.keys(hd).sort();
  const lastH = hDays[hDays.length - 1];
  const last7 = hDays.filter(d => lastH && d > addDays(lastH, -7));

  const meals = mealsOn(t);
  return [
    viewHead(fmtLong(t), 'Today'),
    h('section', { class: 'card', 'aria-label': 'Food today' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Fuel' }), h('span', { class: 'meta', text: `${tot.n} ${tot.n === 1 ? 'meal' : 'meals'} logged` })),
      meter('Calories', tot.kcal, tg.kcal, 'kcal', 'kcal'),
      meter('Protein', tot.protein, tg.protein, 'g', 'protein'),
      meals.length ? h('div', { class: 'list' }, meals.map(m => h('div', { class: 'item' },
        h('div', null, h('div', { class: 't' }, m.meal, m.time ? h('span', { class: 'when', text: m.time }) : null), h('div', { class: 's', text: m.items || '' })),
        h('div', { class: 'r' }, h('div', { class: 'k', text: `${fmt(+m.kcal)} kcal` }), h('div', { class: 'p', text: `${fmt(+m.protein)} g` }))))) : null,
      h('a', { class: 'btn primary block', href: '#food', onclick: () => { state.ui.foodDay = t; state.ui.openAdd = true; } }, 'Log a meal')),
    h('section', { class: 'card', 'aria-label': 'Training this week' },
      h('div', { class: 'card-head' }, h('h2', { text: 'This week' }),
        h('span', { class: 'meta' }, sessToday ? h('span', { class: 'pill good', text: `${sessToday.name} done` }) : h('span', { text: isRest ? 'Rest day' : `Today: ${plan}` }))),
      h('div', { class: 'week' }, DOW.map((k, i) => {
        const d = addDays(mon, i), lbl = sched[k] || 'Rest', rest = /^rest/i.test(lbl);
        const done = state.data.training.sessions.some(x => x.date === d);
        return h('div', { class: `d${d === t ? ' today' : ''}${rest ? ' rest' : ''}${done ? ' done' : ''}`, title: `${fmtDay(d)}: ${lbl}` },
          h('span', { class: 'w', text: k }), h('span', { class: 'x', text: rest ? 'Rest' : lbl.replace(/upper/i, 'Up').replace(/lower/i, 'Low').replace(/ \+ .*/, '+') }));
      })),
      !isRest && !sessToday ? h('a', { class: 'btn lane block', href: '#train', onclick: () => { if (!state.draft) startDraft(plan, true); } }, `Start ${plan}`) : null),
    h('div', { class: 'grid3' },
      statTile('Weight', wAvg ? fmt(wAvg, 1) : '–', 'kg', wAvg && wPrev ? `${wAvg - wPrev > 0 ? '+' : '−'}${fmt(Math.abs(wAvg - wPrev), 1)} vs last week` : '7-day average'),
      statTile('Steps', last7.length ? fmt(avg(last7.map(d => hd[d].steps))) : '–', null, last7.length ? `avg to ${fmtShort(lastH)}` : 'import Apple Health'),
      statTile('Sleep', last7.length ? fmt(avg(last7.map(d => hd[d].sleepH)), 1) : '–', 'h', last7.length ? `avg to ${fmtShort(lastH)}` : 'import Apple Health')),
  ];
}

/* ---------- FOOD ---------- */
function viewFood() {
  const day = state.ui.foodDay, tot = dayTotals(day), tg = T();
  const meals = mealsOn(day);
  const isToday = day === todayStr();

  const recent = [];
  const seen = new Set();
  for (const m of [...state.data.food.meals].sort((a, b) => a.date < b.date ? 1 : -1)) {
    const key = (m.items || m.meal).toLowerCase();
    if (!m.items || seen.has(key)) continue;
    seen.add(key); recent.push(m);
    if (recent.length >= 6) break;
  }

  const fMeal = h('select', { id: 'f-meal' }, ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Other'].map(x => h('option', { value: x, text: x })));
  const hr = new Date().getHours();
  fMeal.value = hr < 11 ? 'Breakfast' : hr < 15 ? 'Lunch' : hr < 18 ? 'Snack' : 'Dinner';
  const fTime = h('input', { id: 'f-time', type: 'time', value: isToday ? nowHM() : '' });
  const fItems = h('input', { id: 'f-items', type: 'text', placeholder: '2 pulled pork wraps, yogurt sauce', autocomplete: 'off' });
  const fKcal = h('input', { id: 'f-kcal', type: 'number', inputmode: 'numeric', min: 0, step: 1, required: true, placeholder: '0' });
  const fProt = h('input', { id: 'f-prot', type: 'number', inputmode: 'decimal', min: 0, step: 0.5, required: true, placeholder: '0' });
  const form = h('form', {
    onsubmit: ev => {
      ev.preventDefault();
      const kcal = num(fKcal.value), protein = num(fProt.value);
      if (kcal == null || protein == null) { toast('Enter calories and protein.'); return; }
      state.ui.openAdd = false;
      commit('food', [{ t: 'upsert', c: 'meals', r: { id: `${day}_${uid()}`, date: day, time: fTime.value || '', meal: fMeal.value, items: fItems.value.trim(), kcal: Math.round(kcal), protein: Math.round(protein * 10) / 10 } }], 'Meal logged');
    },
  },
    h('div', { class: 'fields' }, field('Meal', fMeal), field('Time', fTime), field('What', fItems, { wide: true }), field('Calories (kcal)', fKcal), field('Protein (g)', fProt)),
    recent.length ? h('div', { class: 'row' }, h('span', { class: 'hint', text: 'Recent:' }), recent.map(m => h('button', {
      type: 'button', class: 'btn small', onclick: () => { fItems.value = m.items; fKcal.value = m.kcal; fProt.value = m.protein; fMeal.value = m.meal; },
    }, m.items.length > 28 ? m.items.slice(0, 26) + '…' : m.items))) : null,
    h('button', { class: 'btn primary', type: 'submit' }, 'Add meal'));

  const days14 = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i - 13));
  const metric = state.ui.foodMetric;
  const target = metric === 'kcal' ? tg.kcal : tg.protein;
  const vals = days14.map(d => { const x = dayTotals(d); return x.n ? x[metric] : null; });

  const weeks = [];
  for (let w = 0; w < 4; w++) {
    const start = addDays(mondayOf(todayStr()), -7 * w);
    const ds = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(d => d <= todayStr()).map(dayTotals).filter(x => x.n);
    if (ds.length) weeks.push({ start, n: ds.length, kcal: avg(ds.map(x => x.kcal)), protein: avg(ds.map(x => x.protein)) });
  }

  return [
    viewHead('Food', isToday ? 'Today' : fmtDay(day),
      h('div', { class: 'stepper' },
        h('button', { class: 'btn', type: 'button', 'aria-label': 'Previous day', onclick: () => { state.ui.foodDay = addDays(day, -1); render(); } }, '‹'),
        h('button', { class: 'btn small', type: 'button', disabled: isToday, onclick: () => { state.ui.foodDay = todayStr(); render(); } }, 'Today'),
        h('button', { class: 'btn', type: 'button', 'aria-label': 'Next day', disabled: isToday, onclick: () => { state.ui.foodDay = addDays(day, 1); render(); } }, '›'))),
    h('section', { class: 'card' }, meter('Calories', tot.kcal, tg.kcal, 'kcal', 'kcal'), meter('Protein', tot.protein, tg.protein, 'g', 'protein')),
    h('section', { class: 'card' },
      h('details', { class: 'adder', id: 'food-add', open: !!state.ui.openAdd || !meals.length, ontoggle: e => { state.ui.openAdd = e.target.open; } },
        h('summary', null, h('h2', { text: 'Log a meal' }), h('span', { class: 'plus', 'aria-hidden': 'true', text: '+' })),
        form)),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Meals' }), h('span', { class: 'meta', text: fmtDay(day) })),
      meals.length ? h('div', { class: 'list' }, meals.map(m => h('div', { class: 'item' },
        h('div', null, h('div', { class: 't' }, m.meal, m.time ? h('span', { class: 'when', text: m.time }) : null), h('div', { class: 's', text: m.items || '' })),
        h('div', { class: 'r' }, h('div', { class: 'k', text: `${fmt(+m.kcal)} kcal` }), h('div', { class: 'p', text: `${fmt(+m.protein, +m.protein % 1 ? 1 : 0)} g protein` })),
        h('div', { class: 'actions' }, confirmDelete('meal' + m.id, () => commit('food', [{ t: 'remove', c: 'meals', id: m.id }], 'Meal deleted'))))))
        : h('p', { class: 'empty' }, h('b', { text: 'Nothing logged for this day.' }), ' Add meals above, or tell Claude in the meal chat and the bedtime task fills them in.')),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Last 14 days' }), seg([['kcal', 'Calories'], ['protein', 'Protein']], metric, v => { state.ui.foodMetric = v; render(); }, 'Metric')),
      chartBox({
        x: days14, zero: true, target, targetLabel: `Target ${fmt(target)}`,
        series: [{ kind: 'bar', values: vals, color: metric === 'kcal' ? 'var(--track)' : 'var(--lane)' }],
        tipFmt: v => metric === 'kcal' ? `${fmt(v)} kcal` : `${fmt(v)} g protein`,
        aria: `Daily ${metric === 'kcal' ? 'calories' : 'protein'} for the last 14 days against the target`,
        empty: 'Log a few days of meals to see the chart.',
      })),
    h('section', { class: 'card' },
      h('h2', { text: 'Weekly averages' }),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { text: 'Week of' }), h('th', { text: 'Days' }), h('th', { text: 'kcal' }), h('th', { text: 'Protein' }))),
        h('tbody', null, weeks.map(w => h('tr', null,
          h('td', { text: fmtShort(w.start) }), h('td', { text: String(w.n) }),
          h('td', null, fmt(w.kcal), w.kcal != null ? h('span', { class: 'delta muted', text: `${w.kcal - tg.kcal >= 0 ? '+' : '−'}${fmt(Math.abs(w.kcal - tg.kcal))}` }) : null),
          h('td', { text: w.protein != null ? `${fmt(w.protein)} g` : '–' })))))),
      h('p', { class: 'hint', text: 'Judge progress by weekly averages, not single days.' })),
  ];
}

/* ---------- TRAIN ---------- */
function sessionNames() {
  const sched = state.data.settings.schedule || {};
  const fromSched = Object.values(sched).filter(v => v && !/^rest/i.test(v));
  const used = state.data.training.sessions.map(x => x.name);
  return [...new Set([...fromSched, 'Benchmarks', ...used, 'Home workout', 'Other'])];
}
function blankEx(name) {
  const kind = guessKind(name);
  const last = lastOf(name);
  const count = last ? last.ex.sets.length : 3;
  return { name, kind: last ? last.ex.kind : kind, sets: Array.from({ length: count }, () => ({ reps: '', kg: '', sec: '' })) };
}
function startDraft(name, fromLast) {
  const last = [...state.data.training.sessions].filter(x => x.name === name).sort((a, b) => a.date < b.date ? -1 : 1).pop();
  state.draft = { id: null, date: todayStr(), name, notes: '', exercises: fromLast && last ? last.exercises.map(ex => blankEx(ex.name)) : [] };
  state.ui.trainTab = 'log';
  saveDraft();
}
function saveDraft() { store('prime.draft', state.draft); }

function viewTrain() {
  const tab = state.ui.trainTab;
  return [
    viewHead('Training', tab === 'log' ? 'Log session' : tab === 'history' ? 'History' : 'Progress',
      seg([['log', 'Log'], ['history', 'History'], ['progress', 'Progress']], tab, v => { state.ui.trainTab = v; render(); }, 'Training view')),
    ...(tab === 'log' ? trainLog() : tab === 'history' ? trainHistory() : trainProgress()),
  ];
}

function trainLog() {
  if (!state.draft) {
    const sched = state.data.settings.schedule || {};
    const plan = sched[dowKey(todayStr())] || '';
    const names = sessionNames();
    const pick = h('select', { id: 't-pick' }, names.map(n => h('option', { value: n, text: n })));
    if (plan && !/^rest/i.test(plan)) pick.value = plan;
    const hasLast = n => state.data.training.sessions.some(x => x.name === n);
    return [h('section', { class: 'card' },
      h('h2', { text: 'Start a session' }),
      field('Session', pick),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { startDraft(pick.value, true); render(); } }, 'Start'),
        h('span', { class: 'hint', text: 'Exercises from your last session with the same name are filled in, with last time’s numbers as hints.' })),
      !names.some(hasLast) ? h('p', { class: 'empty', text: 'No sessions logged yet. Your first one sets the baseline.' }) : null)];
  }
  const d = state.draft;
  const dateIn = h('input', { id: 'd-date', type: 'date', value: d.date, oninput: e => { d.date = e.target.value; saveDraft(); } });
  const nameIn = h('input', { id: 'd-name', type: 'text', value: d.name, list: 'dl-sessions', oninput: e => { d.name = e.target.value; saveDraft(); } });
  const notesIn = h('textarea', { id: 'd-notes', placeholder: 'How it felt, RPE, anything to remember', oninput: e => { d.notes = e.target.value; saveDraft(); } });
  notesIn.value = d.notes || '';
  const newEx = h('input', { id: 'd-newex', type: 'text', list: 'dl-ex', placeholder: 'Add exercise, e.g. Weighted dips', autocomplete: 'off', 'aria-label': 'Exercise to add' });
  const addEx = () => { const v = newEx.value.trim(); if (!v) return; d.exercises.push(blankEx(v)); saveDraft(); render(); setTimeout(() => document.getElementById(`ex${d.exercises.length - 1}-s0-a`)?.focus(), 30); };
  newEx.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEx(); } });

  const exBlocks = d.exercises.map((ex, ei) => {
    const last = lastOf(ex.name, d.date);
    const kindSel = h('select', { id: `ex${ei}-kind`, class: 'kind', 'aria-label': 'Type', onchange: e => { ex.kind = e.target.value; saveDraft(); render(); } },
      Object.entries(KIND).map(([k, l]) => h('option', { value: k, text: l, selected: k === ex.kind })));
    const [aKey, aLbl, bKey, bLbl] = ex.kind === 'weight' ? ['kg', 'kg', 'reps', 'reps'] : ex.kind === 'hold' ? ['sec', 'seconds', 'kg', '+kg'] : ['reps', 'reps', 'kg', '+kg'];
    return h('div', { class: 'ex-block' },
      h('div', { class: 'ex-head' },
        h('div', { class: 'field' }, h('label', { for: `ex${ei}-name`, text: `Exercise ${ei + 1}` }),
          h('input', { id: `ex${ei}-name`, type: 'text', value: ex.name, list: 'dl-ex', onchange: e => { ex.name = e.target.value; saveDraft(); render(); } })),
        kindSel,
        h('button', { class: 'btn ghost small', type: 'button', 'aria-label': `Remove ${ex.name}`, onclick: () => { d.exercises.splice(ei, 1); saveDraft(); render(); } }, 'Remove')),
      last ? h('div', { class: 'last', text: `Last (${fmtShort(last.date)}): ${last.ex.sets.map(st => fmtSet(last.ex.kind, st)).join(' · ')}` }) : h('div', { class: 'hint', text: 'First time logging this one.' }),
      ex.sets.map((st, si) => {
        const prev = last && last.ex.sets[si];
        const mk = (key, lbl, suffix) => h('input', {
          id: `ex${ei}-s${si}-${suffix}`, type: 'number', inputmode: 'decimal', min: 0, step: key === 'kg' ? 0.5 : 1,
          value: st[key] ?? '', placeholder: prev && prev[key] !== '' && prev[key] != null ? `${prev[key]} ${lbl}` : lbl, 'aria-label': `Set ${si + 1} ${lbl}`,
          oninput: e => { st[key] = e.target.value; saveDraft(); },
        });
        return h('div', { class: 'set-row' }, h('span', { class: 'n', text: String(si + 1) }), mk(aKey, aLbl, 'a'), mk(bKey, bLbl, 'b'),
          h('button', { class: 'btn ghost small', type: 'button', 'aria-label': `Remove set ${si + 1}`, onclick: () => { ex.sets.splice(si, 1); saveDraft(); render(); } }, '×'));
      }),
      h('div', { class: 'row' }, h('button', {
        class: 'btn small', type: 'button', onclick: () => {
          const prev = ex.sets[ex.sets.length - 1] || {};
          ex.sets.push({ reps: prev.reps || '', kg: prev.kg || '', sec: prev.sec || '' }); saveDraft(); render();
        },
      }, '+ Set')));
  });

  const save = () => {
    const exercises = d.exercises.map(ex => ({
      name: ex.name.trim(), kind: ex.kind,
      sets: ex.sets.map(st => ({ reps: num(st.reps), kg: num(st.kg), sec: num(st.sec) }))
        .filter(st => (ex.kind === 'hold' ? st.sec : st.reps) != null)
        .map(st => Object.fromEntries(Object.entries(st).filter(([, v]) => v != null))),
    })).filter(ex => ex.name && ex.sets.length);
    if (!exercises.length) { toast('Fill in at least one set.'); return; }
    if (!d.date) { toast('Pick a date.'); return; }
    const rec = { id: d.id || `${d.date}_${uid()}`, date: d.date, name: d.name.trim() || 'Session', notes: d.notes.trim(), exercises };
    state.draft = null; saveDraft();
    state.ui.trainTab = 'history';
    commit('training', [{ t: 'upsert', c: 'sessions', r: rec }], 'Session saved');
  };

  return [
    h('section', { class: 'card' },
      h('div', { class: 'fields' }, field('Date', dateIn), field('Session', nameIn)),
      exBlocks,
      h('div', { class: 'row' }, h('div', { class: 'field', style: 'flex:1;min-width:180px' }, newEx), h('button', { class: 'btn', type: 'button', onclick: addEx }, 'Add')),
      field('Notes', notesIn, { wide: true }),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save session'),
        state.ui.confirm === 'draft'
          ? h('span', { class: 'confirm' }, 'Discard this session?',
            h('button', { class: 'btn small danger', type: 'button', onclick: () => { state.draft = null; state.ui.confirm = null; saveDraft(); render(); } }, 'Discard'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => { state.ui.confirm = null; render(); } }, 'Keep'))
          : h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.confirm = 'draft'; render(); } }, 'Discard'))),
    h('datalist', { id: 'dl-ex' }, [...new Set([...state.data.training.sessions.flatMap(x => x.exercises.map(e => e.name)), ...EXERCISES])].map(n => h('option', { value: n }))),
    h('datalist', { id: 'dl-sessions' }, sessionNames().map(n => h('option', { value: n }))),
  ];
}

function prFlags() {
  const best = {}, flags = new Set();
  for (const sess of [...state.data.training.sessions].sort((a, b) => a.date < b.date ? -1 : 1))
    for (const ex of sess.exercises) {
      const k = ex.name.toLowerCase(), m = exMetric(ex);
      if (!Number.isFinite(m)) continue;
      if (best[k] != null && m > best[k] + 1e-9) flags.add(sess.id + '|' + k);
      if (best[k] == null || m > best[k]) best[k] = m;
    }
  return flags;
}
function trainHistory() {
  const sessions = [...state.data.training.sessions].sort((a, b) => a.date < b.date ? 1 : -1);
  if (!sessions.length) return [h('section', { class: 'card' }, h('p', { class: 'empty' }, h('b', { text: 'No sessions yet.' }), ' Log your first one under Log.'))];
  const prs = prFlags();
  return sessions.map(sess => h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', { text: sess.name }), h('span', { class: 'meta', text: fmtDay(sess.date) })),
    h('div', null, sess.exercises.map(ex => h('div', { class: 'ex-line' },
      h('span', { class: 'nm' }, ex.name, prs.has(sess.id + '|' + ex.name.toLowerCase()) ? h('span', { class: 'pr', text: 'PR' }) : null),
      h('span', { class: 'st', text: ex.sets.map(st => fmtSet(ex.kind, st)).join(' · ') })))),
    sess.notes ? h('p', { class: 'small muted', style: 'margin:0', text: sess.notes }) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn small', type: 'button', onclick: () => { state.draft = clone({ ...sess, notes: sess.notes || '' }); state.draft.exercises.forEach(ex => ex.sets.forEach(st => { for (const k of ['reps', 'kg', 'sec']) st[k] = st[k] ?? ''; })); state.ui.trainTab = 'log'; saveDraft(); render(); } }, 'Edit'),
      confirmDelete('sess' + sess.id, () => commit('training', [{ t: 'remove', c: 'sessions', id: sess.id }], 'Session deleted')))));
}
function trainProgress() {
  const names = [...new Set(state.data.training.sessions.flatMap(x => x.exercises.map(e => e.name)))].sort();
  if (!names.length) return [h('section', { class: 'card' }, h('p', { class: 'empty' }, h('b', { text: 'Nothing to show yet.' }), ' Progress appears after you log sessions.'))];
  if (!names.includes(state.ui.progressEx)) state.ui.progressEx = names[0];
  const exName = state.ui.progressEx;
  const hist = exHistory(exName).filter(x => Number.isFinite(x.m));
  const kind = hist.length ? hist[hist.length - 1].ex.kind : 'weight';
  const sel = h('select', { id: 'p-ex', onchange: e => { state.ui.progressEx = e.target.value; render(); } }, names.map(n => h('option', { value: n, text: n, selected: n === exName })));

  const bests = names.map(n => {
    const hs = exHistory(n).filter(x => Number.isFinite(x.m));
    if (!hs.length) return null;
    const b = hs.reduce((a, x) => x.m > a.m ? x : a);
    const topSet = b.ex.sets.reduce((a, st) => (setMetric(b.ex.kind, st) || 0) > (setMetric(b.ex.kind, a) || 0) ? st : a);
    return { n, b, topSet, count: hs.length };
  }).filter(Boolean);

  return [
    h('section', { class: 'card' },
      field('Exercise', sel),
      h('div', { class: 'card-head' }, h('h2', { text: exName }), h('span', { class: 'meta', text: metricUnit(kind) })),
      chartBox({
        x: hist.map(x => x.date),
        series: [{ kind: 'line', markers: true, values: hist.map(x => Math.round(x.m * 10) / 10), color: 'var(--lane)' }],
        tipFmt: v => `${fmt(v, v % 1 ? 1 : 0)} ${metricUnit(kind)}`,
        aria: `${exName} progress over time`,
      }),
      kind === 'weight' ? h('p', { class: 'hint', text: 'e1RM is an estimated one-rep max from your best set (Epley formula). It tracks progress without testing a true max.' }) : null),
    h('section', { class: 'card' },
      h('h2', { text: 'Bests' }),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { text: 'Exercise' }), h('th', { text: 'Best set' }), h('th', { text: 'When' }))),
        h('tbody', null, bests.map(r => h('tr', null, h('td', { text: r.n }), h('td', { text: fmtSet(r.b.ex.kind, r.topSet) }), h('td', { text: fmtShort(r.b.date) }))))))),
  ];
}

/* ---------- BODY ---------- */
function viewBody() {
  const tab = state.ui.bodyTab;
  return [
    viewHead('Body', tab === 'weight' ? 'Weight' : 'Measurements', seg([['weight', 'Weight'], ['measure', 'Measurements']], tab, v => { state.ui.bodyTab = v; render(); }, 'Body view')),
    ...(tab === 'weight' ? bodyWeight() : bodyMeasure()),
  ];
}
function bodyWeight() {
  const t = todayStr();
  const ws = weightSeries();
  const goal = state.data.settings.goalWeight || 79;
  const now = rollingAvg(ws, t), prev = rollingAvg(ws, addDays(t, -7));
  const first = ws[0];
  const dateIn = h('input', { id: 'w-date', type: 'date', value: t, max: t });
  const kgIn = h('input', { id: 'w-kg', type: 'number', inputmode: 'decimal', step: 0.1, min: 30, max: 250, placeholder: '85.0', required: true });
  const form = h('form', {
    onsubmit: e => {
      e.preventDefault();
      const kg = num(kgIn.value);
      if (!kg) { toast('Enter your weight.'); return; }
      const existing = state.data.body.weighins.find(w => w.date === dateIn.value);
      commit('body', [{ t: 'upsert', c: 'weighins', r: { id: existing ? existing.id : `${dateIn.value}_${uid()}`, date: dateIn.value, kg: Math.round(kg * 10) / 10 } }], 'Weigh-in saved');
    },
  }, h('div', { class: 'fields' }, field('Date', dateIn), field('Weight (kg)', kgIn)), h('button', { class: 'btn primary', type: 'submit' }, 'Save weigh-in'),
    h('p', { class: 'hint', text: 'Weigh in the morning after the toilet, before food or water.' }));

  const range = state.ui.bodyRange;
  const earliest = first ? (first.date < addDays(t, -13) ? first.date : addDays(t, -13)) : addDays(t, -13);
  const start = range && addDays(t, -(range - 1)) > earliest ? addDays(t, -(range - 1)) : earliest;
  const span = Math.max(1, daysBetween(start, t) + 1);
  const xs = Array.from({ length: span }, (_, i) => addDays(start, i));
  const byDay = Object.fromEntries(ws.map(p => [p.date, p.kg]));
  const raw = xs.map(d => byDay[d] ?? null);
  const roll = xs.map(d => ws.some(p => p.date <= d && p.date > addDays(d, -7)) ? Math.round(rollingAvg(ws, d) * 10) / 10 : null);

  return [
    h('div', { class: 'grid3' },
      statTile('7-day avg', now ? fmt(now, 1) : '–', 'kg', now && prev ? `${now - prev > 0 ? '+' : '−'}${fmt(Math.abs(now - prev), 1)} kg in a week` : 'needs a few weigh-ins'),
      statTile('Since start', now && first ? `${now - first.kg > 0 ? '+' : '−'}${fmt(Math.abs(now - first.kg), 1)}` : '–', 'kg', first ? `from ${fmt(first.kg, 1)} on ${fmtShort(first.date)}` : ''),
      statTile('To prime', now ? fmt(Math.max(0, now - goal), 1) : '–', 'kg', `goal ${fmt(goal, 1)} kg`)),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Trend' }), seg([[30, '30 d'], [90, '90 d'], [0, 'All']], range, v => { state.ui.bodyRange = v; render(); }, 'Range')),
      h('div', { class: 'legend' }, h('span', null, h('i', { class: 'dot', style: 'background:var(--lane);opacity:.55' }), 'Daily weigh-in'), h('span', null, h('i', { style: 'background:var(--lane)' }), '7-day average')),
      chartBox({
        x: xs, target: goal, targetLabel: `Prime ${fmt(goal)} kg`,
        series: [{ kind: 'dots', label: 'Weigh-in', values: raw, color: 'var(--lane)' }, { kind: 'line', label: '7-day avg', values: roll, color: 'var(--lane)' }],
        tipFmt: v => `${fmt(v, 1)} kg`, aria: 'Bodyweight with 7-day average', empty: 'Log weigh-ins to see your trend.',
      }),
      h('p', { class: 'hint', text: 'Daily weight swings 1–2 kg with water and food. Aim for the average to drop about 0.3–0.5 kg a week.' })),
    h('section', { class: 'card' }, h('details', { class: 'adder', id: 'w-add', open: !ws.some(p => p.date === t) }, h('summary', null, h('h2', { text: 'Log weight' }), h('span', { class: 'plus', 'aria-hidden': 'true', text: '+' })), form)),
    h('section', { class: 'card' },
      h('h2', { text: 'Recent' }),
      ws.length ? h('div', { class: 'list' }, [...ws].reverse().slice(0, 10).map(p => h('div', { class: 'item' },
        h('div', null, h('div', { class: 't', text: fmtDay(p.date) }), h('div', { class: 's', text: p.src })),
        h('div', { class: 'r' }, h('div', { class: 'k', text: `${fmt(p.kg, 1)} kg` })),
        p.id ? h('div', { class: 'actions' }, confirmDelete('w' + p.id, () => commit('body', [{ t: 'remove', c: 'weighins', id: p.id }], 'Weigh-in deleted'))) : null)))
        : h('p', { class: 'empty', text: 'No weigh-ins yet.' })),
  ];
}
const MEASURES = [['waist', 'Waist'], ['chest', 'Chest'], ['arm', 'Arm'], ['thigh', 'Thigh'], ['hips', 'Hips'], ['neck', 'Neck']];
function bodyMeasure() {
  const ms = [...state.data.body.measurements].sort((a, b) => a.date < b.date ? -1 : 1);
  const t = todayStr();
  const dateIn = h('input', { id: 'm-date', type: 'date', value: t, max: t });
  const ins = MEASURES.map(([k, l]) => [k, h('input', { id: `m-${k}`, type: 'number', inputmode: 'decimal', step: 0.1, min: 0, placeholder: 'cm' }), l]);
  const form = h('form', {
    onsubmit: e => {
      e.preventDefault();
      const rec = { id: `${dateIn.value}_${uid()}`, date: dateIn.value };
      for (const [k, el] of ins) { const v = num(el.value); if (v != null) rec[k] = v; }
      if (Object.keys(rec).length <= 2) { toast('Enter at least one measurement.'); return; }
      commit('body', [{ t: 'upsert', c: 'measurements', r: rec }], 'Measurements saved');
    },
  }, h('div', { class: 'fields' }, field('Date', dateIn), ins.map(([, el, l]) => field(`${l} (cm)`, el))), h('button', { class: 'btn primary', type: 'submit' }, 'Save measurements'),
    h('p', { class: 'hint', text: 'Measure relaxed, same time of day, tape snug but not tight. Waist at the navel.' }));
  const firstOf = k => ms.find(m => m[k] != null), lastOfM = k => [...ms].reverse().find(m => m[k] != null);
  return [
    h('section', { class: 'card' },
      h('h2', { text: 'Change since first' }),
      ms.length ? h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { text: '' }), h('th', { text: 'First' }), h('th', { text: 'Latest' }), h('th', { text: 'Change' }))),
        h('tbody', null, MEASURES.filter(([k]) => firstOf(k)).map(([k, l]) => {
          const a = firstOf(k)[k], b = lastOfM(k)[k], dlt = b - a;
          return h('tr', null, h('td', { text: l }), h('td', { text: `${fmt(a, 1)}` }), h('td', { text: `${fmt(b, 1)}` }),
            h('td', { class: k === 'waist' ? (dlt < 0 ? 'down' : dlt > 0 ? 'up' : '') : '', text: `${dlt > 0 ? '+' : dlt < 0 ? '−' : ''}${fmt(Math.abs(dlt), 1)} cm` }));
        }))))
        : h('p', { class: 'empty', text: 'No measurements yet. Take a first set as your baseline, then repeat every 2–4 weeks.' })),
    h('section', { class: 'card' }, h('details', { class: 'adder', id: 'm-add', open: !ms.length }, h('summary', null, h('h2', { text: 'Add measurements' }), h('span', { class: 'plus', 'aria-hidden': 'true', text: '+' })), form)),
    ms.length ? h('section', { class: 'card' }, h('h2', { text: 'History' }), h('div', { class: 'list' }, [...ms].reverse().map(m => h('div', { class: 'item' },
      h('div', null, h('div', { class: 't', text: fmtDay(m.date) }), h('div', { class: 's', text: MEASURES.filter(([k]) => m[k] != null).map(([k, l]) => `${l} ${fmt(m[k], 1)}`).join(' · ') })),
      h('div', { class: 'r' }), h('div', { class: 'actions' }, confirmDelete('m' + m.id, () => commit('body', [{ t: 'remove', c: 'measurements', id: m.id }], 'Deleted'))))))) : null,
  ];
}

/* ---------- MOVE ---------- */
function viewMove() {
  const tab = state.ui.moveTab;
  return [
    viewHead('Activity', tab === 'activities' ? 'Runs & more' : 'Apple Health', seg([['activities', 'Activities'], ['health', 'Health']], tab, v => { state.ui.moveTab = v; render(); }, 'Activity view')),
    ...(tab === 'activities' ? moveActivities() : moveHealth()),
  ];
}
function moveActivities() {
  const t = todayStr();
  const acts = allActivities();
  const runs = acts.filter(a => /run/i.test(a.type) && pace(a)).sort((a, b) => a.date < b.date ? -1 : 1);
  const goalMin = state.data.settings.tenKGoalMin || 45;
  const recentRuns = runs.filter(r => r.date >= addDays(t, -42) && r.distanceKm >= 2);
  const bestProj = recentRuns.map(r => r.durationSec * Math.pow(10 / r.distanceKm, 1.06)).sort((a, b) => a - b)[0];

  const dateIn = h('input', { id: 'a-date', type: 'date', value: t, max: t });
  const typeIn = h('select', { id: 'a-type' }, ['Run', 'Walk', 'Sprints', 'Hike', 'Swim', 'Bike', 'Other'].map(x => h('option', { value: x, text: x })));
  const distIn = h('input', { id: 'a-dist', type: 'number', inputmode: 'decimal', step: 0.01, min: 0, placeholder: '3.00' });
  const durIn = h('input', { id: 'a-dur', type: 'text', inputmode: 'numeric', placeholder: 'mm:ss', pattern: '[0-9:]*' });
  const hrIn = h('input', { id: 'a-hr', type: 'number', inputmode: 'numeric', min: 40, max: 230, placeholder: 'bpm' });
  const noteIn = h('input', { id: 'a-note', type: 'text', placeholder: 'Easy pace, felt good' });
  const paceOut = h('span', { class: 'hint' });
  const upd = () => { const p = pace({ distanceKm: num(distIn.value), durationSec: parseDur(durIn.value) }); paceOut.textContent = p ? `Pace ${fmtDur(p)} /km` : ''; };
  distIn.addEventListener('input', upd); durIn.addEventListener('input', upd);
  const form = h('form', {
    onsubmit: e => {
      e.preventDefault();
      const durationSec = parseDur(durIn.value);
      if (!durationSec) { toast('Enter the time as mm:ss.'); return; }
      const rec = { id: `${dateIn.value}_${uid()}`, date: dateIn.value, type: typeIn.value, durationSec };
      const dkm = num(distIn.value), hr = num(hrIn.value);
      if (dkm) rec.distanceKm = dkm; if (hr) rec.avgHr = Math.round(hr); if (noteIn.value.trim()) rec.notes = noteIn.value.trim();
      commit('activities', [{ t: 'upsert', c: 'activities', r: rec }], 'Activity saved');
    },
  }, h('div', { class: 'fields' }, field('Date', dateIn), field('Type', typeIn), field('Distance (km)', distIn), field('Time', durIn), field('Avg HR', hrIn), field('Notes', noteIn, { wide: true })),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save activity'), paceOut));

  return [
    h('div', { class: 'grid3' },
      statTile('10 km goal', fmtDur(goalMin * 60), null, `${fmtDur(goalMin * 60 / 10)} /km`),
      statTile('Projected 10 km', bestProj ? fmtDur(bestProj) : '–', null, bestProj ? 'from your best run, last 6 weeks' : 'log a run of 2 km+'),
      statTile('Runs, 4 weeks', String(runs.filter(r => r.date >= addDays(t, -27)).length), null, `${fmt(sum(runs.filter(r => r.date >= addDays(t, -27)).map(r => r.distanceKm)), 1)} km total`)),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Run pace' }), h('span', { class: 'meta', text: 'min per km, lower is faster' })),
      chartBox({
        x: runs.map(r => r.date),
        series: [{ kind: 'line', markers: true, values: runs.map(r => Math.round(pace(r))), color: 'var(--track)' }],
        target: goalMin * 6, targetLabel: `Goal ${fmtDur(goalMin * 6)}`,
        yFmt: v => fmtDur(v), tipFmt: v => `${fmtDur(v)} /km`, aria: 'Running pace per run against the goal pace',
        empty: 'Log a run to see your pace trend.',
      }),
      h('p', { class: 'hint', text: 'The projection uses Riegel’s formula from your best recent run. It is optimistic for runs much shorter than 10 km.' })),
    h('section', { class: 'card' }, h('details', { class: 'adder', id: 'a-add' }, h('summary', null, h('h2', { text: 'Log activity' }), h('span', { class: 'plus', 'aria-hidden': 'true', text: '+' })), form)),
    h('section', { class: 'card' },
      h('h2', { text: 'Recent' }),
      acts.length ? h('div', { class: 'list' }, acts.slice(0, 15).map(a => h('div', { class: 'item' },
        h('div', null, h('div', { class: 't' }, a.type, h('span', { class: 'when', text: fmtDay(a.date) })),
          h('div', { class: 's', text: [a.source, a.avgHr ? `${a.avgHr} bpm` : null, a.notes].filter(Boolean).join(' · ') })),
        h('div', { class: 'r' }, h('div', { class: 'k', text: a.distanceKm ? `${fmt(a.distanceKm, 2)} km` : fmtDur(a.durationSec) }),
          h('div', { class: 'p', text: pace(a) ? `${fmtDur(a.durationSec)} · ${fmtDur(pace(a))}/km` : (a.distanceKm ? fmtDur(a.durationSec) : '') })),
        a.source === 'Logged' ? h('div', { class: 'actions' }, confirmDelete('a' + a.id, () => commit('activities', [{ t: 'remove', c: 'activities', id: a.id }], 'Deleted'))) : null)))
        : h('p', { class: 'empty', text: 'No activities yet. Log runs here, or import Apple Health to pull in watch workouts.' })),
  ];
}

const HMETRICS = {
  steps: { label: 'Steps', dp: 0, unit: '', zero: true },
  sleepH: { label: 'Sleep', dp: 1, unit: 'h', zero: true },
  restingHr: { label: 'Resting HR', dp: 0, unit: 'bpm' },
  hrv: { label: 'HRV', dp: 0, unit: 'ms' },
  activeKcal: { label: 'Active kcal', dp: 0, unit: 'kcal', zero: true },
};
function moveHealth() {
  const hd = state.data.health.days || {};
  const ds = Object.keys(hd).sort();
  const m = state.ui.healthMetric, cfg = HMETRICS[m];
  const last30 = ds.slice(-30);
  const weeks = {};
  for (const d of ds) (weeks[mondayOf(d)] = weeks[mondayOf(d)] || []).push(hd[d]);
  const weekRows = Object.entries(weeks).sort().reverse().slice(0, 8);

  const fileIn = h('input', { id: 'h-file', type: 'file', accept: '.zip,.xml,application/zip,text/xml' });
  const status = h('p', { class: 'hint', 'aria-live': 'polite' });
  const go = h('button', {
    class: 'btn lane', type: 'button', onclick: async () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) { toast('Choose your export.zip first.'); return; }
      go.disabled = true;
      try {
        const res = await importHealth(f, p => { status.textContent = `Reading… ${Math.round(p * 100)}%`; });
        status.textContent = `Imported ${Object.keys(res.days).length} days and ${res.workouts.length} workouts.`;
        commit('health', [{ t: 'health', days: res.days, workouts: res.workouts, at: new Date().toISOString() }], 'Apple Health imported');
      } catch (e) {
        status.textContent = `Import failed: ${e.message || e}`;
      } finally { go.disabled = false; }
    },
  }, 'Import');

  return [
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Weekly import' }), h('span', { class: 'meta', text: state.data.health.importedAt ? `Last: ${fmtShort(state.data.health.importedAt.slice(0, 10))}` : 'Not imported yet' })),
      h('ol', { class: 'small muted', style: 'margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px' },
        h('li', { text: 'iPhone: Health app → your profile picture → Export All Health Data.' }),
        h('li', { text: 'Save export.zip to Files or send it to your PC.' }),
        h('li', { text: 'Choose it below and press Import. It stays on your device until it’s summarised; only daily totals are saved.' })),
      h('div', { class: 'row' }, h('div', { class: 'field', style: 'flex:1;min-width:200px' }, fileIn), go), status),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Last 30 days' })),
      seg(Object.entries(HMETRICS).map(([k, v]) => [k, v.label]), m, v => { state.ui.healthMetric = v; render(); }, 'Health metric'),
      chartBox({
        x: last30, zero: cfg.zero,
        series: [{ kind: cfg.zero ? 'bar' : 'line', gaps: true, markers: !cfg.zero, values: last30.map(d => hd[d][m] ?? null), color: m === 'sleepH' || m === 'steps' ? 'var(--lane)' : 'var(--track)' }],
        target: m === 'sleepH' ? 7 : m === 'steps' ? 8000 : null, targetLabel: m === 'sleepH' ? '7 h target' : m === 'steps' ? '8,000' : null,
        tipFmt: v => `${fmt(v, cfg.dp)} ${cfg.unit}`, aria: `${cfg.label} per day`, empty: 'Import Apple Health to see this.',
      })),
    h('section', { class: 'card' },
      h('h2', { text: 'By week' }),
      weekRows.length ? h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { text: 'Week of' }), h('th', { text: 'Steps' }), h('th', { text: 'Sleep' }), h('th', { text: 'RHR' }), h('th', { text: 'HRV' }))),
        h('tbody', null, weekRows.map(([wk, rows]) => h('tr', null,
          h('td', { text: fmtShort(wk) }), h('td', { text: fmt(avg(rows.map(r => r.steps))) }), h('td', { text: `${fmt(avg(rows.map(r => r.sleepH)), 1)} h` }),
          h('td', { text: fmt(avg(rows.map(r => r.restingHr))) }), h('td', { text: fmt(avg(rows.map(r => r.hrv))) })))))) : h('p', { class: 'empty', text: 'No Apple Health data yet.' }),
      h('p', { class: 'hint', text: 'Daily averages per week. A rising resting heart rate or falling HRV for several days can mean you need more rest.' })),
  ];
}

/* ---------- Apple Health import (runs in the browser) ---------- */
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('Could not load the unzip library. Check your connection.'));
    document.head.appendChild(el);
  });
}
const ASLEEP = new Set(['HKCategoryValueSleepAnalysisAsleepUnspecified', 'HKCategoryValueSleepAnalysisAsleepCore', 'HKCategoryValueSleepAnalysisAsleepDeep', 'HKCategoryValueSleepAnalysisAsleepREM', 'HKCategoryValueSleepAnalysisAsleep']);
const H_BYSRC = { StepCount: 'steps', DistanceWalkingRunning: 'distanceKm' };
const H_SUM = { ActiveEnergyBurned: 'activeKcal', AppleExerciseTime: 'exerciseMin' };
const H_MEAN = { RestingHeartRate: 'restingHr', HeartRateVariabilitySDNN: 'hrv', WalkingHeartRateAverage: 'walkingHr', VO2Max: 'vo2max', BodyMass: 'weightKg' };
const shortType = t => t.replace(/^HK(QuantityTypeIdentifier|CategoryTypeIdentifier|DataType)/, '');
const toKm = (v, u) => u === 'mi' ? v * 1.609344 : u === 'm' ? v / 1000 : v;
const hkDate = str => Date.parse(`${str.slice(0, 10)}T${str.slice(11, 19)}${str.slice(20, 23)}:${str.slice(23, 25)}`);
function attrs(str) {
  const o = {}; const re = /(\w+)="([^"]*)"/g; let m;
  while ((m = re.exec(str))) o[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return o;
}
function healthAccumulator() {
  const bySrc = {}, sums = {}, means = {}, sleep = {}, workouts = [];
  let wk = null;
  const endWorkout = () => {
    if (!wk) return;
    const st = wk.stats, dist = st.DistanceWalkingRunning, en = st.ActiveEnergyBurned, hr = st.HeartRate;
    let dur = parseFloat(wk.a.duration || 0); if (wk.a.durationUnit === 's') dur /= 60;
    workouts.push({
      type: (wk.a.workoutActivityType || '').replace('HKWorkoutActivityType', ''), start: wk.a.startDate, durationMin: Math.round(dur * 10) / 10,
      distanceKm: dist && dist.sum ? Math.round(toKm(+dist.sum, dist.unit) * 100) / 100 : null,
      activeKcal: en && en.sum ? Math.round(+en.sum) : null, avgHr: hr && hr.average ? Math.round(+hr.average) : null,
    });
    wk = null;
  };
  return {
    tag(name, a, selfClosing) {
      if (name === 'Record') {
        const t = shortType(a.type || ''), day = (a.startDate || '').slice(0, 10);
        if (!day) return;
        if (H_BYSRC[t]) {
          let v = parseFloat(a.value || 0); if (t === 'DistanceWalkingRunning') v = toKm(v, a.unit);
          const k = `${day}|${H_BYSRC[t]}`; const src = a.sourceName || '?';
          (bySrc[k] = bySrc[k] || {})[src] = (bySrc[k][src] || 0) + v;
        } else if (H_SUM[t]) { const k = `${day}|${H_SUM[t]}`; sums[k] = (sums[k] || 0) + parseFloat(a.value || 0); }
        else if (H_MEAN[t]) { const k = `${day}|${H_MEAN[t]}`; (means[k] = means[k] || []).push(parseFloat(a.value || 0)); }
        else if (t === 'SleepAnalysis' && ASLEEP.has(a.value)) {
          (sleep[a.sourceName || '?'] = sleep[a.sourceName || '?'] || []).push([hkDate(a.startDate), hkDate(a.endDate), a.endDate.slice(0, 10)]);
        }
      } else if (name === 'Workout') { endWorkout(); wk = { a, stats: {} }; if (selfClosing) endWorkout(); }
      else if (name === 'WorkoutStatistics' && wk) wk.stats[shortType(a.type || '')] = a;
    },
    endWorkout,
    finish() {
      endWorkout();
      const days = {};
      const put = (k, v) => { const [d, key] = k.split('|'); (days[d] = days[d] || {})[key] = v; };
      for (const [k, per] of Object.entries(bySrc)) { const v = Math.max(...Object.values(per)); put(k, k.endsWith('distanceKm') ? Math.round(v * 100) / 100 : Math.round(v)); }
      for (const [k, v] of Object.entries(sums)) put(k, Math.round(v));
      for (const [k, vs] of Object.entries(means)) put(k, Math.round(avg(vs) * 10) / 10);
      const srcs = Object.keys(sleep);
      if (srcs.length) {
        const best = srcs.sort((a, b) => sleep[b].length - sleep[a].length)[0];
        const iv = sleep[best].sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const x of iv) { const l = merged[merged.length - 1]; if (l && x[0] <= l[1]) { if (x[1] > l[1]) { l[1] = x[1]; l[2] = x[2]; } } else merged.push([...x]); }
        const nights = [];
        for (const [st, en, endDay] of merged) {
          const n = nights[nights.length - 1];
          if (n && st - n.end < 3 * 3600e3) { n.end = en; n.day = endDay; n.mins += (en - st) / 6e4; }
          else nights.push({ end: en, day: endDay, mins: (en - st) / 6e4 });
        }
        for (const n of nights) if (n.mins >= 60) { const d = days[n.day] = days[n.day] || {}; d.sleepH = Math.round(((d.sleepH || 0) + n.mins / 60) * 100) / 100; }
      }
      return { days, workouts };
    },
  };
}
async function importHealth(file, onProgress) {
  const acc = healthAccumulator();
  let buf = '';
  const re = /<(Record|Workout|WorkoutStatistics)\s([^>]*?)(\/?)>|<\/Workout>/g;
  const feed = (text) => {
    buf += text;
    const cut = buf.lastIndexOf('>') + 1;
    if (!cut) return;
    const chunk = buf.slice(0, cut);
    buf = buf.slice(cut);
    re.lastIndex = 0; let m;
    while ((m = re.exec(chunk))) { if (m[0] === '</Workout>') acc.endWorkout(); else acc.tag(m[1], attrs(m[2]), m[3] === '/'); }
  };
  const dec = new TextDecoder();
  const reader = file.stream().getReader();
  let read = 0;
  if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
    await loadScript('https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js');
    let found = false, failed = null, done = false;
    const uz = new fflate.Unzip();
    uz.register(fflate.UnzipInflate);
    uz.onfile = f => {
      if (!/(^|\/)export\.xml$/.test(f.name)) return;
      found = true;
      f.ondata = (err, chunk, final) => { if (err) { failed = err; return; } feed(dec.decode(chunk, { stream: !final })); if (final) done = true; };
      f.start();
    };
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) { uz.push(new Uint8Array(0), true); break; }
      read += value.length; onProgress(read / file.size);
      uz.push(value, false);
      if (failed) throw failed;
    }
    if (failed) throw failed;
    if (!found) throw new Error('No export.xml inside this zip. Use the zip from “Export All Health Data”.');
    if (!done) throw new Error('The zip ended early. Export again and retry.');
  } else {
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) { feed(dec.decode()); break; }
      read += value.length; onProgress(read / file.size);
      feed(dec.decode(value, { stream: true }));
    }
  }
  return acc.finish();
}

/* ---------- SETTINGS ---------- */
function viewSettings() {
  const g = gh(), st = state.data.settings;
  const owner = h('input', { id: 's-owner', type: 'text', value: g.owner || 'jakub-adam', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const repo = h('input', { id: 's-repo', type: 'text', value: g.repo || 'health-data', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const token = h('input', { id: 's-token', type: 'password', value: g.token || '', placeholder: 'github_pat_…', autocomplete: 'off', spellcheck: 'false' });
  const msg = h('p', { class: 'hint', 'aria-live': 'polite' });
  const connect = h('form', {
    onsubmit: async e => {
      e.preventDefault();
      const cfg = { owner: owner.value.trim(), repo: repo.value.trim(), token: token.value.trim() };
      if (!cfg.owner || !cfg.repo || !cfg.token) { msg.textContent = 'Fill in all three fields.'; return; }
      msg.textContent = 'Checking…';
      const prev = gh();
      store('prime.gh', cfg);
      try {
        const info = await api('');
        if (!info.private) msg.textContent = 'Connected, but this repo is public. Make it private in its GitHub settings so your data stays yours.';
        if (!info.permissions || !info.permissions.push) throw new GhError(403, '');
        if (prev.owner !== cfg.owner || prev.repo !== cfg.repo) { try { localStorage.removeItem('prime.cache'); } catch { /* ignore */ } state.pending = {}; state.sha = {}; }
        toast('Connected');
        location.hash = '#today';
        await loadAll();
      } catch (err) {
        store('prime.gh', prev);
        msg.textContent = explain(err);
      }
    },
  },
    h('div', { class: 'fields' }, field('GitHub user', owner), field('Data repo', repo), field('Access token', token, { wide: true })),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, connected() ? 'Save and reconnect' : 'Connect'),
      connected() ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { try { localStorage.removeItem('prime.gh'); localStorage.removeItem('prime.cache'); } catch { /* ignore */ } toast('Disconnected from this device'); loadAll(); } }, 'Disconnect this device') : null),
    msg,
    h('details', null, h('summary', { class: 'small', style: 'cursor:pointer;font-weight:600' }, 'How to make the token'),
      h('ol', { class: 'small muted', style: 'padding-left:18px;display:flex;flex-direction:column;gap:3px' },
        h('li', null, 'Open ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'github.com/settings/personal-access-tokens/new'), '.'),
        h('li', { text: 'Name it “Prime”, expiration 1 year.' }),
        h('li', { text: 'Repository access: Only select repositories → health-data.' }),
        h('li', { text: 'Permissions → Repository → Contents: Read and write. Nothing else.' }),
        h('li', { text: 'Generate, copy, paste above. Do this once on your phone and once on your PC.' }))),
    h('p', { class: 'hint', text: 'The token is stored only in this browser. It can read and write the data repo and nothing else on your account.' }));

  const kcal = h('input', { id: 's-kcal', type: 'number', value: st.targets.kcal, min: 1200, step: 10 });
  const prot = h('input', { id: 's-prot', type: 'number', value: st.targets.protein, min: 0, step: 5 });
  const goalW = h('input', { id: 's-goalw', type: 'number', value: st.goalWeight, step: 0.5 });
  const tenk = h('input', { id: 's-10k', type: 'number', value: st.tenKGoalMin, step: 0.5 });
  const sch = DOW.map(k => [k, h('input', { id: `s-${k}`, type: 'text', value: (st.schedule || {})[k] || '' })]);
  const targets = h('form', {
    onsubmit: e => {
      e.preventDefault();
      const next = clone(st);
      next.targets = { kcal: num(kcal.value) || 2350, protein: num(prot.value) || 160 };
      next.goalWeight = num(goalW.value) || 79; next.tenKGoalMin = num(tenk.value) || 45;
      next.schedule = Object.fromEntries(sch.map(([k, el]) => [k, el.value.trim() || 'Rest']));
      commit('settings', Object.entries(next).map(([k, v]) => ({ t: 'set', k, v })), 'Settings saved');
    },
  },
    h('div', { class: 'fields' }, field('Calories (kcal)', kcal), field('Protein (g)', prot), field('Goal weight (kg)', goalW), field('10 km goal (min)', tenk)),
    h('h2', { text: 'Weekly schedule', style: 'margin-top:6px' }),
    h('div', { class: 'fields' }, sch.map(([k, el]) => field(k, el))),
    h('p', { class: 'hint', text: 'Start a day with “Rest” to mark it as a rest day.' }),
    h('button', { class: 'btn primary', type: 'submit' }, 'Save targets'));

  const backup = () => {
    const blob = new Blob([JSON.stringify(state.data, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `prime-backup-${todayStr()}.json` });
    document.body.appendChild(a); a.click(); a.remove();
  };

  return [
    viewHead('Settings', 'Your data'),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Connect' }),
        h('span', { class: `pill ${connected() ? (state.sync.status === 'err' ? 'bad' : 'good') : 'neutral'}`, text: connected() ? (state.sync.status === 'err' ? 'Error' : 'Connected') : 'Sample data' })),
      connect),
    h('section', { class: 'card' }, h('h2', { text: 'Targets' }), targets),
    h('section', { class: 'card' }, h('h2', { text: 'Backup' }),
      h('p', { class: 'small muted', style: 'margin:0', text: 'Your data already lives in your GitHub repo with full history. This downloads one JSON file of everything as an extra copy.' }),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: backup }, 'Download backup'))),
  ];
}

/* ---------- sample data (shown only when not connected) ---------- */
function sampleData() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const t = todayStr(), d = clone(DEFAULTS);
  const menu = [
    ['Breakfast', '07:10', 'Overnight oats with yogurt and banana', 460, 35],
    ['Lunch', '12:30', '2 pulled pork wraps, yogurt sauce', 900, 80],
    ['Snack', '16:00', '250 g cottage cheese, apple', 330, 30],
    ['Dinner', '18:15', 'Chicken, rice, salad', 640, 52],
  ];
  for (let i = 20; i >= 0; i--) {
    const day = addDays(t, -i);
    menu.forEach(([meal, time, items, k, p], j) => {
      if (i === 0 && j > 1) return;
      d.food.meals.push({ id: `${day}_s${j}`, date: day, time, meal, items, kcal: Math.round(k * (0.85 + rnd() * 0.3)), protein: Math.round(p * (0.85 + rnd() * 0.3)) });
    });
    if (rnd() > 0.2) d.body.weighins.push({ id: `${day}_w`, date: day, kg: Math.round((87.2 - (20 - i) * 0.07 + (rnd() - 0.5) * 1.2) * 10) / 10 });
    d.health.days[day] = { steps: Math.round(4000 + rnd() * 9000), sleepH: Math.round((5.5 + rnd() * 2.5) * 10) / 10, restingHr: Math.round(66 + rnd() * 16), hrv: Math.round(40 + rnd() * 40), activeKcal: Math.round(250 + rnd() * 600) };
  }
  const plan = [['Upper A', [['Bench press', 'weight', 80, 8], ['Chest-supported row', 'weight', 70, 10], ['Weighted dips', 'bw', 10, 8], ['Pull-ups', 'bw', 0, 8]]],
    ['Lower A', [['Hack squat', 'weight', 140, 8], ['Romanian deadlift', 'weight', 80, 10], ['Leg curl', 'weight', 45, 12]]],
    ['Upper B', [['Pull-ups', 'bw', 0, 9], ['Dumbbell shoulder press', 'weight', 28, 10], ['Dips', 'bw', 0, 20], ['Tuck front lever hold', 'hold', 0, 12]]]];
  for (let w = 0; w < 3; w++) plan.forEach(([name, exs], j) => {
    const day = addDays(t, -18 + w * 7 + j * 2);
    if (day > t) return;
    d.training.sessions.push({
      id: `${day}_t${j}`, date: day, name, notes: '', exercises: exs.map(([n, kind, kg, reps]) => ({
        name: n, kind, sets: [0, 1, 2].map(si => kind === 'hold' ? { sec: reps + w * 2 - si * 2 } : { reps: reps + (w > 1 ? 1 : 0) - (si > 1 ? 1 : 0), ...(kg ? { kg: kg + w * 2.5 } : {}) }),
      })),
    });
  });
  [[-16, 3, 1140], [-12, 3.2, 1150], [-9, 4, 1500], [-5, 3, 1050], [-2, 5, 1880]].forEach(([o, km, sec], i) => d.activities.activities.push({ id: `s_a${i}`, date: addDays(t, o), type: 'Run', distanceKm: km, durationSec: sec, avgHr: 150 + i * 2 }));
  d.body.measurements.push({ id: 's_m1', date: addDays(t, -20), waist: 92, chest: 104, arm: 37.5, thigh: 60 }, { id: 's_m2', date: addDays(t, -2), waist: 90.5, chest: 104, arm: 37.5, thigh: 59.5 });
  return d;
}

/* ---------- render / router ---------- */
const VIEWS = { today: viewToday, food: viewFood, train: viewTrain, body: viewBody, move: viewMove, settings: viewSettings };
function currentView() { const k = location.hash.replace('#', ''); return VIEWS[k] ? k : 'today'; }

function render() {
  const view = document.getElementById('view');
  const key = currentView();
  // keep typed-but-unsaved form values across re-renders
  const keep = {};
  view.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => { if (el.type !== 'file' && el.type !== 'password') keep[el.id] = el.value; });
  const opened = {}; view.querySelectorAll('details[id]').forEach(el => { opened[el.id] = el.open; });
  const sameView = view.dataset.view === key;
  const scroll = window.scrollY;

  view.textContent = '';
  if (state.loading) view.append(h('p', { class: 'empty', text: 'Loading your data…' }));
  else view.append(...[].concat(VIEWS[key]()).filter(Boolean));
  view.dataset.view = key;

  if (sameView && !justSubmitted) {
    for (const [id, v] of Object.entries(keep)) { const el = document.getElementById(id); if (el && !/^(ex\d|d-)/.test(id) && el.type !== 'date' && el.value !== v && v !== '') el.value = v; }
    for (const [id, o] of Object.entries(opened)) { const el = document.getElementById(id); if (el) el.open = o; }
    window.scrollTo(0, scroll);
  }
  justSubmitted = false;

  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === key ? 'page' : 'false'));
  const banner = document.getElementById('banner');
  banner.hidden = state.mode !== 'sample' || key === 'settings';
  if (!banner.hidden) {
    banner.textContent = '';
    banner.append(h('div', null, h('span', null, h('b', { text: 'Sample data. ' }), 'Nothing you enter is saved.'), h('a', { href: '#settings' }, 'Connect your data')));
  }
  setSync(state.sync.status, state.sync.msg);
  drawAll();
}
let justSubmitted = false;
document.addEventListener('submit', () => { justSubmitted = true; }, true);

window.addEventListener('hashchange', () => { state.ui.confirm = null; render(); window.scrollTo(0, 0); });
window.addEventListener('online', () => { if (state.mode === 'github') FILES.forEach(f => { if ((state.pending[f] || []).length) flush(f); }); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.mode === 'github' && !FILES.some(f => flushing[f] || (state.pending[f] || []).length)) loadAll();
});

state.draft = store('prime.draft');
loadAll();
