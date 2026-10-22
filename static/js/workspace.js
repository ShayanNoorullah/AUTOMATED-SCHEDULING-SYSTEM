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

function wsLayouts() { try { return JSON.parse(localStorage.getItem("ws-layouts") || "{}") || {}; } catch { return {}; } }
function wsSaveLayouts(o) { try { localStorage.setItem("ws-layouts", JSON.stringify(o)); } catch {} }
function wsLoadCurrent() {
  try { const c = JSON.parse(localStorage.getItem("ws-current") || "null"); if (c && Array.isArray(c.widgets)) return c; } catch {}
  return { name: "My workspace", widgets: WS_DEFAULT.map(t => ({ id: ++_wsUid, type: t })) };
}
function wsPersistCurrent() { try { localStorage.setItem("ws-current", JSON.stringify(wsState)); } catch {} }

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
function wsRenderWidget(w, d) {
  const def = WS_CATALOG[w.type]; if (!def) return "";
  let body;
  if (def.kpi) { const [n, sub] = def.kpi(d); body = `<div class="ws-kpi"><div class="ws-kpi-n">${n}</div><div class="ws-kpi-l">${esc(sub)}</div></div>`; }
  else { const data = def.chart(d); body = data.some(x => x.value) ? wsBars(data) : `<p class="hint" style="margin:auto">No data yet</p>`; }
  const wide = !!def.chart;
  return `<div class="ws-card${wide ? " ws-card-wide" : ""}" data-id="${w.id}">
    <div class="ws-card-h"><span>${esc(def.label)}</span><button class="ws-x" type="button" title="Remove" onclick="wsRemoveWidget(${w.id})">✕</button></div>
    <div class="ws-card-b">${body}</div>
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
  m.innerHTML = Object.entries(WS_CATALOG).map(([t, def]) => `<button type="button" onclick="wsAddWidget('${t}')">${def.chart ? "📊" : "🔢"} ${esc(def.label)}</button>`).join("");
  m.classList.add("show");
}
function wsToggleOpen() {
  const m = document.getElementById("wsOpenMenu"); if (!m) return;
  const open = m.classList.contains("show"); wsCloseMenus(); if (open) return;
  const names = Object.keys(wsLayouts());
  m.innerHTML = names.length ? names.map(n => `<button type="button" onclick="wsOpen('${escA(n)}')">${esc(n)}</button>`).join("") : `<p class="hint" style="margin:0;padding:8px 12px">No saved layouts yet</p>`;
  m.classList.add("show");
}
function wsAddWidget(type) { wsState.widgets.push({ id: ++_wsUid, type }); wsCloseMenus(); wsPersistCurrent(); wsRender(); }
function wsRemoveWidget(id) { wsState.widgets = wsState.widgets.filter(w => w.id !== id); wsPersistCurrent(); wsRender(); }
function wsNew() { wsState = { name: "Untitled", widgets: [] }; wsPersistCurrent(); wsRender(); toast("New workspace"); }
function wsSave() {
  if (!wsState.name || wsState.name === "Untitled") return wsSaveAs();
  const o = wsLayouts(); o[wsState.name] = wsState.widgets.map(w => w.type); wsSaveLayouts(o); wsPersistCurrent();
  toast(`Saved "${wsState.name}" ✓`);
}
function wsSaveAs() {
  const name = (prompt("Save workspace as:", wsState.name === "Untitled" ? "" : wsState.name) || "").trim();
  if (!name) return;
  wsState.name = name; const o = wsLayouts(); o[name] = wsState.widgets.map(w => w.type); wsSaveLayouts(o);
  wsPersistCurrent(); document.getElementById("wsName").textContent = name; toast(`Saved "${name}" ✓`);
}
function wsOpen(name) {
  const o = wsLayouts(); if (!o[name]) return;
  wsState = { name, widgets: o[name].map(t => ({ id: ++_wsUid, type: t })) };
  wsCloseMenus(); wsPersistCurrent(); wsRender(); toast(`Opened "${name}"`);
}
document.addEventListener("click", e => { if (!e.target.closest(".ws-open-wrap")) wsCloseMenus(); });

wsState = wsLoadCurrent();
wsState.widgets.forEach(w => { if (w.id > _wsUid) _wsUid = w.id; });
