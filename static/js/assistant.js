/* Scheduler Assistant chat panel.
   The server only ever returns proposals (app/services/assistant.py). Nothing changes until
   the user presses Apply, and Apply goes through the normal schedule save — which records a
   version first, so it can be undone.
   Uses the inline script's globals: groups, DAYS, saveTable, loadGroups, computeClashes, … */
let asstTurns = [], asstImage = null, asstBusy = false, asstRec = null, asstProposals = [];
const AsstSR = window.SpeechRecognition || window.webkitSpeechRecognition;
const ASST_ICO = {
  img: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>',
};

/* ── applying changes ── */
/* Return a copy of `base` with the assistant's validated changes applied. */
function applyChanges(base, changes) {
  const next = JSON.parse(JSON.stringify(base));
  (changes || []).forEach((c) => {
    let g = next.find((x) => x.name === c.group);
    if (c.op === "create_group") { if (!g) next.push({ name: c.group, schedule: [], message: "" }); return; }
    if (!g) return;
    const was = (g.schedule || []).find((e) => e.day === c.day);    // a new time keeps that day's room and teacher
    g.schedule = (g.schedule || []).filter((e) => e.day !== c.day);
    if (c.op === "set") g.schedule.push({ ...slotExtras(was), day: c.day, from: c.from, to: c.to || "" });
    g.schedule.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  });
  return next;
}
/* Unaccepted clashes in a list of groups, as readable lines (computeClashes reads the global). */
function clashLines(list) {
  const cur = groups; groups = list;
  try { return computeClashes().pairs.filter((p) => !p.accepted).map((p) => `${p.day.slice(0, 3)}: ${colDisplay(list[p.a])} ↔ ${colDisplay(list[p.b])}`); }
  finally { groups = cur; }
}

/* ── panel ── */
function asstPanel() {
  let d = document.getElementById("asstPanel"); if (d) return d;
  d = document.createElement("dialog"); d.id = "asstPanel"; d.className = "asst";
  d.innerHTML = `<header class="asst-h"><div><b>Assistant</b><span>Proposes changes — you apply them</span></div><button class="modal-x" type="button" onclick="closeAssistant()" aria-label="Close assistant">✕</button></header>
    <div class="asst-log" id="asstLog" aria-live="polite"></div>
    <div class="asst-thumb hidden" id="asstThumb"></div>
    <form class="asst-form" onsubmit="event.preventDefault();asstSend()">
      <button type="button" class="icon-btn" title="Attach a photo of a timetable" aria-label="Attach a photo" onclick="document.getElementById('asstFile').click()">${ASST_ICO.img}</button>
      <input type="file" id="asstFile" accept="image/*" hidden onchange="asstPickImage(this)"/>
      <button type="button" class="icon-btn${AsstSR ? "" : " hidden"}" id="asstMic" title="Speak your request" aria-label="Speak" onclick="asstToggleMic()">${ASST_ICO.mic}</button>
      <textarea id="asstInput" rows="1" aria-label="Message the assistant" placeholder="e.g. Move Monday's CS class to Wednesday 3pm" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();asstSend()}"></textarea>
      <button class="btn btn-primary btn-sm">Send</button>
    </form>`;
  d.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAssistant(); });
  document.body.appendChild(d);
  return d;
}
function closeAssistant() { asstStopMic(); const d = document.getElementById("asstPanel"); if (d) closeDialog(d); }
async function openAssistant(prefill) {
  const d = asstPanel();
  if (!d.open) d.show();
  const log = document.getElementById("asstLog");
  if (!log.firstChild) {
    let cfg = {};
    try { cfg = await (await fetch("/api/assistant/config")).json(); } catch {}
    if (cfg.ready) asstAdd("bot").innerHTML = `Tell me what to change, by typing${AsstSR ? ", speaking" : ""} or attaching a photo of a timetable.<div class="asst-tips"><button class="chip-btn" type="button" onclick="asstTry(this)">Who has class on Monday?</button><button class="chip-btn" type="button" onclick="asstTry(this)">Give every group a 1.5 hour class</button></div>`;
    else asstAdd("bot").innerHTML = `The assistant needs a provider and a free API key before it can answer.${cfg.canEdit ? ' <button class="chip-btn" type="button" onclick="closeAssistant();navGo(\'settings\');showSettingsTab(\'automation\')">Open settings</button>' : " Ask an admin to add one in Settings → Automation."}`;
  }
  const inp = document.getElementById("asstInput");
  if (prefill) { inp.value = prefill; asstSend(); } else inp.focus();
}
function asstTry(btn) { document.getElementById("asstInput").value = btn.textContent; asstSend(); }
function asstAdd(who, text) {
  const log = document.getElementById("asstLog");
  const el = document.createElement("div"); el.className = "asst-msg " + who;
  if (text) el.textContent = text;
  log.appendChild(el); log.scrollTop = log.scrollHeight;
  return el;
}

