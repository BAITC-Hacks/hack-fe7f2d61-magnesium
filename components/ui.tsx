import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Circle,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  confirmFields,
  fields,
  scoreTask,
  type BusinessTask,
} from "@/lib/domain";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "brand-small" : ""}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 28 30" aria-hidden="true">
          <path d="M15 1 2 18h10l-1 11L26 11H15l1-10Z" fill="currentColor" />
        </svg>
      </span>
      <span>
        skill<span className="brand-light">arena</span>
        <sup>AI</sup>
      </span>
    </div>
  );
}
export function ReadinessBadge({ task }: { task: BusinessTask }) {
  const { total, level } = scoreTask(task);
  return (
    <span
      className={`badge ${total >= 70 ? "badge-lime" : total >= 40 ? "badge-gold" : "badge-muted"}`}
    >
      {total >= 90 ? <Sparkles size={11} /> : <span className="status-dot" />}
      {level}
    </span>
  );
}
export function TaskArt({
  topic,
  large = false,
}: {
  topic: string;
  large?: boolean;
}) {
  const kind =
    topic === "Аналитика"
      ? "data"
      : topic === "Разработка"
        ? "route"
        : topic === "Дизайн"
          ? "design"
          : topic === "Маркетинг"
            ? "eco"
            : "product";
  return (
    <div
      className={`task-art art-${kind} ${large ? "art-large" : ""}`}
      aria-hidden="true"
    >
      <div className="art-grid" />
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-core">
        {kind === "data" ? (
          <div className="art-bars">
            {[38, 64, 48, 86, 72].map((height, i) => (
              <i key={i} style={{ height: `${height}%` }} />
            ))}
          </div>
        ) : kind === "route" ? (
          <svg viewBox="0 0 170 100">
            <path
              d="M12 80h42V30h56v43h46"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="6 5"
            />
            <circle cx="12" cy="80" r="8" fill="currentColor" />
            <circle cx="156" cy="73" r="10" fill="currentColor" />
          </svg>
        ) : kind === "design" ? (
          <div className="art-shapes">
            <i />
            <i />
            <i />
          </div>
        ) : kind === "eco" ? (
          <div className="art-leaf">
            <i />
            <i />
          </div>
        ) : (
          <div className="art-target">
            <i />
            <i />
            <span>↗</span>
          </div>
        )}
      </div>
      <span className="art-coordinate">
        {kind === "product"
          ? "BUILD WHAT MATTERS"
          : kind === "data"
            ? "FIND THE SIGNAL"
            : kind === "route"
              ? "CREATE A BETTER WAY"
              : kind === "design"
                ? "DESIGN FOR EVERYONE"
                : "MAKE AN IMPACT"}
      </span>
      <span className="art-cross">+</span>
    </div>
  );
}
export function RatingPanel({
  task,
  preview = false,
}: {
  task: BusinessTask;
  preview?: boolean;
}) {
  const ratedTask = preview ? confirmFields(task) : task;
  const { total, breakdown, missing } = scoreTask(ratedTask);
  const groups = [...new Set(fields.map((field) => field.group))];
  return (
    <section className="panel rating-panel">
      <div className="section-caption">
        <span className="eyebrow">
          {preview ? "После подтверждения" : "Готовность задачи"}
        </span>
        <Zap size={16} className="lime" />
      </div>
      <div className="rating-number mono" aria-live="polite" aria-atomic="true">
        {total}
        <span>/100</span>
      </div>
      <ReadinessBadge task={ratedTask} />
      {preview && (
        <div className="rating-snapshots">
          <span>
            Подтверждено в черновике <b>{scoreTask(task).total}/100</b>
          </span>
          <span>
            В каталоге{" "}
            <b>
              {task.publishedScore === undefined
                ? "Не опубликована"
                : `${task.publishedScore}/100`}
            </b>
          </span>
          {task.hasUnpublishedChanges && (
            <small>Есть неопубликованные изменения</small>
          )}
        </div>
      )}
      <p className="rating-description">
        {preview
          ? "Предварительный расчёт. Каталог изменится только после вашего подтверждения и публикации."
          : "Чем понятнее задача, тем проще команде начать работу."}
      </p>
      <div className="rating-track">
        <span style={{ width: `${total}%` }} />
      </div>
      <div className="rating-marks">
        <span>Черновик</span>
        <span>Приоритет</span>
      </div>
      <div className="rubric">
        {groups.map((group) => {
          const items = breakdown.filter((field) => field.group === group);
          const earned = items.reduce((n, item) => n + item.earned, 0);
          const max = items.reduce((n, item) => n + item.weight, 0);
          return (
            <div key={group}>
              <span>
                {earned === max ? (
                  <CheckCircle2 size={14} className="lime" />
                ) : (
                  <Circle size={14} />
                )}{" "}
                {group}
              </span>
              <b className={earned === max ? "lime" : "muted"}>
                {earned}
                <small>/{max}</small>
              </b>
            </div>
          );
        })}
      </div>
      <div className="rating-tip">
        {missing.length ? (
          <>
            <Sparkles size={16} className="lime" />
            <p>
              Следующий шаг: <strong>{missing[0].label.toLowerCase()}</strong>
              <br />
              <span>
                Заполните поле и подтвердите карточку: +{missing[0].weight}{" "}
                баллов.
              </span>
            </p>
          </>
        ) : (
          <>
            <Check size={18} className="lime" />
            <p>
              <strong>Всё готово к старту</strong>
              <br />
              <span>
                {preview
                  ? "Все поля заполнены. Осталось подтвердить и опубликовать."
                  : "Все сведения заполнены и подтверждены."}
              </span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state panel">
      <div className="empty-icon">
        <ArrowUpRight size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
