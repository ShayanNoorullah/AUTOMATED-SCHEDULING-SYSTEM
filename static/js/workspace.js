/* Workspace — a personal board of KPI + chart widgets with saved layouts.
   Data comes from already-loaded globals (groups/contacts/lists) + release history.
   Layouts persist per-browser in localStorage. */
let wsState = { name: "My workspace", widgets: [] };
let wsHist = null;
let _wsUid = 0;

const WS_CATALOG = {
  "kpi-groups":   { label: "Groups",            kpi: d => [d.groups.length, "WhatsApp groups"] },
  "kpi-contacts": { label: "Contacts",          kpi: d => [d.contacts.length, "saved contacts"] },
  "kpi-lists":    { label: "Lists",             kpi: d => [d.lists.length, "audiences"] },
  "kpi-slots":    { label: "Scheduled slots",   kpi: d => [d.slots, "class timings this week"] },
  "kpi-linked":   { label: "On WhatsApp",       kpi: d => [d.linked, "groups linked"] },
  "kpi-sends7":   { label: "Sends · 7 days",    kpi: d => [d.sends7, "messages last 7 days"] },
  "chart-weekday":{ label: "Slots per weekday", chart: d => DAYS.map(x => ({ label: x.slice(0, 3), value: d.byDay[x] || 0 })) },
  "chart-groups": { label: "Busiest groups",    chart: d => d.byGroup.slice().sort((a, b) => b.n - a.n).slice(0, 6).map(g => ({ label: g.name, value: g.n })) },
  "chart-sends":  { label: "Sends last 7 days", chart: d => d.sendsByDay },
};
const WS_DEFAULT = ["kpi-groups", "kpi-contacts", "kpi-lists", "kpi-slots", "chart-weekday", "chart-groups"];
/* Built-in layouts offered under Open. */
const WS_PRESETS = {
  "Morning check": ["kpi-slots", "kpi-linked", "kpi-sends7", "chart-weekday"],
  "Send day": ["kpi-linked", "kpi-groups", "chart-sends", "chart-groups"],
};

function wsLayouts() { try { return JSON.parse(localStorage.getItem("ws-layouts") || "{}") || {}; } catch { return {}; } }
function wsSaveLayouts(o) { try { localStorage.setItem("ws-layouts", JSON.stringify(o)); } catch {} }
function wsLoadCurrent() {
  try { const c = JSON.parse(localStorage.getItem("ws-current") || "null"); if (c && Array.isArray(c.widgets)) return c; } catch {}
  return { name: "My workspace", widgets: WS_DEFAULT.map(t => ({ id: ++_wsUid, type: t })) };
}
/* Every change is kept as the current workspace; a layout saved under a name is updated too. */
function wsLayoutOf() { return wsState.widgets.map(w => (w.span ? { type: w.type, span: w.span } : w.type)); }
function wsPersistCurrent() {
  try { localStorage.setItem("ws-current", JSON.stringify(wsState)); } catch {}
  const o = wsLayouts();
  if (o[wsState.name]) { o[wsState.name] = wsLayoutOf(); wsSaveLayouts(o); }
  const t = document.getElementById("wsSaved");
  if (t) { t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1400); }
}
const wsFromLayout = (l) => l.map(t => (typeof t === "string" ? { id: ++_wsUid, type: t } : { id: ++_wsUid, type: t.type, span: t.span }));

function wsData() {
  // index.html/lists.js declare these with `let` → shared lexical globals, reached
  // by bare name (not via window). Guard with typeof in case a script hasn't run.
  const gGroups = (typeof groups !== "undefined" && groups) || [];
  const gContacts = (typeof contacts !== "undefined" && contacts) || [];
  const gLists = (typeof lists !== "undefined" && lists) || [];
  let slots = 0, linked = 0; const byDay = {}; const byGroup = [];
  gGroups.forEach(g => {
    const s = (g.schedule || []).filter(e => (e.from || "").trim());
    slots += s.length; if (g.waLinked) linked++;
    byGroup.push({ name: (g.nickname || g.name || "—"), n: s.length });
    s.forEach(e => byDay[e.day] = (byDay[e.day] || 0) + 1);
  });
  // release history → sends per day (last 7)
  const days = []; const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push(d); }
  const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; // local date, tz-safe
  const counts = {}; days.forEach(d => counts[key(d)] = 0);
  let sends7 = 0;
  (wsHist || []).forEach(r => {
    const raw = r.at || r.created_at || r.time || r.date; if (!raw) return;
    const d = new Date(raw); if (isNaN(d)) return; const k = key(d);
    const n = Number(r.count || (Array.isArray(r.targets) ? r.targets.length : 0) || 1) || 1;
    if (k in counts) { counts[k] += n; sends7 += n; }
  });
  const sendsByDay = days.map(d => ({ label: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()], value: counts[key(d)] }));
  return { groups: gGroups, contacts: gContacts, lists: gLists, slots, linked, byDay, byGroup, sends7, sendsByDay };
}

