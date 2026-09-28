let editingId = null;
let _usersCache = [];
let _userPage = 1;
let _userQ = "";
let _userStatus = "";
const USER_PER_PAGE = 8;

function filteredUsers() {
  let rows = _usersCache.slice();
  if (_userStatus === "active") rows = rows.filter((u) => u.isActive);
  else if (_userStatus === "disabled") rows = rows.filter((u) => !u.isActive);
  const q = (_userQ || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (u) =>
        String(u.email || "").toLowerCase().includes(q) ||
        String(u.displayName || "").toLowerCase().includes(q)
    );
  }
  return rows;
}

function pageWindow(cur, pages) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || (p >= cur - 1 && p <= cur + 1)) out.push(p);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}

function renderUserTable() {
  const tbody = document.getElementById("userRows");
  const pager = document.getElementById("userPager");
  if (!tbody) return;

  const rows = filteredUsers();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / USER_PER_PAGE) || 1);
  if (_userPage > pages) _userPage = pages;
  const start = (_userPage - 1) * USER_PER_PAGE;
  const pageRows = rows.slice(start, start + USER_PER_PAGE);

  if (!pageRows.length) {
    const empty =
      total === 0 && !_userQ && !_userStatus
        ? "No users yet."
        : "No matches for your search/filters";
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">${empty}</td></tr>`;
  } else {
    tbody.innerHTML = pageRows
      .map(
        (u) => `
    <tr>
      <td><a href="/admin/users/${u.id}">${esc(u.email)}</a></td>
      <td>${esc(u.displayName)}</td>
      <td>${u.groupCount ?? 0}</td>
      <td>${u.isActive ? '<span class="status-on">Active</span>' : '<span class="status-off">Disabled</span>'}</td>
      <td class="td-actions">
        <button class="btn btn-sm btn-soft" onclick="toggleActive('${u.id}',${!u.isActive})">${u.isActive ? "Disable" : "Enable"}</button>
        <button class="btn btn-sm btn-soft" onclick="resetPw('${u.id}')">Reset PW</button>
      </td>
    </tr>`
      )
      .join("");
  }

  if (!pager) return;
  if (pages > 1) {
    let btns = `<button class="pager-btn" ${_userPage === 1 ? "disabled" : ""} onclick="gotoUserPage(${_userPage - 1})">‹</button>`;
    pageWindow(_userPage, pages).forEach((p) => {
      btns +=
        p === "…"
          ? `<span class="pager-gap">…</span>`
          : `<button class="pager-btn${p === _userPage ? " on" : ""}" onclick="gotoUserPage(${p})">${p}</button>`;
    });
    btns += `<button class="pager-btn" ${_userPage === pages ? "disabled" : ""} onclick="gotoUserPage(${_userPage + 1})">›</button>`;
    pager.innerHTML = `<span class="pager-info">Showing ${start + 1}–${Math.min(start + USER_PER_PAGE, total)} of ${total}</span><div class="pager-btns">${btns}</div>`;
  } else if (total) {
    pager.innerHTML = `<span class="pager-info">${total} user${total === 1 ? "" : "s"}</span>`;
  } else {
    pager.innerHTML = "";
  }
}

function onUserSearch(v) {
  _userQ = v;
  _userPage = 1;
  renderUserTable();
}
function onUserStatus(v) {
  _userStatus = v;
  _userPage = 1;
  renderUserTable();
}
function gotoUserPage(p) {
  _userPage = p;
  renderUserTable();
}

async function loadUsers() {
  _usersCache = await api("/admin/api/users");
  const total = _usersCache.length;
  const active = _usersCache.filter((u) => u.isActive).length;
  const st = document.getElementById("statTotal");
  const sa = document.getElementById("statActive");
  const sd = document.getElementById("statDisabled");
  if (st) st.textContent = total;
  if (sa) sa.textContent = active;
  if (sd) sd.textContent = total - active;
  renderUserTable();
}

function openCreate() {
  editingId = null;
  document.getElementById("modalTitle").textContent = "Create user";
  document.getElementById("mEmail").value = "";
  document.getElementById("mName").value = "";
  document.getElementById("mPw").value = "";
  document.getElementById("modal").classList.add("show");
}

function closeModal() {
  document.getElementById("modal").classList.remove("show");
}

async function saveUser() {
  const body = {
    email: document.getElementById("mEmail").value.trim(),
    displayName: document.getElementById("mName").value.trim(),
    password: document.getElementById("mPw").value,
  };
  try {
    await api("/admin/api/users", { method: "POST", body: JSON.stringify(body) });
    closeModal();
    toast("User created");
    loadUsers();
  } catch (e) {
    toast(e.message, true);
  }
}

async function toggleActive(id, active) {
  await api("/admin/api/users/" + id, { method: "PUT", body: JSON.stringify({ isActive: active }) });
  toast(active ? "User enabled" : "User disabled");
  loadUsers();
}

async function resetPw(id) {
  await api("/admin/api/users/" + id + "/reset-password", { method: "POST", body: "{}" });
  toast("Password reset email sent");
}
