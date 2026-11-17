/* Schedule-editing helpers for the Scheduler table/board and the group editor.
   Uses the inline script's globals: groups, DAYS, parseTimeMin, updateCell, saveTable,
   gdWorking, gdSetCell, renderGroupDetail. */

/* ── time helpers ── */
function fmtMin(m) {
  m = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
/* A group's usual class length in minutes (its most common from→to gap), or null when
   none of its days has an end time — such groups are left as start-time-only. */
function usualLength(g) {
  const count = {};
  (g.schedule || []).forEach((e) => {
    const a = parseTimeMin(e.from), b = parseTimeMin(e.to);
    if (a != null && b != null && b > a) count[b - a] = (count[b - a] || 0) + 1;
  });
  const top = Object.entries(count).sort((x, y) => y[1] - x[1])[0];
  return top ? +top[0] : null;
}
/* End time to suggest for a just-entered start time, or "" when there is nothing to go on. */
function suggestEnd(g, from) {
  const a = parseTimeMin(from), len = usualLength(g);
  return a != null && len != null && /[ap]m$/i.test(from.trim()) ? fmtMin(a + len) : "";
}

/* ── unsaved changes in the Scheduler ── */
let schedUnsaved = false;
function markUnsaved(v = true) {
  schedUnsaved = v;
  document.getElementById("schedSaveBtn")?.classList.toggle("has-dot", v);
}
addEventListener("beforeunload", (e) => { if (schedUnsaved) e.preventDefault(); });
addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" &&
      document.getElementById("view-table")?.classList.contains("active") && !document.querySelector("dialog:modal")) {
    e.preventDefault(); saveTable();
  }
});

/* ── grid: keyboard navigation, copy-down, auto end time (table and board share data-cell) ── */
(function () {
  const tw = document.getElementById("tableWrap"); if (!tw) return;
  const inputs = (ci, day) => tw.querySelectorAll(`[data-cell="${ci}|${day}"] input.cell`);
  const where = (inp) => { const [ci, day] = inp.closest("[data-cell]").dataset.cell.split("|"); return { ci: +ci, day, di: DAYS.indexOf(day) }; };
  function setCell(ci, day, from, to) {
    const [f, t] = inputs(ci, day);
    if (!f || f.disabled) return false;
    f.value = from; updateCell(ci, day, "from", f);
    t.value = to; updateCell(ci, day, "to", t);
    return true;
  }
  tw.addEventListener("change", (e) => {
    const inp = e.target; if (!inp.matches("input.cell")) return;
    const { ci, day } = where(inp), [f, t] = inputs(ci, day);
    if (inp !== f || t.value.trim()) return;
    const end = suggestEnd(groups[ci], f.value);
    if (end) { t.value = end; updateCell(ci, day, "to", t); }
  });
  tw.addEventListener("keydown", (e) => {
    const inp = e.target; if (!inp.matches || !inp.matches("input.cell")) return;
    const { ci, day, di } = where(inp), which = [...inputs(ci, day)].indexOf(inp);
    const go = (c, d) => { const to = DAYS[d] && inputs(c, DAYS[d])[which]; if (to && !to.disabled) { e.preventDefault(); to.focus(); to.select(); } };
    if (e.key === "Enter") go(ci, di + (e.shiftKey ? -1 : 1));
    else if (!e.ctrlKey && !e.metaKey) return;
    else if (e.key === "ArrowRight") go(ci + 1, di);
    else if (e.key === "ArrowLeft") go(ci - 1, di);
    else if (e.key === "ArrowDown") go(ci, di + 1);
    else if (e.key === "ArrowUp") go(ci, di - 1);
    else if (e.key.toLowerCase() === "d") {           // copy this day's times to the next day
      e.preventDefault();
      const [f, t] = inputs(ci, day);
      if (DAYS[di + 1] && setCell(ci, DAYS[di + 1], f.value, t.value)) go(ci, di + 1);
    } else if (e.key === "Delete") { e.preventDefault(); setCell(ci, day, "", ""); }
  });
})();

/* Scroll to a clashing pair and flash both cells. */
function focusClash(a, b, day) {
  const cells = [a, b].map((ci) => document.querySelector(`#tableWrap [data-cell="${ci}|${day}"]`)).filter(Boolean);
  if (!cells.length) return;
  cells[0].scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  cells.forEach((c) => { c.classList.remove("cell-flash"); void c.offsetWidth; c.classList.add("cell-flash"); });
}

