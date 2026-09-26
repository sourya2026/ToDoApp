// =============================================================================
// ROUTES: /api/projects  -  create / edit / archive, and assign employees.
// Projects are archived, never deleted, so their items and history survive.
// =============================================================================
import { Router } from 'express';
import { Project, Item, User } from '../models/index.js';
import { asyncRoute, badRequest, notFound, conflict, forbidden } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { serializeProject } from '../lib/serialize.js';
import { visibleProjects, nameMaps, itemCounts } from '../lib/scope.js';
import { projectCtx } from '../lib/context.js';
import { can } from '@todo/shared';

const router = Router();
router.use(requireAuth);

/** Projects this user may see: all for an admin, assigned ones for an employee. */
router.get('/', asyncRoute(async (req, res) => {
  const projects = await visibleProjects(req.user, {
    includeArchived: req.query.includeArchived !== 'false',
  });
  const { userNames } = await nameMaps();
  const counts = await itemCounts(projects.map((p) => String(p._id)));

  res.json({
    ok: true,
    data: projects.map((p) => serializeProject(p, {
      userNames, itemCount: counts.get(String(p._id)) || 0,
    })),
  });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const project = await Project.findById(req.params.id).catch(() => null);
  // Out of scope answers 404, not 403 - a URL must not confirm a project exists.
  if (!project || !can(req.user, 'project.view', { project: projectCtx(project) })) {
    throw notFound('Project not found');
  }
  const { userNames } = await nameMaps();
  const count = await Item.countDocuments({ projectId: project._id });
  res.json({ ok: true, data: serializeProject(project, { userNames, itemCount: count }) });
}));

router.post('/', requirePermission('project.create'), asyncRoute(async (req, res) => {
  const { name, client = '', description = '', assignedUserIds = [] } = req.body || {};
  const trimmed = String(name || '').trim();
  if (!trimmed) throw badRequest('Project name is required');
  if (await Project.findOne({ name: trimmed })) throw conflict('A project with that name already exists');

  const project = await Project.create({
    name: trimmed,
    client: String(client).trim(),
    description,
    assignedUserIds,
    createdBy: req.user.id,
  });

  const { userNames } = await nameMaps();
  res.status(201).json({ ok: true, data: serializeProject(project, { userNames }) });
}));

router.patch('/:id', requirePermission('project.edit'), asyncRoute(async (req, res) => {
  const project = await Project.findById(req.params.id).catch(() => null);
  if (!project) throw notFound('Project not found');

  const { name, client, description, active, assignedUserIds } = req.body || {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw badRequest('Project name cannot be empty');
    const clash = await Project.findOne({ name: trimmed, _id: { $ne: project._id } });
    if (clash) throw conflict('A project with that name already exists');
    project.name = trimmed;
  }
  if (client !== undefined) project.client = String(client).trim();
  if (description !== undefined) project.description = description;
  if (active !== undefined) project.active = !!active;

  if (assignedUserIds !== undefined) {
    if (!Array.isArray(assignedUserIds)) throw badRequest('assignedUserIds must be an array');
    // Reject unknown ids rather than silently storing a dangling reference.
    const found = await User.countDocuments({ _id: { $in: assignedUserIds } });
    if (found !== assignedUserIds.length) throw badRequest('One or more employees do not exist');
    project.assignedUserIds = assignedUserIds;
  }

  await project.save();
  const { userNames } = await nameMaps();
  const count = await Item.countDocuments({ projectId: project._id });
  res.json({ ok: true, data: serializeProject(project, { userNames, itemCount: count }) });
}));

export default router;
