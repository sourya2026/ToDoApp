// =============================================================================
// Error handling  -  one JSON shape for every failure, with a request id the
// user can quote and the server log can be grepped for.
// =============================================================================
import { randomUUID } from 'node:crypto';

export function attachRequestId(req, res, next) {
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  next();
}

export function notFoundHandler(req, _res, next) {
  next(Object.assign(new Error(`No route for ${req.method} ${req.path}`), { status: 404 }));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(`[${req.id}] ${req.method} ${req.originalUrl}`, err);

  // Duplicate key -> the ticket number is already used in that project.
  if (err.code === 11000) {
    return res.status(409).json({
      ok: false,
      error: 'That ticket number already exists in this project',
      details: err.keyValue,
      requestId: req.id,
    });
  }

  res.status(status).json({
    ok: false,
    error: status >= 500 ? 'Something went wrong on the server' : err.message,
    details: err.details,
    requestId: req.id,
  });
}
