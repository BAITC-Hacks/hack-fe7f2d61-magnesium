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
  apiConfigured,
  demoAnalysis,
  type Analysis,
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

interface Props {
  existing?: BusinessTask;
  onPublish: (task: BusinessTask) => Promise<void>;
  onSave: (task: BusinessTask) => Promise<void>;
  onClose: () => void;
}
export function TaskBuilder({ existing, onPublish, onSave, onClose }: Props) {
  const [task, setTask] = useState<BusinessTask>(() =>
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
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [exampleLoaded, setExampleLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const change = (key: FieldKey, value: string) => {
    setTask((prev) => editField(prev, key, value));
    setApproved(false);
  };
  async function analyze() {
    if (task.brief.trim().length < 20) {
      setError(
        "Опишите задачу хотя бы в одном предложении — минимум 20 символов.",
      );
      return;
    }
    setBusy(true);
    setError("");
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const result = await analyzeBrief(task, controller.current.signal);
      setAnalysis(result);
      setStep(1);
    } catch (err) {
      if (!controller.current.signal.aborted)
        setError(
          err instanceof Error
            ? err.message
            : "Не удалось проанализировать задачу.",
        );
    } finally {
      setBusy(false);
    }
  }
  const previewTask = approved ? confirmFields(task) : task;
  const publish = async () => {
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
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось опубликовать задачу.",
      );
    } finally {
      setBusy(false);
    }
  };

  async function saveDraft() {
    setBusy(true);
    setError("");
    try {
      await onSave(task);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить черновик.",
      );
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
                <span className="status-dot" />{" "}
                {apiConfigured
                  ? "AI задаст вопросы по вашему описанию"
                  : "Демо AI · вопросы по шаблону и содержанию брифа"}
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
                <button className="btn btn-ghost" onClick={saveDraft}>
                  {busy ? "Сохраняем…" : "Сохранить черновик"}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={publish}
                  disabled={
                    busy ||
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
              {step === 0 && apiConfigured && (
                <div>
                  <button className="text-button" onClick={analyze}>
                    <RotateCcw size={14} /> Повторить
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setAnalysis(demoAnalysis(task));
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
          <RatingPanel task={previewTask} preview />
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
                ? `После подтверждения: ${scoreTask(previewTask).total}/100`
                : "Подтвердите сведения, чтобы пересчитать рейтинг."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
