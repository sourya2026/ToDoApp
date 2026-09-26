// =============================================================================
// API tests - run against a throwaway in-memory MongoDB.
//
//   npm test
//
// They cover the rules that are expensive to get wrong: project scoping,
// field-level edit permissions, the append-only comment history, and the
// audit log.
// =============================================================================
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { connectDb, disconnectDb } from '../src/db.js';
import { seedDatabase } from '../src/seed-data.js';
import { createApp } from '../src/index.js';

let mongo;
let server;
let base;

/** Minimal HTTP helper: returns { status, body }. */
async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const signIn = async (name) => {
  const users = await call('GET', '/api/auth/users');
  const user = users.body.data.find((u) => u.name === name);
  assert.ok(user, 'seed user ' + name + ' exists');
  const res = await call('POST', '/api/auth/login', { body: { userId: user.id, pin: '1234' } });
  assert.equal(res.status, 200, 'login as ' + name);
  return res.body.data.token;
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(mongo.getUri('todo_test'));
  await seedDatabase({ log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  server.close();
  await disconnectDb();
  await mongo.stop();
});

describe('authentication', () => {
  test('a wrong PIN is rejected', async () => {
    const users = await call('GET', '/api/auth/users');
    const admin = users.body.data.find((u) => u.name === 'Admin');
    const res = await call('POST', '/api/auth/login', { body: { userId: admin.id, pin: '9999' } });
    assert.equal(res.status, 401);
  });

  test('the user list never exposes a PIN hash', async () => {
    const res = await call('GET', '/api/auth/users');
    assert.equal(res.status, 200);
    for (const u of res.body.data) assert.equal(u.pinHash, undefined);
  });

  test('an unauthenticated request is refused', async () => {
    const res = await call('GET', '/api/items');
    assert.equal(res.status, 401);
  });
});

describe('project scoping', () => {
  test('an admin sees every project', async () => {
    const token = await signIn('Admin');
    const res = await call('GET', '/api/projects', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
  });

  test('an employee sees only the projects they are assigned to', async () => {
    const token = await signIn('Radha');
    const res = await call('GET', '/api/projects', { token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((p) => p.name), ['NTT SOHAR']);
  });

  test('"all my projects" does not leak another project’s items', async () => {
    const token = await signIn('Radha');
    const res = await call('GET', '/api/items?projectId=all', { token });
    assert.equal(res.status, 200);
    const projectNames = new Set(res.body.data.items.map((i) => i.project.label));
    assert.deepEqual([...projectNames], ['NTT SOHAR']);
  });

  test('asking for an out-of-scope project answers 404, not 403', async () => {
    const adminToken = await signIn('Admin');
    const all = await call('GET', '/api/projects', { token: adminToken });
    const muscat = all.body.data.find((p) => p.name === 'NTT MUSCAT');

    const radha = await signIn('Radha');
    const res = await call('GET', '/api/items?projectId=' + muscat.id, { token: radha });
    assert.equal(res.status, 404, 'a URL must not confirm that a record exists');
  });

  test('an out-of-scope item answers 404', async () => {
    const adminToken = await signIn('Admin');
    const adminItems = await call('GET', '/api/items?projectId=all', { token: adminToken });
    const muscatItem = adminItems.body.data.items.find((i) => i.project.label === 'NTT MUSCAT');

    const radha = await signIn('Radha');
    const res = await call('GET', '/api/items/' + muscatItem.id, { token: radha });
    assert.equal(res.status, 404);
  });
});

describe('item permissions', () => {
  const findItem = async (token, ticket) => {
    const res = await call('GET', '/api/items?projectId=all', { token });
    return res.body.data.items.find((i) => i.ticketNumber === ticket);
  };

  test('the owner may change status, priority and secondary', async () => {
    const token = await signIn('Radha');
    const item = await findItem(token, '8000001046'); // Radha owns this one
    const res = await call('PATCH', '/api/items/' + item.id, {
      token, body: { status: 'Testing', priority: 'High' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'Testing');
    assert.equal(res.body.meta.changesRecorded, 2);
  });

  test('an employee may NOT change the title, even on their own item', async () => {
    const token = await signIn('Radha');
    const item = await findItem(token, '8000001046');
    const res = await call('PATCH', '/api/items/' + item.id, { token, body: { title: 'Renamed by employee' } });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /cannot change/i);
  });

  test('an employee may not change an item they are not responsible for', async () => {
    const token = await signIn('Venkat'); // on the project, but not owner/secondary here
    const item = await findItem(token, '8000001046');
    const res = await call('PATCH', '/api/items/' + item.id, { token, body: { status: 'Done' } });
    assert.equal(res.status, 403);
  });

  test('the named secondary may change status', async () => {
    const token = await signIn('Venkat'); // secondary on 8000001019
    const item = await findItem(token, '8000001019');
    const res = await call('PATCH', '/api/items/' + item.id, { token, body: { status: 'Testing' } });
    assert.equal(res.status, 200);
  });

  test('an employee cannot delete an item', async () => {
    const token = await signIn('Radha');
    const item = await findItem(token, '8000001046');
    const res = await call('DELETE', '/api/items/' + item.id, { token });
    assert.equal(res.status, 403);
  });

  test('an admin may change every field', async () => {
    const token = await signIn('Admin');
    const item = await findItem(token, '8000001033');
    const res = await call('PATCH', '/api/items/' + item.id, { token, body: { title: 'MES Notifications - revised' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.title, 'MES Notifications - revised');
  });

  test('a duplicate ticket number in the same project is refused', async () => {
    const token = await signIn('Admin');
    const projects = await call('GET', '/api/projects', { token });
    const sohar = projects.body.data.find((p) => p.name === 'NTT SOHAR');
    const users = await call('GET', '/api/users', { token });

    const res = await call('POST', '/api/items', {
      token,
      body: {
        projectId: sohar.id, ticketNumber: '8000001046', title: 'Duplicate',
        priority: 'Low', status: 'New', ownerId: users.body.data[0].id,
      },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /already exists/i);
  });
});

describe('comments are append-only', () => {
  test('adding a comment creates a new entry and updates the grid column', async () => {
    const token = await signIn('Radha');
    const list = await call('GET', '/api/items?projectId=all', { token });
    const item = list.body.data.items.find((i) => i.ticketNumber === '8000001046');
    const before = item.commentCount;

    const posted = await call('POST', '/api/items/' + item.id + '/comments', {
      token, body: { text: 'Fresh update from the test suite.' },
    });
    assert.equal(posted.status, 201);

    const after = await call('GET', '/api/items/' + item.id, { token });
    assert.equal(after.body.data.commentCount, before + 1);
    assert.equal(after.body.data.latestComment.text, 'Fresh update from the test suite.');
    assert.equal(after.body.data.latestComment.author.label, 'Radha');
  });

  test('an edit keeps the original text as a version', async () => {
    const token = await signIn('Radha');
    const list = await call('GET', '/api/items?projectId=all', { token });
    const item = list.body.data.items.find((i) => i.ticketNumber === '8000001033');

    const posted = await call('POST', '/api/items/' + item.id + '/comments', {
      token, body: { text: 'Original wording.' },
    });
    const id = posted.body.data.id;

    const edited = await call('PATCH', '/api/comments/' + id, { token, body: { text: 'Corrected wording.' } });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.text, 'Corrected wording.');
    assert.equal(edited.body.data.versions.length, 1);
    assert.equal(edited.body.data.versions[0].text, 'Original wording.');
  });

  test('nobody may edit somebody else’s comment - not even an admin', async () => {
    const radha = await signIn('Radha');
    const list = await call('GET', '/api/items?projectId=all', { token: radha });
    const item = list.body.data.items.find((i) => i.ticketNumber === '8000001033');
    const posted = await call('POST', '/api/items/' + item.id + '/comments', {
      token: radha, body: { text: 'Radha wrote this.' },
    });

    const admin = await signIn('Admin');
    const res = await call('PATCH', '/api/comments/' + posted.body.data.id, {
      token: admin, body: { text: 'Admin rewriting history.' },
    });
    assert.equal(res.status, 403);
  });

  test('an employee cannot comment on another project’s item', async () => {
    const admin = await signIn('Admin');
    const all = await call('GET', '/api/items?projectId=all', { token: admin });
    const muscatItem = all.body.data.items.find((i) => i.project.label === 'NTT MUSCAT');

    const radha = await signIn('Radha');
    const res = await call('POST', '/api/items/' + muscatItem.id + '/comments', {
      token: radha, body: { text: 'Should not be allowed' },
    });
    assert.equal(res.status, 404, 'the item is invisible to her, so it reads as missing');
  });
});

describe('audit log', () => {
  test('a field change is recorded with the old and new value', async () => {
    const token = await signIn('Admin');
    const list = await call('GET', '/api/items?projectId=all', { token });
    const item = list.body.data.items.find((i) => i.ticketNumber === '8000000963');

    await call('PATCH', '/api/items/' + item.id, { token, body: { status: 'Moved to Quality' } });

    const audit = await call('GET', '/api/items/' + item.id + '/audit', { token });
    assert.equal(audit.status, 200);
    const row = audit.body.data.find((r) => r.field === 'status');
    assert.ok(row, 'a status change was recorded');
    assert.equal(row.oldValue, 'Pending Vendor');
    assert.equal(row.newValue, 'Moved to Quality');
    assert.equal(row.changedBy.label, 'Admin');
  });

  test('the global log is admin-only', async () => {
    const token = await signIn('Radha');
    const res = await call('GET', '/api/audit', { token });
    assert.equal(res.status, 403);
  });

  test('the global log filters by person', async () => {
    const token = await signIn('Admin');
    const users = await call('GET', '/api/users', { token });
    const radha = users.body.data.find((u) => u.name === 'Radha');
    const res = await call('GET', '/api/audit?changedBy=' + radha.id, { token });
    assert.equal(res.status, 200);
    for (const row of res.body.data) assert.equal(row.changedBy.label, 'Radha');
  });
});

describe('search, filters and the grid', () => {
  test('search reaches into comment text, not just titles', async () => {
    const token = await signIn('Radha');
    const list = await call('GET', '/api/items?projectId=all', { token });
    const item = list.body.data.items.find((i) => i.ticketNumber === '8000001044');

    await call('POST', '/api/items/' + item.id + '/comments', {
      token, body: { text: 'A very distinctive phrase: zanzibar.' },
    });

    const res = await call('GET', '/api/items?projectId=all&q=zanzibar', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.items.length, 1);
    assert.equal(res.body.data.items[0].ticketNumber, '8000001044');
  });

  test('a search term with regex characters is treated as literal text', async () => {
    const token = await signIn('Radha');
    const res = await call('GET', '/api/items?projectId=all&q=' + encodeURIComponent('(unmatched'), { token });
    assert.equal(res.status, 200, 'must not blow up on an unbalanced bracket');
  });

  test('"assigned to me" returns only the user’s own items', async () => {
    const token = await signIn('Venkat');
    const res = await call('GET', '/api/items?projectId=all&mine=true', { token });
    assert.equal(res.status, 200);
    for (const item of res.body.data.items) {
      const isOwner = item.owner && item.owner.label === 'Venkat';
      const isSecondary = item.secondary && item.secondary.label === 'Venkat';
      assert.ok(isOwner || isSecondary, item.ticketNumber + ' involves Venkat');
    }
  });

  test('hideDone removes finished items', async () => {
    const token = await signIn('Admin');
    const res = await call('GET', '/api/items?projectId=all&hideDone=true', { token });
    for (const item of res.body.data.items) assert.equal(item.isDone, false);
  });

  test('summary counts ignore the status filter, so chips stay usable', async () => {
    const token = await signIn('Admin');
    const res = await call('GET', '/api/items?projectId=all&status=Testing', { token });
    assert.ok(res.body.data.summary.total > res.body.data.items.length,
      'the chips still show the whole picture while one status is selected');
  });

  test('every item carries its references as { type, id, label }', async () => {
    const token = await signIn('Admin');
    const res = await call('GET', '/api/items?projectId=all', { token });
    for (const item of res.body.data.items) {
      assert.equal(item.project.type, 'project');
      assert.ok(item.project.id && item.project.label);
      assert.equal(item.owner.type, 'employee');
      assert.ok(item.owner.id && item.owner.label);
    }
  });
});

describe('dropdown lists', () => {
  test('an employee cannot add a status', async () => {
    const token = await signIn('Radha');
    const res = await call('POST', '/api/lists', { token, body: { kind: 'status', label: 'Sneaky' } });
    assert.equal(res.status, 403);
  });

  test('renaming a status carries existing items across', async () => {
    const token = await signIn('Admin');
    const lists = await call('GET', '/api/lists?includeInactive=true', { token });
    const onHold = lists.body.data.statuses.find((s) => s.label === 'On Hold');

    const items = await call('GET', '/api/items?projectId=all', { token });
    const target = items.body.data.items[0];
    await call('PATCH', '/api/items/' + target.id, { token, body: { status: 'On Hold' } });

    const renamed = await call('PATCH', '/api/lists/' + onHold.id, { token, body: { label: 'Parked' } });
    assert.equal(renamed.status, 200);

    const after = await call('GET', '/api/items/' + target.id, { token });
    assert.equal(after.body.data.status, 'Parked', 'the item moved with the rename, it was not orphaned');
  });
});

describe('employees', () => {
  test('the last active admin cannot be deactivated', async () => {
    const token = await signIn('Admin');
    const users = await call('GET', '/api/users?includeInactive=true', { token });
    const admin = users.body.data.find((u) => u.name === 'Admin');
    const res = await call('PATCH', '/api/users/' + admin.id, { token, body: { active: false } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /last active admin/i);
  });

  test('a deactivated employee can no longer sign in', async () => {
    const token = await signIn('Admin');
    const users = await call('GET', '/api/users', { token });
    const venkat = users.body.data.find((u) => u.name === 'Venkat');

    await call('PATCH', '/api/users/' + venkat.id, { token, body: { active: false } });
    const res = await call('POST', '/api/auth/login', { body: { userId: venkat.id, pin: '1234' } });
    assert.equal(res.status, 401);

    await call('PATCH', '/api/users/' + venkat.id, { token, body: { active: true } }); // restore
  });
});