async function asstSend() {
  if (asstBusy) return;
  const inp = document.getElementById("asstInput"), text = inp.value.trim(), image = asstImage;
  if (!text && !image) return;
  asstStopMic();
  const mine = asstAdd("user", text || "Read this timetable");
  if (image) { const im = new Image(); im.src = image; im.alt = "Attached photo"; mine.prepend(im); }
  inp.value = ""; asstClearImage();
  asstBusy = true;
  const bot = asstAdd("bot"); bot.innerHTML = '<i class="skel" style="width:140px"></i>';
  // the provider answers in seconds; a longer wait means the local model has taken over
  const slow = setTimeout(() => { bot.innerHTML = '<i class="skel" style="width:140px"></i><div class="asst-skipped">Still working — the local model is answering. That takes up to a minute, or a few minutes the first time while it loads.</div>'; }, 12000);
  try {
    const res = await fetch("/api/assistant", post({ message: text, image, history: asstTurns.slice(-6) }));
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "The assistant could not answer.");
    asstTurns.push({ role: "user", text: text || "(photo of a timetable)" }, { role: "assistant", text: d.reply || "" });
    asstRenderReply(bot, d);
  } catch (e) {
    bot.classList.add("err"); bot.textContent = e.message || "The assistant could not answer.";
  } finally {
    clearTimeout(slow);
    asstBusy = false;
    const log = document.getElementById("asstLog"); log.scrollTop = log.scrollHeight;
  }
}

