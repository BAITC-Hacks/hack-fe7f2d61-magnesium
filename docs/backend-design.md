# SkillArena backend — hackathon MVP

Official brief: https://docs.google.com/document/d/1lFWekP2SirFarATKkWa5neHNL5DlhjZKkUacvGyZk8k/edit

The official business-task workflow takes priority over the earlier student-simulation concept. Deliver one working flow: draft → at least three AI clarification questions → editable card → human confirmation → readiness score → open catalog → student proposal → manual business decision → confirmed progress points.

## Scope and architecture

Independent TypeScript/Fastify REST service in `backend/`, Node.js 24+, SQLite persistence, JSON Schema validation and generated OpenAPI/Swagger. Frontend code and its package files remain owned by the frontend developer. Demo business/team identities replace registration; identity headers are deliberately **not production authentication**.

Task card fields: title, context, need, users, data, constraints, expectedResult, successCriteria, contact, collaborationFormat. Industry and topic are catalog metadata. A draft has an integer version; edits invalidate confirmation. Publishing requires explicit confirmation of the current version. Published snapshots remain visible while a new revision is being edited.

Readiness is deterministic: context 10 + need 10 + data 20 + expectedResult 15 + successCriteria 15 + constraints 10 + users 10 + contact 5 + collaborationFormat 5. Only confirmed, nonempty fields earn points. The API also returns an explicitly labeled preview score, breakdown and missing fields. Levels: 0–39 draft, 40–69 working, 70–89 ready, 90–100 priority. Every published task remains available for proposals, including low scores.

AI uses a configurable OpenAI Responses API model and strict structured output. Its extraction is limited to exact quotes from supplied text; unknown facts stay blank. Human answers and edits are authoritative. Questions and suggested cards never publish or select teams. Timeout, refusal, malformed JSON, invalid fields or unavailable credentials return a labeled deterministic fallback. Prompts, schemas and fallback reason are documented; credentials stay in local environment files.

SQLite stores drafts, published snapshots, teams, proposals and confirmed milestones. Optimistic version checks prevent an AI response from overwriting newer edits. Business selects/rejects proposals manually; multiple selected teams are allowed. Only an explicitly confirmed milestone on a selected proposal awards 100 activity points, once per milestone key. These points are not a skill assessment.

Demo data: five unpublished drafts, five published cards spanning readiness levels, five teams and five proposals. No OAuth, payments, messaging, simulation engine or hiring scores in this slice.

## Verification

Use real SQLite and Fastify injection for workflow tests, plus unit tests for rating boundaries and a local fake HTTP provider for AI contract/failure tests. Run typecheck, tests, production build and a full HTTP demo. Publish code to `backend`; do not merge `main` automatically.
