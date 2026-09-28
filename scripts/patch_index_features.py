"""Patch templates/user/index.html for scheduler extras + lists + status log."""
from pathlib import Path

p = Path(r"D:\SSIES Schedule Automation\templates\user\index.html")
t = p.read_text(encoding="utf-8")

def must_replace(old, new, label):
    global t
    if old not in t:
        raise SystemExit(f"missing block: {label}")
    t = t.replace(old, new, 1)
    print("ok", label)

# cache bump
t = t.replace("?v=poc31", "?v=poc32")

# Add Lists nav under scheduler group
must_replace(
    """          <button class="nav-item nav-sub" data-view="table" data-sched="board" onclick="navSched('board')"><span class="ico"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="18" rx="1.5"/></svg></span><span class="lbl">Board view</span></button>
        </div>
      </div>
      <div class="nav-group" id="navMsgGroup">""",
    """          <button class="nav-item nav-sub" data-view="table" data-sched="board" onclick="navSched('board')"><span class="ico"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="18" rx="1.5"/></svg></span><span class="lbl">Board view</span></button>
          <button class="nav-item nav-sub" data-view="lists" onclick="navGo('lists')"><span class="ico"><svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></span><span class="lbl">Lists</span></button>
        </div>
      </div>
      <div class="nav-group" id="navMsgGroup">""",
    "nav lists",
)

# Toolbar expand/collapse/clash + banner
must_replace(
    """            <div class="sched-sel-actions">
              <button class="btn btn-ghost btn-sm" type="button" onclick="selectAllCols(true)">Select all</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick="selectAllCols(false)">Clear</button>
            </div>
          </div>
          <div class="sched-toolbar-right">
            <span class="sched-sel-count" id="schedSelCount"></span>
            <button class="btn btn-soft btn-sm" type="button" onclick="saveTable()">Save</button>
            <button class="btn btn-primary btn-sm" type="button" id="relTblBtn" onclick="releaseTable()">
              <span id="relTblTxt">Send selected</span><div class="spinner hidden" id="relTblSpin"></div>
            </button>
          </div>
        </div>
        <div class="view-pad table-view-pad">
          <div id="tableWrap" class="sched-canvas"></div>
        </div>""",
    """            <div class="sched-sel-actions">
              <button class="btn btn-ghost btn-sm" type="button" onclick="selectAllCols(true)">Select all</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick="selectAllCols(false)">Clear</button>
              <button class="btn btn-ghost btn-sm sched-cols-only" type="button" onclick="expandAllCols(true)" title="Show full group names">Expand</button>
              <button class="btn btn-ghost btn-sm sched-cols-only" type="button" onclick="expandAllCols(false)" title="Show short names / nicknames">Collapse</button>
              <button class="btn btn-ghost btn-sm clash-toggle" type="button" id="clashBtn" onclick="toggleClash()" title="Highlight overlapping class times"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg><span>Clashes</span></button>
            </div>
          </div>
          <div class="sched-toolbar-right">
            <span class="sched-sel-count" id="schedSelCount"></span>
            <button class="btn btn-soft btn-sm" type="button" onclick="saveTable()">Save</button>
            <button class="btn btn-primary btn-sm" type="button" id="relTblBtn" onclick="releaseTable()">
              <span id="relTblTxt">Send selected</span><div class="spinner hidden" id="relTblSpin"></div>
            </button>
          </div>
        </div>
        <div id="clashBanner"></div>
        <div class="view-pad table-view-pad">
          <div id="tableWrap" class="sched-canvas"></div>
        </div>""",
    "sched toolbar",
)