function asstRenderReply(bot, d) {
  bot.textContent = d.reply || (d.changes.length ? "Here is what I would change:" : "Done.");
  const id = asstProposals.push(d) - 1;
  if (d.changes.length) {
    const next = applyChanges(groups, d.changes), rows = diffSchedules(groups, next);
    const before = new Set(clashLines(groups)), clashes = clashLines(next).filter((c) => !before.has(c));
    const card = document.createElement("div"); card.className = "asst-card"; card.id = "asstP" + id;
    card.innerHTML = diffHTML(rows)
      + (clashes.length ? `<div class="asst-warn">⚠ This creates ${clashes.length} time clash${clashes.length === 1 ? "" : "es"}: ${clashes.map(esc).join(" · ")}</div>` : "")
      + (rows.length ? `<div class="asst-actions"><button class="btn btn-primary btn-sm" type="button" onclick="asstApply(${id})">Apply ${rows.length} change${rows.length === 1 ? "" : "s"}</button><button class="btn btn-soft btn-sm" type="button" onclick="asstDiscard(${id})">Discard</button></div>` : "");
    bot.appendChild(card);
  }
  if (d.via === "local") { const v = document.createElement("div"); v.className = "asst-warn"; v.textContent = "Answered by the local model" + (d.why ? " because the provider was unavailable (" + d.why + ")" : "") + ". It is less accurate, so check the proposal carefully."; bot.appendChild(v); }
  if (d.skipped && d.skipped.length) { const s = document.createElement("div"); s.className = "asst-skipped"; s.textContent = "Left out: " + d.skipped.join(" "); bot.appendChild(s); }
  if (d.notice) {
    const n = document.createElement("div"); n.className = "asst-card";
    n.innerHTML = `<div class="diff-row"><b>${esc(d.notice.group)}</b><span class="diff-note">one-off ${d.notice.kind === "reschedule" ? "reschedule" : "cancellation"} notice — the weekly timetable stays as it is</span></div><div class="asst-actions"><button class="btn btn-primary btn-sm" type="button" onclick="asstOpenNotice(${id})">Review notice</button><button class="btn btn-soft btn-sm" type="button" title="Save it as a one-off change so today's reminder follows it" onclick="asstRecordNotice(${id},this)">Record for today</button></div>`;
    bot.appendChild(n);
  }
}
function asstDone(id, html) { const a = document.querySelector(`#asstP${id} .asst-actions`); if (a) a.innerHTML = html; }
async function asstApply(id) {
  asstDone(id, '<span class="hint" style="margin:0">Saving…</span>');
  groups = applyChanges(groups, asstProposals[id].changes); tableDirty = true;   // recomputed now: the schedule may have moved on since the proposal
  if (await saveTable()) asstDone(id, `<span class="status-on">Applied ✓</span><button class="btn btn-ghost btn-sm" type="button" onclick="asstUndo(${id})">Undo</button>`);
  else { await loadGroups(); asstDone(id, '<span class="status-off">Could not save — nothing was changed.</span>'); }
}
function asstDiscard(id) { asstDone(id, '<span class="hint" style="margin:0">Discarded</span>'); }
/* Undo = restore the version the server recorded just before the save. */
async function asstUndo(id) {
  const v = await (await fetch("/api/schedule/versions")).json().catch(() => []);
  if (v[0] && await restoreVersion(v[0].id)) asstDone(id, '<span class="hint" style="margin:0">Undone</span>');
}
function asstOpenNotice(id) {
  const n = asstProposals[id].notice;
  openBroadcast(n.group);
  document.querySelector(`input[name=bcKind][value=${n.kind}]`).checked = true;
  document.getElementById("bcTime").value = n.time || "";
  document.getElementById("bcNote").value = n.note || "";
  bcSync();
}

/* Save the notice as a one-off change dated today (exceptions.js), so reminders and the dashboard follow it. */
async function asstRecordNotice(id, btn) {
  const n = asstProposals[id].notice, g = groups.find((x) => x.name === n.group);
  if (!g || g.id == null) { toast("Save the schedule first", "err"); return; }
  if (n.kind === "reschedule" && !n.time) { toast("No new time was given, so there is nothing to record", "err"); return; }
  const res = await fetch("/api/schedule/exceptions", post({ groupId: g.id, date: dayKey(Date.now()), kind: n.kind === "reschedule" ? "move" : "cancel", from: n.time, note: n.note }));
  if (!res.ok) { toast((await res.json().catch(() => ({}))).error || "Could not record it", "err"); return; }
  btn.disabled = true; btn.textContent = "Recorded ✓"; loadExceptions();
}

/* ── voice (browser speech recognition: free, no server involved) ── */
function asstStopMic() { if (asstRec) asstRec.stop(); }
function asstToggleMic() {
  if (asstRec) { asstRec.stop(); return; }
  const inp = document.getElementById("asstInput"), mic = document.getElementById("asstMic");
  const base = inp.value ? inp.value.trimEnd() + " " : "";
  const r = new AsstSR(); r.interimResults = true; r.lang = navigator.language || "en-US";
  r.onresult = (e) => { inp.value = base + [...e.results].map((x) => x[0].transcript).join(""); };
  r.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Microphone access was blocked", "err"); };
  r.onend = () => { asstRec = null; mic.classList.remove("rec"); inp.focus(); };
  asstRec = r; mic.classList.add("rec"); r.start();
}

