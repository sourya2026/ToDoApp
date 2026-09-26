// =============================================================================
// ROUTE REGISTRY  -  the only place a record URL is written down.
//
// Every link in the app is built from this map through linkTo() or the
// RecordLink component, so moving a route is a one-line change here and no
// screen can quietly hand-write a URL that later rots.
// =============================================================================

/**
 * `permission` here must be a CONTEXT-FREE check, because a link only knows
 * the entity type and id - it has no project to reason about.
 *
 * Items and projects therefore need no permission at all: the API only ever
 * sends a user records from their own projects, so anything on screen is
 * already theirs to open, and the destination re-checks and answers 404 if it
 * is not. Using a context-dependent action here (item.view needs a project)
 * silently evaluated to false and turned every ticket number into plain text.
 */
export const ENTITY_ROUTES = {
  item: { path: (id) => '/items/' + id, permission: null },
  project: { path: (id) => '/projects/' + id, permission: null },
  // Employees have no detail page of their own; the admin screen focuses the row.
  employee: { path: (id) => '/admin/employees?focus=' + id, permission: 'user.manage' },
};

export function linkTo(type, id) {
  const route = ENTITY_ROUTES[type];
  // Throw rather than return '#': an unknown type is a developer error, and a
  // silent '#' link is exactly the dead end this registry exists to prevent.
  if (!route) throw new Error('linkTo: no route registered for entity type "' + type + '"');
  return route.path(encodeURIComponent(id));
}

export const hasRoute = (type) => Boolean(ENTITY_ROUTES[type]);