# Insert Lists section before Templates
must_replace(
    """      <!-- ════ TEMPLATES ════ -->
      <section class="view" id="view-templates">""",
    """      <!-- ════ LISTS ════ -->
      <section class="view" id="view-lists">
        <div class="wa-hero">
          <h3>Lists</h3>
          <p>Auto-discover contacts from your WhatsApp Business <strong>labels</strong>, curate each list, and send schedules to all or selected contacts.</p>
        </div>
        <div class="toolbar list-toolbar">
          <button class="btn btn-primary btn-sm" type="button" onclick="newList()">+ New list</button>
          <button class="btn btn-soft btn-sm" type="button" onclick="syncAllLists()" title="Rebuild every list from its WhatsApp labels">Sync from WhatsApp</button>
          <div class="seg" id="listModeSeg" style="margin-left:auto">
            <button type="button" data-val="tabs" onclick="setListMode('tabs')">Tabs</button>
            <button type="button" data-val="table" onclick="setListMode('table')">Table</button>
            <button type="button" data-val="board" onclick="setListMode('board')">Board</button>
          </div>
        </div>
        <div id="listsWrap"></div>
      </section>

      <!-- ════ TEMPLATES ════ -->
      <section class="view" id="view-templates">""",
    "lists section",
)

# Status log modern buttons
must_replace(
    """    <div class="status-log hidden" id="statusPanel">
      <div class="lh"><span>Status Log</span><span><span class="toggle-log" onclick="document.getElementById('statusPanel').classList.toggle('collapsed')">collapse</span> · <span class="clr" onclick="document.getElementById('logLines').innerHTML=''">clear</span></span></div>
      <div id="logLines"></div>
    </div>""",
    """    <div class="status-log hidden" id="statusPanel">
      <div class="lh">
        <span class="lh-title">Status Log</span>
        <span class="lh-actions">
          <button class="log-btn" id="logCollapseBtn" type="button" onclick="toggleStatusLog()" title="Collapse log"><svg class="log-caret" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg></button>
          <button class="log-btn" type="button" onclick="clearStatusLog()" title="Clear log"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
        </span>
      </div>
      <div id="logLines"></div>
    </div>""",
    "status log",
)

# Modals before closing body scripts — find col meta insertion before features.js or toast
anchor = '<div class="toast" id="toast"></div>'
modals = '''
<!-- Column name / nickname editor -->
<div class="modal-scrim" id="colMetaModal">
  <div class="modal">
    <div class="modal-h"><span>Group name &amp; nickname</span><button class="modal-x" type="button" onclick="closeColMeta()">✕</button></div>
    <div class="modal-b">
      <div class="profile-field"><label>WhatsApp group name</label><input id="cmName" placeholder="Full group name" onkeydown="if(event.key==='Enter')saveColMeta()"/></div>
      <div class="profile-field"><label>Nickname <span class="field-hint" style="display:inline">short label shown in tables</span></label><input id="cmNick" placeholder="e.g. Batch AM" onkeydown="if(event.key==='Enter')saveColMeta()"/></div>
    </div>
    <div class="modal-f"><button class="btn btn-soft" type="button" onclick="closeColMeta()">Cancel</button><button class="btn btn-primary" type="button" onclick="saveColMeta()">Save</button></div>
  </div>
</div>

<!-- List create / edit -->
<div class="modal-scrim" id="listModal">
  <div class="modal">
    <div class="modal-h"><span id="listModalTitle">New list</span><button class="modal-x" type="button" onclick="closeListModal()">✕</button></div>
    <div class="modal-b">
      <div class="profile-field"><label>List name</label><input id="lmName" placeholder="e.g. Physics Batch 2025"/></div>
      <div class="profile-field"><label>Accent color</label><input id="lmColor" type="color" value="#0d9488" style="width:56px;height:38px;padding:2px;border:1px solid var(--border);border-radius:var(--r-sm);background:none;cursor:pointer"/></div>
      <div class="profile-field"><label>WhatsApp labels <span class="field-hint" style="display:inline">contacts with these labels are auto-discovered</span></label><div class="perm-grid" id="lmLabels"></div></div>
      <div class="profile-field"><label>Default message</label><textarea class="field" id="lmMessage" style="min-height:96px" placeholder="*Reminder*&#10;Dear parent, please note the updated schedule."></textarea></div>
    </div>
    <div class="modal-f"><button class="btn btn-soft" type="button" onclick="closeListModal()">Cancel</button><button class="btn btn-primary" type="button" id="lmSaveBtn" onclick="saveList()">Create list</button></div>
  </div>
</div>

<!-- Manage list members -->
<div class="modal-scrim" id="listMembersModal">
  <div class="modal modal-lg">
    <div class="modal-h"><span id="lmemTitle">Manage contacts</span><button class="modal-x" type="button" onclick="closeListMembers()">✕</button></div>
    <div class="modal-b">
      <div class="search-wrap" style="margin-bottom:12px">
        <svg class="search-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="field search" id="lmemSearch" placeholder="Search contacts…" oninput="renderListMembers()"/>
      </div>
      <div id="lmemList" class="lmem-list"></div>
    </div>
    <div class="modal-f"><button class="btn btn-soft" type="button" onclick="closeListMembers()">Done</button></div>
  </div>
</div>

''' + anchor
if anchor not in t:
    raise SystemExit("toast anchor missing")
