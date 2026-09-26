// =============================================================================
// ROUTES: /api/import  -  bring an Excel/CSV sheet in.
//
// The client parses the workbook (SheetJS) and posts plain rows here, so the
// server never has to deal with file uploads or spreadsheet formats.
//
// Every row is matched on (Project, Ticket No). Multi-line comment cells are
// split into separate dated entries by splitDatedComments(), and an entry that
// already exists with the same date and text is skipped, so re-importing the
// same sheet does not duplicate history.
// =============================================================================
import { Router } from 'express';
import { Item, Project, User, Comment, ListValue } from '../models/index.js';
import { asyncRoute, badRequest } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { splitDatedComments, refreshLatestComment } from '../lib/comments.js';
import { recordEvent } from '../lib/audit.js';
import { LIST_KIND, SECONDARY_KIND } from '@todo/shared';

const router = Router();
router.use(requireAuth, requirePermission('import.run'));

const norm = (v) => String(v ?? '').trim();
const lower = (v) => norm(v).toLowerCase();

router.post('/', asyncRoute(async (req, res) => {
  const rows = req.body?.rows;
  const options = req.body?.options || {};
  if (!Array.isArray(rows) || !rows.length) throw badRequest('No rows to import');
  if (rows.length > 5000) throw badRequest('That is more than 5000 rows - split the file');

  // ---- look-ups, loaded once -------------------------------------------
  const [projects, users, listValues] = await Promise.all([
    Project.find({}).lean(),
    User.find({}).lean(),
    ListValue.find({}).lean(),
  ]);
  const projectByName = new Map(projects.map((p) => [lower(p.name), p]));
  const userByName = new Map(users.map((u) => [lower(u.name), u]));
  const statuses = listValues.filter((v) => v.kind === LIST_KIND.STATUS);
  const priorities = listValues.filter((v) => v.kind === LIST_KIND.PRIORITY);
  const statusByName = new Map(statuses.map((v) => [lower(v.label), v.label]));
  const priorityByName = new Map(priorities.map((v) => [lower(v.label), v.label]));
  const defaultStatus = (statuses.find((v) => v.active) || statuses[0] || {}).label || 'New';
  const defaultPriority = (priorities.find((v) => lower(v.label) === 'medium')
    || priorities.find((v) => v.active) || priorities[0] || {}).label || 'Medium';

  const report = {
    projectsCreated: 0, itemsCreated: 0, itemsUpdated: 0,
    commentsAdded: 0, skipped: 0, warnings: [], errors: [],
  };
  const touchedItemIds = new Set();

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const rowNo = index + 2; // +2: sheets are 1-based and row 1 is the header
    try {
      const projectName = norm(row.project);
      const ticketNumber = norm(row.ticketNumber);
      const title = norm(row.title);

      if (!projectName || !ticketNumber) {
        report.skipped++;
        report.errors.push({ row: rowNo, message: 'Project and Ticket No are both required' });
        continue;
      }

      // ---- project -----------------------------------------------------
      let project = projectByName.get(lower(projectName));
      if (!project) {
        if (!options.createMissingProjects) {
          report.skipped++;
          report.errors.push({ row: rowNo, message: `Project "${projectName}" does not exist` });
          continue;
        }
        project = (await Project.create({
          name: projectName, client: '', assignedUserIds: [], createdBy: req.user.id,
        })).toObject();
        projectByName.set(lower(projectName), project);
        report.projectsCreated++;
      }

      // ---- people ------------------------------------------------------
      const ownerName = norm(row.owner);
      const owner = userByName.get(lower(ownerName));
      if (ownerName && !owner) {
        report.warnings.push({ row: rowNo, message: `Unknown person "${ownerName}" - owner set to you` });
      }

      const secondaryRaw = norm(row.secondary);
      let secondaryKind = SECONDARY_KIND.NONE;
      let secondaryUserId = null;
      if (lower(secondaryRaw) === 'team') {
        secondaryKind = SECONDARY_KIND.TEAM;
      } else if (secondaryRaw) {
        const secondaryUser = userByName.get(lower(secondaryRaw));
        if (secondaryUser) {
          secondaryKind = SECONDARY_KIND.USER;
          secondaryUserId = secondaryUser._id;
        } else {
          report.warnings.push({ row: rowNo, message: `Unknown secondary "${secondaryRaw}" - left blank` });
        }
      }

      // ---- list values: keep the sheet's value only if it is configured --
      const priority = priorityByName.get(lower(row.priority)) || defaultPriority;
      if (norm(row.priority) && !priorityByName.get(lower(row.priority))) {
        report.warnings.push({ row: rowNo, message: `Unknown priority "${norm(row.priority)}" - used ${defaultPriority}` });
      }
      const status = statusByName.get(lower(row.status)) || defaultStatus;
      if (norm(row.status) && !statusByName.get(lower(row.status))) {
        report.warnings.push({ row: rowNo, message: `Unknown status "${norm(row.status)}" - used ${defaultStatus}` });
      }

      // ---- item: create or update -----------------------------------------
      let item = await Item.findOne({ projectId: project._id, ticketNumber });
      if (!item) {
        item = await Item.create({
          projectId: project._id,
          ticketNumber,
          title: title || ticketNumber,
          priority,
          status,
          ownerId: owner ? owner._id : req.user.id,
          secondaryKind,
          secondaryUserId,
          createdBy: req.user.id,
          updatedBy: req.user.id,
        });
        report.itemsCreated++;
        await recordEvent({
          itemId: item._id, projectId: project._id, field: 'created',
          fieldLabel: 'Imported from spreadsheet',
          newValue: ticketNumber + ' - ' + (title || ticketNumber), user: req.user,
        });
      } else if (options.updateExisting !== false) {
        if (title) item.title = title;
        item.priority = priority;
        item.status = status;
        if (owner) item.ownerId = owner._id;
        if (secondaryRaw) {
          item.secondaryKind = secondaryKind;
          item.secondaryUserId = secondaryUserId;
        }
        item.updatedBy = req.user.id;
        await item.save();
        report.itemsUpdated++;
      }
      touchedItemIds.add(String(item._id));

      // ---- comments: one entry per dated block --------------------------
      const entries = splitDatedComments(row.comments, { baseYear: options.baseYear });
      if (entries.length) {
        const existing = await Comment.find({ itemId: item._id }).select('text createdAt').lean();
        const seen = new Set(existing.map((c) => {
          const day = c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '';
          return day + '|' + c.text.trim();
        }));

        for (const entry of entries) {
          const at = entry.at || new Date();
          const key = at.toISOString().slice(0, 10) + '|' + entry.text;
          // Re-importing the same sheet must not duplicate the history.
          if (seen.has(key)) continue;
          seen.add(key);

          await Comment.create({
            itemId: item._id,
            text: entry.text,
            authorId: owner ? owner._id : req.user.id,
            createdAt: at,
            updatedAt: at,
          });
          report.commentsAdded++;
        }
      }
    } catch (err) {
      report.skipped++;
      report.errors.push({ row: rowNo, message: err.message });
    }
  }

  // Refresh the denormalised "latest comment" columns for everything touched.
  for (const id of touchedItemIds) await refreshLatestComment(id);

  res.json({ ok: true, data: report });
}));

export default router;
