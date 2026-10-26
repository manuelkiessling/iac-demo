import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './application.js';
import { MemoryTodoStore } from './store.js';

test('HTTP API supports create, list, rename, complete, reopen and delete', async () => {
  const app = await createApp(new MemoryTodoStore(), false);
  await app.listen(0, '127.0.0.1');
  try {
    const url = await app.getUrl();
    const request = (path = '', method = 'GET', body?: unknown) => fetch(url + '/api/todos' + path, {
      method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const created = await request('', 'POST', { title: '  Ship app and infra  ' });
    assert.equal(created.status, 201);
    const todo = await created.json();
    assert.equal(todo.title, 'Ship app and infra');
    assert.equal(todo.completed, false);
    assert.deepEqual(await (await request()).json(), [todo]);
    const renamed = await request('/' + todo.id, 'PATCH', { title: 'Demo the commit' });
    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).title, 'Demo the commit');
    const completed = await request('/' + todo.id, 'PATCH', { completed: true });
    assert.equal((await completed.json()).completed, true);
    const reopened = await request('/' + todo.id, 'PATCH', { completed: false });
    assert.equal((await reopened.json()).completed, false);
    assert.equal((await request('/' + todo.id, 'DELETE')).status, 204);
    assert.deepEqual(await (await request()).json(), []);
    assert.equal((await request('/' + todo.id, 'PATCH', { title: 'missing' })).status, 404);
    assert.equal((await request('/' + todo.id, 'DELETE')).status, 404);
  } finally { await app.close(); }
});

test('HTTP validation rejects malformed, empty and unsupported updates', async () => {
  const app = await createApp(new MemoryTodoStore(), false);
  await app.listen(0, '127.0.0.1');
  try {
    const url = await app.getUrl();
    for (const body of [{}, { title: '' }, { title: '   ' }, { title: 'a'.repeat(201) }, { title: 1 }, { title: 'Task', id: 'injected' }]) {
      const result = await fetch(url + '/api/todos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(result.status, 400, JSON.stringify(body));
    }
    for (const body of [{}, { completed: 'yes' }, { completed: null }, { title: null }, { expiresAt: 0 }]) {
      const result = await fetch(url + '/api/todos/missing', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(result.status, 400, JSON.stringify(body));
    }
  } finally { await app.close(); }
});

test('completion schedules cleanup, renaming preserves it and reopening cancels it', async (t) => {
  const now = 1_800_000_000;
  t.mock.method(Date, 'now', () => now * 1000);
  const store = new MemoryTodoStore();
  const app = await createApp(store, false);
  await app.listen(0, '127.0.0.1');
  try {
    const url = await app.getUrl();
    const patch = async (id: string, body: unknown) => {
      const response = await fetch(url + '/api/todos/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 200);
      return response.json();
    };
    await store.create({ id: 'task', title: 'Test cleanup', completed: false, createdAt: new Date().toISOString() });
    const completed = await patch('task', { completed: true });
    assert.equal(completed.expiresAt, now + 7 * 24 * 60 * 60);
    assert.equal((await patch('task', { title: 'Renamed' })).expiresAt, completed.expiresAt);
    const reopened = await patch('task', { completed: false });
    assert.equal('expiresAt' in reopened, false);
    assert.equal('expiresAt' in (await store.list())[0]!, false);
    await patch('task', { completed: true });
    t.mock.method(Date, 'now', () => (completed.expiresAt + 1) * 1000);
    assert.deepEqual(await (await fetch(url + '/api/todos')).json(), []);
    assert.equal((await store.list()).length, 1, 'physical deletion is left to DynamoDB TTL');
  } finally { await app.close(); }
});
