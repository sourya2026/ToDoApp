// =============================================================================
// DATA LAYER  -  every call to the server goes through this file.
//
// Nothing else in the UI knows a URL, a header or the response envelope.
// Each request carries an abort signal and a timeout, so no panel can be left
// spinning when the network stalls.
// =============================================================================

const TOKEN_KEY = 'todo.token';
const DEFAULT_TIMEOUT = 15000;

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (token) => {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
};

/** Errors carry the status and the server's request id, for the error panel. */
export class ApiError extends Error {
  constructor(message, { status, requestId, details } = {}) {
    super(message);
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

/** Fires when a request comes back 401, so the app can return to the login screen. */
const listeners = new Set();
export const onUnauthorized = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

async function request(method, path, { body, signal, timeout = DEFAULT_TIMEOUT } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeout);
  // Honour a caller's own signal (panel unmount) as well as our timeout.
  if (signal) signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

  const token = getToken();
  try {
    const res = await fetch('/api' + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = await res.json().catch(() => ({}));

    if (res.status === 401) {
      setToken(null);
      listeners.forEach((fn) => fn());
    }
    if (!res.ok) {
      throw new ApiError(payload.error || 'Request failed (' + res.status + ')', {
        status: res.status,
        requestId: payload.requestId || res.headers.get('X-Request-Id'),
        details: payload.details,
      });
    }

    return { data: payload.data, meta: payload.meta, warning: res.headers.get('X-Warning') };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (controller.signal.reason === 'timeout') {
      throw new ApiError('This is taking too long - the server did not respond.', { status: 0 });
    }
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Is the API running on port 4000?', { status: 0 });
  } finally {
    clearTimeout(timer);
  }
}

const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) search.set(k, String(v));
  });
  const s = search.toString();
  return s ? '?' + s : '';
};

export const api = {
  // ---- auth -------------------------------------------------------------
  loginUsers: (opts) => request('GET', '/auth/users', opts),
  login: (userId, pin) => request('POST', '/auth/login', { body: { userId, pin } }),
  me: (opts) => request('GET', '/auth/me', opts),

  // ---- config -----------------------------------------------------------
  lists: (includeInactive, opts) => request('GET', '/lists' + qs({ includeInactive }), opts),
  createListValue: (body) => request('POST', '/lists', { body }),
  updateListValue: (id, body) => request('PATCH', '/lists/' + id, { body }),
  reorderList: (kind, ids) => request('POST', '/lists/reorder', { body: { kind, ids } }),

  // ---- people -----------------------------------------------------------
  users: (includeInactive, opts) => request('GET', '/users' + qs({ includeInactive }), opts),
  createUser: (body) => request('POST', '/users', { body }),
  updateUser: (id, body) => request('PATCH', '/users/' + id, { body }),

  // ---- projects ---------------------------------------------------------
  projects: (opts) => request('GET', '/projects', opts),
  project: (id, opts) => request('GET', '/projects/' + id, opts),
  createProject: (body) => request('POST', '/projects', { body }),
  updateProject: (id, body) => request('PATCH', '/projects/' + id, { body }),

  // ---- items ------------------------------------------------------------
  items: (params, opts) => request('GET', '/items' + qs(params), opts),
  item: (id, opts) => request('GET', '/items/' + id, opts),
  createItem: (body) => request('POST', '/items', { body }),
  updateItem: (id, body) => request('PATCH', '/items/' + id, { body }),
  deleteItem: (id) => request('DELETE', '/items/' + id),
  itemAudit: (id, opts) => request('GET', '/items/' + id + '/audit', opts),

  // ---- comments ---------------------------------------------------------
  comments: (itemId, opts) => request('GET', '/items/' + itemId + '/comments', opts),
  addComment: (itemId, text) => request('POST', '/items/' + itemId + '/comments', { body: { text } }),
  updateComment: (id, text) => request('PATCH', '/comments/' + id, { body: { text } }),

  // ---- admin ------------------------------------------------------------
  audit: (params, opts) => request('GET', '/audit' + qs(params), opts),
  import: (rows, options) => request('POST', '/import', { body: { rows, options }, timeout: 120000 }),
  resetDemo: () => request('POST', '/admin/reset-demo', { timeout: 60000 }),
};
