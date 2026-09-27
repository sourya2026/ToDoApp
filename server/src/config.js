// =============================================================================
// CONFIG  -  every environment knob in one place
// =============================================================================
import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/todo_tracker',
  // Render (and most hosts) inject the port to bind. Never hard-code it there.
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: '12h',

  /**
   * Browsers only send a CORS preflight for a DIFFERENT origin. In production
   * the API and the built client are served from one origin, so this list is
   * normally empty and nothing cross-origin is allowed at all. In development
   * the Vite dev server is a separate origin, hence the default.
   * Accepts a comma-separated list.
   */
  clientOrigins: (process.env.CLIENT_ORIGIN || (isProd ? '' : 'http://localhost:5173'))
    .split(',').map((s) => s.trim()).filter(Boolean),

  isProd,
};

if (isProd && config.jwtSecret === 'dev-only-secret-change-me') {
  console.warn('[config] JWT_SECRET is not set - sessions are signed with a public default. Set it.');
}

/**
 * Fail loudly and specifically in production.
 *
 * Without this, a missing MONGO_URL silently falls back to localhost, and the
 * deploy dies 5 seconds later with "could not reach MongoDB at
 * mongodb://localhost:27017" - which looks like a database problem when it is
 * actually an unset environment variable.
 */
export function assertDeployable() {
  if (!isProd) return;
  const problems = [];

  if (!process.env.MONGO_URL) {
    problems.push('MONGO_URL is not set. Add your MongoDB Atlas connection string '
      + 'in the Render dashboard under Environment.');
  } else if (!/^mongodb(\+srv)?:\/\//.test(process.env.MONGO_URL)) {
    problems.push('MONGO_URL does not look like a connection string '
      + '(it should start with "mongodb+srv://" or "mongodb://").');
  } else if (!/mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(process.env.MONGO_URL)) {
    problems.push('MONGO_URL has no database name. Add one before the "?", '
      + 'e.g. ...mongodb.net/todo_tracker?retryWrites=true - otherwise everything '
      + 'is written to a database called "test".');
  }

  if (problems.length) {
    console.error('\n[config] cannot start:\n' + problems.map((p) => '  - ' + p).join('\n') + '\n');
    process.exit(1);
  }
}

export default config;
