// =============================================================================
// ROUTES: /api/admin  -  maintenance actions, admin only.
// =============================================================================
import { Router } from 'express';
import { asyncRoute } from '../lib/http.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { seedDatabase } from '../seed-data.js';
import { User } from '../models/index.js';
import { signToken } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/**
 * Wipe everything and rebuild the demo content.
 * The current session's user is destroyed along with the rest, so a fresh
 * token for the rebuilt Admin account is returned and the UI signs straight
 * back in instead of dumping the user on an "expired session" screen.
 */
router.post('/reset-demo', requirePermission('demo.reset'), asyncRoute(async (_req, res) => {
  const counts = await seedDatabase({ log: () => {} });
  const admin = await User.findOne({ name: 'Admin' });

  res.json({
    ok: true,
    data: {
      counts,
      token: admin ? signToken(admin) : null,
      user: admin ? { id: String(admin._id), name: admin.name, role: admin.role, active: admin.active } : null,
    },
  });
}));

export default router;
