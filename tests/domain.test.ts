import assert from "node:assert/strict";
import test from "node:test";
import {
  catalog,
  confirmFields,
  confirmMilestone,
  editField,
  emptyFields,
  fields,
  isWorkspace,
  readiness,
  scoreTask,
  teamXp,
  validateProposal,
} from "../lib/domain.ts";
import { drafts, initialWorkspace, teams } from "../lib/fixtures.ts";
import { analyzeBrief, demoAnalysis, parseAnalysis } from "../lib/brief-api.ts";

test("rubric has exactly 100 points; blank/unconfirmed content earns nothing", () => {
  assert.equal(
    fields.reduce((sum, field) => sum + field.weight, 0),
    100,
  );
  const task = initialWorkspace().tasks[0];
  assert.equal(scoreTask(task).total, 100);
  assert.equal(scoreTask({ ...task, confirmed: [] }).total, 0);
  assert.equal(scoreTask({ ...task, ...emptyFields }).total, 0);
  assert.equal(scoreTask({ ...task, data: "   " }).total, 80);
});

test("editing removes only the changed field's points until reconfirmed", () => {
  const task = initialWorkspace().tasks[0];
  const edited = editField(
    task,
    "criteria",
    "80% пользователей выполняют сценарий за 2 минуты.",
  );
  assert.equal(scoreTask(edited).total, 85);
  assert.equal(scoreTask(confirmFields(edited)).total, 100);
  assert.equal(scoreTask(task).total, 100);
});

test("readiness boundaries match the official brief", () => {
  assert.deepEqual([0, 39, 40, 69, 70, 89, 90, 100].map(readiness), [
    "Черновик",
    "Черновик",
    "Рабочая",
    "Рабочая",
    "Готовая",
    "Готовая",
    "Приоритетная",
    "Приоритетная",
  ]);
});

test("catalog keeps low-rated published tasks visible and sorts by readiness", () => {
  const tasks = initialWorkspace().tasks;
  assert.deepEqual(
    catalog(tasks).map((task) => scoreTask(task).total),
    [100, 95, 75, 55, 30],
  );
  assert.equal(catalog(tasks, "", "Все темы", "Черновик")[0].id, "eco");
  assert.equal(catalog(tasks, "  CSV ").length, 0);
  assert.equal(catalog(tasks, "DATA")[0].id, "analytics");
  assert.equal(catalog(tasks, "", "Дизайн")[0].id, "museum");
  assert.equal(catalog([{ ...tasks[0], published: false }]).length, 0);
});

test("XP needs a selected team and accepted stage; repeated acceptance does not farm points", () => {
  const proposals = initialWorkspace().proposals;
  assert.equal(teamXp(proposals, "team-you"), 0);
  assert.equal(
    teamXp(confirmMilestone(proposals, "proposal-0"), "team-you"),
    0,
  );
  proposals[0].status = "selected";
  assert.equal(teamXp(proposals, "team-you"), 0);
  const confirmed = confirmMilestone(proposals, "proposal-0");
  assert.equal(teamXp(confirmed, "team-you"), 100);
  assert.equal(
    teamXp(confirmMilestone(confirmed, "proposal-0"), "team-you"),
    100,
  );
});

test("proposal requires an idea, plan, deadline and safe prototype URL", () => {
  const proposal = initialWorkspace().proposals[0];
  assert.equal(validateProposal(proposal), null);
  assert.ok(validateProposal({ ...proposal, idea: "" }));
  assert.ok(validateProposal({ ...proposal, plan: "" }));
  assert.ok(validateProposal({ ...proposal, duration: "" }));
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "not-a-url",
  ])
    assert.ok(validateProposal({ ...proposal, prototype: url }));
});

test("AI demo asks at least three relevant questions and never fabricates fields", () => {
  const task = {
    ...initialWorkspace().tasks[0],
    ...emptyFields,
    brief: drafts[0].text,
  };
  const before = structuredClone(task);
  const analysis = demoAnalysis(task);
  assert.equal(analysis.source, "demo");
  assert.ok(analysis.questions.length >= 3);
  assert.match(
    analysis.questions.find((question) => question.field === "data")!.question,
    /удержанию/,
  );
  assert.deepEqual(task, before);
  assert.equal(demoAnalysis(initialWorkspace().tasks[0]).questions.length, 3);
});

