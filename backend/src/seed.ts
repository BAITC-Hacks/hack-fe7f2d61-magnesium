import type { Card } from './contracts.js';
import { Service } from './service.js';

const examples = [
  { industry: 'Retail', topic: 'Analytics', title: 'Почему покупатели не возвращаются', description: 'У магазина падают повторные покупки. Нужен анализ причин.', data: 'Обезличенный CSV заказов за три месяца', result: 'Отчёт с когортами и тремя проверяемыми гипотезами', success: 'Найдены три сегмента с высоким оттоком и рассчитана доля повторных покупок' },
  { industry: 'Education', topic: 'Web', title: 'Запись на консультации наставника', description: 'Студенты записываются к наставнику через сообщения и теряют время.', data: 'Синтетическое расписание и список доступных слотов', result: 'Веб-прототип записи на консультацию', success: 'Студент видит свободные слоты и может отправить заявку' },
  { industry: 'Logistics', topic: 'Analytics', title: 'Задержки доставки заказов', description: 'Служба доставки хочет выяснить причины опозданий.', data: 'CSV со временем создания и доставки 500 синтетических заказов', result: 'Дашборд задержек по районам', success: 'Показаны три самых проблемных района и медиана задержки' },
  { industry: 'Healthcare', topic: 'Design', title: 'Понятная навигация в клинике', description: 'Посетителям сложно найти нужный кабинет в клинике.', data: 'Схема этажа без персональных данных', result: 'Интерактивный прототип навигации', success: 'На тестовых маршрутах пользователь находит нужный кабинет' },
  { industry: 'Ecology', topic: 'Web', title: 'Карта пунктов переработки', description: 'Жители хотят найти ближайший пункт приёма вторсырья.', data: 'Синтетический список адресов и типов материалов', result: 'Карта с фильтрами по материалам', success: 'Можно найти пункт для каждого из трёх типов материалов' },
];

export function seedDemo(service: Service) {
  const { store } = service;
  if (store.db.prepare('SELECT value FROM metadata WHERE key = ?').get('demo-seed-v1')) return;
  const owner = 'business-demo';
  for (const [index, example] of examples.entries()) {
    service.createTask(owner, example, `draft-demo-${index + 1}`);
    const task = service.createTask(owner, example, `task-demo-${index + 1}`);
    // Score progression: 20, 40, 70, 90, 100. All examples are synthetic.
    const card: Partial<Card> = { title: example.title, need: 'Подготовить практическое решение описанной проблемы' };
    if (index >= 1) card.data = example.data;
    if (index >= 2) { card.expectedResult = example.result; card.successCriteria = example.success; }
    if (index >= 3) { card.constraints = 'Прототип за две недели, только синтетические данные'; card.users = 'Пользователи, описанные в контексте задачи'; }
    if (index >= 4) { card.contact = 'mentor@example.test'; card.collaborationFormat = 'Два созвона в неделю и финальное ревью'; }
    const edited = service.editTask(task.id, owner, { version: task.version, card });
    service.confirmTask(task.id, owner, edited.version);
    service.publishTask(task.id, owner, edited.version);
    const team = service.createTeam({ name: ['Qadam', 'Data Nomads', 'Pixel Steppe', 'Byte Batyrlary', 'Green Code'][index]!, interests: [example.topic, example.industry], skills: index % 2 === 0 ? ['Analysis', 'SQL'] : ['UI/UX', 'TypeScript'], technologies: index % 2 === 0 ? ['Python', 'PostgreSQL'] : ['Next.js', 'Figma'] }, `team-demo-${index + 1}`);
    service.submitProposal(task.id, team.id, { idea: `Предлагаем исследовать задачу «${example.title}»`, plan: 'Уточнить вводные → проверить гипотезу → собрать прототип → показать результат', timeline: 'Две недели', prototypeUrl: `https://example.test/prototypes/${index + 1}` }, `proposal-demo-${index + 1}`);
  }
  store.db.prepare('INSERT INTO metadata(key, value) VALUES (?, ?)').run('demo-seed-v1', new Date().toISOString());
}
