/* ============================================================
   SSIES Schedule Sender — POC user dashboard logic
   Mirrors production workflow: groups, scheduler, templates,
   contacts, direct + automated send, history, settings.
   Data comes from the local mock store instead of a server.
   ============================================================ */

const SESS = requireSession(["user", "admin", "superadmin"]);
let groups = [], templates = [], contacts = [], settings = { headless: false, delaySeconds: 5 };
let gSel = null, gMsgEdited = false, gPic = "";
let cSel = null, tplSel = null, cPic = "";
let tableSelected = {}, colWidths = {};
let colCollapsed = {};
let clashOn = localStorage.getItem("sched-clash") !== "off";
let tableDirty = true;
let scheduleViewMode = null;
let schedDragFrom = null;
let auditLoaded = false;
let lists = [], listActive = null, listMode = localStorage.getItem("lists-mode") || "tabs", listSel = {};
const SCHED_VIEW_KEY = "schedule-view";
const TABLE_NOTES_KEY = "schedule-table-notes";

const TRASH_ICO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
const GRIP_ICO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
const ICO_SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';
const ICO_DUP = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICO_DEL = TRASH_ICO;
const ICO_PENCIL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICO_EXPAND = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const ICO_COLLAPSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V5a2 2 0 0 1 2-2h3M20 8V5a2 2 0 0 0-2-2h-3M4 16v3a2 2 0 0 0 2 2h3M20 16v3a2 2 0 0 1-2 2h-3"/></svg>';
function colDisplay(g) { return (g.nickname && g.nickname.trim()) ? g.nickname : g.name; }

/* ════ Navigation ════ */
const VIEW_META = {
  dashboard: { t: "Dashboard", d: "Your schedule overview and quick actions" },
  groups: { t: "Groups", d: "Manage your WhatsApp groups and weekly schedules" },
  "group-detail": { t: "Group", d: "Group overview and weekly schedule" },
  "contact-detail": { t: "Contact", d: "Contact overview and message" },
  table: { t: "Scheduler", d: "Edit weekly timings in table or board view, then save or send selected groups" },
  "wa-direct": { t: "Open in WhatsApp", d: "Manual deep links — copy message and open WhatsApp" },
  "wa-auto": { t: "Automated Send", d: "Link session and send schedules automatically" },
  templates: { t: "Templates", d: "Reusable message templates with tokens and customization" },
  contacts: { t: "Contacts", d: "Save people and send messages via automation or direct links" },
  lists: { t: "Lists", d: "Discover contacts from WhatsApp labels and send to whole or selected lists" },
  history: { t: "Send History", d: "Recent automated sends and retry failed deliveries" },
  settings: { t: "Settings", d: "Appearance, layout, WhatsApp, automation, security and data" },
};
function showView(v) {
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("active", s.id === `view-${v}`));
  document.querySelectorAll(".nav-item[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  const meta = VIEW_META[v] || VIEW_META.groups;
  document.getElementById("pageTitle").textContent = meta.t;
  document.getElementById("pageDesc").textContent = meta.d;
  if (v === "dashboard") renderUserDashboard();
  if (v === "groups") renderGroupTable();
  if (v === "contacts") renderContactTable();
  if (v === "lists") renderLists();
  if (v === "group-detail") renderGroupDetail();
  if (v === "contact-detail") renderContactDetail();
  if (v === "table" && tableDirty) { renderTable(); tableDirty = false; }
  if (v === "templates") renderTemplates();
  if (v === "wa-direct") renderDirectPanel();
  if (v === "wa-auto") renderAutoSendPanel();
  if (v === "history") loadReleaseHistory();
  if (v === "settings") loadScheduledJob();
  if (window.innerWidth <= 860) document.getElementById("shell").classList.remove("rail-open");
  syncNavSched();
}

/* Scheduler nav-group (dropdown in navbar / expandable list in sidebar).
   Generic nav helpers (toggleNavGroup / positionNavDropdown / closeNavGroups /
   reflowNavbar) live in theme.js so the profile page shares the same navbar. */
function navGo(v) { showView(v); closeNavGroups(); }
function navSched(mode) { setScheduleView(mode); showView("table"); closeNavGroups(); }
function syncNavSched() {
  const active = document.querySelector(".view.active");
  const isTable = !!active && active.id === "view-table";
  const mode = isTable ? getScheduleView() : null;
  document.querySelectorAll("[data-sched]").forEach((b) => b.classList.toggle("active", isTable && b.dataset.sched === mode));
  const sidebar = !(document.documentElement.getAttribute("data-nav") === "navbar" && window.innerWidth > 860);
  document.querySelectorAll(".nav-group").forEach((gr) => {
    const has = !!gr.querySelector(".nav-item.active");
    gr.classList.toggle("has-active", has);
    if (has && sidebar) gr.classList.add("open"); // reveal the active section in the sidebar
  });
  if (sidebar && typeof persistNavOpen === "function") persistNavOpen();
}

function logout() { clearSession(); location.href = "login.html"; }

