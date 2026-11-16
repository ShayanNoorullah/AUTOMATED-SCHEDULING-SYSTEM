# User Portal — UI/UX and Feature Plan

Audit date: 2026-11-16. Scope: everything under `templates/user/` plus the CSS/JS it loads.

**Status (2026-11-16):** Phases 1–5 are deployed (commit `d070de4`). Phase 6 is
implemented, not yet deployed. The assistant has never talked to a real model provider —
see "Before first use" below.

- **Phase 6** — done:
  - One-off changes and holidays: a class cancelled, moved or added for one date, or a day
    off for every group. The weekly timetable is not edited. Class reminders, the
    dashboard's Today list and the calendar link follow them. Added from the Scheduler
    ("One-off changes" bar) or from an assistant notice ("Record for today").
  - Calendar link: a private address (Settings → Data, or per group) that Google, Apple
    and Outlook Calendar can subscribe to. No stored token: it is derived from the app's
    secret key, so it cannot be revoked for one user alone.
  - Installable app: web manifest, icons and a service worker that caches static files
    only (pages and data always come from the network).
  - Reminders: each one is recorded in the database before it is sent, so a restart never
    repeats it, and one missed by up to 5 minutes is still sent.
- **Phase 6 — not done:** tracking who acknowledged a message; weekly schedule messages
  do not mention one-off changes or holidays.
- **Deploy note for Phase 6:** two tables are created on startup (`schedule_exceptions`,
  `reminder_log`). Deploy when no class reminder went out in the previous 5 minutes: the
  new log starts empty, so such a reminder would be sent once more.

- **Phase 5** — done:
  - Settings: weekly send is set as a local weekday and time (stored as UTC as before);
    reminder timezone is a picker that marks this device's zone; a search box filters every
    tab; restoring a backup first says what the file holds; the duplicate "Compact mode
    (legacy)" row and the stale Selenium wording are gone.
  - Send History: rows grouped by day, failure reason shown under failed sends, From/To
    date filter, CSV export of the rows shown; dashboard activity bars open that day.
  - Fix: history timestamps were sent without a UTC marker, so browsers displayed them
    shifted by the viewer's UTC offset. The API now sends them with `Z`.
  - Automated Send: the Connect step turns green and announces when WhatsApp links; the
    target list has Select all / None, a count and a per-recipient message preview, and
    recipients with nothing to send cannot be picked.
  - Contacts: phone check with a one-click fix for local numbers; Import (paste or
    .csv/.txt) with a preview that skips numbers already saved.
  - Lists: a sync reports new lists and members added / removed.
  - Templates: pin to the top (per browser); "Used by N groups".
- **Phase 5 — not done:** Settings vertical tabs, live preview pane and theme reveal;
  History chart and infinite scroll; QR countdown ring, pause/cancel during a send; contact
  avatar crop and multi-select; drag between lists and emoji picker; template card hover
  actions.

- **Phase 3** — done: command palette (Ctrl+K) over pages, groups, contacts, templates,
  lists and actions; single-key shortcuts (`/`, `n`, `g` then a letter, `?`); schedule
  versions (saved server-side before every change, newest 30 kept, History button in the
  Scheduler with a before/after view and Restore).
- **Phase 4** — done: Scheduler Assistant by text, voice (browser speech recognition) and
  photo. `POST /api/assistant` returns validated proposals only; the browser shows a
  before/after card with clash warnings; Apply uses the normal save, Undo restores the
  version recorded just before it. One-off requests become a prefilled notice the user
  reviews and sends. Settings → Automation holds provider address, model and key (admins
  only, key stored encrypted). Rate limit: 12 per minute, 150 per day per address.
- **Phase 4 — not done:** messaging the assistant from WhatsApp.
- **Before first use:** an admin enters a provider address, model name and API key and
  presses "Save & test". The request format is the OpenAI-compatible one, checked only
  against a fake provider in `tests/test_assistant.py`.

- **Phase 1** — done: foundation items 1, 2, 4, 5, 6 and the nav half of 11. Changed from
  the plan: item 3 uses view transitions with per-row names instead of a hand-written keyed
  reconciler. Still open: Profile and Notifications as in-app views (second half of item 11).
