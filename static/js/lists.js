/* Lists — WhatsApp Business label audiences */
let lists = [], waLabels = [], listActive = null, listMode = localStorage.getItem("lists-mode") || "tabs", listSel = {};
let lmEditId = null, lmemListId = null;

function listById(id) { return lists.find((l) => l.id === id); }
function phoneKey(p) { return String(p || "").replace(/\D/g, ""); }
function listContactCount(list) { return (list.members || []).length; }
function listGroupCount(list) { return (list.groups || []).length; }
function listTotalCount(list) { return listContactCount(list) + listGroupCount(list); }

function listMembers(list) {
  const srv = list.memberNames || {};
  return (list.members || []).map((ph) => {
    const key = phoneKey(ph);
    const srvName = srv[key];
    const c = (typeof contacts !== "undefined" ? contacts : []).find((x) => phoneKey(x.phone) === key);
    if (c) {
      // Prefer the WhatsApp-resolved name when the saved contact is still just a phone.
      if (srvName && (!c.name || c.name === c.phone)) return { ...c, name: srvName };
      return c;
    }
    return { name: srvName || key || String(ph), phone: key || String(ph), labels: [], waLinked: !!srvName, orphan: !srvName };
  });
}
function listGroupsOf(list) {
  return (list.groups || []).filter((g) => g && (g.id || g.name));
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
function toggleListSel(id, key, checked) {
  const s = listSelSet(id);
  if (checked) s[key] = true; else delete s[key];
  updateListSelCount(id);
}
function listSelectAll(id, v) {
  const s = listSelSet(id);
  const list = listById(id);
  listMembers(list).forEach((c) => { if (v) s["c:" + c.phone] = true; else delete s["c:" + c.phone]; });
  listGroupsOf(list).forEach((g) => {
    const k = "g:" + (g.id || g.name);
    if (v) s[k] = true; else delete s[k];
  });
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
    wrap.innerHTML = `<div class="tbl-wrap"><div class="empty">
      <div class="empty-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h10M4 17h14"/><circle cx="18" cy="17" r="3"/></svg></div>
      <p>No lists yet. Sync WhatsApp Business labels or create one.</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="syncAllLists()">Sync from WhatsApp</button>
        <button class="btn btn-soft btn-sm" onclick="newList()">+ New list</button>
      </div>
    </div></div>`;
    return;
  }
  if (listMode === "tabs") renderListTabs(wrap);
  else if (listMode === "board") renderListBoard(wrap);
  else renderListTable(wrap);
}

function listToolbar(list) {
  const n = listTotalCount(list);
  return `<div class="lists-detail-bar">
    <div class="lists-detail-meta">
      <span class="list-dot" style="background:${list.color || "var(--accent)"}"></span>
      <b>${esc(list.name)}</b>
      <span class="chip">${listContactCount(list)} contact${listContactCount(list) === 1 ? "" : "s"}</span>
      ${listGroupCount(list) ? `<span class="chip chip-soft">${listGroupCount(list)} group${listGroupCount(list) === 1 ? "" : "s"}</span>` : ""}
      <span class="hint list-selcount" id="lcount-${list.id}" style="margin:0"></span>
    </div>
    <div class="lists-detail-actions">
      <button class="btn btn-ghost btn-sm" type="button" onclick="listSelectAll('${list.id}',true)" ${n ? "" : "disabled"}>Select all</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="listSelectAll('${list.id}',false)">Clear</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="syncList('${list.id}')">Sync</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="openListMembers('${list.id}')">Manage</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="editList('${list.id}')">Edit</button>
      <button class="btn btn-ghost btn-sm" type="button" style="color:var(--error)" onclick="deleteList('${list.id}')">Delete</button>
      <button class="btn btn-soft btn-sm" type="button" onclick="sendList('${list.id}',true)">Send selected</button>
      <button class="btn btn-primary btn-sm" type="button" onclick="sendList('${list.id}',false)">Send all</button>
    </div>
  </div>
  <div class="lists-labelrow">${(list.labels || []).length
    ? list.labels.map(labelChip).join("")
    : '<span class="hint" style="margin:0">No labels linked — edit the list or sync from WhatsApp</span>'}</div>`;
}

