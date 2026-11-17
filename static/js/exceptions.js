/* One-off changes — a class cancelled, moved or added for one date — and holidays.
   The weekly timetable is never edited; reminders, the dashboard's Today list and the
   calendar feed follow these. Server side: app/services/schedule_extras.py.
   Uses the inline script's globals: groups, post, openBroadcast, bcSync, dayKey (features.js). */
let schedExceptions = [];   // upcoming changes: {id, groupId (null = every group), groupName, date, kind, from, to, note}

async function loadExceptions() {
  try { const d = await (await fetch("/api/schedule/exceptions")).json(); schedExceptions = Array.isArray(d) ? d : []; }
  catch { schedExceptions = []; }
  renderExceptionStrip();
  if (typeof paintDashToday === "function") paintDashToday();
}

/* A group's class on a calendar date after one-off changes (mirrors effective_slot on the server).
   Returns {from, to, tag?, off?} — `off` set means the usual class is not happening — or null. */
function slotOn(g, dateKey) {
  const day = new Date(dateKey + "T00:00").toLocaleDateString("en-US", { weekday: "long" });
  const usual = (g.schedule || []).find((e) => e.day === day && (e.from || "").trim());
  const changes = schedExceptions.filter((x) => x.date === dateKey);
  if (changes.some((x) => x.groupId == null)) return usual ? { ...usual, off: "Day off" } : null;
  const mine = changes.filter((x) => x.groupId === g.id);
  if (mine.some((x) => x.kind === "cancel")) return usual ? { ...usual, off: "Cancelled" } : null;
  const moved = mine.find((x) => x.from);
  if (moved) return { from: moved.from, to: moved.to || "", tag: moved.kind === "extra" ? "Extra class" : "Moved" };
  return usual || null;
}

/* Add this week's one-off changes for group g to its automatic schedule message, e.g.
   "*Changes this week:*\n* Fri 20 Nov: class cancelled". Mirrors change_notes() on the
   server, which does the same for scheduled weekly sends. */
