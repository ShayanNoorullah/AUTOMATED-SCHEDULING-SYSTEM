/* Dashboard home (moved out of the inline script in templates/user/index.html).
   Paints at once from the last history it saw, then refreshes in the background.
   Uses the inline script's globals: groups, contacts, templates, settings, scheduledJobState. */
let dashHist = null, dashSess = false;

function todayName() { return new Date().toLocaleDateString("en-US", { weekday: "long" }); }

async function renderUserDashboard() {
  const el = document.getElementById("dashHome"); if (!el) return;
  if (dashHist) paintDashboard();
  let hist = [], sess = false;
  try { hist = await (await fetch("/api/release-history")).json(); if (!Array.isArray(hist)) hist = hist.items || hist.rows || []; } catch (e) { hist = []; }
  try { if (typeof fetchSessionStatusCached === "function") { const st = await fetchSessionStatusCached(false); sess = !!(st && (st.connected || st.ready || st.status === "WORKING")); } } catch (e) {}
  const changed = !dashHist || sess !== dashSess || JSON.stringify(hist) !== JSON.stringify(dashHist);
  dashHist = hist; dashSess = sess;
  if (changed) { paintDashboard(); if (typeof animateCounters === "function") animateCounters(); }
}

/* Today's classes in time order, each tagged done / live / next relative to the clock. */
function dashTodayItems(now) {
  const day = todayName(), nowMin = now.getHours() * 60 + now.getMinutes();
  return (groups || []).map((g, i) => {
    const e = (g.schedule || []).find((x) => x.day === day && (x.from || "").trim()); if (!e) return null;
    const a = parseTimeMin(e.from); let b = parseTimeMin(e.to); if (a != null && (b == null || b <= a)) b = a + 60;
    const state = a == null ? "" : nowMin >= b ? "done" : nowMin >= a ? "live" : "next";
    return { g, i, e, a, state, inMin: a == null ? null : a - nowMin };
  }).filter(Boolean).sort((x, y) => (x.a == null ? 1e9 : x.a) - (y.a == null ? 1e9 : y.a));
}
function dashIn(m) { return m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`; }
function dashTodayHTML() {
  const items = dashTodayItems(new Date());
  if (!items.length) return '<p class="hint">No groups scheduled for today.</p>';
  const upNext = items.find((x) => x.state === "next");
  return items.map((x) => {
    const tag = x.state === "live" ? '<span class="tl-tag live"><span class="dot-live on"></span>Now</span>'
      : x.state === "done" ? '<span class="tl-tag">Done</span>'
      : x.state === "next" ? `<span class="tl-tag${x === upNext ? " next" : ""}">${dashIn(x.inMin)}</span>` : "";
    return `<div class="dash-today-row tl-${x.state}${x === upNext ? " tl-upnext" : ""}">
      <div class="tl-time"><b>${esc(x.e.from || "")}</b>${x.e.to ? `<span>${esc(x.e.to)}</span>` : ""}</div>
      <div class="av small">${avatarInner(x.g.name, entityPic(x.g))}</div>
      <div style="min-width:0;flex:1"><b>${esc(x.g.name)}</b>${tag}</div>
      <button class="btn btn-ghost btn-sm" title="Send a cancel or reschedule notice" onclick="openBroadcast(groups[${x.i}].name)">Notify</button>
      <button class="btn btn-soft btn-sm" onclick="openGroupDetail(${x.i})">Open</button></div>`;
  }).join("");
}
function paintDashToday() { const el = document.getElementById("dashToday"); if (el) el.innerHTML = dashTodayHTML(); }
// keep "in 42 min" / "Now" current without repainting (and re-animating) the whole page
setInterval(() => { if (document.getElementById("view-dashboard")?.classList.contains("active")) paintDashToday(); }, 60000);

function dashSetupHTML(hist, sess) {
  if (localStorage.getItem("dash-setup-hide") === "1") return "";
  const steps = [
    { done: sess, label: "Link your WhatsApp", go: "navGo('wa-auto')" },
    { done: groups.length > 0, label: "Add your first group", go: "navGo('groups');newGroupDetail()" },
    { done: groups.some((g) => (g.schedule || []).some((e) => (e.from || "").trim())), label: "Set a weekly schedule", go: "navGo('table')" },
    { done: hist.length > 0, label: "Send your first schedule", go: "navGo('table')" },
  ];
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return "";
  return `<div class="sec dash-setup"><div class="sec-h">Finish setting up<span class="chip" style="margin-left:10px">${n} of ${steps.length}</span>
      <button class="icon-btn" style="margin-left:auto" title="Hide this checklist" aria-label="Hide setup checklist" onclick="localStorage.setItem('dash-setup-hide','1');paintDashboard()">✕</button></div>
    <div class="dash-setup-bar"><i style="width:${Math.round((n / steps.length) * 100)}%"></i></div>
    <div class="sec-b dash-setup-steps">${steps.map((s) => `<button class="dash-step${s.done ? " done" : ""}" ${s.done ? "disabled" : `onclick="${s.go}"`}><span class="dash-step-ico">${s.done ? "✓" : ""}</span>${s.label}</button>`).join("")}</div></div>`;
}

function paintDashboard() {
  const el = document.getElementById("dashHome"); if (!el) return;
  const hist = dashHist || [], sess = dashSess;
  const u = typeof currentUser === "function" ? currentUser() : null;
  const ok = (h) => (h.status || "") === "success";
  const at = (h) => new Date(h.at || h.created_at || 0);
  const successCount = hist.filter(ok).length, failCount = hist.length - successCount;
  const rate = hist.length ? Math.round((successCount / hist.length) * 100) : 100;
  const job = typeof scheduledJobState !== "undefined" ? scheduledJobState : { enabled: false };
  const nextSend = nextScheduledSend(job);
  const now = new Date(), hr = now.getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const firstName = ((u && (u.displayName || u.email)) || "there").split(" ")[0];
  // this week vs the week before
  const daysAgo = (h) => (now - at(h)) / 864e5;
  const wk = hist.filter((h) => ok(h) && daysAgo(h) < 7).length, prev = hist.filter((h) => ok(h) && daysAgo(h) >= 7 && daysAgo(h) < 14).length;
  const trend = !(wk || prev) ? "" : wk === prev ? '<span class="stat-trend">same as last week</span>'
    : `<span class="stat-trend ${wk > prev ? "up" : "down"}">${wk > prev ? "▲" : "▼"} ${Math.abs(wk - prev)} vs last week</span>`;
  const failedWeek = hist.filter((h) => !ok(h) && daysAgo(h) < 7).length;
  const days7 = [];
  for (let i = 6; i >= 0; i--) { const dd = new Date(now); dd.setDate(now.getDate() - i); const key = dd.toDateString(); days7.push({ label: dd.toLocaleDateString(undefined, { weekday: "short" }), cnt: hist.filter((h) => at(h).toDateString() === key).length }); }
  const maxCnt = Math.max(1, ...days7.map((x) => x.cnt));
  const todayCount = dashTodayItems(now).length;
  const DA = { sched: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>', auto: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>', direct: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>', tpl: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' };
  el.innerHTML = `
    <div class="dash-hero">
      <div><h2>${greet}, ${esc(firstName)}</h2><p>${now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} — schedule overview.</p></div>
      <div class="dash-hero-actions"><button class="btn btn-soft" onclick="navGo('table')">Open Scheduler</button><button class="btn btn-primary" onclick="navGo('groups');newGroupDetail()">+ New group</button></div>
    </div>
    ${failedWeek ? `<div class="dash-alert"><span>⚠</span><b>${failedWeek} send${failedWeek === 1 ? "" : "s"} failed this week</b><button class="btn btn-soft btn-sm" style="margin-left:auto" onclick="setHistoryFilter('failed');navGo('history')">Review</button></div>` : ""}
    ${dashSetupHTML(hist, sess)}
    <div class="cards" style="margin-top:18px">
      <div class="stat dash-stat" onclick="navGo('groups')"><div class="n">${groups.length}</div><div class="l">Groups</div></div>
      <div class="stat dash-stat" onclick="navGo('contacts')"><div class="n">${contacts.length}</div><div class="l">Contacts</div></div>
      <div class="stat dash-stat" onclick="navGo('templates')"><div class="n">${templates.length}</div><div class="l">Templates</div></div>
      <div class="stat dash-stat" onclick="navGo('history')"><div class="n">${successCount}</div><div class="l">Delivered</div>${trend}</div>
      <div class="stat"><div class="n">${rate}%</div><div class="l">Success rate</div></div>
    </div>
    <div class="dash-grid">
      <div class="sec"><div class="sec-h">Quick actions</div><div class="sec-b dash-actions">
        <button class="dash-action" onclick="navGo('table')"><span class="da-ico">${DA.sched}</span><span class="da-body"><b>Open Scheduler</b><i>Edit weekly timings</i></span></button>
        <button class="dash-action" onclick="navGo('wa-auto')"><span class="da-ico">${DA.auto}</span><span class="da-body"><b>Automated Send</b><i>Link &amp; send</i></span></button>
        <button class="dash-action" onclick="navGo('wa-direct')"><span class="da-ico">${DA.direct}</span><span class="da-body"><b>Open in WhatsApp</b><i>Direct links</i></span></button>
        <button class="dash-action" onclick="navGo('templates')"><span class="da-ico">${DA.tpl}</span><span class="da-body"><b>Templates</b><i>Reusable messages</i></span></button>
      </div></div>
      <div class="sec"><div class="sec-h">Session &amp; automation</div><div class="sec-b">
        <div class="dash-status-row"><span class="dot-live ${sess ? "on" : ""}"></span><span>${sess ? "WhatsApp connected" : "Not connected"}</span><button class="btn btn-soft btn-sm" style="margin-left:auto" onclick="navGo('wa-auto')">Manage</button></div>
        <div class="dash-status-row"><span>Scheduled weekly send</span><span class="chip ${job.enabled ? "chip-default" : ""}" style="margin-left:auto">${job.enabled ? "On" : "Off"}</span></div>
        ${nextSend ? `<div class="dash-status-row"><span>Next send</span><span style="margin-left:auto;font-weight:700">${nextSend.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${nextSend.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></div>` : ""}
        <div class="dash-status-row"><span>Automated delay</span><span style="margin-left:auto;font-weight:700">${(settings && settings.delaySeconds != null) ? settings.delaySeconds : 5}s</span></div>
      </div></div>
    </div>
    <div class="dash-grid dash-grid-2">
      <div class="sec"><div class="sec-h">Today · ${esc(todayName())}<span class="chip" style="margin-left:auto">${todayCount} scheduled</span></div><div class="sec-b" id="dashToday">${dashTodayHTML()}</div></div>
      <div class="sec"><div class="sec-h">Weekly activity</div><div class="sec-b">
        <div class="dash-spark">${days7.map((x, i) => `<div class="spark-col" title="${x.cnt} send${x.cnt === 1 ? "" : "s"} on ${x.label}"><span class="spark-n">${x.cnt || ""}</span><div class="spark-bar" style="height:${Math.round((x.cnt / maxCnt) * 100)}%;--i:${i}"></div><span class="spark-lbl">${x.label[0]}</span></div>`).join("")}</div>
        <div class="dash-mini-stats"><span><b>${hist.length}</b> total</span><span><b class="ok-text">${successCount}</b> delivered</span><span><b class="err-text">${failCount}</b> failed</span></div>
      </div></div>
    </div>
    <div class="sec" style="margin-top:16px"><div class="sec-h">Recent sends<button class="btn btn-soft btn-sm" style="margin-left:auto" onclick="navGo('history')">View all</button></div><div class="sec-b">
      ${hist.length ? hist.slice(0, 5).map((h) => `<div class="dash-hist"><span class="hstatus ${ok(h) ? "ok" : "err"}"><span class="hdot"></span>${ok(h) ? "Delivered" : "Failed"}</span><b>${esc(h.target_name || h.targetName || "")}</b><span class="hint" style="margin:0 0 0 auto">${typeof relTime === "function" ? relTime(h.at || h.created_at) : at(h).toLocaleDateString()}</span></div>`).join("") : '<p class="hint">No sends yet.</p>'}
    </div></div>`;
}