function memberRow(list, c) {
  const key = "c:" + c.phone;
  const sel = !!listSelSet(list.id)[key];
  const labels = (c.labels || []).map(labelChip).join("");
  const pic = typeof entityPic === "function" ? entityPic(c) : (c.photoUrl || c.pic || "");
  const display = (c.name && c.name !== c.phone) ? c.name : (c.name || c.phone);
  return `<tr>
    <td class="lists-check"><input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${escA(key)}',this.checked)"/></td>
    <td><div class="grid-name"><div class="av small${pic ? " has-img" : ""}">${avatarInner(display, pic)}${c.waLinked ? '<span class="wa-badge"></span>' : ""}</div><b>${esc(display)}</b></div></td>
    <td class="lists-type"><span class="lists-type-tag">Contact</span></td>
    <td>+${esc(c.phone)}</td>
    <td><div class="lbl-row">${labels || '<span class="hint" style="margin:0">—</span>'}</div></td>
    <td class="grid-go"><button class="btn btn-soft btn-sm" type="button" onclick="event.stopPropagation();sendListContact('${list.id}','${escA(c.phone)}')">Send</button></td>
  </tr>`;
}
function groupRow(list, g) {
  const key = "g:" + (g.id || g.name);
  const sel = !!listSelSet(list.id)[key];
  const gname = g.name || g.id || "Group";
  return `<tr>
    <td class="lists-check"><input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${escA(key)}',this.checked)"/></td>
    <td><div class="grid-name"><div class="av small lists-av-group">${avatarInner(gname, "")}</div><b>${esc(gname)}</b></div></td>
    <td class="lists-type"><span class="lists-type-tag is-group">Group</span></td>
    <td><span class="hint" style="margin:0">${esc((g.id || "").replace(/@g\.us$/, "") || "—")}</span></td>
    <td><span class="hint" style="margin:0">—</span></td>
    <td class="grid-go"><button class="btn btn-soft btn-sm" type="button" onclick="event.stopPropagation();sendListGroup('${list.id}','${escA(g.id || "")}','${escA(gname)}')">Send</button></td>
  </tr>`;
}
function memberCard(list, c) {
  const key = "c:" + c.phone;
  const sel = !!listSelSet(list.id)[key];
  const pic = typeof entityPic === "function" ? entityPic(c) : (c.photoUrl || c.pic || "");
  const display = (c.name && c.name !== c.phone) ? c.name : (c.name || c.phone);
  return `<div class="lmember${sel ? " on" : ""}">
    <input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${escA(key)}',this.checked)"/>
    <div class="av small${pic ? " has-img" : ""}">${avatarInner(display, pic)}</div>
    <div class="lmember-body"><b>${esc(display)}</b><div class="hint" style="margin:0">+${esc(c.phone)}</div></div>
    <button class="btn btn-soft btn-sm" type="button" onclick="sendListContact('${list.id}','${escA(c.phone)}')">Send</button>
  </div>`;
}
function groupCard(list, g) {
  const key = "g:" + (g.id || g.name);
  const sel = !!listSelSet(list.id)[key];
  const gname = g.name || g.id || "Group";
  return `<div class="lmember${sel ? " on" : ""}">
    <input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${escA(key)}',this.checked)"/>
    <div class="av small lists-av-group">${avatarInner(gname, "")}</div>
    <div class="lmember-body"><b>${esc(gname)}</b><div class="hint" style="margin:0">WhatsApp group</div></div>
    <button class="btn btn-soft btn-sm" type="button" onclick="sendListGroup('${list.id}','${escA(g.id || "")}','${escA(gname)}')">Send</button>
  </div>`;
}

function listMembersTable(list) {
  const mem = listMembers(list);
  const grps = listGroupsOf(list);
  if (!mem.length && !grps.length) {
    return `<div class="empty" style="padding:36px"><p class="hint" style="margin:0 0 12px">No contacts or groups in this list yet.</p>
      <button class="btn btn-soft btn-sm" onclick="syncList('${list.id}')">Sync from labels</button>
      <button class="btn btn-soft btn-sm" onclick="openListMembers('${list.id}')">Add contacts</button></div>`;
  }
  return `<div class="tbl-wrap lists-member-tbl"><table class="data grid-table"><thead><tr>
    <th class="lists-check"></th><th>Name</th><th>Type</th><th>Phone / ID</th><th>Labels</th><th></th>
  </tr></thead><tbody>
    ${mem.map((c) => memberRow(list, c)).join("")}
    ${grps.map((g) => groupRow(list, g)).join("")}
  </tbody></table></div>`;
}
function listMembersBoard(list) {
  const mem = listMembers(list);
  const grps = listGroupsOf(list);
  if (!mem.length && !grps.length) {
    return `<div class="empty" style="padding:28px"><p class="hint" style="margin:0 0 12px">Empty list</p>
      <button class="btn btn-soft btn-sm" onclick="syncList('${list.id}')">Sync</button></div>`;
  }
  return `<div class="lmember-grid">${mem.map((c) => memberCard(list, c)).join("")}${grps.map((g) => groupCard(list, g)).join("")}</div>`;
}

