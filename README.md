# Project To-Do Tracker

A MERN application for tracking tickets across multiple client projects — the
replacement for the Excel sheet, with real roles, an append-only comment
history and an automatic audit trail.

```
ToDo App/
├── shared/      constants + the can() permission function (used by BOTH sides)
├── server/      Express + Mongoose REST API
├── client/      React (Vite) single-page app
└── .claude/     the no-dead-ends navigation audit script
```

---

## 1. Run it locally

### Option A — try it now, nothing to install (recommended first run)

```bash
npm install     # once
npm run demo
```

Then open **http://localhost:5173**.

This starts the API against an **in-memory MongoDB** and seeds the sample data.
The first run downloads a MongoDB binary (~780 MB) once and caches it; later
runs start in a couple of seconds. **Data is discarded when you stop the
process** — use it to look around, not to keep anything.

### Option B — a real local MongoDB (data persists)

1. Install **MongoDB Community Server** — <https://www.mongodb.com/try/download/community>.
   On Windows, tick "Install MongoDB as a Service" so it starts with the machine.
2. Check it is running:
   ```bash
   powershell "Get-Service MongoDB"      # should say Running
   # or start it:  net start MongoDB
   ```
3. Seed and run:
   ```bash
   npm install          # once
   npm run seed         # creates the sample projects, tickets and comments
   npm run dev          # API on :4000, web on :5173
   ```

Connection settings live in `server/.env` (copied from `.env.example`):

```
MONGO_URL=mongodb://localhost:27017/todo_tracker
PORT=4000
JWT_SECRET=change-me-in-production
CLIENT_ORIGIN=http://localhost:5173
```

### Sign in

| User   | Role     | PIN  |
|--------|----------|------|
| Admin  | ADMIN    | 1234 |
| Radha  | EMPLOYEE | 1234 |
| Sourya | EMPLOYEE | 1234 |
| Venkat | EMPLOYEE | 1234 |

Sign in as **Radha** to see the employee experience: she is on NTT SOHAR only,
so NTT MUSCAT and its ticket are invisible to her, and she can change Status,
Priority and Secondary just on the tickets she owns or is secondary on.

### All the commands

| Command | What it does |
|---|---|
| `npm run demo` | API (in-memory DB, auto-seeded) + web, one command |
| `npm run dev` | API (your MongoDB) + web |
| `npm run dev:api` / `npm run dev:web` | Run one side only |
| `npm run seed` | Wipe and reseed the sample data |
| `npm test` | 32 API tests (spins up its own throwaway database) |
| `npm run build` | Production build of the client into `client/dist` |
| `npm start` | Serve API **and** the built client from `:4000` on one origin |
| `npm run nav-audit` | Fail the build if a record is displayed without a link |

---

## 2. What each role can do

Every permission question in the app — on the server and in the UI — is
answered by one function: `can(user, action, ctx)` in
[`shared/permissions.js`](shared/permissions.js). There is no second copy, so
the buttons you see and the rules the API enforces cannot drift apart.

| | ADMIN | EMPLOYEE |
|---|---|---|
| See projects | all | only those they are assigned to |
| Create / edit / archive projects | yes | no |
| Assign employees to projects | yes | no |
| Add / edit / deactivate employees | yes | no |
| Manage statuses and priorities | yes | no |
| Create items | any active project | in their own projects |
| Edit Ticket No, Title, Owner, Due date | yes | **no** |
| Edit Status, Priority, Secondary | yes | only where they are Owner or Secondary |
| Delete items | yes | **no** |
| Comment | any item they can see | any item in their projects |
| Edit a comment | only their own, within 15 min | only their own, within 15 min |
| Global audit log | yes | no |
| Reset demo data | yes | no |

Two rules worth calling out:

- **Out of scope reads as missing.** Asking for a project or item outside your
  projects returns **404, never 403** — a URL must not confirm that a record
  exists. This is covered by tests.
- **Nobody rewrites history.** After 15 minutes a comment locks for everyone,
  admins included. An edit inside the window keeps the previous text in
  `versions[]`; it never overwrites.

---

## 3. How the data is shaped

| Collection | Notes |
|---|---|
| `users` | Name, PIN (bcrypt hash), role, `active`. Never hard-deleted, so authorship survives. |
| `projects` | Name, client, description, `active`, `assignedUserIds`. Archived, never deleted. |
| `items` | `ticketNumber` is its own field and is **unique within a project** (compound index). Carries a denormalised `latestComment` + `commentCount` so the grid renders without an N+1 query. |
| `comments` | Append-only. `versions[]` holds superseded text. |
| `auditlogs` | One row per changed field: item, field, old value, new value, who, when. |
| `listvalues` | The statuses and priorities. **Every dropdown in the UI is built from here** — no status or priority is hard-coded in a component. |

`Secondary` is stored as `secondaryKind` (`TEAM` / `USER` / `NONE`) plus
`secondaryUserId`, which is how a row can say "Team" or name a person.

