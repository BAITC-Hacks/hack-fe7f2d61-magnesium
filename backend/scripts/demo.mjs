import assert from 'node:assert/strict';
import { createSkillArenaClient } from '../dist/client.js';

const base = process.env.API_URL ?? 'http://127.0.0.1:3001';
const business = createSkillArenaClient(base, { businessId: 'business-demo' });
const requireLive = process.argv.includes('--require-live');
console.log('Running the official workflow against', base);
let task = await business.createTask({ description: 'У нашего интернет-магазина клиенты редко возвращаются после первого заказа. Нужно понять причины оттока.', industry: 'Retail', topic: 'Analytics' });
assert.equal(task.rating.score, 0);
console.log('1. Draft created:', task.id);
const clarification = await business.clarify(task.id, task.version);
assert.ok(clarification.questions.length >= 3);
console.log('2. Clarification:', clarification.questions.length, 'questions; AI:', clarification.ai.mode, clarification.ai.reason ?? '');
if (requireLive) assert.equal(clarification.ai.mode, 'live', `Live AI required: ${clarification.ai.reason}`);
const generated = await business.generateCard(task.id, task.version, [
  { field: 'title', answer: 'Исследование повторных покупок' },
  { field: 'need', answer: 'Выяснить причины оттока и предложить три эксперимента по удержанию' },
  { field: 'users', answer: 'Покупатели, сделавшие первый заказ за последние три месяца' },
  { field: 'data', answer: 'Обезличенный CSV с заказами за три месяца и 20 отзывов' },
  { field: 'constraints', answer: 'Две недели, Python или SQL, без персональных данных' },
  { field: 'expectedResult', answer: 'Дашборд когорт и отчёт с тремя гипотезами' },
  { field: 'successCriteria', answer: 'Посчитана доля повторных покупок, выделены три сегмента и предложены три измеримых эксперимента' },
  { field: 'contact', answer: 'mentor@example.test' },
  { field: 'collaborationFormat', answer: 'Созвон по вторникам, обратная связь в течение суток, финальное ревью отчёта' },
]);
if (requireLive) assert.equal(generated.ai.mode, 'live', `Live AI required: ${generated.ai.reason}`);
task = generated.task;
assert.equal(task.rating.score, 0); assert.equal(task.rating.previewScore, 100);
console.log('3. Editable card prepared; preview:', task.rating.previewScore, 'AI:', generated.ai.mode);
task = await business.confirm(task.id, task.version);
assert.equal(task.rating.score, 100);
const published = await business.publish(task.id, task.version);
assert.equal(published.rating.level, 'priority');
assert.ok((await business.catalog({ topic: 'Analytics' })).items.some(item => item.id === task.id));
console.log('4. Human confirmed and published:', published.rating.score, published.rating.level);
const team = await business.createTeam({ name: 'Demo team', interests: ['Analytics'], skills: ['SQL', 'Research'], technologies: ['Python'] });
const student = createSkillArenaClient(base, { teamId: team.id });
const proposal = await student.submitProposal(task.id, { idea: 'Разделить клиентов на когорты и найти причины ухода', plan: 'Очистить CSV → рассчитать retention → проверить отзывы → собрать дашборд', timeline: 'Две недели', prototypeUrl: 'https://example.test/demo-prototype' });
assert.equal(proposal.status, 'pending');
assert.equal((await business.proposals(task.id)).items.length, 1);
await business.decide(proposal.id, 'selected');
assert.equal((await student.myProposals()).items[0].status, 'selected');
console.log('5. Student applied; business manually selected the proposal.');
const milestone = { key: 'cohort-analysis', description: 'Подготовлен первый когортный отчёт, бизнес подтвердил результат', evidenceUrl: 'https://example.test/cohort-report' };
await business.confirmProgress(proposal.id, milestone);
await business.confirmProgress(proposal.id, milestone);
assert.equal((await business.teams()).items.find(item => item.id === team.id).xp, 100);
console.log('6. Progress confirmed; +100 XP exactly once.');
console.log('PASS — full workflow completed. Synthetic demo records remain in the local database.');
