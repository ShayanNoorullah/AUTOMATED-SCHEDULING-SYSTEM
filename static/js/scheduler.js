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
      document.getElementById("view-table")?.classList.contains("active") && !document.querySelector("dialog[open]")) {
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
