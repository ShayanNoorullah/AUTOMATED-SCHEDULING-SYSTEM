/* Lists — WhatsApp Business label audiences (redesigned workspace) */
let lists = [], waLabels = [], listActive = null, listSel = {};
let listMode = (function () {
  const m = localStorage.getItem("lists-mode") || "workspace";
  return m === "tabs" ? "workspace" : (m === "board" ? "grid" : m); // migrate old values
})();
let lmEditId = null, lmemListId = null;
let listSearchQ = {};      // per-list member search
let listTypeF = "all";     // detail sub-filter: all | contacts | groups
let listSideQ = "";        // sidebar list search
let lmLabelsSel = new Set(), lmLabelPool = [];
let msgEditId = null;      // list id whose message is being edited inline

const LIST_COLORS = ["#0d9488", "#6366f1", "#f59e0b", "#ef4444", "#10b981", "#0ea5e9", "#ec4899", "#8b5cf6", "#64748b"];
const LI_ICO = {
  sync: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  manage: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  search: '<svg class="search-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  group: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

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
      if (srvName && (!c.name || c.name === c.phone)) return { ...c, name: srvName };
      return c;
    }
    return { name: srvName || key || String(ph), phone: key || String(ph), labels: [], waLinked: !!srvName, orphan: !srvName };
  });
}
function listGroupsOf(list) { return (list.groups || []).filter((g) => g && (g.id || g.name)); }
function listSelSet(id) { if (!listSel[id]) listSel[id] = {}; return listSel[id]; }
function listMsg(list) {
  return list.message && list.message.trim()
    ? list.message
    : "*Reminder*\nDear parent, please note the updated class schedule.\n*Kindly acknowledge.*";
}
function labelChip(l) { return `<span class="lbl-chip">${esc(l)}</span>`; }
function initials(s) { const n = String(s || "?").trim(); return n ? n[0].toUpperCase() : "?"; }

async function loadLists() {
  try {
    const d = await (await fetch("/api/lists")).json();
    lists = d.lists || [];
    waLabels = d.waLabels || [];
    if (listActive == null && lists.length) listActive = lists[0].id;
    if (listActive && !listById(listActive)) listActive = lists.length ? lists[0].id : null;
  } catch (_) { lists = []; waLabels = []; }
}

function setListMode(m) { listMode = m; localStorage.setItem("lists-mode", m); renderLists(); }
function setListActive(id) {
  listActive = id;
  msgEditId = null;
  if (listMode === "workspace" && document.getElementById("listDetail")) {
    document.querySelectorAll(".lists-side-item").forEach((el) => el.classList.toggle("on", el.dataset.id === id));
    document.getElementById("listDetail").innerHTML = renderListDetail(listById(id));
    const active = document.querySelector(".lists-side-item.on");
    if (active) active.scrollIntoView({ block: "nearest" });
    updateListSelCount(id);
  } else { renderLists(); }
}
function toggleListSel(id, key, checked) {
  const s = listSelSet(id);
  if (checked) s[key] = true; else delete s[key];
  updateListSelCount(id);
  const item = document.querySelector(`.lists-side-item[data-id="${id}"]`);
}
function listSelectAll(id, v) {
  const s = listSelSet(id);
  const list = listById(id);
  listMembers(list).forEach((c) => { if (v) s["c:" + c.phone] = true; else delete s["c:" + c.phone]; });
  listGroupsOf(list).forEach((g) => { const k = "g:" + (g.id || g.name); if (v) s[k] = true; else delete s[k]; });
  const box = document.getElementById("lmembers-" + id);
  if (box) box.innerHTML = listMembersView(listById(id));
  updateListSelCount(id);
}
function updateListSelCount(id) {
  const el = document.getElementById("lcount-" + id);
  if (!el) return;
  const n = Object.keys(listSelSet(id)).length;
  el.textContent = n ? `${n} selected` : "";
  el.classList.toggle("on", !!n);
}

