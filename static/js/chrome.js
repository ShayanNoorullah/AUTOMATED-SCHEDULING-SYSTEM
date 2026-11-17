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
function askDialog({ text, input, ok = "OK", cancel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "ask-dlg";
    const hasInput = input != null;
    d.innerHTML = `<form><p></p>${hasInput ? '<input class="field" autofocus/>' : ""}
      <div class="ask-actions">${cancel ? `<button type="button" class="btn btn-soft"${danger ? " autofocus" : ""}>${esc(cancel)}</button>` : ""}
      <button class="btn ${danger ? "btn-danger" : "btn-primary"}"${hasInput || danger ? "" : " autofocus"}>${esc(ok)}</button></div></form>`;
    d.querySelector("p").textContent = text;
    const inp = d.querySelector("input");
    if (inp) inp.value = input;
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
    if (inp) inp.select();
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
      });
    }
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
addEventListener("DOMContentLoaded", () => { queueAllIndicators(); labelIconButtons(document.body); });
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