/* ── clashes: find the nearest free time ── */
/* Nearest time at which group gi's class on `day` clashes with no other group, keeping its
   length. Tries the same day first (7am–10pm, 15-minute steps, closest first), then the
   same time on the nearest other day the group has no class. Returns {gi, day, from, to,
   cost} or null. A class with no end time is treated as 30 minutes, as the clash check does. */
function findFreeSlot(gi, day) {
  const g = groups[gi], e = (g.schedule || []).find((x) => x.day === day);
  const a = e && parseTimeMin(e.from);
  if (a == null) return null;
  const b = parseTimeMin(e.to), hasEnd = b != null && b > a, len = hasEnd ? b - a : 30;
  const busy = (d) => groups.flatMap((o, oi) => (oi === gi ? [] : (o.schedule || []).filter((x) => x.day === d)).map((x) => {
    const s = parseTimeMin(x.from); let t = parseTimeMin(x.to);
    if (s == null) return null; if (t == null || t <= s) t = s + 30; return [s, t];
  }).filter(Boolean));
  const free = (d, s) => s >= 7 * 60 && s + len <= 22 * 60 && busy(d).every(([p, q]) => s + len <= p || s >= q);
  const slot = (d, s, cost) => ({ gi, day: d, from: fmtMin(s), to: hasEnd ? fmtMin(s + len) : "", cost });
  for (let k = 15; k <= 15 * 60; k += 15) for (const s of [a + k, a - k]) if (free(day, s)) return slot(day, s, k);
  const di = DAYS.indexOf(day);
  for (let k = 1; k < 7; k++) {
    for (const d of [DAYS[(di + k) % 7], DAYS[(di - k + 7) % 7]]) {
      if (!(g.schedule || []).some((x) => x.day === d) && free(d, a)) return slot(d, a, 10000 + k);
    }
  }
  return null;
}
/* Offer to move whichever of the two clashing classes needs the smaller move. */
async function resolveClash(a, b, day) {
  const best = [findFreeSlot(a, day), findFreeSlot(b, day)].filter(Boolean).sort((x, y) => x.cost - y.cost)[0];
  if (!best) { toast("No free time found that day, or at the same time on another day", "err"); return; }
  const g = groups[best.gi], cur = g.schedule.find((x) => x.day === day);
  const span = (f, t) => f + (t ? "–" + t : "");
  const where = best.day === day ? `to ${span(best.from, best.to)}` : `to ${best.day}, same time`;
  if (!(await confirmDialog(`Move ${colDisplay(g)} on ${day} (${span(cur.from, cur.to)}) ${where}?\n\nIt is the nearest time that clashes with no other class. Save afterwards to keep it.`, { ok: "Move it" }))) return;
  const before = g.schedule.map((x) => ({ ...x }));
  g.schedule = g.schedule.filter((x) => x.day !== day).concat({ day: best.day, from: best.from, to: best.to })
    .sort((x, y) => DAYS.indexOf(x.day) - DAYS.indexOf(y.day));
  tableDirty = true; markUnsaved(); renderTable(); focusClash(best.gi, best.gi, best.day);
  toast(`Moved ${colDisplay(g)} — save to keep it`, "ok", { label: "Undo", fn: () => { g.schedule = before; tableDirty = true; renderTable(); } });
}

/* ── comparing two schedules (used by Schedule history and the assistant's proposals) ── */
/* What changes going from `before` to `after`. Groups are matched by id, then by name. */
function diffSchedules(before, after) {
  const rows = [], used = new Set();
  const slot = (g, day) => { const e = (g.schedule || []).find((x) => x.day === day && (x.from || "").trim()); return e ? e.from + (e.to ? "–" + e.to : "") : ""; };
  after.forEach((b) => {
    const a = before.find((x) => !used.has(x) && b.id != null && x.id === b.id) || before.find((x) => !used.has(x) && x.name === b.name);
    if (!a) rows.push({ group: b.name, note: "new group" });
    else { used.add(a); if (a.name !== b.name) rows.push({ group: b.name, note: `renamed from ${a.name}` }); }
    DAYS.forEach((day) => { const x = a ? slot(a, day) : "", y = slot(b, day); if (x !== y) rows.push({ group: b.name, day, from: x, to: y }); });
  });
  before.forEach((a) => { if (!used.has(a)) rows.push({ group: a.name, note: "removed" }); });
  return rows;
}
function diffHTML(rows) {
  if (!rows.length) return '<p class="hint" style="margin:0">No differences.</p>';
  const side = (tag, v) => `<${tag}${v ? "" : ' class="none"'}>${v ? esc(v) : "no class"}</${tag}>`;
  return rows.map((r) => `<div class="diff-row"><b>${esc(r.group)}</b>${r.note
    ? `<span class="diff-note">${esc(r.note)}</span>`
    : `<span class="diff-day">${r.day.slice(0, 3)}</span>${side("del", r.from)}<span aria-hidden="true">→</span>${side("ins", r.to)}`}</div>`).join("");
}

