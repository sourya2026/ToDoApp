// =============================================================================
// ROUTES: /api/items  -  the grid, the detail panel, and every write to a ticket.
//
// Reads are always scoped to the projects the user belongs to, so a hand-typed
// query string cannot reach another team's tickets.
// Writes are filtered field-by-field through the shared can() / editableFields()
// rules, and every accepted change is written to the audit log.
// =============================================================================
import { Router } from 'express';
import { Item, Project, Comment, AuditLog, ListValue } from '../models/index.js';
import { asyncRoute, badRequest, notFound, forbidden } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { serializeItem, serializeAudit } from '../lib/serialize.js';
import { nameMaps, visibleProjectIds } from '../lib/scope.js';
import { requireItem, requireProject } from '../lib/context.js';
import { diffItem, recordEvent, snapshot } from '../lib/audit.js';
import {
  can, editableFields, EMPLOYEE_EDITABLE_FIELDS,
  DONE_STATUSES, LIST_KIND, SECONDARY_KIND,
} from '@todo/shared';

const router = Router();
router.use(requireAuth);

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
// Free-text search is matched as a literal, so a ticket like "8000001046" or a
// phrase containing (brackets) cannot be read as a regular expression.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Display order for statuses and priorities, so sorting matches the dropdowns. */
async function sortRanks() {
  const values = await ListValue.find({}).select('kind label order').lean();
  const rank = { status: new Map(), priority: new Map() };
  for (const v of values) {
    const key = v.kind === LIST_KIND.STATUS ? 'status' : 'priority';
    rank[key].set(v.label, v.order);
  }
  return rank;
}

// ---------------------------------------------------------------------------
// GET /api/items  -  the grid
// ---------------------------------------------------------------------------
router.get('/', asyncRoute(async (req, res) => {
  const {
    projectId = 'all', status, priority, ownerId, mine, q,
    hideDone, sort = 'updatedAt', dir = 'desc', limit = '2000',
  } = req.query;

  const allowedProjectIds = await visibleProjectIds(req.user);

  // "all" means all of MY projects, never every project in the database.
  let scopeIds = allowedProjectIds;
  if (projectId && projectId !== 'all') {
    if (!allowedProjectIds.includes(String(projectId))) throw notFound('Project not found');
    scopeIds = [String(projectId)];
  }
  if (!scopeIds.length) {
    return res.json({
      ok: true,
      data: { items: [], total: 0, summary: { byStatus: {}, byPriority: {}, total: 0 } },
    });
  }

  // ---- base filter: scope + who + free text (this drives the summary chips)
  const base = { projectId: { $in: scopeIds } };
  if (ownerId) base.ownerId = ownerId;
  if (mine === 'true') base.$or = [{ ownerId: req.user.id }, { secondaryUserId: req.user.id }];

  if (q && String(q).trim()) {
    const rx = new RegExp(escapeRegex(String(q).trim()), 'i');
    // Search reaches into comment text too, so a phrase from a note finds its ticket.
    const hits = await Comment.find({ text: rx }).select('itemId').lean();
    const idsFromComments = [...new Set(hits.map((h) => String(h.itemId)))];
    const textOr = [{ ticketNumber: rx }, { title: rx }];
    if (idsFromComments.length) textOr.push({ _id: { $in: idsFromComments } });

    // Combine with "assigned to me" without either clause overwriting the other.
    if (base.$or) {
      base.$and = [{ $or: base.$or }, { $or: textOr }];
      delete base.$or;
    } else {
      base.$or = textOr;
    }
  }

  // ---- view filter: the chips and toggles the user has actually applied ----
  const view = { ...base };
  const statuses = list(status);
  const priorities = list(priority);
  if (statuses.length) view.status = { $in: statuses };
  if (priorities.length) view.priority = { $in: priorities };
  if (hideDone === 'true') {
    view.status = statuses.length
      ? { $in: statuses.filter((s) => !DONE_STATUSES.includes(s)) }
      : { $nin: DONE_STATUSES };
  }

  const [rows, summaryRows, names, rank] = await Promise.all([
    Item.find(view).limit(Number(limit) || 2000).lean(),
    Item.find(base).select('status priority').lean(),
    nameMaps(),
    sortRanks(),
  ]);

  const items = rows.map((r) => serializeItem(r, names));

  // ---- sort (priority and status follow the admin's configured order) ------
  const direction = dir === 'asc' ? 1 : -1;
  const keyOf = {
    ticketNumber: (i) => i.ticketNumber,
    title: (i) => i.title.toLowerCase(),
    priority: (i) => rank.priority.get(i.priority) ?? 999,
    status: (i) => rank.status.get(i.status) ?? 999,
    owner: (i) => (i.owner ? i.owner.label.toLowerCase() : ''),
    secondary: (i) => (i.secondaryLabel || '').toLowerCase(),
    project: (i) => (i.project ? i.project.label.toLowerCase() : ''),
    latestComment: (i) => (i.latestComment ? new Date(i.latestComment.at).getTime() : 0),
    updatedAt: (i) => new Date(i.updatedAt).getTime(),
    createdAt: (i) => new Date(i.createdAt).getTime(),
    dueDate: (i) => (i.dueDate ? new Date(i.dueDate).getTime() : Infinity),
  }[sort] || ((i) => new Date(i.updatedAt).getTime());

  items.sort((a, b) => {
    const av = keyOf(a);
    const bv = keyOf(b);
    if (av < bv) return -direction;
    if (av > bv) return direction;
    return a.ticketNumber.localeCompare(b.ticketNumber);
  });

  // ---- summary chips. Status and priority filters are deliberately left out
  //      so that clicking one chip does not zero out all the others. ---------
  const byStatus = {};
  const byPriority = {};
  for (const r of summaryRows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
  }

  res.json({
    ok: true,
    data: {
      items,
      total: items.length,
      summary: { byStatus, byPriority, total: summaryRows.length },
    },
  });
}));

