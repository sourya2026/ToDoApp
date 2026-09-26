// =============================================================================
// PERMISSIONS  -  ONE function decides every access question: can(user, action, ctx)
//
// Imported by BOTH the Express routes (authoritative) and the React UI (to hide
// controls the user may not use). There is no second copy of these rules.
//
//   can(user, 'item.delete', { item, project })   -> true | false
//
// ctx keys, all optional depending on the action:
//   project  { id, active, assignedUserIds[] }
//   item     { id, projectId, ownerId, secondaryUserId }
//   comment  { id, authorId, createdAt }
//   now      Date (defaults to new Date()) - only used for the comment edit window
// =============================================================================

import { ROLES, COMMENT_EDIT_WINDOW_MS } from './constants.js';

const str = (v) => (v === null || v === undefined ? '' : String(v));
const isAdmin = (user) => !!user && user.active !== false && user.role === ROLES.ADMIN;
const isEmployee = (user) => !!user && user.active !== false && user.role === ROLES.EMPLOYEE;

/** Is this user assigned to this project? Admins are implicitly on every project. */
export function isOnProject(user, project) {
  if (!user || !project) return false;
  if (isAdmin(user)) return true;
  const assigned = project.assignedUserIds || [];
  return assigned.map(str).includes(str(user.id));
}

/** Is the user the owner or the named secondary of this item? */
export function isResponsibleFor(user, item) {
  if (!user || !item) return false;
  return str(item.ownerId) === str(user.id) || str(item.secondaryUserId) === str(user.id);
}

/**
 * The single permission gate.
 * Unknown actions return false: a new action is denied until it is listed here,
 * never silently allowed.
 */
export function can(user, action, ctx = {}) {
  if (!user || user.active === false) return false;

  const { project, item, comment } = ctx;
  const now = ctx.now ? new Date(ctx.now) : new Date();
  const admin = isAdmin(user);

  switch (action) {
    // ----- Admin-only surfaces -------------------------------------------
    case 'project.create':
    case 'project.edit':
    case 'project.archive':
    case 'project.assign':
    case 'user.manage':
    case 'lists.manage':
    case 'audit.viewGlobal':
    case 'demo.reset':
    case 'import.run':
      return admin;

    // ----- Projects -------------------------------------------------------
    case 'project.view':
      return isOnProject(user, project);

    // ----- Items ----------------------------------------------------------
    case 'item.view':
      return isOnProject(user, project);

    // Creating needs an ACTIVE project you belong to (archived projects are read-only).
    case 'item.create':
      if (!project || project.active === false) return false;
      return isOnProject(user, project);

    // Full edit = every field, including title, ticket number, owner, due date.
    case 'item.editFull':
      return admin && !!item;

    // Limited edit = status / priority / secondary, for the people responsible.
    case 'item.editLimited':
      if (!item || !isOnProject(user, project)) return false;
      if (admin) return true;
      if (project && project.active === false) return false;
      return isEmployee(user) && isResponsibleFor(user, item);

    // "Can this user change the item at all?" - used to enable the detail form.
    case 'item.edit':
      return can(user, 'item.editFull', ctx) || can(user, 'item.editLimited', ctx);

    case 'item.delete':
      return admin && !!item;

    // ----- Comments -------------------------------------------------------
    // Anyone on the project may comment on any item in it.
    case 'comment.create':
      if (!item || !isOnProject(user, project)) return false;
      return project ? project.active !== false : true;

    // Only the author, and only inside the 15-minute window. Admins included:
    // an audit trail nobody can rewrite is the point.
    case 'comment.edit': {
      if (!comment) return false;
      if (str(comment.authorId) !== str(user.id)) return false;
      const age = now.getTime() - new Date(comment.createdAt).getTime();
      return age >= 0 && age <= COMMENT_EDIT_WINDOW_MS;
    }

    default:
      return false;
  }
}

/**
 * Which fields of an item may this user actually write?
 * Returns an array of field names - the route filters the request body with it.
 */
export function editableFields(user, ctx, employeeFields) {
  if (can(user, 'item.editFull', ctx)) {
    return ['ticketNumber', 'title', 'projectId', 'priority', 'status',
            'ownerId', 'secondaryKind', 'secondaryUserId', 'dueDate'];
  }
  if (can(user, 'item.editLimited', ctx)) return [...employeeFields];
  return [];
}

/** Milliseconds left in a comment's edit window (0 once locked). */
export function commentEditMsLeft(comment, now = new Date()) {
  if (!comment) return 0;
  const left = COMMENT_EDIT_WINDOW_MS - (now.getTime() - new Date(comment.createdAt).getTime());
  return left > 0 ? left : 0;
}
