import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBrief } from "../../lib/brief-api.ts";
import { createApp } from "../../backend/src/app.ts";
import { createWorkspaceApi } from "../../lib/workspace-api.ts";
import { emptyFields, scoreTask, type BusinessTask } from "../../lib/domain.ts";

const taskInput = (): BusinessTask => ({
  ...emptyFields,
  id: crypto.randomUUID(),
  title: "Проверка удержания",
  brief: "Нужно понять причины оттока пользователей приложения.",
  context: "Пользователи уходят из приложения.",
  need: "Найти причины оттока",
  company: "Компания интеграции",
  topic: "Аналитика",
  tags: [],
  confirmed: [],
  published: false,
  owner: "demo-business",
  createdAt: new Date().toISOString(),
});

async function setup(t: test.TestContext) {
  const app = await createApp();
  t.after(() => app.close());
  const url = await app.listen({ port: 0, host: "127.0.0.1" });
  return { app, url, api: createWorkspaceApi(url) };
}

test("real API: publish low-score card, propose, select, confirm once and reload persisted XP", async (t) => {
  const { api, url } = await setup(t);
  const draft = await api.save(taskInput(), false);
  assert.equal(draft.company, "Компания интеграции");
  assert.equal(scoreTask(draft).total, 0);
  assert.equal(
    (await api.load()).catalog.some((item) => item.id === draft.id),
    false,
  );
  const published = await api.save(draft, true);
  assert.equal(scoreTask(published).total, 20);
  const proposal = await api.submit({
    id: "client-only",
    taskId: published.id,
    teamId: "team-demo-1",
    idea: "Изучим причины оттока по когортам пользователей.",
    plan: "Проверим данные и подготовим прототип отчёта.",
    duration: "Две недели",
    prototype: "https://example.test/prototype",
    status: "pending",
    createdAt: "",
    milestoneConfirmed: false,
  });
  await api.decide(proposal.id, "selected");
  assert.equal((await api.load()).teams[0].xp, 0);
  await api.confirmProgress(proposal);
  await api.confirmProgress(proposal);
  const fresh = await createWorkspaceApi(url).load();
  assert.equal(fresh.teams[0].xp, 100);
  assert.equal(
    fresh.proposals.find((item) => item.id === proposal.id)?.milestoneConfirmed,
    true,
  );
  assert.equal(
    fresh.catalog.find((item) => item.id === draft.id)?.company,
    "Компания интеграции",
  );
});

test("draft edits keep the public snapshot and reject an older editor version", async (t) => {
  const { api, url } = await setup(t);
  const published = await api.save(taskInput(), true);
  const stale = structuredClone(published);
  const changed = await api.save(
    { ...published, title: "Новый заголовок", data: "CSV за 3 месяца" },
    false,
  );
  assert.equal(changed.title, "Новый заголовок");
  const snapshot = await api.load();
  assert.equal(
    snapshot.catalog.find((item) => item.id === published.id)?.title,
    "Проверка удержания",
  );
  assert.equal(
    snapshot.drafts.find((item) => item.id === published.id)?.title,
    "Новый заголовок",
  );
  await assert.rejects(
    createWorkspaceApi(url).save(stale, true),
    /изменилась|верси/i,
  );
  await api.save(changed, true);
  assert.equal(
    (await api.load()).catalog.find((item) => item.id === published.id)?.title,
    "Новый заголовок",
  );
});

test("AI bridge returns valid frontend questions and reports fallback without creating a task", async (t) => {
  const { api, url } = await setup(t);
  const before = (await api.load()).drafts.length;
  const originalUrl = process.env.NEXT_PUBLIC_BRIEF_API_URL;
  process.env.NEXT_PUBLIC_BRIEF_API_URL = `${url}/api/brief/analyze`;
  t.after(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_BRIEF_API_URL;
    else process.env.NEXT_PUBLIC_BRIEF_API_URL = originalUrl;
  });
  const analysis = await analyzeBrief(taskInput());
  assert.equal(analysis.source, "demo");
  assert.ok(analysis.questions.length >= 3);
  assert.ok(
    analysis.questions.every((q: { field: string }) => q.field in emptyFields),
  );
  assert.equal((await api.load()).drafts.length, before);
});

test("all nine fields round-trip with the same rating and company", async (t) => {
  const { api } = await setup(t);
  const input = {
    ...taskInput(),
    data: "Анонимный CSV",
    outcome: "Прототип отчёта",
    criteria: "Три проверенных гипотезы",
    constraints: "Две недели",
    users: "Покупатели магазина",
    contact: "demo@example.test",
    interaction: "Два созвона в неделю",
  };
  const saved = await api.save(input, true);
  assert.equal(scoreTask(saved).total, 100);
  const loaded = (await api.load()).catalog.find(
    (item) => item.id === saved.id,
  )!;
  assert.equal(loaded.outcome, "Прототип отчёта");
  assert.equal(loaded.criteria, "Три проверенных гипотезы");
  assert.equal(loaded.interaction, "Два созвона в неделю");
  assert.equal(loaded.contact, "demo@example.test");
  assert.equal(scoreTask(loaded).total, 100);
});

