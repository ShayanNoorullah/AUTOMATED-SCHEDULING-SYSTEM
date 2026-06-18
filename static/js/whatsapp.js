/* WhatsApp direct deep-link + automated send orchestration */

const waCache = { links: null, status: null, at: 0 };
const WA_CACHE_MS = 120000;

function buildContactUrlClient(phone, message) {
  const p = String(phone || "").replace(/\D/g, "");
  if (!p) return "";
  const text = encodeURIComponent((message || "").trim());
  return `https://wa.me/${p}` + (text ? `?text=${text}` : "");
}

function buildLinksFromMemory() {
  if (typeof groups === "undefined" || typeof contacts === "undefined") return { groups: [], contacts: [] };
  const outG = groups.map((g) => {
    const msg = typeof messageFor === "function" ? messageFor(g) : g.message || "";
    const invite = (g.inviteLink || "").trim();
    return {
      name: g.name,
      inviteLink: invite,
      directUrl: invite || "https://web.whatsapp.com",
      message: msg,
    };
  });
  const outC = contacts.map((c) => ({
    name: c.name,
    phone: c.phone,
    url: buildContactUrlClient(c.phone, c.message),
    message: c.message || "",
  }));
  return { groups: outG, contacts: outC };
}

function invalidateWaCache() {
  waCache.links = null;
  waCache.status = null;
  waCache.at = 0;
}

async function fetchSessionStatusCached(force) {
  const now = Date.now();
  if (!force && waCache.status && now - waCache.at < WA_CACHE_MS) return waCache.status;
  try {
    waCache.status = await (await fetch("/api/whatsapp/status")).json();
    waCache.at = now;
  } catch {
    waCache.status = { sessionCached: false };
  }
  return waCache.status;
}

async function loadWhatsAppStatus(force) {
  const data = await fetchSessionStatusCached(force);
  return data;
}

function findDirectGroup(name) {
  const links = waCache.links || buildLinksFromMemory();
  return links.groups.find((x) => x.name === name);
}

function findDirectContact(name) {
  const links = waCache.links || buildLinksFromMemory();
  return links.contacts.find((x) => x.name === name);
}

async function renderDirectPanel(force) {
  const gList = document.getElementById("waDirectGroupList");
  const cList = document.getElementById("waDirectContactList");
  if (!gList && !cList) return;

  const q = (document.getElementById("waDirectSearch")?.value || "").toLowerCase();
  waCache.links = buildLinksFromMemory();
  waCache.at = Date.now();

  if (gList) {
    const filtered = waCache.links.groups.filter((g) => !q || g.name.toLowerCase().includes(q));
    if (!filtered.length) {
      gList.innerHTML = '<p class="hint">No groups match. Add groups with optional invite links.</p>';
    } else {
      gList.innerHTML = filtered
        .map((g) => {
          const preview = esc((g.message || "").slice(0, 80)) + ((g.message || "").length > 80 ? "…" : "");
          return `<div class="wa-row wa-row-rich">
            <div class="nm">${esc(g.name)}
              <div class="sub">${g.inviteLink ? "Invite link set" : "No invite link — opens WhatsApp Web"}</div>
              <div class="preview">${preview || "<em>No message</em>"}</div>
            </div>
            <div class="wa-row-actions">
              <button class="btn btn-ghost btn-sm" onclick="copyDirectMessage('group','${escA(g.name)}')">Copy</button>
              <button class="btn btn-soft btn-sm" data-name="${escA(g.name)}" onclick="openDirectGroupByName(this.dataset.name)">Open</button>
            </div>
          </div>`;
        })
        .join("");
    }
  }

  if (cList) {
    const filtered = waCache.links.contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q));
    if (!filtered.length) {
      cList.innerHTML = '<p class="hint">No contacts match.</p>';
    } else {
      cList.innerHTML = filtered
        .map((c) => {
          const preview = esc((c.message || "").slice(0, 80)) + ((c.message || "").length > 80 ? "…" : "");
          return `<div class="wa-row wa-row-rich">
            <div class="nm">${esc(c.name)}<div class="sub">+${esc(c.phone || "")}</div>
              <div class="preview">${preview || "<em>No message</em>"}</div>
            </div>
            <div class="wa-row-actions">
              <button class="btn btn-ghost btn-sm" onclick="copyDirectMessage('contact','${escA(c.name)}')">Copy</button>
              <button class="btn btn-soft btn-sm" data-name="${escA(c.name)}" onclick="openDirectContactByName(this.dataset.name)">Open</button>
            </div>
          </div>`;
        })
        .join("");
    }
  }
}

async function copyDirectMessage(type, name) {
  const item = type === "contact" ? findDirectContact(name) : findDirectGroup(name);
  if (!item?.message) {
    toast("No message to copy", "err");
    return;
  }
  await copyTextSafe(replaceTokens(item.message));
  toast("Message copied");
}

async function copyTextSafe(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function logDirectOpen(name, type) {
  try {
    await fetch("/api/whatsapp/direct-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
  } catch {
    /* ignore */
  }
}

async function openDirectGroupByName(name) {
  const g = findDirectGroup(name);
  if (!g) {
    toast("Group not found", "err");
    return;
  }
  await openDirectGroup(g);
}

async function openDirectContactByName(name) {
  const c = findDirectContact(name);
  if (!c) {
    toast("Contact not found", "err");
    return;
  }
  await openDirectContact(c);
}

async function openDirectGroup(g) {
  const msg = replaceTokens(g.message || "");
  if (msg) await copyTextSafe(msg);
  const url = g.inviteLink || g.directUrl || "https://web.whatsapp.com";
  window.open(url, "_blank", "noopener");
  await logDirectOpen(g.name, "group");
  toast(g.inviteLink ? "Opened group — message copied" : "Opened WhatsApp Web — message copied");
}

async function openDirectContact(c) {
  const url = buildContactUrlClient(c.phone, replaceTokens(c.message || ""));
  if (!url) {
    toast("Invalid phone number", "err");
    return;
  }
  window.open(url, "_blank", "noopener");
  await logDirectOpen(c.name, "contact");
  toast("Opened WhatsApp chat");
}

function openWhatsAppWeb() {
  window.open("https://web.whatsapp.com", "_blank", "noopener");
}

async function releaseWithMode(targets, spin, btn, txt, label, type) {
  if (!targets?.length) {
    toast("Nothing to send", "err");
    return;
  }
  const mode = type || getDefaultSendMode();
  let use = mode;
  if (mode === "ask") {
    use = confirm(
      `Send to ${targets.length} recipient(s)?\n\nOK = Automated Send\nCancel = Open in WhatsApp (direct)`
    )
      ? "automated"
      : "direct";
  }
  if (use === "direct") {
    for (const t of targets) {
      if (t.phone) {
        const c = findDirectContact(t.name) || { name: t.name, phone: t.phone, message: t.message };
        await openDirectContact(c);
      } else {
        const g = findDirectGroup(t.name) || { name: t.name, message: t.message, inviteLink: "", directUrl: "https://web.whatsapp.com" };
        await openDirectGroup(g);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return;
  }
  doRelease(targets, spin, btn, txt, label);
}

function maybeShowStatusOnSend() {
  const pref = getStatusLogPref();
  if (pref === "always" || pref === "auto") showLog();
}

// Legacy alias
async function renderWhatsAppPanel(force) {
  return renderDirectPanel(force);
}
