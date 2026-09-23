import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { analyzeTask } from '../src/ai.js';
import { emptyCard } from '../src/contracts.js';
import { createApp } from '../src/app.js';

const description = 'Нужен анализ оттока. Есть CSV заказов. Срок две недели.';
const questions = [
  { field: 'users', question: 'Для каких пользователей нужно решение?' },
  { field: 'successCriteria', question: 'Как будете измерять успех?' },
  { field: 'expectedResult', question: 'Какой результат должна передать команда?' },
];
const valid = { questions, extractedFields: [{ field: 'data', quote: 'Есть CSV заказов.' }, { field: 'constraints', quote: 'Срок две недели.' }] };
const envelope = (data: unknown) => ({ id: 'resp_test', status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(data), annotations: [] }] }] });
async function provider(t: TestContext, handle: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>) {
  const server = createServer((req, res) => { Promise.resolve(handle(req, res)).catch(error => { res.statusCode = 500; res.end(String(error)); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { apiKey: 'test-key', baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'test-model', timeoutMs: 1500 };
}

test('real provider transport sends strict structured request and accepts only grounded extracted facts', async t => {
  let received: Record<string, any> | undefined;
  const config = await provider(t, async (req, res) => {
    assert.equal(req.url, '/v1/responses'); assert.equal(req.headers.authorization, 'Bearer test-key');
    let body = ''; for await (const chunk of req) body += chunk;
    received = JSON.parse(body); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(envelope(valid)));
  });
  const result = await analyzeTask({ description, card: emptyCard(), answers: [{ field: 'users', answer: 'Покупатели магазина' }] }, config);
  assert.equal(result.ai.mode, 'live');
  assert.equal(result.suggestedCard.data, 'Есть CSV заказов.');
  assert.equal(result.suggestedCard.users, 'Покупатели магазина');
  assert.equal(result.suggestedCard.contact, '');
  assert.equal(result.questions.length, 3);
  assert.equal(received?.store, false);
  assert.equal(received?.text.format.type, 'json_schema');
  assert.equal(received?.text.format.strict, true);
  assert.ok(received?.input[1].content.includes(description));
});

test('model output cannot replace an existing human-edited field', async t => {
  const config = await provider(t, (_req, res) => { res.end(JSON.stringify(envelope(valid))); });
  const result = await analyzeTask({ description, card: { ...emptyCard(), data: 'Только обезличенные данные после согласования' } }, config);
  assert.equal(result.suggestedCard.data, 'Только обезличенные данные после согласования');
});

test('intentional blank edits remain blank across later AI generations', async t => {
  const config = await provider(t, (_req, res) => { res.end(JSON.stringify(envelope(valid))); });
  const app = await createApp({ seed: false, ai: config }); t.after(() => app.close());
  const headers = { 'x-business-id': 'business-demo' };
  let task = (await app.inject({ method: 'POST', url: '/api/tasks', headers, payload: { description, industry: 'Retail' } })).json();
  task = (await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, headers, payload: { version: task.version, card: { title: '', data: '' } } })).json();
  const generated = await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/generate-card`, headers, payload: { version: task.version, answers: [] } });
  assert.equal(generated.statusCode, 200, generated.body);
  assert.equal(generated.json().task.card.data, '');
  assert.equal(generated.json().task.card.title, '');
});

test('invented facts cause a labeled fallback and never enter the card', async t => {
  const config = await provider(t, (_req, res) => { res.end(JSON.stringify(envelope({ ...valid, extractedFields: [{ field: 'contact', quote: 'ceo@invented.example' }] }))); });
  const result = await analyzeTask({ description, card: emptyCard() }, config);
  assert.equal(result.ai.mode, 'fallback'); assert.equal(result.ai.reason, 'unsupported_facts');
  assert.equal(result.suggestedCard.contact, ''); assert.ok(result.questions.length >= 3);
});

test('missing credentials keep the workflow usable without pretending AI ran', async () => {
  const result = await analyzeTask({ description, card: emptyCard(), answers: [{ field: 'title', answer: 'Анализ оттока' }] }, { apiKey: '' });
  assert.equal(result.ai.mode, 'fallback'); assert.equal(result.ai.reason, 'missing_api_key');
  assert.equal(result.suggestedCard.title, 'Анализ оттока'); assert.equal(result.suggestedCard.contact, '');
  assert.ok(result.questions.length >= 3);
});

for (const scenario of ['malformed-json', 'wrong-shape', 'refusal', 'http-error', 'timeout'] as const) {
  test(`provider ${scenario} returns structured fallback`, async t => {
    const config = await provider(t, (_req, res) => {
      if (scenario === 'timeout') return;
      if (scenario === 'http-error') { res.statusCode = 429; res.end('Rate limited'); return; }
      if (scenario === 'malformed-json') { res.end('{broken'); return; }
      if (scenario === 'wrong-shape') { res.end(JSON.stringify(envelope({ questions: [], extractedFields: [] }))); return; }
      res.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot comply' }] }] }));
    });
    const result = await analyzeTask({ description, card: emptyCard() }, { ...config, timeoutMs: scenario === 'timeout' ? 30 : 1500 });
    assert.equal(result.ai.mode, 'fallback'); assert.ok(result.questions.length >= 3);
    assert.ok(result.ai.reason); assert.equal(result.suggestedCard.contact, '');
    if (scenario === 'timeout') assert.equal(result.ai.reason, 'timeout');
  });
}

test('an in-flight AI generation cannot overwrite newer human edits', async t => {
  let notifyStarted!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { notifyStarted = resolve; });
  const proceed = new Promise<void>(resolve => { release = resolve; });
  const config = await provider(t, async (_req, res) => { notifyStarted(); await proceed; res.end(JSON.stringify(envelope(valid))); });
  const app = await createApp({ databasePath: ':memory:', seed: false, ai: config }); t.after(() => app.close());
  const headers = { 'x-business-id': 'business-demo' };
  const task = (await app.inject({ method: 'POST', url: '/api/tasks', headers, payload: { description, industry: 'Retail' } })).json();
  const pending = app.inject({ method: 'POST', url: `/api/tasks/${task.id}/generate-card`, headers, payload: { version: task.version, answers: [] } }).then(response => response);
  await started;
  const edit = await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, headers, payload: { version: task.version, card: { contact: 'human@example.test' } } });
  assert.equal(edit.statusCode, 200, edit.body); release();
  assert.equal((await pending).statusCode, 409);
  const current = (await app.inject({ url: `/api/business/tasks/${task.id}`, headers })).json();
  assert.equal(current.card.contact, 'human@example.test'); assert.equal(current.card.data, '');
});
