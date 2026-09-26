// =============================================================================
// Permission context  -  turns Mongoose documents into the plain shapes that
// the shared can(user, action, ctx) function expects.
// =============================================================================
import { Item, Project } from '../models/index.js';
import { notFound } from './http.js';

const s = (v) => (v === null || v === undefined ? null : String(v));

export const projectCtx = (project) => project && ({
  id: s(project._id ?? project.id),
  active: project.active,
  assignedUserIds: (project.assignedUserIds || []).map(s),
});

export const itemCtx = (item) => item && ({
  id: s(item._id ?? item.id),
  projectId: s(item.projectId),
  ownerId: s(item.ownerId),
  secondaryUserId: s(item.secondaryUserId),
});

export const userCtx = (user) => user && ({
  id: s(user._id ?? user.id),
  name: user.name,
  role: user.role,
  active: user.active,
});

/** Load a project as a permission context, or throw 404. */
export async function requireProject(projectId) {
  const project = await Project.findById(projectId).catch(() => null);
  if (!project) throw notFound('Project not found');
  return { project, ctx: { project: projectCtx(project) } };
}

/** Load an item together with its project, or throw 404. */
export async function requireItem(itemId) {
  const item = await Item.findById(itemId).catch(() => null);
  if (!item) throw notFound('Item not found');
  const project = await Project.findById(item.projectId);
  if (!project) throw notFound('Item not found');
  return { item, project, ctx: { item: itemCtx(item), project: projectCtx(project) } };
}
