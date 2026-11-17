/* Production chrome bridge — session + helpers for theme.js (no POC store.js) */
window.SSIES_USER = window.SSIES_USER || null;

function getSession() {
  const u = window.SSIES_USER;
  if (!u) return null;
  return {
    email: u.email,
    display_name: u.display_name || u.displayName || (u.email || "").split("@")[0],
    role: u.role || "user",
    photo_url: u.photo_url || u.profilePic || null,
  };
}
function currentUser() {
  const s = getSession();
  if (!s) return null;
  return {
    email: s.email,
    displayName: s.display_name,
    role: s.role,
    profilePic: s.photo_url,
  };
}
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function avatarImgFallback(img, ch) {
  const parent = img && img.parentElement;
  if (img) img.remove();
  if (!parent) return;
  parent.classList.remove("has-img");
  if (!parent.textContent.trim()) parent.textContent = ch || "?";
}
function avatarInner(name, pic) {
  const ch = (name || "?").trim().charAt(0).toUpperCase() || "?";
  if (!pic) return esc(ch);
  return `<img src="${esc(pic)}" alt="" onerror="avatarImgFallback(this,'${esc(ch)}')"/>`;
}
function relTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
/* Toasts stack. kind: falsy = neutral, "ok" = success, anything else truthy = error.
   action {label, fn} adds a button (Undo). Returns a function that dismisses the toast. */
function toast(msg, kind, action) {
  let box = document.getElementById("toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    box.className = "toasts";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
  }
  // A modal <dialog> makes everything outside it inert and paints above it, so the stack
  // lives inside the topmost open modal dialog while one is up (moved back on close, below).
  const host = [...document.querySelectorAll("dialog:modal")].pop() || document.body;
  if (box.parentNode !== host) host.appendChild(box);
  const el = document.createElement("div");
  el.className = "toast-item" + (kind === "ok" ? " ok" : kind ? " err" : "");
  const txt = document.createElement("span");
  txt.textContent = msg;
  el.appendChild(txt);
  const dismiss = () => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = action.label;
    b.onclick = () => { dismiss(); action.fn(); };
    el.appendChild(b);
  }
  box.appendChild(el);
  setTimeout(dismiss, action ? UNDO_MS : 2800);
  return dismiss;
}
const UNDO_MS = 6000;
/* Close a <dialog>, first moving the toast stack out of it so live toasts stay visible. */
function closeDialog(d) {
  const box = document.getElementById("toasts");
  if (box && d.contains(box)) document.body.appendChild(box);
  if (d.open) d.close();
}

/* Styled replacements for confirm() / prompt() / alert() on a native <dialog>
   (focus trap, Esc and backdrop come with the element). All return a Promise.
   Resolved from the buttons and Esc directly: the dialog's own close event waits for a
   painted frame, which a covered window never produces. */
function askDialog({ text, input, ok = "OK", cancel = "Cancel", danger = false, type = "text" }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "ask-dlg";
    const hasInput = input != null;
    d.innerHTML = `<form><p></p>${hasInput ? '<input class="field" autofocus/>' : ""}
      <div class="ask-actions">${cancel ? `<button type="button" class="btn btn-soft"${danger ? " autofocus" : ""}>${esc(cancel)}</button>` : ""}
      <button class="btn ${danger ? "btn-danger" : "btn-primary"}"${hasInput || danger ? "" : " autofocus"}>${esc(ok)}</button></div></form>`;
    d.querySelector("p").textContent = text;
    const inp = d.querySelector("input");
    if (inp) { inp.type = type; inp.value = input; }
    const finish = (yes) => {
      closeDialog(d);
      d.remove();
      resolve(hasInput ? (yes ? inp.value : null) : yes);
    };
    d.querySelector("form").onsubmit = (e) => { e.preventDefault(); finish(true); };
    const cancelBtn = d.querySelector("button[type=button]");
    if (cancelBtn) cancelBtn.onclick = () => finish(false);
    d.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
    document.body.appendChild(d);
    d.showModal();
    if (inp && type === "text") inp.select();
  });
}
function confirmDialog(text, opts) { return askDialog({ text, ...opts }); }
function promptDialog(text, value = "", opts) { return askDialog({ text, input: value, ...opts }); }
function alertDialog(text, opts) { return askDialog({ text, cancel: "", ...opts }); }