/* ── schedule history: the server saves a version before every change ── */
async function openVersions() {
  openModal("versionsModal");
  const box = document.getElementById("versionsList"); box.innerHTML = skel("rows", 4);
  let list = [];
  try { list = await (await fetch("/api/schedule/versions")).json(); } catch {}
  if (!Array.isArray(list) || !list.length) { box.innerHTML = '<div class="empty"><p>No earlier versions yet. One is saved automatically before every change.</p></div>'; return; }
  box.innerHTML = list.map((v) => {
    const rows = diffSchedules(groups, v.groups);   // what restoring this version would change
    const when = new Date(v.at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    return `<details class="ver"><summary><span class="ver-when"><b>${esc(when)}</b><span>Before ${esc(v.reason || "a change")}</span></span>
      <span class="chip">${rows.length ? `${rows.length} difference${rows.length === 1 ? "" : "s"}` : "same as now"}</span>
      <button class="btn btn-soft btn-sm" type="button" ${rows.length ? "" : "disabled"} onclick="event.preventDefault();restoreVersion(${v.id})">Restore</button></summary>
      <div class="ver-diff">${diffHTML(rows)}</div></details>`;
  }).join("");
}
async function restoreVersion(id) {
  const res = await fetch(`/api/schedule/versions/${id}/restore`, { method: "POST" });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) { toast(d.error || "Restore failed", "err"); return false; }
  closeModal("versionsModal"); await loadGroups(); toast("Schedule restored ✓", "ok");
  return true;
}

/* ── group editor (detail view, edit mode) ── */
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
/* Copy the first filled day's times onto the given days. */
function gdCopyFirst(days) {
  const src = (gdWorking.schedule || []).find((e) => (e.from || "").trim());
  if (!src) { toast("Fill in one day first", "err"); return; }
  const rest = gdWorking.schedule.filter((e) => !days.includes(e.day));
  gdWorking.schedule = rest.concat(days.map((day) => ({ day, from: src.from, to: src.to })))
    .sort((x, y) => DAYS.indexOf(x.day) - DAYS.indexOf(y.day));
  gdDirty = true; renderGroupDetail();
}
/* Set every filled day's end time to start + minutes. */
function gdSetLength(minutes) {
  let n = 0;
  (gdWorking.schedule || []).forEach((e) => { const a = parseTimeMin(e.from); if (a != null) { e.to = fmtMin(a + minutes); n++; } });
  if (!n) { toast("Fill in a start time first", "err"); return; }
  gdDirty = true; renderGroupDetail();
}
function gdAutoTo(day, fromInput) {
  const to = fromInput.parentElement.querySelectorAll("input")[1];
  if (!to || to.value.trim()) return;
  const end = suggestEnd(gdWorking, fromInput.value);
  if (end) { to.value = end; gdSetCell(day, "to", end); }
}
function gdInsertToken(tok) {
  const ta = document.getElementById("gdMsg"); if (!ta) return;
  ta.setRangeText(tok, ta.selectionStart, ta.selectionEnd, "end");
  ta.focus(); gdSetField("message", ta.value);
}
function gdAutoMessage() { gdSetField("message", ""); }
/* Offer the user's real WhatsApp group names in the name field (native datalist picker). */
async function gdLoadWaNames() {
  const dl = document.getElementById("waGroupNames"); if (!dl || dl.dataset.loaded) return;
  dl.dataset.loaded = "1";
  try {
    const d = await (await fetch("/api/whatsapp/groups")).json();
    if (d.error) throw 0;
    dl.innerHTML = (d.groups || []).map((g) => `<option value="${escA(g.name)}"></option>`).join("");
  } catch { delete dl.dataset.loaded; }
}
async function gdConfirmDiscard() {
  return !(gdEdit && gdDirty) || confirmDialog("Discard your unsaved changes to this group?", { ok: "Discard", danger: true });
}
async function gdBack() { if (await gdConfirmDiscard()) backToGroups(); }
async function gdCancel() { if (await gdConfirmDiscard()) { gdDirty = false; gdToggleEdit(); } }
