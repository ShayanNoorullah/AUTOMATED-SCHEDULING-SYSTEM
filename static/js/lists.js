/* Lists — WhatsApp Business label audiences (production) */
let lists = [], waLabels = [], listActive = null, listMode = localStorage.getItem("lists-mode") || "tabs", listSel = {};
let lmEditId = null, lmemListId = null;

function listById(id) { return lists.find((l) => l.id === id); }
function listMembers(list) {
  return (list.members || []).map((ph) => contacts.find((c) => String(c.phone) === String(ph))).filter(Boolean);
}
function listSelSet(id) { if (!listSel[id]) listSel[id] = {}; return listSel[id]; }
function listMsg(list) {
  return list.message && list.message.trim()
    ? list.message
    : "*Reminder*\nDear parent, please note the updated class schedule.\n*Kindly acknowledge.*";
}
function labelChip(l) { return `<span class="lbl-chip">${esc(l)}</span>`; }

async function loadLists() {
  try {
    const d = await (await fetch("/api/lists")).json();
    lists = d.lists || [];
    waLabels = d.waLabels || [];
    if (listActive == null && lists.length) listActive = lists[0].id;
    if (listActive && !listById(listActive)) listActive = lists.length ? lists[0].id : null;
  } catch (_) {
    lists = [];
    waLabels = [];
  }
}

function setListMode(m) { listMode = m; localStorage.setItem("lists-mode", m); renderLists(); }
function setListActive(id) { listActive = id; renderLists(); }
function toggleListSel(id, phone, checked) {
  const s = listSelSet(id);
  if (checked) s[phone] = true; else delete s[phone];
  updateListSelCount(id);
}
function listSelectAll(id, v) {
  const s = listSelSet(id);
  listMembers(listById(id)).forEach((c) => { if (v) s[c.phone] = true; else delete s[c.phone]; });
  renderLists();
}
function updateListSelCount(id) {
  const el = document.getElementById("lcount-" + id);
  if (!el) return;
  const n = Object.keys(listSelSet(id)).length;
  el.textContent = n ? `${n} selected` : "";
}

