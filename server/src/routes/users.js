// =============================================================================
// ROUTES: /api/users  -  employee administration (add / edit / deactivate).
// Users are never hard-deleted, so authorship and history stay intact.
// =============================================================================
import { Router } from 'express';
import { User, Project } from '../models/index.js';
import { asyncRoute, badRequest, notFound, conflict } from '../lib/http.js';
import { requireAuth, requirePermission, hashPin } from '../middleware/auth.js';
import { serializeUser } from '../lib/serialize.js';
import { ROLES } from '@todo/shared';

const router = Router();
router.use(requireAuth);

const PIN_RULE = /^[0-9]{4,8}$/;

/** Everyone needs the people list to render Owner / Secondary dropdowns. */
router.get('/', asyncRoute(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true' && req.user.role === ROLES.ADMIN;
  const users = await User.find(includeInactive ? {} : { active: true }).sort({ name: 1 }).lean();
  res.json({ ok: true, data: users.map(serializeUser) });
}));

router.post('/', requirePermission('user.manage'), asyncRoute(async (req, res) => {
  const { name, pin, role = ROLES.EMPLOYEE } = req.body || {};
  const trimmed = String(name || '').trim();
  if (!trimmed) throw badRequest('Name is required');
  if (!PIN_RULE.test(String(pin || ''))) throw badRequest('PIN must be 4 to 8 digits');
  if (await User.findOne({ name: trimmed })) throw conflict('Someone already uses that name');

  const user = await User.create({ name: trimmed, pinHash: await hashPin(pin), role });
  res.status(201).json({ ok: true, data: serializeUser(user) });
}));

router.patch('/:id', requirePermission('user.manage'), asyncRoute(async (req, res) => {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user) throw notFound('Employee not found');

  const { name, role, active, pin } = req.body || {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw badRequest('Name cannot be empty');
    const clash = await User.findOne({ name: trimmed, _id: { $ne: user._id } });
    if (clash) throw conflict('Someone already uses that name');
    user.name = trimmed;
  }

  if (role !== undefined) user.role = role;

  if (active !== undefined) {
    // Refuse to leave the system with no way in.
    if (active === false && user.role === ROLES.ADMIN) {
      const otherAdmins = await User.countDocuments({
        role: ROLES.ADMIN, active: true, _id: { $ne: user._id },
      });
      if (otherAdmins === 0) throw badRequest('This is the last active admin - promote someone else first');
    }
    user.active = active;
  }

  if (pin !== undefined) {
    if (!PIN_RULE.test(String(pin))) throw badRequest('PIN must be 4 to 8 digits');
    user.pinHash = await hashPin(pin);
  }

  await user.save();
  res.json({ ok: true, data: serializeUser(user) });
}));

/** Which projects is this person on? Shown on the employee admin row. */
router.get('/:id/projects', requirePermission('user.manage'), asyncRoute(async (req, res) => {
  const projects = await Project.find({ assignedUserIds: req.params.id }).select('name active').lean();
  res.json({
    ok: true,
    data: projects.map((p) => ({ type: 'project', id: String(p._id), label: p.name, active: p.active })),
  });
}));

export default router;