function withChangeNotes(g, text) {
  if (!text || !g || g.id == null) return text;
  const lines = [];
  for (let i = 0; i < 7; i++) {
    const key = dayKey(Date.now() + i * 864e5), s = slotOn(g, key);
    if (!s || !(s.off || s.tag)) continue;
    const d = new Date(key + "T00:00");
    const when = `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
    const time = s.from + (s.to ? " - " + s.to : "");
    lines.push(`* ${when}: ${s.off === "Day off" ? "no class (day off)" : s.off ? "class cancelled" : s.tag === "Extra class" ? "extra class " + time : "moved to " + time}`);
  }
  if (!lines.length) return text;
  const out = text.split("\n"), block = ["*Changes this week:*", ...lines];
  if (out[out.length - 1] === "*Kindly Acknowledge*") out.splice(out.length - 1, 0, ...block); else out.push(...block);
  return out.join("\n");
}

function exceptionLabel(x) {
  const d = new Date(x.date + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = x.from + (x.to ? "–" + x.to : "");
  if (x.groupId == null) return `${d} · Day off for every group`;
  return `${d} · ${x.groupName} ${x.kind === "cancel" ? "cancelled" : x.kind === "move" ? "moved to " + time : "extra class " + time}`;
}
function renderExceptionStrip() {
  const el = document.getElementById("schedExceptions"); if (!el) return;
  el.innerHTML = `<div class="exc-bar"><b>One-off changes</b>${schedExceptions.map((x) =>
    `<span class="exc-chip${x.groupId == null ? " holiday" : ""}" title="${escA(x.note || "")}">${esc(exceptionLabel(x))}<button type="button" title="Remove" aria-label="Remove this change" onclick="removeException(${x.id})">✕</button></span>`).join("")
    || '<span class="hint" style="margin:0">None — the weekly timetable applies as it is.</span>'}
    <button class="btn btn-soft btn-sm" type="button" style="margin-left:auto" onclick="openException()" title="Cancel, move or add a class for one date, or mark a day off">+ Add</button></div>`;
}

function openException() {
  let d = document.getElementById("exceptionModal");
  if (!d) {
    d = document.createElement("dialog"); d.id = "exceptionModal"; d.className = "modal-scrim";
    d.innerHTML = `<div class="modal">
      <div class="modal-h"><span>One-off change</span><button class="modal-x" type="button" onclick="closeModal('exceptionModal')">✕</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0">Applies to one date only. The weekly timetable stays as it is; reminders, the dashboard and the calendar link follow this change.</p>
        <div class="profile-field"><label for="exGroup">Who</label><select class="field" id="exGroup" onchange="exceptionSync()"></select></div>
        <div class="profile-field"><label for="exDate">Date</label><input class="field" type="date" id="exDate"/></div>
        <div class="profile-field" id="exKindField"><label for="exKind">What happens</label>
          <select class="field" id="exKind" onchange="exceptionSync()"><option value="cancel">Class is cancelled</option><option value="move">Class moves to another time</option><option value="extra">Extra class on this date</option></select></div>
        <div class="profile-field" id="exTimeField"><label>Time</label><div class="crange"><input class="field" id="exFrom" list="timeOptions" placeholder="From" aria-label="From"/><span class="dash">–</span><input class="field" id="exTo" list="timeOptions" placeholder="To (optional)" aria-label="To"/></div></div>
        <div class="profile-field"><label for="exNote">Note <span class="field-hint" style="display:inline">optional</span></label><input class="field" id="exNote" maxlength="200" placeholder="e.g. teacher away"/></div>
      </div>
      <div class="modal-f"><button class="btn btn-soft" type="button" onclick="closeModal('exceptionModal')">Cancel</button><button class="btn btn-primary" type="button" onclick="saveException()">Save</button></div></div>`;
    document.body.appendChild(d);
  }
  document.getElementById("exGroup").innerHTML = '<option value="">Every group — day off / holiday</option>' +
    groups.filter((g) => g.id != null).map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("");
  const date = document.getElementById("exDate"); date.min = dayKey(Date.now()); date.value = dayKey(Date.now());
  ["exFrom", "exTo", "exNote"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("exKind").value = "cancel";
  exceptionSync(); openModal("exceptionModal");
}
function exceptionSync() {
  const all = document.getElementById("exGroup").value === "";
  document.getElementById("exKindField").style.display = all ? "none" : "";
  document.getElementById("exTimeField").style.display = !all && document.getElementById("exKind").value !== "cancel" ? "" : "none";
}
async function saveException() {
  const gid = document.getElementById("exGroup").value;
  const body = { groupId: gid === "" ? null : +gid, date: document.getElementById("exDate").value,
    kind: gid === "" ? "cancel" : document.getElementById("exKind").value,
    from: document.getElementById("exFrom").value, to: document.getElementById("exTo").value, note: document.getElementById("exNote").value };
  const res = await fetch("/api/schedule/exceptions", post(body));
  const d = await res.json().catch(() => ({}));
  if (!res.ok) { toast(d.error || "Could not save the change", "err"); return; }
  closeModal("exceptionModal"); await loadExceptions();
  // the notice wording says "today's class", so only offer it for a change dated today
  const g = groups.find((x) => x.id === body.groupId);
  const offer = g && body.kind !== "extra" && body.date === dayKey(Date.now());
  toast("One-off change saved ✓", "ok", offer ? { label: "Notify group", fn: () => openNoticeFor(g.name, body.kind === "move" ? "reschedule" : "cancel", body.from, body.note) } : undefined);
}
async function removeException(id) {
  const res = await fetch(`/api/schedule/exceptions/${id}`, { method: "DELETE" });
  if (!res.ok) { toast("Could not remove it", "err"); return; }
  await loadExceptions(); toast("One-off change removed");
}
/* Open the existing Notify window prefilled; the user reviews and sends it. */
function openNoticeFor(name, kind, time, note) {
  openBroadcast(name);
  document.querySelector(`input[name=bcKind][value=${kind}]`).checked = true;
  document.getElementById("bcTime").value = time || "";
  document.getElementById("bcNote").value = note || "";
  bcSync();
}

/* ── calendar link: a private address other calendar apps can subscribe to ── */
async function copyCalendarLink(groupId) {
  try {
    const d = await (await fetch("/api/calendar-link")).json();
    const url = d.url + (groupId != null ? `?group=${groupId}` : "");
    await navigator.clipboard.writeText(url);
    toast("Calendar link copied — in your calendar app choose “Add from URL” and paste it", "ok");
  } catch { toast("Could not copy the calendar link", "err"); }
}
async function downloadCalendar() {
  try { const d = await (await fetch("/api/calendar-link")).json(); location.href = d.url; }
  catch { toast("Could not open the calendar file", "err"); }
}

loadExceptions();
