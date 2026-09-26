// =============================================================================
// SERIALISERS  -  the API always returns a related record as { type, id, label }
// (NAV-07), so the UI can render a link without a second lookup and never has
// to guess a URL.
// =============================================================================
import { STALE_AFTER_DAYS, DONE_STATUSES, SECONDARY_KIND } from '@todo/shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** { type, id, label } or null when there is nothing to point at. */
export const ref = (type, id, label) =>
  (id ? { type, id: String(id), label: label || '(unknown)' } : null);

export const userRef = (id, names) => ref('employee', id, names.get(String(id)));

/** Human label for the Secondary column: a person, the whole team, or nothing. */
export function secondaryLabel(item, names) {
  if (item.secondaryKind === SECONDARY_KIND.TEAM) return 'Team';
  if (item.secondaryKind === SECONDARY_KIND.USER) return names.get(String(item.secondaryUserId)) || '(unknown)';
  return '';
}

export function serializeItem(item, { userNames, projectNames, now = new Date() } = {}) {
  const names = userNames || new Map();
  const projects = projectNames || new Map();
  const updatedAt = item.updatedAt ? new Date(item.updatedAt) : null;
  const isDone = DONE_STATUSES.includes(item.status);

  return {
    id: String(item._id ?? item.id),
    ticketNumber: item.ticketNumber,
    title: item.title,
    priority: item.priority,
    status: item.status,
    dueDate: item.dueDate || null,

    project: ref('project', item.projectId, projects.get(String(item.projectId))),
    owner: userRef(item.ownerId, names),
    secondaryKind: item.secondaryKind,
    secondary: item.secondaryKind === SECONDARY_KIND.USER
      ? userRef(item.secondaryUserId, names)
      : null,
    secondaryLabel: secondaryLabel(item, names),

    commentCount: item.commentCount || 0,
    latestComment: item.latestComment?.at
      ? {
          text: item.latestComment.text,
          at: item.latestComment.at,
          author: userRef(item.latestComment.authorId, names),
        }
      : null,

    createdAt: item.createdAt,
    createdBy: userRef(item.createdBy, names),
    updatedAt: item.updatedAt,
    updatedBy: userRef(item.updatedBy, names),

    // Derived flags the grid colours on, computed once here rather than in the UI.
    isDone,
    isStale: !isDone && !!updatedAt && (now - updatedAt) > STALE_AFTER_DAYS * MS_PER_DAY,
    daysSinceUpdate: updatedAt ? Math.floor((now - updatedAt) / MS_PER_DAY) : null,
  };
}

export function serializeComment(comment, names = new Map()) {
  return {
    id: String(comment._id ?? comment.id),
    itemId: String(comment.itemId),
    text: comment.text,
    author: userRef(comment.authorId, names),
    createdAt: comment.createdAt,
    editedAt: comment.editedAt || null,
    versions: (comment.versions || []).map((v) => ({ text: v.text, replacedAt: v.replacedAt })),
  };
}

export function serializeAudit(row, { userNames = new Map(), projectNames = new Map() } = {}) {
  return {
    id: String(row._id ?? row.id),
    item: ref('item', row.itemId, row.itemLabel || 'Item'),
    project: ref('project', row.projectId, projectNames.get(String(row.projectId))),
    field: row.field,
    fieldLabel: row.fieldLabel || row.field,
    oldValue: row.oldValue,
    newValue: row.newValue,
    changedBy: userRef(row.changedBy, userNames),
    at: row.at,
  };
}

export function serializeProject(project, { userNames = new Map(), itemCount = 0 } = {}) {
  return {
    id: String(project._id ?? project.id),
    name: project.name,
    client: project.client || '',
    description: project.description || '',
    active: project.active,
    assignedUserIds: (project.assignedUserIds || []).map(String),
    assigned: (project.assignedUserIds || []).map((id) => userRef(id, userNames)).filter(Boolean),
    itemCount,
    createdAt: project.createdAt,
  };
}

export const serializeUser = (u) => ({
  id: String(u._id ?? u.id),
  name: u.name,
  role: u.role,
  active: u.active,
  createdAt: u.createdAt,
});