test("API validation rejects malformed, unknown and duplicate AI questions", () => {
  const valid = demoAnalysis(initialWorkspace().tasks[0]);
  assert.equal(parseAnalysis(valid).length, 3);
  for (const invalid of [
    null,
    "text",
    {},
    { questions: [] },
    { questions: valid.questions.slice(0, 2) },
    {
      questions: [
        ...valid.questions.slice(0, 2),
        { field: "salary", question: "Unknown field question" },
      ],
    },
    { questions: [valid.questions[0], valid.questions[0], valid.questions[0]] },
  ])
    assert.throws(() => parseAnalysis(invalid));
});

test("demo datasets meet case minimums and persisted data is validated", () => {
  const workspace = initialWorkspace();
  assert.ok(
    drafts.length >= 5 &&
      teams.length >= 5 &&
      workspace.tasks.length >= 5 &&
      workspace.proposals.length >= 5,
  );
  assert.ok(isWorkspace(workspace));
  assert.ok(!isWorkspace(null));
  assert.ok(!isWorkspace({ version: 1, tasks: [{}], proposals: [] }));
  assert.ok(
    !isWorkspace({
      ...workspace,
      tasks: [{ ...workspace.tasks[0], confirmed: ["invented"] }],
    }),
  );
  assert.ok(
    !isWorkspace({
      ...workspace,
      proposals: [{ ...workspace.proposals[0], status: "invented" }],
    }),
  );
});

test("API adapter sends the agreed contract and labels a valid live response", async (context) => {
  const original = process.env.NEXT_PUBLIC_BRIEF_API_URL;
  process.env.NEXT_PUBLIC_BRIEF_API_URL =
    "https://api.example.test/brief/analyze";
  const task = initialWorkspace().tasks[0];
  const mockedFetch = context.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.equal(url, process.env.NEXT_PUBLIC_BRIEF_API_URL);
      assert.equal(options.method, "POST");
      const input = JSON.parse(options.body as string);
      assert.equal(input.brief, task.brief);
      assert.deepEqual(
        Object.keys(input.fields).sort(),
        fields.map((field) => field.key).sort(),
      );
      assert.ok(options.signal);
      return Response.json({ questions: demoAnalysis(task).questions });
    },
  );
  try {
    const result = await analyzeBrief(task);
    assert.equal(result.source, "api");
    assert.equal(result.questions.length, 3);
    assert.equal(mockedFetch.mock.callCount(), 1);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BRIEF_API_URL;
    else process.env.NEXT_PUBLIC_BRIEF_API_URL = original;
  }
});

test("API failures are explicit and never silently replaced by a demo success", async (context) => {
  const original = process.env.NEXT_PUBLIC_BRIEF_API_URL;
  process.env.NEXT_PUBLIC_BRIEF_API_URL =
    "https://api.example.test/brief/analyze";
  const task = initialWorkspace().tasks[0];
  const mockedFetch = context.mock.method(
    globalThis,
    "fetch",
    async () => new Response("offline", { status: 503 }),
  );
  try {
    await assert.rejects(analyzeBrief(task), /HTTP 503/);
    mockedFetch.mock.mockImplementation(async () => new Response("not JSON"));
    await assert.rejects(analyzeBrief(task), /некорректный JSON/);
    mockedFetch.mock.mockImplementation(async () =>
      Response.json({ questions: [] }),
    );
    await assert.rejects(analyzeBrief(task), /от 3 до 9/);
    mockedFetch.mock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    await assert.rejects(analyzeBrief(task), /Нет соединения/);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(analyzeBrief(task, abort.signal), /отменён/);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BRIEF_API_URL;
    else process.env.NEXT_PUBLIC_BRIEF_API_URL = original;
  }
});
