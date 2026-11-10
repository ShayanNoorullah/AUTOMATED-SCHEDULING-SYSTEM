/* ─────────────────────────────────────────────────────────────────────────
   Visual Editor — a drag/resize weekly timetable wired to the live `groups`.
   Data model: one {day, from, to} entry per (group, day); times are strings
   parsed with the app's parseTimeMin and written back via saveTable().
   The editor works on a snapshot (veItems) so Close discards; Save commits.

   Views (adapted from the rooms-based reference to this groups model):
     week    — interactive grid; axis swap flips days⇄time (vertical/horizontal)
     compact — dense read-only week overview (days as rows, time across)
     day     — one day, day tabs + prev/next + "now" line, interactive
     agenda  — per-day list of classes + weekly-hours-by-group totals
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  // Ordered so consecutive groups get contrasting hues (no two blues/greens adjacent).
  const COLORS = ["#3B5BDB", "#E8890C", "#0F9F74", "#D6336C", "#7048E8", "#2F9E44",
    "#1098AD", "#C92A2A", "#D9A400", "#1C7ED6", "#F76707", "#5C7CFA"];
  const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const HOUR_PX = 56;          // vertical pixels per hour (week vertical + day)
  const LANE_H = 40;           // horizontal week: pixels per overlap lane (incl. gap)
  const LANE_GAP = 9;          // horizontal: vertical gap between stacked lanes
  const CMP_LANE_H = 24;       // compact: denser lanes
  const SNAP = 0.25;           // 15-minute grid
  const MIN_LEN = 0.25;        // shortest class
  let veItems = [];            // [{gi, day, a, b}]  a/b in hours
  let veStart = 8, veEnd = 22; // visible window (hours)
  let winAuto = true;          // window follows the data until the user sets it
  let veView = "week";         // week | compact | day | agenda
  let veSwap = false;          // week only: days as rows / time across
  let veDayIdx = todayIdx();   // day view: selected day
  let drag = null, movedFlag = false;
  const undoStack = [];        // snapshots of veItems for Ctrl+Z / Undo button
  let GEO = { mode: "vgrid" }; // vgrid | hgrid | day | none — drives pointer→(day,hour)
  let _rowTops = [], _rowDays = []; // hgrid: pixel top + day name per row (for drag)

  function days() { return (typeof DAYS !== "undefined" && DAYS) ? DAYS : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]; }
  function todayIdx() { return (new Date().getDay() + 6) % 7; }         // Mon=0 … Sun=6
  function todayName() { return days()[todayIdx()]; }
  function nowHour() { const n = new Date(); return n.getHours() + n.getMinutes() / 60; }

  function snapshot() { return veItems.map((i) => ({ ...i })); }
  function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 40) undoStack.shift(); refreshUndo(); }
  function veUndo() { if (!undoStack.length) return; veItems = undoStack.pop(); render(); refreshUndo(); }
  function refreshUndo() { const b = document.getElementById("veUndoBtn"); if (b) b.disabled = !undoStack.length; }

  function savePrefs() { try { localStorage.setItem("ve-view", veView); localStorage.setItem("ve-swap", veSwap ? "1" : "0"); } catch (e) {} }
  function loadPrefs() { try { const v = localStorage.getItem("ve-view"); if (["week", "compact", "day", "agenda"].includes(v)) veView = v; veSwap = localStorage.getItem("ve-swap") === "1"; } catch (e) {} }

  /* ---- colour per group (deterministic, with a per-browser override) ---- */
  function veColors() { try { return JSON.parse(localStorage.getItem("ve-colors") || "{}"); } catch (e) { return {}; } }
  function colorFor(gi) {
    const g = groups[gi]; if (!g) return COLORS[0];
    const ov = veColors(); if (ov[g.name]) return ov[g.name];
    return COLORS[((gi % COLORS.length) + COLORS.length) % COLORS.length];
  }
  function setColor(gi, c) {
    const ov = veColors(); ov[groups[gi].name] = c;
    try { localStorage.setItem("ve-colors", JSON.stringify(ov)); } catch (e) {}
  }

  /* ---- time helpers (reuse the app parser; format to "3:00pm") ---- */
  const toH = (s) => { const m = (typeof parseTimeMin === "function") ? parseTimeMin(s) : null; return m == null ? null : m / 60; };
  function fmt(h) {
    h = ((h % 24) + 24) % 24;
    const hr = Math.floor(h + 1e-6), mn = Math.round((h - hr) * 60);
    const ap = hr < 12 ? "am" : "pm";
    return `${hr % 12 || 12}:${String(mn).padStart(2, "0")}${ap}`;
  }
  const snap = (h) => Math.round(h / SNAP) * SNAP;
  const hourLab = (h) => (h % 12 || 12) + (h < 12 || h === 24 ? "am" : "pm");

  /* ---- build the working model from the current groups ---- */
  function buildItems() {
    const out = [];
    (groups || []).forEach((g, gi) => (g.schedule || []).forEach((e) => {
      const a = toH(e.from); if (a == null) return;
      let b = toH(e.to); if (b == null || b <= a) b = a + 1;
      out.push({ gi, day: e.day, a, b });
    }));
    return out;
  }
  function computeWindow() {
    if (!veItems.length) return [8, 22];
    let lo = Math.min(...veItems.map((i) => i.a)), hi = Math.max(...veItems.map((i) => i.b));
    lo = Math.max(0, Math.floor(lo - 1)); hi = Math.min(24, Math.ceil(hi + 1));
    if (hi - lo < 8) hi = Math.min(24, lo + 8);
    return [lo, hi];
  }
  function setWindow(start, end) {
    winAuto = false;
    if (start != null) veStart = Math.max(0, Math.min(23, start));
    if (end != null) veEnd = Math.min(24, Math.max(veStart + 1, end));
    if (veEnd <= veStart) veEnd = Math.min(24, veStart + 1);
    render();
  }
  function winLabel(h) { return (h === 24 ? "12" : (h % 12 || 12)) + (h < 12 || h === 24 ? "am" : "pm"); }
  function fillWindowSelects() {
    const s = document.getElementById("veWinStart"), e = document.getElementById("veWinEnd");
    if (!s || !e) return;
    s.innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${winLabel(h)}</option>`).join("");
    e.innerHTML = Array.from({ length: 24 }, (_, h) => h + 1).map((h) => `<option value="${h}">${winLabel(h)}</option>`).join("");
    s.value = String(veStart); e.value = String(veEnd);
    const auto = document.getElementById("veWinAuto"); if (auto) auto.classList.toggle("on", winAuto);
  }
  function vePrint() { document.body.classList.add("ve-print"); window.print(); setTimeout(() => document.body.classList.remove("ve-print"), 400); }

  // overlap of two items on the same day
  const overlaps = (x, y) => x.day === y.day && x.a < y.b && y.a < x.b;
  function pairAccepted(x, y) {
    try {
      if (typeof acceptedClashes === "function" && typeof clashKey === "function")
        return acceptedClashes().has(clashKey(x.day, groups[x.gi].name, groups[y.gi].name));
    } catch (e) {}
    return false;
  }
  const clashing = (x, y) => overlaps(x, y) && !pairAccepted(x, y);
  function hasClash(it) { return veItems.some((o) => o !== it && clashing(o, it)); }

  /* lane packing per day so overlapping classes sit side by side */
  function layout(day) {
    const items = veItems.filter((i) => i.day === day).sort((a, b) => a.a - b.a || a.b - b.b);
    const lanes = [];
    items.forEach((it) => {
      let l = lanes.findIndex((end) => end <= it.a + 1e-6);
      if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = it.b; it._lane = l;
    });
    const n = Math.max(1, lanes.length);
    items.forEach((it) => (it._lanes = n));
    return items;
  }

  /* ---- element helpers ---- */
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function veEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function nameOf(gi) { const g = groups[gi]; return (typeof colDisplay === "function" ? colDisplay(g) : (g && (g.nickname || g.name))) || "—"; }
  const short = nameOf;

  function makeBlock(it, orient) {
    const b = el("div", "ve-block" + (orient === "h" ? " h" : "") + (hasClash(it) ? " clash" : ""));
    b.style.setProperty("--c", colorFor(it.gi));
    const t = orient === "h" ? fmt(it.a) : `${fmt(it.a)} – ${fmt(it.b)}`;  // horizontal: start only (width shows the span)
    b.innerHTML = `<div class="ve-hnd n"></div><div class="ve-bin"><b>${veEsc(nameOf(it.gi))}</b><span>${t}</span></div><div class="ve-hnd s"></div>`;
    if (orient === "h") b.title = `${nameOf(it.gi)} · ${fmt(it.a)} – ${fmt(it.b)} · ${it.day}`;
    b._it = it;
    b.addEventListener("pointerdown", (e) => onDown(e, b, it));
    return b;
  }
  function makeChip(it) {
    const c = el("div", "ve-chip" + (hasClash(it) ? " clash" : ""));
    c.style.setProperty("--c", colorFor(it.gi));
    c.innerHTML = `<b>${veEsc(nameOf(it.gi))}</b><span>${fmt(it.a)}</span>`;
    c.title = `${nameOf(it.gi)} · ${fmt(it.a)}–${fmt(it.b)} · ${it.day}`;
    c.onclick = () => openForm(it);
    return c;
  }

  /* ─── view: week vertical (days as columns, time down) ─── */
  function renderVertical(head, body) {
    GEO = { mode: "vgrid" };
    const DG = days(), span = veEnd - veStart;
    head.innerHTML = `<div class="ve-corner">Time</div>` +
      DG.map((d, i) => `<div class="ve-dh"><span class="ve-dh-full">${d}</span><span class="ve-dh-short">${SHORT[i]}</span></div>`).join("");
    body.style.setProperty("--ve-h", (span * HOUR_PX) + "px");

    const gutter = el("div", "ve-gutter");
    for (let h = veStart; h <= veEnd; h++) { const lab = el("div", "ve-tl", hourLab(h)); lab.style.top = ((h - veStart) * HOUR_PX) + "px"; gutter.appendChild(lab); }
    body.appendChild(gutter);

    const cols = el("div", "ve-cols"); cols.id = "veCanvas";
    for (let h = veStart; h <= veEnd; h++) { const line = el("div", "ve-hline" + (h % 1 ? "" : " hr")); line.style.top = ((h - veStart) * HOUR_PX) + "px"; cols.appendChild(line); }
    for (let d = 0; d < 7; d++) { const col = el("div", "ve-col"); col.style.left = (d / 7 * 100) + "%"; col.style.width = (100 / 7) + "%"; col.dataset.dayi = d; cols.appendChild(col); }
    DG.forEach((day, di) => layout(day).forEach((it) => {
      const laneW = (100 / 7) / it._lanes;
      const b = makeBlock(it, "v");
      b.style.left = (di / 7 * 100 + it._lane * laneW) + "%";
      b.style.width = "calc(" + laneW + "% - 3px)";
      b.style.top = ((it.a - veStart) * HOUR_PX) + "px";
      b.style.height = Math.max(16, (it.b - it.a) * HOUR_PX - 2) + "px";
      cols.appendChild(b);
    }));
    const ti = DG.indexOf(todayName()), nh = nowHour();
    if (ti >= 0 && nh >= veStart && nh <= veEnd) {
      const line = el("div", "ve-now"); line.style.top = ((nh - veStart) * HOUR_PX) + "px";
      line.style.left = (ti / 7 * 100) + "%"; line.style.width = (100 / 7) + "%"; cols.appendChild(line);
    }
    cols.addEventListener("pointerdown", onEmptyDown);
    body.appendChild(cols);
  }

  /* ─── view: week horizontal / compact (days as rows, time across) ─── */
  function renderHorizontal(head, body, opts) {
    const compact = !!(opts && opts.compact);
    GEO = compact ? { mode: "none" } : { mode: "hgrid" };
    const DG = days(), span = veEnd - veStart, laneH = compact ? CMP_LANE_H : LANE_H;
    const gap = compact ? 5 : LANE_GAP, pad = compact ? 5 : 8, blockH = laneH - gap;
    const rowH = (n) => Math.max(1, n) * laneH + 2 * pad;
    const rows = DG.map((d) => { const items = layout(d); return { day: d, items, lanes: items.length ? items[0]._lanes : 1 }; });
    const total = rows.reduce((t, r) => t + rowH(r.lanes), 0);

    head.className = "ve-head ve-head-h";
    let hh = `<div class="ve-hcorner">Day</div><div class="ve-hhours">`;
    for (let h = veStart; h <= veEnd; h++) hh += `<div class="ve-hhr" style="left:${(h - veStart) / span * 100}%">${hourLab(h)}</div>`;
    head.innerHTML = hh + `</div>`;

    body.style.setProperty("--ve-h", total + "px");
    const gut = el("div", "ve-hgut");
    const scroll = el("div", "ve-hscroll");
    const canvas = el("div", "ve-hcanvas"); canvas.id = "veCanvas";
    canvas.style.height = total + "px";

    _rowTops = []; _rowDays = []; let top = 0;
    rows.forEach((r) => {
      _rowTops.push(top); _rowDays.push(r.day);
      const h = rowH(r.lanes);
      const band = el("div", "ve-hrow" + (DG.indexOf(r.day) % 2 ? " alt" : "")); band.style.top = top + "px"; band.style.height = h + "px"; canvas.appendChild(band);
      const lbl = el("div", "ve-hlabel" + (r.day === todayName() ? " today" : ""), `<span class="full">${r.day}</span><span class="short">${SHORT[DG.indexOf(r.day)]}</span>`);
      lbl.style.top = top + "px"; lbl.style.height = h + "px"; gut.appendChild(lbl);
      r.items.forEach((it) => {
        const node = compact ? makeChip(it) : makeBlock(it, "h");
        node.style.left = "calc(" + ((it.a - veStart) / span * 100) + "% + 2px)";
        node.style.width = "calc(" + ((it.b - it.a) / span * 100) + "% - 4px)";
        node.style.top = (top + pad + it._lane * laneH) + "px";
        node.style.height = blockH + "px";
        canvas.appendChild(node);
      });
      top += h;
    });
    for (let h = veStart; h <= veEnd; h++) { const ln = el("div", "ve-vline" + (h % 1 ? "" : " hr")); ln.style.left = ((h - veStart) / span * 100) + "%"; canvas.appendChild(ln); }
    const ti = DG.indexOf(todayName()), nh = nowHour();
    if (ti >= 0 && nh >= veStart && nh <= veEnd) {
      const line = el("div", "ve-vnow"); line.style.left = ((nh - veStart) / span * 100) + "%";
      line.style.top = _rowTops[ti] + "px"; line.style.height = rowH(rows[ti].lanes) + "px"; canvas.appendChild(line);
    }
    if (!compact) canvas.addEventListener("pointerdown", onEmptyDown);
    scroll.appendChild(canvas);
    body.appendChild(gut); body.appendChild(scroll);
  }

  /* ─── view: single day (interactive, time down, lanes across) ─── */
  function renderDay(head, body) {
    GEO = { mode: "day" };
    const DG = days(), ti = todayIdx(), span = veEnd - veStart;
    let th = `<button type="button" class="ve-step" data-d="-1" aria-label="Previous day">‹</button>`;
    DG.forEach((d, i) => { th += `<button type="button" class="ve-daytab${i === ti ? " today" : ""}" data-i="${i}" aria-pressed="${i === veDayIdx}"><span class="full">${d}</span><span class="short">${SHORT[i]}</span></button>`; });
    th += `<button type="button" class="ve-step" data-d="1" aria-label="Next day">›</button>`;
    head.className = "ve-head ve-head-day"; head.innerHTML = `<div class="ve-daytabs">${th}</div>`;
    head.querySelectorAll(".ve-daytab").forEach((b) => (b.onclick = () => { veDayIdx = +b.dataset.i; render(); }));
    head.querySelectorAll(".ve-step").forEach((b) => (b.onclick = () => { veDayIdx = (veDayIdx + (+b.dataset.d) + 7) % 7; render(); }));

    const day = DG[veDayIdx];
    body.style.setProperty("--ve-h", (span * HOUR_PX) + "px");
    const gutter = el("div", "ve-gutter");
    for (let h = veStart; h <= veEnd; h++) { const lab = el("div", "ve-tl", hourLab(h)); lab.style.top = ((h - veStart) * HOUR_PX) + "px"; gutter.appendChild(lab); }
    body.appendChild(gutter);

    const cols = el("div", "ve-cols ve-day1"); cols.id = "veCanvas";
    for (let h = veStart; h <= veEnd; h++) { const line = el("div", "ve-hline" + (h % 1 ? "" : " hr")); line.style.top = ((h - veStart) * HOUR_PX) + "px"; cols.appendChild(line); }
    const items = layout(day), n = items.length ? items[0]._lanes : 1, laneW = 100 / Math.max(1, n);
    items.forEach((it) => {
      const b = makeBlock(it, "v");
      b.style.left = (it._lane * laneW) + "%"; b.style.width = "calc(" + laneW + "% - 3px)";
      b.style.top = ((it.a - veStart) * HOUR_PX) + "px"; b.style.height = Math.max(16, (it.b - it.a) * HOUR_PX - 2) + "px";
      cols.appendChild(b);
    });
    if (veDayIdx === ti) { const nh = nowHour(); if (nh >= veStart && nh <= veEnd) { const line = el("div", "ve-now"); line.style.top = ((nh - veStart) * HOUR_PX) + "px"; line.style.left = "0"; line.style.width = "100%"; cols.appendChild(line); } }
    cols.addEventListener("pointerdown", onEmptyDown);
    body.appendChild(cols);
  }

  /* ─── view: agenda (list + weekly hours by group) ─── */
  function renderAgenda(head, body) {
    GEO = { mode: "none" };
    const DG = days(), wrap = el("div", "ve-agenda");
    DG.forEach((day) => {
      const items = veItems.filter((i) => i.day === day).sort((a, b) => a.a - b.a);
      const card = el("div", "ve-aday");
      const hrs = items.reduce((t, i) => t + Math.max(0, i.b - i.a), 0);
      card.appendChild(el("h4", null, `${day}<small>${fmtHrs(hrs)}</small>`));
      if (!items.length) {
        const e = el("div", "ve-aempty", "Nothing planned. ");
        const bb = el("button", "ve-alink"); bb.type = "button"; bb.textContent = "Add a class";
        bb.onclick = () => openForm(null, { day, a: 15, b: 16 }); e.appendChild(bb); card.appendChild(e);
      }
      items.forEach((it) => {
        const r = el("div", "ve-arow" + (hasClash(it) ? " clash" : "")); r.style.setProperty("--c", colorFor(it.gi)); r.tabIndex = 0;
        r.innerHTML = `<i></i><div class="ve-amid"><div class="ve-an">${veEsc(nameOf(it.gi))}</div><div class="ve-at">${fmt(it.a)} – ${fmt(it.b)}</div></div><div class="ve-ah">${fmtHrs(it.b - it.a)}</div>`;
        r.onclick = () => openForm(it); r.onkeydown = (e) => { if (e.key === "Enter") openForm(it); };
        card.appendChild(r);
      });
      wrap.appendChild(card);
    });
    const tot = el("div", "ve-aday ve-atotals"); tot.appendChild(el("h4", null, "Weekly hours by group"));
    const map = new Map();
    veItems.forEach((i) => { const t = map.get(i.gi) || { h: 0, n: 0 }; t.h += Math.max(0, i.b - i.a); t.n++; map.set(i.gi, t); });
    let all = 0, rowsH = "";
    [...map].sort((a, b) => b[1].h - a[1].h).forEach(([gi, t]) => { all += t.h; rowsH += `<tr><td><i style="background:${colorFor(gi)}"></i>${veEsc(nameOf(gi))}</td><td>${t.n}</td><td>${fmtHrs(t.h)}</td></tr>`; });
    tot.appendChild(el("table", "ve-attable", `<tr><th>Group</th><th>Sessions</th><th>Hours</th></tr>${rowsH || '<tr><td colspan="3" class="ve-muted">No classes yet</td></tr>'}<tr class="tot"><td>Total</td><td></td><td>${fmtHrs(all)}</td></tr>`));
    wrap.appendChild(tot);
    body.appendChild(wrap);
  }

  /* ---- dispatcher ---- */
  function render() {
    const body = document.getElementById("veBody"), head = document.getElementById("veHead");
    if (!body || !head) return;
    body.className = "ve-body" + (veView === "agenda" ? " ve-body-plain" : (veSwap && veView === "week") || veView === "compact" ? " ve-body-h" : "");
    body.style.removeProperty("--ve-h"); body.innerHTML = "";
    head.className = "ve-head"; head.innerHTML = ""; head.style.display = (veView === "agenda") ? "none" : "";

    document.querySelectorAll("#veViewSeg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === veView));
    const sw = document.getElementById("veSwapBtn"); if (sw) { sw.style.display = veView === "week" ? "" : "none"; sw.classList.toggle("on", veSwap); }
    const winBar = document.getElementById("veWinWrap"); if (winBar) winBar.style.display = veView === "agenda" ? "none" : "";

    if (veView === "week") (veSwap ? renderHorizontal : renderVertical)(head, body);
    else if (veView === "compact") renderHorizontal(head, body, { compact: true });
    else if (veView === "day") renderDay(head, body);
    else renderAgenda(head, body);

    fillWindowSelects(); renderLegend(); renderClashSummary(); savePrefs();
  }

  function setView(v) { veView = v; render(); }

  function renderLegend() {
    const lg = document.getElementById("veLegend"); if (!lg) return;
    const hrs = new Map();
    veItems.forEach((it) => hrs.set(it.gi, (hrs.get(it.gi) || 0) + Math.max(0, it.b - it.a)));
    const order = [...hrs.keys()].sort((a, b) => a - b);
    lg.innerHTML = order.map((gi) => `<span class="ve-lg"><i style="background:${colorFor(gi)}"></i>${veEsc(nameOf(gi))}<b class="ve-lh">${fmtHrs(hrs.get(gi))}</b></span>`).join("")
      || '<span class="ve-muted">No classes yet — click a slot to add one.</span>';
    const tot = document.getElementById("veTotal");
    if (tot) { const total = [...hrs.values()].reduce((s, v) => s + v, 0); tot.textContent = veItems.length ? `${veItems.length} class${veItems.length === 1 ? "" : "es"} · ${fmtHrs(total)}/week` : ""; }
  }
  function fmtHrs(h) { const r = Math.round(h * 10) / 10; return (Number.isInteger(r) ? r : r.toFixed(1)) + "h"; }
  function renderClashSummary() {
    const e2 = document.getElementById("veClash"); if (!e2) return;
    const pairs = [];
    for (let i = 0; i < veItems.length; i++) for (let j = i + 1; j < veItems.length; j++) if (clashing(veItems[i], veItems[j])) pairs.push([veItems[i], veItems[j]]);
    if (!pairs.length) { e2.className = "ve-clash ok"; e2.textContent = "✓ No time clashes"; return; }
    e2.className = "ve-clash warn";
    e2.textContent = `⚠ ${pairs.length} clash${pairs.length === 1 ? "" : "es"} — ` +
      pairs.slice(0, 3).map(([a, b]) => `${a.day.slice(0, 3)} ${nameOf(a.gi)}↔${nameOf(b.gi)}`).join(", ") + (pairs.length > 3 ? "…" : "");
  }

  /* ---- geometry: pointer → (day, hour) for the current view ---- */
  function canvasRect() { const c = document.getElementById("veCanvas"); return c ? c.getBoundingClientRect() : null; }
  function evDay(e) {
    const r = canvasRect(); if (!r) return null;
    if (GEO.mode === "day") return days()[veDayIdx];
    if (GEO.mode === "hgrid") { const y = e.clientY - r.top; let idx = 0; for (let i = 0; i < _rowTops.length; i++) if (y >= _rowTops[i]) idx = i; return _rowDays[idx]; }
    const colW = r.width / 7; return days()[Math.max(0, Math.min(6, Math.floor((e.clientX - r.left) / colW)))];
  }
  function evHour(e) {
    const r = canvasRect(); if (!r) return veStart;
    if (GEO.mode === "hgrid") { const span = veEnd - veStart; return snap(veStart + (e.clientX - r.left) / (r.width / span)); }
    return snap(veStart + (e.clientY - r.top) / HOUR_PX);
  }

  /* ---- drag / resize existing block ---- */
  function onDown(e, bEl, it) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const hnd = e.target.closest(".ve-hnd");
    const mode = hnd ? (hnd.classList.contains("n") ? "t0" : "t1") : "move";
    drag = { it, bEl, mode, grabH: evHour(e) - it.a, a0: it.a, b0: it.b, x0: e.clientX, y0: e.clientY, pre: snapshot() };
    movedFlag = false;
    bEl.classList.add("dragging"); bEl.setPointerCapture?.(e.pointerId);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }
  function onMove(e) {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) movedFlag = true;
    const it = drag.it, len = drag.b0 - drag.a0;
    if (drag.mode === "move") {
      let a = snap(evHour(e) - drag.grabH);
      a = Math.max(veStart, Math.min(veEnd - len, a));
      it.a = a; it.b = a + len;
      const d = evDay(e); if (d) it.day = d;
    } else if (drag.mode === "t0") {
      it.a = Math.max(veStart, Math.min(it.b - MIN_LEN, evHour(e)));
    } else {
      it.b = Math.min(veEnd, Math.max(it.a + MIN_LEN, evHour(e)));
    }
    render();
    drag.bEl = document.querySelector(".ve-block.dragging");
  }
  function onUp() {
    if (!drag) return;
    const it = drag.it;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    const dup = veItems.find((o) => o !== it && o.gi === it.gi && o.day === it.day);
    if (dup) { it.a = drag.a0; it.b = drag.b0; veToast("That group already has a class that day"); }
    const pre = drag.pre; drag = null;
    if (!movedFlag) { openForm(it); return; }
    undoStack.push(pre); if (undoStack.length > 40) undoStack.shift(); refreshUndo();
    render();
  }

  /* ---- click empty space → add ---- */
  function onEmptyDown(e) {
    if (e.button !== 0 || e.target.closest(".ve-block")) return;
    const day = evDay(e); if (!day) return;
    const a = Math.max(veStart, Math.min(veEnd - 1, evHour(e)));
    openForm(null, { day, a, b: Math.min(veEnd, a + 1) });
  }

  /* ---- add / edit form ---- */
  function openForm(it, preset) {
    const dlg = document.getElementById("veForm"); if (!dlg) return;
    const editing = !!it;
    const v = it || { gi: firstFreeGroup(preset ? preset.day : null), day: preset.day, a: preset.a, b: preset.b };
    dlg.dataset.editing = editing ? "1" : "0";
    dlg._it = it || null; dlg._preset = v;
    const gsel = document.getElementById("veGroup");
    gsel.innerHTML = (groups || []).map((g, gi) => `<option value="${gi}">${veEsc(nameOf(gi) || "Group " + (gi + 1))}</option>`).join("");
    gsel.value = String(v.gi);
    const dsel = document.getElementById("veDay");
    dsel.innerHTML = days().map((d) => `<option>${d}</option>`).join("");
    dsel.value = v.day;
    document.getElementById("veFrom").value = fmt(v.a);
    document.getElementById("veTo").value = fmt(v.b);
    const sw = document.getElementById("veSwatches");
    sw.innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("");
    markSwatch(colorFor(+gsel.value));
    sw.onclick = (ev) => { const c = ev.target.dataset.c; if (c) markSwatch(c); };
    gsel.onchange = () => markSwatch(colorFor(+gsel.value));
    document.getElementById("veDelete").style.display = editing ? "" : "none";
    document.getElementById("veErr").textContent = "";
    dlg.showModal ? dlg.showModal() : (dlg.open = true);
  }
  function markSwatch(c) { document.querySelectorAll("#veSwatches button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.c === c)); }
  function firstFreeGroup(day) {
    if (!day) return 0;
    for (let gi = 0; gi < (groups || []).length; gi++) if (!veItems.some((o) => o.gi === gi && o.day === day)) return gi;
    return 0;
  }
  function saveForm(e) {
    e && e.preventDefault();
    const dlg = document.getElementById("veForm");
    const gi = +document.getElementById("veGroup").value;
    const day = document.getElementById("veDay").value;
    const a = toH(document.getElementById("veFrom").value);
    let b = toH(document.getElementById("veTo").value);
    const err = (m) => { document.getElementById("veErr").textContent = m; };
    if (a == null) return err("Enter a valid start time (e.g. 3:00pm).");
    if (b == null || b <= a) b = a + 1;
    const editing = dlg._it;
    if (veItems.some((o) => o !== editing && o.gi === gi && o.day === day)) return err(nameOf(gi) + " already has a class on " + day + ".");
    pushUndo();
    const chosen = document.querySelector('#veSwatches button[aria-pressed="true"]');
    if (chosen) setColor(gi, chosen.dataset.c);
    if (editing) { editing.gi = gi; editing.day = day; editing.a = a; editing.b = b; }
    else veItems.push({ gi, day, a, b });
    closeForm(); render();
  }
  function deleteForm() {
    const dlg = document.getElementById("veForm");
    if (dlg._it) { pushUndo(); veItems = veItems.filter((o) => o !== dlg._it); }
    closeForm(); render();
  }
  function closeForm() { const d = document.getElementById("veForm"); d.close ? d.close() : (d.open = false); }

  /* ---- commit back to groups ---- */
  async function veSave() {
    const DG = days();
    (groups || []).forEach((g, gi) => {
      g.schedule = veItems.filter((i) => i.gi === gi)
        .sort((x, y) => DG.indexOf(x.day) - DG.indexOf(y.day))
        .map((i) => ({ day: i.day, from: fmt(i.a), to: fmt(i.b) }));
    });
    if (typeof tableDirty !== "undefined") tableDirty = true;
    if (typeof saveTable === "function") { const ok = await saveTable(); if (!ok) return; }
    if (typeof renderTable === "function") renderTable();
    closeEditor();
  }

  /* ---- open / close overlay ---- */
  function openEditor() {
    if (typeof groups === "undefined" || !groups || !groups.length) { veToast("Add a group first"); return; }
    veItems = buildItems();
    winAuto = true; undoStack.length = 0; veDayIdx = todayIdx();
    loadPrefs();
    [veStart, veEnd] = computeWindow();
    let ov = document.getElementById("veOverlay");
    if (!ov) { ov = buildOverlay(); document.body.appendChild(ov); }
    ov.classList.add("open"); document.body.classList.add("ve-lock");
    render();
    document.addEventListener("keydown", onKey);
  }
  function closeEditor() {
    const ov = document.getElementById("veOverlay"); if (ov) ov.classList.remove("open");
    document.body.classList.remove("ve-lock");
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") { const f = document.getElementById("veForm"); if (f && f.open) { closeForm(); return; } closeEditor(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      const f = document.getElementById("veForm");
      if (f && f.open) return;
      if (/^(input|select|textarea)$/i.test(e.target.tagName)) return;
      e.preventDefault(); veUndo();
    }
  }

  function buildOverlay() {
    const ov = el("div"); ov.id = "veOverlay"; ov.className = "ve-overlay";
    ov.innerHTML = `
      <div class="ve-panel">
        <header class="ve-top">
          <div class="ve-ttl"><b>Visual Editor</b><span>drag to move · drag an edge to resize · click a slot to add</span></div>
          <div class="ve-clash ok" id="veClash"></div>
          <div class="ve-actions">
            <button class="btn btn-ghost btn-sm" type="button" id="veUndoBtn" title="Undo (Ctrl+Z)" disabled>↶ Undo</button>
            <button class="btn btn-ghost btn-sm" type="button" id="vePrintBtn" title="Print timetable">Print</button>
            <button class="btn btn-ghost btn-sm" type="button" id="veCloseBtn">Close</button>
            <button class="btn btn-primary btn-sm" type="button" id="veSaveBtn">Save &amp; apply</button>
          </div>
        </header>
        <div class="ve-tools">
          <div class="ve-viewseg" id="veViewSeg">
            <button type="button" data-v="week">Week</button>
            <button type="button" data-v="compact">Compact</button>
            <button type="button" data-v="day">Day</button>
            <button type="button" data-v="agenda">Agenda</button>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" id="veSwapBtn" title="Swap the day and time axes">⇄ Swap axes</button>
          <span class="ve-win-wrap" id="veWinWrap">
            <label class="ve-win">Day starts<select id="veWinStart"></select></label>
            <label class="ve-win">Day ends<select id="veWinEnd"></select></label>
            <button class="btn btn-ghost btn-sm" type="button" id="veWinAuto" title="Fit the window to your classes">Auto-fit</button>
          </span>
          <span class="ve-spacer"></span>
          <span class="ve-total" id="veTotal"></span>
        </div>
        <div class="ve-head" id="veHead"></div>
        <div class="ve-scroll"><div class="ve-body" id="veBody"></div></div>
        <div class="ve-foot"><div class="ve-legend" id="veLegend"></div></div>
      </div>
      <dialog class="ve-dlg" id="veForm">
        <form method="dialog" id="veFormEl">
          <h3>Class</h3>
          <label class="ve-f">Group<select id="veGroup"></select></label>
          <label class="ve-f">Day<select id="veDay"></select></label>
          <div class="ve-f2">
            <label class="ve-f">From<input id="veFrom" list="timeOptions" placeholder="3:00pm"></label>
            <label class="ve-f">To<input id="veTo" list="timeOptions" placeholder="4:30pm"></label>
          </div>
          <div class="ve-f">Colour<div class="ve-swatches" id="veSwatches"></div></div>
          <p class="ve-err" id="veErr"></p>
          <div class="ve-dlg-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="veDelete" style="margin-right:auto;color:var(--danger)">Delete</button>
            <button type="button" class="btn btn-ghost btn-sm" id="veCancel">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save</button>
          </div>
        </form>
      </dialog>`;
    ov.addEventListener("click", (e) => { if (e.target === ov) closeEditor(); });
    ov.querySelector("#veCloseBtn").onclick = closeEditor;
    ov.querySelector("#veSaveBtn").onclick = veSave;
    ov.querySelector("#veUndoBtn").onclick = veUndo;
    ov.querySelector("#vePrintBtn").onclick = vePrint;
    ov.querySelectorAll("#veViewSeg button").forEach((b) => (b.onclick = () => setView(b.dataset.v)));
    ov.querySelector("#veSwapBtn").onclick = () => { veSwap = !veSwap; render(); };
    ov.querySelector("#veWinAuto").onclick = () => { winAuto = true; [veStart, veEnd] = computeWindow(); render(); };
    ov.querySelector("#veWinStart").onchange = (e) => setWindow(+e.target.value, null);
    ov.querySelector("#veWinEnd").onchange = (e) => setWindow(null, +e.target.value);
    ov.querySelector("#veFormEl").addEventListener("submit", saveForm);
    ov.querySelector("#veCancel").onclick = closeForm;
    ov.querySelector("#veDelete").onclick = deleteForm;
    window.addEventListener("resize", () => { if (ov.classList.contains("open")) render(); });
    return ov;
  }

  function veToast(m) { if (typeof toast === "function") toast(m, "err"); }

  /* ---- self-check ---- */
  function selfCheck() {
    console.assert(fmt(15) === "3:00pm", "fmt 15");
    console.assert(fmt(16.5) === "4:30pm", "fmt 16.5");
    console.assert(fmt(0) === "12:00am", "fmt 0");
    console.assert(Math.abs(snap(9.1) - 9) < 1e-9 && Math.abs(snap(9.2) - 9.25) < 1e-9, "snap");
    console.assert(overlaps({ day: "Monday", a: 15, b: 16 }, { day: "Monday", a: 15.5, b: 17 }), "overlap");
    console.assert(!overlaps({ day: "Monday", a: 15, b: 16 }, { day: "Tuesday", a: 15, b: 16 }), "no overlap cross-day");
  }
  try { selfCheck(); } catch (e) {}

  window.openVisualEditor = openEditor;
})();
