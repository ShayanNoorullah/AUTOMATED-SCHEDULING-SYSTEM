/* Theme & layout preferences (localStorage) — POC parity with production */
const DEFAULT_ACCENT = "#0d9488"; /* teal — default accent in light mode */
const DEFAULT_ACCENT_DARK = "#2dd4bf"; /* teal — default accent in dark mode */
const ACCENTS = ["#0d9488", "#2dd4bf", "#c8a956", "#0F62FE", "#0E9F6E", "#D9480F", "#0CA5E9", "#E11D48", "#111827"];
function defaultAccentFor(dark) { return dark ? DEFAULT_ACCENT_DARK : DEFAULT_ACCENT; }

const THEME_KEYS = {
  mode: "theme-mode", accent: "accent", anim: "anim", compact: "compact",
  fontSize: "font-size", density: "ui-density", radius: "corner-radius", rail: "sidebar-width",
  defaultPage: "default-page", sendMode: "default-send-mode", statusLog: "status-log",
  zebra: "table-zebra", navIcons: "nav-icon-style", railCollapsed: "rail-collapsed",
  navLayout: "nav-layout",
};

/* Run before paint to avoid flash — call inline in <head> too */
function applyThemeEarly() {
  const html = document.documentElement;
  const mode = localStorage.getItem(THEME_KEYS.mode) || "system";
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  html.setAttribute("data-theme", dark ? "dark" : "light");
  let accent = localStorage.getItem(THEME_KEYS.accent) || "";
  const legacy = ["#0000ee", "#c8a956", "#b8943a", "#d4b76a"];
  if (!accent || legacy.includes(accent.toLowerCase())) {
    localStorage.removeItem(THEME_KEYS.accent);
    accent = defaultAccentFor(dark);
  }
  html.style.setProperty("--accent", accent);
  html.setAttribute("data-nav", localStorage.getItem(THEME_KEYS.navLayout) || "sidebar");
}

function applyTheme() {
  const html = document.documentElement;
  const mode = localStorage.getItem(THEME_KEYS.mode) || "system";
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  html.setAttribute("data-theme", dark ? "dark" : "light");

  document.querySelectorAll("#quickTheme, .js-theme-toggle").forEach((qt) => (qt.innerHTML = dark ? sunIcon() : moonIcon()));

  {
    const raw = (localStorage.getItem(THEME_KEYS.accent) || "").toLowerCase();
    if (!raw || ["#0000ee","#c8a956","#b8943a","#d4b76a"].includes(raw)) localStorage.removeItem(THEME_KEYS.accent);
  }
  const accent = localStorage.getItem(THEME_KEYS.accent) || defaultAccentFor(dark);
  html.style.setProperty("--accent", accent);

  const anim = localStorage.getItem(THEME_KEYS.anim) !== "off";
  document.body.classList.toggle("no-anim", !anim);

  const compactLegacy = localStorage.getItem(THEME_KEYS.compact) === "on";
  const density = localStorage.getItem(THEME_KEYS.density) || (compactLegacy ? "compact" : "comfortable");
  if (density === "comfortable") html.removeAttribute("data-density");
  else html.setAttribute("data-density", density);

  if (density !== "compact") {
    const rail = localStorage.getItem(THEME_KEYS.rail) || "default";
    if (rail === "narrow") html.setAttribute("data-rail", "narrow");
    else if (rail === "wide") html.setAttribute("data-rail", "wide");
    else html.removeAttribute("data-rail");
  } else {
    html.removeAttribute("data-rail");
  }

  const fontSize = localStorage.getItem(THEME_KEYS.fontSize) || "medium";
  if (fontSize === "medium") html.removeAttribute("data-font"); else html.setAttribute("data-font", fontSize);

  const radius = localStorage.getItem(THEME_KEYS.radius) || "rounded";
  if (radius === "rounded") html.removeAttribute("data-radius"); else html.setAttribute("data-radius", radius);

  const zebra = localStorage.getItem(THEME_KEYS.zebra) === "on";
  html.setAttribute("data-zebra", zebra ? "on" : "");

  html.setAttribute("data-nav", localStorage.getItem(THEME_KEYS.navLayout) || "sidebar");

  syncSettingsUI();
  requestAnimationFrame(() => { reflowNavbar(); placeNotifBell(); });
}

