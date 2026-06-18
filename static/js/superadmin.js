async function loadAllUsers(role) {
  const url = role ? `/superadmin/api/users?role=${role}` : "/superadmin/api/users";
  return api(url);
}

async function loadAdmins() {
  return api("/superadmin/api/admins");
}

async function saveSettings(data) {
  await api("/superadmin/api/settings", { method: "PUT", body: JSON.stringify(data) });
  toast("Settings saved");
}

async function promoteRole(userId, role) {
  await api(`/superadmin/api/users/${userId}/role`, { method: "PUT", body: JSON.stringify({ role }) });
  toast("Role updated");
}

async function deleteUser(id) {
  if (!confirm("Delete this account permanently?")) return;
  await api(`/superadmin/api/users/${id}`, { method: "DELETE" });
  toast("User deleted");
}