- **Phase 2** — done:
  - Dashboard: instant repaint from cached history, Today timeline with Now / "in 42 min"
    and a Notify shortcut, week-over-week trend, animated activity bars with counts, setup
    checklist, failed-sends banner.
  - Scheduler: today's row marked, unsaved-changes dot on Save plus a leave warning,
    keyboard navigation (Enter, Ctrl+arrows, Ctrl+D copy down, Ctrl+Del clear, Ctrl+S save),
    automatic end time from the group's usual class length, click a clash to jump to it.
  - Group editor: copy first day to weekdays / every day, set length 1h / 1.5h / 2h,
    automatic end time, token buttons and character count, WhatsApp group name picker,
    discard-changes guard.
  - Fix: saving the schedule no longer recreates every group, so photos, the WhatsApp-linked
    flag and ids survive a save (`_sync_groups`, checked by `tests/test_group_sync.py`).
- **Phase 2 — not done** (still listed in section 3): Groups multi-select bar, inline rename
  and drag-reorder in the Groups list; Scheduler drag-a-slot, fill handle, toolbar overflow
  menu, board day-lanes, notes slide-over; Dashboard click-a-bar-to-filter-history.

## 1. Where the portal stands

The portal is not starting from zero. It already has a token-based design system
(`static/css/app.css`: accent, surfaces, radius, shadows, easing), light/dark/system theme,
custom accent, density, font size, radius, 16 keyframe animations, animated counters, a
sparkline, a drag-and-drop scheduler, the Visual Editor and a widget Workspace.

So the plan is **not a redesign or a framework rewrite**. The gaps are specific:

| Gap | Evidence | Effect on the user |
|---|---|---|
| Almost no loading states | 4 skeleton/spinner references in all CSS+JS; views show "Loading…" text or nothing | Screens pop in; the app feels slower than it is |
| View change is a hard swap | `showView()` toggles `.active`; one `viewIn` fade for every screen | No sense of place or direction |
| Lists re-render wholesale | 69 `innerHTML =` assignments in `index.html` | Rows flash, scroll and focus are lost, nothing can animate in/out |
| Native browser dialogs | 16 `confirm()/alert()/prompt()` calls | Breaks the visual language, blocks the page, unstyled on mobile |
| No keyboard layer | Shortcuts exist only inside the Visual Editor | Power use is mouse-only |
| No global search | Each screen has its own search box | Finding a group means navigating first |
| No undo outside the VE | Delete/clear are confirm-then-gone | Users hesitate; mistakes are permanent |
| Profile and Notifications are separate page loads | `/profile`, `/notifications` render full pages | Breaks the single-page feel, loses state |
| Navigation is duplicated and drifting | Rail in `index.html` has Workspace but no Notifications; `_rail_nav.html` has Notifications but no Workspace; mobile tab bar has no Dashboard | Different menus on different pages |
| Technical wording leaks into settings | "Hour (UTC)", "timezone (minutes ahead of UTC)", "Automated uses Selenium" | Users must do arithmetic; copy is out of date |
| Theme leaks | 43 hard-coded hex colours in `app.css` | Odd colours with custom accents / dark mode |
| Not installable | No manifest or service worker | No home-screen app, no offline shell |
| Accessibility is thin | `aria-live` only on the toast; modals are `div`s without focus trap | Keyboard and screen-reader users get stuck |

## 2. Foundation work (do this first — every screen inherits it)

All of this is CSS and browser-native. **No new dependencies.**

1. **View transitions.** Wrap the body of `showView()` in `document.startViewTransition()`
   (falls back to the current instant swap where unsupported). Give the page title, the
   active nav pill and a clicked card a `view-transition-name` so a group card *morphs* into
   its detail page and back. Direction-aware slide for list → detail, fade for sibling views.
2. **Skeletons.** One `.skel` class reusing the existing `shimmer` keyframe, plus three
   shapes (row, card, stat). Every view renders skeletons immediately, then swaps in data.
