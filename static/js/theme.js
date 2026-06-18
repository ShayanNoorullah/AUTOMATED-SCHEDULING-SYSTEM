/* Dashboard theme & layout preferences (localStorage) */
const ACCENTS = ["#0000EE", "#0F62FE", "#6E56CF", "#0E9F6E", "#D9480F", "#0CA5E9", "#E11D48", "#111827"];

const THEME_KEYS = {
  mode: "theme-mode",
  accent: "accent",
  anim: "anim",
  compact: "compact",
  fontSize: "font-size",
  density: "ui-density",
  radius: "corner-radius",
  rail: "sidebar-width",
  defaultPage: "default-page",
  sendMode: "default-send-mode",
  statusLog: "status-log",
  zebra: "table-zebra",
  navIcons: "nav-icon-style",
  railCollapsed: "rail-collapsed",
};

function applyTheme() {
  const html = document.documentElement;
  const mode = localStorage.getItem(THEME_KEYS.mode) || "system";
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  html.setAttribute("data-theme", dark ? "dark" : "light");

  const qt = document.getElementById("quickTheme");
  if (qt) qt.innerHTML = dark ? sunIcon() : moonIcon();

  const accent = localStorage.getItem(THEME_KEYS.accent) || "#0000EE";
  html.style.setProperty("--accent", accent);

  const anim = localStorage.getItem(THEME_KEYS.anim) !== "off";
  document.body.classList.toggle("anim-on", anim);

  const compactLegacy = localStorage.getItem(THEME_KEYS.compact) === "on";
  const density = localStorage.getItem(THEME_KEYS.density) || (compactLegacy ? "compact" : "comfortable");
  if (density === "comfortable") html.removeAttribute("data-density");
  else html.setAttribute("data-density", density);
  if (density === "compact") {
    html.style.setProperty("--rail-w", "200px");
    html.style.setProperty("--r-lg", "12px");
  } else {
    const rail = localStorage.getItem(THEME_KEYS.rail) || "default";
    if (rail === "narrow") html.setAttribute("data-rail", "narrow");
    else if (rail === "wide") html.setAttribute("data-rail", "wide");
    else html.removeAttribute("data-rail");
    if (density !== "compact") html.style.removeProperty("--r-lg");
  }

  const fontSize = localStorage.getItem(THEME_KEYS.fontSize) || "medium";
  if (fontSize === "medium") html.removeAttribute("data-font");
  else html.setAttribute("data-font", fontSize);

  const radius = localStorage.getItem(THEME_KEYS.radius) || "rounded";
  if (radius === "rounded") html.removeAttribute("data-radius");
  else html.setAttribute("data-radius", radius);

  const zebra = localStorage.getItem(THEME_KEYS.zebra) === "on";
  html.setAttribute("data-zebra", zebra ? "on" : "");

  const statusLog = localStorage.getItem(THEME_KEYS.statusLog) || "auto";
  html.setAttribute("data-status-log", statusLog === "never" ? "never" : "");

  const navStyle = localStorage.getItem(THEME_KEYS.navIcons) || "outline";
  document.querySelectorAll(".nav-item .ico.svg-ico").forEach((el) => {
    el.classList.toggle("filled", navStyle === "filled");
  });

  updateLogoChevron();
  syncSettingsUI();
}

function setMode(m) {
  localStorage.setItem(THEME_KEYS.mode, m);
  applyTheme();
}

function quickToggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  setMode(cur === "dark" ? "light" : "dark");
}

function setAccent(c) {
  localStorage.setItem(THEME_KEYS.accent, c);
  applyTheme();
}

function setAnim(on) {
  localStorage.setItem(THEME_KEYS.anim, on ? "on" : "off");
  applyTheme();
}

function setCompact(on) {
  localStorage.setItem(THEME_KEYS.compact, on ? "on" : "off");
  if (on) localStorage.setItem(THEME_KEYS.density, "compact");
  else if (localStorage.getItem(THEME_KEYS.density) === "compact") localStorage.setItem(THEME_KEYS.density, "comfortable");
  applyTheme();
}

function setPref(key, value) {
  localStorage.setItem(key, value);
  applyTheme();
}

function syncSettingsUI() {
  const mode = localStorage.getItem(THEME_KEYS.mode) || "system";
  document.querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));

  const accent = localStorage.getItem(THEME_KEYS.accent) || "#0000EE";
  const sw = document.getElementById("swatches");
  if (sw) {
    sw.innerHTML = ACCENTS.map(
      (c) => `<div class="sw ${c.toLowerCase() === accent.toLowerCase() ? "on" : ""}" style="background:${c}" onclick="setAccent('${c}')"></div>`
    ).join("");
  }
  const ap = document.getElementById("accentPicker");
  if (ap) ap.value = accent;

  const at = document.getElementById("animToggle");
  if (at) at.checked = localStorage.getItem(THEME_KEYS.anim) !== "off";

  const ct = document.getElementById("compactToggle");
  if (ct) ct.checked = localStorage.getItem(THEME_KEYS.compact) === "on" || localStorage.getItem(THEME_KEYS.density) === "compact";

  syncSeg("fontSeg", localStorage.getItem(THEME_KEYS.fontSize) || "medium");
  syncSeg("densitySeg", localStorage.getItem(THEME_KEYS.density) || "comfortable");
  syncSeg("radiusSeg", localStorage.getItem(THEME_KEYS.radius) || "rounded");
  syncSeg("railSeg", localStorage.getItem(THEME_KEYS.rail) || "default");
  syncSeg("pageSeg", localStorage.getItem(THEME_KEYS.defaultPage) || "groups");
  syncSeg("sendSeg", localStorage.getItem(THEME_KEYS.sendMode) || "ask");
  syncSeg("logSeg", localStorage.getItem(THEME_KEYS.statusLog) || "auto");
  syncSeg("zebraSeg", localStorage.getItem(THEME_KEYS.zebra) === "on" ? "on" : "off");
  syncSeg("navSeg", localStorage.getItem(THEME_KEYS.navIcons) || "outline");
}

function syncSeg(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.val === val));
}

function showSettingsTab(tab) {
  document.querySelectorAll(".stab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  document.querySelectorAll(".stab-panel").forEach((p) => p.classList.toggle("on", p.id === `stab-${tab}`));
  if (tab === "security" && typeof loadAudit === "function") loadAudit();
}

function toggleRailFromLogo() {
  const app = document.getElementById("app");
  if (!app) return;
  if (window.innerWidth <= 820) {
    app.classList.toggle("rail-open");
  } else {
    app.classList.toggle("rail-collapsed");
    localStorage.setItem(THEME_KEYS.railCollapsed, app.classList.contains("rail-collapsed") ? "1" : "0");
    updateLogoChevron();
  }
}

function toggleRailMobile() {
  document.getElementById("app")?.classList.toggle("rail-open");
}

function updateLogoChevron() {
  const app = document.getElementById("app");
  const collapsed = app?.classList.contains("rail-collapsed");
  const chev = document.getElementById("logoChev");
  const logo = document.getElementById("brandLogo");
  if (logo) logo.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  if (chev) chev.innerHTML = collapsed ? chevRight() : chevLeft();
}

function getDefaultSendMode() {
  return localStorage.getItem(THEME_KEYS.sendMode) || "ask";
}

function getStatusLogPref() {
  return localStorage.getItem(THEME_KEYS.statusLog) || "auto";
}

function moonIcon() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

function sunIcon() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
}

function chevLeft() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>';
}

function chevRight() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if ((localStorage.getItem(THEME_KEYS.mode) || "system") === "system") applyTheme();
});
