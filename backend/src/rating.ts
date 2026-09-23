import type { Card, CardField, Level, Rating } from './contracts.js';

const rubric: { id: string; label: string; fields: [CardField, number][] }[] = [
  { id: 'contextAndNeed', label: 'Контекст и потребность', fields: [['context', 10], ['need', 10]] },
  { id: 'data', label: 'Данные и материалы', fields: [['data', 20]] },
  { id: 'expectedResult', label: 'Ожидаемый результат', fields: [['expectedResult', 15]] },
  { id: 'successCriteria', label: 'Критерии успеха', fields: [['successCriteria', 15]] },
  { id: 'constraints', label: 'Ограничения', fields: [['constraints', 10]] },
  { id: 'users', label: 'Пользователи', fields: [['users', 10]] },
  { id: 'businessContact', label: 'Связь с бизнесом', fields: [['contact', 5], ['collaborationFormat', 5]] },
];

export function readinessLevel(score: number): Level {
  return score >= 90 ? 'priority' : score >= 70 ? 'ready' : score >= 40 ? 'working' : 'draft';
}

export function calculateRating(card: Partial<Card>, confirmed: boolean): Rating {
  const filled = (field: CardField) => Boolean(card[field]?.trim());
  const breakdown = rubric.map(item => {
    const possible = item.fields.reduce((sum, [field, weight]) => sum + (filled(field) ? weight : 0), 0);
    return {
      id: item.id, label: item.label, maxPoints: item.fields.reduce((sum, [, weight]) => sum + weight, 0),
      earned: confirmed ? possible : 0, possible, missingFields: item.fields.filter(([field]) => !filled(field)).map(([field]) => field),
    };
  });
  const score = breakdown.reduce((sum, item) => sum + item.earned, 0);
  const previewScore = breakdown.reduce((sum, item) => sum + item.possible, 0);
  return {
    score, previewScore, level: readinessLevel(score), previewLevel: readinessLevel(previewScore), breakdown,
    missingFields: breakdown.flatMap(item => item.missingFields),
    unconfirmedFields: confirmed ? [] : rubric.flatMap(item => item.fields.filter(([field]) => filled(field)).map(([field]) => field)),
  };
}
