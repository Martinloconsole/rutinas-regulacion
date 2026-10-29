"use strict";
/* =====================================================================
   RUTINAS DE REGULACIÓN — Lógica frontend
   ===================================================================== */

// 👉 Pega aquí la URL de tu Web App de Google Apps Script (termina en /exec).
//    Si la dejas vacía, la app funciona igual, pero solo guarda en este dispositivo.
const API_URL = "https://script.google.com/macros/s/AKfycbwMG7RkeIXtO7dDJL4TuvWD-q3oE2qb7sdr9U10PZk1TiGTWCuu5bSPddb8D0fdoA/exec";

const LS_KEY = "rutinas_regulacion_v1";
const PENDING_KEY = "rutinas_regulacion_pending_v1";
const PERIOD_LABEL = { dia: "Día", noche: "Noche" };

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* ---------- Estado ---------- */
function seedHabits() {
  return [
    { id: uid(), name: "Tomar un vaso de agua", time: "08:00", period: "dia" },
    { id: uid(), name: "Salir a recibir luz natural", time: "09:00", period: "dia" },
    { id: uid(), name: "Apagar pantallas", time: "21:00", period: "noche" },
    { id: uid(), name: "Respiración lenta (4-7-8)", time: "21:30", period: "noche" }
  ];
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && Array.isArray(s.habits)) return { habits: s.habits, logs: s.logs || {} };
  } catch (_) { /* usa semilla */ }
  return { habits: seedHabits(), logs: {} };
}
const state = loadState();
const saveState = () => localStorage.setItem(LS_KEY, JSON.stringify(state));
let selectedDate = ymd(new Date());
let currentView = "dashboard";

const isDone = (date, id) => !!(state.logs[date] && state.logs[date][id]);
const habitsOf = p => state.habits.filter(h => h.period === p).sort((a, b) => a.time.localeCompare(b.time));

/* ---------- Sincronización con Google Sheets ---------- */
let pending = [];
try { pending = JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch (_) { pending = []; }
const savePending = () => localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
let flushing = false;

function setSync(st) {
  const box = $("#syncStatus");
  const labels = { local: "Solo local", ok: "Sincronizado", sync: "Sincronizando…", error: "Pendiente de enviar" };
  box.dataset.state = st;
  box.textContent = labels[st] || st;
}

function queueSync(item) {
  pending = pending.filter(p => !(p.fecha === item.fecha && p.momento === item.momento && p.habito === item.habito));
  pending.push(item);
  savePending();
  flush();
}

async function flush() {
  if (!API_URL) { setSync("local"); return; }
  if (!pending.length || flushing) return;
  flushing = true;
  setSync("sync");
  const batch = pending.slice();
  try {
    // text/plain evita el "preflight" CORS, que Apps Script no soporta.
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ items: batch })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error del servidor");
    pending = pending.filter(p => !batch.includes(p));
    savePending();
    setSync("ok");
  } catch (err) {
    console.warn("No se pudo sincronizar:", err);
    setSync("error");
  } finally {
    flushing = false;
  }
  if (pending.length && $("#syncStatus").dataset.state !== "error") flush();
}

async function pull() {
  if (!API_URL) { setSync("local"); return; }
  try {
    setSync("sync");
    const url = API_URL + (API_URL.includes("?") ? "&" : "?") + "action=list";
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error del servidor");
    data.rows.forEach(r => {
      const h = state.habits.find(x => x.name === r.habito && PERIOD_LABEL[x.period] === r.momento);
      if (!h) return;
      if (pending.some(p => p.fecha === r.fecha && p.habito === r.habito && p.momento === r.momento)) return;
      (state.logs[r.fecha] = state.logs[r.fecha] || {})[h.id] = r.completado === "Sí";
    });
    saveState();
    renderAll();
    setSync("ok");
  } catch (err) {
    console.warn("No se pudo leer la hoja:", err);
    setSync("error");
  }
}

