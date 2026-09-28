/* ============================================================
   SSIES Schedule Sender — POC data store
   A front-end-only mock backend. Persists to localStorage.
   Business logic (message generation, tokens, schedule format,
   roles, release flow) mirrors the production system exactly.
   ============================================================ */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_TEMPLATE_CONTENT =
  "*Note*\nSchedule for this week:\n* Saturday: 12:00pm - 1:30pm\n* Sunday: 12:00pm - 1:30pm\n*Kindly Acknowledge*";

const STORE_KEY = "ssies_poc_store_v6";
const SESSION_KEY = "ssies_poc_session";

/* ---------- Avatar helpers (shared) ---------- */
function initialsOf(name) {
  const p = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}
/* Deterministic gradient "person" avatar — simulates a WhatsApp profile photo */
function gradAvatar(seed) {
  let h = 0;
  for (const c of String(seed || "x")) h = (h * 31 + c.charCodeAt(0)) % 360;
  const h2 = (h + 42) % 360;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${h},68%,58%)'/><stop offset='1' stop-color='hsl(${h2},64%,44%)'/></linearGradient></defs>` +
    `<rect width='96' height='96' fill='url(#g)'/><circle cx='48' cy='38' r='17' fill='rgba(255,255,255,.9)'/>` +
    `<path d='M18 88c0-18 14-27 30-27s30 9 30 27' fill='rgba(255,255,255,.9)'/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function avatarInner(name, pic) {
  return pic ? `<img src="${escA(pic)}" alt="" draggable="false"/>` : esc(initialsOf(name));
}

/* ---------- Seed data (first run) ---------- */
function seedStore() {
  const now = Date.now();
  const iso = (d) => new Date(d).toISOString();
  return {
    users: [
      { id: "u-super", email: "superadmin@ssies.edu.pk", displayName: "System Owner", role: "superadmin", isActive: true, createdAt: iso(now - 90 * 864e5), lastLoginAt: iso(now - 2 * 36e5), password: "superadmin" },
      { id: "u-admin", email: "admin@ssies.edu.pk", displayName: "Aisha Admin", role: "admin", isActive: true, createdAt: iso(now - 60 * 864e5), lastLoginAt: iso(now - 6 * 36e5), password: "admin" },
      { id: "u-1", email: "teacher@ssies.edu.pk", displayName: "Bilal Teacher", role: "user", isActive: true, createdAt: iso(now - 30 * 864e5), lastLoginAt: iso(now - 1 * 36e5), password: "teacher" },
      { id: "u-2", email: "sara@ssies.edu.pk", displayName: "Sara Coach", role: "user", isActive: true, createdAt: iso(now - 20 * 864e5), lastLoginAt: iso(now - 48 * 36e5), password: "sara1234" },
      { id: "u-3", email: "disabled@ssies.edu.pk", displayName: "Old Account", role: "user", isActive: false, createdAt: iso(now - 120 * 864e5), lastLoginAt: null, password: "disabled" },
      { id: "u-admin2", email: "hamza.admin@ssies.edu.pk", displayName: "Hamza Admin", role: "admin", isActive: true, createdAt: iso(now - 45 * 864e5), lastLoginAt: iso(now - 12 * 36e5), password: "changeme" },
      { id: "u-admin3", email: "nadia.admin@ssies.edu.pk", displayName: "Nadia Rauf", role: "admin", isActive: false, createdAt: iso(now - 25 * 864e5), lastLoginAt: iso(now - 96 * 36e5), password: "changeme" },
      { id: "u-4", email: "ayesha@ssies.edu.pk", displayName: "Ayesha Siddiqui", role: "user", isActive: true, createdAt: iso(now - 18 * 864e5), lastLoginAt: iso(now - 5 * 36e5), password: "changeme" },
      { id: "u-5", email: "usman@ssies.edu.pk", displayName: "Usman Tariq", role: "user", isActive: true, createdAt: iso(now - 17 * 864e5), lastLoginAt: iso(now - 30 * 36e5), password: "changeme" },
      { id: "u-6", email: "hina@ssies.edu.pk", displayName: "Hina Malik", role: "user", isActive: true, createdAt: iso(now - 16 * 864e5), lastLoginAt: iso(now - 8 * 36e5), password: "changeme" },
      { id: "u-7", email: "bilal.ahmed@ssies.edu.pk", displayName: "Bilal Ahmed", role: "user", isActive: false, createdAt: iso(now - 15 * 864e5), lastLoginAt: null, password: "changeme" },
      { id: "u-8", email: "zainab@ssies.edu.pk", displayName: "Zainab Fatima", role: "user", isActive: true, createdAt: iso(now - 14 * 864e5), lastLoginAt: iso(now - 2 * 36e5), password: "changeme" },
      { id: "u-9", email: "omar@ssies.edu.pk", displayName: "Omar Sheikh", role: "user", isActive: true, createdAt: iso(now - 13 * 864e5), lastLoginAt: iso(now - 50 * 36e5), password: "changeme" },
      { id: "u-10", email: "maryam@ssies.edu.pk", displayName: "Maryam Javed", role: "user", isActive: true, createdAt: iso(now - 12 * 864e5), lastLoginAt: iso(now - 15 * 36e5), password: "changeme" },
      { id: "u-11", email: "ahsan@ssies.edu.pk", displayName: "Ahsan Raza", role: "user", isActive: true, createdAt: iso(now - 11 * 864e5), lastLoginAt: iso(now - 70 * 36e5), password: "changeme" },
      { id: "u-12", email: "sana@ssies.edu.pk", displayName: "Sana Ullah", role: "user", isActive: false, createdAt: iso(now - 10 * 864e5), lastLoginAt: iso(now - 200 * 36e5), password: "changeme" },
      { id: "u-13", email: "kamran@ssies.edu.pk", displayName: "Kamran Akmal", role: "user", isActive: true, createdAt: iso(now - 9 * 864e5), lastLoginAt: iso(now - 4 * 36e5), password: "changeme" },
      { id: "u-14", email: "iqra@ssies.edu.pk", displayName: "Iqra Aziz", role: "user", isActive: true, createdAt: iso(now - 8 * 864e5), lastLoginAt: iso(now - 26 * 36e5), password: "changeme" },
      { id: "u-15", email: "faisal@ssies.edu.pk", displayName: "Faisal Qureshi", role: "user", isActive: true, createdAt: iso(now - 6 * 864e5), lastLoginAt: iso(now - 9 * 36e5), password: "changeme" },
      { id: "u-16", email: "rabia@ssies.edu.pk", displayName: "Rabia Noor", role: "user", isActive: true, createdAt: iso(now - 4 * 864e5), lastLoginAt: iso(now - 3 * 36e5), password: "changeme" },
      { id: "u-17", email: "tariq@ssies.edu.pk", displayName: "Tariq Mehmood", role: "user", isActive: true, createdAt: iso(now - 2 * 864e5), lastLoginAt: iso(now - 1 * 36e5), password: "changeme" },
    ],
    roles: [
      { key: "user", label: "User", description: "Manage schedules, groups, contacts, templates, and release messages.", permissions: ["schedules", "send", "templates"], assignable: true, builtin: true },
      { key: "admin", label: "Admin", description: "Manage user accounts and review activity. Cannot modify other admins or system settings.", permissions: ["users", "activity"], assignable: true, builtin: true },
      { key: "superadmin", label: "Superadmin", description: "Full system control — users, admins, roles, WhatsApp automation and audit.", permissions: ["*"], assignable: false, builtin: true },
    ],
    // per-user data keyed by user id
    data: {
      "u-1": {
        groups: [
          { name: "SSIES Batch 2025 — Morning", nickname: "Batch AM", inviteLink: "https://chat.whatsapp.com/DemoInvite123", message: "", lastReleased: iso(now - 7 * 864e5), pic: gradAvatar("SSIES Batch 2025"), waLinked: true,
            schedule: [{ day: "Saturday", from: "12:00pm", to: "1:30pm" }, { day: "Sunday", from: "12:00pm", to: "1:30pm" }] },
          { name: "SSIES Physics Group", nickname: "Physics", inviteLink: "", message: "", lastReleased: "", pic: gradAvatar("Physics"), waLinked: true,
            schedule: [{ day: "Monday", from: "5:00pm", to: "6:30pm" }, { day: "Wednesday", from: "5:00pm", to: "6:30pm" }] },
          { name: "SSIES Weekend Revision", nickname: "Weekend", inviteLink: "", message: "", lastReleased: "", pic: "", waLinked: false,
            schedule: [{ day: "Saturday", from: "1:00pm", to: "2:30pm" }] },
        ],
        contacts: [
          { name: "Ali Khan", phone: "923001234567", message: "*Reminder*\nClass at 12pm tomorrow. *Kindly Acknowledge*", lastReleased: iso(now - 3 * 864e5), pic: gradAvatar("Ali Khan"), waLinked: true, labels: ["VIP", "Physics Batch"] },
          { name: "Fatima Noor", phone: "923339876543", message: "", lastReleased: "", pic: "", waLinked: false, labels: ["Prospects"] },
          { name: "Zara Sheikh", phone: "923011122334", message: "", lastReleased: "", pic: gradAvatar("Zara Sheikh"), waLinked: true, labels: ["Chemistry Batch", "VIP"] },
          { name: "Hamza Ali", phone: "923224455667", message: "", lastReleased: "", pic: gradAvatar("Hamza Ali"), waLinked: true, labels: ["Physics Batch"] },
          { name: "Sana Malik", phone: "923337788990", message: "", lastReleased: "", pic: "", waLinked: false, labels: ["Prospects", "Chemistry Batch"] },
          { name: "Bilal Raza", phone: "923005544332", message: "", lastReleased: "", pic: gradAvatar("Bilal Raza"), waLinked: true, labels: ["Chemistry Batch"] },
        ],
        waLabels: ["VIP", "Physics Batch", "Chemistry Batch", "Prospects"],
        lists: [
          { id: "l-phy", name: "Physics Batch 2025", color: "#0ea5e9", labels: ["Physics Batch"], members: ["923001234567", "923224455667"] },
          { id: "l-vip", name: "VIP Parents", color: "#f59e0b", labels: ["VIP"], members: ["923001234567", "923011122334"] },
          { id: "l-chem", name: "Chemistry Batch", color: "#8b5cf6", labels: ["Chemistry Batch"], members: ["923011122334", "923337788990", "923005544332"] },
        ],
        templates: [
          { name: "Weekly schedule", content: DEFAULT_TEMPLATE_CONTENT, isDefault: true },
          { name: "Class reminder", content: "*Reminder*\nYour class is on {weekday}, {date}.\n*Please be on time.*", isDefault: false },
        ],
        settings: { headless: false, delaySeconds: 5 },
        history: [
          { id: 14, targetName: "SSIES Batch 2025 — Morning", targetType: "group", status: "success", at: iso(now - 2 * 36e5) },
          { id: 13, targetName: "Ayesha Siddiqui", targetType: "contact", status: "success", at: iso(now - 6 * 36e5) },
          { id: 12, targetName: "SSIES Chemistry Elite", targetType: "group", status: "success", at: iso(now - 1 * 864e5) },
          { id: 11, targetName: "SSIES Physics Group", targetType: "group", status: "failed", at: iso(now - 1 * 864e5) },
          { id: 10, targetName: "Bilal Ahmed", targetType: "contact", status: "success", at: iso(now - 2 * 864e5) },
          { id: 9, targetName: "SSIES Batch 2025 — Evening", targetType: "group", status: "success", at: iso(now - 2 * 864e5) },
          { id: 8, targetName: "Fatima Noor", targetType: "contact", status: "success", at: iso(now - 3 * 864e5) },
          { id: 7, targetName: "Ali Khan", targetType: "contact", status: "success", at: iso(now - 3 * 864e5) },
          { id: 6, targetName: "SSIES Biology Circle", targetType: "group", status: "failed", at: iso(now - 4 * 864e5) },
          { id: 5, targetName: "SSIES Batch 2025 — Morning", targetType: "group", status: "success", at: iso(now - 5 * 864e5) },
          { id: 4, targetName: "Usman Tariq", targetType: "contact", status: "success", at: iso(now - 6 * 864e5) },
          { id: 3, targetName: "SSIES Physics Group", targetType: "group", status: "success", at: iso(now - 7 * 864e5) },
          { id: 2, targetName: "Ali Khan", targetType: "contact", status: "success", at: iso(now - 8 * 864e5) },
          { id: 1, targetName: "SSIES Batch 2025 — Morning", targetType: "group", status: "success", at: iso(now - 9 * 864e5) },
        ],
        scheduledJob: { enabled: false, dow: 6, hour: 9, minute: 0, lastRunAt: null },
        audit: [
          { action: "login", detail: "", ip: "127.0.0.1", at: iso(now - 1 * 36e5) },
          { action: "release", detail: "1 group", ip: "127.0.0.1", at: iso(now - 7 * 864e5) },
          { action: "direct_whatsapp", detail: "Ali Khan", ip: "127.0.0.1", at: iso(now - 3 * 864e5) },
        ],
      },
      "u-2": { groups: [{ name: "SSIES Chemistry Elite", inviteLink: "", message: "", lastReleased: "", schedule: [{ day: "Sunday", from: "10:00am", to: "12:00pm" }] }], contacts: [], templates: [{ name: "Weekly schedule", content: DEFAULT_TEMPLATE_CONTENT, isDefault: true }], settings: { headless: false, delaySeconds: 5 }, history: [], scheduledJob: { enabled: false, dow: 0, hour: 9, minute: 0, lastRunAt: null }, audit: [] },
      "u-3": { groups: [], contacts: [], templates: [], settings: { headless: false, delaySeconds: 5 }, history: [], scheduledJob: { enabled: false, dow: 0, hour: 9, minute: 0, lastRunAt: null }, audit: [] },
    },
    session: { connected: false, provider: "waha", slot: 1 },
    system: {
      siteName: "SSIES Schedule Sender",
      defaultDelay: 5,
      maintenanceMode: false,
      waProvider: "waha",
      wahaBaseUrl: "http://waha:3000",
      wahaApiKey: "",
      wahaSessionName: "default",
      wahaSlots: 5,
      allowUserCreation: true,
      maxUsers: 0,
    },
    globalAudit: [
      { action: "login", detail: "superadmin@ssies.edu.pk", actorEmail: "superadmin@ssies.edu.pk", ip: "127.0.0.1", at: iso(now - 2 * 36e5) },
      { action: "user_create", detail: "sara@ssies.edu.pk", actorEmail: "admin@ssies.edu.pk", ip: "127.0.0.1", at: iso(now - 20 * 864e5) },
      { action: "settings_update", detail: "waProvider=waha", actorEmail: "superadmin@ssies.edu.pk", ip: "127.0.0.1", at: iso(now - 5 * 864e5) },
      { action: "release", detail: "3 targets", actorEmail: "teacher@ssies.edu.pk", ip: "127.0.0.1", at: iso(now - 7 * 864e5) },
    ],
    passwordRequests: [
      { id: "pr-seed1", userId: "u-2", userEmail: "sara@ssies.edu.pk", userRole: "user", newPassword: "newpass123", status: "pending", requestedAt: iso(now - 3 * 36e5) },
    ],
    notifications: [
      { id: "n-s1", scope: "role:admin", type: "password_request", text: "Sara Coach requested a password reset", at: iso(now - 3 * 36e5), read: false },
      { id: "n-s2", scope: "role:superadmin", type: "password_request", text: "Sara Coach requested a password reset", at: iso(now - 3 * 36e5), read: false },
      { id: "n-s3", scope: "role:superadmin", type: "info", text: "Weekly system backup completed successfully", at: iso(now - 8 * 36e5), read: false },
      { id: "n-s4", scope: "user:u-1", type: "release", text: "Your schedule was delivered to SSIES Batch 2025 — Morning", at: iso(now - 7 * 864e5), read: false },
      { id: "n-s5", scope: "user:u-1", type: "info", text: "3 groups are scheduled to send this weekend", at: iso(now - 1 * 864e5), read: true },
      { id: "n-s6", scope: "role:all", type: "info", text: "Welcome to SSIES Schedule Sender 👋", at: iso(now - 30 * 864e5), read: true },
    ],
    releasesToday: 2,
  };
}

/* ---------- Persistence ---------- */
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const s = seedStore();
  saveStore(s);
  return s;
}
function saveStore(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
}
let STORE = loadStore();
function persist() { saveStore(STORE); }
function resetStore() { localStorage.removeItem(STORE_KEY); STORE = loadStore(); }

/* ---------- Session / auth (mock) ---------- */
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
}
function setSession(sess) { localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

function login(email, password) {
  const u = STORE.users.find((x) => x.email.toLowerCase() === (email || "").toLowerCase());
  if (!u) return { error: "No account found for that email." };
  if (!u.isActive) return { error: "This account is disabled. Contact an administrator." };
  if (password && u.password && password !== u.password) return { error: "Incorrect password." };
  u.lastLoginAt = new Date().toISOString();
  persist();
  setSession({ id: u.id, email: u.email, role: u.role, displayName: u.displayName });
  const redirect = u.role === "superadmin" ? "superadmin-dashboard.html" : u.role === "admin" ? "admin-dashboard.html" : "dashboard.html";
  return { redirect };
}
/* Passkey (WebAuthn) sign-in — POC simulation.
   In production the authenticator asserts a credential bound to the account;
   here we accept a registered email (defaults to the teacher demo) and sign in
   without a password once the platform authenticator gesture succeeds. */
function loginWithPasskey(email) {
  email = (email || "teacher@ssies.edu.pk").trim().toLowerCase();
  const u = STORE.users.find((x) => x.email.toLowerCase() === email);
  if (!u) return { error: "No passkey is registered for that email on this device." };
  if (!u.isActive) return { error: "This account is disabled. Contact an administrator." };
  u.lastLoginAt = new Date().toISOString();
  persist();
  setSession({ id: u.id, email: u.email, role: u.role, displayName: u.displayName, viaPasskey: true });
  const redirect = u.role === "superadmin" ? "superadmin-dashboard.html" : u.role === "admin" ? "admin-dashboard.html" : "dashboard.html";
  return { redirect };
}
function requireSession(allowedRoles) {
  const s = getSession();
  if (!s) { location.href = "login.html"; return null; }
  if (allowedRoles && !allowedRoles.includes(s.role)) { location.href = "dashboard.html"; return null; }
  return s;
}
function currentUser() {
  const s = getSession();
  if (!s) return null;
  return STORE.users.find((u) => u.id === s.id) || null;
}

/* effective user id — superadmin can inspect a user via ?asUser= */
function effectiveUserId() {
  const s = getSession();
  if (!s) return null;
  const asUser = new URLSearchParams(location.search).get("asUser");
  if (asUser && (s.role === "superadmin" || s.role === "admin") && STORE.data[asUser]) return asUser;
  if (STORE.data[s.id]) return s.id;
  // ensure data bucket exists for admins/superadmins acting as themselves
  if (!STORE.data[s.id]) {
    STORE.data[s.id] = { groups: [], contacts: [], templates: [{ name: "Weekly schedule", content: DEFAULT_TEMPLATE_CONTENT, isDefault: true }], settings: { headless: false, delaySeconds: 5 }, history: [], scheduledJob: { enabled: false, dow: 0, hour: 9, minute: 0, lastRunAt: null }, audit: [] };
    persist();
  }
  return s.id;
}
function userData() {
  const id = effectiveUserId();
  return STORE.data[id];
}

/* ---------- Message generation logic (mirrors production) ---------- */
function fmtTime(e) {
  const f = (e.from || "").trim(), t = (e.to || "").trim();
  return f && t ? `${f} - ${t}` : f || (e.time || "").trim();
}
function normalize(g) {
  g.schedule = (g.schedule || []).map((e) => {
    if (e.from !== undefined || e.to !== undefined) return { day: e.day, from: e.from || "", to: e.to || "" };
    const t = (e.time || "").trim(), p = t.split(/\s*[-–]\s*|\s+to\s+/i);
    return p.length === 2 ? { day: e.day, from: p[0].trim(), to: p[1].trim() } : { day: e.day, from: t, to: "" };
  });
  return g;
}
function genMessage(s) {
  const v = (s || []).filter((e) => (e.from || "").trim());
  if (!v.length) return "";
  return ["*Note*", "Schedule for this week:", ...v.map((e) => `* ${e.day}: ${fmtTime(e)}`), "*Kindly Acknowledge*"].join("\n");
}
function messageFor(g) { return g.message && g.message.trim() ? g.message : genMessage(g.schedule); }
/* Parse a schedule time like "12:00pm", "5:00pm", "9am", "13:30" → minutes since midnight (or null) */
function parseTimeMin(s) {
  if (!s) return null;
  const m = String(s).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10); const min = m[2] ? parseInt(m[2], 10) : 0; const ap = m[3];
  if (h > 23 || min > 59) return null;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h * 60 + min;
}
function replaceTokens(t) {
  const d = new Date();
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  const wd = d.toLocaleDateString(undefined, { weekday: "long" });
  return (t || "").replace(/\{date\}/gi, date).replace(/\{weekday\}/gi, wd);
}

/* ---------- Audit helper ---------- */
function logAudit(action, detail) {
  const d = userData();
  if (d) { d.audit = d.audit || []; d.audit.unshift({ action, detail: detail || "", ip: "127.0.0.1", at: new Date().toISOString() }); }
  const s = getSession();
  STORE.globalAudit.unshift({ action, detail: detail || "", actorEmail: s ? s.email : "", ip: "127.0.0.1", at: new Date().toISOString() });
  persist();
}

/* ---------- Password reset request workflow ---------- */
function requestPasswordReset(newPassword) {
  const u = currentUser(); if (!u) return { error: "Not signed in" };
  if (u.role === "superadmin") { if (newPassword) { u.password = newPassword; persist(); logAudit("password_change", ""); } return { direct: true }; }
  STORE.passwordRequests = STORE.passwordRequests || [];
  STORE.passwordRequests = STORE.passwordRequests.filter((r) => !(r.userId === u.id && r.status === "pending"));
  STORE.passwordRequests.unshift({ id: "pr-" + Math.random().toString(36).slice(2, 8), userId: u.id, userEmail: u.email, userRole: u.role, newPassword: newPassword || "", status: "pending", requestedAt: new Date().toISOString() });
  addNotification("role:" + (u.role === "admin" ? "superadmin" : "admin"), "password_request", `${u.displayName || u.email} requested a password reset`);
  if (u.role === "user") addNotification("role:superadmin", "password_request", `${u.displayName || u.email} requested a password reset`);
  logAudit("password_request", ""); persist();
  return { ok: true };
}
function myPasswordRequest() { const u = currentUser(); if (!u) return null; return (STORE.passwordRequests || []).find((r) => r.userId === u.id && r.status === "pending") || null; }
function canApproveRequest(req, role) { if (req.userRole === "user") return role === "admin" || role === "superadmin"; if (req.userRole === "admin") return role === "superadmin"; return false; }
function pendingRequestsFor(role) { return (STORE.passwordRequests || []).filter((r) => r.status === "pending" && canApproveRequest(r, role)); }
function allRequestsFor(role) { return (STORE.passwordRequests || []).filter((r) => canApproveRequest(r, role) || (r.status !== "pending" && (role === "superadmin" || (role === "admin" && r.userRole === "user")))); }
function approvePasswordRequest(id) {
  const r = (STORE.passwordRequests || []).find((x) => x.id === id); if (!r || r.status !== "pending") return { error: "Not found" };
  const u = STORE.users.find((x) => x.id === r.userId); if (u && r.newPassword) u.password = r.newPassword;
  r.status = "approved"; r.resolvedAt = new Date().toISOString();
  addNotification("user:" + r.userId, "password_approved", "Your password reset was approved ✓");
  logAudit("password_reset_approved", r.userEmail); persist(); return { ok: true };
}
function rejectPasswordRequest(id) {
  const r = (STORE.passwordRequests || []).find((x) => x.id === id); if (!r || r.status !== "pending") return { error: "Not found" };
  r.status = "rejected"; r.resolvedAt = new Date().toISOString();
  addNotification("user:" + r.userId, "password_rejected", "Your password reset request was declined");
  logAudit("password_reset_rejected", r.userEmail); persist(); return { ok: true };
}

/* ---------- Notifications ---------- */
function addNotification(scope, type, text) {
  STORE.notifications = STORE.notifications || [];
  STORE.notifications.unshift({ id: "n-" + Math.random().toString(36).slice(2, 8), scope, type, text, at: new Date().toISOString(), read: false });
}
function notificationsFor() {
  const s = getSession(); if (!s) return [];
  return (STORE.notifications || []).filter((n) => n.scope === "role:all" || n.scope === "role:" + s.role || n.scope === "user:" + s.id);
}
function unreadCount() { return notificationsFor().filter((n) => !n.read).length; }
function markNotificationsRead() { notificationsFor().forEach((n) => (n.read = true)); persist(); }

/* ---------- Utility for pages ---------- */
function esc(s) { return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function escA(s) { return (s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso), s = (Date.now() - d) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return d.toLocaleDateString();
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : "—"; }

let _tt;
function toast(m, type = "ok") {
  let e = document.getElementById("toast");
  if (!e) { e = document.createElement("div"); e.id = "toast"; e.className = "toast"; document.body.appendChild(e); }
  e.textContent = m; e.className = `toast ${type === "err" || type === true ? "err" : type} show`;
  clearTimeout(_tt); _tt = setTimeout(() => e.classList.remove("show"), 3000);
}
