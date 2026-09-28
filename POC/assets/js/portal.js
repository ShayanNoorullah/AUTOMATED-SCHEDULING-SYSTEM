/* ============================================================
   Portal shell (admin + superadmin) — grouped sidebar/navbar,
   role enforcement, a reusable paginated data-table component,
   and small data helpers over the store. Presentation only —
   business logic, roles and workflow are unchanged.
   ============================================================ */

const PORTAL_ICO = {
  dash: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  user: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  roles: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5z"/><path d="M9 12l2 2 4-4"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  audit: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
  activity: '<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  people: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  system: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
};
const CARET_SVG = '<svg class="caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>';

/* Grouped, categorized navigation (mirrors the user dashboard structure) */
const ADMIN_GROUPS = [
  { type: "item", href: "admin-dashboard.html", key: "dashboard", label: "Dashboard", ico: PORTAL_ICO.dash },
  { type: "group", id: "grpPeople", label: "People", ico: PORTAL_ICO.people, items: [
    { href: "admin-users.html", key: "users", label: "Users", ico: PORTAL_ICO.users },
    { href: "admin-activity.html", key: "activity", label: "Activity log", ico: PORTAL_ICO.activity },
  ]},
  { type: "group", id: "grpAccount", label: "Account", ico: PORTAL_ICO.user, items: [
    { href: "admin-profile.html", key: "profile", label: "Profile", ico: PORTAL_ICO.user },
  ]},
];
const SUPER_GROUPS = [
  { type: "item", href: "superadmin-dashboard.html", key: "dashboard", label: "Dashboard", ico: PORTAL_ICO.dash },
  { type: "group", id: "grpPeople", label: "People", ico: PORTAL_ICO.people, items: [
    { href: "superadmin-users.html?tab=users", key: "users", label: "Users", ico: PORTAL_ICO.users },
    { href: "superadmin-users.html?tab=admins", key: "admins", label: "Admins", ico: PORTAL_ICO.shield },
    { href: "superadmin-users.html?tab=roles", key: "roles", label: "Roles & access", ico: PORTAL_ICO.roles },
  ]},
  { type: "group", id: "grpSystem", label: "System", ico: PORTAL_ICO.system, items: [
    { href: "superadmin-settings.html", key: "settings", label: "Settings", ico: PORTAL_ICO.settings },
    { href: "superadmin-audit.html", key: "audit", label: "Audit log", ico: PORTAL_ICO.audit },
  ]},
  { type: "group", id: "grpAccount", label: "Account", ico: PORTAL_ICO.user, items: [
    { href: "superadmin-profile.html", key: "profile", label: "Profile", ico: PORTAL_ICO.user },
  ]},
];

/* Build the portal rail HTML (shared by initPortal and the profile page so the
   sidebar/navbar never changes shape between portal pages and Profile — #4). */