/* Modals are <dialog class="modal-scrim">. Esc runs the modal's own close button so any
   cleanup in its close function still happens. */
function openModal(id) { const d = document.getElementById(id); if (d && !d.open) d.showModal(); }
function closeModal(id) { const d = document.getElementById(id); if (d) closeDialog(d); }
document.addEventListener("cancel", (e) => {
  const x = e.target.querySelector && e.target.querySelector(".modal-x");
  if (x) { e.preventDefault(); x.click(); }
}, true);

/* Run a DOM update inside a View Transition when the browser supports it and animations
   are on; otherwise just run it. kind picks the CSS animation: "page" | "in" | "out" | "". */
function vt(fn, kind = "") {
  if (!document.startViewTransition || document.body.classList.contains("no-anim") ||
      matchMedia("(prefers-reduced-motion: reduce)").matches) { fn(); return; }
  document.documentElement.dataset.vt = kind;
  let ran = false;
  const once = () => { if (!ran) { ran = true; fn(); } };
  const t = document.startViewTransition(once);
  // ready rejects when a newer transition cuts this one short; the DOM update still ran.
  t.ready.catch(() => {});
  // The browser only runs the update once it can paint a frame. A window that is covered or
  // throttled never paints, so after a short wait apply the update without the animation.
  setTimeout(() => { if (!ran) { once(); t.skipTransition(); } }, 400);
}

/* Loading placeholders. kind: "rows" | "cards" | "stats" | "dash". */
function skel(kind = "rows", n = 5) {
  const rep = (s, k) => Array.from({ length: k }, () => s).join("");
  const row = '<div class="skel-row"><i class="skel skel-av"></i><i class="skel" style="width:32%"></i><i class="skel" style="width:20%"></i><i class="skel" style="width:14%;margin-left:auto"></i></div>';
  if (kind === "cards") return rep('<i class="skel skel-card"></i>', n);
  if (kind === "stats") return rep('<i class="skel skel-stat"></i>', n);
  if (kind === "dash") return `<i class="skel skel-hero"></i><div class="cards" style="margin-top:18px">${skel("stats", 5)}</div><div class="skel-list" style="margin-top:18px">${rep(row, 4)}</div>`;
  return `<div class="skel-list">${rep(row, n)}</div>`;
}
function logout() {
  location.href = "/logout";
}

window.__notifCache = window.__notifCache || { items: [], pending: [] };

