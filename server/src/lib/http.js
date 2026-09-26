// =============================================================================
// HTTP helpers  -  typed errors and an async wrapper so no route swallows a
// rejection and leaves the client's panel spinning forever (NAV-10).
// =============================================================================

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Sign in required') => new ApiError(401, msg);
/**
 * Out-of-scope records answer 404, not 403: a user must not be able to learn
 * that a record exists by probing its URL.
 */
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const forbidden = (msg = 'You do not have permission to do that') => new ApiError(403, msg);
export const conflict = (msg, details) => new ApiError(409, msg, details);

/** Wrap an async route handler so thrown errors reach the error middleware. */
export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
