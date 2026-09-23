"use client";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ExternalLink,
  MessageSquare,
  Plus,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  safePrototype,
  readiness,
  type BusinessTask,
  type Proposal,
  type Team,
} from "@/lib/domain";
import { EmptyState } from "./ui";

export function BusinessWorkspace({
  teams,
  busy,
  tasks,
  proposals,
  selectedTaskId,
  onSelectTask,
  onEdit,
  onNew,
  onDecision,
  onMilestone,
}: {
  teams: Team[];
  busy: boolean;
  tasks: BusinessTask[];
  proposals: Proposal[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onEdit: (task: BusinessTask) => void;
  onNew: () => void;
  onDecision: (id: string, status: "selected" | "rejected") => void;
  onMilestone: (id: string) => void;
}) {
  const owned = tasks.filter((task) => task.owner === "demo-business");
  const task = owned.find((item) => item.id === selectedTaskId) ?? owned[0];
  const responses = task
    ? proposals.filter((proposal) => proposal.taskId === task.id)
    : [];
  return (
    <div className="enter">
      <div className="page-heading heading-with-action">
        <div>
          <span className="eyebrow lime">КАБИНЕТ БИЗНЕСА</span>
          <h1>Найдите своих людей.</h1>
          <p>
            Сравнивайте подходы. Выбирайте команду. Подтверждайте реальный
            прогресс.
          </p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Plus size={16} /> Новая задача
        </button>
      </div>
      {!task ? (
        <EmptyState
          title="Всё начинается с вашей задачи"
          text="Опишите проблему, улучшите бриф и опубликуйте его для всех команд."
          action={
            <button className="btn btn-primary" onClick={onNew}>
              Создать задачу <ArrowRight size={16} />
            </button>
          }
        />
      ) : (
        <div className="business-grid">
          <aside className="business-task-list">
            <span className="eyebrow muted">МОИ ЗАДАЧИ · {owned.length}</span>
            {owned.map((item) => (
              <button
                key={item.id}
                className={`business-task panel ${item.id === task.id ? "selected" : ""}`}
                onClick={() => onSelectTask(item.id)}
              >
                <div>
                  <span className="text-small muted">{item.company}</span>
                  {item.published ? (
                    <span className="badge">
                      В каталоге: {item.publishedScore}/100 ·{" "}
                      {readiness(item.publishedScore ?? 0)}
                    </span>
                  ) : (
                    <span className="badge">Не опубликована</span>
                  )}
                </div>
                <h3>{item.title || "Новая задача"}</h3>
                {item.hasUnpublishedChanges && (
                  <p className="unpublished-note">
                    Есть неопубликованные изменения
                  </p>
                )}
                <span>
                  <MessageSquare size={13} />{" "}
                  {
                    proposals.filter((proposal) => proposal.taskId === item.id)
                      .length
                  }{" "}
                  — отклики
                </span>
              </button>
            ))}
          </aside>
          <section className="response-list">
            <div className="response-heading">
              <div>
                <h2>{task.title || "Новая задача"}</h2>
                <p>
                  Предложений: {responses.length} ·{" "}
                  {
                    responses.filter(
                      (response) => response.status === "selected",
                    ).length
                  }{" "}
                  выбрано
                </p>
              </div>
              <button className="btn btn-ghost" onClick={() => onEdit(task)}>
                Редактировать бриф
              </button>
            </div>
            <div className="manual-note">
              <Users size={17} />
              <p>
                Выбор за вами: одна, несколько или ни одной команды. AI не
                назначает исполнителей.
              </p>
            </div>
            {responses.length === 0 ? (
              <EmptyState
                title="Место для хороших идей"
                text={
                  task.published
                    ? "Задача уже в каталоге. Переключитесь в роль команды и отправьте первое предложение."
                    : "Опубликуйте задачу, чтобы команды могли откликнуться."
                }
              />
            ) : (
              responses.map((response) => (
                <ProposalCard
                  key={response.id}
                  proposal={response}
                  teams={teams}
                  busy={busy}
                  onDecision={(status) => onDecision(response.id, status)}
                  onMilestone={() => onMilestone(response.id)}
                />
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  teams,
  busy,
  proposal,
  onDecision,
  onMilestone,
}: {
  teams: Team[];
  busy: boolean;
  proposal: Proposal;
  onDecision: (status: "selected" | "rejected") => void;
  onMilestone: () => void;
}) {
  const team = teams.find((team) => team.id === proposal.teamId);
  const [confirming, setConfirming] = useState(false);
  return (
    <article
      className={`panel proposal-card ${proposal.status === "selected" ? "proposal-selected" : ""}`}
    >
      <div className="proposal-card-head">
        <span className="team-avatar">{team?.initials ?? "Tm"}</span>
        <div>
          <h3>{team?.name ?? "Команда"}</h3>
          <p>{proposal.duration}</p>
        </div>
        <span
          className={`badge ${proposal.status === "selected" ? "badge-lime" : ""}`}
        >
          {proposal.status === "selected"
            ? "Выбрана бизнесом"
            : proposal.status === "rejected"
              ? "Отклонена"
              : "На рассмотрении"}
        </span>
      </div>
      <div className="task-tags">
        {team?.technologies.map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
      <h4>Идея решения</h4>
      <p>{proposal.idea}</p>
      <h4>План работы</h4>
      <p className="preserve-lines">{proposal.plan}</p>
      {safePrototype(proposal.prototype) && (
        <a
          className="prototype-link"
          href={proposal.prototype}
          target="_blank"
          rel="noreferrer"
        >
          Открыть прототип <ExternalLink size={13} />
          {proposal.prototype === "https://example.com" && (
            <small>демо-ссылка</small>
          )}
        </a>
      )}
      <fieldset
        className="proposal-actions integration-fieldset"
        disabled={busy}
      >
        {proposal.milestoneConfirmed ? (
          <div className="milestone-done">
            <CheckCheck size={18} />
            <span>
              Этап подтверждён бизнесом · <b>+100 XP команде</b>
            </span>
          </div>
        ) : (
          <>
            {proposal.status !== "selected" && (
              <button
                className="btn btn-primary"
                onClick={() => onDecision("selected")}
              >
                <Check size={15} /> Выбрать команду
              </button>
            )}
            {proposal.status !== "rejected" && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  onDecision("rejected");
                  setConfirming(false);
                }}
              >
                <X size={15} />
                {proposal.status === "selected"
                  ? "Отменить выбор"
                  : "Отклонить"}
              </button>
            )}
            {proposal.status === "selected" && (
              <button
                className="btn btn-primary"
                onClick={() => setConfirming(true)}
              >
                <CheckCheck size={16} /> Подтвердить этап
              </button>
            )}
          </>
        )}
      </fieldset>
      {confirming && !proposal.milestoneConfirmed && (
        <div className="milestone-confirm">
          <h4>Результат этапа проверен?</h4>
          <p>
            Подтвердите, что команда представила прототип и вы приняли
            результат. Баллы начисляются за выполненную работу, а не за отклик.
          </p>
          <div>
            <button
              className="btn btn-primary"
              onClick={() => {
                onMilestone();
                setConfirming(false);
              }}
            >
              Да, результат принят · +100 XP
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setConfirming(false)}
            >
              Пока нет
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function TeamWorkspace({
  team,
  teams,
  tasks,
  proposals,
  onTask,
  onCatalog,
}: {
  team?: Team;
  teams: Team[];
  tasks: BusinessTask[];
  proposals: Proposal[];
  onTask: (id: string) => void;
  onCatalog: () => void;
}) {
  const own = proposals.filter((proposal) => proposal.teamId === team?.id);
  if (!team)
    return (
      <EmptyState
        title="Команды пока не созданы"
        text="Для демонстрации запустите backend с SEED_DEMO=true."
      />
    );
  return (
    <div className="enter">
      <div className="page-heading">
        <span className="eyebrow lime">ВАША КОМАНДА</span>
        <h1>Делайте. Показывайте. Растите.</h1>
        <p>Ваш прогресс складывается из реальных результатов.</p>
      </div>
      <div className="team-banner panel">
        <span className="team-avatar large">{team.initials}</span>
        <div>
          <h2>{team.name}</h2>
          <p>{team.interests.join(" / ")}</p>
          <div className="task-tags">
            {team.technologies.map((tech) => (
              <span key={tech}>{tech}</span>
            ))}
          </div>
        </div>
        <div className="team-xp">
          <span>
            <Zap size={17} /> ПРОГРЕСС КОМАНДЫ
          </span>
          <strong className="mono">
            {team.xp ?? 0} <small>XP</small>
          </strong>
          <p>За подтверждённые этапы</p>
        </div>
      </div>
      <div className="section-title">
        <h2>Ваши предложения</h2>
        <span className="count-badge">{own.length}</span>
      </div>
      {own.length === 0 ? (
        <EmptyState
          title="Первый проект — ближе, чем кажется"
          text="Выберите задачу по интересам и предложите свой подход. Все задачи открыты для всех команд."
          action={
            <button className="btn btn-primary" onClick={onCatalog}>
              Найти задачу <ArrowRight size={15} />
            </button>
          }
        />
      ) : (
        <div className="team-proposals">
          {own.map((proposal) => {
            const task = tasks.find((task) => task.id === proposal.taskId);
            return (
              <article className="panel team-proposal" key={proposal.id}>
                <div className="section-caption">
                  <span className="eyebrow muted">{task?.company}</span>
                  <span
                    className={`badge ${proposal.status === "selected" ? "badge-lime" : ""}`}
                  >
                    {proposal.status === "selected"
                      ? "Команда выбрана"
                      : proposal.status === "rejected"
                        ? "Отклик отклонён"
                        : "На рассмотрении"}
                  </span>
                </div>
                <h3>{task?.title ?? "Задача"}</h3>
                <p>{proposal.idea}</p>
                <div className="team-proposal-bottom">
                  <span>
                    {proposal.milestoneConfirmed ? (
                      <>
                        <CheckCircleMark /> Этап принят · +100 XP
                      </>
                    ) : proposal.status === "selected" ? (
                      "Следующий шаг: согласовать работу с бизнесом"
                    ) : (
                      "Решение принимает бизнес"
                    )}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => onTask(proposal.taskId)}
                  >
                    К задаче <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="team-directory">
        <div className="section-title">
          <h2>Команды сообщества</h2>
          <span className="muted text-small">
            Синтетические профили для демо
          </span>
        </div>
        <div className="team-directory-grid">
          {teams.map((item) => (
            <div className="panel directory-card" key={item.id}>
              <span className="team-avatar">{item.initials}</span>
              <h3>{item.name}</h3>
              <p>{item.interests.join(" / ")}</p>
              <div className="task-tags">
                {item.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
              <small>{item.technologies.join(" · ")}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function CheckCircleMark() {
  return <CheckCheck size={15} />;
}
