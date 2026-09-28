# SSIES Schedule Sender — POC (redesigned front-end)

A **modern, minimalist, fully mobile-responsive** proof-of-concept redesign of the
SSIES WhatsApp Schedule Sender, built with plain **HTML, CSS and vanilla JS**.

The **workflow and logic are unchanged** from the production system — the same
message-generation rules, schedule format, roles, send flow (pre-flight → confirm →
status log), templates, contacts, direct/automated send, history and settings are all
preserved. The only difference is that this POC has **no backend**: it runs entirely in
the browser and persists to `localStorage`, so every screen and flow can be explored
without a server, Supabase, Docker or WAHA.

## How to run

Just open **`index.html`** (or `login.html`) in a browser. No build step, no server.

> Tip: for the cleanest experience (clipboard, downloads), serve the folder over HTTP:
> ```bash
> python -m http.server 8080
> ```
> then open http://localhost:8080/

## Demo accounts (mock auth)

Pick a role on the login screen, or type the email + password:

| Role | Email | Password |
|------|-------|----------|
| User | `teacher@ssies.edu.pk` | `teacher` |
| Admin | `admin@ssies.edu.pk` | `admin` |
| Superadmin | `superadmin@ssies.edu.pk` | `superadmin` |

## Screens (parity with production)

**Auth** — `login.html`, `forgot-password.html`
**User dashboard** — `dashboard.html`
- Groups (list + editor, weekly schedule, message + live preview, Send this / Send all)
- Scheduler (Table + Board views, drag reorder, column resize, select & send)
- Open in WhatsApp (direct `wa.me` / invite links, copy message)
- Automated Send (simulated WAHA QR link + target selection + send)
- Templates (tokens: `*bold*`, `{date}`, `{weekday}`, schedule format)
- Contacts (phone + message, load group / template)
- Send History (status + retry)
- Settings (Appearance, Layout, WhatsApp, Automation, Security, Data)
- Profile — `profile.html`

**Per-site profile pages** — each site has its own profile shell (same underlying account):
`profile.html` (user), `admin-profile.html`, `superadmin-profile.html`; content is shared
via `assets/js/profile-common.js` and each page keeps its own site navigation and Dashboard
redirect. The top-bar avatar menu links to the current site's profile.

**Admin portal** — `admin-dashboard.html`, `admin-users.html`,
`admin-user-detail.html`, `admin-activity.html`, `admin-profile.html`

**Superadmin portal** — `superadmin-dashboard.html`, `superadmin-users.html`
(unified **Users / Admins / Roles & access** tabs), `superadmin-settings.html`,
`superadmin-audit.html`, `superadmin-inspect.html`
(`superadmin-admins.html` / `superadmin-roles.html` now redirect into the unified page)

### Portal (admin & superadmin) features
- **Categorized navigation** — the portals use the same grouped nav as the user
  dashboard (Overview · People · System · Account) as a sidebar accordion or navbar dropdowns
- **Collapsible role switcher** — the floating role switcher collapses to just the current
  role behind an arrow, and expands to all roles (User / Admin / Superadmin) on click
- **Reusable data tables** — every admin/superadmin table has live **search**, **dynamic
  filters**, **pagination**, and a **Table / Board** view toggle
- **Unified user management** (superadmin) — one page with paginated, filterable Users and
  Admins sections plus a **Roles & access** section that supports **adding custom roles**,
  editing descriptions/permissions, and deleting unused roles (built-ins are protected)
- **Clickable account records** — click any user/admin row or card to open an **account
  form**; a **pencil** switches it to an editable form (display name, role, active state,
  password reset) that saves back into the account
- The portal tables keep the **search box focused while you type** (the toolbar stays put
  and only the results re-render), and **Profile** reuses the exact grouped portal rail so
  it never resets the sidebar or changes the buttons
- **Wide, aligned system-settings cards** — settings fields lay out in a full-width
  two-column grid, and links styled as buttons are never underlined

## Design

- Teal accent, Satoshi type, glass surfaces, gradient accents, generous whitespace
- Refined modern light/dark palettes with animated ambient background and micro-interactions
- **Navigation style** (Settings → Layout): switch between a **vertical sidebar** and a
  **horizontal top navbar** — applies across the user dashboard and both portals
  - The dashboard groups Groups / Contacts / Lists / Table / Board under a **Scheduler** menu
    (a dropdown in navbar mode, an expandable list in sidebar mode)
  - In navbar mode the app bar and all page content now span the **full screen width**
  - Navbar mode is a proper **66px app bar**: brand + divider, centered **text-only**
    nav with an animated active underline, a fixed-positioned Scheduler dropdown with a
    pointer arrow, an avatar + round log-out button on the right, and a **dynamic "More"
    overflow menu** that automatically collapses nav items that don't fit and restores
    them as the window widens
- **Portal switcher**: a floating bottom-right **User / Admin / Superadmin** switcher
  (shown only for accounts with more than one portal) replaces per-portal nav links
