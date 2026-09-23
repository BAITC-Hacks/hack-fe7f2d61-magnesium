import {
  emptyFields,
  fields,
  type BusinessTask,
  type TaskFields,
  type Team,
  type Workspace,
} from "./domain.ts";

// All organizations, teams, tasks and proposals below are synthetic demo fixtures.
export const teams: Team[] = [
  {
    id: "team-you",
    name: "Magnesium",
    initials: "Mg",
    interests: ["EdTech", "Продукт"],
    skills: ["UX-исследования", "Разработка", "AI"],
    technologies: ["Next.js", "Python", "Figma"],
    members: 4,
  },
  {
    id: "team-orbit",
    name: "Orbit",
    initials: "Or",
    interests: ["Ритейл", "Аналитика"],
    skills: ["Аналитика", "Визуализация"],
    technologies: ["Python", "SQL", "React"],
    members: 3,
  },
  {
    id: "team-nova",
    name: "Nova Lab",
    initials: "Nv",
    interests: ["Продукт", "EdTech"],
    skills: ["Дизайн", "Прототипирование"],
    technologies: ["Figma", "React"],
    members: 4,
  },
  {
    id: "team-pixel",
    name: "Pixel People",
    initials: "Px",
    interests: ["Дизайн", "Доступность"],
    skills: ["UX", "Исследования"],
    technologies: ["Figma", "HTML", "CSS"],
    members: 3,
  },
  {
    id: "team-step",
    name: "Steppe Code",
    initials: "Sc",
    interests: ["Логистика", "Разработка"],
    skills: ["Backend", "Оптимизация"],
    technologies: ["Python", "FastAPI", "PostgreSQL"],
    members: 5,
  },
];

export const retentionAnswers: TaskFields = {
  context:
    "У учебного приложения Qadam снизилось удержание новых пользователей: с 42% до 24% на 7-й день за последние два месяца.",
  need: "Найти причины оттока в первую неделю и улучшить сценарий знакомства с продуктом.",
  users:
    "Студенты 18–24 лет, впервые зарегистрировавшиеся в мобильном приложении.",
  data: "Обезличенная выгрузка событий за 8 недель, воронка онбординга и 20 ответов пользователей. Предоставим CSV после знакомства.",
  constraints:
    "Срок — 2 недели. Без платного привлечения. Работать только с обезличенными данными; бюджет на прототип не предусмотрен.",
  outcome:
    "Интерактивный прототип нового онбординга и краткий отчёт с тремя гипотезами удержания.",
  criteria:
    "Не менее 5 пользовательских тестов; 80% участников завершают ключевой сценарий без подсказок. План A/B-теста с метрикой D7 retention.",
  contact: "product@qadam.example",
  interaction:
    "Два созвона по 30 минут в неделю. Обратная связь по прототипу в течение двух рабочих дней.",
};

export const drafts = [
  {
    industry: "EdTech",
    text: "Пользователи уходят из нашего учебного приложения. Хотим повысить удержание.",
  },
  {
    industry: "Ритейл",
    text: "У магазина есть CSV с продажами за год. Нужен дашборд для управляющего.",
  },
  {
    industry: "Логистика",
    text: "Курьеры тратят много времени на маршруты. Хотим проверить гипотезы оптимизации за две недели.",
  },
  {
    industry: "Культура",
    text: "Хотим сделать сайт музея удобнее для посетителей, использующих экранный диктор.",
  },
  {
    industry: "Экология",
    text: "Нужна стратегия продвижения сервиса раздельного сбора отходов.",
  },
];

