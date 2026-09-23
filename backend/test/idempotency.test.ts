import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createSkillArenaClient } from '../src/client.js';
import { Store } from '../src/store.js';

const business = { 'x-business-id': 'business-demo' };
const taskInput = { requestId: 'retry-create-task', description: 'Нужна аналитика', industry: 'Retail', company: 'Acme' };
const proposalInput = { requestId: 'retry-proposal', idea: 'Изучить когорты', plan: 'Проверить гипотезы', timeline: 'Две недели', prototypeUrl: 'https://example.test/prototype' };

test('task request IDs replay the original response after restart and reject changed normalized payloads', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'skillarena-idempotency-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.sqlite');
  const first = await createApp({ databasePath: path, seed: false });
  t.after(() => first.close());
  const created = await first.inject({ method: 'POST', url: '/api/tasks', headers: business, payload: taskInput });
  assert.equal(created.statusCode, 201, created.body);
  const original = created.json();
  assert.equal('requestId' in original, false);
  const repeated = await first.inject({ method: 'POST', url: '/api/tasks', headers: business, payload: { ...taskInput, description: '  Нужна аналитика  ', topic: 'Retail' } });
  assert.equal(repeated.statusCode, 201, repeated.body);
  assert.deepEqual(repeated.json(), original);
  await first.inject({ method: 'PATCH', url: `/api/tasks/${original.id}`, headers: business, payload: { version: original.version, description: 'Уточнённое описание' } });
  await first.close();
  const second = await createApp({ databasePath: path, seed: false }); t.after(() => second.close());
  const replayed = await second.inject({ method: 'POST', url: '/api/tasks', headers: business, payload: taskInput });
  assert.equal(replayed.statusCode, 201, replayed.body);
  assert.deepEqual(replayed.json(), original);
  const mismatch = await second.inject({ method: 'POST', url: '/api/tasks', headers: business, payload: { ...taskInput, company: 'Another company' } });
  assert.equal(mismatch.statusCode, 409, mismatch.body);
  assert.equal(mismatch.json().error.code, 'CONFLICT');
  const unauthorized = await second.inject({ method: 'POST', url: '/api/tasks', headers: { 'x-business-id': 'other-business' }, payload: taskInput });
  assert.equal(unauthorized.statusCode, 403);
  const tasks = (await second.inject({ url: '/api/business/tasks', headers: business })).json().items;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].description, 'Уточнённое описание');
  const store = new Store(path); t.after(() => store.close());
  assert.equal('requestId' in store.all('tasks')[0]!, false);
});

test('proposal request IDs are scoped by team and task and replay original results without changing confirmed progress', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'skillarena-proposal-retry-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.sqlite');
  const first = await createApp({ databasePath: path, seed: true }); t.after(() => first.close());
  const teams = (await first.inject('/api/teams')).json().items;
  const tasks = (await first.inject('/api/tasks')).json().items;
  const taskId = tasks[0].id;
  const teamHeaders = { 'x-team-id': teams[0].id };
  const initialCount = (await first.inject({ url: `/api/tasks/${taskId}/proposals`, headers: business })).json().items.length;
  const created = await first.inject({ method: 'POST', url: `/api/tasks/${taskId}/proposals`, headers: teamHeaders, payload: proposalInput });
  assert.equal(created.statusCode, 201, created.body);
  const original = created.json();
  assert.equal('requestId' in original, false);
  const repeated = await first.inject({ method: 'POST', url: `/api/tasks/${taskId}/proposals`, headers: teamHeaders, payload: { ...proposalInput, idea: '  Изучить когорты  ' } });
  assert.deepEqual(repeated.json(), original);
  const mismatch = await first.inject({ method: 'POST', url: `/api/tasks/${taskId}/proposals`, headers: teamHeaders, payload: { ...proposalInput, plan: 'Другой план' } });
  assert.equal(mismatch.statusCode, 409, mismatch.body);
  const otherTeam = await first.inject({ method: 'POST', url: `/api/tasks/${taskId}/proposals`, headers: { 'x-team-id': teams[1].id }, payload: proposalInput });
  const otherTask = await first.inject({ method: 'POST', url: `/api/tasks/${tasks[1].id}/proposals`, headers: teamHeaders, payload: proposalInput });
  assert.equal(otherTeam.statusCode, 201, otherTeam.body); assert.notEqual(otherTeam.json().id, original.id);
  assert.equal(otherTask.statusCode, 201, otherTask.body); assert.notEqual(otherTask.json().id, original.id);
  await first.inject({ method: 'PATCH', url: `/api/proposals/${original.id}/decision`, headers: business, payload: { decision: 'selected' } });
  await first.inject({ method: 'POST', url: `/api/proposals/${original.id}/progress`, headers: business, payload: { key: 'research', description: 'Исследование принято', evidenceUrl: 'https://example.test/report' } });
  await first.close();
  const second = await createApp({ databasePath: path, seed: false }); t.after(() => second.close());
  const replayed = await second.inject({ method: 'POST', url: `/api/tasks/${taskId}/proposals`, headers: teamHeaders, payload: proposalInput });
  assert.equal(replayed.statusCode, 201, replayed.body);
  assert.deepEqual(replayed.json(), original);
  const proposals = (await second.inject({ url: `/api/tasks/${taskId}/proposals`, headers: business })).json().items;
  assert.equal(proposals.length, initialCount + 2);
  assert.equal(proposals.find((item: { id: string }) => item.id === original.id).milestoneConfirmed, true);
  const store = new Store(path); t.after(() => store.close());
  assert.equal('requestId' in store.get('proposals', original.id)!, false);
});