/* ════ USER DASHBOARD (overview) ════ */
const DA_ICONS = {
  sched: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>',
  auto: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  direct: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>',
  tpl: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
};
function nextScheduledSend(job) {
  if (!job || !job.enabled) return null;
  const now = new Date();
  const target = new Date(now);
  target.setHours(job.hour ?? 9, job.minute ?? 0, 0, 0);
  let add = ((job.dow ?? 0) - now.getDay() + 7) % 7;
  if (add === 0 && target <= now) add = 7;
  target.setDate(target.getDate() + add);
  return target;
}
function renderUserDashboard() {
  const el = document.getElementById("dashHome"); if (!el) return;
  const u = currentUser(); const d = userData();
  const hist = d.history || [];
  const successCount = hist.filter((h) => h.status === "success").length;
  const failCount = hist.length - successCount;
  const rate = hist.length ? Math.round((successCount / hist.length) * 100) : 100;
  const scheduled = d.scheduledJob && d.scheduledJob.enabled;
  const nextSend = nextScheduledSend(d.scheduledJob);
  const sess = STORE.session.connected;
  const pend = typeof myPasswordRequest === "function" ? myPasswordRequest() : null;
  const now = new Date(); const hr = now.getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const firstName = (u.displayName || u.email).split(" ")[0];
  // Groups active today (matched by weekday name)
  const weekdayName = now.toLocaleDateString(undefined, { weekday: "long" });
  const groupsWithSched = groups.filter((g) => g.schedule.some((e) => (e.from || "").trim()));
  const todayGroups = groups.filter((g) => g.schedule.some((e) => e.day === weekdayName && (e.from || "").trim()));
  // last 7-day activity mini bars
  const days7 = [];
  for (let i = 6; i >= 0; i--) { const dd = new Date(now); dd.setDate(now.getDate() - i); const key = dd.toDateString(); const cnt = hist.filter((h) => new Date(h.at).toDateString() === key).length; days7.push({ label: dd.toLocaleDateString(undefined, { weekday: "short" })[0], cnt }); }
  const maxCnt = Math.max(1, ...days7.map((x) => x.cnt));
  el.innerHTML = `
    <div class="dash-hero">
      <div><h2>${greet}, ${esc(firstName)} 👋</h2><p>${now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · here's your schedule overview.</p></div>
      <div class="dash-hero-actions"><button class="btn btn-soft" onclick="showView('table')">Open Scheduler</button><button class="btn btn-primary" onclick="showView('groups');newGroupDetail()">+ New group</button></div>
    </div>
    ${pend ? '<div class="pending-banner">⏳ Your password reset request is pending approval.</div>' : ""}
    <div class="cards" style="margin-top:18px">
      <div class="stat dash-stat" onclick="showView('groups')"><div class="n">${groups.length}</div><div class="l">Groups</div></div>
      <div class="stat dash-stat" onclick="showView('contacts')"><div class="n">${contacts.length}</div><div class="l">Contacts</div></div>
      <div class="stat dash-stat" onclick="showView('templates')"><div class="n">${templates.length}</div><div class="l">Templates</div></div>
      <div class="stat dash-stat" onclick="showView('history')"><div class="n">${successCount}</div><div class="l">Delivered</div></div>
      <div class="stat"><div class="n">${rate}%</div><div class="l">Success rate</div></div>
    </div>
    <div class="dash-grid">
      <div class="sec"><div class="sec-h">Quick actions</div><div class="sec-b dash-actions">
        <button class="dash-action" onclick="showView('table')"><span class="da-ico">${DA_ICONS.sched}</span><span class="da-body"><b>Open Scheduler</b><i>Edit weekly timings</i></span></button>
        <button class="dash-action" onclick="showView('wa-auto')"><span class="da-ico">${DA_ICONS.auto}</span><span class="da-body"><b>Automated Send</b><i>Link & send</i></span></button>
        <button class="dash-action" onclick="showView('wa-direct')"><span class="da-ico">${DA_ICONS.direct}</span><span class="da-body"><b>Open in WhatsApp</b><i>Direct links</i></span></button>
        <button class="dash-action" onclick="showView('templates')"><span class="da-ico">${DA_ICONS.tpl}</span><span class="da-body"><b>Templates</b><i>Reusable messages</i></span></button>
      </div></div>
      <div class="sec"><div class="sec-h">Session &amp; automation</div><div class="sec-b">
        <div class="dash-status-row"><span class="dot-live ${sess ? "on" : ""}"></span><span>${sess ? "WhatsApp connected" : "Not connected"}</span><button class="btn btn-soft btn-sm" style="margin-left:auto" onclick="showView('wa-auto')">Manage</button></div>
        <div class="dash-status-row"><span>Scheduled weekly send</span><span class="chip ${scheduled ? "chip-default" : ""}" style="margin-left:auto">${scheduled ? "On" : "Off"}</span></div>
        ${nextSend ? `<div class="dash-status-row"><span>Next send</span><span style="margin-left:auto;font-weight:700">${nextSend.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${nextSend.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></div>` : ""}
        <div class="dash-status-row"><span>Automated delay</span><span style="margin-left:auto;font-weight:700">${d.settings && d.settings.delaySeconds != null ? d.settings.delaySeconds : 5}s</span></div>
      </div></div>
    </div>
    <div class="dash-grid dash-grid-2">
      <div class="sec"><div class="sec-h">Today · ${esc(weekdayName)}<span class="chip" style="margin-left:auto">${todayGroups.length} scheduled</span></div><div class="sec-b">
        ${todayGroups.length ? todayGroups.map((g) => { const e = g.schedule.find((x) => x.day === weekdayName) || {}; return `<div class="dash-today-row"><div class="av small${g.pic ? " has-img" : ""}">${avatarInner(g.name, g.pic)}</div><div style="min-width:0;flex:1"><b>${esc(g.name)}</b><div class="hint" style="margin:0">${esc(e.from || "")}${e.to ? " – " + esc(e.to) : ""}</div></div><button class="btn btn-soft btn-sm" onclick="openGroupDetailByName('${escA(g.name)}')">Open</button></div>`; }).join("") : '<p class="hint">No groups scheduled for today. Enjoy the break! 🎉</p>'}
      </div></div>
      <div class="sec"><div class="sec-h">Weekly activity</div><div class="sec-b">
        <div class="dash-spark">${days7.map((x) => `<div class="spark-col"><div class="spark-bar" style="height:${Math.round((x.cnt / maxCnt) * 100)}%" title="${x.cnt} send${x.cnt === 1 ? "" : "s"}"></div><span class="spark-lbl">${x.label}</span></div>`).join("")}</div>
        <div class="dash-mini-stats"><span><b>${hist.length}</b> total</span><span><b class="ok-text">${successCount}</b> delivered</span><span><b class="err-text">${failCount}</b> failed</span></div>
      </div></div>
    </div>
    <div class="sec" style="margin-top:16px"><div class="sec-h">Recent sends<button class="btn btn-soft btn-sm" style="margin-left:auto" onclick="showView('history')">View all</button></div><div class="sec-b">
      ${hist.length ? hist.slice(0, 5).map((h) => `<div class="dash-hist"><span class="hstatus ${h.status === "success" ? "ok" : "err"}"><span class="hdot"></span>${h.status === "success" ? "Delivered" : "Failed"}</span><b>${esc(h.targetName)}</b><span class="hint" style="margin:0 0 0 auto">${new Date(h.at).toLocaleDateString()}</span></div>`).join("") : '<p class="hint">No sends yet. Create a group and send your first schedule.</p>'}
    </div></div>`;
}
function openGroupDetailByName(name) { const i = groups.findIndex((g) => g.name === name); if (i >= 0) openGroupDetail(i); }

/* ════ Time helpers ════ */
function buildTimeOptions() {
  let h = "";
  for (let i = 0; i < 24; i++) for (const m of [0, 15, 30, 45]) {
    const ap = i < 12 ? "am" : "pm"; let hr = i % 12 || 12;
    h += `<option value="${hr}:${String(m).padStart(2, "0")}${ap}"></option>`;
  }
  document.getElementById("timeOptions").innerHTML = h;
}

/* ════ Boot ════ */
function boot() {
  const u = currentUser();
  if (u) {
    const dot = document.getElementById("userDot");
    dot.innerHTML = avatarInner(u.displayName || u.email, u.profilePic);
    dot.classList.toggle("has-img", !!u.profilePic);
    document.getElementById("userName").textContent = u.displayName || u.email;
    document.getElementById("userRole").textContent = u.role;
  }
  buildTimeOptions(); applyTheme(); loadTableNotes();
  buildDayRows();
  loadGroups(); loadTemplates(); loadContacts(); loadLists(); loadSettings();
  const params = new URLSearchParams(location.search);
  const viewParam = params.get("view");
  if (viewParam === "table" && params.get("sched") === "board") setScheduleView("board");
  const landingRaw = viewParam && VIEW_META[viewParam] ? viewParam : (localStorage.getItem("default-page") || "dashboard");
  const landing = landingRaw === "whatsapp" ? "wa-direct" : landingRaw;
  if (VIEW_META[landing]) showView(landing);
  if (getStatusLogPref() === "always") showLog();
  requestAnimationFrame(reflowNavbar);
}

function buildDayRows() {
  const el = document.getElementById("gDays");
  el.innerHTML = DAYS.map((day) => `<label class="drow" for="chk-${day}">
    <input type="checkbox" id="chk-${day}" onchange="gToggleDay('${day}')"/>
    <span class="dn">${day}</span>
    <div class="trange" onclick="event.stopPropagation()">
      <input class="field tin" id="from-${day}" list="timeOptions" placeholder="From" disabled oninput="gOnSchedule()"/>
      <span class="dash">–</span>
      <input class="field tin" id="to-${day}" list="timeOptions" placeholder="To" disabled oninput="gOnSchedule()"/>
    </div></label>`).join("");
}

/* Notes are stored on the account (synced across devices) rather than per-device.
   The box auto-grows (never scrolls internally) and has a small rich toolbar. */
function loadTableNotes() { const el = document.getElementById("tableNotes"); if (el) { el.value = userData().tableNotes || ""; notesAutoGrow(); notesUpdateMeta(); } }
let _notesTimer;
function saveTableNotes() {
  const el = document.getElementById("tableNotes"); if (!el) return;
  userData().tableNotes = el.value;
  clearTimeout(_notesTimer);
  _notesTimer = setTimeout(() => { persist(); const s = document.getElementById("notesSaved"); if (s) { s.textContent = "Saved ✓"; s.classList.add("show"); clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove("show"), 1600); } }, 400);
}
function notesAutoGrow() { const el = document.getElementById("tableNotes"); if (!el) return; el.style.height = "auto"; el.style.height = Math.max(120, el.scrollHeight) + "px"; }
function notesUpdateMeta() {
  const el = document.getElementById("tableNotes"), m = document.getElementById("notesMeta"); if (!el || !m) return;
  const v = el.value; const words = (v.trim().match(/\S+/g) || []).length; const lines = v ? v.split("\n").length : 0;
  m.textContent = `${words} word${words === 1 ? "" : "s"} · ${v.length} character${v.length === 1 ? "" : "s"} · ${lines} line${lines === 1 ? "" : "s"}`;
}
function notesAfterEdit() { const el = document.getElementById("tableNotes"); if (el) el.focus(); saveTableNotes(); notesAutoGrow(); notesUpdateMeta(); }
function notesWrap(marker) {
  const ta = document.getElementById("tableNotes"); if (!ta) return; const s = ta.selectionStart, e = ta.selectionEnd; const sel = ta.value.slice(s, e);
  if (sel) { ta.value = ta.value.slice(0, s) + marker + sel + marker + ta.value.slice(e); ta.selectionStart = s + marker.length; ta.selectionEnd = e + marker.length; }
  else { const ph = marker === "*" ? "bold" : "italic"; ta.value = ta.value.slice(0, s) + marker + ph + marker + ta.value.slice(e); ta.selectionStart = s + marker.length; ta.selectionEnd = s + marker.length + ph.length; }
  notesAfterEdit();
}
function notesLine(prefix) {
  const ta = document.getElementById("tableNotes"); if (!ta) return; const s = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1;
  const needsNL = lineStart > 0 && ta.value[lineStart - 1] !== "\n" && ta.value.slice(lineStart, s).trim() !== "" ? "" : "";
  ta.value = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
  ta.selectionStart = ta.selectionEnd = s + prefix.length; notesAfterEdit();
}
function notesInsertTimestamp() {
  const ta = document.getElementById("tableNotes"); if (!ta) return; const s = ta.selectionStart;
  const stamp = new Date().toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const txt = (s > 0 && ta.value[s - 1] !== "\n" ? "\n" : "") + "— " + stamp + " — ";
  ta.value = ta.value.slice(0, s) + txt + ta.value.slice(s); ta.selectionStart = ta.selectionEnd = s + txt.length; notesAfterEdit();
}
async function notesCopy() { const ta = document.getElementById("tableNotes"); if (!ta || !ta.value.trim()) { toast("Nothing to copy", "err"); return; } try { await navigator.clipboard.writeText(ta.value); toast("Notes copied ✓"); } catch { toast("Copy failed", "err"); } }
function notesClear() { const ta = document.getElementById("tableNotes"); if (!ta || !ta.value) return; if (!confirm("Clear all notes for this schedule?")) return; ta.value = ""; notesAfterEdit(); toast("Notes cleared"); }
function toggleNotes() {
  const body = document.getElementById("notesBody"), tb = document.getElementById("notesToolbar"), btn = document.querySelector(".notes-toggle");
  if (!body) return; const collapsed = body.classList.toggle("collapsed");
  if (tb) tb.classList.toggle("hidden", collapsed);
  if (btn) { btn.setAttribute("aria-expanded", String(!collapsed)); btn.classList.toggle("is-collapsed", collapsed); }
  if (!collapsed) notesAutoGrow();
}

function loadGroups() {
  groups = JSON.parse(JSON.stringify(userData().groups || []));
  groups.forEach((g) => { if (g.message === undefined) g.message = ""; if (g.pic === undefined) g.pic = ""; if (g.waLinked === undefined) g.waLinked = false; if (g.nickname === undefined) g.nickname = ""; normalize(g); });
  tableDirty = true; renderGroupList(); refreshPickers();
  if (typeof renderGroupTable === "function") renderGroupTable();
  if (document.getElementById("view-table").classList.contains("active")) { renderTable(); tableDirty = false; }
}
function loadTemplates() { templates = JSON.parse(JSON.stringify(userData().templates || [])); renderTemplates(); refreshPickers(); }
function loadContacts() { contacts = JSON.parse(JSON.stringify(userData().contacts || [])); contacts.forEach((c) => { if (c.pic === undefined) c.pic = ""; if (c.waLinked === undefined) c.waLinked = false; if (!Array.isArray(c.labels)) c.labels = []; }); renderContactList(); if (typeof renderContactTable === "function") renderContactTable(); }
function loadLists() { const d = userData(); if (!Array.isArray(d.waLabels)) d.waLabels = []; if (!Array.isArray(d.lists)) d.lists = []; lists = JSON.parse(JSON.stringify(d.lists)); if (listActive == null && lists.length) listActive = lists[0].id; }
function persistLists() { userData().lists = JSON.parse(JSON.stringify(lists)); persist(); }
function loadSettings() {
  settings = JSON.parse(JSON.stringify(userData().settings || { headless: false, delaySeconds: 5 }));
  if (STORE.system.maintenanceMode) {
    const b = document.createElement("div");
    b.style.cssText = "background:#fef3c7;color:#92400e;padding:10px 20px;font-size:13px;font-weight:600;border-bottom:1px solid #fcd34d";
    b.textContent = "⚠ System is in maintenance mode — releases may be disabled.";
    document.querySelector(".main")?.prepend(b);
  }
  const h = document.getElementById("setHeadless"); if (h) h.checked = !!settings.headless;
  const d = document.getElementById("setDelay"); if (d) d.value = settings.delaySeconds ?? 5;
}
function persistGroups() { userData().groups = JSON.parse(JSON.stringify(groups)); persist(); }

/* ════ GROUPS ════ */
function groupInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "G";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function renderGroupList() {
  const q = (document.getElementById("groupSearch").value || "").toLowerCase();
  const el = document.getElementById("groupList"); el.innerHTML = "";
  const matched = groups.map((g, i) => ({ g, i })).filter(({ g }) => !q || g.name.toLowerCase().includes(q));
  if (!matched.length) { el.innerHTML = `<div class="list-empty">${groups.length ? "No matches" : "No groups yet"}</div>`; return; }
  matched.forEach(({ g, i }) => {
    const activeDays = g.schedule.filter((e) => (e.from || "").trim() || (e.to || "").trim()).length;
    const days = g.schedule.map((e) => e.day.slice(0, 3)).join(" · ");
    const last = g.lastReleased ? `<span class="sent">${relTime(g.lastReleased)}</span>` : "";
    const d = document.createElement("div"); d.className = "li" + (gSel === i ? " active" : ""); d.onclick = () => selectGroup(i);
    d.innerHTML = `<div class="av${g.pic ? " has-img" : ""}">${avatarInner(g.name, g.pic)}${g.waLinked ? '<span class="wa-badge" title="Linked in WhatsApp"></span>' : ""}</div>
      <div class="meta"><div class="nm">${esc(g.name)}</div>
      <div class="sb">${activeDays ? `${activeDays} day${activeDays === 1 ? "" : "s"}${days ? ` · ${esc(days)}` : ""}` : "No schedule yet"}${last ? ` · ${last}` : ""}</div></div>
      <div class="acts"><button class="ibtn send" title="Open in WhatsApp">${ICO_SEND}</button><button class="ibtn dup" title="Duplicate">${ICO_DUP}</button><button class="ibtn del" title="Delete">${ICO_DEL}</button></div>`;
    const [s, du, de] = d.querySelectorAll("button");
    s.onclick = (e) => { e.stopPropagation(); directOneGroup(i); };
    du.onclick = (e) => { e.stopPropagation(); duplicateGroup(i); };
    de.onclick = (e) => { e.stopPropagation(); deleteGroup(i); };
    el.appendChild(d);
  });
}
/* Editor avatar (group/contact photo) */
function renderEditorAvatar(elId, name, pic) {
  const el = document.getElementById(elId); if (!el) return;
  el.className = "editor-av" + (pic ? " has-img" : "");
  el.innerHTML = avatarInner(name, pic);
}
function readImageAsDataURL(file, cb) {
  if (!file) return;
  if (!file.type.startsWith("image/")) { toast("Please choose an image file", "err"); return; }
  if (file.size > 3 * 1024 * 1024) { toast("Image too large (max 3 MB)", "err"); return; }
  const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(file);
}
function gPickImage(input) { const f = input.files[0]; input.value = ""; readImageAsDataURL(f, (url) => { gPic = url; renderEditorAvatar("gAvatar", document.getElementById("gName").value, gPic); toast("Photo updated — save to keep"); }); }
function gRemoveImage() { gPic = ""; renderEditorAvatar("gAvatar", document.getElementById("gName").value, gPic); toast("Photo removed — save to keep"); }
function cPickImage(input) { const f = input.files[0]; input.value = ""; readImageAsDataURL(f, (url) => { cPic = url; renderEditorAvatar("cAvatar", document.getElementById("cName").value, cPic); toast("Photo updated — save to keep"); }); }
function cRemoveImage() { cPic = ""; renderEditorAvatar("cAvatar", document.getElementById("cName").value, cPic); toast("Photo removed — save to keep"); }

function selectGroup(i) {
  gSel = i; const g = groups[i]; document.getElementById("gName").value = g.name;
  gPic = g.pic || ""; renderEditorAvatar("gAvatar", g.name, gPic);
  document.getElementById("gInviteLink").value = g.inviteLink || "";
  DAYS.forEach((day) => {
    const c = document.getElementById(`chk-${day}`), f = document.getElementById(`from-${day}`), t = document.getElementById(`to-${day}`);
    const e = g.schedule.find((x) => x.day === day); c.checked = !!e; f.disabled = t.disabled = !e; f.value = e ? e.from || "" : ""; t.value = e ? e.to || "" : "";
  });
  gMsgEdited = !!(g.message && g.message.trim()); document.getElementById("gMsg").value = messageFor(g);
  gShowEditor(); renderGroupList(); updateGroupPreview();
}
function newGroup() {
  gSel = null; document.getElementById("gName").value = ""; document.getElementById("gInviteLink").value = "";
  gPic = ""; renderEditorAvatar("gAvatar", "", "");
  DAYS.forEach((day) => { document.getElementById(`chk-${day}`).checked = false; const f = document.getElementById(`from-${day}`), t = document.getElementById(`to-${day}`); f.disabled = t.disabled = true; f.value = t.value = ""; });
  gMsgEdited = false; document.getElementById("gMsg").value = ""; gShowEditor(); renderGroupList(); updateGroupPreview(); document.getElementById("gName").focus();
}
function gShowEditor() { document.getElementById("gEmpty").classList.add("hidden"); document.getElementById("gBody").classList.remove("hidden"); document.getElementById("gActions").classList.remove("hidden"); }
function gReadSchedule() { const s = []; for (const day of DAYS) if (document.getElementById(`chk-${day}`).checked) s.push({ day, from: document.getElementById(`from-${day}`).value.trim(), to: document.getElementById(`to-${day}`).value.trim() }); return s; }
function gToggleDay(day) { const c = document.getElementById(`chk-${day}`).checked, f = document.getElementById(`from-${day}`), t = document.getElementById(`to-${day}`); f.disabled = t.disabled = !c; if (c) f.focus(); else { f.value = t.value = ""; } gOnSchedule(); }
function gOnSchedule() { if (!gMsgEdited) document.getElementById("gMsg").value = genMessage(gReadSchedule()); updateGroupPreview(); }
function gRegen() { gMsgEdited = false; document.getElementById("gMsg").value = genMessage(gReadSchedule()); updateGroupPreview(); toast("Regenerated from schedule"); }
function gInsertTemplate(i) { if (i === "") return; document.getElementById("gMsg").value = replaceTokens(templates[i].content); gMsgEdited = true; document.getElementById("gTplPick").value = ""; updateGroupPreview(); toast("Template inserted"); }
function gBuild() {
  const name = document.getElementById("gName").value.trim(); if (!name) { toast("Enter the group name", "err"); return null; }
  const schedule = [];
  for (const day of DAYS) if (document.getElementById(`chk-${day}`).checked) {
    const from = document.getElementById(`from-${day}`).value.trim(); if (!from) { toast(`Enter a "From" time for ${day}`, "err"); return null; }
    schedule.push({ day, from, to: document.getElementById(`to-${day}`).value.trim() });
  }
  if (!schedule.length) { toast("Select at least one day", "err"); return null; }
  const box = document.getElementById("gMsg").value, auto = genMessage(schedule);
  const prev = gSel !== null ? groups[gSel] : {};
  return { name, schedule, message: box.trim() === auto.trim() ? "" : box, lastReleased: prev.lastReleased || "", inviteLink: document.getElementById("gInviteLink").value.trim(), pic: gPic, waLinked: prev.waLinked || false };
}
function saveGroup() {
  const b = gBuild(); if (!b) return false;
  if (gSel !== null) groups[gSel] = b; else { groups.push(b); gSel = groups.length - 1; }
  persistGroups(); loadGroups(); renderGroupList(); toast("Group saved ✓"); return true;
}
function duplicateGroup(i) {
  const g = groups[i]; let name = g.name + " (copy)", n = 2;
  while (groups.some((x) => x.name === name)) name = `${g.name} (copy ${n++})`;
  groups.push({ name, nickname: g.nickname || "", schedule: JSON.parse(JSON.stringify(g.schedule)), message: g.message, inviteLink: g.inviteLink || "", lastReleased: "", pic: g.pic || "", waLinked: false });
  persistGroups(); loadGroups(); toast(`Duplicated as "${name}"`);
}
function deleteGroup(i) {
  if (!confirm(`Delete "${groups[i].name}"?`)) return;
  groups.splice(i, 1);
  if (gSel === i) { gSel = null; document.getElementById("gEmpty").classList.remove("hidden"); document.getElementById("gBody").classList.add("hidden"); document.getElementById("gActions").classList.add("hidden"); }
  else if (gSel > i) gSel--;
  persistGroups(); loadGroups(); toast("Group deleted");
}
function releaseCurrentGroup() { if (!saveGroup()) return; const g = groups[gSel]; releaseWithMode([{ name: g.name, message: replaceTokens(messageFor(g)) }], "relAllSpin", "relAllBtn", "relAllTxt", "Send all", "automated"); }
function releaseAllGroups() { const t = groups.map((g) => ({ name: g.name, message: replaceTokens(messageFor(g)) })).filter((x) => x.message.trim()); releaseWithMode(t, "relAllSpin", "relAllBtn", "relAllTxt", "Send all", "automated"); }
function directOneGroup(i) { openDirectGroupByName(groups[i].name); }

/* ════ SCHEDULER TABLE / BOARD ════ */
function getScheduleView() {
  if (scheduleViewMode === "table" || scheduleViewMode === "board") return scheduleViewMode;
  const saved = localStorage.getItem(SCHED_VIEW_KEY);
  if (saved === "table" || saved === "board") { scheduleViewMode = saved; return saved; }
  scheduleViewMode = window.innerWidth <= 860 ? "board" : "table"; return scheduleViewMode;
}
function setScheduleView(mode) { if (mode !== "table" && mode !== "board") return; scheduleViewMode = mode; localStorage.setItem(SCHED_VIEW_KEY, mode); syncScheduleViewSeg(); renderTable(); syncNavSched(); }
function syncScheduleViewSeg() { const mode = getScheduleView(); document.querySelectorAll("#schedViewSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === mode)); }
function updateSchedSelCount() { const el = document.getElementById("schedSelCount"); if (!el) return; if (!groups.length) { el.textContent = ""; return; } const n = groups.reduce((a, _, i) => a + (tableSelected[i] !== false ? 1 : 0), 0); el.textContent = n === groups.length ? `${n} selected` : `${n} of ${groups.length} selected`; }
function renderTable() {
  const w = document.getElementById("tableWrap"); if (!w) return;
  syncScheduleViewSeg();
  groups.forEach((_, ci) => { if (tableSelected[ci] === undefined) tableSelected[ci] = true; });
  if (!groups.length) { w.innerHTML = `<div class="sched-canvas"><div class="empty sched-empty"><div class="empty-ico"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg></div><p>No groups yet</p><button class="btn btn-primary btn-sm" onclick="addColumn()">+ Add group</button></div></div>`; updateSchedSelCount(); return; }
  if (getScheduleView() === "board") renderScheduleBoard(w); else renderScheduleGrid(w);
  updateSchedSelCount();
}
function renderScheduleGrid(w) {
  let h = '<div class="sched-canvas"><table class="sched"><thead><tr><th class="day-col">Day</th>';
  groups.forEach((g, ci) => {
    const wd = colWidths[ci] ? `width:${colWidths[ci]}px` : "";
    const dim = tableSelected[ci] === false;
    const collapsed = colCollapsed[ci] === true;
    const hasNick = !!(g.nickname && g.nickname.trim());
    h += `<th class="schcol ${dim ? "col-dim-head" : ""} ${collapsed ? "col-collapsed" : "col-expanded"}" style="${wd}" ondragover="schedDragOver(event,${ci})" ondrop="schedDrop(event,${ci})" ondragenter="schedDragEnter(event,${ci})" ondragleave="schedDragLeave(event)">
      <div class="ch"><div class="top">
      <span class="drag-handle" draggable="true" ondragstart="schedDragStart(event,${ci})" ondragend="schedDragEnd(event)">${GRIP_ICO}</span>
      <input type="checkbox" ${dim ? "" : "checked"} onchange="tableSelected[${ci}]=this.checked;updateSchedSelCount();renderTable()"/>
      <span class="gn-box" title="${escA(g.name)}"><span class="gn-name">${esc(colDisplay(g))}</span>${hasNick ? `<span class="gn-full">${esc(g.name)}</span>` : ""}</span>
      <button class="col-icn" title="${collapsed ? "Expand column" : "Collapse column"}" onclick="toggleColExpand(${ci})">${collapsed ? ICO_EXPAND : ICO_COLLAPSE}</button>
      <button class="col-icn" title="Rename / nickname" onclick="editColMeta(${ci})">${ICO_PENCIL}</button>
      <button class="rc" title="Remove group" onclick="removeColumn(${ci})">${TRASH_ICO}</button></div></div>
      <div class="resizer" onmousedown="startResize(event,${ci})"></div></th>`;
  });
  h += "</tr></thead><tbody>";
  DAYS.forEach((day) => {
    h += `<tr><td class="day-col">${day.slice(0, 3)}</td>`;
    groups.forEach((g, ci) => {
      const e = g.schedule.find((x) => x.day === day) || {}; const f = e.from || "", t = e.to || "";
      const dim = tableSelected[ci] === false;
      h += `<td class="${f || t ? "filled " : ""}${dim ? "col-dim" : ""}" data-cell="${ci}|${day}" ${dim ? 'title="Select this group to edit its schedule"' : ""}><div class="crange">
        <input class="cell" list="timeOptions" value="${escA(f)}" placeholder="From" ${dim ? "disabled" : ""} oninput="updateCell(${ci},'${day}','from',this)"/>
        <span class="dash">–</span>
        <input class="cell" list="timeOptions" value="${escA(t)}" placeholder="To" ${dim ? "disabled" : ""} oninput="updateCell(${ci},'${day}','to',this)"/></div></td>`;
    });
    h += "</tr>";
  });
  w.innerHTML = h + "</tbody></table></div>";
  refreshClashes();
}
function renderScheduleBoard(w) {
  let h = '<div class="sched-board">';
  groups.forEach((g, ci) => {
    const activeDays = g.schedule.filter((e) => (e.from || "").trim() || (e.to || "").trim()).length;
    const dim = tableSelected[ci] === false;
    const hasNick = !!(g.nickname && g.nickname.trim());
    h += `<article class="sb-card${dim ? " is-dim" : ""}" ondragover="schedDragOver(event,${ci})" ondrop="schedDrop(event,${ci})" ondragenter="schedDragEnter(event,${ci})" ondragleave="schedDragLeave(event)">
      <header class="sb-head">
        <span class="drag-handle" draggable="true" ondragstart="schedDragStart(event,${ci})" ondragend="schedDragEnd(event)">${GRIP_ICO}</span>
        <input type="checkbox" ${dim ? "" : "checked"} onchange="tableSelected[${ci}]=this.checked;updateSchedSelCount();renderTable()"/>
        <span class="sb-title"><span class="sb-name" title="${escA(g.name)}">${esc(g.name)}</span>${hasNick ? `<span class="sb-nick">${esc(g.nickname)}</span>` : ""}</span>
        <button class="col-icn" title="Rename / nickname" onclick="editColMeta(${ci})">${ICO_PENCIL}</button>
        <span class="sb-meta">${activeDays} day${activeDays === 1 ? "" : "s"}</span>
        <button class="rc" title="Remove group" onclick="removeColumn(${ci})">${TRASH_ICO}</button>
      </header><div class="sb-days">`;
    DAYS.forEach((day) => {
      const e = g.schedule.find((x) => x.day === day) || {}; const f = e.from || "", t = e.to || "";
      h += `<div class="sb-day${f || t ? " filled" : ""}" data-cell="${ci}|${day}"><span class="sb-day-name">${day.slice(0, 3)}</span>
        <div class="crange"><input class="cell" list="timeOptions" value="${escA(f)}" placeholder="From" ${dim ? "disabled" : ""} oninput="updateCell(${ci},'${day}','from',this)"/><span class="dash">–</span><input class="cell" list="timeOptions" value="${escA(t)}" placeholder="To" ${dim ? "disabled" : ""} oninput="updateCell(${ci},'${day}','to',this)"/></div></div>`;
    });
    h += "</div></article>";
  });
  w.innerHTML = h + "</div>";
  refreshClashes();
}
/* Column nickname / expand-collapse + clash detection */
function toggleColExpand(ci) { colCollapsed[ci] = !colCollapsed[ci]; renderTable(); }
function expandAllCols(expand) { groups.forEach((_, ci) => { colCollapsed[ci] = !expand; }); renderTable(); }
function editColMeta(ci) {
  cmIdx = ci; const g = groups[ci];
  document.getElementById("cmName").value = g.name || "";
  document.getElementById("cmNick").value = g.nickname || "";
  document.getElementById("colMetaModal").classList.add("show");
  setTimeout(() => document.getElementById("cmName").focus(), 30);
}
let cmIdx = null;
function closeColMeta() { document.getElementById("colMetaModal").classList.remove("show"); }
function saveColMeta() {
  if (cmIdx == null) return;
  const name = document.getElementById("cmName").value.trim();
  if (!name) { toast("Group name is required", "err"); return; }
  groups[cmIdx].name = name; groups[cmIdx].nickname = document.getElementById("cmNick").value.trim();
  tableDirty = true; persistGroups(); loadGroups(); closeColMeta(); toast("Group updated ✓");
}
function toggleClash() { clashOn = !clashOn; localStorage.setItem("sched-clash", clashOn ? "on" : "off"); syncClashBtn(); refreshClashes(); }
function syncClashBtn() { const b = document.getElementById("clashBtn"); if (b) b.classList.toggle("on", clashOn); }
function computeClashes() {
  const cells = new Set(), pairs = [];
  DAYS.forEach((day) => {
    const items = [];
    groups.forEach((g, ci) => {
      const e = g.schedule.find((x) => x.day === day); if (!e) return;
      const a = parseTimeMin(e.from); if (a == null) return;
      let b = parseTimeMin(e.to); if (b == null || b <= a) b = a + 30;
      items.push({ ci, a, b });
    });
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      if (items[i].a < items[j].b && items[j].a < items[i].b) {
        cells.add(items[i].ci + "|" + day); cells.add(items[j].ci + "|" + day);
        pairs.push({ day, a: items[i].ci, b: items[j].ci });
      }
    }
  });
  return { cells, pairs };
}
function refreshClashes() {
  syncClashBtn();
  document.querySelectorAll("[data-cell].cell-clash").forEach((el) => el.classList.remove("cell-clash"));
  const banner = document.getElementById("clashBanner");
  if (!clashOn) { if (banner) banner.innerHTML = ""; return; }
  const { cells, pairs } = computeClashes();
  cells.forEach((key) => { const el = document.querySelector(`[data-cell="${key}"]`); if (el) el.classList.add("cell-clash"); });
  if (!banner) return;
  if (!pairs.length) {
    banner.innerHTML = `<div class="clash-bar ok"><span class="clash-ico">✓</span><span>No time clashes — every selected class has a distinct slot.</span></div>`;
  } else {
    const lines = pairs.map((p) => `<span class="clash-pill">${esc(p.day.slice(0, 3))}: ${esc(colDisplay(groups[p.a]))} ↔ ${esc(colDisplay(groups[p.b]))}</span>`).join("");
    banner.innerHTML = `<div class="clash-bar warn"><span class="clash-ico">⚠</span><div class="clash-body"><b>${pairs.length} time clash${pairs.length === 1 ? "" : "es"} detected</b><div class="clash-pills">${lines}</div></div></div>`;
  }
}
function schedDragStart(e, ci) { schedDragFrom = ci; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(ci)); e.target.closest("th, .sb-card")?.classList.add("is-dragging"); }
function schedDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
function schedDragEnter(e, ci) { e.preventDefault(); const host = e.currentTarget; if (schedDragFrom === null || schedDragFrom === ci) return; document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over")); host.classList.add("drag-over"); }
function schedDragLeave(e) { const host = e.currentTarget; if (!host.contains(e.relatedTarget)) host.classList.remove("drag-over"); }
function schedDrop(e, ci) { e.preventDefault(); const from = schedDragFrom !== null ? schedDragFrom : parseInt(e.dataTransfer.getData("text/plain"), 10); schedDragFrom = null; document.querySelectorAll(".drag-over,.is-dragging").forEach((el) => el.classList.remove("drag-over", "is-dragging")); if (Number.isNaN(from) || from === ci) return; moveGroup(from, ci); }
function schedDragEnd() { schedDragFrom = null; document.querySelectorAll(".drag-over,.is-dragging").forEach((el) => el.classList.remove("drag-over", "is-dragging")); }
function moveGroup(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const selArr = groups.map((_, i) => tableSelected[i] !== false);
  const [g] = groups.splice(fromIdx, 1); groups.splice(toIdx, 0, g);
  const [s] = selArr.splice(fromIdx, 1); selArr.splice(toIdx, 0, s);
  tableSelected = {}; colWidths = {}; selArr.forEach((v, i) => { tableSelected[i] = v; });
  if (gSel === fromIdx) gSel = toIdx; else if (gSel !== null) { if (fromIdx < gSel && toIdx >= gSel) gSel--; else if (fromIdx > gSel && toIdx <= gSel) gSel++; }
  tableDirty = true; renderTable(); renderGroupList();
}
function updateCell(ci, day, field, inp) {
  const g = groups[ci]; let e = g.schedule.find((x) => x.day === day);
  if (!e) { e = { day, from: "", to: "" }; g.schedule.push(e); } e[field] = inp.value.trim();
  if (!e.from && !e.to) g.schedule = g.schedule.filter((x) => x.day !== day);
  g.schedule.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  const cell = inp.closest("td") || inp.closest(".sb-day"); if (cell) cell.classList.toggle("filled", !!(e.from || e.to));
  const card = inp.closest(".sb-card"); if (card) { const n = g.schedule.filter((x) => (x.from || "").trim() || (x.to || "").trim()).length; const meta = card.querySelector(".sb-meta"); if (meta) meta.textContent = `${n} day${n === 1 ? "" : "s"}`; }
  tableDirty = true;
  if (clashOn) refreshClashes();
}
function selectAllCols(v) { groups.forEach((g, ci) => (tableSelected[ci] = v)); renderTable(); }
function addColumn() { const n = prompt("WhatsApp group name (exact):"); if (!n || !n.trim()) return; groups.push({ name: n.trim(), schedule: [], message: "", inviteLink: "" }); tableSelected[groups.length - 1] = true; tableDirty = true; renderTable(); }
function removeColumn(ci) { if (!confirm(`Remove "${groups[ci].name}"? (Save to persist)`)) return; groups.splice(ci, 1); tableSelected = {}; colWidths = {}; tableDirty = true; renderTable(); }
function startResize(e, ci) { e.preventDefault(); e.stopPropagation(); const th = e.target.closest("th"), hd = e.target; const sx = e.clientX, sw = th.offsetWidth; function mv(ev) { const wv = Math.max(120, sw + ev.clientX - sx); colWidths[ci] = wv; th.style.width = wv + "px"; } function up() { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); } document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up); }
function saveTable() { for (const g of groups) if (!g.name || !g.name.trim()) { toast("Every group needs a name", "err"); return false; } persistGroups(); loadGroups(); toast("Schedule saved ✓"); return true; }
function releaseTable() { if (!saveTable()) return; const t = groups.filter((g, ci) => tableSelected[ci]).map((g) => ({ name: g.name, message: replaceTokens(genMessage(g.schedule)) })).filter((x) => x.message.trim()); if (!t.length) { toast("Select at least one group with timings", "err"); return; } doRelease(t, "relTblSpin", "relTblBtn", "relTblTxt", "Send selected"); }

