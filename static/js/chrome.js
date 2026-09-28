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
function toast(msg, isError) {
  const el = document.getElementById("toast");
  if (!el) {
    console.log(msg);
    return;
  }
  el.textContent = msg;
  el.style.background = isError ? "#b91c1c" : "#0b1220";
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2800);
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
