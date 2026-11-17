/* Profile and Notifications — used by the /profile page and by the in-app Profile and
   Notifications views in the user portal (index.html), so both behave the same. */
async function _pj(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) }, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function _acctRefreshChrome() {
  if (typeof applyTheme === "function") applyTheme();
  document.querySelectorAll(".user-menu").forEach((el) => el.remove());
  if (typeof renderUserMenu === "function") { renderUserMenu(); if (typeof renderRailAccount === "function") renderRailAccount(); }
}

async function loadPwPending() {
  if ((window.SSIES_USER && window.SSIES_USER.role) === "superadmin") return;
  const ban = document.getElementById("pwPendingBanner"); if (!ban) return;
  try {
    const d = await _pj("/api/profile/password-request");
    if (d.pending) {
      const when = typeof relTime === "function" ? relTime(d.pending.requested_at || d.pending.requestedAt) : "";
      ban.style.display = ""; ban.textContent = "⏳ A password reset request is pending approval" + (when ? " · " + when : "");
    } else { ban.style.display = "none"; ban.textContent = ""; }
  } catch (e) {}
}
async function saveProfile() {
  const btn = document.getElementById("saveProfileBtn"); if (btn) btn.disabled = true;
  try {
    const name = document.getElementById("displayName").value.trim();
    await _pj("/api/profile", { method: "PUT", body: JSON.stringify({ displayName: name }) });
    const hero = document.getElementById("profileHeroName");
    if (hero) hero.textContent = name || (window.SSIES_USER && window.SSIES_USER.email) || "";
    if (window.SSIES_USER) window.SSIES_USER.display_name = name;
    toast("Profile saved");
    _acctRefreshChrome();
  } catch (e) { toast(e.message || "Save failed", "err"); }
  finally { if (btn) btn.disabled = false; }
}
async function changePw() {
  const btn = document.getElementById("savePwBtn");
  const cur = document.getElementById("curPw").value, nw = document.getElementById("newPw").value, nw2 = document.getElementById("newPw2").value;
  if (nw.length < 8) { toast("Password must be at least 8 characters", "err"); return; }
  if (nw !== nw2) { toast("New passwords do not match", "err"); return; }
  if (btn) btn.disabled = true;
  const isSuper = (window.SSIES_USER && window.SSIES_USER.role) === "superadmin";
  try {
    if (isSuper) {
      await _pj("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current: cur, new: nw }) });
      toast("Password updated");
    } else {
      await _pj("/api/profile/password-request", { method: "POST", body: JSON.stringify({ current: cur, password: nw }) });
      toast("Password reset requested — awaiting approval");
      await loadPwPending();
    }
    ["curPw", "newPw", "newPw2"].forEach((id) => { const el = document.getElementById(id); el.value = ""; el.dispatchEvent(new Event("input")); });
  } catch (e) { toast(e.message || "Password update failed", "err"); }
  finally { if (btn) btn.disabled = false; }
}
function togglePw(id, btn) {
  const el = document.getElementById(id); if (!el) return;
  const show = el.type === "password";
  el.type = show ? "text" : "password";
  if (btn) btn.textContent = show ? "Hide" : "Show";
}
async function pickProfileImage(input) {
  let f = input.files && input.files[0]; input.value = "";
  if (!f) return;
  if (!f.type.startsWith("image/")) { toast("Please choose an image file", "err"); return; }
  if (typeof cropImage === "function") { f = await cropImage(f); if (!f) return; }   // square crop step (chrome.js)
  if (f.size > 3 * 1024 * 1024) { toast("Image too large (max 3 MB)", "err"); return; }
  const fd = new FormData(); fd.append("file", f);
  try {
    const res = await fetch("/api/photos/profile", { method: "POST", body: fd, credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed");
    const url = data.photo_url || data.url || "/api/photos/file/profile";
    const av = document.getElementById("profileAvatar");
    if (av) { av.classList.add("has-img"); av.innerHTML = `<img src="${url}?t=${Date.now()}" alt=""/>`; }
    const rm = document.getElementById("removePhotoBtn"); if (rm) rm.style.display = "";
    if (window.SSIES_USER) window.SSIES_USER.photo_url = url;
    toast("Photo updated");
    _acctRefreshChrome();
  } catch (e) { toast(e.message || "Upload failed", "err"); }
}
async function removeProfileImage() {
  try {
    await _pj("/api/photos/profile", { method: "DELETE" });
    const av = document.getElementById("profileAvatar");
    const ch = ((window.SSIES_USER && (window.SSIES_USER.display_name || window.SSIES_USER.email)) || "?").charAt(0).toUpperCase();
    if (av) { av.classList.remove("has-img"); av.textContent = ch; }
    const rm = document.getElementById("removePhotoBtn"); if (rm) rm.style.display = "none";
    if (window.SSIES_USER) window.SSIES_USER.photo_url = null;
    toast("Photo removed");
    _acctRefreshChrome();
  } catch (e) { toast(e.message || "Remove failed", "err"); }
}

/* Password strength: any <input data-pw-meter> gets a bar and a word under it. */
function pwScore(v) {
  if (!v) return 0;
  let s = v.length >= 8 ? 1 : 0;
  if (v.length >= 12) s++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
  return Math.min(4, s);
}
function attachPwMeters(root = document) {
  root.querySelectorAll("input[data-pw-meter]").forEach((inp) => {
    if (inp._meter) return;
    const m = document.createElement("div");
    m.className = "pw-meter"; m.setAttribute("aria-live", "polite");
    m.innerHTML = '<span class="pw-bar"><i></i></span><span class="pw-word"></span>';
    (inp.closest(".profile-pw-row") || inp).insertAdjacentElement("afterend", m);
    inp._meter = m;
    const words = ["Too short", "Weak", "Fair", "Good", "Strong"];
    const upd = () => {
      const s = inp.value ? Math.max(pwScore(inp.value), inp.value.length >= 8 ? 1 : 0) : -1;
      m.dataset.s = s; m.querySelector(".pw-word").textContent = s < 0 ? "" : words[s];
    };
    inp.addEventListener("input", upd); upd();
  });
}

/* ── In-app Notifications view: Today / Yesterday / Earlier, click one to mark it read ── */
let _notifAll = [], _notifFilter = "all";
async function loadNotifPage() {
  const box = document.getElementById("notifPage"); if (!box) return;
  if (!_notifAll.length && typeof skel === "function") box.innerHTML = `<div class="skel-list">${skel("rows", 5)}</div>`;
  try {
    const d = await _pj("/api/notifications?limit=500");
    _notifAll = (d.notifications || d.items || []).map((n) => ({ id: n.id, text: n.text || "", at: n.at || n.created_at, read: !!n.read }));
  } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message || "Could not load notifications")}</p>`; return; }
  renderNotifPage();
}
function setNotifFilter(v) {
  _notifFilter = v;
  document.querySelectorAll("#notifFilterSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === v));
  renderNotifPage();
}
function renderNotifPage() {
  const box = document.getElementById("notifPage"); if (!box) return;
  const q = (document.getElementById("notifSearch")?.value || "").trim().toLowerCase();
  const rows = _notifAll.filter((n) => (_notifFilter !== "unread" || !n.read) && (!q || n.text.toLowerCase().includes(q)));
  const unread = _notifAll.filter((n) => !n.read).length;
  const sum = document.getElementById("notifSummary");
  if (sum) sum.textContent = `${_notifAll.length} notification${_notifAll.length === 1 ? "" : "s"} · ${unread} unread`;
  if (!rows.length) {
    box.innerHTML = `<div class="empty"><div class="ic">🔔</div><p>${_notifAll.length ? "Nothing matches" : "No notifications yet"}</p></div>`;
    return;
  }
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const label = (iso) => {
    const d = new Date(iso); if (isNaN(d)) return "Earlier";
    const diff = Math.round((day0 - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "Earlier this week" : "Older";
  };
  let html = "", cur = "";
  rows.forEach((n) => {
    const g = label(n.at);
    if (g !== cur) { if (cur) html += "</div>"; html += `<div class="np-group"><div class="np-h">${g}</div>`; cur = g; }
    const full = n.at ? new Date(n.at).toLocaleString() : "";
    html += `<button type="button" class="np-item${n.read ? "" : " unread"}" onclick="notifPageRead(${n.id})" title="${n.read ? "" : "Mark as read"}">
      <span class="notif-dot" aria-hidden="true"></span><span class="np-text">${esc(n.text)}</span>
      <time class="np-time" title="${esc(full)}">${esc(typeof relTime === "function" ? relTime(n.at) : full)}</time></button>`;
  });
  box.innerHTML = html + "</div>";
}
async function notifPageRead(id) {
  const n = _notifAll.find((x) => x.id === id); if (!n || n.read) return;
  n.read = true; renderNotifPage();
  try { await _pj("/api/notifications/read", { method: "POST", body: JSON.stringify({ ids: [id] }) }); } catch (e) {}
  if (typeof refreshNotifications === "function") refreshNotifications();
}
async function notifPageMarkAll() {
  _notifAll.forEach((n) => { n.read = true; }); renderNotifPage();
  try { await _pj("/api/notifications/read", { method: "POST", body: "{}" }); toast("All notifications marked read"); } catch (e) { toast(e.message || "Failed", "err"); }
  if (typeof refreshNotifications === "function") refreshNotifications();
}

document.addEventListener("DOMContentLoaded", () => {
  attachPwMeters();
  if (document.getElementById("pwPendingBanner")) loadPwPending();
});