t = t.replace(anchor, modals, 1)
print("ok modals")

# Script include lists.js before features.js
must_replace(
    '<script src="{{ url_for(\'static\', filename=\'js/features.js\') }}?v=poc32"></script>',
    '<script src="{{ url_for(\'static\', filename=\'js/lists.js\') }}?v=poc32"></script>\n<script src="{{ url_for(\'static\', filename=\'js/features.js\') }}?v=poc32"></script>',
    "lists.js include",
)

# VIEW_META + state vars
must_replace(
    "let tableSelected = {}, colWidths = {};",
    "let tableSelected = {}, colWidths = {}, colCollapsed = {};\nlet clashOn = localStorage.getItem(\"sched-clash\") !== \"off\";\nlet cmIdx = null;\nconst ICO_EXPAND = '<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><polyline points=\"15 3 21 3 21 9\"/><polyline points=\"9 21 3 21 3 15\"/><line x1=\"21\" y1=\"3\" x2=\"14\" y2=\"10\"/><line x1=\"3\" y1=\"21\" x2=\"10\" y2=\"14\"/></svg>';\nconst ICO_COLLAPSE = '<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><polyline points=\"4 14 10 14 10 20\"/><polyline points=\"20 10 14 10 14 4\"/><line x1=\"14\" y1=\"10\" x2=\"21\" y2=\"3\"/><line x1=\"3\" y1=\"21\" x2=\"10\" y2=\"14\"/></svg>';\nconst ICO_PENCIL = '<svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z\"/></svg>';\nfunction colDisplay(g){ return (g.nickname && g.nickname.trim()) ? g.nickname : g.name; }\nfunction parseTimeMin(s){ if(!s) return null; const m=String(s).trim().toLowerCase().match(/^(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?$/); if(!m) return null; let h=parseInt(m[1],10); const min=m[2]?parseInt(m[2],10):0; const ap=m[3]; if(h>23||min>59) return null; if(ap==='pm'&&h<12) h+=12; if(ap==='am'&&h===12) h=0; return h*60+min; }",
    "state vars",
)

must_replace(
    "  table:{t:\"Scheduler\",d:\"Edit weekly timings in table or board view, then save or send selected groups\"},",
    "  table:{t:\"Scheduler\",d:\"Edit weekly timings in table or board view, then save or send selected groups\"},\n  lists:{t:\"Lists\",d:\"Discover contacts from WhatsApp labels and send to whole or selected lists\"},",
    "VIEW_META lists",
)