The API returns every related record as `{ type, id, label }`, so the UI can
render a link without a second lookup and never has to guess a URL.

---

## 4. The main screen

- **Top bar** — project selector (plus "All my projects"), the signed-in user
  and their role badge.
- **Grid** — Ticket No | Title | Priority | Status | Owner | Secondary |
  Latest Comment (with date + author) | Last Updated (date-time + by whom).
- **Grouping** — with "All my projects" selected, rows sit under project header
  rows carrying that project's item count.
- **Colour coding** — Critical rows carry a red edge, Done rows are greyed and
  struck through, and anything untouched for 7+ days is flagged `stale`.
- **Filters** — priority, status, owner, "assigned to me", hide-done, and a
  text search that covers ticket number, title **and comment text**.
- **Summary chips** — counts by status and priority; clicking one filters.
  The counts deliberately ignore the status/priority filters, so selecting one
  chip does not zero out all the others.
- **Sorting** — every column. Priority and Status sort by the order an admin
  set in Admin → Lists, not alphabetically.

**The whole view lives in the URL** (`/board?project=…&status=…&q=…&sort=…`),
so Back restores your filters, sort and project, and a filtered view can be
bookmarked or pasted to a colleague.

Clicking a row opens the item at its own URL (`/items/<id>`), which loads
directly on refresh and can be shared. The panel has two tabs: the item with
its full comment history (newest first, `DD/MM/YYYY HH:mm`), and the change
history from the audit log.

---

## 5. Import and export

**Export** (any user, from the board):

- **Export** — the current view, one row per item, including its latest comment.
- **Export + history** — the same, plus a second sheet with **every** comment as
  its own row, so nothing is flattened away.

**Import** (admin only, board → Import). Accepts `.xlsx`, `.xls` and `.csv`
with these columns (header names are matched case-insensitively, and several
aliases are accepted — `Ticket No`, `Ticket Number`, `Ticket` all work):

```
Project | Ticket No | Title | Priority | Status | Person | Secondary | Comments
```

The file is parsed in your browser and **previewed before anything is written**.
Rows are matched on (Project, Ticket No): a new pair creates an item, an
existing one updates it.

A `Comments` cell whose lines start with a date is split into separate history
entries — this is the behaviour the old spreadsheet needs:

```
25/08: Raised with the SA team, awaiting confirmation.
       This second line belongs to the 25/08 entry.
02/09: Vendor replied - fix planned for the next drop.
09/09/2025 - Retested in QA.
```

becomes three separate comments dated 25 Aug, 2 Sep and 9 Sep. `DD/MM`,
`DD/MM/YYYY`, `DD.MM` and `DD-MM` are all recognised; a bare `DD/MM` takes the
current year. Re-importing the same sheet does **not** duplicate history — an
entry with the same date and text is skipped.

Unknown people, statuses or priorities do not fail the import: the row is
brought in with a sensible default and listed under "warnings" in the report.
Use **Download template** in the dialog to get a correctly-shaped file.

---

## 6. Project layout

```
shared/
  constants.js          roles, list defaults, stale threshold, edit window
  permissions.js        can(user, action, ctx) - the single permission gate

server/src/
  config.js             every environment knob
  db.js                 the Mongoose connection
  models/index.js       all six schemas
  lib/
    permissions -> @todo/shared (not duplicated)
    context.js          turns documents into the shape can() expects
    audit.js            diffItem() - the ONLY writer of the audit log
    comments.js         addComment() + splitDatedComments()
    serialize.js        { type, id, label } reference shapes
    scope.js            which projects/items a user may see
    http.js             typed errors, async route wrapper
  middleware/           auth (JWT + PIN), request id, error handler
  routes/               auth, users, projects, items, comments, lists,
                        audit, importer, admin
  seed-data.js          the sample data (also powers "Reset demo data")
  dev-memory.js         the zero-install demo server

client/src/
  lib/
    api.js              EVERY server call - nothing else knows a URL
    auth.jsx            session + can(), backed by @todo/shared
    appData.jsx         dropdown lists, people, projects (loaded once)
    entityRoutes.js     the route registry - the only place record URLs live
    usePanel.js         loading / empty / error / forbidden, with a timeout
    excel.js            import + export (SheetJS, loaded on demand)
    format.js           dates, initials, relative time
  components/           RecordLink, ItemsGrid, ItemDetailPanel, dialogs, ui
  pages/                Login, Board, ProjectDetail, admin/*
```

### Conventions worth keeping

- **All storage access goes through one place.** Server-side that is
  `models/` + the `lib/` helpers; client-side it is `lib/api.js`. No component
  calls `fetch` directly.
- **One permission function.** Add an action to `shared/permissions.js`; an
  unknown action returns `false`, so a new capability is denied until it is
  written down.
- **Dropdown values come from the database.** If you find yourself typing
  `'In Progress'` in a component, use `useAppData()` instead.
