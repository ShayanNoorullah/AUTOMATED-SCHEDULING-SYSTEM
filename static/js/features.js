/* SSIES feature helpers: WAHA picker, preflight, history, scheduled send, message preview */

let waGroupsCache = [];
let scheduledJobState = { enabled: false, dow: 0, hour: 9, minute: 0 };

function renderWhatsAppPreview(text) {
  const safe = esc(text || "").replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  return safe.replace(/\n/g, "<br>");
}

function updateGroupPreview() {
  const el = document.getElementById("gMsgPreview");
  if (!el) return;
  const msg = document.getElementById("gMsg")?.value || "";
  const rendered = replaceTokens(msg);
  el.innerHTML = `<div class="preview-h">Live preview (${rendered.length} chars)</div><div class="preview-b">${renderWhatsAppPreview(rendered)}</div>`;
}

function updateContactPreview() {
  const el = document.getElementById("cMsgPreview");
  if (!el) return;
  const msg = document.getElementById("cMsg")?.value || "";
  const rendered = replaceTokens(msg);
  el.innerHTML = `<div class="preview-h">Live preview (${rendered.length} chars)</div><div class="preview-b">${renderWhatsAppPreview(rendered)}</div>`;
}

async function gFetchWaGroups() {
  const status = document.getElementById("gNameStatus");
  const pick = document.getElementById("gWaPick");
  if (status) status.textContent = "Loading WhatsApp groups…";
  try {
    const d = await (await fetch("/api/whatsapp/groups")).json();
    if (d.error) {
      if (status) status.innerHTML = `<span class="badge-err">${esc(d.error)}</span>`;
      return;
    }
    waGroupsCache = d.groups || [];
    if (pick) {
      pick.innerHTML =
        '<option value="">Pick from WhatsApp…</option>' +
        waGroupsCache.map((g) => `<option value="${escA(g.name)}">${esc(g.name)}</option>`).join("");
      pick.classList.toggle("hidden", !waGroupsCache.length);
    }
    if (status) status.textContent = waGroupsCache.length ? `${waGroupsCache.length} group(s) loaded` : "No groups found — connect WAHA first";
    gValidateGroupName();
  } catch {
    if (status) status.textContent = "Could not load groups";
  }
}

function gPickWaGroup(name) {
  if (!name) return;
  document.getElementById("gName").value = name;
  document.getElementById("gWaPick").value = "";
  gValidateGroupName();
}

async function gValidateGroupName() {
  const name = document.getElementById("gName")?.value?.trim();
  const status = document.getElementById("gNameStatus");
  if (!status || !name) {
    if (status) status.innerHTML = "";
    return;
  }
  try {
    const d = await (await fetch("/api/whatsapp/groups/validate", post({ names: [name] }))).json();
    const v = d.validation?.[name];
    if (!v || v.ok === null) {
      status.innerHTML = v?.note ? `<span class="hint">${esc(v.note)}</span>` : "";
      return;
    }
    if (v.ok) {
      status.innerHTML = `<span class="badge-ok">✓ Found in WhatsApp${v.match !== name ? `: ${esc(v.match)}` : ""}</span>`;
    } else {
      const sim = v.similar?.length ? ` Similar: ${v.similar.map(esc).join(", ")}` : "";
      status.innerHTML = `<span class="badge-err">✗ Not found in WhatsApp${sim}</span>`;
    }
  } catch {
    status.textContent = "";
  }
}

async function runPreflight(targets) {
  return (await fetch("/api/release/preflight", post({ targets }))).json();
}

function showPreflightModal(result, onProceed) {
  const lines = (result.checks || [])
    .map((c) => `${c.ok ? "✓" : "✗"} ${c.label}${c.hint ? ` — ${c.hint}` : ""}`)
    .join("\n");
  if (!result.ready) {
    alert(`Cannot send yet:\n\n${lines}`);
    return;
  }
  if (confirm(`Pre-flight checks passed:\n\n${lines}\n\nProceed with automated send?`)) {
    onProceed();
  }
}