function setMode(m) { localStorage.setItem(THEME_KEYS.mode, m); applyTheme(); }
function quickToggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  setMode(cur === "dark" ? "light" : "dark");
}
function setAccent(c) { localStorage.setItem(THEME_KEYS.accent, c); applyTheme(); }
function resetAccent() { localStorage.removeItem(THEME_KEYS.accent); applyTheme(); }
function setAnim(on) { localStorage.setItem(THEME_KEYS.anim, on ? "on" : "off"); applyTheme(); }
function setCompact(on) {
  localStorage.setItem(THEME_KEYS.compact, on ? "on" : "off");
  if (on) localStorage.setItem(THEME_KEYS.density, "compact");
  else if (localStorage.getItem(THEME_KEYS.density) === "compact") localStorage.setItem(THEME_KEYS.density, "comfortable");
  applyTheme();
}
function setPref(key, value) { localStorage.setItem(key, value); applyTheme(); }

function syncSettingsUI() {
  const mode = localStorage.getItem(THEME_KEYS.mode) || "system";
  document.querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const accent = localStorage.getItem(THEME_KEYS.accent) || defaultAccentFor(isDark);
  const usingDefault = !localStorage.getItem(THEME_KEYS.accent);
  const sw = document.getElementById("swatches");
  if (sw) sw.innerHTML = ACCENTS.map((c) => `<div class="sw ${!usingDefault && c.toLowerCase() === accent.toLowerCase() ? "on" : ""}" style="background:${c}" onclick="setAccent('${c}')" title="${c}"></div>`).join("");
  const ap = document.getElementById("accentPicker"); if (ap) ap.value = accent;
  const ad = document.getElementById("accentDefaultBtn"); if (ad) ad.classList.toggle("on", usingDefault);

  const at = document.getElementById("animToggle"); if (at) at.checked = localStorage.getItem(THEME_KEYS.anim) !== "off";
  const ct = document.getElementById("compactToggle"); if (ct) ct.checked = localStorage.getItem(THEME_KEYS.compact) === "on" || localStorage.getItem(THEME_KEYS.density) === "compact";

  syncSeg("fontSeg", localStorage.getItem(THEME_KEYS.fontSize) || "medium");
  syncSeg("densitySeg", localStorage.getItem(THEME_KEYS.density) || "comfortable");
  syncSeg("radiusSeg", localStorage.getItem(THEME_KEYS.radius) || "rounded");
  syncSeg("railSeg", localStorage.getItem(THEME_KEYS.rail) || "default");
  syncSeg("pageSeg", localStorage.getItem(THEME_KEYS.defaultPage) || "groups");
  syncSeg("sendSeg", localStorage.getItem(THEME_KEYS.sendMode) || "ask");
  syncSeg("logSeg", localStorage.getItem(THEME_KEYS.statusLog) || "auto");
  syncSeg("zebraSeg", localStorage.getItem(THEME_KEYS.zebra) === "on" ? "on" : "off");
  syncSeg("navSeg", localStorage.getItem(THEME_KEYS.navIcons) || "outline");
  syncSeg("navLayoutSeg", localStorage.getItem(THEME_KEYS.navLayout) || "sidebar");
}
function syncSeg(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.val === val));
}
function showSettingsTab(tab) {
  document.querySelectorAll(".stab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  document.querySelectorAll(".stab-panel").forEach((p) => p.classList.toggle("on", p.id === `stab-${tab}`));
  if (tab === "security") {
    if (typeof loadAudit === "function") loadAudit();
    if (typeof loadPasskeys === "function") loadPasskeys();
  }
  if (tab === "layout") {
    const slider = document.getElementById("psBottomSlider");
    const saved = getPortalSwitcherBottomPct();
    if (slider) slider.value = String(Math.round(saved == null ? 4 : saved));
  }
}
function getDefaultSendMode() { return localStorage.getItem(THEME_KEYS.sendMode) || "ask"; }
function getStatusLogPref() { return localStorage.getItem(THEME_KEYS.statusLog) || "auto"; }

function moonIcon() { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'; }
function sunIcon() { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'; }

/* Mobile rail drawer */
function toggleRail() { document.getElementById("shell")?.classList.toggle("rail-open"); }

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if ((localStorage.getItem(THEME_KEYS.mode) || "system") === "system") applyTheme();
});

/* ---------- Motion layer (presentation only) ---------- */
function motionEnabled() {
  return localStorage.getItem(THEME_KEYS.anim) !== "off" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Button click ripple */
function initRipples() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn || !motionEnabled()) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const r = document.createElement("span");
    r.className = "ripple";
    r.style.width = r.style.height = size + "px";
    r.style.left = e.clientX - rect.left - size / 2 + "px";
    r.style.top = e.clientY - rect.top - size / 2 + "px";
    btn.appendChild(r);
    setTimeout(() => r.remove(), 620);
  });
}

