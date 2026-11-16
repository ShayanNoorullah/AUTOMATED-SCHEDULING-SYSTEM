/* Contacts helpers: phone number check in the editor, and bulk import.
   Uses the inline script's globals: contacts, cdWorking, cdSetField, loadContacts, post. */

/* The country code this account mostly uses (first two digits of saved numbers), or "". */
function usualCountryCode() {
  const count = {};
  contacts.forEach((c) => { const p = String(c.phone || ""); if (p.length >= 10 && p[0] !== "0") count[p.slice(0, 2)] = (count[p.slice(0, 2)] || 0) + 1; });
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 2 ? top[0] : "";
}
/* Check a digits-only number. Returns {ok, msg, fix} — fix is a corrected number to offer. */
function checkPhone(digits) {
  const cc = usualCountryCode();
  if (!digits) return { ok: false, msg: "Country code first, digits only — for example 923001234567." };
  if (digits.startsWith("00")) return { ok: false, msg: "Leave out the leading 00.", fix: digits.slice(2) };
  if (digits.startsWith("0")) return { ok: false, msg: "This starts with 0, so it looks like a local number. It needs the country code instead of the 0.", fix: cc ? cc + digits.slice(1) : "" };
  if (digits.length < 8) return { ok: false, msg: "That is too short to be a full number." };
  if (digits.length > 15) return { ok: false, msg: "That is too long — phone numbers have at most 15 digits." };
  return { ok: true, msg: `Will be sent to +${digits}` };
}
function cdPhoneHint() {
  const el = document.getElementById("cdPhoneHint"); if (!el) return;
  const r = checkPhone(String(cdWorking.phone || ""));
  el.className = "hint phone-hint " + (r.ok ? "ok" : "warn");
  el.textContent = (r.ok ? "✓ " : "") + r.msg + " ";
  if (r.fix) {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip-btn"; b.textContent = `Use ${r.fix}`;
    b.onclick = () => { document.getElementById("cdPhone").value = r.fix; cdSetField("phone", r.fix); };
    el.appendChild(b);
  }
}

/* ── import: paste or upload "name, number" lines ── */
/* Parse pasted text into contacts. One per line; the number is the field with 8+ digits,
   the name is whatever else is on the line. Returns {rows, dupes, bad}. */
function parseContactLines(text) {
  const have = new Set(contacts.map((c) => String(c.phone || ""))), rows = [], seen = new Set();
  let dupes = 0, bad = 0;
  String(text || "").split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const pi = parts.findIndex((p) => p.replace(/\D/g, "").length >= 8 && !/[a-z]{3,}/i.test(p));
    if (pi < 0) { if (!/name|phone|number/i.test(line)) bad++; return; }   // a header row is not an error
    let phone = parts[pi].replace(/\D/g, "");
    const chk = checkPhone(phone);
    if (!chk.ok && chk.fix) phone = chk.fix;
    if (!checkPhone(phone).ok) { bad++; return; }
    if (have.has(phone) || seen.has(phone)) { dupes++; return; }
    seen.add(phone);
    rows.push({ name: parts.filter((_, i) => i !== pi).join(" ").trim() || phone, phone });
  });
  return { rows, dupes, bad };
}
function openContactImport() {
  let d = document.getElementById("contactImportModal");
  if (!d) {
    d = document.createElement("dialog"); d.id = "contactImportModal"; d.className = "modal-scrim";
    d.innerHTML = `<div class="modal modal-lg">
      <div class="modal-h"><span>Import contacts</span><button class="modal-x" type="button" onclick="closeModal('contactImportModal')">✕</button></div>
      <div class="modal-b">
        <p class="hint" style="margin:0">One contact per line: a name and a number, separated by a comma or a tab. Paste from a spreadsheet, or choose a .csv / .txt file. Numbers already saved are skipped.</p>
        <textarea class="field" id="ciText" style="min-height:190px;font-family:ui-monospace,monospace;font-size:.84rem" placeholder="Ali Khan, 923001234567&#10;Sara Ahmed, 0300 7654321" oninput="contactImportPreview()"></textarea>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="btn btn-soft btn-sm" type="button" onclick="document.getElementById('ciFile').click()">Choose file…</button>
          <input type="file" id="ciFile" accept=".csv,.txt,text/csv,text/plain" hidden onchange="contactImportFile(this)"/>
          <span class="hint" id="ciSummary" style="margin:0"></span>
        </div>
      </div>
      <div class="modal-f"><button class="btn btn-soft" type="button" onclick="closeModal('contactImportModal')">Cancel</button><button class="btn btn-primary" type="button" id="ciGo" onclick="contactImportRun()" disabled>Import</button></div></div>`;
    document.body.appendChild(d);
  }
  document.getElementById("ciText").value = ""; contactImportPreview();
  openModal("contactImportModal");
}
async function contactImportFile(input) {
  const f = input.files[0]; input.value = ""; if (!f) return;
  document.getElementById("ciText").value = await f.text(); contactImportPreview();
}
function contactImportPreview() {
  const { rows, dupes, bad } = parseContactLines(document.getElementById("ciText").value);
  const bits = [`${rows.length} contact${rows.length === 1 ? "" : "s"} ready`];
  if (dupes) bits.push(`${dupes} already saved`);
  if (bad) bits.push(`${bad} line${bad === 1 ? "" : "s"} could not be read`);
  document.getElementById("ciSummary").textContent = document.getElementById("ciText").value.trim() ? bits.join(" · ") : "";
  const go = document.getElementById("ciGo"); go.disabled = !rows.length; go.textContent = rows.length ? `Import ${rows.length}` : "Import";
}
async function contactImportRun() {
  const { rows } = parseContactLines(document.getElementById("ciText").value);
  const go = document.getElementById("ciGo"); go.disabled = true;
  let done = 0, failed = 0;
  for (const r of rows) {
    go.textContent = `Importing ${done + failed + 1} of ${rows.length}…`;
    try { const res = await fetch("/api/contacts", post({ name: r.name, phone: r.phone, message: "" })); res.ok ? done++ : failed++; } catch { failed++; }
  }
  closeModal("contactImportModal"); await loadContacts();
  toast(`Imported ${done} contact${done === 1 ? "" : "s"}${failed ? ` — ${failed} failed` : ""}`, failed ? "err" : "ok");
}