/* ════ TEMPLATES ════ */
function renderTemplates() {
  const g = document.getElementById("tplGrid"); if (!g) return;
  if (!templates.length) { g.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">📝</div><p>No templates yet. Create one to reuse across groups and contacts.</p><button class="btn btn-primary btn-sm" onclick="newTemplate()">+ New Template</button></div>`; return; }
  const q = (document.getElementById("tplSearch")?.value || "").toLowerCase();
  const matched = templates.map((t, i) => ({ t, i })).filter(({ t }) => !q || t.name.toLowerCase().includes(q) || (t.content || "").toLowerCase().includes(q));
  if (!matched.length) { g.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🔍</div><p>No templates match your search.</p></div>`; return; }
  g.innerHTML = matched.map(({ t, i }) => `<div class="tpl">
    <h3>${esc(t.name)}${t.isDefault ? '<span class="chip chip-default">Default</span>' : ""}</h3>
    <div class="tpl-preview">${renderWhatsAppPreview(replaceTokens(t.content)) || "<i>Empty template</i>"}</div>
    <div class="tpl-foot"><span class="tpl-count">${(t.content || "").length} chars</span></div>
    <div class="row">
      <button class="btn btn-soft btn-sm" onclick="editTemplate(${i})">Edit</button>
      <button class="btn btn-soft btn-sm" onclick="duplicateTemplate(${i})">Duplicate</button>
      <button class="btn btn-soft btn-sm" onclick="copyText(templates[${i}].content)">Copy</button>
      <button class="btn btn-soft btn-sm" style="margin-left:auto;color:var(--error)" onclick="deleteTemplate(${i})">${t.isDefault ? "Reset" : "Delete"}</button>
    </div></div>`).join("");
}
function duplicateTemplate(i) { const t = templates[i]; let name = t.name + " (copy)", n = 2; while (templates.some((x) => x.name === name)) name = `${t.name} (copy ${n++})`; templates.push({ name, content: t.content, isDefault: false }); userData().templates = JSON.parse(JSON.stringify(templates)); persist(); loadTemplates(); toast(`Duplicated as "${name}"`); }
function newTemplate() { tplSel = null; openTpl("New Template", "", ""); }
function editTemplate(i) { tplSel = i; openTpl("Edit Template", templates[i].name, templates[i].content); }
function openTpl(title, name, content) {
  document.getElementById("tplModalTitle").textContent = title;
  document.getElementById("tplName").value = name || "";
  document.getElementById("tplContent").value = content || "";
  document.getElementById("tplModal").classList.add("show");
  tplPreview();
  document.getElementById("tplName").focus();
}
function closeTpl() { document.getElementById("tplModal").classList.remove("show"); }
function tplInsert(txt) { const ta = document.getElementById("tplContent"); const s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.slice(0, s) + txt + ta.value.slice(e); ta.focus(); ta.selectionStart = ta.selectionEnd = s + txt.length; tplPreview(); }
function tplInsertSchedule() { tplInsert("*Note*\nSchedule for this week:\n* Saturday: 12:00pm - 1:30pm\n* Sunday: 12:00pm - 1:30pm\n*Kindly Acknowledge*"); }
/* Wrap the current selection (or insert a placeholder) with a WhatsApp format marker */
function tplWrap(marker) {
  const ta = document.getElementById("tplContent"); const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  if (sel) { ta.value = ta.value.slice(0, s) + marker + sel + marker + ta.value.slice(e); ta.selectionStart = s + marker.length; ta.selectionEnd = e + marker.length; }
  else { const ph = marker === "*" ? "bold" : marker === "_" ? "italic" : marker === "~" ? "strike" : "code"; ta.value = ta.value.slice(0, s) + marker + ph + marker + ta.value.slice(e); ta.selectionStart = s + marker.length; ta.selectionEnd = s + marker.length + ph.length; }
  ta.focus(); tplPreview();
}
function tplBullet() {
  const ta = document.getElementById("tplContent"); const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || "item";
  const bulleted = sel.split("\n").map((l) => (l.trim() ? "* " + l.replace(/^\*\s*/, "") : l)).join("\n");
  ta.value = ta.value.slice(0, s) + bulleted + ta.value.slice(e); ta.focus(); tplPreview();
}
function tplEmoji(em) { tplInsert(em); }
function tplPreview() {
  const ta = document.getElementById("tplContent"); if (!ta) return;
  const val = ta.value;
  const cc = document.getElementById("tplCharCount"); if (cc) cc.textContent = val.length + " chars";
  const pv = document.getElementById("tplPreviewBody"); if (pv) pv.innerHTML = renderWhatsAppPreview(replaceTokens(val)) || "<i>Nothing to preview yet</i>";
}
function saveTpl() {
  const name = document.getElementById("tplName").value.trim(); if (!name) { toast("Enter a template name", "err"); return; }
  const content = document.getElementById("tplContent").value;
  if (tplSel !== null) { templates[tplSel].name = name; templates[tplSel].content = content; } else templates.push({ name, content, isDefault: false });
  userData().templates = JSON.parse(JSON.stringify(templates)); persist();
  closeTpl(); loadTemplates(); toast("Template saved ✓");
}
function deleteTemplate(i) {
  const t = templates[i];
  if (t.isDefault) { if (!confirm("Reset default template to original content?")) return; templates[i].content = DEFAULT_TEMPLATE_CONTENT; }
  else { if (!confirm(`Delete template "${t.name}"?`)) return; templates.splice(i, 1); }
  userData().templates = JSON.parse(JSON.stringify(templates)); persist(); loadTemplates(); toast(t.isDefault ? "Default reset" : "Template deleted");
}

/* ════ CONTACTS ════ */
function persistContacts() { userData().contacts = JSON.parse(JSON.stringify(contacts)); persist(); }
function renderContactList() {
  const q = (document.getElementById("contactSearch").value || "").toLowerCase();
  const el = document.getElementById("contactList"); el.innerHTML = "";
  const matched = contacts.map((c, i) => ({ c, i })).filter(({ c }) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q));
  if (!matched.length) { el.innerHTML = `<div class="list-empty">${contacts.length ? "No matches" : "No contacts yet"}</div>`; return; }
  matched.forEach(({ c, i }) => {
    const last = c.lastReleased ? ` · <span class="sent">✓ ${relTime(c.lastReleased)}</span>` : "";
    const d = document.createElement("div"); d.className = "li" + (cSel === i ? " active" : ""); d.onclick = () => selectContact(i);
    d.innerHTML = `<div class="av${c.pic ? " has-img" : ""}">${avatarInner(c.name, c.pic)}${c.waLinked ? '<span class="wa-badge" title="On WhatsApp"></span>' : ""}</div>
      <div class="meta"><div class="nm">${esc(c.name)}</div><div class="sb">+${esc(c.phone)}${last}</div></div>
      <div class="acts"><button class="ibtn send" title="Open">${ICO_SEND}</button><button class="ibtn del" title="Delete">${ICO_DEL}</button></div>`;
    const [s, de] = d.querySelectorAll("button");
    s.onclick = (e) => { e.stopPropagation(); directOneContact(i); };
    de.onclick = (e) => { e.stopPropagation(); deleteContact(i); };
    el.appendChild(d);
  });
}
function selectContact(i) { cSel = i; const c = contacts[i]; document.getElementById("cName").value = c.name; document.getElementById("cPhone").value = c.phone; document.getElementById("cMsg").value = c.message || ""; cPic = c.pic || ""; renderEditorAvatar("cAvatar", c.name, cPic); cShowEditor(); renderContactList(); updateContactPreview(); }
function newContact() { cSel = null; document.getElementById("cName").value = ""; document.getElementById("cPhone").value = ""; document.getElementById("cMsg").value = ""; cPic = ""; renderEditorAvatar("cAvatar", "", ""); cShowEditor(); renderContactList(); updateContactPreview(); document.getElementById("cName").focus(); }
function cShowEditor() { document.getElementById("cEmpty").classList.add("hidden"); document.getElementById("cBody").classList.remove("hidden"); document.getElementById("cActions").classList.remove("hidden"); }
function cLoadGroup(i) { if (i === "") return; document.getElementById("cMsg").value = replaceTokens(messageFor(groups[i])); document.getElementById("cGroupPick").value = ""; updateContactPreview(); toast(`Loaded "${groups[i].name}" message`); }
function cInsertTemplate(i) { if (i === "") return; document.getElementById("cMsg").value = replaceTokens(templates[i].content); document.getElementById("cTplPick").value = ""; updateContactPreview(); toast("Template inserted"); }
function cBuild() {
  const name = document.getElementById("cName").value.trim(); const phone = document.getElementById("cPhone").value.replace(/\D/g, "");
  if (!name) { toast("Enter contact name", "err"); return null; } if (!phone) { toast("Enter phone (digits, with country code)", "err"); return null; }
  const prev = cSel !== null ? contacts[cSel] : {};
  return { name, phone, message: document.getElementById("cMsg").value, lastReleased: prev.lastReleased || "", pic: cPic, waLinked: prev.waLinked || false };
}
function saveContact() { const b = cBuild(); if (!b) return false; if (cSel !== null) contacts[cSel] = b; else { contacts.push(b); cSel = contacts.length - 1; } persistContacts(); loadContacts(); renderContactList(); toast("Contact saved ✓"); return true; }
function deleteContact(i) { if (!confirm(`Delete "${contacts[i].name}"?`)) return; contacts.splice(i, 1); if (cSel === i) { cSel = null; document.getElementById("cEmpty").classList.remove("hidden"); document.getElementById("cBody").classList.add("hidden"); document.getElementById("cActions").classList.add("hidden"); } else if (cSel > i) cSel--; persistContacts(); loadContacts(); toast("Contact deleted"); }
function contactTarget(c) { return { name: c.name, phone: c.phone, message: replaceTokens(c.message || "") }; }
function releaseCurrentContact() { if (!saveContact()) return; const c = contacts[cSel]; const t = contactTarget(c); if (!t.message.trim()) { toast("Message is empty", "err"); return; } releaseWithMode([t], "relCAllSpin", "relCAllBtn", "relCAllTxt", "Automated All", "automated"); }
function releaseAllContacts() { const t = contacts.map(contactTarget).filter((x) => x.message.trim()); releaseWithMode(t, "relCAllSpin", "relCAllBtn", "relCAllTxt", "Automated All", "automated"); }
function directOneContact(i) { openDirectContactByName(contacts[i].name); }

/* ════ Pickers ════ */
function refreshPickers() {
  const tplOpts = `<option value="">Insert template…</option>` + templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join("");
  const gTpl = document.getElementById("gTplPick"); if (gTpl) gTpl.innerHTML = tplOpts;
  const cTpl = document.getElementById("cTplPick"); if (cTpl) cTpl.innerHTML = `<option value="">Template…</option>` + templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join("");
  const cG = document.getElementById("cGroupPick"); if (cG) cG.innerHTML = `<option value="">Load group…</option>` + groups.map((g, i) => `<option value="${i}">${esc(g.name)}</option>`).join("");
}

/* ════ Message preview (WhatsApp formatting) ════ */
function renderWhatsAppPreview(text) {
  let s = esc(text || "");
  s = s.replace(/```([\s\S]+?)```/g, "<code>$1</code>");
  s = s.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");
  s = s.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  s = s.replace(/~([^~\n]+)~/g, "<del>$1</del>");
  return s.replace(/\n/g, "<br>");
}
function updateGroupPreview() { const el = document.getElementById("gMsgPreview"); if (!el) return; const rendered = replaceTokens(document.getElementById("gMsg")?.value || ""); el.innerHTML = `<div class="preview-h">Live preview (${rendered.length} chars)</div><div class="preview-b">${renderWhatsAppPreview(rendered)}</div>`; }
function updateContactPreview() { const el = document.getElementById("cMsgPreview"); if (!el) return; const rendered = replaceTokens(document.getElementById("cMsg")?.value || ""); el.innerHTML = `<div class="preview-h">Live preview (${rendered.length} chars)</div><div class="preview-b">${renderWhatsAppPreview(rendered)}</div>`; }

/* ════ WhatsApp group fetch/validate (simulated) ════ */
function gFetchWaGroups() {
  const status = document.getElementById("gNameStatus"), pick = document.getElementById("gWaPick");
  status.textContent = "Loading WhatsApp groups…";
  setTimeout(() => {
    const waGroups = STORE.session.connected ? groups.map((g) => ({ name: g.name })) : [];
    if (!STORE.session.connected) { status.innerHTML = `<span class="badge-err">Connect a WhatsApp session first (Automated Send)</span>`; return; }
    pick.innerHTML = '<option value="">Pick from WhatsApp…</option>' + waGroups.map((g) => `<option value="${escA(g.name)}">${esc(g.name)}</option>`).join("");
    pick.classList.toggle("hidden", !waGroups.length);
    status.textContent = waGroups.length ? `${waGroups.length} group(s) loaded` : "No groups found";
  }, 500);
}
function gPickWaGroup(name) { if (!name) return; document.getElementById("gName").value = name; document.getElementById("gWaPick").value = ""; }

/* ════ Direct (Open in WhatsApp) ════ */
function buildContactUrlClient(phone, message) { const p = String(phone || "").replace(/\D/g, ""); if (!p) return ""; const text = encodeURIComponent((message || "").trim()); return `https://wa.me/${p}` + (text ? `?text=${text}` : ""); }
function findDirectGroup(name) { return groups.find((x) => x.name === name); }
function findDirectContact(name) { return contacts.find((x) => x.name === name); }
function renderDirectPanel() {
  const q = (document.getElementById("waDirectSearch")?.value || "").toLowerCase();
  const gList = document.getElementById("waDirectGroupList"), cList = document.getElementById("waDirectContactList");
  if (gList) {
    const f = groups.filter((g) => !q || g.name.toLowerCase().includes(q));
    gList.innerHTML = !f.length ? '<p class="hint">No groups match. Add groups with optional invite links.</p>' :
      f.map((g) => { const m = messageFor(g); const preview = esc((m || "").slice(0, 80)) + ((m || "").length > 80 ? "…" : ""); return `<div class="wa-row"><div class="nm">${esc(g.name)}<div class="sub">${g.inviteLink ? "Invite link set" : "No invite link — opens WhatsApp Web"}</div><div class="preview">${preview || "<em>No message</em>"}</div></div><div class="wa-row-actions"><button class="btn btn-ghost btn-sm" onclick="copyDirectMessage('group','${escA(g.name)}')">Copy</button><button class="btn btn-soft btn-sm" onclick="openDirectGroupByName('${escA(g.name)}')">Open</button></div></div>`; }).join("");
  }
  if (cList) {
    const f = contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q));
    cList.innerHTML = !f.length ? '<p class="hint">No contacts match.</p>' :
      f.map((c) => { const preview = esc((c.message || "").slice(0, 80)) + ((c.message || "").length > 80 ? "…" : ""); return `<div class="wa-row"><div class="nm">${esc(c.name)}<div class="sub">+${esc(c.phone || "")}</div><div class="preview">${preview || "<em>No message</em>"}</div></div><div class="wa-row-actions"><button class="btn btn-ghost btn-sm" onclick="copyDirectMessage('contact','${escA(c.name)}')">Copy</button><button class="btn btn-soft btn-sm" onclick="openDirectContactByName('${escA(c.name)}')">Open</button></div></div>`; }).join("");
  }
}
async function copyTextSafe(t) { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }
async function copyDirectMessage(type, name) { const it = type === "contact" ? findDirectContact(name) : findDirectGroup(name); const msg = it ? (type === "contact" ? it.message : messageFor(it)) : ""; if (!msg) { toast("No message to copy", "err"); return; } await copyTextSafe(replaceTokens(msg)); toast("Message copied"); }
async function openDirectGroupByName(name) { const g = findDirectGroup(name); if (!g) { toast("Group not found", "err"); return; } const msg = replaceTokens(messageFor(g)); if (msg) await copyTextSafe(msg); const url = g.inviteLink || "https://web.whatsapp.com"; window.open(url, "_blank", "noopener"); logAudit("direct_whatsapp", g.name); toast(g.inviteLink ? "Opened group — message copied" : "Opened WhatsApp Web — message copied"); }
async function openDirectContactByName(name) { const c = findDirectContact(name); if (!c) { toast("Contact not found", "err"); return; } const url = buildContactUrlClient(c.phone, replaceTokens(c.message || "")); if (!url) { toast("Invalid phone number", "err"); return; } window.open(url, "_blank", "noopener"); logAudit("direct_whatsapp", c.name); toast("Opened WhatsApp chat"); }

/* ════ Automated Send: session + QR (simulated WAHA) ════ */
let waQrPoll = null, waFlowState = "disconnected";
const WA_STEPS = ["Provider", "Session", "Scan QR", "Connected"];
const WA_CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2"><path d="M20 6 9 17l-5-5"/></svg>';

/* Animated workflow status indicator for the Automated Send session */
function renderWaFlow(state) {
  waFlowState = state;
  const el = document.getElementById("waFlow"); if (!el) return;
  const provider = (STORE.session.provider || "waha").toUpperCase();
  let doneCount, activeIndex, label, tone;
  if (state === "connected") { doneCount = 4; activeIndex = 3; label = `Connected · ${provider} · slot ${STORE.session.slot}`; tone = "ok"; }
  else if (state === "scanning") { doneCount = 2; activeIndex = 2; label = "Waiting for you to scan the QR code…"; tone = "progress"; }
  else if (state === "connecting") { doneCount = 1; activeIndex = 1; label = `Starting ${provider} session…`; tone = "progress"; }
  else if (state === "disabled") { doneCount = 0; activeIndex = 0; label = "Automation is disabled — direct links only"; tone = "err"; }
  else { doneCount = 1; activeIndex = 1; label = "Not linked yet — start a session below"; tone = "idle"; }
  let h = "";
  WA_STEPS.forEach((s, i) => {
    if (i > 0) h += `<span class="wa-flow-conn ${i <= doneCount ? "fill" : ""}"></span>`;
    const cls = i < doneCount ? "done" : (i === activeIndex ? "active" : "pending");
    h += `<span class="wa-flow-node ${cls}"><span class="wa-flow-dot">${i < doneCount ? WA_CHECK : i + 1}</span><span class="wa-flow-label">${s}</span></span>`;
  });
  el.className = "wa-flow tone-" + tone;
  el.innerHTML = h;
  const st = document.getElementById("waFlowStatus"); if (st) st.textContent = label;
}
function loadAutoSession() {
  const provEl = document.getElementById("autoProviderLabel"); if (provEl) provEl.textContent = (STORE.session.provider || "waha").toUpperCase();
  let state;
  if (STORE.system.waProvider === "direct_only") state = "disabled";
  else if (STORE.session.connected) state = "connected";
  else state = (waFlowState === "connecting" || waFlowState === "scanning") ? waFlowState : "disconnected";
  renderWaFlow(state);
  if (STORE.session.connected) { document.getElementById("waQrWrap")?.classList.add("hidden"); stopQrPoll(); }
  return STORE.session;
}
function startWaSession() {
  if (STORE.system.waProvider === "direct_only") { toast("Automation disabled in system settings", "err"); renderWaFlow("disabled"); return; }
  renderWaFlow("connecting");
  document.getElementById("waQrWrap")?.classList.remove("hidden");
  toast("Starting session — scan the QR with WhatsApp → Linked devices");
  setTimeout(() => { showSimQr(); renderWaFlow("scanning"); startQrPoll(); }, 750);
}
function resetWaSession() { STORE.session.connected = false; persist(); document.getElementById("waQrWrap")?.classList.remove("hidden"); showSimQr(); renderWaFlow("scanning"); startQrPoll(); toast("Fresh QR ready — scan within 20 seconds"); }
function stopWaSession() { STORE.session.connected = false; persist(); stopQrPoll(); const img = document.getElementById("waQrImg"); if (img) img.removeAttribute("src"); document.getElementById("waQrWrap")?.classList.add("hidden"); renderWaFlow("disconnected"); toast("Session stopped"); }
function showSimQr() { const img = document.getElementById("waQrImg"); if (img) img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent("SSIES-POC-DEMO-" + Date.now())}`; }
function startQrPoll() { stopQrPoll(); let ticks = 0; waQrPoll = setInterval(() => { ticks++; if (ticks >= 3) { STORE.session.connected = true; persist(); stopQrPoll(); document.getElementById("waQrWrap")?.classList.add("hidden"); renderWaFlow("connected"); toast("WhatsApp connected ✓"); } }, 1500); }
function stopQrPoll() { if (waQrPoll) { clearInterval(waQrPoll); waQrPoll = null; } }
function renderAutoSendPanel() { loadAutoSession(); renderAutoTargetList(); }
function renderAutoTargetList() {
  const el = document.getElementById("autoTargetList"); if (!el) return;
  const items = [];
  groups.forEach((g) => items.push({ type: "group", name: g.name, sub: `${g.schedule?.length || 0} days` }));
  contacts.forEach((c) => items.push({ type: "contact", name: c.name, sub: `+${c.phone || ""}` }));
  if (!items.length) { el.innerHTML = '<p class="hint">Add groups or contacts first.</p>'; return; }
  el.innerHTML = items.map((it) => `<label class="wa-check-row"><input type="checkbox" class="auto-pick" data-type="${it.type}" data-name="${escA(it.name)}" checked/><span><strong>${esc(it.name)}</strong><span class="sub">${esc(it.sub)} · ${it.type}</span></span></label>`).join("");
}
function runAutomatedFromPanel() {
  const picks = [...document.querySelectorAll(".auto-pick:checked")];
  if (!picks.length) { toast("Select at least one target", "err"); return; }
  const targets = picks.map((cb) => {
    const type = cb.dataset.type, name = cb.dataset.name;
    if (type === "contact") { const c = contacts.find((x) => x.name === name); return { name, phone: c?.phone, message: replaceTokens(c?.message || "") }; }
    const g = groups.find((x) => x.name === name); return { name, message: replaceTokens(messageFor(g)) };
  }).filter((t) => t.message?.trim());
  if (!targets.length) { toast("Selected targets have empty messages", "err"); return; }
  releaseWithMode(targets, "autoSpin", "autoBtn", "autoTxt", "Send selected", "automated");
}

/* ════ Release / send-mode orchestration ════ */
function getDefaultSendModeSafe() { return getDefaultSendMode(); }
async function releaseWithMode(targets, spin, btn, txt, label, type) {
  if (!targets?.length) { toast("Nothing to send", "err"); return; }
  let use = type || getDefaultSendMode();
  if (use === "ask") use = confirm(`Send to ${targets.length} recipient(s)?\n\nOK = Automated Send\nCancel = Open in WhatsApp (direct)`) ? "automated" : "direct";
  if (use === "direct") {
    for (const t of targets) {
      if (t.phone) await openDirectContactByName(t.name);
      else await openDirectGroupByName(t.name);
      await new Promise((r) => setTimeout(r, 400));
    }
    return;
  }
  doRelease(targets, spin, btn, txt, label);
}

/* Pre-flight checks (mirror production semantics) */
function runPreflight(targets) {
  const checks = [];
  const provider = STORE.system.waProvider;
  checks.push({ ok: provider !== "direct_only", label: "Automation provider enabled", hint: provider === "direct_only" ? "Set to WAHA or Selenium in system settings" : "" });
  checks.push({ ok: STORE.session.connected, label: "WhatsApp session connected", hint: STORE.session.connected ? "" : "Link WhatsApp in Automated Send" });
  checks.push({ ok: !STORE.system.maintenanceMode, label: "System not in maintenance mode", hint: STORE.system.maintenanceMode ? "Contact superadmin" : "" });
  checks.push({ ok: targets.every((t) => (t.message || "").trim()), label: "All targets have a message", hint: "" });
  return { ready: checks.every((c) => c.ok), checks };
}

/* ════ Automated Send status form (#5) ════ */
let ssTargets = [], ssStatus = [], ssPhase = "ready", ssMeta = null, ssPf = null;
function doRelease(targets, spin, btn, txt, label) {
  if (!targets.length) { toast("Nothing to send", "err"); return; }
  ssTargets = targets; ssStatus = targets.map(() => "queued"); ssMeta = { spin, btn, txt, label };
  ssPf = runPreflight(targets); ssPhase = "ready";
  renderSendStatus();
  document.getElementById("sendStatusModal").classList.add("show");
}
function closeSendStatus() { if (ssPhase === "running") { toast("Send in progress…", "err"); return; } document.getElementById("sendStatusModal").classList.remove("show"); }
function ssStatusIcon(st) { return st === "success" ? "✓" : st === "failed" ? "✕" : st === "sending" ? '<span class="ss-spin"></span>' : "•"; }
function ssStatusLabel(st) { return st === "success" ? "Delivered" : st === "failed" ? "Failed" : st === "sending" ? "Sending…" : "Queued"; }
function renderSendStatus() {
  const prov = (STORE.session.provider || "waha").toUpperCase();
  const pl = document.getElementById("ssProviderLabel"); if (pl) pl.textContent = prov;
  const sess = document.getElementById("ssSession"); if (sess) { sess.textContent = STORE.session.connected ? "Session connected" : "Not connected"; sess.className = "ss-session " + (STORE.session.connected ? "ok" : "bad"); }
  const pfEl = document.getElementById("ssPreflight");
  if (pfEl) pfEl.innerHTML = `<div class="ss-sec-h">Pre-flight checks</div>` + ssPf.checks.map((c) => `<div class="ss-check ${c.ok ? "ok" : "bad"}"><span class="ss-check-ic">${c.ok ? "✓" : "✕"}</span><span class="ss-check-lbl">${esc(c.label)}</span>${c.hint ? `<em>${esc(c.hint)}</em>` : ""}</div>`).join("");
  renderSsList(); renderSsProgress(); renderSsFooter();
}
function renderSsList() {
  const el = document.getElementById("ssList"); if (!el) return;
  el.innerHTML = `<div class="ss-sec-h">Recipients</div>` + ssTargets.map((t, i) => { const st = ssStatus[i]; return `<div class="ss-row st-${st}"><span class="ss-row-ic">${ssStatusIcon(st)}</span><div class="ss-row-body"><b>${esc(t.name)}</b><span>${t.phone ? "+" + esc(t.phone) : "group message"}</span></div><span class="ss-row-tag">${ssStatusLabel(st)}</span></div>`; }).join("");
}
function renderSsProgress() {
  const total = ssTargets.length || 1;
  const ok = ssStatus.filter((s) => s === "success").length, fail = ssStatus.filter((s) => s === "failed").length;
  const sending = ssStatus.filter((s) => s === "sending").length, q = ssStatus.filter((s) => s === "queued").length;
  const pct = Math.round(((ok + fail) / total) * 100);
  const bar = document.getElementById("ssProgress"); if (bar) bar.style.width = pct + "%";
  const c = document.getElementById("ssCounts"); if (c) c.innerHTML = `<span class="ss-count"><b>${ssTargets.length}</b> total</span><span class="ss-count ok"><b>${ok}</b> delivered</span>${fail ? `<span class="ss-count err"><b>${fail}</b> failed</span>` : ""}<span class="ss-count"><b>${q + sending}</b> pending</span><span class="ss-pct">${pct}%</span>`;
}
function renderSsFooter() {
  const f = document.getElementById("ssFooter"); if (!f) return;
  if (ssPhase === "running") { f.innerHTML = `<div class="ss-live"><span class="spinner"></span><span>Sending… keep this open</span></div>`; return; }
  if (ssPhase === "done") { const fail = ssStatus.filter((s) => s === "failed").length; f.innerHTML = `<button class="btn btn-soft" onclick="ssCopyLog()">Copy log</button>${fail ? `<button class="btn btn-soft" onclick="ssRetryFailed()">Retry failed (${fail})</button>` : ""}<button class="btn btn-soft" onclick="closeSendStatus();showView('history')">View history</button><button class="btn btn-primary" style="margin-left:auto" onclick="closeSendStatus()">Done</button>`; return; }
  if (ssPf.ready) f.innerHTML = `<button class="btn btn-soft" onclick="closeSendStatus()">Cancel</button><button class="btn btn-primary" style="margin-left:auto" onclick="ssStart()">${ICO_SEND} Start send · ${ssTargets.length}</button>`;
  else f.innerHTML = `<span class="ss-blocked">Resolve the checks above to send.</span><button class="btn btn-soft" style="margin-left:auto" onclick="closeSendStatus()">Close</button>`;
}
function ssStart() {
  if (ssPhase !== "ready" || !ssPf.ready) return;
  ssPhase = "running"; setBusy(ssMeta.spin, ssMeta.btn, ssMeta.txt, true); renderSsFooter();
  const delay = Math.max(320, (settings.delaySeconds || 0) * 300);
  let i = 0;
  (function next() {
    if (i >= ssTargets.length) { ssFinish(); return; }
    ssStatus[i] = "sending"; renderSsList(); renderSsProgress();
    setTimeout(() => { ssStatus[i] = "success"; renderSsList(); renderSsProgress(); i++; next(); }, delay);
  })();
}
function ssFinish() {
  ssPhase = "done";
  const d = userData(); d.history = d.history || [];
  let nextId = (d.history.reduce((m, r) => Math.max(m, r.id || 0), 0)) + 1;
  ssTargets.forEach((t, i) => {
    const type = t.phone ? "contact" : "group"; const status = ssStatus[i] === "failed" ? "failed" : "success";
    d.history.unshift({ id: nextId++, targetName: t.name, targetType: type, status, at: new Date().toISOString() });
    if (status === "success") {
      if (type === "group") { const g = (d.groups || []).find((x) => x.name === t.name); if (g) g.lastReleased = new Date().toISOString(); }
      else { const c = (d.contacts || []).find((x) => x.name === t.name); if (c) c.lastReleased = new Date().toISOString(); }
    }
  });
  persist(); logAudit("release", `${ssTargets.length} target${ssTargets.length === 1 ? "" : "s"}`);
  setBusy(ssMeta.spin, ssMeta.btn, ssMeta.txt, false, ssMeta.label); loadGroups(); loadContacts();
  toast("Send complete ✓"); if (typeof updateNotifBadge === "function") updateNotifBadge();
  renderSsFooter();
}
function ssRetryFailed() { let any = false; ssStatus = ssStatus.map((s) => { if (s === "failed") { any = true; return "queued"; } return s; }); if (!any) return; ssPhase = "ready"; ssPf = runPreflight(ssTargets); renderSendStatus(); }
function ssCopyLog() { const lines = ssTargets.map((t, i) => `${ssStatus[i] === "success" ? "✓" : ssStatus[i] === "failed" ? "✗" : "•"} ${t.name} — ${ssStatusLabel(ssStatus[i])}`).join("\n"); navigator.clipboard.writeText(lines).then(() => toast("Log copied ✓"), () => toast("Copy failed", "err")); }
function setBusy(spin, btn, txt, busy, label) { const b = document.getElementById(btn); if (b) b.disabled = busy; const x = document.getElementById(txt); if (x && label !== undefined) x.textContent = busy ? "Sending…" : label; else if (x) x.textContent = busy ? "Sending…" : x.textContent; document.getElementById(spin)?.classList.toggle("hidden", !busy); }
function showLog() { const p = document.getElementById("statusPanel"); p.classList.remove("hidden"); p.classList.remove("collapsed"); syncLogCollapseBtn(); }
function toggleStatusLog() { const p = document.getElementById("statusPanel"); p.classList.toggle("collapsed"); syncLogCollapseBtn(); }
function clearStatusLog() { const l = document.getElementById("logLines"); if (l) l.innerHTML = ""; toast("Status log cleared"); }
function syncLogCollapseBtn() { const b = document.getElementById("logCollapseBtn"); if (!b) return; const collapsed = document.getElementById("statusPanel").classList.contains("collapsed"); b.title = collapsed ? "Expand log" : "Collapse log"; }
function maybeShowStatusOnSend() { const p = getStatusLogPref(); if (p === "always" || p === "auto") showLog(); }
function appendLog(type, msg) { showLog(); const l = document.getElementById("logLines"); const d = document.createElement("div"); d.className = "ll " + type; d.textContent = msg; l.appendChild(d); l.scrollTop = 1e9; }

/* ════ Send History (tabular / board + pagination) ════ */
let historyMode = localStorage.getItem("history-mode") || "table";
let historyFilter = "all";
let historyPage = 1;
const HISTORY_PER_PAGE = 8;
function setHistoryMode(m) { historyMode = m; localStorage.setItem("history-mode", m); document.querySelectorAll("#historyModeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === m)); loadReleaseHistory(); }
function setHistoryFilter(f) { historyFilter = f; historyPage = 1; document.querySelectorAll("#historyFilterSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === f)); loadReleaseHistory(); }
function historyGoto(p) { historyPage = p; loadReleaseHistory(); const w = document.getElementById("historyWrap"); if (w) w.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
function loadReleaseHistory() {
  const wrap = document.getElementById("historyWrap"); if (!wrap) return;
  document.querySelectorAll("#historyModeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === historyMode));
  document.querySelectorAll("#historyFilterSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === historyFilter));
  const all = userData().history || [];
  // stat cards
  const stats = document.getElementById("historyStats");
  if (stats) {
    const ok = all.filter((r) => r.status === "success").length;
    const groupsN = all.filter((r) => r.targetType === "group").length;
    stats.innerHTML = `
      <div class="stat"><div class="n">${all.length}</div><div class="l">Total sends</div></div>
      <div class="stat"><div class="n">${ok}</div><div class="l">Delivered</div></div>
      <div class="stat"><div class="n">${all.length - ok}</div><div class="l">Failed</div></div>
      <div class="stat"><div class="n">${groupsN}</div><div class="l">To groups</div></div>`;
  }
  const q = (document.getElementById("historySearch") && document.getElementById("historySearch").value || "").toLowerCase();
  let items = all.filter((r) => historyFilter === "all" || (historyFilter === "success" ? r.status === "success" : r.status !== "success"));
  if (q) items = items.filter((r) => (r.targetName || "").toLowerCase().includes(q) || (r.targetType || "").toLowerCase().includes(q));
  const pager = document.getElementById("historyPager"); if (pager) pager.innerHTML = "";
  if (!items.length) { wrap.innerHTML = `<div class="tbl-wrap"><div class="empty"><div class="empty-ico">🗂️</div><p>${all.length ? "No sends match your filters." : "No sends recorded yet."}</p></div></div>`; return; }
  const pages = Math.ceil(items.length / HISTORY_PER_PAGE);
  if (historyPage > pages) historyPage = pages;
  const start = (historyPage - 1) * HISTORY_PER_PAGE;
  const page = items.slice(start, start + HISTORY_PER_PAGE);
  const badge = (r) => `<span class="hstatus ${r.status === "success" ? "ok" : "err"}"><span class="hdot"></span>${r.status === "success" ? "Delivered" : "Failed"}</span>`;
  const typeChip = (r) => `<span class="htype">${r.targetType === "contact" ? "👤" : "👥"} ${esc(r.targetType || "—")}</span>`;
  if (historyMode === "board") {
    wrap.innerHTML = `<div class="card-grid">` + page.map((r) => `<article class="hcard"><div class="hcard-top">${badge(r)}${typeChip(r)}</div><b class="hcard-name">${esc(r.targetName)}</b><div class="hcard-time">${new Date(r.at).toLocaleString()}</div>${r.status !== "success" ? `<button class="btn btn-soft btn-sm" onclick="retryRelease(${r.id})">Retry</button>` : '<span class="hcard-check">✓ Sent</span>'}</article>`).join("") + `</div>`;
  } else {
    wrap.innerHTML = `<div class="tbl-wrap"><table class="data grid-table"><thead><tr><th>Status</th><th>Target</th><th>Type</th><th>When</th><th></th></tr></thead><tbody>` +
      page.map((r) => `<tr><td>${badge(r)}</td><td><b>${esc(r.targetName)}</b></td><td>${typeChip(r)}</td><td><span class="hint" style="margin:0">${new Date(r.at).toLocaleString()}</span></td><td style="text-align:right">${r.status !== "success" ? `<button class="btn btn-soft btn-sm" onclick="retryRelease(${r.id})">Retry</button>` : ""}</td></tr>`).join("") +
      `</tbody></table></div>`;
  }
  if (pager && pages > 1) {
    let btns = `<button class="pager-btn" ${historyPage === 1 ? "disabled" : ""} onclick="historyGoto(${historyPage - 1})">‹ Prev</button>`;
    for (let p = 1; p <= pages; p++) btns += `<button class="pager-btn${p === historyPage ? " on" : ""}" onclick="historyGoto(${p})">${p}</button>`;
    btns += `<button class="pager-btn" ${historyPage === pages ? "disabled" : ""} onclick="historyGoto(${historyPage + 1})">Next ›</button>`;
    pager.innerHTML = `<span class="pager-info">Showing ${start + 1}–${Math.min(start + HISTORY_PER_PAGE, items.length)} of ${items.length}</span><div class="pager-btns">${btns}</div>`;
  }
}
function retryRelease(id) {
  if (!confirm("Retry this failed send?")) return;
  const d = userData(); const r = (d.history || []).find((x) => x.id === id);
  if (r) { r.status = "success"; r.at = new Date().toISOString(); persist(); }
  toast("Retry started"); maybeShowStatusOnSend(); showLog(); appendLog("success", `✓ Retried ${r ? r.targetName : ""}`); appendLog("done", "Retry complete ✓"); loadReleaseHistory();
}

/* ════ Scheduled weekly send ════ */
function loadScheduledJob() {
  const d = userData().scheduledJob || { enabled: false, dow: 0, hour: 9, minute: 0, lastRunAt: null };
  const en = document.getElementById("schedEnabled"), dow = document.getElementById("schedDow"), hour = document.getElementById("schedHour"), min = document.getElementById("schedMinute"), last = document.getElementById("schedLastRun");
  if (en) en.checked = !!d.enabled; if (dow) dow.value = String(d.dow ?? 0); if (hour) hour.value = String(d.hour ?? 9); if (min) min.value = String(d.minute ?? 0);
  if (last) last.textContent = d.lastRunAt ? `Last run: ${new Date(d.lastRunAt).toLocaleString()}` : "Not run yet";
}
function saveScheduledJob() {
  userData().scheduledJob = { enabled: document.getElementById("schedEnabled").checked, dow: parseInt(document.getElementById("schedDow").value || "0", 10), hour: parseInt(document.getElementById("schedHour").value || "9", 10), minute: parseInt(document.getElementById("schedMinute").value || "0", 10), lastRunAt: userData().scheduledJob?.lastRunAt || null };
  persist(); toast("Scheduled send saved"); loadScheduledJob();
}

/* ════ Settings: automation / security / data / audit ════ */
function saveAutomation() { settings = { headless: document.getElementById("setHeadless").checked, delaySeconds: parseInt(document.getElementById("setDelay").value) || 0 }; userData().settings = JSON.parse(JSON.stringify(settings)); persist(); toast("Settings saved ✓"); }
function changePassword() {
  const cur = document.getElementById("curPw").value, nw = document.getElementById("newPw").value;
  if (nw.length < 8) { toast("Password must be at least 8 characters", "err"); return; }
  const u = currentUser(); if (u && u.password && cur && cur !== u.password) { toast("Current password is incorrect", "err"); return; }
  const res = requestPasswordReset(nw);
  document.getElementById("curPw").value = ""; document.getElementById("newPw").value = "";
  if (res.direct) toast("Password updated ✓");
  else { toast("Password reset requested — awaiting admin approval"); if (typeof updateNotifBadge === "function") updateNotifBadge(); }
}
function loadAudit() {
  const box = document.getElementById("auditList"); if (!box) return;
  const rows = userData().audit || [];
  if (!rows.length) { box.innerHTML = "No activity yet."; return; }
  const label = { login: "Signed in", login_failed: "Failed login", logout: "Signed out", signup: "Account created", release: "Released messages", direct_whatsapp: "Opened WhatsApp", password_change: "Password changed", config_restore: "Config restored" };
  box.innerHTML = rows.map((r) => `<div class="audit-row"><span class="act">${esc(label[r.action] || r.action)}</span><span class="meta">${esc(r.detail || "")} · ${esc(r.ip || "")}</span><span class="when">${new Date(r.at).toLocaleString()}</span></div>`).join("");
}
function exportConfig() {
  const d = userData();
  const cfg = { groups: d.groups, contacts: d.contacts, templates: d.templates, settings: d.settings };
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `schedule_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); toast("Backup downloaded ✓");
}
function importConfig(input) {
  const f = input.files[0]; input.value = ""; if (!f) return;
  if (!confirm("Restoring REPLACES current groups, contacts, templates and settings (login kept). Continue?")) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const cfg = JSON.parse(reader.result); const d = userData();
      if (cfg.groups) d.groups = cfg.groups; if (cfg.contacts) d.contacts = cfg.contacts; if (cfg.templates) d.templates = cfg.templates; if (cfg.settings) d.settings = cfg.settings;
      persist(); gSel = cSel = null; tableSelected = {}; colWidths = {};
      loadGroups(); loadTemplates(); loadContacts(); loadSettings(); logAudit("config_restore", ""); toast("Config restored ✓");
    } catch (e) { toast("Invalid JSON file", "err"); }
  };
  reader.readAsText(f);
}
function resetDemo() { if (!confirm("Reset all POC demo data on this device to the original seed?")) return; resetStore(); location.reload(); }