function renderLists() {
  const wrap = document.getElementById("listsWrap");
  if (!wrap) return;
  document.querySelectorAll("#listModeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === listMode));
  if (!lists.length) {
    wrap.innerHTML = `<div class="tbl-wrap"><div class="empty"><div class="empty-ico">🏷️</div><p>No lists yet. Create one and discover contacts from your WhatsApp labels.</p><button class="btn btn-primary btn-sm" onclick="newList()">+ New list</button></div></div>`;
    return;
  }
  if (listMode === "tabs") renderListTabs(wrap);
  else renderListStack(wrap, listMode);
}

function listHeaderActions(list) {
  return `<div class="list-actions">
    <button class="btn btn-ghost btn-sm" onclick="syncList('${list.id}')" title="Discover contacts from labels">Sync</button>
    <button class="btn btn-ghost btn-sm" onclick="openListMembers('${list.id}')">Manage</button>
    <button class="btn btn-ghost btn-sm" onclick="editList('${list.id}')">Edit</button>
    <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteList('${list.id}')">Delete</button>
    <button class="btn btn-soft btn-sm" onclick="sendList('${list.id}',true)">Send selected</button>
    <button class="btn btn-primary btn-sm" onclick="sendList('${list.id}',false)">Send to all</button>
  </div>`;
}
function memberRow(list, c) {
  const sel = !!listSelSet(list.id)[c.phone];
  const labels = (c.labels || []).map(labelChip).join("");
  const pic = typeof entityPic === "function" ? entityPic(c) : (c.photoUrl || c.pic || "");
  return `<tr>
    <td style="width:36px"><input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${escA(c.phone)}',this.checked)"/></td>
    <td><div class="grid-name"><div class="av small${pic ? " has-img" : ""}">${avatarInner(c.name, pic)}${c.waLinked ? '<span class="wa-badge"></span>' : ""}</div><b>${esc(c.name)}</b></div></td>
    <td>+${esc(c.phone)}</td>
    <td><div class="lbl-row">${labels || '<span class="hint" style="margin:0">—</span>'}</div></td>
    <td style="text-align:right"><button class="btn btn-soft btn-sm" onclick="sendListContact('${list.id}','${escA(c.phone)}')">Send</button></td>
  </tr>`;
}
function memberCard(list, c) {
  const sel = !!listSelSet(list.id)[c.phone];
  const pic = typeof entityPic === "function" ? entityPic(c) : (c.photoUrl || c.pic || "");
  return `<div class="lmember${sel ? " on" : ""}">
    <input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${escA(c.phone)}',this.checked)"/>
    <div class="av small${pic ? " has-img" : ""}">${avatarInner(c.name, pic)}</div>
    <div style="min-width:0;flex:1"><b>${esc(c.name)}</b><div class="hint" style="margin:0">+${esc(c.phone)}</div><div class="lbl-row">${(c.labels || []).map(labelChip).join("")}</div></div>
    <button class="btn btn-soft btn-sm" onclick="sendListContact('${list.id}','${escA(c.phone)}')">Send</button>
  </div>`;
}
function listMembersUI(list, layout) {
  const mem = listMembers(list);
  if (!mem.length) {
    return `<div class="empty" style="padding:30px"><p class="hint" style="margin:0 0 12px">No contacts in this list yet.</p><button class="btn btn-soft btn-sm" onclick="syncList('${list.id}')">Sync from labels</button> <button class="btn btn-soft btn-sm" onclick="openListMembers('${list.id}')">Add contacts</button></div>`;
  }
  if (layout === "board") return `<div class="lmember-grid">${mem.map((c) => memberCard(list, c)).join("")}</div>`;
  return `<div class="tbl-wrap"><table class="data grid-table"><thead><tr><th></th><th>Contact</th><th>Phone</th><th>Labels</th><th></th></tr></thead><tbody>${mem.map((c) => memberRow(list, c)).join("")}</tbody></table></div>`;
}
function listHeadHtml(list) {
  const mem = listMembers(list);
  return `<div class="list-panel-head" style="--list-accent:${list.color || "var(--accent)"}">
    <div class="list-title"><span class="list-dot" style="background:${list.color || "var(--accent)"}"></span><b>${esc(list.name)}</b><span class="chip">${mem.length} contact${mem.length === 1 ? "" : "s"}</span><span class="hint list-selcount" id="lcount-${list.id}" style="margin:0"></span></div>
    ${listHeaderActions(list)}
  </div>
  <div class="list-labelrow">${(list.labels || []).length ? ((list.labels.map(labelChip).join("")) + `<button class="btn btn-ghost btn-sm" onclick="listSelectAll('${list.id}',true)">Select all</button><button class="btn btn-ghost btn-sm" onclick="listSelectAll('${list.id}',false)">Clear</button>`) : '<span class="hint" style="margin:0">No labels linked — add labels on contacts, then Sync</span>'}</div>`;
}
function renderListTabs(wrap) {
  if (!listActive || !listById(listActive)) listActive = lists[0].id;
  const tabs = lists.map((l) => `<button type="button" class="pt-tabs-btn chip-btn${l.id === listActive ? " on" : ""}" onclick="setListActive('${l.id}')"><span class="list-dot" style="background:${l.color || "var(--accent)"}"></span>${esc(l.name)} <span class="pt-tab-n">${(l.members || []).length}</span></button>`).join("");
  const list = listById(listActive);
  wrap.innerHTML = `<div class="list-tabs">${tabs}</div><div class="list-panel">${listHeadHtml(list)}${listMembersUI(list, "table")}</div>`;
  updateListSelCount(list.id);
}
function renderListStack(wrap, layout) {
  wrap.innerHTML = lists.map((list) => `<div class="list-panel">${listHeadHtml(list)}${listMembersUI(list, layout)}</div>`).join("");
  lists.forEach((l) => updateListSelCount(l.id));
}

function newList() {
  lmEditId = null;
  document.getElementById("listModalTitle").textContent = "New list";
  document.getElementById("lmSaveBtn").textContent = "Create list";
  document.getElementById("lmName").value = "";
  document.getElementById("lmColor").value = "#0d9488";
  document.getElementById("lmMessage").value = "";
  renderLmLabels([]);
  document.getElementById("listModal").classList.add("show");
}
function editList(id) {
  const l = listById(id); if (!l) return;
  lmEditId = id;
  document.getElementById("listModalTitle").textContent = "Edit list";
  document.getElementById("lmSaveBtn").textContent = "Save";
  document.getElementById("lmName").value = l.name || "";
  document.getElementById("lmColor").value = l.color || "#0d9488";
  document.getElementById("lmMessage").value = l.message || "";
  renderLmLabels(l.labels || []);
  document.getElementById("listModal").classList.add("show");
}
function closeListModal() { document.getElementById("listModal").classList.remove("show"); }
function renderLmLabels(selected) {
  const box = document.getElementById("lmLabels");
  if (!box) return;
  const all = [...new Set([...(waLabels || []), ...selected])];
  if (!all.length) {
    box.innerHTML = `<p class="hint" style="margin:0">No labels yet. Add labels on contact detail pages, then they appear here for discovery.</p>`;
    return;
  }
  box.innerHTML = all.map((lab) => {
    const on = selected.includes(lab);
    return `<label class="wa-check-row" style="display:flex;gap:8px;align-items:center;padding:6px 0"><input type="checkbox" value="${escA(lab)}" ${on ? "checked" : ""}/> <span>${esc(lab)}</span></label>`;
  }).join("");
}
async function saveList() {
  const name = document.getElementById("lmName").value.trim();
  if (!name) { toast("List name required", "err"); return; }
  const color = document.getElementById("lmColor").value || "#0d9488";
  const message = document.getElementById("lmMessage").value;
  const labels = [...document.querySelectorAll("#lmLabels input:checked")].map((el) => el.value);
  const body = JSON.stringify({ name, color, labels, message });
  try {
    let res;
    if (lmEditId) res = await fetch(`/api/lists/${encodeURIComponent(lmEditId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body });
    else res = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Save failed");
    await loadLists();
    if (d.list && d.list.id) listActive = d.list.id;
    closeListModal();
    renderLists();
    toast(lmEditId ? "List updated ✓" : "List created ✓");
  } catch (e) {
    toast(e.message || "Save failed", "err");
  }
}
async function deleteList(id) {
  const l = listById(id);
  if (!confirm(`Delete the "${l ? l.name : "list"}" list? (Contacts are not deleted)`)) return;
  try {
    const res = await fetch(`/api/lists/${encodeURIComponent(id)}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Delete failed");
    await loadLists();
    renderLists();
    toast("List deleted");
  } catch (e) {
    toast(e.message || "Delete failed", "err");
  }
}
async function syncList(id) {
  try {
    const res = await fetch(`/api/lists/${encodeURIComponent(id)}/sync`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Sync failed");
    await loadLists();
    renderLists();
    toast("List synced from labels ✓");
  } catch (e) {
    toast(e.message || "Sync failed", "err");
  }
}
async function syncAllLists() {
  try {
    const res = await fetch("/api/lists/sync-all", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Sync failed");
    await loadLists();
    renderLists();
    toast("All lists synced from WhatsApp labels ✓");
  } catch (e) {
    toast(e.message || "Sync failed", "err");
  }
}

function openListMembers(id) {
  lmemListId = id;
  const l = listById(id);
  document.getElementById("lmemTitle").textContent = `Manage · ${l ? l.name : "list"}`;
  document.getElementById("lmemSearch").value = "";
  document.getElementById("listMembersModal").classList.add("show");
  renderListMembers();
}
function closeListMembers() { document.getElementById("listMembersModal").classList.remove("show"); lmemListId = null; }
function renderListMembers() {
  const box = document.getElementById("lmemList");
  if (!box || !lmemListId) return;
  const list = listById(lmemListId);
  const q = (document.getElementById("lmemSearch").value || "").toLowerCase();
  const members = new Set((list && list.members) || []);
  const rows = contacts.filter((c) => !q || (c.name || "").toLowerCase().includes(q) || String(c.phone).includes(q));
  if (!rows.length) { box.innerHTML = `<p class="hint">No contacts match.</p>`; return; }
  box.innerHTML = rows.map((c) => {
    const on = members.has(String(c.phone));
    const pic = typeof entityPic === "function" ? entityPic(c) : (c.photoUrl || c.pic || "");
    return `<label class="lmem-row${on ? " on" : ""}"><input type="checkbox" ${on ? "checked" : ""} onchange="toggleListMember('${escA(c.phone)}',this.checked)"/>
      <div class="av small${pic ? " has-img" : ""}">${avatarInner(c.name, pic)}</div>
      <div style="min-width:0;flex:1"><b>${esc(c.name)}</b><div class="hint" style="margin:0">+${esc(c.phone)}</div></div>
      <div class="lbl-row">${(c.labels || []).map(labelChip).join("")}</div></label>`;
  }).join("");
}
async function toggleListMember(phone, checked) {
  const list = listById(lmemListId); if (!list) return;
  const set = new Set(list.members || []);
  if (checked) set.add(String(phone)); else set.delete(String(phone));
  list.members = [...set];
  try {
    await fetch(`/api/lists/${encodeURIComponent(list.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ members: list.members }),
    });
    renderListMembers();
    renderLists();
  } catch (_) {
    toast("Could not update members", "err");
  }
}

function sendListTargets(list, phones) {
  const msg = typeof replaceTokens === "function" ? replaceTokens(listMsg(list)) : listMsg(list);
  return phones.map((ph) => {
    const c = contacts.find((x) => String(x.phone) === String(ph));
    return {
      name: c ? c.name : ph,
      phone: String(ph),
      message: (c && c.message && c.message.trim()) ? (typeof replaceTokens === "function" ? replaceTokens(c.message) : c.message) : msg,
    };
  }).filter((t) => t.phone);
}
function sendList(id, selectedOnly) {
  const list = listById(id); if (!list) return;
  let phones = list.members || [];
  if (selectedOnly) {
    const sel = listSelSet(id);
    phones = phones.filter((ph) => sel[ph]);
    if (!phones.length) { toast("Select at least one contact", "err"); return; }
  }
  if (!phones.length) { toast("List has no contacts", "err"); return; }
  const targets = sendListTargets(list, phones);
  if (typeof doRelease === "function") doRelease(targets, "relAllSpin", "relAllBtn", "relAllTxt", "Send list");
  else toast("Send unavailable", "err");
}
function sendListContact(id, phone) {
  const list = listById(id); if (!list) return;
  const targets = sendListTargets(list, [phone]);
  if (typeof doRelease === "function") doRelease(targets, "relAllSpin", "relAllBtn", "relAllTxt", "Send");
}