function notificationsFor() {
  return window.__notifCache.items || [];
}
function unreadCount() {
  return (window.__notifCache.items || []).filter((n) => !n.read).length;
}
function pendingRequestsFor(/* role */) {
  return window.__notifCache.pending || [];
}
function markNotificationsRead() {
  (window.__notifCache.items || []).forEach((n) => {
    n.read = true;
  });
  if (typeof fetch === "function") {
    fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => {});
  }
  if (typeof updateNotifBadge === "function") updateNotifBadge();
}
async function refreshNotifications() {
  try {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await res.json();
    window.__notifCache.items = (data.notifications || data.items || []).map((n) => ({
      id: n.id,
      text: n.text || n.body || n.message || "",
      at: n.at || n.created_at,
      read: !!n.read,
    }));
    window.__notifCache.pending = (data.pending || []).map((r) => ({
      id: r.id,
      userEmail: r.user_email || r.userEmail || r.email || "",
      userRole: r.user_role || r.userRole || r.role || "user",
      requestedAt: r.requested_at || r.requestedAt || r.created_at,
    }));
    if (typeof updateNotifBadge === "function") updateNotifBadge();
    if (typeof renderNotifList === "function") {
      const p = document.getElementById("notifPanel");
      if (p && p.classList.contains("open")) renderNotifList();
    }
  } catch (_) {}
}
async function approveReq(id) {
  try {
    const res = await fetch(`/api/password-requests/${id}/approve`, { method: "POST" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast(b.error || "Approve failed");
      return;
    }
    toast("Password reset approved ✓");
    await refreshNotifications();
    if (typeof renderNotifList === "function") renderNotifList();
    if (typeof window.refreshAdminPending === "function") window.refreshAdminPending();
  } catch (_) {
    toast("Approve failed");
  }
}
async function rejectReq(id) {
  try {
    const res = await fetch(`/api/password-requests/${id}/reject`, { method: "POST" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast(b.error || "Reject failed");
      return;
    }
    toast("Request declined");
    await refreshNotifications();
    if (typeof renderNotifList === "function") renderNotifList();
    if (typeof window.refreshAdminPending === "function") window.refreshAdminPending();
  } catch (_) {
    toast("Reject failed");
  }
}

window.approveReq = approveReq;
window.rejectReq = rejectReq;

/* Installable app: /sw.js caches static files only (see static/sw.js). */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}

/* ── Sliding indicator for segmented controls and settings tabs ──
   The selected button keeps its .on class; a pill behind the buttons (styled in
   dashboard.css) moves to it. A MutationObserver drives it, so every existing code path
   that toggles .on animates without being changed. */
const IND_SEL = ".seg, .settings-tabs";
const indQueue = new Set();
function placeIndicator(box) {
  const on = box.querySelector(":scope > .on");
  if (!on || !box.offsetWidth) { box.classList.remove("has-ind"); return; }
  box.style.setProperty("--ind-x", on.offsetLeft + "px");
  box.style.setProperty("--ind-y", on.offsetTop + "px");
  box.style.setProperty("--ind-w", on.offsetWidth + "px");
  box.style.setProperty("--ind-h", on.offsetHeight + "px");
  box.classList.add("has-ind");
}
function queueIndicator(box) {
  if (!indQueue.size) requestAnimationFrame(() => { indQueue.forEach(placeIndicator); indQueue.clear(); });
  indQueue.add(box);
}
function queueAllIndicators(root = document) { root.querySelectorAll(IND_SEL).forEach(queueIndicator); }

/* Icon-only buttons get a spoken name from their tooltip (screen readers skip the title). */
/* Follow the pointer after it has moved a few pixels; onEnd gets the last event, or null
   when it was only a click, was cancelled, or Escape was pressed. */
const _copyKey = (e) => e.ctrlKey || e.altKey || e.metaKey;   // copy instead of move
function _pointerTrack(ev, onMove, onEnd) {
  const sx = ev.clientX, sy = ev.clientY; let live = false;
  const mv = (e) => { if (!live && Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return; live = true; onMove(e); };
  const up = (e) => finish(live ? e : null), cancel = () => finish(null);
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); finish(null); } };
  function finish(e) {
    removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
    removeEventListener("pointercancel", cancel); removeEventListener("keydown", key, true);
    onEnd(e);
  }
  addEventListener("pointermove", mv); addEventListener("pointerup", up);
  addEventListener("pointercancel", cancel); addEventListener("keydown", key, true);
}
/* Emoji picker for message boxes: any <textarea data-emoji> gets a small button under it.
   The emoji goes in at the caret and an input event runs, so previews update. */
