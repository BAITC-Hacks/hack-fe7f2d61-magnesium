"use client";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { DiscardDialog } from "./discard-dialog";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe2,
  Pencil,
  Send,
  Users,
  X,
} from "lucide-react";
import {
  fields,
  scoreTask,
  validateProposal,
  type BusinessTask,
  type Proposal,
  type Team,
} from "@/lib/domain";
import { RatingPanel, ReadinessBadge, TaskArt } from "./ui";

export function TaskDetail({
  task,
  team,
  role,
  proposals,
  onBack,
  onEdit,
  onProposal,
  onManage,
}: {
  task: BusinessTask;
  team?: Team;
  role: "business" | "student";
  proposals: Proposal[];
  onBack: () => void;
  onEdit: () => void;
  onProposal: (proposal: Proposal) => Promise<void>;
  onManage: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const count = proposals.filter(
    (proposal) => proposal.taskId === task.id,
  ).length;
  const ownProposals = proposals.filter(
    (proposal) => proposal.taskId === task.id && proposal.teamId === team?.id,
  );
  const owner = task.owner === "demo-business" && role === "business";
  return (
    <div className="detail enter">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} /> В каталог
      </button>
      <div className="detail-grid">
        <div>
          <div className="detail-hero panel">
            <TaskArt topic={task.topic} large />
            <div className="detail-hero-content">
              <div className="section-caption">
                <span className="company-label">
                  <span className="company-icon">
                    {task.company.slice(0, 1)}
                  </span>
                  {task.company}
                  <span className="muted">/ {task.topic}</span>
                </span>
                <ReadinessBadge task={task} />
              </div>
              <h1>{task.title}</h1>
              <p>{task.need || task.brief}</p>
              <div className="task-tags">
                {task.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="detail-meta">
                <span>
                  <Users size={15} /> Отклики: {count}
                </span>
                <span>
                  <Globe2 size={15} /> Доступна всем командам
                </span>
              </div>
            </div>
          </div>
          <section className="panel detail-content">
            <div className="section-caption">
              <h2>Всё, что нужно для старта</h2>
              <span className="badge">БРИФ</span>
            </div>
            {fields.map((field) => (
              <section className="detail-field" key={field.key}>
                <h3>
                  {field.label}
                  {task.confirmed.includes(field.key) && task[field.key] && (
                    <CheckCircle2 size={14} className="lime" />
                  )}
                </h3>
                <p className={!task[field.key] ? "missing-field" : ""}>
                  {task[field.key] ||
                    "Пока не уточнено — можно обсудить с бизнесом в предложении."}
                </p>
              </section>
            ))}
          </section>
        </div>
        <aside className="detail-aside">
          <RatingPanel task={task} />
          <section className="panel apply-panel">
            <div className="square-icon">
              <Users size={21} />
            </div>
            <h3>
              {owner
                ? "Ваша задача. Ваше решение."
                : "Ваша команда может больше."}
            </h3>
            <p>
              {owner
                ? "Сравните идеи и планы. Вы можете выбрать одну, несколько или ни одной команды."
                : "Предложите свой подход. Рейтинг задачи не ограничивает право на отклик."}
            </p>
            {owner ? (
              <>
                <button className="btn btn-primary full" onClick={onManage}>
                  Сравнить отклики <ArrowRight size={16} />
                </button>
                <button className="btn btn-ghost full" onClick={onEdit}>
                  <Pencil size={15} /> Дополнить задачу
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-primary full"
                  disabled={!team}
                  onClick={() => setApplying(true)}
                >
                  Предложить решение <ArrowRight size={16} />
                </button>
                {ownProposals.length > 0 && (
                  <p className="application-sent">
                    <CheckCircle2 size={14} /> Ваших откликов:{" "}
                    {ownProposals.length}
                  </p>
                )}
              </>
            )}
            <small>Синтетический пример · HackAlem demo</small>
          </section>
          {scoreTask(task).total < 40 && (
            <div className="low-score-note">
              <FileText size={18} />
              <p>
                В брифе пока мало деталей. Задача остаётся открытой — задайте
                вопросы в своём предложении.
              </p>
            </div>
          )}
        </aside>
      </div>
      {applying && team && (
        <ProposalDialog
          task={task}
          team={team}
          onClose={() => setApplying(false)}
          onSubmit={async (proposal) => {
            await onProposal(proposal);
            setApplying(false);
          }}
        />
      )}
    </div>
  );
}

function ProposalDialog({
  task,
  team,
  onClose,
  onSubmit,
}: {
  task: BusinessTask;
  onClose: () => void;
  team: Team;
  onSubmit: (proposal: Proposal) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [proposalId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState({
    idea: "",
    plan: "",
    duration: "",
    prototype: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = Object.values(draft).some((value) => value.length > 0);
  useUnsavedChanges(dirty);
  function close() {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const message = validateProposal(draft);
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        ...draft,
        id: proposalId,
        taskId: task.id,
        teamId: team.id,
        status: "pending",
        createdAt: new Date().toISOString(),
        milestoneConfirmed: false,
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось отправить предложение.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="proposal-dialog"
      aria-labelledby="proposal-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      {confirmClose && (
        <DiscardDialog
          onKeep={() => setConfirmClose(false)}
          onDiscard={onClose}
        />
      )}
      <div className="dialog-inner">
        <button
          className="dialog-close"
          onClick={close}
          disabled={busy}
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>
        <span className="eyebrow lime">ОТКРЫТЫЙ ВЫБОР КОМАНД</span>
        <h2 id="proposal-title">
          У вас есть идея?
          <br />
          Дайте ей шанс.
        </h2>
        <p className="muted">{task.title}</p>
        <div className="proposal-team">
          <span className="team-avatar">{team.initials}</span>
          <div>
            <strong>{team.name}</strong>
            <span>{team.technologies.join(" / ")}</span>
          </div>
          <span className="badge">ВАША КОМАНДА</span>
        </div>
        <form onSubmit={submit}>
          <fieldset className="integration-fieldset" disabled={busy}>
            <label>
              <span className="field-label">
                Идея решения <span>*</span>
              </span>
              <textarea
                autoFocus
                value={draft.idea}
                maxLength={4000}
                onChange={(event) =>
                  setDraft({ ...draft, idea: event.target.value })
                }
                placeholder="Как вы подойдёте к задаче? Почему это может сработать?"
                required
                minLength={20}
              />
            </label>
            <label>
              <span className="field-label">
                План работы <span>*</span>
              </span>
              <textarea
                value={draft.plan}
                maxLength={4000}
                onChange={(event) =>
                  setDraft({ ...draft, plan: event.target.value })
                }
                placeholder="Основные шаги, результаты этапов и вопросы к бизнесу"
                required
                minLength={20}
              />
            </label>
            <div className="form-row">
              <label>
                <span className="field-label">
                  Срок <span>*</span>
                </span>
                <input
                  value={draft.duration}
                  maxLength={300}
                  onChange={(event) =>
                    setDraft({ ...draft, duration: event.target.value })
                  }
                  placeholder="Например, 2 недели"
                  required
                />
              </label>
              <label>
                <span className="field-label">
                  Ссылка на прототип <span>*</span>
                </span>
                <input
                  type="url"
                  value={draft.prototype}
                  maxLength={2000}
                  onChange={(event) =>
                    setDraft({ ...draft, prototype: event.target.value })
                  }
                  placeholder="https://…"
                  required
                />
              </label>
            </div>
            <button
              type="button"
              className="text-button demo-proposal"
              onClick={() =>
                setDraft({
                  idea: `Изучим задачу «${task.title}», проверим основные гипотезы с пользователями и соберём прототип решения.`,
                  plan: "Дни 1–3: изучение материалов и интервью. Дни 4–9: прототип. Дни 10–14: тестирование и демонстрация результата.",
                  duration: "2 недели",
                  prototype: "https://example.com",
                })
              }
            >
              Заполнить демо-примером <ExternalLink size={12} />
            </button>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <div className="proposal-footer">
              <p>
                Решение принимает представитель бизнеса.
                <br />
                Отправка отклика не назначает вашу команду.
              </p>
              <button className="btn btn-primary" type="submit">
                <Send size={15} /> Отправить предложение
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </dialog>
  );
}
