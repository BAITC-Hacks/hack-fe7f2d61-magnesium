import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import type { LightMyRequestResponse } from 'fastify';

const business = { 'x-business-id': 'business-demo' };
const description = 'У нашего магазина клиенты не возвращаются после первого заказа.';
const proposal = { idea: 'Исследовать когорты', plan: 'Изучить CSV, проверить гипотезы', timeline: 'Две недели', prototypeUrl: 'https://example.test/prototype' };

async function setup(databasePath = ':memory:') {
  return createApp({ databasePath, seed: false, ai: { apiKey: '' } });
}
async function draft(app: Awaited<ReturnType<typeof setup>>) {
  const response = await app.inject({ method: 'POST', url: '/api/tasks', headers: business, payload: { description, industry: 'Retail', topic: 'Analytics' } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}
async function publish(app: Awaited<ReturnType<typeof setup>>) {
  let task = await draft(app);
  task = (await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, headers: business, payload: { version: task.version, card: { title: 'Возврат клиентов', need: 'Найти причины оттока' } } })).json();
  const confirmed = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/confirm`, headers: business, payload: { version: task.version } });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  const published = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/publish`, headers: business, payload: { version: task.version } });
  assert.equal(published.statusCode, 200, published.body);
  return published.json();
}
async function team(app: Awaited<ReturnType<typeof setup>>, name = 'Test team') {
  const response = await app.inject({ method: 'POST', url: '/api/teams', payload: { name, interests: ['Analytics'], skills: ['SQL'], technologies: ['Python'] } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

test('full low-score workflow allows multiple proposals and manual selections; only confirmed progress earns XP', async t => {
  const app = await setup(); t.after(() => app.close());
  const task = await publish(app);
  assert.equal(task.rating.score, 20);
  const catalog = (await app.inject('/api/tasks')).json();
  assert.equal(catalog.items.length, 1);
  const a = await team(app, 'Alpha'); const b = await team(app, 'Beta');
  const submissions = [];
  for (const participant of [a, b, a]) {
    const response = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/proposals`, headers: { 'x-team-id': participant.id }, payload: proposal });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().status, 'pending');
    submissions.push(response.json());
  }
  const milestone = { key: 'research', description: 'Проведён анализ трёх когорт', evidenceUrl: 'https://example.test/report' };
  const unselected = await app.inject({ method: 'POST', url: `/api/proposals/${submissions[0].id}/progress`, headers: business, payload: milestone });
  assert.equal(unselected.statusCode, 409);
  for (const submission of submissions.slice(0, 2)) {
    const selected = await app.inject({ method: 'PATCH', url: `/api/proposals/${submission.id}/decision`, headers: business, payload: { decision: 'selected' } });
    assert.equal(selected.statusCode, 200, selected.body);
  }
  const before = (await app.inject('/api/teams')).json().items.find((item: { id: string }) => item.id === a.id);
  assert.equal(before.xp, 0);
  for (let retry = 0; retry < 2; retry++) {
    const progress: LightMyRequestResponse = await app.inject({ method: 'POST', url: `/api/proposals/${submissions[0].id}/progress`, headers: business, payload: milestone });
    assert.equal(progress.statusCode, 200, progress.body);
    assert.equal(progress.json().points, 100);
  }
  const after = (await app.inject('/api/teams')).json().items.find((item: { id: string }) => item.id === a.id);
  assert.equal(after.xp, 100);
  const rejection = await app.inject({ method: 'PATCH', url: `/api/proposals/${submissions[2].id}/decision`, headers: business, payload: { decision: 'rejected' } });
  assert.equal(rejection.json().status, 'rejected');
  const proposals = (await app.inject({ url: `/api/tasks/${task.id}/proposals`, headers: business })).json();
  assert.equal(proposals.items.filter((item: { status: string }) => item.status === 'selected').length, 2);
});

test('unpublished drafts are private and publication requires explicit confirmation', async t => {
  const app = await setup(); t.after(() => app.close()); const task = await draft(app);
  assert.equal((await app.inject('/api/tasks')).json().items.length, 0);
  assert.equal((await app.inject(`/api/tasks/${task.id}`)).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/publish`, headers: business, payload: { version: task.version } })).statusCode, 409);
  const student = await team(app);
  assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/proposals`, headers: { 'x-team-id': student.id }, payload: proposal })).statusCode, 404);
});

test('draft revisions cannot silently replace a confirmed published snapshot', async t => {
  const app = await setup(); t.after(() => app.close()); const published = await publish(app);
  const edited = await app.inject({ method: 'PATCH', url: `/api/tasks/${published.id}`, headers: business, payload: { version: published.version, card: { data: 'Новый CSV' } } });
  assert.equal(edited.statusCode, 200, edited.body);
  const task = edited.json();
  assert.equal(task.confirmedVersion, null);
  assert.equal(task.rating.score, 0);
  assert.equal(task.rating.previewScore, 40);
  assert.equal(task.hasUnpublishedChanges, true);
  assert.equal((await app.inject(`/api/tasks/${task.id}`)).json().card.data, '');
  assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/publish`, headers: business, payload: { version: task.version } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, headers: business, payload: { version: published.version, card: { need: 'Старая запись' } } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/confirm`, headers: business, payload: { version: published.version } })).statusCode, 409);
  await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/confirm`, headers: business, payload: { version: task.version } });
  await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/publish`, headers: business, payload: { version: task.version } });
  assert.equal((await app.inject(`/api/tasks/${task.id}`)).json().rating.score, 40);
});

test('catalog sorts by confirmed rating and filters by topic and readiness without hiding low scores', async t => {
  const app = await setup(); t.after(() => app.close()); const low = await publish(app); const high = await publish(app);
  const edited = (await app.inject({ method: 'PATCH', url: `/api/tasks/${high.id}`, headers: business, payload: { version: high.version, topic: 'Data', card: { data: 'CSV' } } })).json();
  await app.inject({ method: 'POST', url: `/api/tasks/${high.id}/confirm`, headers: business, payload: { version: edited.version } });
  await app.inject({ method: 'POST', url: `/api/tasks/${high.id}/publish`, headers: business, payload: { version: edited.version } });
  assert.deepEqual((await app.inject('/api/tasks')).json().items.map((item: { id: string }) => item.id), [high.id, low.id]);
  assert.equal((await app.inject('/api/tasks?readiness=draft')).json().items[0].id, low.id);
  assert.equal((await app.inject('/api/tasks?topic=Data&readiness=working')).json().items[0].id, high.id);
});

test('invalid identity, unknown fields and unsafe prototype links are rejected', async t => {
  const app = await setup(); t.after(() => app.close()); const task = await publish(app); const student = await team(app);
  assert.equal((await app.inject({ url: '/api/business/tasks' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, headers: { 'x-business-id': 'someone-else' }, payload: { version: task.version, card: { title: 'Hijacked' } } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, headers: business, payload: { version: task.version, rating: 100 } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/proposals`, headers: { 'x-team-id': student.id }, payload: { ...proposal, prototypeUrl: 'javascript:alert(1)' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/tasks', headers: business, payload: { description: '   ', industry: 'Retail' } })).statusCode, 400);
});

test('SQLite persists drafts, proposals and progress across app restarts', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'skillarena-test-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.sqlite'); const first = await setup(path); const task = await publish(first); const student = await team(first);
  const submission = (await first.inject({ method: 'POST', url: `/api/tasks/${task.id}/proposals`, headers: { 'x-team-id': student.id }, payload: proposal })).json();
  await first.inject({ method: 'PATCH', url: `/api/proposals/${submission.id}/decision`, headers: business, payload: { decision: 'selected' } });
  await first.inject({ method: 'POST', url: `/api/proposals/${submission.id}/progress`, headers: business, payload: { key: 'm1', description: 'Подтверждённый результат', evidenceUrl: 'https://example.test/proof' } });
  await first.close();
  const second = await setup(path); t.after(() => second.close());
  assert.equal((await second.inject(`/api/tasks/${task.id}`)).json().rating.score, 20);
  assert.equal((await second.inject('/api/teams')).json().items[0].xp, 100);
  assert.equal((await second.inject({ url: `/api/tasks/${task.id}/proposals`, headers: business })).json().items[0].status, 'selected');
});