# showView lists
must_replace(
    "  if (v===\"dashboard\") renderUserDashboard();\n  if (v===\"groups\") renderGroupTable();\n  if (v===\"contacts\") renderContactTable();\n  if (v===\"group-detail\") renderGroupDetail();\n  if (v===\"contact-detail\") renderContactDetail();\n  if (v===\"table\" && tableDirty) { renderTable(); tableDirty = false; }",
    "  if (v===\"dashboard\") renderUserDashboard();\n  if (v===\"groups\") renderGroupTable();\n  if (v===\"contacts\") renderContactTable();\n  if (v===\"group-detail\") renderGroupDetail();\n  if (v===\"contact-detail\") renderContactDetail();\n  if (v===\"lists\" && typeof renderLists===\"function\") renderLists();\n  if (v===\"table\" && tableDirty) { renderTable(); tableDirty = false; }\n  if (v===\"table\" && typeof syncClashBtn===\"function\") syncClashBtn();",
    "showView lists",
)

# boot loadLists
must_replace(
    "  await Promise.all([loadGroups(), loadTemplates(), loadContacts(), loadSettings()]);",
    "  await Promise.all([loadGroups(), loadTemplates(), loadContacts(), loadSettings(), typeof loadLists===\"function\"?loadLists():Promise.resolve()]);",
    "boot loadLists",
)

# Replace renderScheduleGrid and Board + add clash helpers after updateCell
# Find and replace renderScheduleGrid function entirely
import re
grid_pat = re.compile(r"function renderScheduleGrid\(w\)\{[\s\S]*?\nfunction renderScheduleBoard\(w\)\{")
board_pat = re.compile(r"function renderScheduleBoard\(w\)\{[\s\S]*?\nfunction schedDragStart\(e,ci\)\{")

new_grid = r'''function renderScheduleGrid(w){
  let h='<div class="sched-scroll"><table class="sched"><thead><tr><th class="day-col">Day</th>';
  groups.forEach((g,ci)=>{
    const wd=colWidths[ci]?`width:${colWidths[ci]}px`:"";
    const dim=tableSelected[ci]===false;
    const collapsed=colCollapsed[ci]===true;
    const hasNick=!!(g.nickname&&g.nickname.trim());
    h+=`<th class="schcol ${dim?"col-dim-head":""} ${collapsed?"col-collapsed":"col-expanded"}" style="${wd}" ondragover="schedDragOver(event,${ci})" ondrop="schedDrop(event,${ci})" ondragenter="schedDragEnter(event,${ci})" ondragleave="schedDragLeave(event)">
      <div class="ch"><div class="top">
      <span class="drag-handle" draggable="true" title="Drag to reorder" ondragstart="schedDragStart(event,${ci})" ondragend="schedDragEnd(event)">${GRIP_ICO}</span>
      <input type="checkbox" aria-label="Select ${escA(g.name)}" ${dim?"":"checked"} onchange="tableSelected[${ci}]=this.checked;updateSchedSelCount();renderTable()"/>
      <span class="gn-box" title="${escA(g.name)}"><span class="gn-name">${esc(colDisplay(g))}</span>${hasNick?`<span class="gn-full">${esc(g.name)}</span>`:""}</span>
      <button class="col-icn" type="button" title="${collapsed?"Expand column":"Collapse column"}" onclick="toggleColExpand(${ci})">${collapsed?ICO_EXPAND:ICO_COLLAPSE}</button>
      <button class="col-icn" type="button" title="Rename / nickname" onclick="editColMeta(${ci})">${ICO_PENCIL}</button>
      <button class="rc" type="button" title="Remove group" onclick="removeColumn(${ci})">${TRASH_ICO}</button></div></div>
      <div class="resizer" onmousedown="startResize(event,${ci})"></div></th>`;
  });
  h+='</tr></thead><tbody>';
  DAYS.forEach(day=>{
    h+=`<tr><td class="day-col"><span class="day-short">${day.slice(0,3)}</span><span class="day-full">${day}</span></td>`;
    groups.forEach((g,ci)=>{
      const e=g.schedule.find(x=>x.day===day)||{}; const f=e.from||"", tv=e.to||"";
      const dim=tableSelected[ci]===false;
      h+=`<td class="${(f||tv)?'filled ':''}${dim?'col-dim':''}" data-cell="${ci}|${day}"><div class="crange">
        <input class="cell" list="timeOptions" value="${escA(f)}" placeholder="From" ${dim?"disabled":""} aria-label="${escA(g.name)} ${day} from" oninput="updateCell(${ci},'${day}','from',this)"/>
        <span class="dash" aria-hidden="true">–</span>
        <input class="cell" list="timeOptions" value="${escA(tv)}" placeholder="To" ${dim?"disabled":""} aria-label="${escA(g.name)} ${day} to" oninput="updateCell(${ci},'${day}','to',this)"/></div></td>`;
    });
    h+='</tr>';
  });
  w.innerHTML=h+'</tbody></table></div>';
  refreshClashes();
}
function renderScheduleBoard(w){'''

