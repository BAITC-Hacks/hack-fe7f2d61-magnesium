import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Type, type TSchema } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AiMetaSchema, AnalysisSchema, AnswersSchema, CardSchema, ErrorSchema, Id, LevelSchema, MilestoneInputSchema, MilestoneSchema, nonempty, object, ProposalInputSchema, ProposalSchema, PublishedSchema, QuestionSchema, TaskSchema, TeamSchema, text, Version } from './contracts.js';
import { Store } from './store.js';
import { BUSINESSES, Service } from './service.js';
import { ApiError } from './errors.js';
import { analyzeTask, type AiConfig } from './ai.js';
import { calculateRating } from './rating.js';
import { seedDemo } from './seed.js';

export type AppOptions = {
  databasePath?: string; seed?: boolean; logger?: boolean; corsOrigins?: string[];
  ai?: AiConfig;
};
const params = object({ id: Id });
const versionBody = object({ version: Version });
const list = (item: TSchema) => object({ items: Type.Array(item) });
const responses = (status: number, schema: TSchema) => ({ [status]: schema, 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema });
const businessHeader = { type: 'apiKey' as const, in: 'header' as const, name: 'X-Business-Id', description: 'Demo identity selector, not production authentication. Use business-demo.' };
const teamHeader = { type: 'apiKey' as const, in: 'header' as const, name: 'X-Team-Id', description: 'Demo identity selector; choose a team from GET /api/teams.' };
const businessSecurity = [{ demoBusiness: [] }];
const teamSecurity = [{ demoTeam: [] }];