const EMOJI = "😊 🙂 😀 😂 🙏 👍 👏 🙌 👋 🤝 ✅ ❌ ⚠️ ❗ ❓ ⏰ 🕒 📅 🗓️ 📌 📍 📝 📚 📖 ✏️ 🎓 🏫 💡 🔔 📢 🎉 🌟 ⭐ 💯 🔥 ❤️ 💙 💚 ☀️ 🌙 🚫 ➡️ ⬅️ 🔁 ☑️ 📞 💬".split(" ");
function attachEmoji(root) {
  const tas = root.matches && root.matches("textarea[data-emoji]") ? [root] : [...(root.querySelectorAll ? root.querySelectorAll("textarea[data-emoji]") : [])];
  tas.forEach((ta) => {
    if (ta._emoji) return;
    ta._emoji = true;
    const b = document.createElement("button");
    b.type = "button"; b.className = "emoji-btn"; b.textContent = "😊 Emoji";
    b.setAttribute("aria-haspopup", "true"); b.setAttribute("aria-expanded", "false");
    b.onclick = (e) => { e.stopPropagation(); emojiMenu(b, ta); };
    ta.insertAdjacentElement("afterend", b);
  });
}
function emojiMenu(btn, ta) {
  const open = document.querySelector(".emoji-pop");
  if (open) { const same = open._btn === btn; open._close(); if (same) return; }
  const pop = document.createElement("div");
  pop.className = "emoji-pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Insert emoji"); pop._btn = btn;
  pop.innerHTML = EMOJI.map((e) => `<button type="button" aria-label="Insert ${e}">${e}</button>`).join("");
  const close = () => { pop.remove(); btn.setAttribute("aria-expanded", "false"); document.removeEventListener("click", outside, true); document.removeEventListener("keydown", key, true); };
  const outside = (e) => { if (!pop.contains(e.target) && e.target !== btn) close(); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); btn.focus(); } };
  pop._close = close;
  pop.onclick = (e) => {
    const t = e.target.closest("button"); if (!t) return;
    const s = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? s;
    ta.setRangeText(t.textContent, s, en, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
  };
  btn.insertAdjacentElement("afterend", pop);
  btn.setAttribute("aria-expanded", "true");
  document.addEventListener("click", outside, true);
  document.addEventListener("keydown", key, true);
  pop.querySelector("button").focus();
}

function labelIconButtons(root) {
  const els = root.matches && root.matches("button, a") ? [root] : [...(root.querySelectorAll ? root.querySelectorAll("button, a[title]") : [])];
  els.forEach((b) => {
    if (b.hasAttribute("aria-label")) return;
    const text = b.textContent.trim();
    if (text && !/^[^\p{L}\p{N}]{1,3}$/u.test(text)) return;          // has real words already
    const name = b.getAttribute("title") || (b.classList.contains("modal-x") ? "Close" : "");
    if (name) b.setAttribute("aria-label", name);
  });
}

new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === "attributes") {
      const t = m.target, box = t.parentElement;
      if (box && box.matches(IND_SEL)) queueIndicator(box);
      else if (t.matches(".view, .stab-panel, .settings-wrap")) queueAllIndicators(t);   // just became visible
    } else {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches(IND_SEL)) queueIndicator(n); else queueAllIndicators(n);
        labelIconButtons(n);
        attachEmoji(n);
      });
    }
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
addEventListener("DOMContentLoaded", () => { queueAllIndicators(); labelIconButtons(document.body); attachEmoji(document.body); });
addEventListener("resize", () => queueAllIndicators());
if (document.fonts) document.fonts.ready.then(() => queueAllIndicators());   // web font changes button widths

/* Phone tab bar: slide away while scrolling down, come back on any scroll up. */
(function () {
  let last = 0;
  // the dashboard scrolls inside .content, other pages scroll the window; scroll events do
  // not bubble, so listen in the capture phase and look only at those two
  addEventListener("scroll", (e) => {
    const el = e.target === document ? document.scrollingElement : e.target;
    if (!el || !(el === document.scrollingElement || el.classList.contains("content"))) return;
    const y = el.scrollTop;
    if (Math.abs(y - last) < 8) return;
    document.documentElement.classList.toggle("tabbar-hidden", y > last && y > 120);
    last = y;
  }, { passive: true, capture: true });
})();

/* Toolbar "More" menu (narrow screens only — on wide screens its buttons sit in the toolbar). */
function toggleTbMore(id, on) {
  const box = document.getElementById(id); if (!box) return;
  on = on ?? !box.classList.contains("open");
  box.classList.toggle("open", on);
  box.querySelector(".tb-more-btn")?.setAttribute("aria-expanded", String(on));
}
document.addEventListener("click", (e) => { document.querySelectorAll(".tb-more.open").forEach((b) => { if (!b.contains(e.target)) toggleTbMore(b.id, false); }); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".tb-more.open").forEach((b) => { toggleTbMore(b.id, false); b.querySelector(".tb-more-btn")?.focus(); }); });

