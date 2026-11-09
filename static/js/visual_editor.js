/* ─────────────────────────────────────────────────────────────────────────
   Visual Editor — a drag/resize weekly timetable wired to the live `groups`.
   Data model: one {day, from, to} entry per (group, day); times are strings
   parsed with the app's parseTimeMin and written back via saveTable().
   The editor works on a snapshot (veItems) so Close discards; Save commits.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  // Ordered so consecutive groups get contrasting hues (no two blues/greens adjacent).
  const COLORS = ["#3B5BDB", "#E8890C", "#0F9F74", "#D6336C", "#7048E8", "#2F9E44",
    "#1098AD", "#C92A2A", "#D9A400", "#1C7ED6", "#F76707", "#5C7CFA"];
  const HOUR_PX = 56;          // vertical pixels per hour
  const SNAP = 0.25;           // 15-minute grid
  const MIN_LEN = 0.25;        // shortest class
  let veItems = [];            // [{gi, day, a, b}]  a/b in hours
  let veStart = 8, veEnd = 22; // visible window (hours)
  let winAuto = true;          // window follows the data until the user sets it
  let drag = null, movedFlag = false;
  const undoStack = [];        // snapshots of veItems for Ctrl+Z / Undo button

  function snapshot() { return veItems.map((i) => ({ ...i })); }
  function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 40) undoStack.shift(); refreshUndo(); }
  function veUndo() { if (!undoStack.length) return; veItems = undoStack.pop(); render(); refreshUndo(); }
  function refreshUndo() { const b = document.getElementById("veUndoBtn"); if (b) b.disabled = !undoStack.length; }

  /* ---- colour per group (deterministic, with a per-browser override) ---- */
  function veColors() { try { return JSON.parse(localStorage.getItem("ve-colors") || "{}"); } catch (e) { return {}; } }
  function colorFor(gi) {
    const g = groups[gi]; if (!g) return COLORS[0];
    const ov = veColors(); if (ov[g.name]) return ov[g.name];
    // Assign by position so adjacent groups never collide (the old hash did).
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
  // red "now" line on today's column when the current time is inside the window
  function nowMarker() {
    const DAYS_ = (typeof DAYS !== "undefined") ? DAYS : [];
    const now = new Date(), di = DAYS_.indexOf(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()]);
    const h = now.getHours() + now.getMinutes() / 60;
    if (di < 0 || h < veStart || h > veEnd) return null;
    return { di, top: (h - veStart) * HOUR_PX };
  }
  // overlap of two items on the same day
  const overlaps = (x, y) => x.day === y.day && x.a < y.b && y.a < x.b;
  // a clash the user marked acceptable (shared with the Table view) doesn't warn
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

  /* ---- render ---- */
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function render() {
    const body = document.getElementById("veBody"); if (!body) return;
    const span = veEnd - veStart;
    body.style.setProperty("--ve-h", (span * HOUR_PX) + "px");
    body.innerHTML = "";

    // time gutter
    const gutter = el("div", "ve-gutter");
    for (let h = veStart; h <= veEnd; h++) {
      const lab = el("div", "ve-tl", (h % 12 || 12) + (h < 12 ? "am" : "pm"));
      lab.style.top = ((h - veStart) * HOUR_PX) + "px";
      gutter.appendChild(lab);
    }
    body.appendChild(gutter);

    // columns region
    const cols = el("div", "ve-cols"); cols.id = "veCols";
    // hour grid lines
    for (let h = veStart; h <= veEnd; h++) {
      const line = el("div", "ve-hline" + (h % 1 ? "" : " hr"));
      line.style.top = ((h - veStart) * HOUR_PX) + "px";
      cols.appendChild(line);
    }
    // day columns (background + headers handled separately)
    const DAYS_ = (typeof DAYS !== "undefined") ? DAYS : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    for (let d = 0; d < 7; d++) {
      const col = el("div", "ve-col"); col.style.left = (d / 7 * 100) + "%"; col.style.width = (100 / 7) + "%";
      col.dataset.dayi = d;
      cols.appendChild(col);
    }
    // blocks
    DAYS_.forEach((day) => {
      layout(day).forEach((it) => {
        const di = DAYS_.indexOf(day);
        const b = el("div", "ve-block" + (hasClash(it) ? " clash" : ""));
        const laneW = (100 / 7) / it._lanes;
        b.style.left = (di / 7 * 100 + it._lane * laneW) + "%";
        b.style.width = "calc(" + laneW + "% - 3px)";
        b.style.top = ((it.a - veStart) * HOUR_PX) + "px";
        b.style.height = Math.max(16, (it.b - it.a) * HOUR_PX - 2) + "px";
        b.style.setProperty("--c", colorFor(it.gi));
        const g = groups[it.gi];
        const nm = (typeof colDisplay === "function" ? colDisplay(g) : (g && (g.nickname || g.name))) || "—";
        b.innerHTML = `<div class="ve-hnd n"></div><div class="ve-bin"><b>${veEsc(nm)}</b><span>${fmt(it.a)} – ${fmt(it.b)}</span></div><div class="ve-hnd s"></div>`;
        b._it = it;
        b.addEventListener("pointerdown", (e) => onDown(e, b, it));
        cols.appendChild(b);
      });
    });
    // "now" line over today's column
    const nm = nowMarker();
    if (nm) {
      const line = el("div", "ve-now");
      line.style.top = nm.top + "px";
      line.style.left = (nm.di / 7 * 100) + "%";
      line.style.width = (100 / 7) + "%";
      cols.appendChild(line);
    }
    cols.addEventListener("pointerdown", onEmptyDown);
    body.appendChild(cols);
    fillWindowSelects();
    renderLegend();
    renderClashSummary();
  }

  function veEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function renderLegend() {
    const lg = document.getElementById("veLegend"); if (!lg) return;
    const hrs = new Map();                 // gi -> total hours
    veItems.forEach((it) => hrs.set(it.gi, (hrs.get(it.gi) || 0) + Math.max(0, it.b - it.a)));
    const order = [...hrs.keys()].sort((a, b) => a - b);
    lg.innerHTML = order.map((gi) => {
      const g = groups[gi]; const nm = (typeof colDisplay === "function" ? colDisplay(g) : (g.nickname || g.name)) || "—";
      return `<span class="ve-lg"><i style="background:${colorFor(gi)}"></i>${veEsc(nm)}<b class="ve-lh">${fmtHrs(hrs.get(gi))}</b></span>`;
    }).join("") || '<span class="ve-muted">No classes yet — click a slot to add one.</span>';
    const tot = document.getElementById("veTotal");
    if (tot) {
      const total = [...hrs.values()].reduce((s, v) => s + v, 0);
      tot.textContent = veItems.length ? `${veItems.length} class${veItems.length === 1 ? "" : "es"} · ${fmtHrs(total)}/week` : "";
    }
  }
  function fmtHrs(h) { const r = Math.round(h * 10) / 10; return (Number.isInteger(r) ? r : r.toFixed(1)) + "h"; }
  function renderClashSummary() {
    const el2 = document.getElementById("veClash"); if (!el2) return;
    const pairs = [];
    for (let i = 0; i < veItems.length; i++) for (let j = i + 1; j < veItems.length; j++)
      if (clashing(veItems[i], veItems[j])) pairs.push([veItems[i], veItems[j]]);
    if (!pairs.length) { el2.className = "ve-clash ok"; el2.textContent = "✓ No time clashes"; return; }
    el2.className = "ve-clash warn";
    el2.textContent = `⚠ ${pairs.length} clash${pairs.length === 1 ? "" : "es"} — ` +
      pairs.slice(0, 3).map(([a, b]) => `${a.day.slice(0, 3)} ${short(a.gi)}↔${short(b.gi)}`).join(", ") + (pairs.length > 3 ? "…" : "");
  }
  function short(gi) { const g = groups[gi]; return (typeof colDisplay === "function" ? colDisplay(g) : (g.nickname || g.name)) || "—"; }

  /* ---- geometry ---- */
  function colsGeom() { const c = document.getElementById("veCols"); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, colW: r.width / 7 }; }
  function dayFromX(x) { const g = colsGeom(); return Math.max(0, Math.min(6, Math.floor((x - g.left) / g.colW))); }
  function hourFromY(y) { const g = colsGeom(); return snap(veStart + (y - g.top) / HOUR_PX); }

  /* ---- drag / resize existing block ---- */
  function onDown(e, bEl, it) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const hnd = e.target.closest(".ve-hnd");
    const mode = hnd ? (hnd.classList.contains("n") ? "t0" : "t1") : "move";
    drag = { it, bEl, mode, y0: e.clientY, x0: e.clientX, a0: it.a, b0: it.b, grabA: hourFromY(e.clientY) - it.a, pre: snapshot() };
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
      let a = snap(hourFromY(e.clientY) - drag.grabA);
      a = Math.max(veStart, Math.min(veEnd - len, a));
      it.a = a; it.b = a + len;
      it.day = (typeof DAYS !== "undefined" ? DAYS : [])[dayFromX(e.clientX)] || it.day;
    } else if (drag.mode === "t0") {
      it.a = Math.max(veStart, Math.min(it.b - MIN_LEN, snap(hourFromY(e.clientY))));
    } else {
      it.b = Math.min(veEnd, Math.max(it.a + MIN_LEN, snap(hourFromY(e.clientY))));
    }
    render();            // cheap re-render keeps lanes + clash + handles correct
    drag.bEl = document.querySelector(".ve-block.dragging"); // node was recreated
  }
  function onUp() {
    if (!drag) return;
    const it = drag.it;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    // one entry per (group, day): if another block of the same group lands on this day, bounce back
    const dup = veItems.find((o) => o !== it && o.gi === it.gi && o.day === it.day);
    if (dup) { it.a = drag.a0; it.b = drag.b0; veToast("That group already has a class that day"); }
    const pre = drag.pre; drag = null;
    if (!movedFlag) { openForm(it); return; }   // a click (no move) opens the editor
    undoStack.push(pre); if (undoStack.length > 40) undoStack.shift(); refreshUndo();
    render();
  }

  /* ---- click empty space → add ---- */
  function onEmptyDown(e) {
    if (e.button !== 0 || e.target.closest(".ve-block")) return;
    const day = (typeof DAYS !== "undefined" ? DAYS : [])[dayFromX(e.clientX)];
    const a = Math.max(veStart, Math.min(veEnd - 1, snap(hourFromY(e.clientY))));
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
    gsel.innerHTML = (groups || []).map((g, gi) => `<option value="${gi}">${veEsc((typeof colDisplay === "function" ? colDisplay(g) : (g.nickname || g.name)) || "Group " + (gi + 1))}</option>`).join("");
    gsel.value = String(v.gi);
    const dsel = document.getElementById("veDay");
    dsel.innerHTML = (typeof DAYS !== "undefined" ? DAYS : []).map((d) => `<option>${d}</option>`).join("");
    dsel.value = v.day;
    document.getElementById("veFrom").value = fmt(v.a);
    document.getElementById("veTo").value = fmt(v.b);
    const sw = document.getElementById("veSwatches");
    sw.innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("");
    const cur = colorFor(+gsel.value);
    markSwatch(cur);
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
    if (veItems.some((o) => o !== editing && o.gi === gi && o.day === day)) return err(short(gi) + " already has a class on " + day + ".");
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
    const DAYS_ = (typeof DAYS !== "undefined") ? DAYS : [];
    (groups || []).forEach((g, gi) => {
      g.schedule = veItems.filter((i) => i.gi === gi)
        .sort((x, y) => DAYS_.indexOf(x.day) - DAYS_.indexOf(y.day))
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
    winAuto = true; undoStack.length = 0;
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
    const DAYS_ = (typeof DAYS !== "undefined") ? DAYS : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
          <label class="ve-win">Day starts<select id="veWinStart"></select></label>
          <label class="ve-win">Day ends<select id="veWinEnd"></select></label>
          <button class="btn btn-ghost btn-sm" type="button" id="veWinAuto" title="Fit the window to your classes">Auto-fit</button>
          <span class="ve-spacer"></span>
          <span class="ve-total" id="veTotal"></span>
        </div>
        <div class="ve-head">
          <div class="ve-corner">Time</div>
          ${DAYS_.map((d, i) => `<div class="ve-dh"><span class="ve-dh-full">${d}</span><span class="ve-dh-short">${SHORT[i]}</span></div>`).join("")}
        </div>
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
