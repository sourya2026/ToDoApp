// =============================================================================
// Express application entry point.
// =============================================================================
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import config from './config.js';
import { connectDb } from './db.js';
import { attachRequestId, notFoundHandler, errorHandler } from './middleware/error.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import projectRoutes from './routes/projects.js';
import itemRoutes from './routes/items.js';
import commentRoutes from './routes/comments.js';
import listRoutes from './routes/lists.js';
import auditRoutes from './routes/audit.js';
import importRoutes from './routes/importer.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Same-origin requests never reach this; it only matters for the Vite dev
  // server, or a client deployed on its own domain.
  app.use(cors({
    origin: config.clientOrigins.length ? config.clientOrigins : false,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'X-Warning'],
  }));
  app.use(express.json({ limit: '10mb' })); // generous: the importer posts parsed sheets
  app.use(attachRequestId);

  app.get('/api/health', (_req, res) => res.json({ ok: true, data: { status: 'up', time: new Date() } }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/lists', listRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/admin', adminRoutes);
  // Comment routes carry their own /items/:id/comments and /comments/:id paths.
  app.use('/api', commentRoutes);

  // In production the built client is served from the same origin, so a
  // bookmarked detail URL such as /items/abc123 loads on a hard refresh.
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/**
 * First deploy convenience: if SEED_ON_EMPTY is set and the database has no
 * users at all, lay down the demo content so the site is usable the moment it
 * comes up. It never touches a database that already has users, so leaving the
 * flag on cannot wipe real data.
 */
async function seedIfEmpty() {
  if (process.env.SEED_ON_EMPTY !== 'true') return;
  const { User } = await import('./models/index.js');
  if (await User.countDocuments() > 0) {
    console.log('[seed] database already has users - leaving it alone');
    return;
  }
  console.log('[seed] empty database, laying down the sample data');
  const { seedDatabase } = await import('./seed-data.js');
  await seedDatabase();
}

// Only listen when run directly, so tests can import createApp() on their own port.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  try {
    await connectDb();
    await seedIfEmpty();
    const app = createApp();
    // Bind 0.0.0.0, not localhost: a container host (Render, Docker) routes
    // traffic to the container's external interface.
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`[api] listening on port ${config.port}`);
      if (!config.isProd) console.log(`[api] allowing the web client at ${config.clientOrigins.join(', ')}`);
    });
  } catch (err) {
    console.error('[api] failed to start:', err.message);
    process.exit(1);
  }
}
