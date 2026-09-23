export const fields = [
  {
    key: "context",
    label: "Контекст",
    help: "Что происходит сейчас? В чём проблема?",
    weight: 10,
    group: "Контекст и потребность",
  },
  {
    key: "need",
    label: "Потребность",
    help: "Что необходимо изменить или улучшить?",
    weight: 10,
    group: "Контекст и потребность",
  },
  {
    key: "data",
    label: "Данные и материалы",
    help: "Какие данные, примеры или источники доступны команде?",
    weight: 20,
    group: "Данные и материалы",
  },
  {
    key: "outcome",
    label: "Ожидаемый результат",
    help: "Что конкретно должна создать команда?",
    weight: 15,
    group: "Ожидаемый результат",
  },
  {
    key: "criteria",
    label: "Критерии успеха",
    help: "По каким измеримым признакам вы примете работу?",
    weight: 15,
    group: "Критерии успеха",
  },
  {
    key: "constraints",
    label: "Ограничения",
    help: "Сроки, технологии, бюджет, доступы и другие границы.",
    weight: 10,
    group: "Ограничения",
  },
  {
    key: "users",
    label: "Пользователи",
    help: "Кто будет пользоваться решением?",
    weight: 10,
    group: "Пользователи",
  },
  {
    key: "contact",
    label: "Контакт",
    help: "Рабочий email или другой способ связи.",
    weight: 5,
    group: "Связь с бизнесом",
  },
  {
    key: "interaction",
    label: "Формат взаимодействия",
    help: "Как часто бизнес консультирует команду и даёт обратную связь?",
    weight: 5,
    group: "Связь с бизнесом",
  },
] as const;

export type FieldKey = (typeof fields)[number]["key"];
export type TaskFields = Record<FieldKey, string>;
export const topics = [
  "Продукт",
  "Разработка",
  "Дизайн",
  "Аналитика",
  "Маркетинг",
] as const;
export type Topic = (typeof topics)[number];
export type Level = "Черновик" | "Рабочая" | "Готовая" | "Приоритетная";
export interface BusinessTask extends TaskFields {
  id: string;
  title: string;
  company: string;
  topic: Topic;
  brief: string;
  confirmed: FieldKey[];
  published: boolean;
  owner: "demo-business" | "example";
  createdAt: string;
  tags: string[];
  serverVersion?: number;
  publishedScore?: number;
  hasUnpublishedChanges?: boolean;
}
export interface Team {
  id: string;
  name: string;
  initials: string;
  interests: string[];
  skills: string[];
  technologies: string[];
  members?: number;
  xp?: number;
}
export interface Proposal {
  id: string;
  taskId: string;
  teamId: string;
  idea: string;
  plan: string;
  duration: string;
  prototype: string;
  status: "pending" | "selected" | "rejected";
  createdAt: string;
  milestoneConfirmed: boolean;
}
export interface Workspace {
  version: 1;
  tasks: BusinessTask[];
  proposals: Proposal[];
}
export const emptyFields: TaskFields = {
  context: "",
  need: "",
  data: "",
  outcome: "",
  criteria: "",
  constraints: "",
  users: "",
  contact: "",
  interaction: "",
};

export function scoreTask(task: Pick<BusinessTask, FieldKey | "confirmed">) {
  const breakdown = fields.map((field) => ({
    ...field,
    earned:
      task.confirmed.includes(field.key) && task[field.key].trim()
        ? field.weight
        : 0,
  }));
  const total = breakdown.reduce((sum, field) => sum + field.earned, 0);
  return {
    total,
    breakdown,
    missing: breakdown.filter((field) => !field.earned),
    level: readiness(total),
  };
}
export function readiness(score: number): Level {
  return score >= 90
    ? "Приоритетная"
    : score >= 70
      ? "Готовая"
      : score >= 40
        ? "Рабочая"
        : "Черновик";
}
export function catalog(
  tasks: BusinessTask[],
  query = "",
  topic = "Все темы",
  level = "Любая готовность",
) {
  const needle = query.trim().toLocaleLowerCase("ru");
  return tasks
    .filter(
      (task) =>
        task.published &&
        (topic === "Все темы" || task.topic === topic) &&
        (level === "Любая готовность" || scoreTask(task).level === level) &&
        `${task.title} ${task.company} ${task.need} ${task.tags.join(" ")}`
          .toLocaleLowerCase("ru")
          .includes(needle),
    )
    .sort(
      (a, b) =>
        scoreTask(b).total - scoreTask(a).total ||
        b.createdAt.localeCompare(a.createdAt),
    );
}
export function confirmFields(task: BusinessTask): BusinessTask {
  return {
    ...task,
    confirmed: fields
      .filter((field) => task[field.key].trim())
      .map((field) => field.key),
  };
}
export function editField(
  task: BusinessTask,
  key: FieldKey,
  value: string,
): BusinessTask {
  return {
    ...task,
    [key]: value,
    confirmed: [],
    hasUnpublishedChanges: task.published,
  };
}
export function safePrototype(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function validateProposal(
  proposal: Pick<Proposal, "idea" | "plan" | "duration" | "prototype">,
) {
  if (proposal.idea.trim().length < 20)
    return "Опишите идею чуть подробнее — минимум 20 символов.";
  if (proposal.plan.trim().length < 20)
    return "Добавьте план работы — минимум 20 символов.";
  if (!proposal.duration.trim()) return "Укажите срок выполнения.";
  if (!safePrototype(proposal.prototype))
    return "Добавьте корректную ссылку на прототип (https:// или http://).";
  return null;
}
export function confirmMilestone(
  proposals: Proposal[],
  id: string,
): Proposal[] {
  return proposals.map((proposal) =>
    proposal.id === id && proposal.status === "selected"
      ? { ...proposal, milestoneConfirmed: true }
      : proposal,
  );
}
export function teamXp(proposals: Proposal[], teamId: string) {
  return (
    proposals.filter(
      (proposal) => proposal.teamId === teamId && proposal.milestoneConfirmed,
    ).length * 100
  );
}
export function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const data = value as Workspace;
  return (
    data.version === 1 &&
    Array.isArray(data.tasks) &&
    Array.isArray(data.proposals) &&
    data.tasks.every(
      (task) =>
        task &&
        [
          "id",
          "title",
          "company",
          "brief",
          "createdAt",
          ...fields.map((field) => field.key),
        ].every((key) => typeof task[key as keyof BusinessTask] === "string") &&
        Array.isArray(task.confirmed) &&
        task.confirmed.every((key) =>
          fields.some((field) => field.key === key),
        ) &&
        topics.includes(task.topic) &&
        typeof task.published === "boolean" &&
        ["demo-business", "example"].includes(task.owner) &&
        Array.isArray(task.tags) &&
        task.tags.every((tag) => typeof tag === "string"),
    ) &&
    data.proposals.every(
      (proposal) =>
        proposal &&
        [
          "id",
          "taskId",
          "teamId",
          "idea",
          "plan",
          "duration",
          "prototype",
          "createdAt",
        ].every((key) => typeof proposal[key as keyof Proposal] === "string") &&
        ["pending", "selected", "rejected"].includes(proposal.status) &&
        typeof proposal.milestoneConfirmed === "boolean",
    )
  );
}