- **Every panel resolves.** Use `usePanel()` + `<Panel>`; they guarantee one of
  data / empty / error-with-retry / forbidden within 12 seconds. An endless
  skeleton is a bug.
- **Every record is a link.** Render identifiers through `<RecordLink>` or
  `<Ref>`; `npm run nav-audit` fails the build otherwise. A genuine exception
  is marked `// nav-ok: <reason>` on the same line.

---

## 7. Tests

```bash
npm test
```

32 API tests spin up their own throwaway MongoDB and cover sign-in, project
scoping (including the 404-not-403 rule), field-level edit permissions, the
append-only comment history, the audit log, search across comments, list
renaming, and the "last active admin" guard.

---

## 8. Deploying as one origin

```bash
npm run build     # client -> client/dist
npm start         # Express serves the API and the built client on :4000
```

The server serves `client/dist` when it exists, with a catch-all that returns
`index.html` for non-`/api` routes — so a bookmarked `/items/<id>` still loads
on a hard refresh. Set a real `JWT_SECRET` before putting this anywhere shared.

---

## 9. Note on the seeded comments

The brief supplied the five NTT SOHAR tickets but no comment text, so the
dated comments in `server/src/seed-data.js` are **plausible placeholders**
written in the `25/08:` style. Replace them with the real history by importing
your spreadsheet (Admin → Import), or edit the `SAMPLE_ITEMS` array and run
`npm run seed` again.

---

## 10. Deploying to Render

The app ships as **one Render web service**: Express serves the API *and* the
built React client from a single origin, so there is no CORS to configure and a
bookmarked `/items/<id>` still loads on a hard refresh.

### Prerequisites

| # | What you need | Why / notes |
|---|---|---|
| 1 | A **GitHub repository** with this code | Render deploys from a branch and redeploys on push. |
| 2 | A **Render account** — <https://render.com> | The free instance type is enough to try it. |
| 3 | A **MongoDB Atlas cluster** — <https://www.mongodb.com/atlas> | **Render has no managed MongoDB.** The free M0 tier is fine. |
| 4 | An Atlas **database user** (name + password) | Avoid `@ : / ? # [ ]` in the password, or URL-encode them. |
| 5 | Atlas **network access** set to allow Render | Render free plans have no static outbound IP, so allow `0.0.0.0/0` and rely on the database user for security. Paid plans can use Render's static IPs instead. |
| 6 | The Atlas **SRV connection string**, with a database name | `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/todo_tracker?retryWrites=true&w=majority` — the `/todo_tracker` part matters; without it you get the `test` database. |
| 7 | Node **18.18 or newer** | Pinned by `NODE_VERSION` in `render.yaml`. |

### Deploy

**Option A — the blueprint (recommended).** `render.yaml` is already in the
repo, so Render can read the whole configuration:

1. Render dashboard → **New** → **Blueprint** → pick the `ToDoApp` repo.
2. Render reads `render.yaml` and prompts for the one secret it cannot guess,
   `MONGO_URL`. Paste the Atlas string from prerequisite 6.
3. **Apply**. `JWT_SECRET` is generated for you.

**Option B — manual web service.** New → **Web Service** → connect the repo, then:

| Setting | Value |
|---|---|
| Runtime | Node |
| Root directory | *(leave blank — the repo root)* |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

…and add the environment variables below by hand.

### Environment variables

| Key | Value | Required |
|---|---|---|
| `MONGO_URL` | your Atlas SRV string | **yes** |
| `JWT_SECRET` | a long random string (Render can generate it) | **yes** — without it sessions are signed with a public default |
| `NODE_ENV` | `production` | yes |
| `NODE_VERSION` | `20.15.0` | recommended |
| `SEED_ON_EMPTY` | `true` | optional — see below |
| `CLIENT_ORIGIN` | *(leave unset)* | only if you host the client on a **different** domain |

`PORT` is injected by Render and read automatically — do not set it.

### First run

With `SEED_ON_EMPTY=true`, the first boot against an empty database creates the
sample projects, tickets, comments and the four demo accounts (PIN `1234`). It
checks for existing users first, so **it will never overwrite real data** and is
safe to leave switched on.

Then do this straight away:

1. Sign in as **Admin / 1234**.
2. Admin → **Employees** → change every PIN, starting with Admin's.
3. Import your real spreadsheet (Admin → **Import**), or delete the sample
   projects and start clean.

### Things worth knowing

- **Free instances sleep** after ~15 minutes idle; the next request takes
  ~30 seconds to wake it. Use a paid instance if people rely on it daily.
- **The disk is ephemeral.** All state lives in Atlas, which is why Atlas is a
  hard prerequisite rather than a nicety.
- **Atlas free tier also sleeps/throttles.** If the app hangs on first load,
  check the cluster is awake and the IP allow-list covers Render.
- **`npm install` (not `ci`) on purpose** — the build needs the dev
  dependencies (Vite) to produce `client/dist`.
- **Backups**: Atlas handles snapshots. `Export + history` in the UI gives you a
  full spreadsheet copy whenever you want one.