const base = {
  ...emptyFields,
  owner: "example" as const,
  published: true,
  createdAt: "2026-09-23T08:00:00.000Z",
};
const seedTasks: BusinessTask[] = [
  {
    ...base,
    ...retentionAnswers,
    id: "retention",
    owner: "demo-business",
    title: "Помогите пользователям остаться",
    company: "Qadam",
    topic: "Продукт",
    brief: drafts[0].text,
    tags: ["EdTech", "UX Research", "Retention"],
    confirmed: fields.map((field) => field.key),
  },
  {
    ...base,
    id: "analytics",
    title: "Превратите данные в решения",
    company: "Dala Market",
    topic: "Аналитика",
    brief: drafts[1].text,
    context: "Управляющий вручную сводит продажи из пяти магазинов.",
    need: "Сократить время подготовки еженедельного отчёта.",
    data: "Обезличенные CSV с продажами за 12 месяцев и справочник товаров.",
    users: "Управляющие и аналитик розничной сети.",
    outcome: "Веб-дашборд продаж с фильтрами по периоду и магазину.",
    criteria:
      "Все пять магазинов видны на одном экране; отчёт строится менее чем за минуту.",
    constraints: "Три недели, открытые библиотеки, без персональных данных.",
    contact: "analytics@dala.example",
    interaction: "",
    confirmed: [
      "context",
      "need",
      "data",
      "users",
      "outcome",
      "criteria",
      "constraints",
      "contact",
    ],
    tags: ["Data", "Python", "Визуализация"],
  },
  {
    ...base,
    id: "delivery",
    title: "Последняя миля. Новый маршрут.",
    company: "Jol",
    topic: "Разработка",
    brief: drafts[2].text,
    context: "Курьерские маршруты составляются вручную.",
    need: "Проверить возможность сократить длину ежедневного маршрута.",
    data: "Синтетические адреса и матрица расстояний для 50 точек.",
    users: "Диспетчер небольшой службы доставки.",
    outcome:
      "Прототип построения маршрута на карте и сравнение с базовым вариантом.",
    constraints: "Две недели. Только синтетические данные.",
    confirmed: ["context", "need", "data", "users", "outcome", "constraints"],
    tags: ["Maps", "Алгоритмы", "Web"],
  },
  {
    ...base,
    id: "museum",
    title: "Культура доступна каждому",
    company: "Mura",
    topic: "Дизайн",
    brief: drafts[3].text,
    context: "Посетителям сложно находить информацию о выставках.",
    need: "Сделать навигацию доступной и понятной.",
    users: "Посетители музея, в том числе пользователи экранных дикторов.",
    outcome: "Кликабельный прототип главной страницы и страницы выставки.",
    constraints: "Две недели. Макеты для десктопа и телефона.",
    confirmed: ["context", "need", "users", "outcome", "constraints"],
    tags: ["UX/UI", "Figma", "Accessibility"],
  },
  {
    ...base,
    id: "eco",
    title: "Маленькие привычки. Большие перемены.",
    company: "Taza",
    topic: "Маркетинг",
    brief: drafts[4].text,
    context: "Мало жителей знают о пунктах раздельного сбора.",
    need: "Повысить узнаваемость сервиса в одном районе города.",
    users: "Жители района, заинтересованные в переработке.",
    confirmed: ["context", "need", "users"],
    tags: ["Sustainability", "Стратегия"],
  },
];

export function initialWorkspace(): Workspace {
  return {
    version: 1,
    tasks: structuredClone(seedTasks),
    proposals: teams.map((team, index) => ({
      id: `proposal-${index}`,
      taskId: index < 3 ? "retention" : index === 3 ? "museum" : "delivery",
      teamId: team.id,
      idea: [
        "Проверим, на каком шаге онбординга теряются пользователи, и предложим более короткий путь до первой ценности.",
        "Построим когортный анализ удержания и найдём сегменты с наибольшим падением.",
        "Проведём интервью и проверим прототип персонального первого урока.",
        "Проверим основные сценарии клавиатурой и экранным диктором, подготовим доступный прототип.",
        "Сравним простой жадный алгоритм и оптимизацию маршрутов на синтетическом наборе.",
      ][index],
      plan: "1. Уточним задачу и изучим материалы.\n2. Соберём прототип.\n3. Проведём тестирование и представим результаты.",
      duration: "2 недели",
      prototype: "https://example.com",
      status: "pending",
      createdAt: "2026-09-23T09:00:00.000Z",
      milestoneConfirmed: false,
    })),
  };
}
