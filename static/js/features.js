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

async function loadReleaseHistory() {
  const box = document.getElementById("historyList");
  if (!box) return;
  box.innerHTML = "<p class='hint'>Loading…</p>";
  try {
    const d = await (await fetch("/api/release-history?limit=100")).json();
    if (!d.items?.length) {
      box.innerHTML = "<p class='hint'>No sends recorded yet.</p>";
      return;
    }
    box.innerHTML = d.items
      .map(
        (r) => `<div class="history-row">
      <span class="badge-${r.status === "success" ? "ok" : "err"}">${esc(r.status)}</span>
      <b>${esc(r.targetName)}</b>
      <span class="hint">${esc(r.targetType)} · ${new Date(r.at).toLocaleString()}</span>
      ${r.status !== "success" ? `<button class="btn btn-soft btn-sm" onclick="retryRelease(${r.id})">Retry</button>` : ""}
    </div>`
      )
      .join("");
  } catch {
    box.innerHTML = "<p class='hint'>Could not load history.</p>";
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