if not grid_pat.search(t):
    raise SystemExit("renderScheduleGrid not found")
t = grid_pat.sub(new_grid, t, count=1)
print("ok grid")

new_board = r'''function renderScheduleBoard(w){
  let h='<div class="sched-board">';
  groups.forEach((g,ci)=>{
    const activeDays=g.schedule.filter(e=>(e.from||"").trim()||(e.to||"").trim()).length;
    const dim=tableSelected[ci]===false;
    const hasNick=!!(g.nickname&&g.nickname.trim());
    h+=`<article class="sb-card${dim?" is-dim":""}" data-gi="${ci}" ondragover="schedDragOver(event,${ci})" ondrop="schedDrop(event,${ci})" ondragenter="schedDragEnter(event,${ci})" ondragleave="schedDragLeave(event)">
      <header class="sb-head">
        <span class="drag-handle" draggable="true" title="Drag to reorder" ondragstart="schedDragStart(event,${ci})" ondragend="schedDragEnd(event)">${GRIP_ICO}</span>
        <label class="sb-check"><input type="checkbox" ${dim?"":"checked"} onchange="tableSelected[${ci}]=this.checked;updateSchedSelCount();renderTable()"/><span class="sr-only">Select</span></label>
        <span class="sb-title"><span class="sb-name" title="${escA(g.name)}">${esc(g.name)}</span>${hasNick?`<span class="sb-nick">${esc(g.nickname)}</span>`:""}</span>
        <button class="col-icn" type="button" title="Rename / nickname" onclick="editColMeta(${ci})">${ICO_PENCIL}</button>
        <span class="sb-meta">${activeDays} day${activeDays===1?"":"s"}</span>
        <button class="rc" type="button" title="Remove group" onclick="removeColumn(${ci})">${TRASH_ICO}</button>
      </header>
      <div class="sb-days">`;
    DAYS.forEach(day=>{
      const e=g.schedule.find(x=>x.day===day)||{}; const f=e.from||"", tv=e.to||"";
      h+=`<div class="sb-day${(f||tv)?" filled":""}" data-cell="${ci}|${day}" data-day="${day}">
        <span class="sb-day-name">${day.slice(0,3)}</span>
        <div class="crange">
          <input class="cell" list="timeOptions" value="${escA(f)}" placeholder="From" ${dim?"disabled":""} aria-label="${escA(g.name)} ${day} from" oninput="updateCell(${ci},'${day}','from',this)"/>
          <span class="dash" aria-hidden="true">–</span>
          <input class="cell" list="timeOptions" value="${escA(tv)}" placeholder="To" ${dim?"disabled":""} aria-label="${escA(g.name)} ${day} to" oninput="updateCell(${ci},'${day}','to',this)"/>
        </div>
      </div>`;
    });
    h+=`</div></article>`;
  });
  w.innerHTML=h+'</div>';
  refreshClashes();
}
function schedDragStart(e,ci){'''

if not board_pat.search(t):
    raise SystemExit("renderScheduleBoard not found")
t = board_pat.sub(new_board, t, count=1)
print("ok board")