function portalRailHtml(kind, active) {
  const u = currentUser();
  const groups = kind === "superadmin" ? SUPER_GROUPS : ADMIN_GROUPS;
  const portalTitle = kind === "superadmin" ? "Superadmin" : "Admin Portal";
  const navItem = (it, sub) => `<a class="nav-item${sub ? " nav-sub" : ""}${it.key === active ? " active" : ""}" href="${it.href}"><span class="ico">${it.ico || ""}</span><span class="lbl">${esc(it.label)}</span></a>`;
  const navHtml = groups.map((g) => {
    if (g.type === "item") return navItem(g, false);
    const hasActive = g.items.some((it) => it.key === active);
    return `<div class="nav-group${hasActive ? " has-active open" : ""}" id="${g.id}">
      <button class="nav-item nav-group-btn" onclick="toggleNavGroup(this)" title="${esc(g.label)}"><span class="ico">${g.ico}</span><span class="lbl">${esc(g.label)}</span>${CARET_SVG}</button>
      <div class="nav-submenu">${g.items.map((it) => navItem(it, true)).join("")}</div>
    </div>`;
  }).join("") +
    `<div class="nav-group nav-more hidden" id="navMoreGroup"><button class="nav-item nav-group-btn" onclick="toggleNavGroup(this)" title="More"><span class="ico"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></span><span class="lbl">More</span>${CARET_SVG}</button><div class="nav-submenu" id="navMoreMenu"></div></div>`;
  return `
    <div class="rail-brand">
      <div class="mark"><img src="assets/img/ssies-mark.png" alt="SSIES"/></div>
      <div class="bt"><h1>${portalTitle}</h1><p>${esc(u.displayName || u.email)}</p></div>
    </div>
    <nav class="rail-nav">${navHtml}</nav>
    <div class="rail-foot">
      <div class="rail-user"><div class="av${u.profilePic ? " has-img" : ""}">${avatarInner(u.displayName || u.email, u.profilePic)}</div><div style="min-width:0"><div class="nm">${esc(u.displayName || u.email)}</div><div class="rl">${esc(u.role)}</div></div></div>
      <button class="nav-item" onclick="logout()"><span class="ico">⎋</span><span class="lbl">Log out</span></button>
    </div>`;
}
function initPortal(opts) {
  const kind = opts.kind; // 'admin' | 'superadmin'
  const roles = kind === "superadmin" ? ["superadmin"] : ["admin", "superadmin"];
  const sess = requireSession(roles);
  if (!sess) return null;
  const rail = document.getElementById("rail");
  if (rail) rail.innerHTML = portalRailHtml(kind, opts.active);
  if (typeof reflowNavbar === "function") requestAnimationFrame(reflowNavbar);
  return sess;
}
function logout() { clearSession(); location.href = "login.html"; }

/* ---- Admin/superadmin data helpers over the store ---- */
function userStats(id) {
  const d = STORE.data[id] || { groups: [], contacts: [], templates: [] };
  return { groupCount: (d.groups || []).length, contactCount: (d.contacts || []).length, templateCount: (d.templates || []).length };
}
function listUsers(role) {
  return STORE.users.filter((u) => !role || u.role === role).map((u) => ({ ...u, ...userStats(u.id) }));
}
function findUser(id) { return STORE.users.find((u) => u.id === id); }

function createUser({ email, displayName, password, role }) {
  email = (email || "").trim().toLowerCase();
  if (!email) return { error: "Email is required" };
  if (STORE.users.some((u) => u.email.toLowerCase() === email)) return { error: "A user with that email already exists" };
  if (STORE.system.maxUsers && STORE.users.filter((u) => u.role === "user").length >= STORE.system.maxUsers && role === "user") return { error: "User limit reached" };
  const id = "u-" + Math.random().toString(36).slice(2, 8);
  STORE.users.push({ id, email, displayName: displayName || "", role: role || "user", isActive: true, createdAt: new Date().toISOString(), lastLoginAt: null, password: password || "changeme" });
  STORE.data[id] = { groups: [], contacts: [], templates: [{ name: "Weekly schedule", content: DEFAULT_TEMPLATE_CONTENT, isDefault: true }], settings: { headless: false, delaySeconds: STORE.system.defaultDelay }, history: [], scheduledJob: { enabled: false, dow: 0, hour: 9, minute: 0, lastRunAt: null }, audit: [] };
  logAudit("user_create", email); persist();
  return { id };
}
function updateUser(id, patch) { const u = findUser(id); if (!u) return { error: "Not found" }; Object.assign(u, patch); logAudit("user_update", u.email); persist(); return { ok: true }; }
function deleteUser(id) { const u = findUser(id); if (!u) return; STORE.users = STORE.users.filter((x) => x.id !== id); delete STORE.data[id]; logAudit("user_delete", u.email); persist(); }
function setRole(id, role) { const u = findUser(id); if (!u) return; u.role = role; logAudit("role_change", `${u.email} → ${role}`); persist(); }

function fmtShortDate(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : "—"; }

