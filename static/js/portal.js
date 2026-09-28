/* Production portal helpers — table UI from POC (no fake store / send) */
function escA(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function showPortalTab(tab) {
  document.querySelectorAll(".portal-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  document.querySelectorAll(".portal-tab-panel").forEach((p) => p.classList.toggle("on", p.id === `ptab-${tab}`));
}

function togglePortalSidebar() {
  if (typeof toggleRail === "function") toggleRail();
  else document.getElementById("shell")?.classList.toggle("rail-open");
}

const _pt = {};
const PT_SEARCH_ICO =
  '<svg class="search-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

function ptVal(row, k) {
  return typeof k === "function" ? k(row) : row[k];
}
function portalTable(cfg) {
  const st = Object.assign({ page: 1, q: "", filter: {}, perPage: 8 }, cfg);
  st.modes = cfg.modes || null;
  st.mode = (cfg.modeKey && localStorage.getItem(cfg.modeKey)) || (st.modes ? st.modes[0] : "table");
  (cfg.filters || []).forEach((f) => {
    if (f.default !== undefined) st.filter[f.key] = f.default;
  });
  _pt[cfg.id] = st;
  ptRender(cfg.id);
  return st;
}
function ptRefresh(id) {
  if (_pt[id]) ptRenderBody(id);
}
function ptSearch(id, v) {
  const st = _pt[id];
  if (!st) return;
  st.q = v;
  st.page = 1;
  ptRenderBody(id);
}
function ptFilter(id, key, v) {
  const st = _pt[id];
  if (!st) return;
  st.filter[key] = v;
  st.page = 1;
  ptRenderBody(id);
}
function ptSetMode(id, m) {
  const st = _pt[id];
  if (!st) return;
  st.mode = m;
  if (st.modeKey) {
    try {
      localStorage.setItem(st.modeKey, m);
    } catch (e) {}
  }
  const mount = document.getElementById(st.mount);
  if (mount)
    mount.querySelectorAll(".pt-modeseg button").forEach((b) =>
      b.classList.toggle("on", b.textContent.trim().toLowerCase() === m)
    );
  ptRenderBody(id);
}
function ptGoto(id, p) {
  const st = _pt[id];
  if (!st) return;
  st.page = p;
  ptRenderBody(id);
  const el = document.getElementById(st.mount);
  if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function ptFiltered(st) {
  let rows = (st.getRows() || []).slice();
  (st.filters || []).forEach((f) => {
    const v = st.filter[f.key];
    if (v) rows = rows.filter((r) => f.match(r, v));
  });
  const q = (st.q || "").trim().toLowerCase();
  if (q)
    rows = rows.filter((r) =>
      (st.searchKeys || []).some((k) => String(ptVal(r, k) || "").toLowerCase().includes(q))
    );
  if (st.sort) rows.sort(st.sort);
  return rows;
}
function ptRender(id) {
  const st = _pt[id];
  if (!st) return;
  const mount = document.getElementById(st.mount);
  if (!mount) return;
  if (st.bare) {
    mount.innerHTML = `<div class="pt-bodyhost"></div>`;
    ptRenderBody(id);
    return;
  }
  const filtersHtml = (st.filters || [])
    .map(
      (f) =>
        `<select class="field pt-filter" onchange="ptFilter('${id}','${f.key}',this.value)">${f.options
          .map(
            (o) =>
              `<option value="${escA(o.val)}" ${st.filter[f.key] === o.val ? "selected" : ""}>${esc(o.label)}</option>`
          )
          .join("")}</select>`
    )
    .join("");
  const modesHtml = st.modes
    ? `<div class="seg pt-modeseg">${st.modes
        .map(
          (m) =>
            `<button class="${st.mode === m ? "on" : ""}" onclick="ptSetMode('${id}','${m}')">${
              m[0].toUpperCase() + m.slice(1)
            }</button>`
        )
        .join("")}</div>`
    : "";
  const toolbar = `<div class="toolbar list-toolbar pt-toolbar">
    <div class="search-wrap pt-search">${PT_SEARCH_ICO}<input class="field search" value="${escA(st.q)}" placeholder="${escA(
    st.searchPlaceholder || "Search…"
  )}" oninput="ptSearch('${id}',this.value)"/></div>
    ${filtersHtml}
    ${st.toolbarExtra || ""}
    ${modesHtml}
  </div>`;
  mount.innerHTML = toolbar + `<div class="pt-bodyhost"></div>`;
  ptRenderBody(id);
}
function ptRenderBody(id) {
  const st = _pt[id];
  if (!st) return;
  const mount = document.getElementById(st.mount);
  if (!mount) return;
  const host = mount.querySelector(".pt-bodyhost");
  if (!host) {
    ptRender(id);
    return;
  }
  const rows = ptFiltered(st);
  const total = rows.length,
    per = st.perPage,
    pages = Math.max(1, Math.ceil(total / per));
  if (st.page > pages) st.page = pages;
  const start = (st.page - 1) * per,
    pageRows = rows.slice(start, start + per);

  let body;
  if (!pageRows.length) {
    body = `<div class="tbl-wrap"><div class="empty"><div class="empty-ico">${
      st.emptyIco || "🔍"
    }</div><p>${esc(
      total === 0 && !st.q && !Object.values(st.filter).some(Boolean)
        ? st.emptyText || "Nothing here yet"
        : "No matches for your search/filters"
    )}</p></div></div>`;
  } else if (st.mode === "board" && st.boardCard) {
    body = `<div class="card-grid">${pageRows.map((r) => st.boardCard(r)).join("")}</div>`;
  } else {
    body = `<div class="tbl-wrap"><table class="data grid-table"><thead><tr>${st.columns
      .map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ""}>${esc(c.label)}</th>`)
      .join("")}</tr></thead><tbody>${pageRows
      .map(
        (r) =>
          `<tr${st.rowClick ? ` class="pt-clickable" onclick="${st.rowClick(r)}"` : ""}>${st.columns
            .map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ""}>${c.render(r)}</td>`)
            .join("")}</tr>`
      )
      .join("")}</tbody></table></div>`;
  }

  let pager = "";
  if (pages > 1) {
    let btns = `<button class="pager-btn" ${st.page === 1 ? "disabled" : ""} onclick="ptGoto('${id}',${
      st.page - 1
    })">‹</button>`;
    const win = ptPageWindow(st.page, pages);
    win.forEach((p) => {
      btns +=
        p === "…"
          ? `<span class="pager-gap">…</span>`
          : `<button class="pager-btn${p === st.page ? " on" : ""}" onclick="ptGoto('${id}',${p})">${p}</button>`;
    });
    btns += `<button class="pager-btn" ${st.page === pages ? "disabled" : ""} onclick="ptGoto('${id}',${
      st.page + 1
    })">›</button>`;
    pager = `<div class="pager"><span class="pager-info">Showing ${start + 1}–${Math.min(
      start + per,
      total
    )} of ${total}</span><div class="pager-btns">${btns}</div></div>`;
  } else if (total) {
    pager = `<div class="pager"><span class="pager-info">${total} item${total === 1 ? "" : "s"}</span></div>`;
  }
  host.innerHTML = body + pager;
}
function ptPageWindow(cur, pages) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || (p >= cur - 1 && p <= cur + 1)) out.push(p);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}