/* ══════════════ top-level render ══════════════ */
function renderLists() {
  const wrap = document.getElementById("listsWrap");
  if (!wrap) return;
  document.querySelectorAll("#listModeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.val === listMode));
  if (!lists.length) {
    wrap.innerHTML = `<div class="lists-empty-hero">
      <div class="empty-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h10M4 17h14"/><circle cx="18" cy="17" r="3"/></svg></div>
      <h3>No lists yet</h3>
      <p>Pull your WhatsApp Business labels in as ready-to-send audiences, or build a list by hand.</p>
      <div class="lists-empty-actions">
        <button class="btn btn-primary" onclick="syncAllLists()">${LI_ICO.sync}<span>Sync from WhatsApp</span></button>
        <button class="btn btn-soft" onclick="newList()">${LI_ICO.plus}<span>New list</span></button>
      </div>
    </div>`;
    return;
  }
  if (!listActive || !listById(listActive)) listActive = lists[0].id;
  if (listMode === "grid") renderListGrid(wrap);
  else if (listMode === "table") renderListTable(wrap);
  else renderListWorkspace(wrap);
}

/* ══════════════ workspace (master–detail) ══════════════ */
function sideItem(l) {
  const on = l.id === listActive;
  const c = listContactCount(l), g = listGroupCount(l);
  const avs = listMembers(l).slice(0, 3).map((m) => `<span class="av xs">${avatarInner((m.name && m.name !== m.phone) ? m.name : m.phone, "")}</span>`).join("");
  return `<button type="button" class="lists-side-item${on ? " on" : ""}" data-id="${l.id}" data-name="${escA((l.name || "").toLowerCase())}" onclick="setListActive('${l.id}')">
    <span class="lists-side-bar" style="background:${l.color || "var(--accent)"}"></span>
    <span class="lists-side-body">
      <span class="lists-side-name">${esc(l.name)}</span>
      <span class="lists-side-meta">${c} contact${c === 1 ? "" : "s"}${g ? ` · ${g} group${g === 1 ? "" : "s"}` : ""}</span>
    </span>
    <span class="lists-side-avs">${avs}</span>
  </button>`;
}
function renderListSidebar() {
  const q = listSideQ.trim().toLowerCase();
  const items = lists.filter((l) => !q || (l.name || "").toLowerCase().includes(q));
  const body = items.length ? items.map(sideItem).join("") : `<p class="hint" style="padding:14px;text-align:center">No lists match.</p>`;
  return `<div class="lists-side-scroll" id="listSideScroll">${body}</div>`;
}
function renderListWorkspace(wrap) {
  wrap.innerHTML = `<div class="lists-workspace">
    <aside class="lists-side">
      <div class="lists-side-head">
        <b>Your lists</b><span class="lists-side-count">${lists.length}</span>
        <button class="btn btn-primary btn-sm lists-side-new" type="button" onclick="newList()">${LI_ICO.plus}<span>New</span></button>
      </div>
      <div class="search-wrap lists-side-search">${LI_ICO.search}
        <input class="field search" id="listSideSearch" placeholder="Search lists…" value="${escA(listSideQ)}" oninput="filterSidebar(this.value)"/>
      </div>
      ${renderListSidebar()}
    </aside>
    <section class="lists-panel" id="listDetail">${renderListDetail(listById(listActive))}</section>
  </div>`;
  updateListSelCount(listActive);
}
function filterSidebar(q) {
  listSideQ = q;
  const box = document.getElementById("listSideScroll");
  if (box) box.outerHTML = renderListSidebar();
}

function detailStats(list) {
  const c = listContactCount(list), g = listGroupCount(list);
  return `<div class="lists-stats">
    <div class="lists-stat"><span class="lists-stat-n">${c}</span><span class="lists-stat-l">Contacts</span></div>
    <div class="lists-stat"><span class="lists-stat-n">${g}</span><span class="lists-stat-l">Groups</span></div>
    <div class="lists-stat"><span class="lists-stat-n">${c + g}</span><span class="lists-stat-l">Total reach</span></div>
  </div>`;
}
function messageCard(list) {
  if (msgEditId === list.id) {
    return `<div class="lists-msg-card editing">
      <div class="lists-msg-head"><span class="le-label" style="margin:0">Default message</span></div>
      <textarea class="field" id="listMsgEdit" style="min-height:120px">${esc(list.message || "")}</textarea>
      <div class="lists-msg-actions">
        <button class="btn btn-soft btn-sm" type="button" onclick="cancelListMsg()">Cancel</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="saveListMsg('${list.id}')">Save message</button>
      </div>
    </div>`;
  }
  const msg = listMsg(list);
  const custom = !!(list.message && list.message.trim());
  return `<div class="lists-msg-card">
    <div class="lists-msg-head">
      <span class="le-label" style="margin:0">Default message ${custom ? "" : '<span class="hint" style="margin:0;text-transform:none;font-weight:500">· sample</span>'}</span>
      <div class="lists-msg-tools">
        <button class="icon-btn ib-sm" type="button" title="Copy message" onclick="copyListMsg('${list.id}')">${LI_ICO.copy}</button>
        <button class="icon-btn ib-sm" type="button" title="Edit message" onclick="editListMsg('${list.id}')">${LI_ICO.edit}</button>
      </div>
    </div>
    <div class="lists-msg-body">${esc(msg)}</div>
  </div>`;
}
function editListMsg(id) { msgEditId = id; document.getElementById("listDetail").innerHTML = renderListDetail(listById(id)); const t = document.getElementById("listMsgEdit"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
function cancelListMsg() { const id = msgEditId; msgEditId = null; document.getElementById("listDetail").innerHTML = renderListDetail(listById(id)); updateListSelCount(id); }
async function saveListMsg(id) {
  const val = document.getElementById("listMsgEdit").value;
  try {
    const res = await fetch(`/api/lists/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: val }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Save failed");
    const l = listById(id); if (l) l.message = val;
    msgEditId = null;
    document.getElementById("listDetail").innerHTML = renderListDetail(l);
    updateListSelCount(id);
    toast("Message saved ✓");
  } catch (e) { toast(e.message || "Save failed", "err"); }
}
function copyListMsg(id) {
  const l = listById(id); if (!l) return;
  const txt = listMsg(l);
  if (typeof copyText === "function") copyText(txt);
  else if (navigator.clipboard) { navigator.clipboard.writeText(txt); toast("Message copied ✓"); }
}

function detailSubtabs(list) {
  const c = listContactCount(list), g = listGroupCount(list), n = c + g;
  const tab = (key, label, count) => `<button type="button" class="lists-subtab${listTypeF === key ? " on" : ""}" onclick="setListType('${key}')">${label}<span class="lists-subtab-n">${count}</span></button>`;
  return `<div class="lists-subtabs">
    ${tab("all", "All", n)}${tab("contacts", "Contacts", c)}${tab("groups", "Groups", g)}
  </div>`;
}
function setListType(t) {
  listTypeF = t;
  document.querySelectorAll(".lists-subtab").forEach((b) => b.classList.remove("on"));
  const box = document.getElementById("lmembers-" + listActive);
  if (box) box.innerHTML = listMembersView(listById(listActive));
  document.querySelectorAll(".lists-subtab").forEach((b) => { if (b.getAttribute("onclick").includes(`'${t}'`)) b.classList.add("on"); });
  updateListSelCount(listActive);
}

function renderListDetail(list) {
  if (!list) return `<div class="empty" style="padding:60px"><p class="hint">Select a list.</p></div>`;
  const n = listTotalCount(list);
  const labels = (list.labels || []).length ? list.labels.map(labelChip).join("") : '<span class="hint" style="margin:0">No labels linked</span>';
  const q = listSearchQ[list.id] || "";
  return `<div class="lists-detail2" style="--list-accent:${list.color || "var(--accent)"}">
    <div class="lists-detail-hero">
      <div class="lists-hero-main">
        <span class="lists-hero-dot"></span>
        <div class="lists-hero-text"><h2>${esc(list.name)}</h2><div class="lists-labelrow2">${labels}</div></div>
      </div>
      <div class="lists-hero-icons">
        <button class="icon-btn ib-sm" type="button" title="Sync from WhatsApp" onclick="syncList('${list.id}')">${LI_ICO.sync}</button>
        <button class="icon-btn ib-sm" type="button" title="Manage contacts" onclick="openListMembers('${list.id}')">${LI_ICO.manage}</button>
        <button class="icon-btn ib-sm" type="button" title="Edit list" onclick="editList('${list.id}')">${LI_ICO.edit}</button>
        <button class="icon-btn ib-sm ib-danger" type="button" title="Delete list" onclick="deleteList('${list.id}')">${LI_ICO.trash}</button>
      </div>
    </div>
    ${detailStats(list)}
    ${messageCard(list)}
    <div class="lists-detail-toolbar">
      ${detailSubtabs(list)}
      <div class="search-wrap lists-search">${LI_ICO.search}
        <input class="field search" id="lsearch-${list.id}" placeholder="Search members…" value="${escA(q)}" oninput="listFilter('${list.id}',this.value)" ${n ? "" : "disabled"}/>
      </div>
    </div>
    <div class="lists-selbar">
      <button class="btn btn-ghost btn-sm" type="button" onclick="listSelectAll('${list.id}',true)" ${n ? "" : "disabled"}>Select all</button>
      <button class="btn btn-ghost btn-sm" type="button" onclick="listSelectAll('${list.id}',false)">Clear</button>
      <span class="hint list-selcount" id="lcount-${list.id}"></span>
      <span style="flex:1"></span>
      <button class="btn btn-soft btn-sm" type="button" onclick="sendList('${list.id}',true)">Send selected</button>
      <button class="btn btn-primary btn-sm" type="button" onclick="sendList('${list.id}',false)" ${n ? "" : "disabled"}>${LI_ICO.send}<span>Send all</span></button>
    </div>
    <div class="lists-members" id="lmembers-${list.id}">${listMembersView(list)}</div>
  </div>`;
}

/* ══════════════ members list (shared by workspace) ══════════════ */
function listFilter(id, q) {
  listSearchQ[id] = q;
  const box = document.getElementById("lmembers-" + id);
  if (box) box.innerHTML = listMembersView(listById(id));
  updateListSelCount(id);
}
function _filteredMembers(list) {
  let mem = listTypeF === "groups" ? [] : listMembers(list);
  let grps = listTypeF === "contacts" ? [] : listGroupsOf(list);
  const q = (listSearchQ[list.id] || "").trim().toLowerCase();
  if (q) {
    mem = mem.filter((c) => ((c.name || "") + " " + (c.phone || "")).toLowerCase().includes(q));
    grps = grps.filter((g) => ((g.name || "") + " " + (g.id || "")).toLowerCase().includes(q));
  }
  return { mem, grps, q };
}
function memberRow(list, c) {
  const key = "c:" + c.phone;
  const sel = !!listSelSet(list.id)[key];
  const pic = typeof entityPic === "function" ? entityPic(c) : (c.photoUrl || c.pic || "");
  const display = (c.name && c.name !== c.phone) ? c.name : (c.name || c.phone);
  return `<div class="lrow lists-clickrow${sel ? " sel" : ""}" onclick="openListEntity('${list.id}','c','${escA(c.phone)}')">
    <span class="lrow-check" onclick="event.stopPropagation()"><input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${escA(key)}',this.checked);this.closest('.lrow').classList.toggle('sel',this.checked)"/></span>
    <span class="av small${pic ? " has-img" : ""}">${avatarInner(display, pic)}${c.waLinked ? '<span class="wa-badge"></span>' : ""}</span>
    <span class="lrow-body"><b>${esc(display)}</b><span class="lrow-sub">+${esc(c.phone)}</span></span>
    <span class="lrow-type"><span class="lists-type-tag">Contact</span></span>
    <button class="btn btn-soft btn-sm lrow-send" type="button" onclick="event.stopPropagation();sendListContact('${list.id}','${escA(c.phone)}')">Send</button>
  </div>`;
}
function groupRow(list, g) {
  const gi = (list.groups || []).indexOf(g);
  const key = "g:" + (g.id || g.name);
  const sel = !!listSelSet(list.id)[key];
  const gname = g.name || g.id || "Group";
  return `<div class="lrow lists-clickrow${sel ? " sel" : ""}" onclick="openListEntity('${list.id}','g',${gi})">
    <span class="lrow-check" onclick="event.stopPropagation()"><input type="checkbox" ${sel ? "checked" : ""} onchange="toggleListSel('${list.id}','${escA(key)}',this.checked);this.closest('.lrow').classList.toggle('sel',this.checked)"/></span>
    <span class="av small lists-av-group">${avatarInner(gname, "")}</span>
    <span class="lrow-body"><b>${esc(gname)}</b><span class="lrow-sub">WhatsApp group</span></span>
    <span class="lrow-type"><span class="lists-type-tag is-group">Group</span></span>
    <button class="btn btn-soft btn-sm lrow-send" type="button" onclick="event.stopPropagation();sendListGroupIdx('${list.id}',${gi})">Send</button>
  </div>`;
}
function listMembersView(list) {
  if (!listTotalCount(list)) {
    return `<div class="lists-empty2">
      <p class="hint">This list has no contacts or groups yet.</p>
      <div class="lists-empty-actions">
        <button class="btn btn-soft btn-sm" onclick="syncList('${list.id}')">${LI_ICO.sync}<span>Sync from labels</span></button>
        <button class="btn btn-soft btn-sm" onclick="openListMembers('${list.id}')">${LI_ICO.manage}<span>Add contacts</span></button>
      </div></div>`;
  }
  const { mem, grps, q } = _filteredMembers(list);
  if (!mem.length && !grps.length) {
    return `<div class="lists-empty2"><div class="empty-ico" aria-hidden="true">${LI_ICO.search}</div><p class="hint" style="margin:0">No members match${q ? ` “${esc(q)}”` : ""}.</p></div>`;
  }
  return `<div class="lrows">${mem.map((c) => memberRow(list, c)).join("")}${grps.map((g) => groupRow(list, g)).join("")}</div>`;
}

/* ══════════════ grid (gallery) ══════════════ */
function renderListGrid(wrap) {
  wrap.innerHTML = `<div class="card-grid lists-board">${lists.map((l) => {
    const labs = (l.labels || []).slice(0, 3).map(labelChip).join("");
    const extra = (l.labels || []).length > 3 ? `<span class="hint" style="margin:0">+${(l.labels || []).length - 3}</span>` : "";
    const avs = listMembers(l).slice(0, 5).map((m) => `<span class="av xs">${avatarInner((m.name && m.name !== m.phone) ? m.name : m.phone, "")}</span>`).join("");
    const extraAv = listContactCount(l) > 5 ? `<span class="lists-stack-more">+${listContactCount(l) - 5}</span>` : "";
    return `<article class="ecard lists-ecard" tabindex="0" style="--list-accent:${l.color || "var(--accent)"}" onclick="setListMode('workspace');setListActive('${l.id}')" onkeydown="if(event.key==='Enter'){setListMode('workspace');setListActive('${l.id}')}">
      <div class="lists-ecard-bar"></div>
      <div class="ecard-top">
        <div class="ecard-id"><b>${esc(l.name)}</b><span>${listContactCount(l)} contacts · ${listGroupCount(l)} groups</span></div>
        <span class="ecard-go">›</span>
      </div>
      <div class="ecard-days">${labs || '<span class="ec-none">No labels</span>'}${extra}</div>
      <div class="lists-ecard-avs">${avs || '<span class="ec-none">Empty</span>'}${extraAv}</div>
      <div class="ecard-foot" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" type="button" onclick="syncList('${l.id}')">Sync</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="sendList('${l.id}',false)">Send all</button>
      </div>
    </article>`;
  }).join("")}
  <button class="ecard lists-ecard-add" type="button" onclick="newList()">${LI_ICO.plus}<span>New list</span></button>
  </div>`;
}

/* ══════════════ table (dense) ══════════════ */
function listMemberAvatars(l, max) {
  const people = listMembers(l).slice(0, max);
  const extra = listContactCount(l) - people.length;
  if (!people.length && !listGroupCount(l)) return '<span class="hint" style="margin:0">Empty</span>';
  const avs = people.map((c) => `<span class="lists-stack-av av small" title="${escA((c.name && c.name !== c.phone) ? c.name : c.phone)}">${avatarInner((c.name && c.name !== c.phone) ? c.name : c.phone, "")}</span>`).join("");
  const more = extra > 0 ? `<span class="lists-stack-more">+${extra}</span>` : "";
  const grp = listGroupCount(l) ? `<span class="lists-stack-grp">${listGroupCount(l)} group${listGroupCount(l) === 1 ? "" : "s"}</span>` : "";
  return `<div class="lists-stack">${avs}${more}${grp}</div>`;
}
function renderListTable(wrap) {
  wrap.innerHTML = `<div class="tbl-wrap"><table class="data grid-table lists-overview"><thead><tr>
    <th>List</th><th class="lists-memcol">Members</th><th>Labels</th><th class="lists-num">Contacts</th><th class="lists-num">Groups</th><th class="lists-actcol">Actions</th>
  </tr></thead><tbody>${lists.map((l) => {
    const labs = (l.labels || []).map(labelChip).join("") || '<span class="hint" style="margin:0">—</span>';
    return `<tr onclick="setListMode('workspace');setListActive('${l.id}')">
      <td><div class="grid-name"><span class="list-dot" style="background:${l.color || "var(--accent)"}"></span><b>${esc(l.name)}</b></div></td>
      <td class="lists-memcol">${listMemberAvatars(l, 4)}</td>
      <td><div class="lbl-row">${labs}</div></td>
      <td class="lists-num"><span class="lists-count">${listContactCount(l)}</span></td>
      <td class="lists-num"><span class="lists-count">${listGroupCount(l)}</span></td>
      <td class="lists-actcol" onclick="event.stopPropagation()">
        <div class="lists-rowact">
          <button class="btn btn-ghost btn-sm" type="button" onclick="syncList('${l.id}')" title="Sync from WhatsApp">Sync</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="editList('${l.id}')" title="Edit list">Edit</button>
          <button class="btn btn-primary btn-sm" type="button" onclick="sendList('${l.id}',false)">Send all</button>
        </div>
      </td>
    </tr>`;
  }).join("")}</tbody></table></div>`;
}

/* ══════════════ new / edit list form ══════════════ */
function newList() {
  lmEditId = null;
  document.getElementById("listModalTitle").textContent = "New list";
  document.getElementById("lmSaveBtn").textContent = "Create list";
  document.getElementById("lmName").value = "";
  document.getElementById("lmColor").value = LIST_COLORS[0];
  document.getElementById("lmMessage").value = "";
  lmLabelsSel = new Set();
  lmLabelPool = [...(waLabels || [])];
  lmRenderSwatches(); renderLmLabels(); lmPreview();
  document.getElementById("listModal").classList.add("show");
  setTimeout(() => document.getElementById("lmName").focus(), 60);
}
function editList(id) {
  const l = listById(id); if (!l) return;
  lmEditId = id;
  document.getElementById("listModalTitle").textContent = "Edit list";
  document.getElementById("lmSaveBtn").textContent = "Save changes";
  document.getElementById("lmName").value = l.name || "";
  document.getElementById("lmColor").value = l.color || LIST_COLORS[0];
  document.getElementById("lmMessage").value = l.message || "";
  lmLabelsSel = new Set(l.labels || []);
  lmLabelPool = [...new Set([...(waLabels || []), ...(l.labels || [])])];
  lmRenderSwatches(); renderLmLabels(); lmPreview();
  document.getElementById("listModal").classList.add("show");
}
function closeListModal() { document.getElementById("listModal").classList.remove("show"); }
function lmRenderSwatches() {
  const box = document.getElementById("lmSwatches"); if (!box) return;
  const cur = document.getElementById("lmColor").value;
  box.innerHTML = LIST_COLORS.map((c) =>
    `<button type="button" class="lm-swatch${c.toLowerCase() === (cur || "").toLowerCase() ? " on" : ""}" style="background:${c}" title="${c}" onclick="lmPickColor('${c}')"></button>`
  ).join("") + `<label class="lm-swatch lm-swatch-custom" title="Custom color"><input type="color" value="${cur}" oninput="lmPickColor(this.value)"/></label>`;
}
function lmPickColor(c) { document.getElementById("lmColor").value = c; lmRenderSwatches(); lmPreview(); }
function renderLmLabels() {
  const box = document.getElementById("lmLabels"); if (!box) return;
  const all = [...new Set([...(lmLabelPool || []), ...lmLabelsSel])];
  if (!all.length) { box.innerHTML = `<p class="hint" style="margin:0">No labels yet — sync from WhatsApp Business or add one below.</p>`; return; }
  box.innerHTML = all.map((lab) => {
    const on = lmLabelsSel.has(lab);
    return `<button type="button" class="lm-labelpill${on ? " on" : ""}" onclick="lmToggleLabel('${escA(lab)}')">${on ? "✓ " : ""}${esc(lab)}</button>`;
  }).join("");
}
function lmToggleLabel(lab) { if (lmLabelsSel.has(lab)) lmLabelsSel.delete(lab); else lmLabelsSel.add(lab); renderLmLabels(); lmPreview(); }
function lmAddLabel() {
  const inp = document.getElementById("lmNewLabel");
  const v = (inp.value || "").trim();
  if (!v) return;
  if (!lmLabelPool.includes(v)) lmLabelPool.push(v);
  lmLabelsSel.add(v); inp.value = ""; renderLmLabels(); lmPreview();
}
function lmPreview() {
  const card = document.getElementById("lmPreviewCard"); if (!card) return;
  const name = document.getElementById("lmName").value.trim() || "Untitled list";
  const color = document.getElementById("lmColor").value || LIST_COLORS[0];
  const labs = [...lmLabelsSel].map(labelChip).join("") || '<span class="hint" style="margin:0">No labels</span>';
  const msg = document.getElementById("lmMessage").value.trim();
  card.innerHTML = `<div class="lm-preview-card" style="--list-accent:${color}">
    <div class="lm-preview-bar"></div>
    <div class="lm-preview-top"><span class="list-dot lg" style="background:${color}"></span><b>${esc(name)}</b></div>
    <div class="lbl-row" style="margin:8px 0 10px">${labs}</div>
    <div class="lm-preview-msg">${msg ? esc(msg) : '<span class="hint" style="margin:0">Sample reminder will be used until you set a message.</span>'}</div>
  </div>`;
}
async function saveList() {
  const name = document.getElementById("lmName").value.trim();
  if (!name) { toast("List name required", "err"); return; }
  const color = document.getElementById("lmColor").value || LIST_COLORS[0];
  const message = document.getElementById("lmMessage").value;
  const labels = [...lmLabelsSel];
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
  } catch (e) { toast(e.message || "Save failed", "err"); }
}
async function deleteList(id) {
  const l = listById(id);
  if (!confirm(`Delete the "${l ? l.name : "list"}" list? (Contacts are not deleted)`)) return;
  try {
    const res = await fetch(`/api/lists/${encodeURIComponent(id)}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Delete failed");
    if (listActive === id) listActive = null;
    await loadLists();
    renderLists();
    toast("List deleted");
  } catch (e) { toast(e.message || "Delete failed", "err"); }
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
  } catch (e) { toast(e.message || "Sync failed", "err"); }
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
    if (Array.isArray(d.lists)) { lists = d.lists; if (lists.length && (!listActive || !listById(listActive))) listActive = lists[0].id; }
    renderLists();
    const n = (lists || []).length;
    const labelN = (d.labelCount != null) ? d.labelCount : ((d.waLabels || []).length);
    const src = d.source === "whatsapp" ? "WhatsApp" : "saved contacts";
    if (n) toast(`Synced ${n} list${n === 1 ? "" : "s"} from ${src} ✓`);
    else if (d.source === "whatsapp" && !labelN) toast("WhatsApp is linked but returned no Business labels. Add labels in WhatsApp Business, then sync again.", "err");
    else toast(d.warning ? `No lists yet (${d.warning})` : "No lists yet — create one or sync after linking WhatsApp", "err");
  } catch (e) { toast(e.message || "Sync failed — link WhatsApp in Automated Send first", "err"); }
}

/* ══════════════ manage members modal ══════════════ */
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
  const all = (typeof contacts !== "undefined" ? contacts : []);
  const rows = all.filter((c) => !q || (c.name || "").toLowerCase().includes(q) || String(c.phone).includes(q));
  const cnt = document.getElementById("lmemCount");
  if (cnt) cnt.textContent = `${members.size} in list · ${all.length} contacts`;
  if (!rows.length) { box.innerHTML = `<div class="lists-empty2"><p class="hint" style="margin:0">No contacts match.</p></div>`; return; }
  box.innerHTML = rows.map((c) => {
    const on = members.has(phoneKey(c.phone));
    const pic = typeof entityPic === "function" ? entityPic(c) : (c.photoUrl || c.pic || "");
    return `<label class="lmem-row${on ? " on" : ""}"><input type="checkbox" ${on ? "checked" : ""} onchange="toggleListMember('${escA(c.phone)}',this.checked)"/>
      <div class="av small${pic ? " has-img" : ""}">${avatarInner(c.name, pic)}</div>
      <div style="min-width:0;flex:1"><b>${esc(c.name)}</b><div class="hint" style="margin:0">+${esc(c.phone)}</div></div>
      <div class="lbl-row">${(c.labels || []).map(labelChip).join("")}</div>
      <span class="lmem-tick">✓</span></label>`;
  }).join("");
}
async function toggleListMember(phone, checked) {
  const list = listById(lmemListId); if (!list) return;
  const set = new Set((list.members || []).map(phoneKey));
  const key = phoneKey(phone);
  if (checked) set.add(key); else set.delete(key);
  list.members = [...set];
  try {
    await fetch(`/api/lists/${encodeURIComponent(list.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ members: list.members }) });
    renderListMembers();
    if (listMode === "workspace" && document.getElementById("listDetail")) {
      document.getElementById("listDetail").innerHTML = renderListDetail(list);
      updateListSelCount(list.id);
    } else renderLists();
  } catch (_) { toast("Could not update members", "err"); }
}

/* ══════════════ send + entity modal (unchanged contract) ══════════════ */
function sendListTargets(list, phones) {
  const msg = typeof replaceTokens === "function" ? replaceTokens(listMsg(list)) : listMsg(list);
  const srv = list.memberNames || {};
  return phones.map((ph) => {
    const c = (typeof contacts !== "undefined" ? contacts : []).find((x) => phoneKey(x.phone) === phoneKey(ph));
    const nm = (c && c.name && c.name !== c.phone) ? c.name : (srv[phoneKey(ph)] || (c ? c.name : ph));
    return {
      name: nm, phone: String(ph),
      message: (c && c.message && c.message.trim()) ? (typeof replaceTokens === "function" ? replaceTokens(c.message) : c.message) : msg,
    };
  }).filter((t) => t.phone);
}
function sendListGroupTargets(list, groups) {
  const msg = typeof replaceTokens === "function" ? replaceTokens(listMsg(list)) : listMsg(list);
  return groups.map((g) => ({ name: g.name || g.id, message: msg })).filter((t) => t.name);
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

let leCtx = null;
function _leContactInfo(list, phone) {
  const key = phoneKey(phone);
  const srv = (list.memberNames || {});
  const c = (typeof contacts !== "undefined" ? contacts : []).find((x) => phoneKey(x.phone) === key);
  const name = (c && c.name && c.name !== c.phone) ? c.name : (srv[key] || (c && c.name) || phone);
  return {
    name, phone: key || phone,
    labels: (c && c.labels) || [],
    waLinked: c ? !!c.waLinked : !!srv[key],
    message: (c && c.message && c.message.trim()) ? c.message : "",
    pic: (typeof entityPic === "function" && c) ? entityPic(c) : "",
  };
}
function openListEntity(listId, type, key, gname) {
  const list = listById(listId); if (!list) return;
  const modal = document.getElementById("listEntityModal"); if (!modal) return;
  const body = document.getElementById("leBody");
  if (type === "c") {
    const info = _leContactInfo(list, key);
    leCtx = { listId, type, phone: info.phone, name: info.name };
    const labels = (info.labels || []).map(labelChip).join("") || '<span class="hint" style="margin:0">No labels</span>';
    document.getElementById("leTitle").textContent = "Contact";
    body.innerHTML = `
      <div class="le-hero">
        <div class="av lg${info.pic ? " has-img" : ""}">${avatarInner(info.name, info.pic)}${info.waLinked ? '<span class="wa-badge"></span>' : ""}</div>
        <div class="le-hero-body"><h3>${esc(info.name)}</h3><div class="le-phone">+${esc(info.phone)}</div>
          <div class="le-badges">${info.waLinked ? '<span class="chip chip-default">On WhatsApp</span>' : '<span class="chip">Not verified</span>'}</div></div>
      </div>
      <div class="le-field"><div class="le-label">Labels</div><div class="lbl-row">${labels}</div></div>
      <div class="le-field"><div class="le-label">Message to send</div>
        <textarea class="field" id="leMsg" style="min-height:110px" oninput="leRenderPreview()">${esc(info.message || listMsg(list))}</textarea>
        <div class="hint" style="margin:6px 0 0">Wrap *text* for bold. {date} / {weekday} are replaced when sent.</div></div>
      <div class="le-field"><div class="le-label">Preview</div><div class="msg-preview le-preview"><div class="preview-b" id="lePreview"></div></div></div>`;
    document.getElementById("leOpenGroup").style.display = "none";
    document.getElementById("leOpenContact").style.display = "";
  } else {
    // key is the index into list.groups (safe against special characters in names)
    const g = (typeof key === "number" || /^\d+$/.test(key)) ? (list.groups || [])[Number(key)] : null;
    const gname2 = (g && g.name) || (g && g.id) || gname || "Group";
    const gid = (g && g.id) || "";
    leCtx = { listId, type, gid, name: gname2 };
    document.getElementById("leTitle").textContent = "Group";
    body.innerHTML = `
      <div class="le-hero">
        <div class="av lg lists-av-group">${LI_ICO.group}</div>
        <div class="le-hero-body"><h3>${esc(gname2)}</h3>
          <div class="le-badges"><span class="chip chip-default">WhatsApp group</span></div></div>
      </div>
      <div class="le-field"><div class="le-label">Message to send</div>
        <textarea class="field" id="leMsg" style="min-height:110px" oninput="leRenderPreview()">${esc(listMsg(list))}</textarea>
        <div class="hint" style="margin:6px 0 0">Sent to the whole group. Open the Groups page to see its members and manage it.</div></div>
      <div class="le-field"><div class="le-label">Preview</div><div class="msg-preview le-preview"><div class="preview-b" id="lePreview"></div></div></div>`;
    document.getElementById("leOpenGroup").style.display = "";
    document.getElementById("leOpenContact").style.display = "none";
  }
  modal.classList.add("show");
  leRenderPreview();
}
function leRenderPreview() {
  const out = document.getElementById("lePreview");
  const src = document.getElementById("leMsg");
  if (!out || !src) return;
  const raw = src.value || "";
  const rendered = (typeof replaceTokens === "function") ? replaceTokens(raw) : raw;
  out.innerHTML = raw.trim()
    ? ((typeof renderWhatsAppPreview === "function") ? renderWhatsAppPreview(rendered) : esc(rendered))
    : '<i class="hint" style="margin:0">Nothing to preview yet</i>';
}
function listEntityOpenContact() {
  if (!leCtx || leCtx.type !== "c") return;
  const phone = leCtx.phone, name = leCtx.name;
  closeListEntity();
  const arr = (typeof contacts !== "undefined" ? contacts : []);
  const i = arr.findIndex((c) => phoneKey(c.phone) === phoneKey(phone));
  if (i >= 0 && typeof openContactDetail === "function") {
    openContactDetail(i);
  } else if (typeof newContactDetail === "function") {
    // Not a saved contact yet — open the Contacts page prefilled to save it.
    newContactDetail();
    if (typeof cdWorking !== "undefined" && cdWorking) {
      cdWorking.name = (name && name !== phone) ? name : "";
      cdWorking.phone = phone;
      if (typeof renderContactDetail === "function") renderContactDetail();
    }
    toast("Contact not saved yet — add details to keep it");
  } else if (typeof showView === "function") {
    showView("contacts");
  }
}
function closeListEntity() { const m = document.getElementById("listEntityModal"); if (m) m.classList.remove("show"); leCtx = null; }
function listEntitySend() {
  if (!leCtx) return;
  const list = listById(leCtx.listId); if (!list) return;
  const raw = (document.getElementById("leMsg").value || "").trim();
  if (!raw) { toast("Enter a message", "err"); return; }
  const msg = typeof replaceTokens === "function" ? replaceTokens(raw) : raw;
  let targets;
  if (leCtx.type === "c") targets = [{ name: leCtx.name, phone: String(leCtx.phone), message: msg }];
  else targets = [{ name: leCtx.name, message: msg }];
  closeListEntity();
  if (typeof doRelease === "function") doRelease(targets, "relAllSpin", "relAllBtn", "relAllTxt", "Send");
  else toast("Send unavailable", "err");
}
function listEntityOpenGroup() {
  if (!leCtx || leCtx.type !== "g") return;
  const name = leCtx.name;
  closeListEntity();
  if (typeof openGroupDetailByName === "function" && typeof groups !== "undefined" && groups.some((g) => g.name === name)) openGroupDetailByName(name);
  else if (typeof newGroupDetail === "function") { newGroupDetail(); if (typeof gdWorking !== "undefined" && gdWorking) { gdWorking.name = name; if (typeof renderGroupDetail === "function") renderGroupDetail(); } toast("Add a schedule to manage this group"); }
  else if (typeof showView === "function") showView("groups");
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
function sendListGroupIdx(id, gi) {
  const list = listById(id); if (!list) return;
  const g = (list.groups || [])[gi]; if (!g) return;
  const targets = sendListGroupTargets(list, [g]);
  if (typeof doRelease === "function") doRelease(targets, "relAllSpin", "relAllBtn", "relAllTxt", "Send");
}
