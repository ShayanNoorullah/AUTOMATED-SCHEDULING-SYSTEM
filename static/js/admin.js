let editingId = null;

async function loadUsers() {
  const users = await api("/admin/api/users");
  const tbody = document.getElementById("userRows");
  if (!users.length) {
    tbody.innerHTML = "<tr><td colspan='5'>No users yet.</td></tr>";
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><a href="/admin/users/${u.id}">${esc(u.email)}</a></td>
      <td>${esc(u.displayName)}</td>
      <td>${u.groupCount}</td>
      <td>${u.isActive ? '<span class="status-on">Active</span>' : '<span class="status-off">Disabled</span>'}</td>
      <td>
        <button class="btn btn-sm btn-soft" onclick="toggleActive('${u.id}',${!u.isActive})">${u.isActive ? 'Disable' : 'Enable'}</button>
        <button class="btn btn-sm btn-soft" onclick="resetPw('${u.id}')">Reset PW</button>
      </td>
    </tr>`).join("");
}

function openCreate() {
  editingId = null;
  document.getElementById("modalTitle").textContent = "Create user";
  document.getElementById("mEmail").value = "";
  document.getElementById("mName").value = "";
  document.getElementById("mPw").value = "";
  document.getElementById("modal").classList.add("open");
}

function closeModal() {
  document.getElementById("modal").classList.remove("open");
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
