// =============================================================================
// ROUTES: /api/lists  -  admin-editable dropdown values (statuses, priorities).
// The UI reads every dropdown from here; nothing is hard-coded in a component.
// =============================================================================
import { Router } from 'express';
import { ListValue, Item } from '../models/index.js';
import { asyncRoute, badRequest, notFound, conflict } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { LIST_KIND } from '@todo/shared';

const router = Router();
router.use(requireAuth);

const clean = (v) => ({
  id: String(v._id), kind: v.kind, label: v.label, order: v.order, color: v.color, active: v.active,
});

/** Which item field stores this list's value. */
const fieldFor = (kind) => (kind === LIST_KIND.STATUS ? 'status' : 'priority');

router.get('/', asyncRoute(async (req, res) => {
  const filter = req.query.includeInactive === 'true' ? {} : { active: true };
  const values = await ListValue.find(filter).sort({ kind: 1, order: 1, label: 1 }).lean();

  // Grouped by kind so the UI can read config.statuses / config.priorities.
  res.json({
    ok: true,
    data: {
      statuses: values.filter((v) => v.kind === LIST_KIND.STATUS).map(clean),
      priorities: values.filter((v) => v.kind === LIST_KIND.PRIORITY).map(clean),
    },
  });
}));

router.post('/', requirePermission('lists.manage'), asyncRoute(async (req, res) => {
  const { kind, label, color } = req.body || {};
  if (!Object.values(LIST_KIND).includes(kind)) throw badRequest('Unknown list');
  const trimmed = String(label || '').trim();
  if (!trimmed) throw badRequest('Label is required');
  if (await ListValue.findOne({ kind, label: trimmed })) throw conflict('That value already exists');

  const last = await ListValue.findOne({ kind }).sort({ order: -1 }).lean();
  const value = await ListValue.create({
    kind, label: trimmed, color: color || '#64748b', order: (last ? last.order : 0) + 1,
  });
  res.status(201).json({ ok: true, data: clean(value) });
}));

router.patch('/:id', requirePermission('lists.manage'), asyncRoute(async (req, res) => {
  const value = await ListValue.findById(req.params.id).catch(() => null);
  if (!value) throw notFound('List value not found');

  const { label, color, active } = req.body || {};

  if (label !== undefined && String(label).trim() !== value.label) {
    const trimmed = String(label).trim();
    if (!trimmed) throw badRequest('Label cannot be empty');
    const clash = await ListValue.findOne({ kind: value.kind, label: trimmed, _id: { $ne: value._id } });
    if (clash) throw conflict('That value already exists');

    // Items store the label, so a rename has to carry existing items across
    // rather than leaving them on a value that no longer exists.
    await Item.updateMany({ [fieldFor(value.kind)]: value.label }, { $set: { [fieldFor(value.kind)]: trimmed } });
    value.label = trimmed;
  }

  if (color !== undefined) value.color = color;

  if (active !== undefined) {
    if (active === false) {
      // Deactivating only removes the value from the dropdown. Items that
      // already carry it keep it and stay readable - say so in a header.
      const inUse = await Item.countDocuments({ [fieldFor(value.kind)]: value.label });
      if (inUse > 0) res.setHeader('X-Warning', inUse + ' item(s) still use this value');
    }
    value.active = active;
  }

  await value.save();
  res.json({ ok: true, data: clean(value) });
}));

/** Reorder a whole list in one call: body { kind, ids } in display order. */
router.post('/reorder', requirePermission('lists.manage'), asyncRoute(async (req, res) => {
  const { kind, ids } = req.body || {};
  if (!Object.values(LIST_KIND).includes(kind)) throw badRequest('Unknown list');
  if (!Array.isArray(ids)) throw badRequest('ids must be an array');

  await Promise.all(ids.map((id, index) =>
    ListValue.updateOne({ _id: id, kind }, { $set: { order: index + 1 } })));

  const values = await ListValue.find({ kind }).sort({ order: 1 }).lean();
  res.json({ ok: true, data: values.map(clean) });
}));

export default router;