test('browser retries after a real lost POST response create one task and one proposal', async t => {
  const app = await createApp({ seed: false }); t.after(() => app.close());
  const upstream = await app.listen({ port: 0, host: '127.0.0.1' });
  let loseResponse = false;
  const proxy = createServer(async (req, res) => {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      for (const name of ['x-business-id', 'x-team-id']) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
      const response = await fetch(`${upstream}${req.url}`, { method: req.method, headers, body: body || undefined });
      const data = await response.text();
      if (loseResponse) { loseResponse = false; res.destroy(); return; }
      res.statusCode = response.status; res.setHeader('content-type', 'application/json'); res.end(data);
    } catch { res.destroy(); }
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  t.after(async () => { proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve())); });
  const address = proxy.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const client = createSkillArenaClient(url, { businessId: 'business-demo' });
  loseResponse = true;
  await assert.rejects(client.createTask(taskInput), { code: 'BACKEND_UNAVAILABLE' });
  let task = await client.createTask(taskInput);
  assert.equal((await client.businessTasks()).items.length, 1);
  task = await client.editTask(task.id, { version: task.version, card: { title: 'Анализ когорт' } });
  await client.confirm(task.id, task.version); await client.publish(task.id, task.version);
  const team = await client.createTeam({ name: 'Retry team', interests: [], skills: [], technologies: [] });
  const teamClient = createSkillArenaClient(url, { teamId: team.id });
  loseResponse = true;
  await assert.rejects(teamClient.submitProposal(task.id, proposalInput), { code: 'BACKEND_UNAVAILABLE' });
  const proposal = await teamClient.submitProposal(task.id, proposalInput);
  assert.equal((await client.proposals(task.id)).items.length, 1);
  assert.equal((await teamClient.myProposals()).items[0]!.id, proposal.id);
});

test('failed idempotency persistence rolls back creation so a later retry is safe', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'skillarena-atomic-retry-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.sqlite');
  const app = await createApp({ databasePath: path, seed: false }); t.after(() => app.close());
  const store = new Store(path); t.after(() => store.close());
  store.db.exec("CREATE TRIGGER fail_idempotency BEFORE INSERT ON metadata WHEN NEW.key LIKE 'idempotency:%' BEGIN SELECT RAISE(ABORT, 'Simulated persistence failure'); END;");
  const failed = await app.inject({ method: 'POST', url: '/api/tasks', headers: business, payload: taskInput });
  assert.equal(failed.statusCode, 500, failed.body);
  assert.equal(store.all('tasks').length, 0);
  store.db.exec('DROP TRIGGER fail_idempotency;');
  const retried = await app.inject({ method: 'POST', url: '/api/tasks', headers: business, payload: taskInput });
  assert.equal(retried.statusCode, 201, retried.body);
  assert.equal(store.all('tasks').length, 1);
});