function renderListTabs(wrap) {
  if (!listActive || !listById(listActive)) listActive = lists[0].id;
  const tabs = lists.map((l) => {
    const n = listTotalCount(l);
    return `<button type="button" class="${l.id === listActive ? "on" : ""}" onclick="setListActive('${l.id}')">
      <span class="list-dot" style="background:${l.color || "var(--accent)"}"></span>${esc(l.name)}
      <span class="pt-tab-n">${n}</span>
    </button>`;
  }).join("");
  const list = listById(listActive);
  wrap.innerHTML = `<div class="lists-shell">
    <div class="pt-tabs lists-pt-tabs">${tabs}</div>
    <div class="lists-detail">${listToolbar(list)}${listMembersTable(list)}</div>
  </div>`;
  updateListSelCount(list.id);
}

function renderListTable(wrap) {
  wrap.innerHTML = `<div class="tbl-wrap"><table class="data grid-table lists-overview"><thead><tr>
    <th>List</th><th>Labels</th><th>Contacts</th><th>Groups</th><th></th>
  </tr></thead><tbody>${lists.map((l) => {
    const labs = (l.labels || []).map(labelChip).join("") || '<span class="hint" style="margin:0">—</span>';
    return `<tr onclick="setListMode('tabs');setListActive('${l.id}')">
      <td><div class="grid-name"><span class="list-dot" style="background:${l.color || "var(--accent)"}"></span><b>${esc(l.name)}</b></div></td>
      <td><div class="lbl-row">${labs}</div></td>
      <td>${listContactCount(l)}</td>
      <td>${listGroupCount(l)}</td>
      <td class="grid-go" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" type="button" onclick="syncList('${l.id}')">Sync</button>
        <button class="btn btn-ghost btn-sm" type="button" onclick="editList('${l.id}')">Edit</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="sendList('${l.id}',false)">Send</button>
      </td>
    </tr>`;
  }).join("")}</tbody></table></div>`;
}

