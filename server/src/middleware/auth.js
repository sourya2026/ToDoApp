// =============================================================================
// AUTH  -  user + PIN sign-in, JWT session, and the route guards.
// =============================================================================
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import config from '../config.js';
import { User } from '../models/index.js';
import { unauthorized, forbidden } from '../lib/http.js';
import { can } from '@todo/shared';

export const hashPin = (pin) => bcrypt.hash(String(pin), 10);
export const checkPin = (pin, hash) => bcrypt.compare(String(pin), hash);

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

/** Populates req.user from the Bearer token. Rejects deactivated accounts. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Your session has expired, please sign in again');
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw unauthorized('This account is no longer active');

    req.user = { id: String(user._id), name: user.name, role: user.role, active: user.active };
    req.userDoc = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Guard a whole route with a global (context-free) permission, e.g. 'user.manage'. */
export const requirePermission = (action) => (req, _res, next) => {
  if (!can(req.user, action)) return next(forbidden());
  next();
};