- **Dynamic details**: scroll-aware sticky bars (shadow appears on scroll), animated
  counters, button ripples, spring dropdowns, keyboard **focus rings**, and themed text
  selection — all respecting the "reduce motion" preference

### Interaction features
- **Scheduler group names & nicknames** — Table/Board columns auto-size to show the full
  group name, each column can be **expanded/collapsed** (and Expand/Collapse all), and a
  short **nickname** can be set (via the column pencil or the group detail page) for compact
  headers
- **Clash detection** — a toggle in the Scheduler flags any groups scheduled at overlapping
  times: a summary banner lists each clash and the conflicting time cells are highlighted
- **Lists** (Scheduler → Lists) — audiences built from **WhatsApp Business labels**:
  auto-discover/sync contacts by label, manage members, and view each list in
  **Tabs / Table / Board**; send a schedule to a whole list, selected contacts, or one contact
- **White & teal light theme** (teal accent on clean white) with a matching **teal + near-black dark theme**
- **Rich schedule Notes** — a formatting toolbar (bold/italic/heading, bullet, checklist,
  insert timestamp, copy, clear), a live word/character/line counter, and a textarea that
  **auto-grows** with its content instead of scrolling internally
- **Automated Send status form** — clicking send opens a modal with the pre-flight
  checklist, a live progress bar, per-recipient delivery status, and post-send controls
  (copy log, retry failed, view history)
- **Persistent sidebar** — expanded sidebar sections are remembered across pages, and the
  navbar/profile pages no longer reset or mis-redirect
- **Passkey sign-in** — a "Sign in with a passkey" option on the login screen
  (simulated platform-authenticator gesture, then a password-less session)
- **Groups & Contacts cards view** is a responsive **horizontal card grid** — each card
  shows the photo, schedule-day chips and status, and opens the item's detail page
- **Send History** is a modern, minimal screen: summary stat cards, search + status
  filter, a **Table or Board** view toggle and **pagination**
- **Notification bell** docks into the **top app bar** (left of the theme toggle) in
  navbar mode, and floats bottom-left in sidebar mode
- **Consistent navbar** — the top navigation is truly centered, and the **profile page
  now shows the exact same navbar** as the dashboard (no more shifting buttons)
- **Feature-rich dashboards** — the user home adds a success-rate stat, a "Today"
  panel and a weekly-activity chart; admin/superadmin add account/role **distribution
  bars** and a **system-health** panel
- **Grouped, collapsible navigation** — Scheduler, Messaging and Account sections
  (dropdowns in navbar mode, collapsible accordion in sidebar; the active section
  auto-expands)
- **Top-bar account menu** — click the avatar for a dropdown with your details + Log out
- **Scheduler** greys out and locks the time cells of any un-selected group
- **Profile photos everywhere** — upload a profile picture; groups/contacts show their
  WhatsApp photo (with a green "on WhatsApp" badge) and it's editable per item
- **Enhanced template editor** — formatting toolbar (bold/italic/strike/mono/bullet),
  emoji, `{date}`/`{weekday}`/schedule tokens, live WhatsApp preview, char count,
  duplicate, and template search
- **Automated Send** shows an **animated workflow status** (Provider → Session → Scan QR
  → Connected) instead of a plain text line
- **Role dashboards** — user, admin and superadmin each get a dynamic overview home
  (stats, quick actions with redirections, session/schedule status, recent activity)
- **Notification bell** (bottom-left) with per-user / per-role notifications and, for
  admins/superadmins, inline **approve/reject** of password-reset requests
- **Password-reset approval workflow** — users and admins *request* a reset; an admin or
  superadmin approves (admin requests need a superadmin). Superadmins change directly.
- **Groups & Contacts** offer a **Table / Cards** switcher; the table is a clickable grid,
  and each row opens a **detail page** with a pencil-to-edit inline form and an editable
  weekly-schedule table
- **Account-based scheduler notes** (stored on the account, not the device)
- **Profile photos** on users, groups and contacts (upload / change / remove)
- Light mode uses a **white + teal** palette; dark mode a **teal + near-black** palette
- Live accent, font-size, radius, density, sidebar-width controls (same `localStorage`
  keys as production, so preferences carry over)
- Mobile-first: sidebar collapses to a slide-in drawer + bottom tab bar, grids/splits
  stack, tables scroll

## Files

```
POC/
├── index.html                 # entry → routes to the right dashboard by role
├── login.html / forgot-password.html
├── dashboard.html             # user dashboard (all views)
├── profile.html
├── admin-*.html               # admin portal
├── superadmin-*.html          # superadmin portal
└── assets/
    ├── css/app.css            # design system
    ├── js/store.js            # mock backend + business logic (localStorage)
    ├── js/theme.js            # theme & layout preferences
    ├── js/dashboard.js        # user dashboard logic
    ├── js/portal.js           # admin/superadmin shell + user management
    └── img/                   # brand marks
```

To wipe demo data back to the seed: **Settings → Data → Reset POC demo**.