function renderListBoard(wrap) {
  wrap.innerHTML = `<div class="card-grid lists-board">${lists.map((l) => {
    const labs = (l.labels || []).slice(0, 3).map(labelChip).join("");
    const extra = (l.labels || []).length > 3 ? `<span class="hint" style="margin:0">+${(l.labels || []).length - 3}</span>` : "";
    const preview = [
      ...listMembers(l).slice(0, 4).map((c) => (c.name && c.name !== c.phone) ? c.name : ("+" + c.phone)),
      ...listGroupsOf(l).slice(0, 2).map((g) => g.name || "Group"),
    ].slice(0, 4);
    return `<article class="ecard lists-ecard" tabindex="0" onclick="setListMode('tabs');setListActive('${l.id}')" onkeydown="if(event.key==='Enter'){setListMode('tabs');setListActive('${l.id}')}">
      <div class="ecard-top">
        <span class="list-dot lg" style="background:${l.color || "var(--accent)"}"></span>
        <div class="ecard-id"><b>${esc(l.name)}</b><span>${listContactCount(l)} contacts · ${listGroupCount(l)} groups</span></div>
        <span class="ecard-go">›</span>
      </div>
      <div class="ecard-days">${labs || '<span class="ec-none">No labels</span>'}${extra}</div>
      <div class="lists-preview">${preview.length ? preview.map((p) => `<span>${esc(p)}</span>`).join("") : '<span class="ec-none">Empty</span>'}</div>
      <div class="ecard-foot" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" type="button" onclick="syncList('${l.id}')">Sync</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="sendList('${l.id}',false)">Send all</button>
      </div>
    </article>`;
  }).join("")}</div>`;
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
    box.innerHTML = `<p class="hint" style="margin:0">No labels yet. Sync from WhatsApp Business labels, or add labels on contacts.</p>`;
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
    toast("Syncing from WhatsApp…");
    const res = await fetch(`/api/lists/${encodeURIComponent(id)}/sync`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Sync failed");
    if (typeof loadContacts === "function") await loadContacts();
    await loadLists();
    if (d.waLabels) waLabels = d.waLabels;
    renderLists();
    const src = d.source === "whatsapp" ? "WhatsApp" : "saved contacts";
    toast(`List synced from ${src} ✓`);
  } catch (e) {
    toast(e.message || "Sync failed", "err");
  }
}
async function syncAllLists() {
  try {
    toast("Syncing lists from WhatsApp…");
    const res = await fetch("/api/lists/sync-all", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Sync failed");
    if (typeof loadContacts === "function") await loadContacts();
    await loadLists();
    if (Array.isArray(d.waLabels)) waLabels = d.waLabels;
    if (Array.isArray(d.lists)) {
      lists = d.lists;
      if (lists.length && (!listActive || !listById(listActive))) listActive = lists[0].id;
    }
    renderLists();
    const n = (lists || []).length;
    const labelN = (d.labelCount != null) ? d.labelCount : ((d.waLabels || []).length);
    const src = d.source === "whatsapp" ? "WhatsApp" : "saved contacts";
    if (n) {
      toast(`Synced ${n} list${n === 1 ? "" : "s"} from ${src} ✓`);
    } else if (d.source === "whatsapp" && !labelN) {
      toast("WhatsApp is linked but returned no Business labels. Use Business tools → Labels, then re-link WhatsApp and sync again.", "err");
    } else {
      toast(d.warning ? `No lists yet (${d.warning})` : "No lists yet — create one or sync after linking WhatsApp", "err");
    }
  } catch (e) {
    toast(e.message || "Sync failed — link WhatsApp in Automated Send first", "err");
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
  const members = new Set((list && list.members || []).map(phoneKey));
  const rows = (typeof contacts !== "undefined" ? contacts : []).filter((c) =>
    !q || (c.name || "").toLowerCase().includes(q) || String(c.phone).includes(q)
  );
  if (!rows.length) { box.innerHTML = `<p class="hint">No contacts match.</p>`; return; }
  box.innerHTML = rows.map((c) => {
    const on = members.has(phoneKey(c.phone));
    const pic = typeof entityPic === "function" ? entityPic(c) : (c.photoUrl || c.pic || "");
    return `<label class="lmem-row${on ? " on" : ""}"><input type="checkbox" ${on ? "checked" : ""} onchange="toggleListMember('${escA(c.phone)}',this.checked)"/>
      <div class="av small${pic ? " has-img" : ""}">${avatarInner(c.name, pic)}</div>
      <div style="min-width:0;flex:1"><b>${esc(c.name)}</b><div class="hint" style="margin:0">+${esc(c.phone)}</div></div>
      <div class="lbl-row">${(c.labels || []).map(labelChip).join("")}</div></label>`;
  }).join("");
}
async function toggleListMember(phone, checked) {
  const list = listById(lmemListId); if (!list) return;
  const set = new Set((list.members || []).map(phoneKey));
  const key = phoneKey(phone);
  if (checked) set.add(key); else set.delete(key);
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
  const srv = list.memberNames || {};
  return phones.map((ph) => {
    const c = (typeof contacts !== "undefined" ? contacts : []).find((x) => phoneKey(x.phone) === phoneKey(ph));
    const nm = (c && c.name && c.name !== c.phone) ? c.name : (srv[phoneKey(ph)] || (c ? c.name : ph));
    return {
      name: nm,
      phone: String(ph),
      message: (c && c.message && c.message.trim())
        ? (typeof replaceTokens === "function" ? replaceTokens(c.message) : c.message)
        : msg,
    };
  }).filter((t) => t.phone);
}
function sendListGroupTargets(list, groups) {
  const msg = typeof replaceTokens === "function" ? replaceTokens(listMsg(list)) : listMsg(list);
  return groups.map((g) => ({
    name: g.name || g.id,
    message: msg,
  })).filter((t) => t.name);
}
function sendList(id, selectedOnly) {
  const list = listById(id); if (!list) return;
  let phones = list.members || [];
  let grps = listGroupsOf(list);
  if (selectedOnly) {
    const sel = listSelSet(id);
    phones = phones.filter((ph) => sel["c:" + phoneKey(ph)] || sel["c:" + ph]);
    grps = grps.filter((g) => sel["g:" + (g.id || g.name)]);
    if (!phones.length && !grps.length) { toast("Select at least one contact or group", "err"); return; }
  }
  if (!phones.length && !grps.length) { toast("List has no contacts or groups", "err"); return; }
  const targets = [...sendListTargets(list, phones), ...sendListGroupTargets(list, grps)];
  if (typeof doRelease === "function") doRelease(targets, "relAllSpin", "relAllBtn", "relAllTxt", "Send list");
  else toast("Send unavailable", "err");
}
function sendListContact(id, phone) {
  const list = listById(id); if (!list) return;
  const targets = sendListTargets(list, [phone]);
  if (typeof doRelease === "function") doRelease(targets, "relAllSpin", "relAllBtn", "relAllTxt", "Send");
}
function sendListGroup(id, gid, gname) {
  const list = listById(id); if (!list) return;
  const g = listGroupsOf(list).find((x) => String(x.id) === String(gid) || String(x.name) === String(gname)) || { id: gid, name: gname };
  const targets = sendListGroupTargets(list, [g]);
  if (typeof doRelease === "function") doRelease(targets, "relAllSpin", "relAllBtn", "relAllTxt", "Send");
}
