/* WAHA session linking UI for Automated Send view */
let waQrPoll = null;
let waWasConnected = null;   // null until the first status check, so opening the page never announces "linked"

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return data;
}

async function loadAutoSession() {
  const dot = document.getElementById("autoSessionDot");
  const txt = document.getElementById("autoSessionText");
  const providerEl = document.getElementById("autoProviderLabel");
  try {
    const info = await readJson(await fetch("/api/whatsapp/session"));
    if (providerEl) providerEl.textContent = (info.provider || "selenium").toUpperCase();
    if (dot) dot.classList.toggle("on", !!info.connected);
    document.getElementById("waStepConnect")?.classList.toggle("done", !!info.connected);
    if (info.connected && waWasConnected === false) toast("WhatsApp linked ✓ — choose who to send to", "ok");
    waWasConnected = !!info.connected;
    if (txt) {
      if (info.connected) {
        txt.textContent = `Connected (${info.provider})`;
      } else if (info.error) {
        txt.textContent = info.error;
      } else if (info.status === "SCAN_QR_CODE") {
        txt.textContent = "Scan QR code below with WhatsApp";
      } else {
        txt.textContent = info.detail || "Not connected — link WhatsApp below";
      }
    }
    const qrWrap = document.getElementById("waQrWrap");
    if (qrWrap && info.connected) {
      qrWrap.classList.add("hidden");
      stopQrPoll();
    }
    return info;
  } catch (e) {
    if (txt) txt.textContent = e.message || "Could not load session status";
    return null;
  }
}

async function startWaSession() {
  const btn = document.getElementById("btnStartSession");
  if (btn) btn.disabled = true;
  try {
    const info = await readJson(await fetch("/api/whatsapp/session"));
    if (info.provider === "waha") {
      await readJson(
        await fetch("/api/whatsapp/session/start", { method: "POST", headers: { "Content-Type": "application/json" } })
      );
      document.getElementById("waQrWrap")?.classList.remove("hidden");
      startQrPoll();
      toast("Scan QR with WhatsApp → Linked devices");
    } else if (info.provider === "selenium") {
      toast("Run Automated Send once — Chrome will open for QR scan");
    } else {
      toast("Automation disabled in system settings", "err");
    }
    await loadAutoSession();
  } catch (e) {
    toast(e.message || "Failed to start session", "err");
    const txt = document.getElementById("autoSessionText");
    if (txt) txt.textContent = e.message || "Failed to start session";
  } finally {
    if (btn) btn.disabled = false;
  }
}

function startQrPoll() {
  stopQrPoll();
  pollQr();
  waQrPoll = setInterval(pollQr, 2500);
}

async function resetWaSession() {
  const btn = document.getElementById("btnResetSession");
  if (btn) btn.disabled = true;
  try {
    await readJson(
      await fetch("/api/whatsapp/session/reset", { method: "POST", headers: { "Content-Type": "application/json" } })
    );
    document.getElementById("waQrWrap")?.classList.remove("hidden");
    startQrPoll();
    toast("Fresh QR ready — scan within 20 seconds");
    await loadAutoSession();
  } catch (e) {
    toast(e.message || "Reset failed", "err");
    const txt = document.getElementById("autoSessionText");
    if (txt) txt.textContent = e.message || "Reset failed";
  } finally {
    if (btn) btn.disabled = false;
  }
}

function stopQrPoll() {
  if (waQrPoll) {
    clearInterval(waQrPoll);
    waQrPoll = null;
  }
}

