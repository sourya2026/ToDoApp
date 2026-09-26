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

export default config;