/* ---- Roles & permissions (dynamic) ---- */
const PERMISSIONS = [
  { key: "schedules", label: "Manage schedules & groups" },
  { key: "send", label: "Send / release messages" },
  { key: "templates", label: "Manage templates" },
  { key: "users", label: "Manage user accounts" },
  { key: "activity", label: "View activity" },
  { key: "admins", label: "Manage admins" },
  { key: "settings", label: "System settings" },
  { key: "audit", label: "View global audit log" },
];
function listRoles() { if (!STORE.roles) STORE.roles = []; return STORE.roles; }
function roleByKey(k) { return listRoles().find((r) => r.key === k); }
function roleLabel(k) { const r = roleByKey(k); return r ? r.label : k; }
function roleUserCount(k) { return STORE.users.filter((u) => u.role === k).length; }
function addRole({ key, label, description, permissions }) {
  key = (key || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!key) return { error: "A role key is required (letters, numbers, - or _)" };
  if (!label || !label.trim()) return { error: "A role name is required" };
  if (roleByKey(key)) return { error: "A role with that key already exists" };
  listRoles().push({ key, label: label.trim(), description: (description || "").trim(), permissions: permissions || [], assignable: true, builtin: false });
  logAudit("role_add", key); persist(); return { ok: true };
}
function updateRole(key, patch) { const r = roleByKey(key); if (!r) return { error: "Not found" }; if (r.builtin) delete patch.key; Object.assign(r, patch); logAudit("role_update", key); persist(); return { ok: true }; }
function deleteRole(key) {
  const r = roleByKey(key); if (!r) return { error: "Not found" };
  if (r.builtin) return { error: "Built-in roles cannot be deleted" };
  if (roleUserCount(key)) return { error: "Reassign the accounts using this role first" };
  STORE.roles = listRoles().filter((x) => x.key !== key); logAudit("role_delete", key); persist(); return { ok: true };
}
function assignableRoles() { return listRoles().filter((r) => r.assignable); }

/* ============================================================
   Reusable data table: search + filters + pagination + views.
   Register with portalTable(cfg); interact via the pt* helpers.
   ============================================================ */
const _pt = {};
const PT_SEARCH_ICO = '<svg class="search-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
function ptVal(row, k) { return typeof k === "function" ? k(row) : row[k]; }
function portalTable(cfg) {
  const st = Object.assign({ page: 1, q: "", filter: {}, perPage: 8 }, cfg);
  st.modes = cfg.modes || null;
  st.mode = (cfg.modeKey && localStorage.getItem(cfg.modeKey)) || (st.modes ? st.modes[0] : "table");
  (cfg.filters || []).forEach((f) => { if (f.default !== undefined) st.filter[f.key] = f.default; });
  _pt[cfg.id] = st;
  ptRender(cfg.id);
  return st;
}
function ptRefresh(id) { if (_pt[id]) ptRenderBody(id); }
/* Search/filter/paging only re-render the BODY — the toolbar (and its focused
   search input) stay in the DOM, so typing no longer loses focus (#1). */