async function pollQr() {
  const img = document.getElementById("waQrImg");
  const txt = document.getElementById("autoSessionText");
  if (!img) return;
  try {
    const data = await readJson(await fetch("/api/whatsapp/session/qr"));
    if (data.connected) {
      stopQrPoll();
      return;
    }
    if (data.format === "image") {
      img.src = "";
      img.src = data.data;
    } else if (data.data) {
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.data)}&_=${Date.now()}`;
    }
    const info = await loadAutoSession();
    if (info?.connected) stopQrPoll();
  } catch (e) {
    if (txt && !txt.textContent.includes("Connected")) {
      txt.textContent = e.message || "Could not load QR code";
    }
  }
}

async function stopWaSession() {
  await fetch("/api/whatsapp/session/stop", { method: "POST", headers: { "Content-Type": "application/json" } });
  stopQrPoll();
  document.getElementById("waQrWrap")?.classList.add("hidden");
  loadAutoSession();
  toast("Session stopped");
}

function renderAutoSendPanel() {
  loadAutoSession();
  renderAutoTargetList();
}

function autoTargetMessage(type, name) {
  if (type === "contact") return replaceTokens((contacts.find((x) => x.name === name) || {}).message || "");
  const g = groups.find((x) => x.name === name);
  return g ? replaceTokens(messageFor(g)) : "";
}
function autoPickAll(on) { document.querySelectorAll(".auto-pick:not(:disabled)").forEach((cb) => { cb.checked = on; }); autoPickCount(); }
function autoPickCount() {
  const n = document.querySelectorAll(".auto-pick:checked").length, el = document.getElementById("autoPickCount");
  if (el) el.textContent = `${n} selected`;
}
function renderAutoTargetList() {
  const el = document.getElementById("autoTargetList");
  if (!el || typeof groups === "undefined") return;
  const items = [];
  groups.forEach((g) => items.push({ type: "group", name: g.name, sub: `${g.schedule?.length || 0} day${g.schedule?.length === 1 ? "" : "s"}` }));
  contacts.forEach((c) => items.push({ type: "contact", name: c.name, sub: `+${c.phone || ""}` }));
  if (!items.length) {
    el.innerHTML = '<p class="hint">Add groups or contacts first.</p>';
    return;
  }
  // every row shows exactly what will be sent; rows with nothing to send cannot be picked
  el.innerHTML = `<div class="wa-pick-bar"><button class="btn btn-ghost btn-sm" type="button" onclick="autoPickAll(true)">Select all</button><button class="btn btn-ghost btn-sm" type="button" onclick="autoPickAll(false)">None</button><span class="hint" id="autoPickCount" style="margin:0 0 0 auto"></span></div>` + items
    .map((it, i) => {
      const msg = autoTargetMessage(it.type, it.name), empty = !msg.trim();
      return `<details class="wa-pick${empty ? " is-empty" : ""}"><summary>
      <input type="checkbox" class="auto-pick" data-i="${i}" data-type="${it.type}" data-name="${escA(it.name)}" ${empty ? "disabled" : "checked"} onclick="event.stopPropagation()" onchange="autoPickCount()" aria-label="Send to ${escA(it.name)}"/>
      <span><strong>${esc(it.name)}</strong><span class="sub">${esc(it.sub)} · ${it.type}${empty ? " · no message to send" : ""}</span></span>
      <span class="wa-pick-more">${empty ? "" : "Preview"}</span></summary>
      ${empty ? "" : `<div class="msg-preview"><div class="preview-b">${typeof renderWhatsAppPreview === "function" ? renderWhatsAppPreview(msg) : esc(msg)}</div></div>`}</details>`;
    })
    .join("");
  el._items = items;
  autoPickCount();
}

async function runAutomatedFromPanel() {
  const picks = [...document.querySelectorAll(".auto-pick:checked")];
  if (!picks.length) {
    toast("Select at least one target", "err");
    return;
  }
  const targets = picks.map((cb) => {
    const type = cb.dataset.type;
    const name = cb.dataset.name;
    if (type === "contact") {
      const c = contacts.find((x) => x.name === name);
      return { name, phone: c?.phone, message: replaceTokens(c?.message || "") };
    }
    const g = groups.find((x) => x.name === name);
    return { name, message: replaceTokens(messageFor(g)) };
  }).filter((t) => t.message?.trim());
  if (!targets.length) {
    toast("Selected targets have empty messages", "err");
    return;
  }
  releaseWithMode(targets, "autoSpin", "autoBtn", "autoTxt", "Send selected", "automated");
}