test("lost PATCH response can be retried without losing the retained editor data", async (t) => {
  const { api } = await setup(t);
  const input = taskInput();
  const realFetch = globalThis.fetch;
  let loseReply = true;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      const response = await realFetch(url, options);
      if (options?.method === "PATCH" && loseReply) {
        loseReply = false;
        throw new TypeError("Connection lost after write");
      }
      return response;
    },
  );
  await assert.rejects(api.save(input, true), /недоступен/i);
  const saved = await api.save(input, true);
  assert.equal(saved.title, input.title);
  assert.equal(
    (await api.load()).drafts.filter((task) => task.company === input.company)
      .length,
    1,
  );
});

test("recovering a lost PATCH never overwrites a later change by another editor", async (t) => {
  const { api, url } = await setup(t);
  const input = taskInput();
  const realFetch = globalThis.fetch;
  let loseReply = true;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      const response = await realFetch(url, options);
      if (options?.method === "PATCH" && loseReply) {
        loseReply = false;
        throw new TypeError("Connection lost after write");
      }
      return response;
    },
  );
  await assert.rejects(api.save(input, true));
  const written = (await api.load()).drafts.find(
    (task) => task.company === input.company,
  )!;
  await createWorkspaceApi(url).save(
    { ...written, title: "Правка другого редактора" },
    false,
  );
  await assert.rejects(api.save(input, true), /изменилась|верси/i);
  assert.equal(
    (await api.load()).drafts.find((task) => task.id === written.id)?.title,
    "Правка другого редактора",
  );
});

test("lost task creation response retries the same creation and saves later form edits", async (t) => {
  const { api } = await setup(t);
  const input = taskInput();
  const realFetch = globalThis.fetch;
  let loseReply = true;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      const response = await realFetch(url, options);
      if (
        options?.method === "POST" &&
        String(url).endsWith("/api/tasks") &&
        loseReply
      ) {
        loseReply = false;
        throw new TypeError("Connection lost after creation");
      }
      return response;
    },
  );
  await assert.rejects(api.save(input, true), /недоступен/i);
  const saved = await api.save(
    {
      ...input,
      brief: "Обновлённый бриф: выяснить причины оттока.",
      title: "Исправленная карточка",
    },
    true,
  );
  assert.equal(saved.title, "Исправленная карточка");
  const tasks = (await api.load()).drafts.filter(
    (task) => task.company === input.company,
  );
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].brief, "Обновлённый бриф: выяснить причины оттока.");
});

test("lost proposal response retries without creating another proposal", async (t) => {
  const { api } = await setup(t);
  const task = await api.save(taskInput(), true);
  const proposal = {
    id: crypto.randomUUID(),
    taskId: task.id,
    teamId: "team-demo-1",
    idea: "Проанализируем причины оттока пользователей.",
    plan: "Изучим данные и подготовим отчёт для бизнеса.",
    duration: "2 недели",
    prototype: "https://example.test/prototype",
    status: "pending" as const,
    milestoneConfirmed: false,
    createdAt: "",
  };
  const realFetch = globalThis.fetch;
  let loseReply = true;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      const response = await realFetch(url, options);
      if (
        options?.method === "POST" &&
        String(url).endsWith("/proposals") &&
        loseReply
      ) {
        loseReply = false;
        throw new TypeError("Connection lost after proposal");
      }
      return response;
    },
  );
  await assert.rejects(api.submit(proposal), /недоступен/i);
  await api.submit(proposal);
  assert.equal(
    (await api.load()).proposals.filter((item) => item.taskId === task.id)
      .length,
    1,
  );
});

test("a corrected new form can retry after a definite creation validation error", async (t) => {
  const { api } = await setup(t);
  const input = taskInput();
  await assert.rejects(api.save({ ...input, company: "" }, false));
  const saved = await api.save(input, true);
  assert.equal(saved.company, input.company);
});

test("reconciled version survives a validation error in the next edit attempt", async (t) => {
  const { api } = await setup(t);
  const input = taskInput();
  const realFetch = globalThis.fetch;
  let loseReply = true;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      const response = await realFetch(url, options);
      if (options?.method === "PATCH" && loseReply) {
        loseReply = false;
        throw new TypeError("Connection lost after write");
      }
      return response;
    },
  );
  await assert.rejects(api.save(input, true));
  await assert.rejects(api.save({ ...input, company: "" }, false));
  const saved = await api.save(input, true);
  assert.equal(saved.company, input.company);
});