# updateCell — add clash refresh
old_uc = """function updateCell(ci,day,field,inp){const g=groups[ci];let e=g.schedule.find(x=>x.day===day);
  if(!e){e={day,from:"",to:""};g.schedule.push(e);} e[field]=inp.value.trim();
  if(!e.from&&!e.to)g.schedule=g.schedule.filter(x=>x.day!==day);
  g.schedule.sort((a,b)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day));
  const cell=inp.closest("td")||inp.closest(".sb-day");
  if(cell) cell.classList.toggle("filled",!!(e.from||e.to));
  const card=inp.closest(".sb-card");
  if(card){
    const n=g.schedule.filter(x=>(x.from||"").trim()||(x.to||"").trim()).length;
    const meta=card.querySelector(".sb-meta");
    if(meta) meta.textContent=`${n} day${n===1?"":"s"}`;
  }
  tableDirty=true;}"""

new_uc = old_uc.replace("  tableDirty=true;}", "  tableDirty=true; if(clashOn) refreshClashes();}") + """
function toggleColExpand(ci){ colCollapsed[ci]=!colCollapsed[ci]; renderTable(); }
function expandAllCols(expand){ groups.forEach((_,ci)=>{ colCollapsed[ci]=!expand; }); renderTable(); }
function editColMeta(ci){ cmIdx=ci; const g=groups[ci]; document.getElementById("cmName").value=g.name||""; document.getElementById("cmNick").value=g.nickname||""; document.getElementById("colMetaModal").classList.add("show"); setTimeout(()=>document.getElementById("cmName").focus(),30); }
function closeColMeta(){ document.getElementById("colMetaModal").classList.remove("show"); }
async function saveColMeta(){ if(cmIdx==null) return; const name=document.getElementById("cmName").value.trim(); if(!name){ toast("Group name is required","err"); return; } groups[cmIdx].name=name; groups[cmIdx].nickname=document.getElementById("cmNick").value.trim(); tableDirty=true; closeColMeta(); if(await saveTable()) toast("Group updated ✓"); else renderTable(); }
function toggleClash(){ clashOn=!clashOn; localStorage.setItem("sched-clash", clashOn?"on":"off"); syncClashBtn(); refreshClashes(); }
function syncClashBtn(){ const b=document.getElementById("clashBtn"); if(b) b.classList.toggle("on", clashOn); }
function computeClashes(){ const cells=new Set(), pairs=[]; DAYS.forEach((day)=>{ const items=[]; groups.forEach((g,ci)=>{ const e=g.schedule.find((x)=>x.day===day); if(!e) return; const a=parseTimeMin(e.from); if(a==null) return; let b=parseTimeMin(e.to); if(b==null||b<=a) b=a+30; items.push({ci,a,b}); }); for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++){ if(items[i].a<items[j].b && items[j].a<items[i].b){ cells.add(items[i].ci+"|"+day); cells.add(items[j].ci+"|"+day); pairs.push({day,a:items[i].ci,b:items[j].ci}); } } }); return {cells,pairs}; }
function refreshClashes(){ syncClashBtn(); document.querySelectorAll("[data-cell].cell-clash").forEach((el)=>el.classList.remove("cell-clash")); const banner=document.getElementById("clashBanner"); if(!clashOn){ if(banner) banner.innerHTML=""; return; } const {cells,pairs}=computeClashes(); cells.forEach((key)=>{ const el=document.querySelector(`[data-cell="${key}"]`); if(el) el.classList.add("cell-clash"); }); if(!banner) return; if(!pairs.length){ banner.innerHTML=`<div class="clash-bar ok"><span class="clash-ico">✓</span><span>No time clashes — every class has a distinct slot.</span></div>`; } else { const lines=pairs.map((p)=>`<span class="clash-pill">${esc(p.day.slice(0,3))}: ${esc(colDisplay(groups[p.a]))} ↔ ${esc(colDisplay(groups[p.b]))}</span>`).join(""); banner.innerHTML=`<div class="clash-bar warn"><span class="clash-ico">⚠</span><div class="clash-body"><b>${pairs.length} time clash${pairs.length===1?"":"es"} detected</b><div class="clash-pills">${lines}</div></div></div>`; } }
function showLog(){ const p=document.getElementById("statusPanel"); p.classList.remove("hidden"); p.classList.remove("collapsed"); syncLogCollapseBtn(); }
function toggleStatusLog(){ const p=document.getElementById("statusPanel"); p.classList.toggle("collapsed"); syncLogCollapseBtn(); }
function clearStatusLog(){ const l=document.getElementById("logLines"); if(l) l.innerHTML=""; toast("Status log cleared"); }
function syncLogCollapseBtn(){ const b=document.getElementById("logCollapseBtn"); if(!b) return; const collapsed=document.getElementById("statusPanel").classList.contains("collapsed"); b.title=collapsed?"Expand log":"Collapse log"; }"""

