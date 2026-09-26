// =============================================================================
// ROUTES: /api/audit  -  the global change log (admin only), filterable by
// project, person and date range.
// =============================================================================
import { Router } from 'express';
import { AuditLog, Item } from '../models/index.js';
import { asyncRoute } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { serializeAudit } from '../lib/serialize.js';
import { nameMaps } from '../lib/scope.js';

const router = Router();
router.use(requireAuth, requirePermission('audit.viewGlobal'));

router.get('/', asyncRoute(async (req, res) => {
  const { projectId, changedBy, from, to, limit = '500' } = req.query;

  const filter = {};
  if (projectId && projectId !== 'all') filter.projectId = projectId;
  if (changedBy && changedBy !== 'all') filter.changedBy = changedBy;
  if (from || to) {
    filter.at = {};
    if (from) filter.at.$gte = new Date(from);
    // "to" is an inclusive day: take everything before the next midnight.
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.at.$lte = end;
    }
  }

  const rows = await AuditLog.find(filter).sort({ at: -1 }).limit(Number(limit) || 500).lean();

  // Label each row's item so the log links straight to the ticket it changed.
  const itemIds = [...new Set(rows.map((r) => String(r.itemId)).filter(Boolean))];
  const items = await Item.find({ _id: { $in: itemIds } }).select('ticketNumber title').lean();
  const itemLabels = new Map(items.map((i) => [String(i._id), i.ticketNumber + ' - ' + i.title]));

  const names = await nameMaps();
  res.json({
    ok: true,
    data: rows.map((r) => serializeAudit({ ...r, itemLabel: itemLabels.get(String(r.itemId)) }, names)),
    meta: { count: rows.length, limit: Number(limit) || 500 },
  });
}));

export default router;