/* ---------- Acciones ---------- */
function toggleHabit(id) {
  const h = state.habits.find(x => x.id === id);
  if (!h) return;
  const value = !isDone(selectedDate, id);
  (state.logs[selectedDate] = state.logs[selectedDate] || {})[id] = value;
  saveState();
  renderDashboard();
  queueSync({
    fecha: selectedDate,
    momento: PERIOD_LABEL[h.period],
    habito: h.name,
    completado: value ? "Sí" : "No"
  });
}

function deleteHabit(id) {
  const h = state.habits.find(x => x.id === id);
  if (!h || !confirm(`¿Eliminar "${h.name}"?`)) return;
  state.habits = state.habits.filter(x => x.id !== id);
  Object.values(state.logs).forEach(day => delete day[id]);
  saveState();
  renderAll();
}

/* ---------- Render: configuración ---------- */
function renderConfig() {
  ["dia", "noche"].forEach(p => {
    const ul = $("#cfg-" + p);
    ul.replaceChildren();
    const list = habitsOf(p);
    if (!list.length) { ul.appendChild(el("li", "empty", "Aún no hay hábitos aquí.")); return; }
    list.forEach(h => {
      const li = el("li", "cfg-item");
      const info = el("div");
      info.append(el("div", "name", h.name), el("div", "time", "Inicia a las " + h.time));
      const del = el("button", "del", "✕");
      del.type = "button";
      del.setAttribute("aria-label", "Eliminar " + h.name);
      del.addEventListener("click", () => deleteHabit(h.id));
      li.append(info, del);
      ul.appendChild(li);
    });
  });
}

/* ---------- Render: dashboard ---------- */
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function renderTimeline(scrollToSelected) {
  const box = $("#timeline");
  box.replaceChildren();
  const today = new Date();
  const todayStr = ymd(today);
  for (let i = -15; i <= 15; i++) {
    const d = addDays(today, i);
    const s = ymd(d);
    const b = el("button", "day-btn");
    b.type = "button";
    b.dataset.date = s;
    if (i < 0) b.classList.add("past");
    if (s === todayStr) b.classList.add("today");
    if (s === selectedDate) b.classList.add("selected");
    b.append(el("small", null, DAY_NAMES[d.getDay()]), el("b", null, String(d.getDate())));
    b.addEventListener("click", () => { selectedDate = s; renderDashboard(true); });
    box.appendChild(b);
  }
  if (scrollToSelected) {
    const sel = $(".day-btn.selected", box);
    if (sel) box.scrollTo({ left: sel.offsetLeft - box.clientWidth / 2 + sel.clientWidth / 2, behavior: "smooth" });
  }
}

function renderDashboard(scrollToSelected = false) {
  const d = parseYmd(selectedDate);
  $("#dashDate").textContent = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  renderTimeline(scrollToSelected);

  ["dia", "noche"].forEach(p => {
    const list = habitsOf(p);
    const ul = $("#list-" + p);
    ul.replaceChildren();
    $("#start-" + p).textContent = list.length ? list[0].time : "--:--";
    $("#count-" + p).textContent = `${list.filter(h => isDone(selectedDate, h.id)).length}/${list.length}`;
    if (!list.length) {
      ul.appendChild(el("li", "empty", "Sin hábitos. Agrégalos en la pestaña Hábitos."));
      return;
    }
    list.forEach(h => {
      const done = isDone(selectedDate, h.id);
      const li = el("li", "habit" + (done ? " done" : ""));
      const info = el("div");
      info.append(el("span", "h-name", h.name), el("span", "h-time", h.time));
      const btn = el("button", "check");
      btn.type = "button";
      btn.innerHTML = CHECK_SVG;
      btn.setAttribute("aria-pressed", String(done));
      btn.setAttribute("aria-label", `${h.name}: ${done ? "completado" : "pendiente"}`);
      btn.addEventListener("click", () => toggleHabit(h.id));
      li.append(info, btn);
      ul.appendChild(li);
    });
  });
  updateScrollTheme();
}