function wsBars(data) {
  const max = Math.max(1, ...data.map(d => d.value));
  return `<div class="ws-bars">${data.map(d =>
    `<div class="ws-bar" title="${esc(d.label)}: ${d.value}"><span class="ws-bar-v">${d.value || ""}</span><div class="ws-bar-track"><div class="ws-bar-fill" style="height:${Math.round((d.value / max) * 100)}%"></div></div><span class="ws-bar-l">${esc(d.label)}</span></div>`
  ).join("")}</div>`;
}
function wsBody(def, d) {
  if (def.kpi) { const [n, sub] = def.kpi(d); return `<div class="ws-kpi"><div class="ws-kpi-n">${n}</div><div class="ws-kpi-l">${esc(sub)}</div></div>`; }
  const data = def.chart(d); return data.some(x => x.value) ? wsBars(data) : `<p class="hint" style="margin:auto">No data yet</p>`;
}
const wsSpan = (w) => w.span || (WS_CATALOG[w.type]?.chart ? 2 : 1);
function wsRenderWidget(w, d) {
  const def = WS_CATALOG[w.type]; if (!def) return "";
  const sp = wsSpan(w);
  return `<div class="ws-card" data-id="${w.id}" style="--span:${sp}">
    <div class="ws-card-h" onpointerdown="wsDragStart(event,${w.id})" title="Drag to move"><span class="ws-grip" aria-hidden="true">⠿</span><span class="ws-card-t">${esc(def.label)}</span>
      <button class="ws-x ws-size" type="button" title="${sp === 2 ? "Make narrower" : "Make wider"}" aria-label="${sp === 2 ? "Make narrower" : "Make wider"}" onclick="wsSetSpan(${w.id},${3 - sp})">${sp === 2 ? "⇤" : "⇥"}</button>
      <button class="ws-x" type="button" title="Remove" aria-label="Remove ${escA(def.label)}" onclick="wsRemoveWidget(${w.id})">✕</button></div>
    <div class="ws-card-b">${wsBody(def, d)}</div>
    <span class="ws-resize" title="Drag to resize" aria-hidden="true" onpointerdown="wsResizeStart(event,${w.id})"></span>
  </div>`;
}

async function wsRender() {
  const grid = document.getElementById("wsGrid"); if (!grid) return;
  document.getElementById("wsName").textContent = wsState.name;
  if (wsHist === null) { try { const r = await fetch("/api/release-history"); const j = await r.json(); wsHist = Array.isArray(j) ? j : (j.items || j.rows || []); } catch { wsHist = []; } }
  const d = wsData();
  if (!wsState.widgets.length) {
    grid.innerHTML = `<div class="ws-empty"><p class="hint">Empty workspace.</p><button class="btn btn-primary btn-sm" onclick="wsToggleAdd()">+ Add a widget</button></div>`;
    return;
  }
  grid.innerHTML = wsState.widgets.map(w => wsRenderWidget(w, d)).join("");
}

function wsCloseMenus() { document.getElementById("wsAddMenu")?.classList.remove("show"); document.getElementById("wsOpenMenu")?.classList.remove("show"); }
function wsToggleAdd() {
  const m = document.getElementById("wsAddMenu"); if (!m) return;
  const open = m.classList.contains("show"); wsCloseMenus(); if (open) return;
  const d = wsData();
  m.innerHTML = `<div class="ws-gallery">${Object.entries(WS_CATALOG).map(([t, def]) =>
    `<button type="button" class="ws-tile${def.chart ? " ws-tile-chart" : ""}" onclick="wsAddWidget('${t}')"><span class="ws-tile-h">${esc(def.label)}</span><span class="ws-tile-b" aria-hidden="true">${wsBody(def, d)}</span></button>`).join("")}</div>`;
  m.classList.add("show");
}
function wsToggleOpen() {
  const m = document.getElementById("wsOpenMenu"); if (!m) return;
  const open = m.classList.contains("show"); wsCloseMenus(); if (open) return;
  const names = Object.keys(wsLayouts());
  m.innerHTML = (names.length ? names.map(n => `<button type="button" onclick="wsOpen('${escA(n)}')">${esc(n)}</button>`).join("") : `<p class="hint" style="margin:0;padding:8px 12px">No saved layouts yet</p>`)
    + `<div class="ws-menu-sep">Presets</div>` + Object.keys(WS_PRESETS).map(n => `<button type="button" onclick="wsOpenPreset('${escA(n)}')">${esc(n)}</button>`).join("");
  m.classList.add("show");
}
function wsAddWidget(type) { wsState.widgets.push({ id: ++_wsUid, type }); wsCloseMenus(); wsPersistCurrent(); wsRender(); }
function wsRemoveWidget(id) { wsState.widgets = wsState.widgets.filter(w => w.id !== id); wsPersistCurrent(); wsRender(); }
function wsNew() { wsState = { name: "Untitled", widgets: [] }; wsPersistCurrent(); wsRender(); toast("New workspace"); }
function wsSave() {
  if (!wsState.name || wsState.name === "Untitled") return wsSaveAs();
  const o = wsLayouts(); o[wsState.name] = wsLayoutOf(); wsSaveLayouts(o); wsPersistCurrent();
  toast(`Saved "${wsState.name}" ✓`);
}
async function wsSaveAs() {
  const name = ((await promptDialog("Save workspace as:", wsState.name === "Untitled" ? "" : wsState.name, { ok: "Save" })) || "").trim();
  if (!name) return;
  wsState.name = name; const o = wsLayouts(); o[name] = wsLayoutOf(); wsSaveLayouts(o);
  wsPersistCurrent(); document.getElementById("wsName").textContent = name; toast(`Saved "${name}" ✓`);
}
function wsOpen(name) {
  const o = wsLayouts(); if (!o[name]) return;
  wsState = { name, widgets: wsFromLayout(o[name]) };
  wsCloseMenus(); wsPersistCurrent(); wsRender(); toast(`Opened "${name}"`);
}
function wsOpenPreset(name) {
  if (!WS_PRESETS[name]) return;
  wsState = { name, widgets: wsFromLayout(WS_PRESETS[name]) };
  wsCloseMenus(); wsPersistCurrent(); wsRender(); toast(`Opened the "${name}" preset — Save as to keep changes under your own name`);
}
function wsSetSpan(id, sp) { const w = wsState.widgets.find(x => x.id === id); if (!w) return; w.span = sp; wsPersistCurrent(); wsRender(); }

