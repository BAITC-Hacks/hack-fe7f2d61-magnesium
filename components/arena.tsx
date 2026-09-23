"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Compass,
  FilePlus2,
  Globe2,
  Layers3,
  LayoutGrid,
  Menu,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  catalog,
  scoreTask,
  topics,
  type BusinessTask,
  type Proposal,
  type Team,
} from "@/lib/domain";
import { createWorkspaceApi, type ServerWorkspace } from "@/lib/workspace-api";
import { Brand, EmptyState, ReadinessBadge, TaskArt } from "./ui";
import { TaskBuilder } from "./task-builder";
import { TaskDetail } from "./task-detail";
import { BusinessWorkspace, TeamWorkspace } from "./proposals";
import { DiscardDialog } from "./discard-dialog";
import type { AiStatus } from "@/lib/brief-api";

type View = "catalog" | "builder" | "detail" | "business" | "team";
const emptyWorkspace: ServerWorkspace = {
  catalog: [],
  drafts: [],
  teams: [],
  proposals: [],
  teamProposals: [],
  aiConfigured: false,
};

export default function Arena() {
  const [workspace, setWorkspace] = useState<ServerWorkspace>(emptyWorkspace);
  const [api] = useState(() => createWorkspaceApi());
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  const refreshSequence = useRef(0);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("catalog");
  const [role, setRole] = useState<"business" | "student">("student");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BusinessTask | undefined>();
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamLoading, setTeamLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    view: View;
    role?: "business" | "student";
  } | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  useEffect(() => {
    try {
      setSelectedTeamId(sessionStorage.getItem("skillarena-demo-team") ?? "");
    } catch {
      /* Selection still works without browser storage. */
    }
  }, []);
  function navigate(next: View, nextRole?: "business" | "student") {
    if (view === "builder" && next !== "builder" && dirty) {
      setPendingNavigation({ view: next, role: nextRole });
      return false;
    }
    if (nextRole) setRole(nextRole);
    setView(next);
    return true;
  }

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const data = await api.load(selectedTeamId);
      if (sequence === refreshSequence.current) {
        setWorkspace(data);
        setReady(true);
        setStorageError("");
      }
    } catch (error) {
      if (sequence === refreshSequence.current)
        setStorageError(
          error instanceof Error
            ? error.message
            : "Не удалось загрузить данные сервера.",
        );
    } finally {
      if (sequence === refreshSequence.current) setTeamLoading(false);
    }
  }, [api, selectedTeamId]);
  useEffect(() => {
    void refresh();
    const onFocus = () => {
      if (!acting.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      ++refreshSequence.current;
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  async function mutate(action: () => Promise<void>) {
    if (acting.current)
      throw new Error("Дождитесь завершения предыдущего действия.");
    acting.current = true;
    ++refreshSequence.current;
    setBusy(true);
    try {
      await action();
      await refresh();
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  async function decide(id: string, status: "selected" | "rejected") {
    try {
      await mutate(async () => {
        await api.decide(id, status);
      });
      setToast(
        status === "selected"
          ? "Команда выбрана. XP начисляется после принятия этапа."
          : "Решение по отклику сохранено.",
      );
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить решение.",
      );
    }
  }
  async function confirmProgress(id: string) {
    const proposal = workspace.proposals.find((item) => item.id === id);
    if (!proposal) return;
    try {
      await mutate(async () => {
        await api.confirmProgress(proposal);
      });
      setToast("Результат этапа принят · +100 XP команде");
    } catch (error) {
      setStorageError(
        error instanceof Error ? error.message : "Не удалось подтвердить этап.",
      );
    }
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setMobileMenu(false);
  }, [view, activeId]);
  useEffect(() => {
    if (!mobileMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenu(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenu]);

  const task = workspace.catalog.find((task) => task.id === activeId);
  const team =
    workspace.teams.find((item) => item.id === selectedTeamId) ??
    workspace.teams[0];
  const ownProposals = workspace.teamProposals.filter(
    (proposal) => proposal.teamId === team?.id,
  );
  const visibleProposals = [
    ...new Map(
      [...workspace.proposals, ...ownProposals].map((proposal) => [
        proposal.id,
        proposal,
      ]),
    ).values(),
  ];
  function openTask(id: string) {
    setActiveId(id);
    setView("detail");
  }
  function createTask() {
    if (view === "builder") return;
    setRole("business");
    setEditing(undefined);
    setView("builder");
  }
  function editTask(task: BusinessTask) {
    setEditing(workspace.drafts.find((item) => item.id === task.id) ?? task);
    setView("builder");
  }
  async function saveTask(task: BusinessTask, publish: boolean) {
    let saved: BusinessTask | undefined;
    await mutate(async () => {
      saved = await api.save(task, publish);
      const result = saved;
      setWorkspace((previous) => ({
        ...previous,
        drafts: [
          result,
          ...previous.drafts.filter((item) => item.id !== result.id),
        ],
        catalog: publish
          ? [
              result,
              ...previous.catalog.filter((item) => item.id !== result.id),
            ]
          : previous.catalog,
      }));
    });
    setActiveId(saved!.id);
    setDirty(false);
    setView(publish ? "detail" : "business");
    setToast(
      publish
        ? `Задача опубликована · ${scoreTask(saved!).total}/100 · доступна всем командам`
        : "Черновик сохранён на сервере. Каталог обновится после публикации.",
    );
  }
  const pending = workspace.proposals.filter(
    (proposal) =>
      proposal.status === "pending" &&
      workspace.drafts.some(
        (task) => task.id === proposal.taskId && task.owner === "demo-business",
      ),
  ).length;

  return (
    <fieldset
      className="arena-shell integration-fieldset"
      disabled={busy || teamLoading}
    >
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <button
          className="brand-button"
          onClick={() => {
            navigate("catalog");
            setMobileMenu(false);
          }}
          aria-label="SkillArena — каталог"
        >
          <Brand />
        </button>
        <div className="workspace-label">
          <span className="workspace-icon">H</span>
          <div>
            <strong>HackAlem 2026</strong>
            <span>Открытая арена возможностей</span>
          </div>
        </div>
        <div className="sidebar-section-label">ВАШЕ ПРОСТРАНСТВО</div>
        <nav
          aria-label="Основная навигация"
          onClick={() => setMobileMenu(false)}
        >
          <button
            className={
              view === "catalog" || view === "detail"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => navigate("catalog")}
          >
            <Compass size={19} />
            Каталог задач
            <span className="nav-dot" />
          </button>
          <button
            className={view === "business" ? "nav-item active" : "nav-item"}
            onClick={() => {
              navigate("business", "business");
            }}
          >
            <BriefcaseBusiness size={18} />
            Кабинет бизнеса
            {pending > 0 && <span className="nav-count">{pending}</span>}
          </button>
          <button
            className={view === "team" ? "nav-item active" : "nav-item"}
            onClick={() => {
              navigate("team", "student");
            }}
          >
            <Users size={18} />
            Моя команда
          </button>
          <button
            className={view === "builder" ? "nav-item active" : "nav-item"}
            onClick={createTask}
          >
            <FilePlus2 size={18} />
            Создать задачу
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-manifesto">
          <span className="eyebrow">МЕНЬШЕ ТЕОРИИ.</span>
          <h3>
            Больше
            <br />
            настоящего.
          </h3>
          <p>
            Реальные задачи.
            <br />
            Сильные команды.
            <br />
            Измеримый результат.
          </p>
          <span className="manifesto-arrow">↗</span>
        </div>
        <div className="sidebar-bottom">
          {role === "student" && team && (
            <label className="demo-team-selector">
              <span>Команда для демо</span>
              <select
                value={team.id}
                onChange={(event) => {
                  const id = event.target.value;
                  setTeamLoading(true);
                  setSelectedTeamId(id);
                  try {
                    sessionStorage.setItem("skillarena-demo-team", id);
                  } catch {
                    /* Optional preference only. */
                  }
                }}
              >
                {workspace.teams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="demo-status">
            <span className="status-dot" />
            <span>HackAlem · демо-пространство</span>
          </div>
          <div className="profile">
            <span className="avatar">
              {role === "student" ? team?.initials : "Mg"}
            </span>
            <div>
              <strong>
                {role === "student"
                  ? (team?.name ?? "Команда")
                  : "Demo Business"}
              </strong>
              <span>
                {role === "student"
                  ? "Команда участников"
                  : "Представитель бизнеса"}
              </span>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Закрыть меню"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label={
                mobileMenu ? "Закрыть навигацию" : "Открыть навигацию"
              }
            >
              {mobileMenu ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>
              {view === "catalog"
                ? "Каталог задач"
                : view === "builder"
                  ? "Конструктор задачи"
                  : view === "business"
                    ? "Кабинет бизнеса"
                    : view === "team"
                      ? "Моя команда"
                      : "Карточка задачи"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className={`api-status ai-${aiStatus}`} role="status">
              <span className="status-dot" />
              {aiStatus === "loading"
                ? "AI отвечает…"
                : aiStatus === "live"
                  ? "AI · ответ получен"
                  : aiStatus === "fallback"
                    ? "Демо-вопросы"
                    : aiStatus === "error"
                      ? "Ошибка AI"
                      : workspace.aiConfigured
                        ? "AI · готов к запросу"
                        : "AI · демо-режим"}
            </span>
            <div className="role-switch" aria-label="Роль для демонстрации">
              <button
                className={role === "student" ? "selected" : ""}
                onClick={() => {
                  navigate(
                    view === "business" || view === "builder"
                      ? "catalog"
                      : view,
                    "student",
                  );
                }}
              >
                <Users size={14} />
                Команда
              </button>
              <button
                className={role === "business" ? "selected" : ""}
                onClick={() => setRole("business")}
              >
                <BriefcaseBusiness size={14} />
                Бизнес
              </button>
            </div>
            <span className="avatar small">
              {role === "student" ? team?.initials : "Mg"}
            </span>
          </div>
        </header>
        <main id="main" className="main-content">
          {storageError && (
            <div className="storage-warning" role="status">
              {storageError}
              <button
                onClick={() => void refresh()}
                aria-label="Повторить загрузку"
              >
                Повторить
              </button>
            </div>
          )}
          {!ready ? (
            <div className="loading-workspace">
              <Brand />
              <p>
                {storageError
                  ? "Сервер недоступен. Запустите backend и повторите загрузку."
                  : "Загружаем данные сервера…"}
              </p>
            </div>
          ) : view === "catalog" ? (
            <Catalog
              team={team}
              teamCount={workspace.teams.length}
              tasks={workspace.catalog}
              proposals={workspace.proposals}
              onTask={openTask}
              onCreate={createTask}
              onTeam={() => setView("team")}
            />
          ) : view === "builder" ? (
            <TaskBuilder
              key={editing?.id ?? "new"}
              existing={editing}
              onPublish={(task) => saveTask(task, true)}
              onSave={(task) => saveTask(task, false)}
              onClose={() => navigate("catalog")}
              onDirtyChange={setDirty}
              onAiStatus={setAiStatus}
              onRecover={api.recover}
            />
          ) : view === "detail" && task ? (
            <TaskDetail
              key={task.id}
              task={task}
              role={role}
              team={team}
              proposals={visibleProposals}
              onBack={() => setView("catalog")}
              onEdit={() => editTask(task)}
              onManage={() => setView("business")}
              onProposal={async (proposal) => {
                await mutate(async () => {
                  await api.submit(proposal);
                });
                setToast(
                  "Предложение отправлено. Решение примет представитель бизнеса.",
                );
              }}
            />
          ) : view === "business" ? (
            <BusinessWorkspace
              teams={workspace.teams}
              busy={busy}
              tasks={workspace.drafts}
              proposals={workspace.proposals}
              selectedTaskId={activeId}
              onSelectTask={setActiveId}
              onEdit={editTask}
              onNew={createTask}
              onDecision={decide}
              onMilestone={confirmProgress}
            />
          ) : (
            <TeamWorkspace
              team={team}
              teams={workspace.teams}
              tasks={workspace.catalog}
              proposals={ownProposals}
              onTask={openTask}
              onCatalog={() => setView("catalog")}
            />
          )}
          <footer className="page-footer">
            <span>
              skillarena <span className="muted">/</span> prove what you can do.
            </span>
            <span>Все компании, команды и материалы — демонстрационные.</span>
          </footer>
        </main>
      </div>
      {pendingNavigation && (
        <DiscardDialog
          onKeep={() => setPendingNavigation(null)}
          onDiscard={() => {
            setDirty(false);
            if (pendingNavigation.role) setRole(pendingNavigation.role);
            setView(pendingNavigation.view);
            setPendingNavigation(null);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
      )}
    </fieldset>
  );
}

function Catalog({
  team,
  teamCount,
  tasks,
  proposals,
  onTask,
  onCreate,
  onTeam,
}: {
  team?: Team;
  teamCount: number;
  tasks: BusinessTask[];
  proposals: Proposal[];
  onTask: (id: string) => void;
  onCreate: () => void;
  onTeam: () => void;
}) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("Все темы");
  const [level, setLevel] = useState("Любая готовность");
  const filtered = catalog(tasks, query, topic, level);
  const all = tasks.filter((task) => task.published);
  const xp = team?.xp ?? 0;
  return (
    <div className="enter">
      <section className="catalog-hero">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="status-dot" /> РЕАЛЬНЫЕ ЗАДАЧИ. РЕАЛЬНЫЙ ОПЫТ.
          </div>
          <h1>
            Не просто учитесь.
            <br />
            <span>Оставляйте след.</span>
          </h1>
          <p>
            Находите задачи бизнеса, предлагайте решения
            <br className="desktop-break" /> и превращайте свои навыки в
            настоящий результат.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#catalog">
              <Compass size={16} /> Найти свой проект <ArrowRight size={16} />
            </a>
            <button className="hero-business-link" onClick={onCreate}>
              Я представляю бизнес <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="hero-proof">
            <span className="mini-avatars">
              <i>Mg</i>
              <i>Or</i>
              <i>Nv</i>
            </span>
            <span>
              <strong>{teamCount} команд</strong> уже в демо-арене
              <span className="proof-dot">·</span>Теперь ваш ход
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-art-grid" />
          <div className="hero-orbit orbit-a" />
          <div className="hero-orbit orbit-b" />
          <div className="hero-orbit orbit-c" />
          <div className="hero-symbol">
            <svg viewBox="0 0 160 180">
              <defs>
                <linearGradient id="bolt" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#e4ff9a" />
                  <stop offset=".55" stopColor="#b3e45c" />
                  <stop offset="1" stopColor="#6d9b32" />
                </linearGradient>
              </defs>
              <path
                d="M89 8 21 106h52l-7 66 79-108H88l8-56Z"
                fill="url(#bolt)"
              />
              <path
                d="m21 106 12 12h38l2-12Zm45 66 12-2 79-105-12-1Z"
                fill="#5b7d31"
              />
            </svg>
          </div>
          <span className="hero-float float-one">
            <span className="float-icon">
              <CheckCircle2 size={17} />
            </span>
            <span>
              Идея становится проектом<strong>От брифа к результату</strong>
            </span>
          </span>
          <span className="hero-float float-two">
            <Sparkles size={16} /> Потенциал → Возможность{" "}
            <ArrowUpRight size={14} />
          </span>
          <span className="art-spark spark-one">+</span>
          <span className="art-spark spark-two">+</span>
          <span className="hero-art-label">YOUR NEXT CHAPTER STARTS HERE</span>
        </div>
      </section>
      <div className="catalog-summary">
        <div>
          <span className="summary-icon">
            <Layers3 size={18} />
          </span>
          <strong className="mono">
            {all.length.toString().padStart(2, "0")}
          </strong>
          <span>открытых задач</span>
        </div>
        <div>
          <span className="summary-icon">
            <Users size={18} />
          </span>
          <strong className="mono">{String(teamCount).padStart(2, "0")}</strong>
          <span>команд с идеями</span>
        </div>
        <div>
          <span className="summary-icon">
            <ShieldCheck size={18} />
          </span>
          <strong className="mono">100%</strong>
          <span>выбор за людьми</span>
        </div>
        <span className="summary-note">
          <Globe2 size={14} /> Открытый каталог для каждой команды
        </span>
      </div>
      <div className="catalog-layout">
        <section id="catalog" className="catalog-main">
          <div className="section-title">
            <h2>Найдите то, что зажигает.</h2>
            <span className="count-badge">{all.length}</span>
            <span className="catalog-sort">
              <ArrowDownWideNarrow size={14} /> По рейтингу
            </span>
          </div>
          <p className="section-subtitle">
            Большие возможности начинаются с одной задачи.
          </p>
          <div className="catalog-filters">
            <label className="search-box">
              <Search size={16} />
              <input
                type="search"
                aria-label="Поиск задач"
                placeholder="Название, компания или навык…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="readiness-select">
              <select
                aria-label="Уровень готовности"
                value={level}
                onChange={(event) => setLevel(event.target.value)}
              >
                {[
                  "Любая готовность",
                  "Приоритетная",
                  "Готовая",
                  "Рабочая",
                  "Черновик",
                ].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
          <div className="topic-tabs" aria-label="Темы задач">
            {["Все темы", ...topics].map((item) => (
              <button
                key={item}
                className={topic === item ? "active" : ""}
                onClick={() => setTopic(item)}
                aria-pressed={topic === item}
              >
                {item === "Все темы" && <LayoutGrid size={13} />}
                {item}
              </button>
            ))}
          </div>
          <div className="catalog-result-count" aria-live="polite">
            Найдено задач: {filtered.length} · все команды могут откликаться при
            любом рейтинге
          </div>
          {filtered.length ? (
            <div className="task-grid">
              {filtered.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  count={
                    proposals.filter((proposal) => proposal.taskId === task.id)
                      .length
                  }
                  onClick={() => onTask(task.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Пока ничего не нашлось"
              text="Попробуйте другую тему или уберите фильтры — ваша задача может быть совсем рядом."
              action={
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setQuery("");
                    setTopic("Все темы");
                    setLevel("Любая готовность");
                  }}
                >
                  Сбросить фильтры
                </button>
              }
            />
          )}
        </section>
        <aside className="catalog-aside">
          <section className="panel team-progress">
            <div className="section-caption">
              <span className="eyebrow">ВАШ СЛЕД</span>
              <Zap size={16} className="lime" />
            </div>
            <span className="team-avatar">{team?.initials}</span>
            <h3>{team?.name ?? "Ваша команда"}</h3>
            <p>
              От первой идеи
              <br />
              до первого результата.
            </p>
            <div className="xp-line">
              <strong className="mono">{xp}</strong>
              <span>XP команды</span>
            </div>
            <div className="rating-track">
              <span style={{ width: `${Math.min(xp / 5, 100)}%` }} />
            </div>
            <span className="xp-hint">+100 XP за каждый принятый этап</span>
            <button className="text-button" onClick={onTeam}>
              Мой прогресс <ArrowRight size={14} />
            </button>
          </section>
          <section className="clarity-card">
            <div className="clarity-symbol">
              <Sparkles size={23} />
            </div>
            <span className="eyebrow">ДЛЯ БИЗНЕСА</span>
            <h3>
              Хорошая задача
              <br />
              притягивает талант.
            </h3>
            <p>
              Опишите проблему. AI поможет задать правильные вопросы и сделать
              бриф понятнее.
            </p>
            <div className="mini-rating">
              <span>Ясность брифа</span>
              <strong>
                20 <ArrowRight size={12} /> 100
              </strong>
            </div>
            <button onClick={onCreate}>
              Создать задачу <ArrowUpRight size={16} />
            </button>
          </section>
          <section className="how-it-works">
            <span className="eyebrow muted">КАК ЭТО РАБОТАЕТ</span>
            {[
              ["01", "Найдите свою задачу", "Любая команда. Любой рейтинг."],
              ["02", "Предложите подход", "Идея, план и прототип."],
              ["03", "Сделайте результат", "Бизнес выбирает и принимает этап."],
            ].map(([number, title, text]) => (
              <div key={number}>
                <span className="mono">{number}</span>
                <p>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </p>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  count,
  index,
  onClick,
}: {
  task: BusinessTask;
  count: number;
  index: number;
  onClick: () => void;
}) {
  const score = scoreTask(task).total;
  return (
    <article
      className="task-card panel"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <button
        className="task-card-action"
        onClick={onClick}
        aria-label={`Открыть задачу: ${task.title}`}
      >
        <div className="task-card-art">
          <TaskArt topic={task.topic} />
          <div className="task-art-badge">
            <span className="badge">{task.topic}</span>
            {score >= 90 && (
              <span className="priority-icon">
                <Sparkles size={13} /> ПРИОРИТЕТ
              </span>
            )}
          </div>
        </div>
        <div className="task-card-body">
          <div className="company-label">
            <span
              className={`company-icon company-${task.topic === "Аналитика" ? "blue" : task.topic === "Разработка" ? "orange" : "green"}`}
            >
              {task.company.slice(0, 1)}
            </span>
            {task.company}
            <span className="verified-company">
              <CheckCircle2 size={12} />
            </span>
          </div>
          <h3>{task.title}</h3>
          <p>{task.need || task.brief}</p>
          <div className="task-tags">
            {task.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="card-rating">
            <span>Готовность задачи</span>
            <strong className="mono">
              {score}
              <small>/100</small>
            </strong>
          </div>
          <div className="rating-track">
            <span style={{ width: `${score}%` }} />
          </div>
          <div className="task-card-footer">
            <ReadinessBadge task={task} />
            <span>
              <MessageSquare size={12} />
              {count}
            </span>
            <ArrowUpRight size={18} />
          </div>
        </div>
      </button>
    </article>
  );
}