/* ---------- Render: rendimiento ---------- */
function renderStats() {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const C = 2 * Math.PI * 46;
  const info = { dia: { title: "☀️ Hábitos diurnos" }, noche: { title: "🌙 Hábitos nocturnos" } };

  ["dia", "noche"].forEach(p => {
    const hs = state.habits.filter(h => h.period === p);
    const pct = d => hs.length ? Math.round(hs.filter(h => isDone(ymd(d), h.id)).length / hs.length * 100) : 0;
    const vals = days.map(pct);
    const week = Math.round(vals.reduce((a, b) => a + b, 0) / 7);
    const best = Math.max(...vals);
    const box = $("#stats-" + p);

    if (!hs.length) {
      box.innerHTML = `<h2>${info[p].title}</h2><p class="empty">Aún no hay hábitos en esta categoría.</p>`;
      return;
    }
    const bars = days.map((d, i) => `
      <div class="bar-col${i === 6 ? " today" : ""}">
        <div class="bar-track"><div class="bar-fill" style="height:${vals[i]}%"></div></div>
        <b>${vals[i]}%</b>
        <span>${DAY_NAMES[d.getDay()].slice(0, 1)}</span>
      </div>`).join("");

    box.innerHTML = `
      <h2>${info[p].title}</h2>
      <div class="stats-top">
        <svg class="donut" viewBox="0 0 112 112" role="img" aria-label="Cumplimiento semanal ${week}%">
          <circle class="d-bg" cx="56" cy="56" r="46"/>
          <circle class="d-fg" cx="56" cy="56" r="46" stroke-dasharray="${(C * week / 100).toFixed(1)} ${C.toFixed(1)}"/>
          <text x="56" y="56">${week}%</text>
        </svg>
        <div class="stats-meta">
          <p>Semana: <b>${week}%</b></p>
          <p>Hoy: <b>${vals[6]}%</b></p>
          <p>Mejor día: <b>${best}%</b></p>
        </div>
      </div>
      <div class="bars">${bars}</div>`;
  });
}

function renderAll() {
  renderConfig();
  renderDashboard();
  renderStats();
}