must_replace(old_uc, new_uc, "updateCell + extras")

# group detail nickname field
must_replace(
    "${gdEdit?`<input class=\"field detail-name-input\" value=\"${escA(g.name)}\" oninput=\"gdSetField('name',this.value)\" placeholder=\"WhatsApp group name\"/>`:`<h2>${esc(g.name||\"Untitled group\")}</h2>`}",
    "${gdEdit?`<input class=\"field detail-name-input\" value=\"${escA(g.name)}\" oninput=\"gdSetField('name',this.value)\" placeholder=\"WhatsApp group name\"/><input class=\"field detail-nick-input\" value=\"${escA(g.nickname||\"\")}\" oninput=\"gdSetField('nickname',this.value)\" placeholder=\"Short nickname for tables (optional)\"/>`:`<h2>${esc(g.name||\"Untitled group\")}</h2>`}",
    "group detail nick",
)

# newGroupDetail include nickname
if "gdWorking = { name: \"\", schedule:" in t or "gdWorking={name:\"\",schedule:" in t:
    t = t.replace(
        "gdWorking={name:\"\",schedule:[],message:\"\",inviteLink:\"\",pic:\"\",waLinked:false,lastReleased:\"\"}",
        "gdWorking={name:\"\",nickname:\"\",schedule:[],message:\"\",inviteLink:\"\",pic:\"\",waLinked:false,lastReleased:\"\"}",
        1,
    )
    print("ok gdWorking")

# contact detail labels - find a good place - optional if complex
# Add labels field in contact save - check contact detail template section later

# Also update shared rail nav
rail = Path(r"D:\SSIES Schedule Automation\templates\user\_rail_nav.html")
rt = rail.read_text(encoding="utf-8")
if 'data-view="lists"' not in rt:
    rt = rt.replace(
        """    <button class="nav-item nav-sub" data-view="table" data-sched="board" onclick="{% if profile_mode %}location.href='/?view=table&sched=board'{% else %}navSched('board'){% endif %}" type="button"><span class="ico"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="18" rx="1.5"/></svg></span><span class="lbl">Board view</span></button>
  </div>
</div>""",
        """    <button class="nav-item nav-sub" data-view="table" data-sched="board" onclick="{% if profile_mode %}location.href='/?view=table&sched=board'{% else %}navSched('board'){% endif %}" type="button"><span class="ico"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="18" rx="1.5"/></svg></span><span class="lbl">Board view</span></button>
    <button class="nav-item nav-sub{% if active_view == 'lists' %} active{% endif %}" data-view="lists" onclick="{% if profile_mode %}location.href='/?view=lists'{% else %}navGo('lists'){% endif %}" type="button"><span class="ico"><svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></span><span class="lbl">Lists</span></button>
  </div>
</div>""",
        1,
    )
    rt = rt.replace(
        "active_view in ('groups','contacts','table','board','group-detail','contact-detail')",
        "active_view in ('groups','contacts','table','board','lists','group-detail','contact-detail')",
    )
    rail.write_text(rt, encoding="utf-8")
    print("ok rail nav")

# Fix duplicate showLog if we added a new one — remove old short showLog
t = t.replace("function showLog(){document.getElementById(\"statusPanel\").classList.remove(\"hidden\");}", "", 1)

p.write_text(t, encoding="utf-8")
print("wrote", p, "len", len(t))