/* Square photo crop before upload. Resolves to a size×size JPEG File, or null when cancelled.
   Drag (or arrow keys) to position, slider / wheel / + − to zoom. */
function cropImage(file, size = 512) {
  return new Promise((resolve) => {
    if (!file || !String(file.type || "").startsWith("image/")) { toast("Choose an image file", "err"); resolve(null); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); toast("Could not read image", "err"); resolve(null); };
    img.onload = () => {
      const V = 280, base = V / Math.min(img.width, img.height);   // view size; scale that covers it
      let z = 1, x = 0, y = 0, drag = null, done = false;           // zoom, image-centre offset in view px
      const d = document.createElement("dialog");
      d.className = "modal-scrim crop-dlg";
      d.innerHTML = `<div class="modal"><div class="modal-h"><span>Crop photo</span><button class="modal-x" type="button" aria-label="Close">✕</button></div>
        <div class="modal-b"><div class="crop-view" tabindex="0" role="img" aria-label="Photo crop area — drag or use arrow keys to position"><img alt="" draggable="false"/></div>
          <label class="crop-zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1"/></label>
          <p class="hint" style="margin:0;text-align:center">Drag to position · arrow keys nudge · + and − zoom</p></div>
        <div class="modal-f"><button class="btn btn-soft" type="button" data-no>Cancel</button><button class="btn btn-primary" type="button" data-ok style="margin-left:auto">Use photo</button></div></div>`;
      const view = d.querySelector(".crop-view"), pic = d.querySelector("img"), zoom = d.querySelector("input");
      pic.src = url;
      const draw = () => {
        const w = img.width * base * z, h = img.height * base * z;
        x = Math.max(-(w - V) / 2, Math.min((w - V) / 2, x)); y = Math.max(-(h - V) / 2, Math.min((h - V) / 2, y));
        pic.style.width = w + "px"; pic.style.height = h + "px";
        pic.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      };
      const setZoom = (v) => { z = Math.max(1, Math.min(4, v)); zoom.value = z; draw(); };
      view.onpointerdown = (e) => { drag = { px: e.clientX, py: e.clientY, x, y }; view.setPointerCapture(e.pointerId); };
      view.onpointermove = (e) => { if (drag) { x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; draw(); } };
      view.onpointerup = view.onpointercancel = () => { drag = null; };
      view.onwheel = (e) => { e.preventDefault(); setZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); };
      view.onkeydown = (e) => {
        const mv = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
        if (mv) { e.preventDefault(); x += mv[0]; y += mv[1]; draw(); }
        else if (e.key === "+" || e.key === "=") setZoom(z * 1.1);
        else if (e.key === "-") setZoom(z / 1.1);
      };
      zoom.oninput = () => setZoom(+zoom.value);
      const finish = (ok) => {
        if (done) return; done = true;
        closeDialog(d); d.remove();
        if (!ok) { URL.revokeObjectURL(url); resolve(null); return; }
        const c = document.createElement("canvas"); c.width = c.height = size;
        const k = size / V, w = img.width * base * z, h = img.height * base * z, ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);              // transparent PNGs get a white backing
        ctx.drawImage(img, (V / 2 - w / 2 + x) * k, (V / 2 - h / 2 + y) * k, w * k, h * k);
        URL.revokeObjectURL(url);
        c.toBlob((b) => resolve(b ? new File([b], String(file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : null), "image/jpeg", 0.9);
      };
      d.querySelector("[data-ok]").onclick = () => finish(true);
      d.querySelector("[data-no]").onclick = d.querySelector(".modal-x").onclick = () => finish(false);
      d.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
      document.body.appendChild(d);
      d.showModal(); draw(); view.focus();
    };
    img.src = url;
  });
}