async function doReleaseWithPreflight(targets, spin, btn, txt, label) {
  if (!targets.length) {
    toast("Nothing to send", "err");
    return;
  }
  try {
    const pf = await runPreflight(targets);
    showPreflightModal(pf, () => doRelease(targets, spin, btn, txt, label));
  } catch {
    toast("Pre-flight check failed", "err");
  }
}

let historyMode = localStorage.getItem("history-mode") || "table";
let historyFilter = "all";
let historyPage = 1;
const HISTORY_PER_PAGE = 8;

function setHistoryMode(m) {
  historyMode = m;
  localStorage.setItem("history-mode", m);
  document.querySelectorAll("#historyModeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === m));
  loadReleaseHistory();
}
function setHistoryFilter(f) {
  historyFilter = f;
  historyPage = 1;
  document.querySelectorAll("#historyFilterSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === f));
  loadReleaseHistory();
}
function historyGoto(p) {
  historyPage = p;
  loadReleaseHistory();
  const w = document.getElementById("historyWrap");
  if (w) w.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function loadReleaseHistory() {
  const wrap = document.getElementById("historyWrap");
  const legacy = document.getElementById("historyList");
  if (!wrap && !legacy) return;

  document.querySelectorAll("#historyModeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === historyMode));
  document.querySelectorAll("#historyFilterSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === historyFilter));

  if (wrap) wrap.innerHTML = "<p class='hint'>Loading…</p>";
  if (legacy) legacy.innerHTML = "<p class='hint'>Loading…</p>";

  try {
    const d = await (await fetch("/api/release-history?limit=200")).json();
    const all = Array.isArray(d) ? d : d.items || d.rows || [];

    const stats = document.getElementById("historyStats");
    if (stats) {
      const ok = all.filter((r) => r.status === "success").length;
      const groupsN = all.filter((r) => (r.targetType || r.target_type) === "group").length;
      stats.innerHTML = `
        <div class="stat"><div class="n">${all.length}</div><div class="l">Total sends</div></div>
        <div class="stat"><div class="n">${ok}</div><div class="l">Delivered</div></div>
        <div class="stat"><div class="n">${all.length - ok}</div><div class="l">Failed</div></div>
        <div class="stat"><div class="n">${groupsN}</div><div class="l">To groups</div></div>`;
    }

    if (!wrap) {
      if (!all.length) {
        legacy.innerHTML = "<p class='hint'>No sends recorded yet.</p>";
        return;
      }
      legacy.innerHTML = all
        .map(
          (r) => `<div class="history-row">
        <span class="badge-${r.status === "success" ? "ok" : "err"}">${esc(r.status)}</span>
        <b>${esc(r.targetName || r.target_name)}</b>
        <span class="hint">${esc(r.targetType || r.target_type)} · ${new Date(r.at || r.created_at).toLocaleString()}</span>
        ${r.status !== "success" ? `<button class="btn btn-soft btn-sm" onclick="retryRelease(${r.id})">Retry</button>` : ""}
      </div>`
        )
        .join("");
      return;
    }

    const q = (document.getElementById("historySearch")?.value || "").toLowerCase();
    let items = all.filter((r) => historyFilter === "all" || (historyFilter === "success" ? r.status === "success" : r.status !== "success"));
    if (q) {
      items = items.filter((r) => {
        const name = (r.targetName || r.target_name || "").toLowerCase();
        const type = (r.targetType || r.target_type || "").toLowerCase();
        return name.includes(q) || type.includes(q);
      });
    }

    const pager = document.getElementById("historyPager");
    if (pager) pager.innerHTML = "";

    if (!items.length) {
      wrap.innerHTML = `<div class="tbl-wrap"><div class="empty"><p>${all.length ? "No sends match your filters." : "No sends recorded yet."}</p></div></div>`;
      return;
    }

    const pages = Math.max(1, Math.ceil(items.length / HISTORY_PER_PAGE));
    if (historyPage > pages) historyPage = pages;
    const start = (historyPage - 1) * HISTORY_PER_PAGE;
    const page = items.slice(start, start + HISTORY_PER_PAGE);
    const badge = (r) =>
      `<span class="hstatus ${r.status === "success" ? "ok" : "err"}"><span class="hdot"></span>${r.status === "success" ? "Delivered" : "Failed"}</span>`;
    const typeChip = (r) => {
      const t = r.targetType || r.target_type || "—";
      return `<span class="htype">${t === "contact" ? "👤" : "👥"} ${esc(t)}</span>`;
    };
    const nameOf = (r) => r.targetName || r.target_name || "";
    const atOf = (r) => r.at || r.created_at || "";

    if (historyMode === "board") {
      wrap.innerHTML =
        `<div class="card-grid">` +
        page
          .map(
            (r) =>
              `<article class="hcard"><div class="hcard-top">${badge(r)}${typeChip(r)}</div><b class="hcard-name">${esc(nameOf(r))}</b><div class="hcard-time">${new Date(atOf(r)).toLocaleString()}</div>${
                r.status !== "success" ? `<button class="btn btn-soft btn-sm" onclick="retryRelease(${r.id})">Retry</button>` : '<span class="hcard-check">✓ Sent</span>'
              }</article>`
          )
          .join("") +
        `</div>`;
    } else {
      wrap.innerHTML =
        `<div class="tbl-wrap"><table class="data grid-table"><thead><tr><th>Status</th><th>Target</th><th>Type</th><th>When</th><th></th></tr></thead><tbody>` +
        page
          .map(
            (r) =>
              `<tr><td>${badge(r)}</td><td><b>${esc(nameOf(r))}</b></td><td>${typeChip(r)}</td><td><span class="hint" style="margin:0">${new Date(atOf(r)).toLocaleString()}</span></td><td style="text-align:right">${
                r.status !== "success" ? `<button class="btn btn-soft btn-sm" onclick="retryRelease(${r.id})">Retry</button>` : ""
              }</td></tr>`
          )
          .join("") +
        `</tbody></table></div>`;
    }

    if (pager && pages > 1) {
      let btns = `<button class="pager-btn" ${historyPage === 1 ? "disabled" : ""} onclick="historyGoto(${historyPage - 1})">‹ Prev</button>`;
      for (let p = 1; p <= pages; p++) btns += `<button class="pager-btn${p === historyPage ? " on" : ""}" onclick="historyGoto(${p})">${p}</button>`;
      btns += `<button class="pager-btn" ${historyPage === pages ? "disabled" : ""} onclick="historyGoto(${historyPage + 1})">Next ›</button>`;
      pager.innerHTML = `<span class="pager-info">Showing ${start + 1}–${Math.min(start + HISTORY_PER_PAGE, items.length)} of ${items.length}</span><div class="pager-btns">${btns}</div>`;
    }
  } catch {
    if (wrap) wrap.innerHTML = "<p class='hint'>Could not load history.</p>";
    if (legacy) legacy.innerHTML = "<p class='hint'>Could not load history.</p>";
  }
}

async function retryRelease(id) {
  if (!confirm("Retry this failed send?")) return;
  const d = await (await fetch("/api/release/retry", post({ id }))).json();
  if (d.error) {
    toast(d.error, "err");
    return;
  }
  toast("Retry started");
  maybeShowStatusOnSend();
  showLog();
  loadReleaseHistory();
}

async function loadScheduledJob() {
  try {
    const d = await (await fetch("/api/scheduled-job")).json();
    scheduledJobState = d;
    const en = document.getElementById("schedEnabled");
    const dow = document.getElementById("schedDow");
    const hour = document.getElementById("schedHour");
    const min = document.getElementById("schedMinute");
    const last = document.getElementById("schedLastRun");
    if (en) en.checked = !!d.enabled;
    if (dow) dow.value = String(d.dow ?? 0);
    if (hour) hour.value = String(d.hour ?? 9);
    if (min) min.value = String(d.minute ?? 0);
    if (last) last.textContent = d.lastRunAt ? `Last run: ${new Date(d.lastRunAt).toLocaleString()}` : "Not run yet";
  } catch {
    /* ignore */
  }
}

async function saveScheduledJob() {
  const payload = {
    enabled: document.getElementById("schedEnabled")?.checked || false,
    dow: parseInt(document.getElementById("schedDow")?.value || "0", 10),
    hour: parseInt(document.getElementById("schedHour")?.value || "9", 10),
    minute: parseInt(document.getElementById("schedMinute")?.value || "0", 10),
  };
  const d = await (await fetch("/api/scheduled-job", put(payload))).json();
  if (d.error) {
    toast(d.error, "err");
    return;
  }
  toast("Scheduled send saved");
  loadScheduledJob();
}

/* ── Automated Send flow indicator (POC UI; does not change WAHA APIs) ── */
const WA_FLOW_STEPS = ["Provider", "Session", "Scan QR", "Connected"];
const WA_FLOW_CHECK =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2"><path d="M20 6 9 17l-5-5"/></svg>';
let waFlowState = "disconnected";

function renderWaFlow(state) {
  waFlowState = state || "disconnected";
  const el = document.getElementById("waFlow");
  if (!el) return;
  const provider = (document.getElementById("autoProviderLabel")?.textContent || "waha").toUpperCase();
  let doneCount, activeIndex, label, tone;
  if (state === "connected") {
    doneCount = 4;
    activeIndex = 3;
    label = `Connected · ${provider}`;
    tone = "ok";
  } else if (state === "scanning") {
    doneCount = 2;
    activeIndex = 2;
    label = "Waiting for you to scan the QR code…";
    tone = "progress";
  } else if (state === "connecting") {
    doneCount = 1;
    activeIndex = 1;
    label = `Starting ${provider} session…`;
    tone = "progress";
  } else if (state === "disabled") {
    doneCount = 0;
    activeIndex = 0;
    label = "Automation is disabled — direct links only";
    tone = "err";
  } else {
    doneCount = 1;
    activeIndex = 1;
    label = "Not linked yet — start a session below";
    tone = "idle";
  }
  let h = "";
  WA_FLOW_STEPS.forEach((s, i) => {
    if (i > 0) h += `<span class="wa-flow-conn ${i <= doneCount ? "fill" : ""}"></span>`;
    const cls = i < doneCount ? "done" : i === activeIndex ? "active" : "pending";
    h += `<span class="wa-flow-node ${cls}"><span class="wa-flow-dot">${i < doneCount ? WA_FLOW_CHECK : i + 1}</span><span class="wa-flow-label">${s}</span></span>`;
  });
  el.className = "wa-flow tone-" + tone;
  el.innerHTML = h;
  const st = document.getElementById("waFlowStatus");
  if (st) st.textContent = label;
}

function syncWaFlowFromSession(info) {
  const qrWrap = document.getElementById("waQrWrap");
  const qrOpen = qrWrap && !qrWrap.classList.contains("hidden");
  let state = "disconnected";
  if (!info) state = waFlowState === "connecting" || waFlowState === "scanning" ? waFlowState : "disconnected";
  else if (info.provider === "direct_only" || info.disabled) state = "disabled";
  else if (info.connected) state = "connected";
  else if (info.status === "SCAN_QR_CODE" || qrOpen) state = "scanning";
  else if (waFlowState === "connecting") state = "connecting";
  else state = "disconnected";
  renderWaFlow(state);
}

function wrapWaFlowHooks() {
  if (typeof loadAutoSession === "function" && !loadAutoSession._waFlowWrapped) {
    const orig = loadAutoSession;
    window.loadAutoSession = async function () {
      const info = await orig.apply(this, arguments);
      syncWaFlowFromSession(info);
      return info;
    };
    window.loadAutoSession._waFlowWrapped = true;
  }
  const wrapState = (name, state) => {
    if (typeof window[name] !== "function" || window[name]._waFlowWrapped) return;
    const orig = window[name];
    window[name] = async function () {
      renderWaFlow(state);
      try {
        return await orig.apply(this, arguments);
      } finally {
        if (typeof loadAutoSession === "function") loadAutoSession();
      }
    };
    window[name]._waFlowWrapped = true;
  };
  wrapState("startWaSession", "connecting");
  wrapState("resetWaSession", "scanning");
  wrapState("stopWaSession", "disconnected");
  if (document.getElementById("waFlow")) renderWaFlow(waFlowState);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wrapWaFlowHooks);
} else {
  wrapWaFlowHooks();
}