/* ════ Helpers ════ */
async function copyBox(id) { try { await navigator.clipboard.writeText(document.getElementById(id).value); toast("Copied ✓"); } catch { toast("Copy failed", "err"); } }
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast("Copied ✓"); } catch { toast("Copy failed", "err"); } }

/* ════ GROUPS: table grid + detail page (#7) ════ */
let groupsMode = localStorage.getItem("groups-mode") || "table";
let gdIdx = null, gdEdit = false, gdWorking = null;
function _syncGroupsMode() {
  document.querySelectorAll("#groupsModeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === groupsMode));
  const tw = document.getElementById("groupTableWrap"), cw = document.getElementById("groupCardsWrap"), cc = document.getElementById("groupsCards");
  if (tw) tw.style.display = groupsMode === "table" ? "" : "none";
  if (cw) cw.style.display = groupsMode === "cards" ? "" : "none";
  if (cc) cc.style.display = "none"; // legacy split retired in favour of card grid → detail page
}
function setGroupsMode(m) { groupsMode = m; localStorage.setItem("groups-mode", m); _syncGroupsMode(); renderGroupTable(); }
/* Cards mode: a responsive grid of clickable cards → detail page (#1) */
function renderGroupCards() {
  const wrap = document.getElementById("groupCardsWrap"); if (!wrap) return;
  const q = (document.getElementById("groupTableSearch") && document.getElementById("groupTableSearch").value || "").toLowerCase();
  if (!groups.length) { wrap.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><p>No groups yet</p><button class="btn btn-primary btn-sm" onclick="newGroupDetail()">+ New group</button></div>`; return; }
  const rows = groups.map((g, i) => ({ g, i })).filter(({ g }) => !q || g.name.toLowerCase().includes(q));
  if (!rows.length) { wrap.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>No groups match your search.</p></div>'; return; }
  wrap.innerHTML = rows.map(({ g, i }) => {
    const active = g.schedule.filter((e) => (e.from || "").trim()).length;
    const chips = g.schedule.filter((e) => (e.from || "").trim()).map((e) => `<span class="ec-chip">${esc(e.day.slice(0, 3))}</span>`).join("") || '<span class="ec-none">No schedule</span>';
    return `<article class="ecard" onclick="openGroupDetail(${i})" tabindex="0" onkeydown="if(event.key==='Enter')openGroupDetail(${i})">
      <div class="ecard-top"><div class="av small${g.pic ? " has-img" : ""}">${avatarInner(g.name, g.pic)}${g.waLinked ? '<span class="wa-badge"></span>' : ""}</div>
        <div class="ecard-id"><b>${esc(g.name)}</b><span>${active ? `${active} day${active === 1 ? "" : "s"}` : "No schedule"}</span></div>
        <span class="ecard-go">›</span></div>
      <div class="ecard-days">${chips}</div>
      <div class="ecard-foot"><span class="${g.waLinked ? "status-on" : "status-off"}">${g.waLinked ? "On WhatsApp" : "Not linked"}</span><span class="hint" style="margin:0">${g.lastReleased ? "Sent " + relTime(g.lastReleased) : "Never sent"}</span></div>
    </article>`;
  }).join("");
}
function renderGroupTable() {
  _syncGroupsMode();
  if (groupsMode === "cards") { renderGroupCards(); return; }
  const wrap = document.getElementById("groupTableWrap"); if (!wrap) return;
  const q = (document.getElementById("groupTableSearch") && document.getElementById("groupTableSearch").value || "").toLowerCase();
  if (!groups.length) { wrap.innerHTML = `<div class="tbl-wrap"><div class="empty"><div class="empty-ico"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><p>No groups yet</p><button class="btn btn-primary btn-sm" onclick="newGroupDetail()">+ New group</button></div></div>`; return; }
  const rows = groups.map((g, i) => ({ g, i })).filter(({ g }) => !q || g.name.toLowerCase().includes(q));
  if (!rows.length) { wrap.innerHTML = '<div class="tbl-wrap"><div class="empty"><p>No groups match your search.</p></div></div>'; return; }
  wrap.innerHTML = `<div class="tbl-wrap"><table class="data grid-table"><thead><tr><th>Group</th><th>Schedule</th><th>Status</th><th>Last sent</th><th></th></tr></thead><tbody>` +
    rows.map(({ g, i }) => {
      const days = g.schedule.filter((e) => (e.from || "").trim()).map((e) => e.day.slice(0, 3)).join(" · ") || "—";
      return `<tr onclick="openGroupDetail(${i})"><td><div class="grid-name"><div class="av small${g.pic ? " has-img" : ""}">${avatarInner(g.name, g.pic)}${g.waLinked ? '<span class="wa-badge"></span>' : ""}</div><b>${esc(g.name)}</b></div></td><td>${g.schedule.length ? `${g.schedule.length} day${g.schedule.length === 1 ? "" : "s"} · <span class="hint" style="margin:0">${esc(days)}</span>` : '<span class="hint" style="margin:0">No schedule</span>'}</td><td>${g.waLinked ? '<span class="status-on">On WhatsApp</span>' : '<span class="status-off">Not linked</span>'}</td><td>${g.lastReleased ? relTime(g.lastReleased) : "—"}</td><td class="grid-go">›</td></tr>`;
    }).join("") + `</tbody></table></div>`;
}
function openGroupDetail(i) { gdIdx = i; gdEdit = false; gdWorking = JSON.parse(JSON.stringify(groups[i])); showView("group-detail"); }
function newGroupDetail() { gdIdx = null; gdWorking = { name: "", nickname: "", schedule: [], message: "", inviteLink: "", pic: "", waLinked: false, lastReleased: "" }; gdEdit = true; showView("group-detail"); }
function backToGroups() { showView("groups"); }
function gdToggleEdit() { if (gdEdit) { if (gdIdx == null) { backToGroups(); return; } gdEdit = false; gdWorking = JSON.parse(JSON.stringify(groups[gdIdx])); } else gdEdit = true; renderGroupDetail(); }
function gdRefreshAvatar() { const el = document.getElementById("gdAvatar"); if (el) { el.className = "editor-av" + (gdWorking.pic ? " has-img" : ""); el.innerHTML = avatarInner(gdWorking.name, gdWorking.pic); } }
function gdSetField(f, v) { gdWorking[f] = v; if (f === "name") gdRefreshAvatar(); gdPreview(); }
function gdSetCell(day, field, val) { let e = gdWorking.schedule.find((x) => x.day === day); if (!e) { e = { day, from: "", to: "" }; gdWorking.schedule.push(e); } e[field] = val.trim(); if (!e.from && !e.to) gdWorking.schedule = gdWorking.schedule.filter((x) => x.day !== day); gdWorking.schedule.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day)); gdPreview(); }
function gdPickImage(input) { const f = input.files[0]; input.value = ""; readImageAsDataURL(f, (url) => { gdWorking.pic = url; gdRefreshAvatar(); toast("Photo updated — save to keep"); }); }
function gdSave() { if (!gdWorking.name.trim()) { toast("Enter a group name", "err"); return; } const auto = genMessage(gdWorking.schedule); if ((gdWorking.message || "").trim() === auto.trim()) gdWorking.message = ""; if (gdIdx == null) { groups.push(JSON.parse(JSON.stringify(gdWorking))); gdIdx = groups.length - 1; } else groups[gdIdx] = JSON.parse(JSON.stringify(gdWorking)); persistGroups(); loadGroups(); gdWorking = JSON.parse(JSON.stringify(groups[gdIdx])); gdEdit = false; renderGroupDetail(); toast("Group saved ✓"); }
function gdDelete() { if (gdIdx == null) { backToGroups(); return; } if (!confirm(`Delete "${groups[gdIdx].name}"?`)) return; groups.splice(gdIdx, 1); persistGroups(); loadGroups(); backToGroups(); toast("Group deleted"); }
function gdReleaseCurrent() { if (gdIdx == null) return; const g = groups[gdIdx]; releaseWithMode([{ name: g.name, message: replaceTokens(messageFor(g)) }], "relAllSpin", "relAllBtn", "relAllTxt", "Send all", "automated"); }
function gdPreview() { const el = document.getElementById("gdPreview"); if (!el) return; const rendered = replaceTokens(messageFor(gdWorking)); el.innerHTML = `<div class="preview-h">WhatsApp preview</div><div class="preview-b">${renderWhatsAppPreview(rendered) || "<i>No message</i>"}</div>`; }
function renderGroupDetail() {
  const el = document.getElementById("groupDetail"); if (!el) return;
  if (gdWorking == null) { el.innerHTML = '<p class="hint">Select a group.</p>'; return; }
  const g = gdWorking;
  const scheduleRows = DAYS.map((day) => { const e = g.schedule.find((x) => x.day === day) || {}; const f = e.from || "", t = e.to || "";
    return gdEdit
      ? `<tr><td class="day-col">${day}</td><td><div class="crange"><input class="cell" list="timeOptions" value="${escA(f)}" placeholder="From" oninput="gdSetCell('${day}','from',this.value)"/><span class="dash">–</span><input class="cell" list="timeOptions" value="${escA(t)}" placeholder="To" oninput="gdSetCell('${day}','to',this.value)"/></div></td></tr>`
      : `<tr class="${f || t ? "filled" : ""}"><td class="day-col">${day}</td><td>${(f || t) ? `<b>${esc(f)}</b> – <b>${esc(t)}</b>` : '<span class="hint" style="margin:0">—</span>'}</td></tr>`; }).join("");
  el.innerHTML = `
    <div class="detail-top"><button class="btn btn-soft btn-sm" onclick="backToGroups()">← Back to groups</button><div style="flex:1"></div>
      ${gdEdit ? `<button class="btn btn-soft btn-sm" onclick="gdToggleEdit()">Cancel</button><button class="btn btn-primary btn-sm" onclick="gdSave()">Save changes</button>` : `<button class="btn btn-primary btn-sm" onclick="gdToggleEdit()">✎ Edit details</button><button class="btn btn-soft btn-sm" onclick="gdReleaseCurrent()">Send</button><button class="icon-btn" title="Delete" onclick="gdDelete()">${TRASH_ICO}</button>`}
    </div>
    <div class="detail-hero">
      <div class="detail-av-wrap"><div class="editor-av${g.pic ? " has-img" : ""}" id="gdAvatar">${avatarInner(g.name, g.pic)}</div>${gdEdit ? `<button class="editor-av-edit" onclick="document.getElementById('gdImg').click()" title="Change photo"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button><input id="gdImg" type="file" accept="image/*" hidden onchange="gdPickImage(this)"/>` : ""}</div>
      <div class="detail-hero-body">
        ${gdEdit ? `<input class="field detail-name-input" value="${escA(g.name)}" oninput="gdSetField('name',this.value)" placeholder="WhatsApp group name"/><input class="field detail-nick-input" value="${escA(g.nickname || "")}" oninput="gdSetField('nickname',this.value)" placeholder="Short nickname for tables (optional)"/>` : `<h2>${esc(g.name || "Untitled group")}</h2>`}
        <div class="detail-badges">${!gdEdit && g.nickname && g.nickname.trim() ? `<span class="chip chip-default">“${esc(g.nickname)}”</span>` : ""}<span class="chip">${g.schedule.length} day${g.schedule.length === 1 ? "" : "s"}</span>${g.waLinked ? '<span class="chip chip-default">On WhatsApp</span>' : ""}${g.lastReleased ? `<span class="chip">Sent ${relTime(g.lastReleased)}</span>` : ""}</div>
      </div>
    </div>
    <div class="detail-grid">
      <div class="sec"><div class="sec-h">Weekly schedule${gdEdit ? '<span class="hint" style="margin:0 0 0 auto">editable</span>' : ""}</div><div class="sec-b" style="padding:0"><div class="sched-canvas" style="border:none;box-shadow:none"><table class="sched detail-sched"><tbody>${scheduleRows}</tbody></table></div></div></div>
      <div class="sec"><div class="sec-h">Message &amp; details</div><div class="sec-b">
        ${gdEdit ? `<div class="g-field" style="margin-bottom:14px"><div class="flabel">Invite link <span class="flabel-soft">optional</span></div><input class="field" value="${escA(g.inviteLink || "")}" oninput="gdSetField('inviteLink',this.value)" placeholder="https://chat.whatsapp.com/…"/></div><div class="g-field" style="margin-bottom:10px"><div class="flabel">Message</div><textarea class="field" style="min-height:150px" oninput="gdSetField('message',this.value)">${esc(messageFor(g))}</textarea></div>` : (g.inviteLink ? '<div class="hint" style="margin:0 0 10px">Invite link set · opens the group directly.</div>' : "")}
        <div class="msg-preview" id="gdPreview"></div>
      </div></div>
    </div>`;
  gdPreview();
}

/* ════ CONTACTS: table grid + detail page (#7) ════ */
let contactsMode = localStorage.getItem("contacts-mode") || "table";
let cdIdx = null, cdEdit = false, cdWorking = null;
function _syncContactsMode() {
  document.querySelectorAll("#contactsModeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === contactsMode));
  const tw = document.getElementById("contactTableWrap"), cw = document.getElementById("contactCardsWrap"), cc = document.getElementById("contactsCards");
  if (tw) tw.style.display = contactsMode === "table" ? "" : "none";
  if (cw) cw.style.display = contactsMode === "cards" ? "" : "none";
  if (cc) cc.style.display = "none";
}
function setContactsMode(m) { contactsMode = m; localStorage.setItem("contacts-mode", m); _syncContactsMode(); renderContactTable(); }
function renderContactCards() {
  const wrap = document.getElementById("contactCardsWrap"); if (!wrap) return;
  const q = (document.getElementById("contactTableSearch") && document.getElementById("contactTableSearch").value || "").toLowerCase();
  if (!contacts.length) { wrap.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><p>No contacts yet</p><button class="btn btn-primary btn-sm" onclick="newContactDetail()">+ New contact</button></div>`; return; }
  const rows = contacts.map((c, i) => ({ c, i })).filter(({ c }) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q));
  if (!rows.length) { wrap.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>No contacts match your search.</p></div>'; return; }
  wrap.innerHTML = rows.map(({ c, i }) => {
    const prev = esc((c.message || "").slice(0, 70)) + ((c.message || "").length > 70 ? "…" : "");
    return `<article class="ecard" onclick="openContactDetail(${i})" tabindex="0" onkeydown="if(event.key==='Enter')openContactDetail(${i})">
      <div class="ecard-top"><div class="av small${c.pic ? " has-img" : ""}">${avatarInner(c.name, c.pic)}${c.waLinked ? '<span class="wa-badge"></span>' : ""}</div>
        <div class="ecard-id"><b>${esc(c.name)}</b><span>+${esc(c.phone || "—")}</span></div>
        <span class="ecard-go">›</span></div>
      <div class="ecard-msg">${prev || '<span class="ec-none">No message</span>'}</div>
      <div class="ecard-foot"><span class="${c.waLinked ? "status-on" : "status-off"}">${c.waLinked ? "On WhatsApp" : "Not verified"}</span><span class="hint" style="margin:0">${c.lastReleased ? "Sent " + relTime(c.lastReleased) : "Never sent"}</span></div>
    </article>`;
  }).join("");
}
function renderContactTable() {
  _syncContactsMode();
  if (contactsMode === "cards") { renderContactCards(); return; }
  const wrap = document.getElementById("contactTableWrap"); if (!wrap) return;
  const q = (document.getElementById("contactTableSearch") && document.getElementById("contactTableSearch").value || "").toLowerCase();
  if (!contacts.length) { wrap.innerHTML = `<div class="tbl-wrap"><div class="empty"><div class="empty-ico"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><p>No contacts yet</p><button class="btn btn-primary btn-sm" onclick="newContactDetail()">+ New contact</button></div></div>`; return; }
  const rows = contacts.map((c, i) => ({ c, i })).filter(({ c }) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q));
  if (!rows.length) { wrap.innerHTML = '<div class="tbl-wrap"><div class="empty"><p>No contacts match your search.</p></div></div>'; return; }
  wrap.innerHTML = `<div class="tbl-wrap"><table class="data grid-table"><thead><tr><th>Contact</th><th>Phone</th><th>Message</th><th>Last sent</th><th></th></tr></thead><tbody>` +
    rows.map(({ c, i }) => {
      const prev = esc((c.message || "").slice(0, 40)) + ((c.message || "").length > 40 ? "…" : "");
      return `<tr onclick="openContactDetail(${i})"><td><div class="grid-name"><div class="av small${c.pic ? " has-img" : ""}">${avatarInner(c.name, c.pic)}${c.waLinked ? '<span class="wa-badge"></span>' : ""}</div><b>${esc(c.name)}</b></div></td><td>+${esc(c.phone)}</td><td><span class="hint" style="margin:0">${prev || "—"}</span></td><td>${c.lastReleased ? relTime(c.lastReleased) : "—"}</td><td class="grid-go">›</td></tr>`;
    }).join("") + `</tbody></table></div>`;
}
function openContactDetail(i) { cdIdx = i; cdEdit = false; cdWorking = JSON.parse(JSON.stringify(contacts[i])); showView("contact-detail"); }
function newContactDetail() { cdIdx = null; cdWorking = { name: "", phone: "", message: "", pic: "", waLinked: false, lastReleased: "" }; cdEdit = true; showView("contact-detail"); }
function backToContacts() { showView("contacts"); }
function cdToggleEdit() { if (cdEdit) { if (cdIdx == null) { backToContacts(); return; } cdEdit = false; cdWorking = JSON.parse(JSON.stringify(contacts[cdIdx])); } else cdEdit = true; renderContactDetail(); }
function cdRefreshAvatar() { const el = document.getElementById("cdAvatar"); if (el) { el.className = "editor-av" + (cdWorking.pic ? " has-img" : ""); el.innerHTML = avatarInner(cdWorking.name, cdWorking.pic); } }
function cdSetField(f, v) { cdWorking[f] = f === "phone" ? v.replace(/\D/g, "") : v; if (f === "name") cdRefreshAvatar(); cdPreview(); }
function cdPickImage(input) { const f = input.files[0]; input.value = ""; readImageAsDataURL(f, (url) => { cdWorking.pic = url; cdRefreshAvatar(); toast("Photo updated — save to keep"); }); }
function cdSave() { if (!cdWorking.name.trim()) { toast("Enter contact name", "err"); return; } if (!cdWorking.phone) { toast("Enter phone (digits, country code)", "err"); return; } if (cdIdx == null) { contacts.push(JSON.parse(JSON.stringify(cdWorking))); cdIdx = contacts.length - 1; } else contacts[cdIdx] = JSON.parse(JSON.stringify(cdWorking)); persistContacts(); loadContacts(); cdWorking = JSON.parse(JSON.stringify(contacts[cdIdx])); cdEdit = false; renderContactDetail(); toast("Contact saved ✓"); }
function cdDelete() { if (cdIdx == null) { backToContacts(); return; } if (!confirm(`Delete "${contacts[cdIdx].name}"?`)) return; contacts.splice(cdIdx, 1); persistContacts(); loadContacts(); backToContacts(); toast("Contact deleted"); }
function cdReleaseCurrent() { if (cdIdx == null) return; const c = contacts[cdIdx]; const t = contactTarget(c); if (!t.message.trim()) { toast("Message is empty", "err"); return; } releaseWithMode([t], "relCAllSpin", "relCAllBtn", "relCAllTxt", "Automated All", "automated"); }
function cdPreview() { const el = document.getElementById("cdPreview"); if (!el) return; const rendered = replaceTokens(cdWorking.message || ""); el.innerHTML = `<div class="preview-h">WhatsApp preview</div><div class="preview-b">${renderWhatsAppPreview(rendered) || "<i>No message</i>"}</div>`; }
function renderContactDetail() {
  const el = document.getElementById("contactDetail"); if (!el) return;
  if (cdWorking == null) { el.innerHTML = '<p class="hint">Select a contact.</p>'; return; }
  const c = cdWorking;
  el.innerHTML = `
    <div class="detail-top"><button class="btn btn-soft btn-sm" onclick="backToContacts()">← Back to contacts</button><div style="flex:1"></div>
      ${cdEdit ? `<button class="btn btn-soft btn-sm" onclick="cdToggleEdit()">Cancel</button><button class="btn btn-primary btn-sm" onclick="cdSave()">Save changes</button>` : `<button class="btn btn-primary btn-sm" onclick="cdToggleEdit()">✎ Edit details</button><button class="btn btn-soft btn-sm" onclick="cdReleaseCurrent()">Send</button><button class="icon-btn" title="Delete" onclick="cdDelete()">${TRASH_ICO}</button>`}
    </div>
    <div class="detail-hero">
      <div class="detail-av-wrap"><div class="editor-av${c.pic ? " has-img" : ""}" id="cdAvatar">${avatarInner(c.name, c.pic)}</div>${cdEdit ? `<button class="editor-av-edit" onclick="document.getElementById('cdImg').click()" title="Change photo"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button><input id="cdImg" type="file" accept="image/*" hidden onchange="cdPickImage(this)"/>` : ""}</div>
      <div class="detail-hero-body">
        ${cdEdit ? `<input class="field detail-name-input" value="${escA(c.name)}" oninput="cdSetField('name',this.value)" placeholder="Contact name"/>` : `<h2>${esc(c.name || "Untitled contact")}</h2>`}
        <div class="detail-badges"><span class="chip">+${esc(c.phone || "—")}</span>${c.waLinked ? '<span class="chip chip-default">On WhatsApp</span>' : ""}${c.lastReleased ? `<span class="chip">Sent ${relTime(c.lastReleased)}</span>` : ""}</div>
      </div>
    </div>
    <div class="detail-grid">
      <div class="sec"><div class="sec-h">Details</div><div class="sec-b">
        ${cdEdit ? `<div class="g-field"><div class="flabel">Phone <span class="flabel-soft">country code, digits only</span></div><input class="field" value="${escA(c.phone || "")}" oninput="cdSetField('phone',this.value)" placeholder="e.g. 923001234567"/><div class="hint">No "+", spaces or dashes.</div></div>` : `<div class="dash-status-row"><span>Phone</span><span style="margin-left:auto;font-weight:700">+${esc(c.phone || "—")}</span></div><div class="dash-status-row"><span>Status</span><span style="margin-left:auto">${c.waLinked ? '<span class="status-on">On WhatsApp</span>' : '<span class="status-off">Not verified</span>'}</span></div>`}
      </div></div>
      <div class="sec"><div class="sec-h">Message</div><div class="sec-b">
        ${cdEdit ? `<textarea class="field" style="min-height:150px;margin-bottom:10px" oninput="cdSetField('message',this.value)" placeholder="Type a message… *bold* {date} {weekday}">${esc(c.message || "")}</textarea>` : ""}
        <div class="msg-preview" id="cdPreview"></div>
      </div></div>
    </div>`;
  cdPreview();
}