3. **Keyed list updates.** One small helper that reconciles rows by key instead of replacing
   `innerHTML`, so adding, removing and reordering rows can animate and scroll/focus survive.
   Apply to groups, contacts, templates, history, lists.
4. **One dialog system.** Replace the 8 `div.modal-scrim` modals and all 16 native
   `confirm/alert/prompt` calls with native `<dialog>` + one `confirmDialog()` /
   `promptDialog()` helper. Free focus trap, Esc to close, backdrop. On phones they become
   bottom sheets (CSS only). The VE already uses `<dialog>` — same pattern, and remember the
   known gotcha: close every open dialog before hiding its container.
5. **Toasts with actions.** Merge the two `toast()` copies (`api.js`, `chrome.js`) into one
   that stacks and accepts an action button. This is what makes **Undo** possible everywhere.
6. **Undo instead of "Are you sure?".** Delete group/contact/template/list → remove
   immediately, show "Deleted · Undo" for 6 seconds, commit on timeout.
7. **Command palette (Ctrl/Cmd+K).** One `<dialog>` with a filter box over: every view,
   every group, contact, template and list, and actions (New group, Send selected, Toggle
   theme, Open Visual Editor). Also the entry point for the assistant (section 5).
8. **Keyboard shortcuts.** `g d / g s / g h` navigation, `n` new, `/` focus search,
   `Ctrl+S` save, `?` shortcut sheet.
9. **Micro-interactions.** Press-scale on buttons, sliding indicator on every `.seg`
   segmented control and the settings tabs, success tick morph on Save buttons, number
   tick-up on all stats (reuse `animateCounters`), checkbox/toggle spring.
10. **Scroll-driven polish.** Topbar condenses and gains a shadow on scroll; staggered
    entrance for card grids (CSS `animation-delay` by index, capped at ~10 items).
11. **One nav source.** Make `index.html` include `_rail_nav.html` (add Workspace to it), and
    turn Profile and Notifications into in-app views so there is one shell.
12. **Accessibility pass.** `aria-live` region for send progress, visible focus rings,
    `aria-current` on nav, labels on icon-only buttons, 44px touch targets. The existing
    `prefers-reduced-motion` block and the "Animated transitions" setting already cover
    motion opt-out — route all new motion through them.
13. **Token cleanup.** Replace the 43 hard-coded hex values with tokens; normalise the two
    media-query styles.
14. **Installable app (PWA).** Manifest + a ~30-line service worker that caches the static
    shell. Gives a home-screen icon and instant repeat loads.

## 3. Screen by screen

