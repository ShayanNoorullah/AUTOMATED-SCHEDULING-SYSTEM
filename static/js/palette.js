/* Command palette (Ctrl/Cmd+K) and global keyboard shortcuts.
   Uses the inline script's globals: VIEW_META, groups, contacts, templates, navGo, … */
let cmdkAll = [], cmdkShown = [], cmdkSel = 0;

function paletteItems() {
  const items = [];
  const add = (label, hint, run) => items.push({ label, hint, run });
  add("New group", "Action", () => { navGo("groups"); newGroupDetail(); });
  add("New contact", "Action", () => { navGo("contacts"); newContactDetail(); });
  add("New template", "Action", () => { navGo("templates"); newTemplate(); });
  add("Save schedule", "Action", () => saveTable());
  add("Schedule history — earlier versions", "Action", () => openVersions());
  add("Open Visual Editor", "Action", () => { navSched(getScheduleView()); openVisualEditor(); });
  add("Notify a group (cancel / reschedule)", "Action", () => openBroadcast());
  add("Ask the assistant", "Action", () => openAssistant());
  add("Toggle light / dark theme", "Action", () => quickToggleTheme());
  add("Keyboard shortcuts", "Help", () => showShortcuts());
  Object.entries(VIEW_META).forEach(([k, m]) => { if (!k.endsWith("-detail")) add(m.t, "Go to", () => (k === "table" ? navSched(getScheduleView()) : navGo(k))); });
  add("Profile", "Go to", () => { location.href = "/profile"; });
  add("Notifications", "Go to", () => { location.href = "/notifications"; });
  groups.forEach((g, i) => add(g.name, "Group", () => openGroupDetail(i)));
  contacts.forEach((c, i) => add(c.name, "Contact", () => openContactDetail(i)));
  templates.forEach((t, i) => add(t.name, "Template", () => { navGo("templates"); editTemplate(i); }));
  if (typeof lists !== "undefined") lists.forEach((l) => add(l.name, "List", () => { navGo("lists"); setListActive(l.id); }));
  return items;
}

function renderPalette() {
  const d = document.getElementById("cmdk"), q = d.querySelector("input").value.trim();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  // every word must appear; names containing the query as typed come first
  const whole = (it) => (it.label.toLowerCase().includes(q.toLowerCase()) ? 0 : 1);
  cmdkShown = cmdkAll.filter((it) => { const hay = (it.label + " " + it.hint).toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => whole(a) - whole(b)).slice(0, 40);
  if (q) cmdkShown.push({ label: `Ask the assistant: “${q}”`, hint: "Assistant", run: () => openAssistant(q) });
  cmdkSel = Math.max(0, Math.min(cmdkSel, cmdkShown.length - 1));
  const list = d.querySelector(".cmdk-list");
  list.innerHTML = cmdkShown.map((it, i) => `<div class="cmdk-item${i === cmdkSel ? " on" : ""}" role="option" aria-selected="${i === cmdkSel}" data-i="${i}"><span>${esc(it.label)}</span><i>${esc(it.hint)}</i></div>`).join("")
    || '<p class="hint" style="margin:14px 16px">Nothing matches.</p>';
  list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
}
function runPalette(i) {
  const it = cmdkShown[i]; if (!it) return;
  closeDialog(document.getElementById("cmdk"));
  it.run();
}
function openPalette() {
  let d = document.getElementById("cmdk");
  if (!d) {
    d = document.createElement("dialog"); d.id = "cmdk"; d.className = "cmdk";
    d.innerHTML = `<input class="cmdk-in" placeholder="Search groups, contacts, pages and actions…" autocomplete="off" aria-label="Search and commands"/>
      <div class="cmdk-list" role="listbox"></div>
      <div class="cmdk-foot"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close</div>`;
    document.body.appendChild(d);
    const inp = d.querySelector("input");
    inp.oninput = () => { cmdkSel = 0; renderPalette(); };
    inp.onkeydown = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); cmdkSel += e.key === "ArrowDown" ? 1 : -1; if (cmdkSel < 0) cmdkSel = cmdkShown.length - 1; if (cmdkSel >= cmdkShown.length) cmdkSel = 0; renderPalette(); }
      else if (e.key === "Enter") { e.preventDefault(); runPalette(cmdkSel); }
    };
    d.onclick = (e) => { if (e.target === d) { closeDialog(d); return; } const it = e.target.closest("[data-i]"); if (it) runPalette(+it.dataset.i); };
  }
  if (d.open) return;
  cmdkAll = paletteItems(); cmdkSel = 0; d.querySelector("input").value = "";
  d.showModal(); renderPalette();
}

function showShortcuts() {
  alertDialog([
    "Ctrl+K — search and commands",
    "/ — search this page",
    "n — new item on this page",
    "g then d / w / g / c / s / l / t / h / a — go to Dashboard, Workspace, Groups, Contacts, Scheduler, Lists, Templates, History, Automated send",
    "",
    "In the Scheduler:",
    "Enter — next day · Ctrl+D — copy to next day",
    "Ctrl+←/→ — switch group · Ctrl+Del — clear · Ctrl+S — save",
  ].join("\n"), { ok: "Got it" });
}

(function () {
  const GO = { d: "dashboard", w: "workspace", g: "groups", c: "contacts", s: "table", l: "lists", t: "templates", h: "history", a: "wa-auto" };
  const NEW = { groups: () => newGroupDetail(), contacts: () => newContactDetail(), templates: () => newTemplate(), lists: () => newList(), table: () => addColumn() };
  let gAt = 0;
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    // single-key shortcuts: never while typing, in a dialog, or with the Visual Editor open
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog:modal, .ve-overlay.open") ||
        (e.target.closest && e.target.closest("input,textarea,select,[contenteditable]"))) return;
    const k = e.key.toLowerCase();
    if (gAt && Date.now() - gAt < 1200) {
      gAt = 0;
      if (GO[k]) { e.preventDefault(); GO[k] === "table" ? navSched(getScheduleView()) : navGo(GO[k]); }
      return;
    }
    const view = (document.querySelector(".view.active")?.id || "").slice(5);
    if (k === "g") gAt = Date.now();
    else if (e.key === "?") showShortcuts();
    else if (e.key === "/") { const s = document.querySelector(".view.active input.search, .view.active input.wa-search"); if (s) { e.preventDefault(); s.focus(); } }
    else if (k === "n" && NEW[view]) { e.preventDefault(); NEW[view](); }
  });
})();