/* ════ LISTS (WhatsApp label-based audiences) ════ */
function listById(id) { return lists.find((l) => l.id === id); }
function listMembers(list) { return (list.members || []).map((ph) => contacts.find((c) => c.phone === ph)).filter(Boolean); }
function listSelSet(id) { if (!listSel[id]) listSel[id] = {}; return listSel[id]; }
function listMsg(list) { return list.message && list.message.trim() ? list.message : "*Reminder*\nDear parent, please note the updated class schedule.\n*Kindly acknowledge.*"; }
function labelChip(l) { return `<span class="lbl-chip">${esc(l)}</span>`; }
function setListMode(m) { listMode = m; localStorage.setItem("lists-mode", m); renderLists(); }
function setListActive(id) { listActive = id; renderLists(); }
function toggleListSel(id, phone, checked) { const s = listSelSet(id); if (checked) s[phone] = true; else delete s[phone]; updateListSelCount(id); }
function listSelectAll(id, v) { const s = listSelSet(id); listMembers(listById(id)).forEach((c) => { if (v) s[c.phone] = true; else delete s[c.phone]; }); renderLists(); }
function updateListSelCount(id) { const el = document.getElementById("lcount-" + id); if (!el) return; const n = Object.keys(listSelSet(id)).length; el.textContent = n ? `${n} selected` : ""; }

