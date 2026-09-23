import { fields, type BusinessTask, type FieldKey } from "./domain.ts";

export interface ClarifyingQuestion {
  field: FieldKey;
  question: string;
}
export interface Analysis {
  questions: ClarifyingQuestion[];
  source: "demo" | "api";
}
export const analysisPrompt = `Ты помогаешь бизнесу уточнить практическую задачу для студентов. Вход: {brief, fields}. Определи недостающие сведения и верни JSON {"questions":[{"field":"data","question":"..."}]}. Нужно от 3 до 9 разных уместных вопросов. Допустимые field: context, need, data, outcome, criteria, constraints, users, contact, interaction. Не добавляй факты и не заполняй поля за пользователя. Не выбирай команду. Не используй чувствительные признаки участников. Если всё заполнено, спроси о проверке критериев, данных и ограничений.`;

export function parseAnalysis(raw: unknown): ClarifyingQuestion[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("questions" in raw) ||
    !Array.isArray(raw.questions)
  )
    throw new Error("AI вернул ответ без списка вопросов.");
  const questions = raw.questions;
  if (questions.length < 3 || questions.length > 9)
    throw new Error("Ожидается от 3 до 9 уточняющих вопросов.");
  const used = new Set<string>();
  return questions.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !fields.some((field) => field.key === item.field) ||
      typeof item.question !== "string" ||
      item.question.trim().length < 8 ||
      item.question.length > 600 ||
      used.has(item.field)
    )
      throw new Error("AI вернул некорректные или повторяющиеся вопросы.");
    used.add(item.field);
    return { field: item.field as FieldKey, question: item.question.trim() };
  });
}

export function demoAnalysis(
  task: Pick<BusinessTask, FieldKey | "brief">,
): Analysis {
  const retention = /удерж|уход|retention|отток/i.test(task.brief);
  const questions: ClarifyingQuestion[] = fields
    .filter((field) => !task[field.key].trim())
    .map((field) => ({ field: field.key, question: field.help }));
  if (retention) {
    const dataQuestion = questions.find(
      (question) => question.field === "data",
    );
    if (dataQuestion)
      dataQuestion.question =
        "Есть ли данные по удержанию, воронке онбординга или причинам ухода пользователей?";
    const criteriaQuestion = questions.find(
      (question) => question.field === "criteria",
    );
    if (criteriaQuestion)
      criteriaQuestion.question =
        "Какую метрику удержания вы хотите улучшить и как проверите результат работы команды?";
  }
  for (const key of ["criteria", "data", "constraints"] as const) {
    if (questions.length >= 3) break;
    if (!questions.some((question) => question.field === key))
      questions.push({
        field: key,
        question: `Проверьте и уточните поле «${fields.find((field) => field.key === key)!.label}»: сведения актуальны и доступны команде?`,
      });
  }
  return { questions, source: "demo" };
}

export const apiConfigured = Boolean(process.env.NEXT_PUBLIC_BRIEF_API_URL);
export async function analyzeBrief(
  task: BusinessTask,
  signal?: AbortSignal,
): Promise<Analysis> {
  if (signal?.aborted) throw new Error("Запрос отменён.");
  const endpoint = process.env.NEXT_PUBLIC_BRIEF_API_URL;
  if (!endpoint) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 650);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Запрос отменён."));
        },
        { once: true },
      );
    });
    return demoAnalysis(task);
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: task.brief,
        fields: Object.fromEntries(
          fields.map((field) => [field.key, task[field.key]]),
        ),
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `AI-сервис недоступен (HTTP ${response.status}). Повторите запрос или продолжите в демо-режиме.`,
      );
    return { questions: parseAnalysis(await response.json()), source: "api" };
  } catch (error) {
    if (signal?.aborted) throw new Error("Запрос отменён.");
    if (error instanceof Error && error.name === "TimeoutError")
      throw new Error(
        "AI не ответил за 15 секунд. Повторите запрос или продолжите с демо-вопросами.",
      );
    if (error instanceof SyntaxError)
      throw new Error(
        "AI вернул некорректный JSON. Повторите запрос или продолжите с демо-вопросами.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Нет соединения с AI-сервисом. Проверьте адрес API и подключение или продолжите с демо-вопросами.",
      );
    throw error;
  }
}
