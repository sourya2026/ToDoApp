// =============================================================================
// ROUTES: comments  -  append-only history.
//
// A comment is never overwritten. The author may correct their own within 15
// minutes; doing so keeps the previous text in versions[]. After that it locks,
// for everyone, admins included.
// =============================================================================
import { Router } from 'express';
import { Comment } from '../models/index.js';
import { asyncRoute, badRequest, notFound, forbidden } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { serializeComment } from '../lib/serialize.js';
import { nameMaps } from '../lib/scope.js';
import { requireItem } from '../lib/context.js';
import { addComment, refreshLatestComment } from '../lib/comments.js';
import { can, commentEditMsLeft } from '@todo/shared';

const router = Router();
router.use(requireAuth);

/** Newest first, as the detail panel shows them. */
router.get('/items/:itemId/comments', asyncRoute(async (req, res) => {
  const { ctx } = await requireItem(req.params.itemId);
  if (!can(req.user, 'item.view', ctx)) throw notFound('Item not found');

  const comments = await Comment.find({ itemId: req.params.itemId }).sort({ createdAt: -1 }).lean();
  const { userNames } = await nameMaps();

  res.json({
    ok: true,
    data: comments.map((c) => ({
      ...serializeComment(c, userNames),
      // The UI shows a countdown instead of guessing when the lock falls.
      canEdit: can(req.user, 'comment.edit', { comment: { authorId: c.authorId, createdAt: c.createdAt } }),
      editMsLeft: commentEditMsLeft({ createdAt: c.createdAt }),
    })),
  });
}));

router.post('/items/:itemId/comments', asyncRoute(async (req, res) => {
  const { ctx } = await requireItem(req.params.itemId);
  // Invisible first, forbidden second: an item outside the user's projects
  // must read as missing, or the response confirms that it exists.
  if (!can(req.user, 'item.view', ctx)) throw notFound('Item not found');
  if (!can(req.user, 'comment.create', ctx)) throw forbidden('You cannot comment on this item');

  const text = String(req.body?.text ?? '').trim();
  if (!text) throw badRequest('Write something before adding the comment');

  const comment = await addComment({
    itemId: req.params.itemId,
    text,
    authorId: req.user.id,
  });

  const { userNames } = await nameMaps();
  res.status(201).json({
    ok: true,
    data: { ...serializeComment(comment, userNames), canEdit: true, editMsLeft: commentEditMsLeft(comment) },
  });
}));

router.patch('/comments/:id', asyncRoute(async (req, res) => {
  const comment = await Comment.findById(req.params.id).catch(() => null);
  if (!comment) throw notFound('Comment not found');

  const { ctx } = await requireItem(comment.itemId);
  if (!can(req.user, 'item.view', ctx)) throw notFound('Comment not found');

  const allowed = can(req.user, 'comment.edit', {
    comment: { authorId: comment.authorId, createdAt: comment.createdAt },
  });
  if (!allowed) throw forbidden('This comment is locked - add a new comment instead');

  const text = String(req.body?.text ?? '').trim();
  if (!text) throw badRequest('A comment cannot be emptied');

  // Keep the superseded text; the history is a record, not a draft.
  comment.versions.push({ text: comment.text, replacedAt: new Date() });
  comment.text = text;
  comment.editedAt = new Date();
  await comment.save();

  await refreshLatestComment(comment.itemId);

  const { userNames } = await nameMaps();
  res.json({
    ok: true,
    data: {
      ...serializeComment(comment, userNames),
      canEdit: true,
      editMsLeft: commentEditMsLeft(comment),
    },
  });
}));

export default router;