/* ── photo: downscaled in the browser before it is sent ── */
function asstClearImage() { asstImage = null; const t = document.getElementById("asstThumb"); t.classList.add("hidden"); t.innerHTML = ""; }
function asstPickImage(input) {
  const f = input.files[0]; input.value = ""; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    asstImage = c.toDataURL("image/jpeg", 0.82); URL.revokeObjectURL(img.src);
    const t = document.getElementById("asstThumb"); t.classList.remove("hidden");
    t.innerHTML = `<img src="${asstImage}" alt="Attached photo"/><span>Photo attached</span><button type="button" class="btn btn-ghost btn-sm" onclick="asstClearImage()">Remove</button>`;
    document.getElementById("asstInput").focus();
  };
  img.onerror = () => toast("Could not read that image", "err");
  img.src = URL.createObjectURL(f);
}

/* ── settings (Settings → Automation) ── */
async function loadAssistantConfig() {
  try {
    const d = await (await fetch("/api/assistant/config")).json();
    document.getElementById("asBase").value = d.baseUrl || "";
    document.getElementById("asModel").value = d.model || "";
    document.getElementById("asKey").placeholder = d.hasKey ? "•••••••• (saved — blank keeps it)" : "API key";
    document.getElementById("asLocalUrl").value = d.localUrl || "";
    document.getElementById("asLocalModel").value = d.localModel || "";
    const state = d.providerReady ? (d.localReady ? "Ready — provider, with local fallback" : "Ready") : d.localReady ? "Ready — local model only" : "Not set up yet";
    document.getElementById("asStatus").textContent = d.canEdit ? state : "Only admins can change these.";
  } catch {}
  loadWaAssistant();
}
async function loadWaAssistant(d) {
  try {
    d = d || await (await fetch("/api/assistant/whatsapp")).json();
    const t = document.getElementById("waAsstToggle"), n = document.getElementById("waAsstNote"); if (!t) return;
    t.checked = !!d.enabled;
    t.disabled = !d.enabled && !(d.ready && d.linked);
    n.textContent = !d.linked ? "Link WhatsApp on Automated Send first." : !d.ready ? "Set up the assistant above first." : d.pending ? "A change is waiting for your “ssies yes”." : "";
  } catch {}
}
async function setWaAssistant(on) {
  try {
    const res = await fetch("/api/assistant/whatsapp", put({ enabled: on }));
    const d = await res.json(); if (!res.ok) throw new Error(d.error || "Could not save");
    loadWaAssistant(d);
    toast(on ? "On — message yourself in WhatsApp, starting with “ssies”" : "WhatsApp assistant off", "ok");
  } catch (e) { toast(e.message, "err"); loadWaAssistant(); }
}
async function saveAssistantConfig() {
  const body = { baseUrl: document.getElementById("asBase").value.trim(), model: document.getElementById("asModel").value.trim(),
    localUrl: document.getElementById("asLocalUrl").value.trim(), localModel: document.getElementById("asLocalModel").value.trim() };
  const k = document.getElementById("asKey").value.trim(); if (k) body.apiKey = k;
  try {
    const res = await fetch("/api/assistant/config", put(body));
    const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || "Save failed");
    document.getElementById("asKey").value = ""; await loadAssistantConfig(); toast("Assistant settings saved ✓", "ok"); return true;
  } catch (e) { toast(e.message || "Save failed", "err"); return false; }
}
async function testAssistant() {
  const st = document.getElementById("asStatus");
  if (!(await saveAssistantConfig())) return;
  st.textContent = "Testing…";
  try {
    const res = await fetch("/api/assistant", post({ message: "Say hello in five words. Make no changes." }));
    const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.error || "Test failed");
    st.textContent = (d.via === "local" ? "Answered by the LOCAL model" + (d.why ? " (provider: " + d.why + ")" : "") : "Working ✓") + " — “" + (d.reply || "").slice(0, 80) + "”";
  } catch (e) { st.textContent = "Failed: " + (e.message || "no answer"); }
}
