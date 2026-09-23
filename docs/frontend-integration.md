# Подключение Next.js / TypeScript

Backend запускается отдельно: `cd backend && npm ci && npm run dev` (Node 24+).
API: `http://127.0.0.1:3001`, Swagger: `/docs/`, полный контракт: `backend/openapi.json`.

В окружении фронтенда:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001
```

`OPENAI_API_KEY` хранится только в `backend/.env`. В публичные env Next.js его не добавлять.

## TypeScript-клиент

Готовый клиент: `backend/src/client.ts`. Его можно импортировать из Next.js в этом репозитории; он использует обычный браузерный `fetch` и только type-import для контрактов. Пути ниже нужно адаптировать к расположению frontend. Установите зависимости backend командой `npm ci --prefix backend`, чтобы TypeScript мог разрешить типы контрактов.

```ts
import { createSkillArenaClient, SkillArenaApiError } from '../backend/src/client';

const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001';
const business = createSkillArenaClient(base, { businessId: 'business-demo' });
const publicApi = createSkillArenaClient(base);

let task = await business.createTask({
  description: 'Клиенты редко возвращаются после первого заказа.',
  industry: 'Retail', topic: 'Analytics',
});
const analysis = await business.clarify(task.id, task.version);
// Показать analysis.questions; их field привязывает ответ к полю карточки.
// Показать analysis.ai.mode: live / fallback.

const generated = await business.generateCard(task.id, task.version, [
  { field: 'data', answer: 'Обезличенный CSV заказов за три месяца' },
  { field: 'users', answer: 'Покупатели магазина' },
  { field: 'successCriteria', answer: 'Три сегмента с причинами оттока' },
]);
task = generated.task; // ОБЯЗАТЕЛЬНО сохранить новую version.

task = await business.editTask(task.id, {
  version: task.version,
  card: { title: 'Причины оттока покупателей', need: 'Повысить повторные покупки' },
});
// До подтверждения показывать rating.previewScore как «после подтверждения».
// Для редактора использовать task.card, rating.breakdown и rating.missingFields.

// Вызываются только по явному действию пользователя:
task = await business.confirm(task.id, task.version);
const published = await business.publish(task.id, task.version);

const { items: catalog } = await publicApi.catalog();
const { items: teams } = await publicApi.teams();
const student = createSkillArenaClient(base, { teamId: teams[0].id });
const proposal = await student.submitProposal(task.id, {
  idea: 'Сравнить когорты клиентов',
  plan: 'Очистить данные → рассчитать retention → собрать отчёт',
  timeline: 'Две недели',
  prototypeUrl: 'https://example.test/prototype',
});

const { items: proposals } = await business.proposals(task.id);
// Кнопки бизнес-пользователя, никогда не вызывать автоматически:
await business.decide(proposal.id, 'selected'); // либо 'rejected'
await business.confirmProgress(proposal.id, {
  key: 'first-report',
  description: 'Когортный отчёт проверен представителем бизнеса',
  evidenceUrl: 'https://example.test/report',
});
```

Для простого fetch бизнес-запросы используют заголовок `X-Business-Id: business-demo`, студенческие — `X-Team-Id: team-demo-1` (или ID созданной команды). Это демо-персонажи, не логин или механизм защиты аккаунта.

## Правила состояния UI

1. В кабинете бизнеса читайте `GET /api/business/tasks`. В каталоге — `GET /api/tasks`: там только опубликованные снимки.
2. После `PATCH`/`generate-card` заменяйте локальную задачу целиком ответом сервера, включая новую `version`.
3. `clarify` ничего не сохраняет. `suggestedCard` — предварительное предложение. `generate-card` сохраняет новый черновик, но не подтверждает и не публикует его.
4. `rating.score` — подтверждённый рейтинг. `rating.previewScore` — предварительный. Не отображайте preview как подтверждённый балл.
5. Даже 0–39 баллов не отключают кнопку отклика. `draft` в `rating.level` обозначает уровень готовности и не совпадает со статусом публикации.
6. При редактировании опубликованной задачи каталог продолжает показывать старую публикацию. После повторных confirm/publish он получит новую версию.
7. При `SkillArenaApiError.status === 409` загрузите `business.draft(id)` и предложите пользователю повторить действие с актуальными данными. Не перезаписывайте чужую новую версию автоматически.
8. Показывайте AI fallback явно. Генерация может занять до 12 секунд; отключайте повторную отправку, показывайте индикатор и сохраняйте введённые ответы.
9. Списки возвращают `{ items: [...] }`. Создание/редактирование задачи возвращает `Task`; `publish` — `PublishedTask`; `generate-card` — `{ task, questions, ai }`.
10. Для HTML выводите текст как обычные React-строки, не через `dangerouslySetInnerHTML`.

## Поля карточки

`title`, `context`, `need`, `users`, `data`, `constraints`, `expectedResult`, `successCriteria`, `contact`, `collaborationFormat` — строки. Неизвестные значения представлены пустыми строками. `title` до 200 символов, `contact` до 500, остальные до 4000. `industry`/`topic` до 120. `answers` — массив `{ field, answer }`, каждое поле не более одного раза. Передавайте PATCH только изменённых полей: переданные поля считаются ручным решением, включая намеренное очищение.

`prototypeUrl` и `evidenceUrl` должны быть `http://` или `https://`. Поля `version`, `score`, `status`, `xp` рассчитывает сервер; клиент не может их произвольно задавать.

Ошибки: `{ "error": { "code": "CONFLICT", "message": "..." } }`. Основные статусы: 400 — валидация, 401 — не выбрана демо-роль, 403 — чужой бизнес, 404 — объект не найден/не опубликован, 409 — конфликт версии или состояния, 422 — нет названия для публикации.

На другом компьютере замените адрес API и разрешите origin Next.js в `backend/.env` (`CORS_ORIGINS`). `localhost` в браузере всегда означает компьютер пользователя.