### Shell (rail, topbar, mobile tab bar)
- Active nav item: one pill that *slides* between items instead of each item lighting up.
- Collapsed rail: tooltips on hover; submenu opens as a flyout.
- Topbar: add global search/command button, a live WhatsApp session dot (green/amber/red)
  and the notification bell with unread count. Breadcrumb for detail pages
  (Groups › O'Level CS).
- Mobile tab bar: add Dashboard, a raised centre "Send" action, haptic-style press feedback,
  hide on scroll down / show on scroll up.
- Status log: becomes a dockable drawer with a progress bar and per-recipient rows
  (queued → sending → delivered/failed) instead of plain text lines.

### Dashboard
- Skeleton first paint; cache `/api/release-history` so revisits are instant.
- Stat cards: trend arrow vs last week, tiny inline sparkline, hover lift.
- "Today" becomes a **timeline** with a live "now" marker and a countdown to the next class
  ("O'Level CS starts in 42 min"), plus one-tap "Send reminder" / "Notify cancel".
- Weekly activity: bars grow in on load, hover tooltip with counts, click a bar → History
  filtered to that day.
- Setup checklist for new accounts (link WhatsApp → add group → set schedule → first send)
  with a progress ring; disappears when complete.
- Failed sends surface as an actionable banner with "Retry all".

### Workspace
- Drag to reorder and resize widgets with a live placeholder and smooth reflow (FLIP).
- "Add widget" becomes a gallery with previews instead of a text menu.
- Layout presets (Morning check, Send day) and autosave with a "Saved" tick, replacing the
  manual Save / Save as buttons.

### Groups (list, cards, detail/editor)
- Card → detail shared-element transition; rows animate in/out on add/delete.
- Multi-select with a floating bulk-action bar (send, duplicate, delete, add to list).
- Inline rename on double-click; drag to reorder.
- Editor: replace the two free-text time inputs with a **time-range control** (typed entry
  still works, plus quick chips: 1h, 1.5h, 2h, "same as Monday"); "copy to weekdays".
- Group-name check: animated state (checking → found / not found) and a searchable picker
  instead of the hidden `<select>` behind "Fetch WA".
- Message panel: WhatsApp-style bubble preview with real formatting, character count,
  variable chips (`{date}`, `{weekday}`) you click to insert, split view on desktop.
- Sticky action bar with unsaved-changes indicator and autosave draft.

### Scheduler — Table and Board
- Sticky first column and header with scroll shadows; "now" highlight on today's row.
- Keyboard grid navigation (arrows, Enter to edit, Delete to clear, Ctrl+C/V to copy a slot).
- Drag a filled slot to another day or group; fill-handle to copy down a column.
- Clashes: conflicting cells pulse once and link to each other; clicking the banner scrolls
  to the pair; "Accept" animates the warning away.
- Selection count becomes a floating bar: "3 groups selected · Send · Notify · Clear".
- Toolbar: group the 10 buttons into primary (Send selected, Save) and an overflow menu;
  unsaved-changes dot on Save; autosave option.
- Board: drag cards between day lanes; lane headers show total hours.
- Notes: slide-over panel with autosave indicator rather than a bar under the table.

### Visual Editor
- Already the strongest screen. Add: snap guides and a ghost preview while dragging,
  magnetic resize, redo (Ctrl+Shift+Z) alongside the existing undo, pinch/scroll zoom of the
  time axis, mini-map for wide weeks, a touch mode with larger handles, and an animated
  transition when switching between its five views.

### Contacts
- Same list/card/bulk/undo treatment as Groups.
- Phone field: country picker and live formatting/validation (replaces the
  "no +, no spaces" instructions); paste-to-import several numbers; CSV import.
- Avatar upload with drag-and-drop and crop preview.

### Lists
- Drag contacts/groups between lists; colour and emoji picker for a list.
- Sync from WhatsApp shows a progress state and a "what changed" summary
  (added 3, removed 1) instead of a silent refresh.

### Templates
- Card hover reveals actions; live WhatsApp bubble preview on each card.
- Editor: variable chips, emoji picker, formatting toolbar, side-by-side preview,
  "Used by N groups", duplicate, favourite/pin.

### Open in WhatsApp
- Rows show link state (ready / missing invite link) with an inline "add link" fix.
- "Copied" confirmation animates on the row; a guided "send to next" queue walks through
  the list one at a time.

### Automated Send
- Turn the three cards into a real **stepper** (Connect → Choose → Review → Send) with
  animated progress between steps.
- QR: countdown ring showing time until refresh, auto-advance when the phone links,
  clear error states with the fix next to them.
- Review step: exact message preview per recipient before sending.
- Send: live per-recipient progress, pause/cancel, completion summary with "Retry failed".

### Send History
- Timeline grouped by day; expandable rows showing the message sent and the failure reason.
- Date-range filter, per-group filter, CSV export; delivery-rate chart above the table.
- Infinite scroll in place of the pager; "Retry" inline with optimistic status.

### Settings
- Vertical tabs on desktop, searchable ("type to find a setting").
- Appearance: a **live preview pane** so theme/accent/radius/density changes are visible
  without leaving the page; theme change animates as a circular reveal from the toggle.
- Automation: replace "Hour (UTC)" + minute + day with a local-time picker, and replace the
  "minutes ahead of UTC" number with a timezone dropdown that auto-detects the browser zone.
  The server keeps storing UTC/offset; only the input changes.
- Every toggle saves with an inline "Saved" tick; drop the separate Save buttons.
- Remove "Compact mode (legacy)" (duplicate of density) and fix the stale "uses Selenium"
  text.
- Data: restore shows a diff summary ("12 groups, 40 contacts will be replaced") before
  applying.

### Profile and Notifications
- Become in-app views (no full reload).
- Notifications: slide-over panel from the bell, grouped Today / Earlier, swipe or click to
  mark read, live unread badge.
- Profile: avatar crop, password-strength meter, passkey cards with device icons.

## 4. Feature suggestions (ranked by value for effort)

1. **Scheduler Assistant** — chat by text, voice or image. Detailed in section 5.
2. **Command palette + global search** (section 2.7). Biggest daily time saver after the
   assistant, and pure front-end.
3. **One-off exceptions.** "This week only" changes (cancelled, moved, extra class) that
   overlay the weekly pattern and expire automatically, so the base schedule is never edited
   for a one-time change. Today the only tool is the Notify broadcast.
4. **Schedule versions.** Snapshot on every save with a history list, diff and one-click
   restore. Also the safety net for the assistant.
5. **Smart clash resolution.** When a clash is found, propose the nearest free slots instead
   of only flagging it.
6. **Delivery confirmation tracking.** Templates end with "Kindly acknowledge"; track
   replies/reactions per group through WAHA and show who has not acknowledged.
7. **Scheduled one-time messages.** Pick a date and time for any message (exam notice,
   holiday). APScheduler is already running.
8. **Holiday calendar.** Mark dates as off; reminders and weekly sends skip them and an
   optional notice goes out.
9. **Calendar export.** Per-group `.ics` feed so teachers and students can subscribe in
   Google/Apple Calendar.
10. **Import from spreadsheet/CSV** for groups and contacts with a column-mapping preview.
11. **Teacher and room as first-class fields.** Rooms exist only in the Visual Editor;
    promoting them (and teachers) enables teacher-clash detection and per-teacher views.
12. **Persist reminder de-duplication** in the database — it is in memory today and resets
    on every deploy, which can cause a duplicate reminder.

## 5. Scheduler Assistant — design

### What the user gets
A chat panel (button in the topbar, also `Ctrl+K` → "Ask"):

- **Text:** "Move O'Level CS from Monday to Wednesday 3–4:30pm" · "Cancel Friday for
  SSIES Math this week and tell the group" · "Who is free Tuesday after 2?"
- **Voice:** hold the mic button and say the same thing.
- **Image:** drop a photo or screenshot of a timetable; the assistant reads it and proposes
  the schedule.
- **From WhatsApp (optional, phase 2):** message your own linked number; WAHA forwards it to
  the same assistant and replies in chat.

### The rule that keeps it safe
The assistant **never writes directly**. It returns a list of proposed changes; the app
shows them as a before/after diff card with **Apply** and **Discard**; Apply goes through the
existing `PUT /api/groups` path; a schedule snapshot is taken first so it can be undone.
Sending a WhatsApp message always needs its own explicit confirmation.

### How it works
1. Browser sends the message (plus optional image) to a new `POST /api/assistant`.
2. Server builds a compact context: group names, nicknames and the current weekly schedule.
3. Server calls the model with a small fixed set of tools:
   `set_slot`, `clear_slot`, `move_slot`, `create_group`, `find_free_slots`,
   `draft_notice`. The model can only answer through these.
4. Server validates every proposed change (group exists, time parses in the app's
   `3:00pm` format, runs the existing clash check) and returns the proposals.
5. Browser renders the diff card; Apply calls the existing save.

Text read from images or chat is treated as data to be proposed, never as instructions to
execute.

### Keeping it free
| Piece | Free option | Notes |
|---|---|---|
| Voice → text | Browser Web Speech API | Runs in the browser, no key, no server load. Works in Chrome/Edge/Safari; hide the mic where unsupported. |
| Understanding + tool calls | Hosted free tier (Groq or Google Gemini) | Called from the server with one HTTP request; no SDK needed. Both expose an OpenAI-compatible endpoint, so the provider is three settings: base URL, model, key. |
| Image reading | Gemini free tier (multimodal) | Same call with the image attached. |
| Hosting | Existing OCI Always-Free VM | The assistant is one Flask route; it adds no container and almost no memory. |

Things to know before relying on "free":

- **Free-tier limits change often and the published numbers conflict.** Reports for Gemini
  Flash range from 1,500 requests/day (older models) down to roughly 20/day for the newest
  Flash models, with Flash-Lite models higher; Groq is reported at 30 requests/minute with
  per-model daily caps. Check the limits page in each console for the real number on your
  account before choosing a default model.
- Expected usage here is small (one school, a handful of edits a day), so even a low cap is
  workable. Store the key the same way the Resend key is stored, rate-limit the route with
  the already-installed `flask-limiter`, and show a clear "daily limit reached" message.
- **A local model on the VM is possible but slow** (corrected 2026-11-16 — the earlier note
  here said the VM lacked the memory, which was an assumption and wrong). Measured on the
  server: `VM.Standard.A1.Flex`, 2 ARM cores (Neoverse-N1), 12 GB memory with about 9.6 GB
  available, 22 GB disk free, no GPU. Memory and disk fit a small model (2–5 GB). The limit
  is the 2 cores: expect tens of seconds per request (an estimate, not yet measured), with
  the site and WAHA slowed while it answers. Reading photos locally is not realistic.
  2026 reports say Oracle's Always Free ARM allowance is now 2 cores / 12 GB in total, which
  this VM already uses in full, so there is no free headroom to add cores.
  To use one, the assistant needs three changes: accept an internal `http://` address,
  a longer provider timeout than 45 s, and no API key requirement.
- **Local fallback, measured 2026-11-16** on the real 11-group timetable (Ollama 0.40.16,
  CPU only). First round, three requests each:

  | Model | Size | Load | Per answer | Correct |
  |---|---|---|---|---|
  | `llama3.2:3b` | 2.0 GB | 69 s | 5–25 s | 1 of 3 |
  | `phi4-mini` | 2.5 GB | 104 s | 7–25 s | 0 of 3 |
  | `gemma3:4b` | 3.4 GB | 65 s | 6–25 s | 0 of 3 |
  | `qwen2.5:7b` | 4.7 GB | 145–182 s | 20–48 s | 3 of 3 |

  `qwen2.5:7b` then scored 8 of 10 on a wider set (median 34 s). One miss was the app's own
  name matching ("Physics" matched inside "Astrophysics Club"), now fixed, which makes it
  9 of 10. The remaining miss: asked for two changes at once, it added the class on the new
  day but did not remove it from the old one. The app stayed at ~22 ms response time
  throughout. The fallback is implemented as provider first, local second
  (`ask_with_fallback`); the `ollama` service in `docker-compose.prod.yml` is optional and
  starts only when asked for.
- Free tiers may use submitted data to improve their models. The context sent contains group
  names and class times; phone numbers should be left out.

## 6. Suggested order

| Phase | Contents | Why this order |
|---|---|---|
| 1 | Foundation items 1–6 and 11 (transitions, skeletons, keyed lists, dialogs, toasts, undo, one nav) | Every screen improves at once; later work builds on it |
| 2 | Scheduler Table/Board, Groups, Dashboard | The screens used every day |
| 3 | Command palette, shortcuts, schedule versions | Speed, and the safety net the assistant needs |
| 4 | Scheduler Assistant: text → voice → image | Highest-value feature; depends on versions + dialogs |
| 5 | Automated Send stepper, History, Settings, Contacts, Lists, Templates | Remaining screens |
| 6 | PWA, one-off exceptions, holidays, calendar export, acknowledgement tracking | Extensions |

## 7. What not to do

- **No React/Vue rewrite and no animation library.** View Transitions, `<dialog>`, CSS
  scroll-driven animations and the existing tokens cover everything above.
- **No more inline script in `index.html`.** It is 2,600+ lines; move each view's code into
  its own file in `static/js/` as that screen is touched, not as a separate big-bang refactor.
- **No motion that delays work.** Keep transitions under ~300ms and never block input.
