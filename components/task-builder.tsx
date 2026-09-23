"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  analyzeBrief,
  aiFallbackMessage,
  demoAnalysis,
  type Analysis,
  type AiStatus,
} from "@/lib/brief-api";
import {
  confirmFields,
  editField,
  emptyFields,
  fields,
  scoreTask,
  topics,
  type BusinessTask,
  type FieldKey,
} from "@/lib/domain";
import { drafts, retentionAnswers } from "@/lib/fixtures";
import { RatingPanel } from "./ui";
import { SkillArenaApiError } from "@/backend/src/client";
import {
  editableLabel,
  mergeTaskEdits,
  taskFingerprint,
  type EditableKey,
} from "@/lib/editor";
import { useUnsavedChanges } from "./use-unsaved-changes";

interface Props {
  existing?: BusinessTask;
  onPublish: (task: BusinessTask) => Promise<void>;
  onSave: (task: BusinessTask) => Promise<void>;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onAiStatus: (status: AiStatus) => void;
  onRecover: (task: BusinessTask) => Promise<BusinessTask>;
}
export function TaskBuilder({
  existing,
  onPublish,
  onSave,
  onClose,
  onDirtyChange,
  onAiStatus,
  onRecover,
}: Props) {
  const [task, updateTask] = useState<BusinessTask>(() =>
    existing
      ? structuredClone(existing)
      : {
          ...emptyFields,
          id: crypto.randomUUID(),
          title: "",
          company: "Magnesium Business",
          brief: "",
          topic: "Продукт",
          tags: [],
          confirmed: [],
          published: false,
          owner: "demo-business",
          createdAt: new Date().toISOString(),
        },
  );
  const [step, setStep] = useState(existing ? 2 : 0);
  const [base, setBase] = useState(task);
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState<{
    local: BusinessTask;
    remote: BusinessTask;
    fields: EditableKey[];
    choices: Partial<Record<EditableKey, "local" | "remote">>;
  } | null>(null);
  const dirty = taskFingerprint(task) !== taskFingerprint(base);
  const unresolved =
    review?.fields.some((key) => !review.choices[key]) ?? false;
  useUnsavedChanges(dirty);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  function setTask(
    value: BusinessTask | ((previous: BusinessTask) => BusinessTask),
  ) {
    setApproved(false);
    updateTask((previous) => {
      const next = typeof value === "function" ? value(previous) : value;
      return taskFingerprint(previous) === taskFingerprint(next)
        ? next
        : {
            ...next,
            confirmed: [],
            hasUnpublishedChanges: next.published,
          };
    });
  }
  const [exampleLoaded, setExampleLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const aiPending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (aiPending.current) onAiStatus("idle");
    },
    [onAiStatus],
  );
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const change = (key: FieldKey, value: string) => {
    setTask((prev) => editField(prev, key, value));
    setApproved(false);
  };
  function saveError(error: unknown) {
    if (error instanceof SkillArenaApiError && error.status === 409) {
      setConflict(true);
      setApproved(false);
      setError(
        "На сервере появилась другая версия. Ваш текст сохранён в форме. Загрузите изменения для сравнения.",
      );
    } else
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить карточку.",
      );
  }
  async function recover() {
    setBusy(true);
    try {
      const remote = await onRecover(task);
      const { merged, conflicts } = mergeTaskEdits(base, task, remote);
      setReview({ local: task, remote, fields: conflicts, choices: {} });
      setBase(remote);
      setTask(merged);
      setApproved(false);
      setConflict(false);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить новую версию. Ваш текст остаётся в форме.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    if (task.brief.trim().length < 20) {
      setError(
        "Опишите задачу хотя бы в одном предложении — минимум 20 символов.",
      );
      return;
    }
    setBusy(true);
    onAiStatus("loading");
    aiPending.current = true;
    setError("");
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const result = await analyzeBrief(task, controller.current.signal);
      setAnalysis(result);
      onAiStatus(result.ai.mode === "live" ? "live" : "fallback");
      setStep(1);
    } catch (err) {
      if (!controller.current.signal.aborted) onAiStatus("error");
      if (!controller.current.signal.aborted)
        setError(
          err instanceof Error
            ? err.message
            : "Не удалось проанализировать задачу.",
        );
    } finally {
      aiPending.current = false;
      setBusy(false);
    }
  }
  const publish = async () => {
    if (unresolved || conflict) return;
    if (!task.title.trim()) {
      setError("Добавьте название задачи.");
      return;
    }
    if (!task.company.trim()) {
      setError("Укажите название компании.");
      return;
    }
    if (!approved) {
      setError("Проверьте карточку и подтвердите сведения перед публикацией.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onPublish({
        ...confirmFields(task),
        title: task.title.trim(),
        company: task.company.trim(),
        published: true,
        tags: task.tags.length ? task.tags : [task.topic],
      });
    } catch (error) {
      saveError(error);
    } finally {
      setBusy(false);
    }
  };

  async function saveDraft() {
    if (unresolved || conflict) return;
    setBusy(true);
    setError("");
    try {
      await onSave(task);
    } catch (error) {
      saveError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="builder enter">
      <button className="back-link" onClick={onClose} disabled={busy}>
        <ArrowLeft size={15} /> В каталог
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow lime">ИЗ ИДЕИ — В РЕАЛЬНЫЙ ПРОЕКТ</span>
          <h1 ref={heading} tabIndex={-1}>
            {step === 0
              ? "Большие решения начинаются с вопроса."
              : step === 1
                ? "Немного деталей. Намного больше ясности."
                : "Ваша задача готова к знакомству."}
          </h1>
          <p>
            Хороший бриф помогает найти команду, которая понимает вашу задачу.
          </p>
        </div>
      </div>
      <div className="builder-steps">
        {["Опишите задачу", "Добавьте ясности", "Проверьте и опубликуйте"].map(
          (label, index) => (
            <div
              key={label}
              className={index === step ? "active" : index < step ? "done" : ""}
            >
              <span>
                {index < step ? <Check size={14} /> : `0${index + 1}`}
              </span>
              {label}
              {index < 2 && <i />}
            </div>
          ),
        )}
      </div>
      <div className="builder-grid">
        <fieldset
          className="builder-main panel integration-fieldset"
          disabled={busy}
        >
          {review && (
            <section className="conflict-review" aria-label="Сравнение версий">
              <h2>Проверьте объединённую карточку</h2>
              <p>
                Загружена версия {review.remote.serverVersion}. Ваши независимые
                правки сохранены в форме. Ничего ещё не отправлено на сервер.
              </p>
              {review.fields.length === 0 && (
                <p>
                  Пересечений нет. Проверьте поля и сохраните карточку заново.
                </p>
              )}
              {review.fields.map((key) => (
                <fieldset key={key}>
                  <legend>
                    {editableLabel(key)} · изменено в обеих версиях
                  </legend>
                  {(["local", "remote"] as const).map((choice) => (
                    <label key={choice}>
                      <input
                        type="radio"
                        name={`resolve-${key}`}
                        checked={review.choices[key] === choice}
                        onChange={() => {
                          setTask((previous) => ({
                            ...previous,
                            [key]: review[choice][key],
                            confirmed: [],
                          }));
                          setReview({
                            ...review,
                            choices: { ...review.choices, [key]: choice },
                          });
                          setApproved(false);
                        }}
                      />
                      <span>
                        <b>
                          {choice === "local"
                            ? "Мой текст"
                            : "Текст на сервере"}
                        </b>
                        <pre>{review[choice][key] || "(пусто)"}</pre>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
              {unresolved && (
                <p role="status">
                  Выберите текст для каждого пересекающегося поля перед
                  сохранением.
                </p>
              )}
            </section>
          )}
          {step === 0 && (
            <>
              <div className="form-intro">
                <div className="square-icon">
                  <FileText size={22} />
                </div>
                <h2>Что вы хотите изменить?</h2>
                <p>
                  Расскажите о проблеме своими словами. Не нужно сразу писать
                  идеальное техническое задание.
                </p>
              </div>
              <label className="field-label" htmlFor="brief">
                Ваша задача <span>*</span>
              </label>
              <textarea
                id="brief"
                className="brief-input"
                maxLength={5000}
                value={task.brief}
                onChange={(event) => {
                  setTask({ ...task, brief: event.target.value });
                  setError("");
                }}
                placeholder="Например: пользователи уходят из нашего приложения. Хотим понять почему и улучшить удержание…"
              />
              <div className="input-meta">
                <span>Начните с проблемы, а не с готового решения</span>
                <span>{task.brief.length}/5000</span>
              </div>
              <div className="form-row">
                <label>
                  <span className="field-label">Тема</span>
                  <select
                    value={task.topic}
                    onChange={(event) =>
                      setTask({
                        ...task,
                        topic: event.target.value as BusinessTask["topic"],
                      })
                    }
                  >
                    {topics.map((topic) => (
                      <option key={topic}>{topic}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Компания</span>
                  <input
                    value={task.company}
                    maxLength={80}
                    onChange={(event) =>
                      setTask({ ...task, company: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="example-box">
                <Sparkles size={17} />
                <div>
                  <b>Попробуйте на готовом примере</b>
                  <p>Учебное приложение теряет пользователей.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setTask({
                      ...task,
                      brief: drafts[0].text,
                      company: "Qadam Demo",
                      topic: "Продукт",
                    });
                    setExampleLoaded(true);
                  }}
                >
                  Подставить <Plus size={14} />
                </button>
              </div>
              <div className="ai-note">
                <span className="status-dot" /> AI задаст вопросы по вашему
                описанию. Демо-режим будет отмечен отдельно.
              </div>
              <button
                className="btn btn-primary full"
                onClick={analyze}
                disabled={busy || task.brief.trim().length < 20}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <WandSparkles size={17} />
                )}
                {busy ? "Ищем недостающие детали…" : "Улучшить задачу с AI"}
                <ArrowRight size={17} />
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <div className="section-caption">
                <span className="badge badge-lime">
                  <Sparkles size={12} />
                  {analysis?.source === "api" ? "AI-АНАЛИЗ" : "ДЕМО AI"}
                </span>
                <span className="muted text-small">
                  Вопросов по вашему брифу: {analysis?.questions.length}
                </span>
              </div>
              <blockquote className="brief-quote">{task.brief}</blockquote>
              {analysis?.ai.mode === "fallback" && (
                <p className="ai-fallback-note" role="status">
                  {aiFallbackMessage(analysis.ai.reason)}
                </p>
              )}
              {analysis?.ai.mode === "live" && (
                <p className="muted text-small">
                  Получен ответ модели {analysis.ai.model}.
                </p>
              )}
              <div className="question-intro">
                <h2>Помогите команде увидеть полную картину</h2>
                <p>
                  Заполните то, что уже знаете. Неизвестные сведения можно
                  оставить пустыми и уточнить позже.
                </p>
              </div>
              {exampleLoaded && (
                <button
                  className="btn btn-ghost example-fill"
                  onClick={() => {
                    setTask({
                      ...task,
                      ...retentionAnswers,
                      title: "Помогите пользователям остаться",
                      confirmed: [],
                    });
                    setApproved(false);
                  }}
                >
                  {" "}
                  <Sparkles size={15} /> Заполнить ответами из демо-примера
                </button>
              )}
              <div className="question-list">
                {analysis?.questions.map((question, index) => (
                  <label key={question.field}>
                    <span className="question-label">
                      <span className="question-index mono">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{question.question}</span>
                      <b>
                        +
                        {
                          fields.find((field) => field.key === question.field)!
                            .weight
                        }
                      </b>
                    </span>
                    <textarea
                      rows={2}
                      maxLength={question.field === "contact" ? 500 : 3000}
                      value={task[question.field]}
                      onChange={(event) =>
                        change(question.field, event.target.value)
                      }
                      placeholder="Ваш ответ. Только известные вам факты."
                    />
                  </label>
                ))}
              </div>
              <div className="form-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setStep(0);
                    setError("");
                  }}
                >
                  <ArrowLeft size={15} />
                  Назад
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setStep(2);
                    setError("");
                  }}
                >
                  Собрать карточку <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="section-caption">
                <span className="badge badge-lime">
                  <FileText size={12} /> РЕДАКТИРУЕМАЯ КАРТОЧКА
                </span>
                <span className="muted text-small">
                  Последнее слово — за вами
                </span>
              </div>
              <label>
                <span className="field-label">
                  Название задачи <span>*</span>
                </span>
                <input
                  value={task.title}
                  maxLength={100}
                  onChange={(event) => {
                    setTask({ ...task, title: event.target.value });
                    setApproved(false);
                  }}
                  placeholder="Коротко: какой результат вы хотите получить?"
                />
              </label>
              <div className="form-row">
                <label>
                  <span className="field-label">
                    Компания <span>*</span>
                  </span>
                  <input
                    value={task.company}
                    maxLength={80}
                    onChange={(event) => {
                      setTask({ ...task, company: event.target.value });
                      setApproved(false);
                    }}
                  />
                </label>
                <label>
                  <span className="field-label">Тема</span>
                  <select
                    value={task.topic}
                    onChange={(event) => {
                      setTask({
                        ...task,
                        topic: event.target.value as BusinessTask["topic"],
                      });
                      setApproved(false);
                    }}
                  >
                    {topics.map((topic) => (
                      <option key={topic}>{topic}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="edit-fields">
                {fields.map((field) => (
                  <label key={field.key}>
                    <span className="field-label">
                      {field.label}
                      <b>+{field.weight} баллов</b>
                    </span>
                    <textarea
                      rows={2}
                      maxLength={field.key === "contact" ? 500 : 3000}
                      value={task[field.key]}
                      onChange={(event) =>
                        change(field.key, event.target.value)
                      }
                      placeholder={field.help}
                    />
                  </label>
                ))}
              </div>
              <label className="confirm-box">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => {
                    setApproved(event.target.checked);
                    setError("");
                  }}
                />
                <span>
                  <strong>
                    Я проверил(а) и подтверждаю заполненные сведения
                  </strong>
                  <small>
                    Пустые поля не приносят баллов. Задача будет доступна всем
                    командам при любом рейтинге.
                  </small>
                </span>
              </label>
              <div className="form-actions">
                <button
                  className="btn btn-ghost"
                  onClick={saveDraft}
                  disabled={unresolved || conflict}
                >
                  {busy ? "Сохраняем…" : "Сохранить черновик"}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={publish}
                  disabled={
                    busy ||
                    unresolved ||
                    conflict ||
                    !approved ||
                    !task.title.trim() ||
                    !task.company.trim()
                  }
                >
                  <CheckCircle2 size={17} />
                  {existing?.published
                    ? "Подтвердить изменения"
                    : "Опубликовать задачу"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {error && (
            <div className="error-box" role="alert">
              <p>{error}</p>
              {conflict && (
                <button className="btn btn-ghost" onClick={recover}>
                  Загрузить новую версию и сравнить
                </button>
              )}
              {step === 0 && (
                <div>
                  <button className="text-button" onClick={analyze}>
                    <RotateCcw size={14} /> Повторить
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setAnalysis(demoAnalysis(task));
                      onAiStatus("fallback");
                      setError("");
                      setStep(1);
                    }}
                  >
                    Продолжить с демо-вопросами
                  </button>
                </div>
              )}
            </div>
          )}
        </fieldset>
        <aside className="builder-aside">
          <RatingPanel task={task} preview />
          <div className="builder-explainer">
            <span className="eyebrow">ЯСНОСТЬ ДАЁТ ПРЕИМУЩЕСТВО</span>
            <h3>
              Хорошая задача
              <br />
              заметнее в каталоге.
            </h3>
            <p>
              Рейтинг зависит от полноты подтверждённого брифа, а не от
              известности компании.
            </p>
            <div>
              <Check size={15} /> Открыта для всех команд
            </div>
            <div>
              <Check size={15} /> Решение о выборе принимаете вы
            </div>
            <div>
              <Check size={15} /> Можно дополнить после публикации
            </div>
          </div>
          {step === 2 && (
            <p className="rating-preview-note" aria-live="polite">
              {approved
                ? `Готово к публикации: ${scoreTask(confirmFields(task)).total}/100`
                : "Предварительный рейтинг ещё не опубликован."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
