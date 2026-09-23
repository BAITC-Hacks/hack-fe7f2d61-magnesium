import { Type, type Static } from '@sinclair/typebox';

export const text = (maxLength = 4000) => Type.String({ maxLength });
export const nonempty = (maxLength = 4000) => Type.String({ minLength: 1, maxLength, pattern: '\\S' });
export const object = <T extends Parameters<typeof Type.Object>[0]>(properties: T) => Type.Object(properties, { additionalProperties: false });
export const Id = Type.String({ minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' });
export const Version = Type.Integer({ minimum: 1 });
export const CardSchema = object({
  title: text(200), context: text(), need: text(), users: text(), data: text(),
  constraints: text(), expectedResult: text(), successCriteria: text(), contact: text(500), collaborationFormat: text(),
});
export type Card = Static<typeof CardSchema>;
export type CardField = keyof Card;
export const CardFieldSchema = Type.KeyOf(CardSchema);
export const CARD_FIELDS = Object.keys(CardSchema.properties) as CardField[];
export const emptyCard = (): Card => Object.fromEntries(CARD_FIELDS.map(field => [field, ''])) as Card;
export const CreateTaskInputSchema = object({ description: nonempty(12000), industry: nonempty(120), topic: Type.Optional(nonempty(120)), company: Type.Optional(nonempty(120)), requestId: Type.Optional(Id) });
export type CreateTaskInput = Static<typeof CreateTaskInputSchema>;
export const EditTaskInputSchema = object({
  version: Version, card: Type.Optional(Type.Partial(CardSchema)), description: Type.Optional(nonempty(12000)),
  industry: Type.Optional(nonempty(120)), topic: Type.Optional(nonempty(120)), company: Type.Optional(nonempty(120)),
});
export type EditTaskInput = Static<typeof EditTaskInputSchema>;
export const LevelSchema = Type.Union(['draft', 'working', 'ready', 'priority'].map(level => Type.Literal(level)));
export type Level = 'draft' | 'working' | 'ready' | 'priority';
const Score = Type.Integer({ minimum: 0, maximum: 100 });
export const RatingSchema = object({
  score: Score, previewScore: Score, level: LevelSchema, previewLevel: LevelSchema,
  breakdown: Type.Array(object({ id: text(), label: text(), maxPoints: Score, earned: Score, possible: Score, missingFields: Type.Array(CardFieldSchema) })),
  missingFields: Type.Array(CardFieldSchema), unconfirmedFields: Type.Array(CardFieldSchema),
});
export type Rating = Static<typeof RatingSchema>;
export const PublishedSchema = object({
  id: Id, businessId: Id, industry: text(120), topic: text(120), company: Type.Optional(text(120)), card: CardSchema,
  version: Version, rating: RatingSchema, publishedAt: text(), updatedAt: text(),
});
export type PublishedTask = Static<typeof PublishedSchema>;
export const TaskSchema = object({
  id: Id, businessId: Id, description: text(12000), industry: text(120), topic: text(120), company: Type.Optional(text(120)),
  card: CardSchema, humanEditedFields: Type.Array(CardFieldSchema), version: Version, confirmedVersion: Type.Union([Version, Type.Null()]),
  status: Type.Union([Type.Literal('draft'), Type.Literal('confirmed'), Type.Literal('published')]),
  hasUnpublishedChanges: Type.Boolean(), rating: RatingSchema,
  published: Type.Union([PublishedSchema, Type.Null()]), createdAt: text(), updatedAt: text(),
});
export type Task = Static<typeof TaskSchema>;
export const TeamSchema = object({
  id: Id, name: nonempty(120), interests: Type.Array(nonempty(120), { maxItems: 20 }),
  skills: Type.Array(nonempty(120), { maxItems: 30 }), technologies: Type.Array(nonempty(120), { maxItems: 30 }),
  xp: Type.Integer({ minimum: 0 }),
});
export type Team = Static<typeof TeamSchema>;
export const HttpUrl = Type.String({ maxLength: 2000, format: 'uri', pattern: '^https?://' });
const ProposalDetailsSchema = object({ idea: nonempty(), plan: nonempty(), timeline: nonempty(300), prototypeUrl: HttpUrl });
export const ProposalInputSchema = object({ ...ProposalDetailsSchema.properties, requestId: Type.Optional(Id) });
export type ProposalInput = Static<typeof ProposalInputSchema>;
export const ProposalSchema = object({
  id: Id, taskId: Id, teamId: Id, ...ProposalDetailsSchema.properties,
  status: Type.Union([Type.Literal('pending'), Type.Literal('selected'), Type.Literal('rejected')]),
  createdAt: text(), decidedAt: Type.Union([text(), Type.Null()]), milestoneConfirmed: Type.Boolean(),
});
export type Proposal = Static<typeof ProposalSchema>;
export const MilestoneInputSchema = object({ key: Id, description: nonempty(), evidenceUrl: HttpUrl });
export type MilestoneInput = Static<typeof MilestoneInputSchema>;
export const MilestoneSchema = object({
  id: Id, proposalId: Id, teamId: Id, ...MilestoneInputSchema.properties,
  points: Type.Integer({ minimum: 0 }), confirmedAt: text(), confirmedBy: Id,
});
export type Milestone = Static<typeof MilestoneSchema>;
export const AnswersSchema = Type.Array(object({ field: CardFieldSchema, answer: text() }), { maxItems: 10 });
export type Answer = Static<typeof AnswersSchema>[number];
export const QuestionSchema = object({ field: CardFieldSchema, question: nonempty(600) });
export type Question = Static<typeof QuestionSchema>;
export const AiMetaSchema = object({
  mode: Type.Union([Type.Literal('live'), Type.Literal('fallback')]),
  reason: Type.Union([text(100), Type.Null()]), model: Type.Union([text(100), Type.Null()]),
});
export type AiMeta = Static<typeof AiMetaSchema>;
export const BriefFieldsSchema = object({
  context: text(), need: text(), data: text(), outcome: text(), criteria: text(),
  constraints: text(), users: text(), contact: text(500), interaction: text(),
});
export type BriefFields = Static<typeof BriefFieldsSchema>;
export type BriefField = keyof BriefFields;
export const BriefAnalysisInputSchema = object({ brief: nonempty(12000), fields: BriefFieldsSchema });
export type BriefAnalysisInput = Static<typeof BriefAnalysisInputSchema>;
export const BriefQuestionSchema = object({ field: Type.KeyOf(BriefFieldsSchema), question: Type.String({ minLength: 8, maxLength: 600, pattern: '\\S' }) });
export type BriefQuestion = Static<typeof BriefQuestionSchema>;
export const BriefAnalysisSchema = object({
  questions: Type.Array(BriefQuestionSchema, { minItems: 3, maxItems: 9 }),
  source: Type.Union([Type.Literal('api'), Type.Literal('demo')]), ai: AiMetaSchema,
});
export type BriefAnalysis = Static<typeof BriefAnalysisSchema>;
export const AnalysisSchema = object({
  taskId: Id, version: Version, questions: Type.Array(QuestionSchema, { minItems: 3 }),
  suggestedCard: CardSchema, missingFields: Type.Array(CardFieldSchema), ai: AiMetaSchema,
});
export type Analysis = Static<typeof AnalysisSchema>;
export const ErrorSchema = object({ error: object({ code: text(), message: text() }) });
