import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRating, readinessLevel } from '../src/rating.js';

const complete = {
  title: 'Снизить отток клиентов', context: 'Клиенты уходят после первого заказа',
  need: 'Найти причины оттока', users: 'Покупатели приложения',
  data: 'Обезличенный CSV заказов за три месяца', constraints: 'Две недели, Python',
  expectedResult: 'Дашборд и три рекомендации', successCriteria: 'Определены три причины оттока',
  contact: 'mentor@example.test', collaborationFormat: 'Созвон во вторник и ревью в пятницу',
};

test('only confirmed fields earn readiness points; preview is separate', () => {
  const draft = calculateRating(complete, false);
  assert.equal(draft.score, 0);
  assert.equal(draft.previewScore, 100);
  assert.equal(draft.level, 'draft');
  assert.equal(draft.unconfirmedFields.length, 9);
  const confirmed = calculateRating(complete, true);
  assert.equal(confirmed.score, 100);
  assert.equal(confirmed.level, 'priority');
  assert.deepEqual(confirmed.missingFields, []);
});

test('partial cards receive exact documented weights and actionable missing fields', () => {
  const result = calculateRating({ context: 'Процесс', need: 'Изменение', data: 'CSV', expectedResult: 'Отчёт', successCriteria: 'Три вывода' }, true);
  assert.equal(result.score, 70);
  assert.equal(result.level, 'ready');
  assert.deepEqual(result.missingFields.sort(), ['users', 'constraints', 'contact', 'collaborationFormat'].sort());
  assert.equal(result.breakdown.find(item => item.id === 'businessContact')?.earned, 0);
});

test('empty and whitespace values cannot inflate the score', () => {
  assert.equal(calculateRating({ title: 'Title', context: '  ', need: '\n', data: '' }, true).score, 0);
  assert.equal(calculateRating({ context: 'Есть контекст', need: 'Есть потребность' }, true).score, 20);
  assert.equal(calculateRating({ ...complete, contact: '', collaborationFormat: '' }, true).score, 90);
});

test('readiness thresholds include exact lower and upper boundaries', () => {
  for (const [score, expected] of [[0, 'draft'], [39, 'draft'], [40, 'working'], [69, 'working'], [70, 'ready'], [89, 'ready'], [90, 'priority'], [100, 'priority']] as const) {
    assert.equal(readinessLevel(score), expected);
  }
});