/* ---------- Navegación ---------- */
function showView(name) {
  currentView = name;
  document.body.dataset.view = name;
  $$(".view").forEach(v => { v.hidden = v.id !== "view-" + name; });
  $$(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  window.scrollTo(0, 0);
  if (name === "stats") renderStats();
  if (name === "dashboard") renderDashboard(true);
  updateScrollTheme();
}
$$(".bottom-nav button").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
$("#btnGoMain").addEventListener("click", () => showView("dashboard"));

/* ---------- Transición día → noche con el scroll ---------- */
function updateScrollTheme() {
  const root = document.documentElement;
  let p = 0;
  if (currentView === "dashboard") {
    const max = root.scrollHeight - window.innerHeight;
    p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  }
  root.style.setProperty("--night-progress", p.toFixed(3));
}
window.addEventListener("scroll", updateScrollTheme, { passive: true });
window.addEventListener("resize", updateScrollTheme);

/* ---------- Modal: nuevo hábito ---------- */
const dialog = $("#habitDialog");
const form = $("#habitForm");
let timeTouched = false;

$("#btnNewHabit").addEventListener("click", () => {
  form.reset();
  timeTouched = false;
  $("#fTime").value = "08:00";
  dialog.showModal();
  $("#fName").focus();
});
$("#btnCancel").addEventListener("click", () => dialog.close());
$("#fTime").addEventListener("input", () => { timeTouched = true; });
$$('input[name="fPeriod"]').forEach(r => r.addEventListener("change", () => {
  if (!timeTouched) $("#fTime").value = r.value === "noche" ? "21:00" : "08:00";
}));
form.addEventListener("submit", e => {
  e.preventDefault();
  const name = $("#fName").value.trim();
  if (!name) return;
  state.habits.push({
    id: uid(),
    name,
    time: $("#fTime").value || "08:00",
    period: $('input[name="fPeriod"]:checked').value
  });
  saveState();
  dialog.close();
  renderAll();
});

/* ---------- Temporizador ---------- */
const RING_C = 2 * Math.PI * 90;
const timer = { total: 300, remaining: 300, state: "idle", endAt: 0, iv: null };
let audioCtx = null;

const fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

function updateTimerUI() {
  $("#timerDisplay").textContent = fmt(timer.remaining);
  const frac = timer.total ? timer.remaining / timer.total : 0;
  $("#ringFg").style.strokeDashoffset = String(RING_C * (1 - frac));
  const msgs = { idle: "Listo", running: "En curso…", paused: "En pausa", done: "¡Tiempo!" };
  $("#timerMsg").textContent = msgs[timer.state];
  $("#view-timer .timer-card").classList.toggle("finished", timer.state === "done");

  $("#btnStart").hidden = timer.state !== "idle";
  $("#btnPause").hidden = timer.state !== "running";
  $("#btnResume").hidden = timer.state !== "paused";
  $("#btnReset").disabled = timer.state === "idle" && timer.remaining === timer.total;

  const locked = timer.state !== "idle";
  $$("#presets .chip").forEach(c => {
    c.disabled = locked;
    c.classList.toggle("active", Number(c.dataset.min) * 60 === timer.total);
  });
  $("#cMin").disabled = $("#cSec").disabled = $("#btnSetCustom").disabled = locked;
}

function setTotal(sec) {
  if (timer.state !== "idle") return;
  sec = clamp(Math.round(sec), 1, 180 * 60);
  timer.total = timer.remaining = sec;
  $("#cMin").value = Math.floor(sec / 60);
  $("#cSec").value = sec % 60;
  updateTimerUI();
}

function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (_) { /* sin audio */ }
}

function chime() {
  if (!audioCtx) return;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // Do Mi Sol Do
  [0, 1.4].forEach(offset => {
    notes.forEach((f, i) => {
      const t = audioCtx.currentTime + offset + i * 0.28;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(g).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    });
  });
}

function tick() {
  timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
  if (timer.remaining === 0) {
    clearInterval(timer.iv);
    timer.state = "done";
    chime();
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
  }
  updateTimerUI();
}

function startTimer() {
  unlockAudio();
  if (timer.remaining <= 0) timer.remaining = timer.total;
  timer.endAt = Date.now() + timer.remaining * 1000;
  timer.state = "running";
  clearInterval(timer.iv);
  timer.iv = setInterval(tick, 200);
  updateTimerUI();
}
function pauseTimer() {
  clearInterval(timer.iv);
  timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
  timer.state = "paused";
  updateTimerUI();
}
function resetTimer() {
  clearInterval(timer.iv);
  timer.remaining = timer.total;
  timer.state = "idle";
  updateTimerUI();
}

$("#btnStart").addEventListener("click", startTimer);
$("#btnResume").addEventListener("click", startTimer);
$("#btnPause").addEventListener("click", pauseTimer);
$("#btnReset").addEventListener("click", resetTimer);
$$("#presets .chip").forEach(c => c.addEventListener("click", () => setTotal(Number(c.dataset.min) * 60)));
$("#btnSetCustom").addEventListener("click", () => {
  setTotal((Number($("#cMin").value) || 0) * 60 + (Number($("#cSec").value) || 0));
});

function updateClock() {
  $("#clock").textContent = new Date().toLocaleTimeString("es-AR", { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

/* ---------- Arranque ---------- */
$("#ringFg").style.strokeDasharray = String(RING_C);
renderAll();
updateTimerUI();
showView("dashboard");
setSync(API_URL ? (pending.length ? "error" : "ok") : "local");
pull().then(flush);
window.addEventListener("online", () => { flush(); pull(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderDashboard(); flush(); } });

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