/* Drag a card by its header to reorder; the others slide out of the way (FLIP). */
function wsDragStart(ev, id) {
  if (ev.button > 0 || ev.target.closest("button")) return;
  const grid = document.getElementById("wsGrid"), card = grid && grid.querySelector(`.ws-card[data-id="${id}"]`);
  if (!card) return;
  ev.preventDefault();
  const r0 = card.getBoundingClientRect(), offX = ev.clientX - r0.left, offY = ev.clientY - r0.top;
  let lastSwap = 0;
  const follow = (x, y) => { card.style.transform = ""; const r = card.getBoundingClientRect(); card.style.transform = `translate(${x - offX - r.left}px,${y - offY - r.top}px)`; };
  _pointerTrack(ev, (e) => {
    card.classList.add("ws-dragging"); document.body.classList.add("ws-moving");
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest(".ws-card");
    if (under && under !== card && grid.contains(under) && Date.now() - lastSwap > 250) {
      const cards = [...grid.children], before = new Map(cards.map(c => [c, c.getBoundingClientRect()]));
      grid.insertBefore(card, cards.indexOf(card) < cards.indexOf(under) ? under.nextSibling : under);
      lastSwap = Date.now();
      cards.forEach(c => {
        if (c === card) return;
        const a = before.get(c), b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
    }
    follow(e.clientX, e.clientY);
  }, (e) => {
    const a = card.getBoundingClientRect();
    card.style.transform = ""; card.classList.remove("ws-dragging"); document.body.classList.remove("ws-moving");
    if (!e) return;
    const b = card.getBoundingClientRect();
    card.animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px)` }, { transform: "none" }], { duration: 200, easing: "ease-out" });
    const order = [...grid.children].map(c => +c.dataset.id);
    wsState.widgets.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
    wsPersistCurrent();
  });
}
/* Drag the corner to make a card one or two columns wide. */
function wsResizeStart(ev, id) {
  const grid = document.getElementById("wsGrid"), card = grid && grid.querySelector(`.ws-card[data-id="${id}"]`);
  const w = wsState.widgets.find(x => x.id === id);
  if (ev.button > 0 || !card || !w) return;
  ev.preventDefault(); ev.stopPropagation();
  const cs = getComputedStyle(grid), cols = cs.gridTemplateColumns.split(" ").length, gap = parseFloat(cs.columnGap) || 0;
  const colW = (grid.clientWidth - gap * (cols - 1)) / cols, startW = card.offsetWidth;
  let sp = wsSpan(w);
  card.classList.add("ws-resizing");
  _pointerTrack(ev, (e) => {
    sp = Math.max(1, Math.min(2, cols, Math.round((startW + e.clientX - ev.clientX + gap) / (colW + gap))));
    card.style.setProperty("--span", sp);
  }, (e) => {
    card.classList.remove("ws-resizing");
    if (e && sp !== wsSpan(w)) { w.span = sp; wsPersistCurrent(); }
    wsRender();
  });
}
document.addEventListener("click", e => { if (!e.target.closest(".ws-open-wrap")) wsCloseMenus(); });

wsState = wsLoadCurrent();
wsState.widgets.forEach(w => { if (w.id > _wsUid) _wsUid = w.id; });