// ---------------------------------------------------------------------------
// GET /api/items/:id
// ---------------------------------------------------------------------------
router.get('/:id', asyncRoute(async (req, res) => {
  const { item, ctx } = await requireItem(req.params.id);
  if (!can(req.user, 'item.view', ctx)) throw notFound('Item not found');

  const names = await nameMaps();
  res.json({
    ok: true,
    data: {
      ...serializeItem(item, names),
      // Tell the UI exactly what this user may do, so it never offers a control
      // that the server is going to reject.
      permissions: {
        editFull: can(req.user, 'item.editFull', ctx),
        editLimited: can(req.user, 'item.editLimited', ctx),
        delete: can(req.user, 'item.delete', ctx),
        comment: can(req.user, 'comment.create', ctx),
        editableFields: editableFields(req.user, ctx, EMPLOYEE_EDITABLE_FIELDS),
      },
    },
  });
}));

// ---------------------------------------------------------------------------
// GET /api/items/:id/audit  -  the "Change history" tab
// ---------------------------------------------------------------------------
router.get('/:id/audit', asyncRoute(async (req, res) => {
  const { ctx } = await requireItem(req.params.id);
  if (!can(req.user, 'item.view', ctx)) throw notFound('Item not found');

  const rows = await AuditLog.find({ itemId: req.params.id }).sort({ at: -1 }).limit(500).lean();
  const names = await nameMaps();
  res.json({ ok: true, data: rows.map((r) => serializeAudit(r, names)) });
}));

