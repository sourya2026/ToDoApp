# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project

MERN app: `shared/` (constants + permissions), `server/` (Express + Mongoose),
`client/` (React + Vite). Node 18+. MongoDB at `MONGO_URL`.

Run `npm run demo` for a zero-install stack, `npm test` before finishing.

## Non-negotiables

- **One permission function.** `can(user, action, ctx)` in
  `shared/permissions.js` is imported by both the API and the UI. Never add a
  second copy, never inline a role check in a route or a component. An unknown
  action returns `false` by design.
- **Out of scope answers 404, not 403.** A project or item the user may not see
  must read as missing, so a URL cannot be used to confirm a record exists.
  Check `item.view` before checking the more specific permission.
- **Comments are append-only.** Never update a comment's text in place outside
  the 15-minute author window, and always push the old text into `versions[]`.
- **Every field change is audited.** Item writes go through `diffItem()` in
  `server/src/lib/audit.js`. Nothing else writes to the audit collection.
- **Dropdown values come from the database.** Statuses and priorities live in
  the `listvalues` collection. Never hard-code one in a component; read it from
  `useAppData()`.
- **Every record is a link.** Render an identifier through `<RecordLink>` or
  `<Ref>` from `client/src/components/RecordLink.jsx`. Record URLs are defined
  only in `client/src/lib/entityRoutes.js`. Mark a genuine exception with
  `// nav-ok: <reason>` **on the same line**.
- **Every panel resolves.** Use `usePanel()` + `<Panel>`. Data, empty,
  error-with-retry or forbidden within 12 seconds — an endless skeleton is a bug.
- **List state lives in the URL.** Filters, sort and selected project are query
  params, so Back restores the view and a filtered list can be shared.
- **Storage access is centralised.** Client: `client/src/lib/api.js` only —
  no component calls `fetch`. Server: the models and `lib/` helpers.
- **Confirm before destroying.** Deletes and resets go through `<ConfirmDialog>`.

## Before finishing UI or API work

```bash
npm test          # must pass
npm run nav-audit # must print PASS
npm run build     # must succeed
```

## Gotchas

- `ticketNumber` is unique **per project**, not globally (compound index).
- `Item.latestComment` / `commentCount` are denormalised. Only
  `server/src/lib/comments.js` writes them — call `addComment()` or
  `refreshLatestComment()` rather than updating the item directly.
- Only `ownerId` and `secondaryUserId` hold user ids. Do not feed other audited
  field values into a `_id` lookup — Mongoose will throw a cast error.
- Free-text search is escaped before it becomes a `RegExp`; keep it that way.
