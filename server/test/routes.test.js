// =============================================================================
// Guard for the client's route registry.
//
// RecordLink knows only an entity type and an id - it has no project to reason
// about. So every permission named here must be answerable with an EMPTY
// context. A context-dependent action (item.view needs a project) silently
// evaluates to false and turns every identifier on screen into plain text,
// which is the exact dead end the registry exists to prevent. That regression
// is invisible to the source-scanning audit, so it is asserted here.
// =============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ENTITY_ROUTES, linkTo } from '../../client/src/lib/entityRoutes.js';
import { can, ROLES } from '@todo/shared';

const ADMIN = { id: 'a1', role: ROLES.ADMIN, active: true };
const EMPLOYEE = { id: 'e1', role: ROLES.EMPLOYEE, active: true };

describe('client route registry', () => {
  test('every record type resolves to a URL', () => {
    for (const [type, route] of Object.entries(ENTITY_ROUTES)) {
      const url = linkTo(type, 'abc123');
      assert.match(url, /^\//, type + ' builds an absolute path');
      assert.ok(url.includes('abc123'), type + ' includes the id');
    }
  });

  test('an unknown entity type throws rather than returning a silent "#"', () => {
    assert.throws(() => linkTo('unicorn', '1'), /no route registered/);
  });

  test('ids are encoded, so an odd id cannot break out of the path', () => {
    assert.ok(!linkTo('item', 'a/b?c').includes('?c'));
  });

  test('item and project links survive an empty permission context', () => {
    // The regression: these rendered as plain text for every user.
    for (const type of ['item', 'project']) {
      const { permission } = ENTITY_ROUTES[type];
      const allowed = permission === null || can(EMPLOYEE, permission, {});
      assert.equal(allowed, true, type + ' must be linkable for an employee');
      assert.equal(permission === null || can(ADMIN, permission, {}), true,
        type + ' must be linkable for an admin');
    }
  });

  test('a named permission is context-free, i.e. it answers with {} passed in', () => {
    for (const [type, route] of Object.entries(ENTITY_ROUTES)) {
      if (route.permission === null) continue;
      // It must not throw, and it must give the same answer with no context
      // as it does with an empty object - otherwise it is context-dependent.
      const a = can(ADMIN, route.permission, {});
      const b = can(ADMIN, route.permission);
      assert.equal(a, b, type + ': permission "' + route.permission + '" depends on context');
      assert.equal(typeof a, 'boolean');
    }
  });

  test('the employee link stays admin-only', () => {
    assert.equal(can(ADMIN, ENTITY_ROUTES.employee.permission, {}), true);
    assert.equal(can(EMPLOYEE, ENTITY_ROUTES.employee.permission, {}), false);
  });
});
