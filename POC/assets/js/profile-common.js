/* ============================================================
   Shared profile content — used by the three per-site profile
   pages (profile.html · admin-profile.html · superadmin-profile.html).
   The account shown is always the logged-in user; each page supplies
   its own site navigation via mountProfile(buildRail, roles).
   ============================================================ */
let u = null;
let PROF_REBUILD = function () {};

function logout() { clearSession(); location.href = "login.html"; }
function toggleRail() { document.getElementById("shell")?.classList.toggle("rail-open"); }
function fmtShort(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"; }

function mountProfile(buildRail, roles) {
  const s = requireSession(roles || ["user", "admin", "superadmin"]);
  if (!s) return;
  u = currentUser();
  PROF_REBUILD = function () { buildRail(); if (typeof reflowNavbar === "function") requestAnimationFrame(reflowNavbar); };
  PROF_REBUILD();
  renderProfile();
  applyTheme();
}

function renderProfile() {
  if (!u) return;
  const isSuper = u.role === "superadmin";
  const pend = typeof myPasswordRequest === "function" ? myPasswordRequest() : null;
  document.getElementById("profileContent").innerHTML = `
    <div class="profile-hero">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar${u.profilePic ? " has-img" : ""}">${avatarInner(u.displayName || u.email, u.profilePic)}</div>
        <button class="profile-avatar-edit" type="button" onclick="document.getElementById('profileImgInput').click()" title="Change photo"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
        <input type="file" id="profileImgInput" accept="image/*" hidden onchange="pickProfileImage(this)"/>
      </div>
      <div class="profile-hero-body">
        <h1>${esc(u.displayName || u.email)}</h1>
        <p class="profile-email">${esc(u.email)}</p>
        <div class="profile-badges">
          <span class="profile-role-badge">${esc(u.role)}</span>
          ${u.isActive ? '<span class="profile-status-badge">Active</span>' : '<span class="profile-status-badge off">Disabled</span>'}
        </div>
        <div class="profile-photo-actions">
          <button class="btn btn-soft btn-sm" onclick="document.getElementById('profileImgInput').click()">Upload photo</button>
          ${u.profilePic ? '<button class="btn btn-ghost btn-sm" onclick="removeProfileImage()">Remove</button>' : ""}
        </div>
      </div>
    </div>
    <div class="profile-meta-grid">
      <div class="profile-meta-card"><span class="k">Member since</span><span class="v">${fmtShort(u.createdAt)}</span></div>
      <div class="profile-meta-card"><span class="k">Last login</span><span class="v">${fmtShort(u.lastLoginAt)}</span></div>
      <div class="profile-meta-card"><span class="k">Account ID</span><span class="v" title="${esc(u.id)}">${esc(u.id)}</span></div>
    </div>
    <div class="profile-grid">
      <section class="profile-card">
        <div class="profile-card-head"><h3>Account</h3><p>Update how your name appears in the app.</p></div>
        <div class="profile-form">
          <div class="profile-field"><label>Email</label><input value="${escA(u.email)}" disabled class="is-readonly"/><span class="field-hint">Sign-in email cannot be changed here.</span></div>
          <div class="profile-field"><label>Display name</label><input id="displayName" value="${escA(u.displayName || "")}" placeholder="Your name" maxlength="120"/></div>
          <div class="profile-field"><label>Role</label><input value="${escA(u.role)}" disabled class="is-readonly"/></div>
        </div>
        <div class="profile-card-actions"><button class="btn btn-primary" id="saveProfileBtn" onclick="saveProfile()">Save changes</button></div>
      </section>
      <section class="profile-card">
        <div class="profile-card-head"><h3>Security</h3><p>${isSuper ? "Change your password directly." : "Submit a password reset request — an admin or superadmin reviews and approves it."}</p></div>
        ${pend ? `<div class="pending-banner">⏳ A password reset request is pending approval · ${relTime(pend.requestedAt)}</div>` : ""}
        <div class="profile-form">
          <div class="profile-field"><label>Current password</label><div class="profile-pw-row"><input id="curPw" type="password"/><button class="btn btn-ghost btn-sm" onclick="togglePw('curPw',this)">Show</button></div></div>
          <div class="profile-field"><label>New password</label><div class="profile-pw-row"><input id="newPw" type="password" minlength="8"/><button class="btn btn-ghost btn-sm" onclick="togglePw('newPw',this)">Show</button></div><span class="field-hint">Minimum 8 characters.</span></div>
          <div class="profile-field"><label>Confirm new password</label><div class="profile-pw-row"><input id="newPw2" type="password" minlength="8"/><button class="btn btn-ghost btn-sm" onclick="togglePw('newPw2',this)">Show</button></div></div>
        </div>
        <div class="profile-card-actions"><button class="btn btn-soft" id="savePwBtn" onclick="changePw()">${isSuper ? "Update password" : "Request password reset"}</button></div>
      </section>
    </div>`;
}
function saveProfile() {
  const name = document.getElementById("displayName").value.trim();
  u.displayName = name; const s = getSession(); if (s) { s.displayName = name; setSession(s); }
  persist(); PROF_REBUILD(); applyTheme(); toast("Profile saved");
}
function changePw() {
  const cur = document.getElementById("curPw").value, nw = document.getElementById("newPw").value, nw2 = document.getElementById("newPw2").value;
  if (nw.length < 8) { toast("Password must be at least 8 characters", true); return; }
  if (nw !== nw2) { toast("New passwords do not match", true); return; }
  if (u.password && cur && cur !== u.password) { toast("Current password is incorrect", true); return; }
  const res = requestPasswordReset(nw);
  document.getElementById("curPw").value = document.getElementById("newPw").value = document.getElementById("newPw2").value = "";
  if (res.direct) toast("Password updated");
  else { toast("Password reset requested — awaiting approval"); renderProfile(); if (typeof updateNotifBadge === "function") updateNotifBadge(); }
}
function togglePw(id, btn) { const el = document.getElementById(id); const show = el.type === "password"; el.type = show ? "text" : "password"; if (btn) btn.textContent = show ? "Hide" : "Show"; }
function pickProfileImage(input) {
  const f = input.files[0]; input.value = ""; if (!f) return;
  if (!f.type.startsWith("image/")) { toast("Please choose an image file", true); return; }
  if (f.size > 3 * 1024 * 1024) { toast("Image too large (max 3 MB)", true); return; }
  const r = new FileReader(); r.onload = () => { u.profilePic = r.result; persist(); renderProfile(); PROF_REBUILD(); applyTheme(); toast("Photo updated"); }; r.readAsDataURL(f);
}
function removeProfileImage() { u.profilePic = ""; persist(); renderProfile(); PROF_REBUILD(); applyTheme(); toast("Photo removed"); }