function ptSearch(id, v) { const st = _pt[id]; if (!st) return; st.q = v; st.page = 1; ptRenderBody(id); }
function ptFilter(id, key, v) { const st = _pt[id]; if (!st) return; st.filter[key] = v; st.page = 1; ptRenderBody(id); }
function ptSetMode(id, m) {
  const st = _pt[id]; if (!st) return; st.mode = m;
  if (st.modeKey) { try { localStorage.setItem(st.modeKey, m); } catch (e) {} }
  const mount = document.getElementById(st.mount);
  if (mount) mount.querySelectorAll(".pt-modeseg button").forEach((b) => b.classList.toggle("on", b.textContent.trim().toLowerCase() === m));
  ptRenderBody(id);
}
function ptGoto(id, p) { const st = _pt[id]; if (!st) return; st.page = p; ptRenderBody(id); const el = document.getElementById(st.mount); if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
function ptFiltered(st) {
  let rows = (st.getRows() || []).slice();
  (st.filters || []).forEach((f) => { const v = st.filter[f.key]; if (v) rows = rows.filter((r) => f.match(r, v)); });
  const q = (st.q || "").trim().toLowerCase();
  if (q) rows = rows.filter((r) => (st.searchKeys || []).some((k) => String(ptVal(r, k) || "").toLowerCase().includes(q)));
  if (st.sort) rows.sort(st.sort);
  return rows;
}
function ptRender(id) {
  const st = _pt[id]; if (!st) return;
  const mount = document.getElementById(st.mount); if (!mount) return;
  if (st.bare) { mount.innerHTML = `<div class="pt-bodyhost"></div>`; ptRenderBody(id); return; }
  const filtersHtml = (st.filters || []).map((f) => `<select class="field pt-filter" onchange="ptFilter('${id}','${f.key}',this.value)">${f.options.map((o) => `<option value="${escA(o.val)}" ${st.filter[f.key] === o.val ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`).join("");
  const modesHtml = st.modes ? `<div class="seg pt-modeseg">${st.modes.map((m) => `<button class="${st.mode === m ? "on" : ""}" onclick="ptSetMode('${id}','${m}')">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div>` : "";
  const toolbar = `<div class="toolbar list-toolbar pt-toolbar">
    <div class="search-wrap pt-search">${PT_SEARCH_ICO}<input class="field search" value="${escA(st.q)}" placeholder="${escA(st.searchPlaceholder || "Search…")}" oninput="ptSearch('${id}',this.value)"/></div>
    ${filtersHtml}
    ${st.toolbarExtra || ""}
    ${modesHtml}
  </div>`;
  mount.innerHTML = toolbar + `<div class="pt-bodyhost"></div>`;
  ptRenderBody(id);
}
function ptRenderBody(id) {
  const st = _pt[id]; if (!st) return;
  const mount = document.getElementById(st.mount); if (!mount) return;
  const host = mount.querySelector(".pt-bodyhost"); if (!host) { ptRender(id); return; }
  const rows = ptFiltered(st);
  const total = rows.length, per = st.perPage, pages = Math.max(1, Math.ceil(total / per));
  if (st.page > pages) st.page = pages;
  const start = (st.page - 1) * per, pageRows = rows.slice(start, start + per);

  let body;
  if (!pageRows.length) {
    body = `<div class="tbl-wrap"><div class="empty"><div class="empty-ico">${st.emptyIco || "🔍"}</div><p>${esc(total === 0 && !st.q && !Object.values(st.filter).some(Boolean) ? (st.emptyText || "Nothing here yet") : "No matches for your search/filters")}</p></div></div>`;
  } else if (st.mode === "board" && st.boardCard) {
    body = `<div class="card-grid">${pageRows.map((r) => st.boardCard(r)).join("")}</div>`;
  } else {
    body = `<div class="tbl-wrap"><table class="data grid-table"><thead><tr>${st.columns.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ""}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${pageRows.map((r) => `<tr${st.rowClick ? ` class="pt-clickable" onclick="${st.rowClick(r)}"` : ""}>${st.columns.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ""}>${c.render(r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  let pager = "";
  if (pages > 1) {
    let btns = `<button class="pager-btn" ${st.page === 1 ? "disabled" : ""} onclick="ptGoto('${id}',${st.page - 1})">‹</button>`;
    const win = ptPageWindow(st.page, pages);
    win.forEach((p) => { btns += p === "…" ? `<span class="pager-gap">…</span>` : `<button class="pager-btn${p === st.page ? " on" : ""}" onclick="ptGoto('${id}',${p})">${p}</button>`; });
    btns += `<button class="pager-btn" ${st.page === pages ? "disabled" : ""} onclick="ptGoto('${id}',${st.page + 1})">›</button>`;
    pager = `<div class="pager"><span class="pager-info">Showing ${start + 1}–${Math.min(start + per, total)} of ${total}</span><div class="pager-btns">${btns}</div></div>`;
  } else if (total) {
    pager = `<div class="pager"><span class="pager-info">${total} item${total === 1 ? "" : "s"}</span></div>`;
  }
  host.innerHTML = body + pager;
}
function ptPageWindow(cur, pages) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || (p >= cur - 1 && p <= cur + 1)) out.push(p);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}