export async function createApp(options: AppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 65536, ajv: { customOptions: { removeAdditional: false } } }).withTypeProvider<TypeBoxTypeProvider>();
  const store = new Store(options.databasePath ?? ':memory:');
  const service = new Service(store);
  if (options.seed ?? true) seedDemo(service);
  app.addHook('onClose', async () => store.close());
  app.setErrorHandler((error, request, reply) => {
    const typed = error as { statusCode?: number; validation?: unknown; message?: string };
    const status = error instanceof ApiError ? error.statusCode : typed.statusCode && typed.statusCode < 500 ? typed.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, 'Request failed');
    reply.code(status).send({ error: { code: error instanceof ApiError ? error.code : status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR', message: status >= 500 ? 'Внутренняя ошибка сервера.' : typed.message ?? 'Некорректный запрос.' } });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Маршрут не найден.' } }));
  await app.register(cors, {
    origin: options.corsOrigins ?? ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-Business-Id', 'X-Team-Id'],
  });
  await app.register(swagger, {
    openapi: { info: { title: 'SkillArena API', version: '0.1.0', description: 'Hackathon business tasks, readiness and open proposals. Identity headers are demo selectors only.' }, components: { securitySchemes: { demoBusiness: businessHeader, demoTeam: teamHeader } } },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/api/health', { schema: { tags: ['System'], response: { 200: object({ status: text(), aiConfigured: Type.Boolean(), storage: text(), authentication: text() }) } } }, async () => ({ status: 'ok', aiConfigured: Boolean(options.ai?.apiKey), storage: 'sqlite', authentication: 'demo-identities' }));
  app.get('/api/businesses', { schema: { tags: ['Demo identities'], response: { 200: list(object({ id: Id, name: text() })) } } }, async () => ({ items: BUSINESSES }));
  app.get('/api/teams', { schema: { tags: ['Demo identities'], response: { 200: list(TeamSchema) } } }, async () => ({ items: service.teams() }));
  app.post('/api/teams', {
    schema: { tags: ['Demo identities'], body: Type.Omit(TeamSchema, ['id', 'xp']), response: responses(201, TeamSchema) },
  }, async (request, reply) => reply.code(201).send(service.createTeam(request.body)));

  app.get('/api/tasks', {
    schema: { tags: ['Catalog'], querystring: object({ topic: Type.Optional(text(120)), industry: Type.Optional(text(120)), readiness: Type.Optional(LevelSchema) }), response: { 200: list(PublishedSchema) } },
  }, async request => ({ items: service.catalog(request.query) }));
  app.get('/api/tasks/:id', { schema: { tags: ['Catalog'], params, response: responses(200, PublishedSchema) } }, async request => service.publishedTask(request.params.id));
  app.get('/api/business/tasks', { schema: { tags: ['Business tasks'], security: businessSecurity, response: responses(200, list(TaskSchema)) } }, async request => ({ items: service.businessTasks(request.headers['x-business-id'] as string | undefined) }));
  app.get('/api/business/tasks/:id', { schema: { tags: ['Business tasks'], security: businessSecurity, params, response: responses(200, TaskSchema) } }, async request => service.ownedTask(request.params.id, request.headers['x-business-id'] as string | undefined));
  app.post('/api/tasks', {
    schema: { tags: ['Business tasks'], security: businessSecurity, body: object({ description: nonempty(12000), industry: nonempty(120), topic: Type.Optional(nonempty(120)) }), response: responses(201, TaskSchema) },
  }, async (request, reply) => reply.code(201).send(service.createTask(request.headers['x-business-id'] as string | undefined, request.body)));
  app.patch('/api/tasks/:id', {
    schema: { tags: ['Business tasks'], security: businessSecurity, params, body: object({ version: Version, card: Type.Optional(Type.Partial(CardSchema)), industry: Type.Optional(nonempty(120)), topic: Type.Optional(nonempty(120)) }), response: responses(200, TaskSchema) },
  }, async request => service.editTask(request.params.id, request.headers['x-business-id'] as string | undefined, request.body));
  app.post('/api/tasks/:id/confirm', { schema: { tags: ['Business tasks'], security: businessSecurity, params, body: versionBody, response: responses(200, TaskSchema) } }, async request => service.confirmTask(request.params.id, request.headers['x-business-id'] as string | undefined, request.body.version));
  app.post('/api/tasks/:id/publish', { schema: { tags: ['Business tasks'], security: businessSecurity, params, body: versionBody, response: responses(200, PublishedSchema) } }, async request => service.publishTask(request.params.id, request.headers['x-business-id'] as string | undefined, request.body.version));

  app.post('/api/tasks/:id/clarify', {
    schema: { tags: ['AI'], security: businessSecurity, params, body: versionBody, response: responses(200, AnalysisSchema) },
  }, async request => {
    const owner = request.headers['x-business-id'] as string | undefined;
    const task = service.ownedTask(request.params.id, owner); service.version(task, request.body.version);
    const analysis = await analyzeTask(task, options.ai);
    service.version(service.ownedTask(task.id, owner), task.version);
    return { taskId: task.id, version: task.version, ...analysis, missingFields: calculateRating(analysis.suggestedCard, false).missingFields };
  });
  app.post('/api/tasks/:id/generate-card', {
    schema: { tags: ['AI'], security: businessSecurity, params, body: object({ version: Version, answers: AnswersSchema }), response: responses(200, object({ task: TaskSchema, questions: Type.Array(QuestionSchema), ai: AiMetaSchema })) },
  }, async request => {
    const owner = request.headers['x-business-id'] as string | undefined;
    const task = service.ownedTask(request.params.id, owner); service.version(task, request.body.version);
    const analysis = await analyzeTask({ ...task, answers: request.body.answers }, options.ai);
    const updated = service.editTask(task.id, owner, { version: task.version, card: analysis.suggestedCard }, request.body.answers.map(answer => answer.field));
    return { task: updated, questions: analysis.questions, ai: analysis.ai };
  });

  app.post('/api/tasks/:id/proposals', { schema: { tags: ['Proposals'], security: teamSecurity, params, body: ProposalInputSchema, response: responses(201, ProposalSchema) } }, async (request, reply) => reply.code(201).send(service.submitProposal(request.params.id, request.headers['x-team-id'] as string | undefined, request.body)));
  app.get('/api/tasks/:id/proposals', { schema: { tags: ['Proposals'], security: businessSecurity, params, response: responses(200, list(ProposalSchema)) } }, async request => ({ items: service.proposals(request.params.id, request.headers['x-business-id'] as string | undefined) }));
  app.get('/api/team/proposals', { schema: { tags: ['Proposals'], security: teamSecurity, response: responses(200, list(ProposalSchema)) } }, async request => ({ items: service.teamProposals(request.headers['x-team-id'] as string | undefined) }));
  app.patch('/api/proposals/:id/decision', { schema: { tags: ['Proposals'], security: businessSecurity, params, body: object({ decision: Type.Union([Type.Literal('selected'), Type.Literal('rejected')]) }), response: responses(200, ProposalSchema) } }, async request => service.decide(request.params.id, request.headers['x-business-id'] as string | undefined, request.body.decision));
  app.post('/api/proposals/:id/progress', { schema: { tags: ['Progress'], security: businessSecurity, params, body: MilestoneInputSchema, response: responses(200, MilestoneSchema) } }, async request => service.confirmProgress(request.params.id, request.headers['x-business-id'] as string | undefined, request.body));
  await app.ready();
  return app;
}
