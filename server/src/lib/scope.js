// =============================================================================
// SCOPE  -  which projects and items this user is allowed to see.
// Used by every read route so an employee's query can never reach another
// project's data, whatever they put in the query string.
// =============================================================================
import { Project, User, Item } from '../models/index.js';
import { ROLES } from '@todo/shared';

/** Projects visible to the user: all of them for an admin, assigned ones otherwise. */
export async function visibleProjects(user, { includeArchived = true } = {}) {
  const filter = user.role === ROLES.ADMIN ? {} : { assignedUserIds: user.id };
  if (!includeArchived) filter.active = true;
  return Project.find(filter).sort({ active: -1, name: 1 });
}

export async function visibleProjectIds(user, opts) {
  const projects = await visibleProjects(user, opts);
  return projects.map((p) => String(p._id));
}

/** id -> name lookups, so serialisers can label every reference in one pass. */
export async function nameMaps(extraUserIds = []) {
  const [users, projects] = await Promise.all([
    User.find({}).select('name').lean(),
    Project.find({}).select('name').lean(),
  ]);
  return {
    userNames: new Map(users.map((u) => [String(u._id), u.name])),
    projectNames: new Map(projects.map((p) => [String(p._id), p.name])),
  };
}

/** Count items per project, for the "All my projects" group headers. */
export async function itemCounts(projectIds) {
  const rows = await Item.aggregate([
    { $match: { projectId: { $in: projectIds.map((id) => new (Item.base.Types.ObjectId)(id)) } } },
    { $group: { _id: '$projectId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}