/* Count-up animation for stat numbers */
function animateCounters() {
  if (!motionEnabled()) return;
  document.querySelectorAll(".stat .n").forEach((el) => {
    const raw = (el.textContent || "").trim();
    if (!/^\d+$/.test(raw)) return;
    const target = parseInt(raw, 10);
    if (target === 0) return;
    const dur = 900, start = performance.now();
    el.textContent = "0";
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target).toString();
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

/* Floating portal switcher (User / Admin / Superadmin) — bottom right, vertically adjustable */
const PS_BOTTOM_KEY = "ps-bottom-pct";
function getPortalSwitcherBottomPct() {
  const raw = parseFloat(localStorage.getItem(PS_BOTTOM_KEY) || "");
  if (Number.isFinite(raw)) return Math.min(70, Math.max(2, raw));
  return null; // use CSS default
}
function applyPortalSwitcherBottom(el, pct) {
  if (!el) el = document.querySelector(".portal-switcher");
  if (!el) return;
  const v = pct == null ? getPortalSwitcherBottomPct() : Math.min(70, Math.max(2, Number(pct)));
  if (v == null || Number.isNaN(v)) {
    el.style.removeProperty("bottom");
    return;
  }
  el.style.bottom = `max(12px, calc(${v}vh - 20px))`;
  const slider = document.getElementById("psBottomSlider");
  if (slider && String(slider.value) !== String(Math.round(v))) slider.value = String(Math.round(v));
}
function setPortalSwitcherBottom(pct) {
  const v = Math.min(70, Math.max(2, Number(pct)));
  try { localStorage.setItem(PS_BOTTOM_KEY, String(v)); } catch (e) {}
  applyPortalSwitcherBottom(null, v);
}
function renderPortalSwitcher() {
  try {
    if (typeof getSession !== "function") return;
    const s = getSession();
    if (!s) return;
    const portals = [{ key: "user", label: "User", href: "/" }];
    if (s.role === "admin" || s.role === "superadmin") portals.push({ key: "admin", label: "Admin", href: "/admin/" });
    if (s.role === "superadmin") portals.push({ key: "super", label: "Superadmin", href: "/superadmin/" });
    if (portals.length < 2) return;
    if (document.querySelector(".portal-switcher")) return;
    const path = (location.pathname || "/").toLowerCase();
    let cur = "user";
    if (path.startsWith("/superadmin")) cur = "super";
    else if (path.startsWith("/admin")) cur = "admin";
    const collapsed = localStorage.getItem("ps-collapsed") !== "false"; // default: collapsed
    const el = document.createElement("div");
    el.className = "portal-switcher";
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", "Switch portal");
    el.setAttribute("data-collapsed", collapsed ? "true" : "false");
    el.innerHTML =
      `<button type="button" class="ps-drag" title="Drag to move vertically" aria-label="Move site switcher vertically"><span></span><span></span><span></span></button>` +
      `<button type="button" class="ps-arrow" onclick="togglePortalSwitcher()" title="Switch role view" aria-label="Toggle role switcher"><svg class="ps-caret" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M15 18l-6-6 6-6"/></svg></button>` +
      `<div class="ps-roles">` +
      portals.map((p) => `<button type="button" class="ps-role${p.key === cur ? " on" : ""}" onclick="switchPortal('${p.href}','${p.key === cur}')">${p.label}</button>`).join("") +
      `</div>`;
    document.body.appendChild(el);
    applyPortalSwitcherBottom(el);
    initPortalSwitcherDrag(el);
  } catch (e) {}
}
function initPortalSwitcherDrag(el) {
  const handle = el.querySelector(".ps-drag");
  if (!handle || handle.dataset.bound === "1") return;
  handle.dataset.bound = "1";
  let dragging = false;
  const onMove = (ev) => {
    if (!dragging) return;
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    const vh = window.innerHeight || 800;
    const fromBottom = ((vh - y) / vh) * 100;
    setPortalSwitcherBottom(fromBottom);
    ev.preventDefault();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
  };
  const onDown = (ev) => {
    dragging = true;
    el.classList.add("dragging");
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    onMove(ev);
    ev.preventDefault();
  };
  handle.addEventListener("pointerdown", onDown);
  handle.addEventListener("touchstart", onDown, { passive: false });
}
function togglePortalSwitcher() {
  const el = document.querySelector(".portal-switcher"); if (!el) return;
  const next = el.getAttribute("data-collapsed") === "true" ? "false" : "true";
  el.setAttribute("data-collapsed", next);
  try { localStorage.setItem("ps-collapsed", next); } catch (e) {}
}
function switchPortal(href, isCurrent) { if (isCurrent === "true") return; location.href = href; }

/* Scroll-aware sticky bars — add a subtle shadow once the page scrolls */
function initScrollShadow() {
  const update = () => {
    const y = (document.scrollingElement || document.documentElement).scrollTop || window.scrollY || 0;
    document.documentElement.classList.toggle("is-scrolled", y > 4);
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
}

/* User menu (avatar → dropdown with details + logout) — supports multiple instances */
/* Profile link for the current site (user / admin / superadmin) */
function siteProfileHref() {
  const p = (location.pathname || "/").toLowerCase();
  if (p.startsWith("/superadmin")) return "/superadmin/profile";
  if (p.startsWith("/admin")) return "/admin/profile";
  return "/profile";
}
function buildUserMenu() {
  const u = currentUser(); if (!u) return null;
  const name = u.displayName || u.email;
  const av = (cls) => `<span class="user-menu-av ${cls}${u.profilePic ? " has-img" : ""}">${avatarInner(name, u.profilePic)}</span>`;
  const userIco = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  const outIco = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>';
  const wrap = document.createElement("div");
  wrap.className = "user-menu";
  wrap.innerHTML =
    `<button class="user-menu-btn" onclick="toggleUserMenu(event)" title="Account" aria-haspopup="true">${av("")}</button>` +
    `<div class="user-menu-pop">` +
    `<div class="user-menu-head">${av("lg")}<div class="user-menu-id"><div class="nm">${esc(name)}</div><div class="em">${esc(u.email)}</div><span class="user-menu-role">${esc(u.role)}</span></div></div>` +
    `<a class="user-menu-item" href="${siteProfileHref()}"><span class="umi-ico">${userIco}</span> Profile</a>` +
    `<button class="user-menu-item danger" onclick="logout()"><span class="umi-ico">${outIco}</span> Log out</button>` +
    `</div>`;
  return wrap;
}
function renderUserMenu() { try { const actions = document.querySelector(".topbar-actions"); if (!actions || actions.querySelector(".user-menu")) return; const m = buildUserMenu(); if (m) actions.appendChild(m); } catch (e) {} }
/* Account cluster in the rail (navbar app-bar): theme toggle + profile/logout */
function renderRailAccount() {
  try {
    const foot = document.querySelector(".rail-foot"); if (!foot || foot.querySelector(".rail-account")) return;
    const u = currentUser(); if (!u) return;
    const wrap = document.createElement("div"); wrap.className = "rail-account";
    const t = document.createElement("button"); t.className = "icon-btn js-theme-toggle"; t.title = "Toggle theme"; t.setAttribute("onclick", "quickToggleTheme()"); wrap.appendChild(t);
    const m = buildUserMenu(); if (m) wrap.appendChild(m);
    foot.appendChild(wrap); applyTheme();
  } catch (e) {}
}
function toggleUserMenu(e) { e.stopPropagation(); const pop = e.currentTarget.parentElement.querySelector(".user-menu-pop"); const opening = pop && !pop.classList.contains("open"); document.querySelectorAll(".user-menu-pop.open").forEach((p) => p.classList.remove("open")); if (opening) pop.classList.add("open"); }
document.addEventListener("click", (e) => { if (!e.target.closest(".user-menu")) document.querySelectorAll(".user-menu-pop.open").forEach((p) => p.classList.remove("open")); });

/* Notification bell (bottom-left) — per-user/role notifications + pending approvals */
function renderNotifBell() {
  try {
    if (typeof getSession !== "function") return;
    const s = getSession(); if (!s) return;
    if (document.querySelector(".notif-wrap")) return;
    const bellIco = '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
    const wrap = document.createElement("div");
    wrap.className = "notif-wrap";
    wrap.innerHTML =
      `<button class="notif-bell" onclick="toggleNotif(event)" title="Notifications" aria-label="Notifications">${bellIco}<span class="notif-badge" id="notifBadge"></span></button>` +
      `<div class="notif-panel" id="notifPanel"><div class="notif-head"><span>Notifications</span><button class="notif-clear" onclick="notifMarkAll()">Mark all read</button></div><div class="notif-list" id="notifList"></div></div>`;
    document.body.appendChild(wrap);
    updateNotifBadge();
  } catch (e) {}
}
function updateNotifBadge() {
  const b = document.getElementById("notifBadge"); if (!b) return;
  const s = getSession();
  const pend = s && (s.role === "admin" || s.role === "superadmin") ? pendingRequestsFor(s.role).length : 0;
  const n = unreadCount() + pend;
  b.textContent = n > 9 ? "9+" : String(n);
  b.classList.toggle("show", n > 0);
}
function toggleNotif(e) { e.stopPropagation(); const p = document.getElementById("notifPanel"); const opening = !p.classList.contains("open"); p.classList.toggle("open"); if (opening) renderNotifList(); }
function renderNotifList() {
  const s = getSession(); const el = document.getElementById("notifList"); if (!el) return;
  let html = "";
  const pend = s && (s.role === "admin" || s.role === "superadmin") ? pendingRequestsFor(s.role) : [];
  if (pend.length) {
    html += '<div class="notif-section">Pending approvals</div>';
    html += pend.map((r) => `<div class="notif-req"><div class="notif-req-body"><b>${esc(r.userEmail)}</b><span class="notif-req-sub">${esc(r.userRole)} · password reset · ${relTime(r.requestedAt)}</span></div><div class="notif-req-actions"><button class="btn btn-primary btn-sm" onclick="approveReq('${r.id}')">Approve</button><button class="btn btn-soft btn-sm" onclick="rejectReq('${r.id}')">Reject</button></div></div>`).join("");
  }
  const notes = notificationsFor();
  html += '<div class="notif-section">Recent</div>';
  html += notes.length ? notes.map((n) => `<div class="notif-item${n.read ? "" : " unread"}"><span class="notif-dot"></span><div class="notif-item-body"><div class="notif-text">${esc(n.text)}</div><div class="notif-time">${relTime(n.at)}</div></div></div>`).join("") : '<div class="notif-empty">You\'re all caught up</div>';
  html += '<div class="notif-foot"><a class="notif-view-all" href="/notifications">View all notifications</a></div>';
  el.innerHTML = html;
  markNotificationsRead(); updateNotifBadge();
}
function notifMarkAll() { markNotificationsRead(); renderNotifList(); }
document.addEventListener("click", (e) => { if (!e.target.closest(".notif-wrap")) { const p = document.getElementById("notifPanel"); if (p) p.classList.remove("open"); } });

/* Production aliases for legacy shell helpers */
function toggleRailMobile() { toggleRail(); }
function toggleRailFromLogo() {
  /* Navbar mode: logo is a home control, not a collapse control */
  const navbar = document.documentElement.getAttribute("data-nav") === "navbar" && window.innerWidth > 860;
  if (navbar) {
    if (typeof navGo === "function" && document.getElementById("view-dashboard")) {
      navGo("dashboard");
    } else {
      location.href = "/?view=dashboard";
    }
    return;
  }
  const shell = document.getElementById("shell") || document.getElementById("app");
  if (!shell) return;
  if (window.innerWidth <= 860) { toggleRail(); return; }
  shell.classList.toggle("rail-collapsed");
  localStorage.setItem(THEME_KEYS.railCollapsed, shell.classList.contains("rail-collapsed") ? "1" : "0");
  if (typeof updateLogoChevron === "function") updateLogoChevron();
}
function updateLogoChevron() {
  const shell = document.getElementById("shell") || document.getElementById("app");
  const chev = document.getElementById("logoChev");
  const brand = document.getElementById("brandLogo");
  const navbar = document.documentElement.getAttribute("data-nav") === "navbar" && window.innerWidth > 860;
  if (brand) {
    if (navbar) {
      brand.title = "Go to dashboard";
      brand.setAttribute("aria-label", "Go to dashboard");
    } else {
      brand.title = "Collapse sidebar";
      brand.setAttribute("aria-label", "Toggle sidebar");
    }
  }
  if (!chev || !shell) return;
  if (navbar) { chev.style.display = "none"; return; }
  chev.style.display = "";
  const collapsed = shell.classList.contains("rail-collapsed");
  chev.innerHTML = collapsed
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>';
}

/* In navbar (top app-bar) mode the bell docks in the bar, left of the theme toggle.
   Otherwise it floats bottom-left. One element, re-parented on layout change. */
function placeNotifBell() {
  const wrap = document.querySelector(".notif-wrap"); if (!wrap) return;
  const navbar = document.documentElement.getAttribute("data-nav") === "navbar" && window.innerWidth > 860;
  const acct = document.querySelector(".rail-foot .rail-account");
  if (navbar && acct) {
    if (wrap.parentElement !== acct) acct.insertBefore(wrap, acct.firstChild);
    wrap.classList.add("in-bar");
  } else {
    if (wrap.parentElement !== document.body) document.body.appendChild(wrap);
    wrap.classList.remove("in-bar");
  }
}

/* ---------- Shared top-nav helpers (grouped dropdowns + responsive overflow) ---------- */
/* Used by the user dashboard AND the profile page so the navbar stays identical. */
function isNavbarMode() { return document.documentElement.getAttribute("data-nav") === "navbar" && window.innerWidth > 860; }
/* Persist which sidebar sections are expanded so the accordion state carries
   across pages (dashboard ↔ profile) instead of resetting on every load. */
const NAV_OPEN_KEY = "nav-open-groups";
function persistNavOpen() {
  if (isNavbarMode()) return;
  const ids = [...document.querySelectorAll(".rail .nav-group.open")].map((g) => g.id).filter((id) => id && id !== "navMoreGroup");
  try { localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(ids)); } catch (e) {}
}
function restoreNavOpen() {
  if (isNavbarMode()) return;
  let ids = []; try { ids = JSON.parse(localStorage.getItem(NAV_OPEN_KEY) || "[]"); } catch (e) {}
  if (!Array.isArray(ids)) return;
  ids.forEach((id) => { const g = document.getElementById(id); if (g && g.classList.contains("nav-group")) g.classList.add("open"); });
}
function toggleNavGroup(btn) {
  const g = btn.closest(".nav-group");
  if (isNavbarMode()) {
    const wasOpen = g.classList.contains("open");
    closeNavGroups();
    if (!wasOpen) { g.classList.add("open"); positionNavDropdown(g); }
  } else {
    g.classList.toggle("open");
    persistNavOpen();
  }
}
function positionNavDropdown(g) {
  const btn = g.querySelector(".nav-group-btn");
  const menu = g.querySelector(".nav-submenu");
  if (!btn || !menu) return;
  const r = btn.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = Math.round(r.bottom + 10) + "px";
  const mw = menu.offsetWidth || 222;
  let left = r.left + r.width / 2 - mw / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - mw - 12));
  menu.style.left = Math.round(left) + "px";
  menu.style.setProperty("--arrow-x", Math.round(r.left + r.width / 2 - left) + "px");
}
function closeNavGroups() {
  if (!isNavbarMode()) return;
  document.querySelectorAll(".nav-group.open").forEach((g) => {
    g.classList.remove("open");
    const m = g.querySelector(".nav-submenu");
    if (m) { m.style.position = ""; m.style.top = ""; m.style.left = ""; m.style.removeProperty("--arrow-x"); }
  });
}
function reflowNavbar() {
  const nav = document.querySelector(".rail-nav");
  const more = document.getElementById("navMoreGroup");
  const menu = document.getElementById("navMoreMenu");
  if (!nav || !more || !menu) return;
  while (menu.firstChild) { const it = menu.firstChild; it.classList.remove("nav-sub"); nav.insertBefore(it, more); }
  more.classList.add("hidden");
  if (!isNavbarMode()) return;
  closeNavGroups();
  const movable = [...nav.children].filter((c) => c !== more && !c.classList.contains("nav-group"));
  more.classList.remove("hidden");
  let guard = 0;
  while (nav.scrollWidth > nav.clientWidth + 1 && movable.length && guard++ < 30) {
    const it = movable.pop();
    it.classList.add("nav-sub");
    menu.insertBefore(it, menu.firstChild);
  }
  if (!menu.children.length) more.classList.add("hidden");
}
/* Close open navbar dropdowns on outside-click / scroll (shared) */
document.addEventListener("click", (e) => { if (!e.target.closest(".nav-group")) closeNavGroups(); });
window.addEventListener("scroll", () => { if (document.querySelector(".nav-group.open")) closeNavGroups(); }, { passive: true });
let _navRz; window.addEventListener("resize", () => { closeNavGroups(); clearTimeout(_navRz); _navRz = setTimeout(() => { reflowNavbar(); placeNotifBell(); }, 120); });

function initMotion() {
  initRipples();
  animateCounters();
  renderPortalSwitcher();
  renderUserMenu();
  renderRailAccount();
  renderNotifBell();
  placeNotifBell();
  restoreNavOpen();
  initScrollShadow();
  const shell = document.getElementById("shell") || document.getElementById("app");
  if (shell && localStorage.getItem(THEME_KEYS.railCollapsed) === "1") shell.classList.add("rail-collapsed");
  updateLogoChevron();
  if (typeof refreshNotifications === "function") refreshNotifications();
  requestAnimationFrame(reflowNavbar);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMotion);
else initMotion();

applyThemeEarly();
