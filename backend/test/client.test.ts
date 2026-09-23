import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createSkillArenaClient, SkillArenaApiError } from '../src/client.js';
import { createApp } from '../src/app.js';

async function server(t: TestContext, handle: (req: IncomingMessage, res: ServerResponse) => void) {
  const instance = createServer(handle);
  instance.listen(0, '127.0.0.1'); await once(instance, 'listening');
  t.after(async () => { instance.closeAllConnections(); await new Promise<void>(resolve => instance.close(() => resolve())); });
  const address = instance.address(); assert.ok(address && typeof address !== 'string');
  return { instance, url: `http://127.0.0.1:${address.port}` };
}

test('browser client explains connection and non-JSON proxy errors without leaking transport failures', async t => {
  const upstream = await server(t, (_req, res) => { res.statusCode = 502; res.end('<html>Bad Gateway</html>'); });
  const client = createSkillArenaClient(upstream.url);
  await assert.rejects(client.health(), (error: unknown) => {
    assert.ok(error instanceof SkillArenaApiError);
    assert.equal(error.status, 502);
    assert.equal(error.code, 'BACKEND_UNAVAILABLE');
    assert.match(error.message, /сервер|backend/i);
    assert.doesNotMatch(error.message, /html|JSON|Unexpected/);
    return true;
  });
  upstream.instance.closeAllConnections();
  await new Promise<void>(resolve => upstream.instance.close(() => resolve()));
  await assert.rejects(client.health(), (error: unknown) => {
    assert.ok(error instanceof SkillArenaApiError);
    assert.equal(error.status, 503);
    assert.equal(error.code, 'BACKEND_UNAVAILABLE');
    return true;
  });
});

test('browser client keeps structured backend error codes and messages', async t => {
  const app = await createApp({ seed: false }); t.after(() => app.close());
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  await assert.rejects(createSkillArenaClient(url).businessTasks(), (error: unknown) => {
    assert.ok(error instanceof SkillArenaApiError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'IDENTITY_REQUIRED');
    assert.match(error.message, /X-Business-Id/);
    return true;
  });
});

test('browser client timeout covers slow response bodies and caller cancellation remains AbortError', async t => {
  const upstream = await server(t, (_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.write('{');
    setTimeout(() => res.end('"status":"ok"}'), 120);
  });
  const client = createSkillArenaClient(upstream.url);
  await assert.rejects(client.health({ timeoutMs: 20 }), (error: unknown) => {
    assert.ok(error instanceof SkillArenaApiError);
    assert.equal(error.code, 'TIMEOUT');
    return true;
  });
  const controller = new AbortController();
  const pending = client.health({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('browser client exposes brief analysis and saves company and brief edits through the real API', async t => {
  const app = await createApp({ seed: false, ai: { apiKey: '' } }); t.after(() => app.close());
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  const client = createSkillArenaClient(url, { businessId: 'business-demo' });
  const task = await client.createTask({ description: 'Нужен прототип', industry: 'Retail', company: 'Acme' });
  const edited = await client.editTask(task.id, { version: task.version, description: 'Нужен прототип карты', company: 'Acme Maps' });
  assert.equal(edited.description, 'Нужен прототип карты');
  assert.equal(edited.company, 'Acme Maps');
  const analysis = await client.analyzeBrief({ brief: edited.description, fields: { context: '', need: '', data: '', outcome: '', criteria: '', constraints: '', users: '', contact: '', interaction: '' } });
  assert.equal(analysis.source, 'demo');
  assert.ok(analysis.questions.length >= 3);
});
