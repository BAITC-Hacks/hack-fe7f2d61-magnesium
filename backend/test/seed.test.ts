import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

test('demo has five drafts, cards, teams and proposals; restarting does not duplicate or overwrite edits', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'skillarena-seed-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const options = { databasePath: join(dir, 'demo.sqlite'), seed: true, ai: { apiKey: '' } };
  const app = await createApp(options);
  const headers = { 'x-business-id': 'business-demo' };
  const catalog = (await app.inject('/api/tasks')).json().items;
  assert.equal(catalog.length, 5);
  assert.deepEqual(catalog.map((task: { rating: { score: number } }) => task.rating.score), [100, 90, 70, 40, 20]);
  const tasks = (await app.inject({ url: '/api/business/tasks', headers })).json().items;
  assert.equal(tasks.filter((task: { published: unknown }) => !task.published).length, 5);
  assert.equal((await app.inject('/api/teams')).json().items.length, 5);
  let count = 0;
  for (const task of catalog) count += (await app.inject({ url: `/api/tasks/${task.id}/proposals`, headers })).json().items.length;
  assert.equal(count, 5);
  const first = tasks[0];
  await app.inject({ method: 'PATCH', url: `/api/tasks/${first.id}`, headers, payload: { version: first.version, card: { title: 'Изменено человеком' } } });
  await app.close();
  const second = await createApp(options); t.after(() => second.close());
  assert.equal((await second.inject({ url: '/api/business/tasks', headers })).json().items.length, 10);
  assert.equal((await second.inject({ url: `/api/business/tasks/${first.id}`, headers })).json().card.title, 'Изменено человеком');
});

test('OpenAPI exposes the integration contract and Swagger UI is served', async t => {
  const app = await createApp({ seed: false }); t.after(() => app.close());
  const document = (await app.inject('/docs/json')).json();
  assert.ok(document.paths['/api/tasks/{id}/clarify']);
  assert.ok(document.paths['/api/tasks/{id}/generate-card']);
  assert.ok(document.paths['/api/proposals/{id}/decision']);
  assert.equal((await app.inject('/docs/')).statusCode, 200);
});
