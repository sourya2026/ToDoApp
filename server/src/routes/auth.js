// =============================================================================
// ROUTES: /api/auth  -  pick a user, enter a PIN.
// =============================================================================
import { Router } from 'express';
import { User } from '../models/index.js';
import { asyncRoute, badRequest, unauthorized } from '../lib/http.js';
import { checkPin, signToken, requireAuth } from '../middleware/auth.js';
import { serializeUser } from '../lib/serialize.js';

const router = Router();

/** The login screen's user picker - names only, no PINs. */
router.get('/users', asyncRoute(async (_req, res) => {
  const users = await User.find({ active: true }).sort({ role: 1, name: 1 }).lean();
  res.json({ ok: true, data: users.map((u) => ({ id: String(u._id), name: u.name, role: u.role })) });
}));

router.post('/login', asyncRoute(async (req, res) => {
  const { userId, pin } = req.body || {};
  if (!userId || !pin) throw badRequest('Choose a user and enter your PIN');

  const user = await User.findById(userId).catch(() => null);
  // One message for "no such user", "deactivated" and "wrong PIN", so the login
  // screen cannot be used to enumerate accounts.
  const okPin = user && user.active && await checkPin(pin, user.pinHash);
  if (!okPin) throw unauthorized('That PIN is not correct');

  res.json({ ok: true, data: { token: signToken(user), user: serializeUser(user) } });
}));

router.get('/me', requireAuth, asyncRoute(async (req, res) => {
  res.json({ ok: true, data: serializeUser(req.userDoc) });
}));

export default router;