// ---------------------------------------------------------------------------
// POST /api/items
// ---------------------------------------------------------------------------
router.post('/', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!body.projectId) throw badRequest('Choose a project');

  const { project, ctx } = await requireProject(body.projectId);
  if (!can(req.user, 'item.create', ctx)) throw forbidden('You cannot add items to this project');

  const ticketNumber = String(body.ticketNumber || '').trim();
  const title = String(body.title || '').trim();
  if (!ticketNumber) throw badRequest('Ticket number is required');
  if (!title) throw badRequest('Title is required');

  const clash = await Item.findOne({ projectId: project._id, ticketNumber });
  if (clash) throw badRequest('Ticket ' + ticketNumber + ' already exists in ' + project.name);

  const secondaryKind = body.secondaryKind || SECONDARY_KIND.TEAM;
  const item = await Item.create({
    projectId: project._id,
    ticketNumber,
    title,
    priority: body.priority,
    status: body.status,
    ownerId: body.ownerId || req.user.id,
    secondaryKind,
    secondaryUserId: secondaryKind === SECONDARY_KIND.USER ? (body.secondaryUserId || null) : null,
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  await recordEvent({
    itemId: item._id,
    projectId: project._id,
    field: 'created',
    fieldLabel: 'Item created',
    newValue: ticketNumber + ' - ' + title,
    user: req.user,
  });

  const names = await nameMaps();
  res.status(201).json({ ok: true, data: serializeItem(item, names) });
}));

// ---------------------------------------------------------------------------
// PATCH /api/items/:id  -  filtered field-by-field by role, then audited
// ---------------------------------------------------------------------------
router.patch('/:id', asyncRoute(async (req, res) => {
  const { item, ctx } = await requireItem(req.params.id);
  if (!can(req.user, 'item.view', ctx)) throw notFound('Item not found');

  const allowed = editableFields(req.user, ctx, EMPLOYEE_EDITABLE_FIELDS);
  if (!allowed.length) throw forbidden('You can only change items you own or are secondary on');

  const body = req.body || {};
  const rejected = Object.keys(body).filter((k) => !allowed.includes(k));
  if (rejected.length) throw forbidden('You cannot change: ' + rejected.join(', '));

  const before = snapshot(item);

  // Apply only the allowed fields, with the same validation as create.
  if ('ticketNumber' in body) {
    const value = String(body.ticketNumber).trim();
    if (!value) throw badRequest('Ticket number is required');
    const clash = await Item.findOne({
      projectId: item.projectId, ticketNumber: value, _id: { $ne: item._id },
    });
    if (clash) throw badRequest('Ticket ' + value + ' already exists in this project');
    item.ticketNumber = value;
  }
  if ('title' in body) {
    const value = String(body.title).trim();
    if (!value) throw badRequest('Title is required');
    item.title = value;
  }
  if ('projectId' in body && String(body.projectId) !== String(item.projectId)) {
    const target = await Project.findById(body.projectId).catch(() => null);
    if (!target) throw badRequest('Target project not found');
    const clash = await Item.findOne({ projectId: target._id, ticketNumber: item.ticketNumber });
    if (clash) throw badRequest('Ticket ' + item.ticketNumber + ' already exists in ' + target.name);
    item.projectId = target._id;
  }
  if ('priority' in body) item.priority = body.priority;
  if ('status' in body) item.status = body.status;
  if ('ownerId' in body) item.ownerId = body.ownerId;
  if ('secondaryKind' in body) {
    item.secondaryKind = body.secondaryKind;
    if (body.secondaryKind !== SECONDARY_KIND.USER) item.secondaryUserId = null;
  }
  if ('secondaryUserId' in body && item.secondaryKind === SECONDARY_KIND.USER) {
    item.secondaryUserId = body.secondaryUserId || null;
  }
  if ('dueDate' in body) item.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  item.updatedBy = req.user.id;
  await item.save();

  const names = await nameMaps();
  const changes = await diffItem({
    before, after: snapshot(item), user: req.user, projectNameMap: names.projectNames,
  });

  res.json({
    ok: true,
    data: serializeItem(item, names),
    meta: { changesRecorded: changes.length },
  });
}));

// ---------------------------------------------------------------------------
// DELETE /api/items/:id  -  admin only; takes its comments and audit with it
// ---------------------------------------------------------------------------
router.delete('/:id', asyncRoute(async (req, res) => {
  const { item, ctx } = await requireItem(req.params.id);
  if (!can(req.user, 'item.delete', ctx)) throw forbidden('Only an admin can delete items');

  await Promise.all([
    Comment.deleteMany({ itemId: item._id }),
    AuditLog.deleteMany({ itemId: item._id }),
  ]);
  await item.deleteOne();

  res.json({ ok: true, data: { id: String(item._id), deleted: true } });
}));

export default router;
