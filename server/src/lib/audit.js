// =============================================================================
// AUDIT LOG  -  every field change on an item is recorded automatically.
//
// diffItem() is called by the item routes before and after a write; nothing
// else writes to the AuditLog collection, so the trail cannot drift.
// =============================================================================
import { AuditLog, User } from '../models/index.js';
import { AUDITED_FIELDS } from '@todo/shared';

/** The audited fields whose value is a user id rather than plain text. */
const USER_ID_FIELDS = ['ownerId', 'secondaryUserId'];

/** Cache of id -> name so a diff of several fields costs one query. */
async function userNames(ids) {
  const clean = [...new Set(ids.filter(Boolean).map(String))];
  if (!clean.length) return new Map();
  const users = await User.find({ _id: { $in: clean } }).select('name').lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

/** Render a raw stored value as the text an auditor should read. */
function display(field, value, names, projectNames) {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (field === 'ownerId' || field === 'secondaryUserId') return names.get(String(value)) || '(unknown user)';
  if (field === 'projectId') return projectNames.get(String(value)) || String(value);
  if (field === 'dueDate') return new Date(value).toISOString().slice(0, 10);
  return String(value);
}

/**
 * Compare two snapshots of an item and write one AuditLog row per changed field.
 * Returns the rows written (so a route can report "3 changes recorded").
 */
export async function diffItem({ before, after, user, projectNameMap = new Map() }) {
  const fields = Object.keys(AUDITED_FIELDS);
  const changed = fields.filter((f) => {
    const a = before?.[f] ?? null;
    const b = after?.[f] ?? null;
    const norm = (v) => (v === null || v === undefined ? '' : (v instanceof Date ? v.getTime() : String(v)));
    return norm(a) !== norm(b);
  });
  if (!changed.length) return [];

  const names = await userNames([
    // Only the fields that actually hold a user id. Feeding a status label
    // into an _id lookup makes Mongoose throw a cast error.
    ...changed.filter((f) => USER_ID_FIELDS.includes(f))
      .flatMap((f) => [before?.[f], after?.[f]]),
  ]);

  const rows = changed.map((field) => ({
    itemId: after.id ?? after._id,
    projectId: after.projectId,
    entity: 'item',
    field,
    fieldLabel: AUDITED_FIELDS[field],
    oldValue: display(field, before?.[field], names, projectNameMap),
    newValue: display(field, after?.[field], names, projectNameMap),
    changedBy: user.id ?? user._id,
    at: new Date(),
  }));

  await AuditLog.insertMany(rows);
  return rows;
}

/** Record a one-off event that is not a field diff (creation, deletion, import). */
export async function recordEvent({ itemId, projectId, field, fieldLabel, oldValue = '', newValue, user }) {
  return AuditLog.create({
    itemId, projectId, entity: 'item', field, fieldLabel,
    oldValue, newValue, changedBy: user.id ?? user._id, at: new Date(),
  });
}

/** A plain snapshot of an item, ready for diffItem(). */
export const snapshot = (item) => ({
  id: String(item._id ?? item.id),
  ticketNumber: item.ticketNumber,
  title: item.title,
  projectId: String(item.projectId),
  priority: item.priority,
  status: item.status,
  ownerId: item.ownerId ? String(item.ownerId) : null,
  secondaryKind: item.secondaryKind,
  secondaryUserId: item.secondaryUserId ? String(item.secondaryUserId) : null,
  dueDate: item.dueDate || null,
});
