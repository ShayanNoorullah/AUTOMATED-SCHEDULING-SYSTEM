"""Patch production CSS for navbar full-width, status log, scheduler extras, lists."""
from pathlib import Path

css = Path(r"D:\SSIES Schedule Automation\static\css\app.css")
text = css.read_text(encoding="utf-8")

old = """  html[data-nav=\"navbar\"] .topbar{
    position:static;height:auto;min-height:0;padding:24px 26px 2px;
    background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;border-bottom:none;
    max-width:1260px;width:100%;margin:0 auto;
  }"""
new = """  html[data-nav=\"navbar\"] .topbar{
    position:static;height:auto;min-height:0;padding:24px 34px 2px;
    background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;border-bottom:none;
    max-width:none;width:100%;margin:0;
  }
  html[data-nav=\"navbar\"] .content,
  html[data-nav=\"navbar\"] .page-pad{ max-width:none; margin:0; padding-left:34px; padding-right:34px; }"""
if old not in text:
    raise SystemExit("navbar block not found")
text = text.replace(old, new, 1)

old2 = """.status-log{margin-top:20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm);animation:fadeUp .4s var(--ease);}
.status-log .lh{display:flex;align-items:center;justify-content:space-between;padding:13px 18px;border-bottom:1px solid var(--border);font-weight:700;font-size:.88rem;}
.status-log .lh span span{cursor:pointer;color:var(--text-muted);font-weight:500;}"""
new2 = """.status-log{margin-top:20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm);animation:fadeUp .4s var(--ease);}
.status-log .lh{display:flex;align-items:center;justify-content:space-between;padding:11px 14px 11px 18px;border-bottom:1px solid var(--border);font-weight:700;font-size:.88rem;}
.status-log.collapsed .lh{border-bottom:none;}
.status-log .lh-title{display:inline-flex;align-items:center;gap:9px;}
.status-log .lh-actions{display:flex;align-items:center;gap:6px;}
.log-btn{width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--border);background:var(--surface-2);color:var(--text-muted);border-radius:var(--r-sm);cursor:pointer;transition:all .16s var(--spring);}
.log-btn:hover{color:var(--accent-hover);border-color:var(--accent-ring);background:var(--surface);transform:translateY(-1px);}
.log-btn svg{fill:none;stroke:currentColor;stroke-width:2;}
.log-caret{transition:transform .22s var(--ease);}
.status-log.collapsed .log-caret{transform:rotate(-90deg);}
.status-log.collapsed #logLines{display:none;}"""
if old2 not in text:
    raise SystemExit("status-log block not found")
text = text.replace(old2, new2, 1)

marker = "Scheduler columns / clash / lists (POC parity)"
if marker not in text:
    text += f"""

/* ============ {marker} ============ */
.sched thead .schcol{{vertical-align:top;}}
.sched .gn-box{{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;padding:4px 2px;cursor:default;}}
.sched .gn-name{{font-weight:700;font-size:.86rem;line-height:1.25;}}
.sched .gn-full{{font-size:.72rem;color:var(--text-soft);font-weight:500;}}
.schcol.col-expanded .gn-name{{white-space:normal;overflow-wrap:anywhere;}}
.schcol.col-expanded{{min-width:170px;max-width:280px;}}
.schcol.col-collapsed .gn-name{{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;}}
.schcol.col-collapsed .gn-full{{display:none;}}
.schcol.col-collapsed{{max-width:150px;}}
.col-icn{{width:26px;height:26px;flex-shrink:0;border:none;background:none;color:var(--text-soft);cursor:pointer;border-radius:var(--r-xs);display:grid;place-items:center;transition:all .16s;}}
.col-icn:hover{{color:var(--accent-hover);background:var(--surface-3);}}
.col-icn svg{{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;}}
.sched td.col-dim{{opacity:.5;}}
.sched td.col-dim .cell{{background:var(--surface-2);color:var(--text-soft);cursor:not-allowed;border-style:dashed;}}
.sched th.col-dim-head{{opacity:.62;}}
.sb-title{{display:flex;flex-direction:column;min-width:0;flex:1;gap:1px;}}
.sb-name{{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}}
.sb-nick{{font-size:.72rem;color:var(--text-soft);font-weight:500;}}
.clash-toggle{{gap:6px;}}
.clash-toggle.on{{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent);}}
#clashBanner:empty{{display:none;}}
#clashBanner{{margin:0 0 12px;}}
.clash-bar{{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-radius:var(--r-md);font-size:.88rem;animation:fadeUp .3s var(--ease);}}
.clash-bar.warn{{background:color-mix(in srgb,var(--warn) 13%,transparent);border:1px solid color-mix(in srgb,var(--warn) 34%,transparent);}}
.clash-bar.ok{{background:color-mix(in srgb,var(--success) 11%,transparent);border:1px solid color-mix(in srgb,var(--success) 30%,transparent);}}
.clash-ico{{font-size:1.05rem;flex-shrink:0;line-height:1.3;}}
.clash-bar.warn .clash-ico{{color:var(--warn);}}
.clash-bar.ok .clash-ico{{color:var(--success);}}
.clash-pills{{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;}}
.clash-pill{{font-size:.74rem;font-weight:650;padding:3px 9px;border-radius:var(--r-full);background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--text);}}
.sched td.cell-clash,.sb-day.cell-clash{{outline:2px solid var(--warn);outline-offset:-2px;background:color-mix(in srgb,var(--warn) 15%,transparent) !important;position:relative;}}
.sched td.cell-clash::after{{content:"⚠";position:absolute;top:1px;right:4px;font-size:.68rem;color:var(--warn);pointer-events:none;}}
.list-panel{{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);padding:16px 18px;margin-bottom:16px;animation:fadeUp .4s var(--ease) both;}}
.list-panel-head{{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}}
.list-title{{display:flex;align-items:center;gap:10px;min-width:0;font-size:1.05rem;flex-wrap:wrap;}}
.list-dot{{width:11px;height:11px;border-radius:50%;flex-shrink:0;display:inline-block;}}
.list-actions{{display:flex;gap:6px;flex-wrap:wrap;}}
.list-labelrow{{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:11px 0 14px;}}
.lbl-chip{{font-size:.72rem;font-weight:650;padding:3px 9px;border-radius:var(--r-full);background:var(--accent-soft);color:var(--accent-hover);}}
.lbl-row{{display:flex;gap:4px;flex-wrap:wrap;}}
.list-selcount{{font-weight:650;color:var(--accent-hover);}}
.list-tabs{{margin-bottom:16px;display:flex;gap:6px;flex-wrap:wrap;}}
.lmember-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;}}
.lmember{{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2);}}
.lmember.on{{border-color:var(--accent-ring);background:var(--accent-soft);}}
.lmember input[type=checkbox]{{width:16px;height:16px;accent-color:var(--accent);flex-shrink:0;}}
.lmem-list{{display:flex;flex-direction:column;gap:8px;max-height:54vh;overflow:auto;}}
.lmem-row{{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-md);}}
.lmem-row.on{{border-color:var(--accent-ring);background:var(--accent-soft);}}
.detail-nick-input{{margin-top:8px;max-width:320px;}}
"""

css.write_text(text, encoding="utf-8")
print("patched", css, "bytes", len(text))