function renderLists() {
  const wrap = document.getElementById("listsWrap"); if (!wrap) return;
  document.querySelectorAll("#listModeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === listMode));
  if (!lists.length) {
    wrap.innerHTML = `<div class="tbl-wrap"><div class="empty"><div class="empty-ico">🏷️</div><p>No lists yet. Create one and discover contacts from your WhatsApp labels.</p><button class="btn btn-primary btn-sm" onclick="newList()">+ New list</button></div></div>`;
    return;
  }
  if (listMode === "tabs") renderListTabs(wrap); else renderListStack(wrap, listMode);
}
function listHeaderActions(list) {
  return `<div class="list-actions">
    <button class="btn btn-ghost btn-sm" onclick="syncList('${list.id}')" title="Discover contacts from labels">Sync</button>
    <button class="btn btn-ghost btn-sm" onclick="openListMembers('${list.id}')">Manage</button>
    <button class="btn btn-ghost btn-sm" onclick="editList('${list.id}')">Edit</button>
    <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteList('${list.id}')">Delete</button>
    <button class="btn btn-soft btn-sm" onclick="sendList('${list.id}',true)">Send selected</button>
    <button class="btn btn-primary btn-sm" onclick="sendList('${list.id}',false)">Send to all</button>
  </div>`;
}
function memberRow(list, c) {
  const sel = !!listSelSet(list.id)[c.phone];
  const labels = (c.labels || []).map(labelChip).join("");
  return `<tr>
    <td style="width:36px"><input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${c.phone}',this.checked)"/></td>
    <td><div class="grid-name"><div class="av small${c.pic ? " has-img" : ""}">${avatarInner(c.name, c.pic)}${c.waLinked ? '<span class="wa-badge"></span>' : ""}</div><b>${esc(c.name)}</b></div></td>
    <td>+${esc(c.phone)}</td>
    <td><div class="lbl-row">${labels || '<span class="hint" style="margin:0">—</span>'}</div></td>
    <td style="text-align:right"><button class="btn btn-soft btn-sm" onclick="sendListContact('${list.id}','${c.phone}')">Send</button></td>
  </tr>`;
}
function memberCard(list, c) {
  const sel = !!listSelSet(list.id)[c.phone];
  return `<div class="lmember${sel ? " on" : ""}">
    <input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${c.phone}',this.checked)"/>
    <div class="av small${c.pic ? " has-img" : ""}">${avatarInner(c.name, c.pic)}</div>
    <div style="min-width:0;flex:1"><b>${esc(c.name)}</b><div class="hint" style="margin:0">+${esc(c.phone)}</div><div class="lbl-row">${(c.labels || []).map(labelChip).join("")}</div></div>
    <button class="btn btn-soft btn-sm" onclick="sendListContact('${list.id}','${c.phone}')">Send</button>
  </div>`;
}
function listMembersUI(list, layout) {
  const mem = listMembers(list);
  if (!mem.length) return `<div class="empty" style="padding:30px"><p class="hint" style="margin:0 0 12px">No contacts in this list yet.</p><button class="btn btn-soft btn-sm" onclick="syncList('${list.id}')">Sync from labels</button> <button class="btn btn-soft btn-sm" onclick="openListMembers('${list.id}')">Add contacts</button></div>`;
  if (layout === "board") return `<div class="lmember-grid">${mem.map((c) => memberCard(list, c)).join("")}</div>`;
  return `<div class="tbl-wrap"><table class="data grid-table"><thead><tr><th></th><th>Contact</th><th>Phone</th><th>Labels</th><th></th></tr></thead><tbody>${mem.map((c) => memberRow(list, c)).join("")}</tbody></table></div>`;
}
function listHeadHtml(list) {
  const mem = listMembers(list);
  return `<div class="list-panel-head" style="--list-accent:${list.color || "var(--accent)"}">
    <div class="list-title"><span class="list-dot" style="background:${list.color || "var(--accent)"}"></span><b>${esc(list.name)}</b><span class="chip">${mem.length} contact${mem.length === 1 ? "" : "s"}</span><span class="hint list-selcount" id="lcount-${list.id}" style="margin:0"></span></div>
    ${listHeaderActions(list)}
  </div>
  <div class="list-labelrow">${(list.labels || []).length ? (list.labels.map(labelChip).join("") + `<button class="btn btn-ghost btn-sm" onclick="listSelectAll('${list.id}',true)">Select all</button><button class="btn btn-ghost btn-sm" onclick="listSelectAll('${list.id}',false)">Clear</button>`) : '<span class="hint" style="margin:0">No labels linked</span>'}</div>`;
}
function renderListTabs(wrap) {
  if (!listActive || !listById(listActive)) listActive = lists[0].id;
  const tabs = lists.map((l) => `<button class="pt-tabs-btn${l.id === listActive ? " on" : ""}" onclick="setListActive('${l.id}')"><span class="list-dot" style="background:${l.color || "var(--accent)"}"></span>${esc(l.name)}<span class="pt-tab-n">${(l.members || []).length}</span></button>`).join("");
  const list = listById(listActive);
  wrap.innerHTML = `<div class="pt-tabs list-tabs">${tabs}</div><div class="list-panel">${listHeadHtml(list)}${listMembersUI(list, "table")}</div>`;
  updateListSelCount(list.id);
}
function renderListStack(wrap, layout) {
  wrap.innerHTML = lists.map((list) => `<div class="list-panel">${listHeadHtml(list)}${listMembersUI(list, layout)}</div>`).join("");
  lists.forEach((l) => updateListSelCount(l.id));
}
function syncList(id) {
  const list = listById(id); if (!list) return;
  const disc = contacts.filter((c) => (c.labels || []).some((l) => (list.labels || []).includes(l))).map((c) => c.phone);
  const set = new Set(list.members || []); const before = set.size; disc.forEach((p) => set.add(p));
  list.members = [...set]; const added = set.size - before;
  persistLists(); renderLists();
  toast(added > 0 ? `Discovered ${added} new contact${added === 1 ? "" : "s"} ✓` : "List already up to date");
}
function syncAllLists() {
  lists.forEach((list) => { const disc = contacts.filter((c) => (c.labels || []).some((l) => (list.labels || []).includes(l))).map((c) => c.phone); const set = new Set(list.members || []); disc.forEach((p) => set.add(p)); list.members = [...set]; });
  persistLists(); renderLists(); toast("All lists synced from WhatsApp labels ✓");
}
function sendList(id, onlySelected) {
  const list = listById(id); if (!list) return;
  let mem = listMembers(list);
  if (onlySelected) { const s = listSelSet(id); mem = mem.filter((c) => s[c.phone]); }
  if (!mem.length) { toast(onlySelected ? "Select at least one contact first" : "This list has no contacts", "err"); return; }
  const fallback = replaceTokens(listMsg(list));
  const targets = mem.map((c) => ({ name: c.name, phone: c.phone, message: (c.message && c.message.trim()) ? replaceTokens(c.message) : fallback }));
  releaseWithMode(targets, "listSpin", "listBtn", "listTxt", "Send", "automated");
}
function sendListContact(id, phone) {
  const list = listById(id), c = contacts.find((x) => x.phone === phone); if (!c) return;
  const msg = (c.message && c.message.trim()) ? replaceTokens(c.message) : replaceTokens(listMsg(list));
  releaseWithMode([{ name: c.name, phone: c.phone, message: msg }], "listSpin", "listBtn", "listTxt", "Send", "automated");
}
/* List create / edit modal */
let listEditId = null;
function openListModalUI(id) {
  listEditId = id; const l = id ? listById(id) : null;
  document.getElementById("listModalTitle").textContent = id ? "Edit list" : "New list";
  document.getElementById("lmSaveBtn").textContent = id ? "Save changes" : "Create list";
  document.getElementById("lmName").value = l ? l.name : "";
  document.getElementById("lmColor").value = l ? (l.color || "#0d9488") : "#0d9488";
  const msgEl = document.getElementById("lmMessage"); if (msgEl) msgEl.value = l ? listMsg(l) : "";
  const labels = userData().waLabels || [];
  document.getElementById("lmLabels").innerHTML = labels.length ? labels.map((lab) => `<label class="perm-check"><input type="checkbox" value="${escA(lab)}" ${l && (l.labels || []).includes(lab) ? "checked" : ""}/><span>${esc(lab)}</span></label>`).join("") : '<span class="hint" style="margin:0">No WhatsApp labels found.</span>';
  document.getElementById("listModal").classList.add("show");
}
function newList() { openListModalUI(null); }
function editList(id) { openListModalUI(id); }
function closeListModal() { document.getElementById("listModal").classList.remove("show"); }
function saveList() {
  const name = document.getElementById("lmName").value.trim(); if (!name) { toast("List name is required", "err"); return; }
  const color = document.getElementById("lmColor").value;
  const labels = [...document.querySelectorAll("#lmLabels input:checked")].map((c) => c.value);
  const message = (document.getElementById("lmMessage") || {}).value || "";
  if (listEditId) { const l = listById(listEditId); l.name = name; l.color = color; l.labels = labels; l.message = message; }
  else { const id = "l-" + Math.random().toString(36).slice(2, 7); const disc = contacts.filter((c) => (c.labels || []).some((x) => labels.includes(x))).map((c) => c.phone); lists.push({ id, name, color, labels, members: disc, message }); listActive = id; }
  persistLists(); closeListModal(); renderLists();
  toast(listEditId ? "List updated ✓" : "List created — contacts discovered from labels ✓");
}
function deleteList(id) { const l = listById(id); if (!confirm(`Delete the "${l ? l.name : "list"}" list? (Contacts are not deleted)`)) return; lists = lists.filter((x) => x.id !== id); if (listActive === id) listActive = lists.length ? lists[0].id : null; persistLists(); renderLists(); toast("List deleted"); }
/* Manage members modal */
let lmemId = null;
function openListMembers(id) { lmemId = id; const l = listById(id); document.getElementById("lmemTitle").textContent = "Manage contacts · " + (l ? l.name : ""); document.getElementById("lmemSearch").value = ""; renderListMembers(); document.getElementById("listMembersModal").classList.add("show"); }
function closeListMembers() { document.getElementById("listMembersModal").classList.remove("show"); }
function renderListMembers() {
  const l = listById(lmemId); if (!l) return;
  const q = (document.getElementById("lmemSearch").value || "").toLowerCase();
  const rows = contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q));
  const el = document.getElementById("lmemList");
  el.innerHTML = rows.length ? rows.map((c) => {
    const inList = (l.members || []).includes(c.phone);
    return `<div class="lmem-row${inList ? " on" : ""}">
      <div class="av small${c.pic ? " has-img" : ""}">${avatarInner(c.name, c.pic)}</div>
      <div style="min-width:0;flex:1"><b>${esc(c.name)}</b><div class="hint" style="margin:0">+${esc(c.phone)} · ${(c.labels || []).join(", ") || "no labels"}</div></div>
      <button class="btn ${inList ? "btn-soft" : "btn-primary"} btn-sm" onclick="toggleMember('${c.phone}')">${inList ? "Remove" : "Add"}</button>
    </div>`;
  }).join("") : '<p class="hint">No contacts match.</p>';
}
function toggleMember(phone) {
  const l = listById(lmemId); if (!l) return;
  const set = new Set(l.members || []);
  if (set.has(phone)) set.delete(phone); else set.add(phone);
  l.members = [...set]; persistLists(); renderListMembers(); renderLists();
}

boot();
