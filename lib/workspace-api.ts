import {
  createSkillArenaClient,
  SkillArenaApiError,
} from "../backend/src/client.ts";
import type {
  Card,
  CreateTaskInput,
  Task,
  PublishedTask,
  Proposal as ApiProposal,
} from "../backend/src/contracts.ts";
import {
  fields,
  topics,
  type BusinessTask,
  type FieldKey,
  type Proposal,
  type Team,
  type Topic,
} from "./domain.ts";

const businessId = "business-demo";
export const fieldMap = {
  context: "context",
  need: "need",
  data: "data",
  outcome: "expectedResult",
  criteria: "successCriteria",
  constraints: "constraints",
  users: "users",
  contact: "contact",
  interaction: "collaborationFormat",
} as const satisfies Record<FieldKey, keyof Card>;
const topicNames: Record<string, Topic> = {
  Analytics: "Аналитика",
  Web: "Разработка",
  Design: "Дизайн",
  Product: "Продукт",
  Marketing: "Маркетинг",
};

export interface ServerWorkspace {
  catalog: BusinessTask[];
  drafts: BusinessTask[];
  proposals: Proposal[];
  teamProposals: Proposal[];
  teams: Team[];
  aiConfigured: boolean;
}

function toTask(task: Task | PublishedTask): BusinessTask {
  const draft = "description" in task;
  const confirmed = !draft || task.confirmedVersion === task.version;
  const topic = topics.includes(task.topic as Topic)
    ? (task.topic as Topic)
    : (topicNames[task.topic] ?? "Продукт");
  return {
    ...(Object.fromEntries(
      fields.map(({ key }) => [key, task.card[fieldMap[key]]]),
    ) as Record<FieldKey, string>),
    id: task.id,
    title: task.card.title,
    company: task.company || task.industry,
    topic,
    brief: draft ? task.description : task.card.context,
    confirmed: confirmed
      ? fields
          .filter(({ key }) => task.card[fieldMap[key]].trim())
          .map(({ key }) => key)
      : [],
    published: draft ? task.published !== null : true,
    owner: task.businessId === businessId ? "demo-business" : "example",
    createdAt: draft ? task.createdAt : task.publishedAt,
    tags: [topic, task.industry].filter(
      (value, index, items) => items.indexOf(value) === index,
    ),
    serverVersion: task.version,
    publishedScore: draft ? task.published?.rating.score : task.rating.score,
    hasUnpublishedChanges: draft ? task.hasUnpublishedChanges : false,
  };
}
function toCard(task: BusinessTask): Card {
  return {
    title: task.title,
    ...Object.fromEntries(fields.map(({ key }) => [fieldMap[key], task[key]])),
  } as Card;
}
function toProposal(proposal: ApiProposal): Proposal {
  return {
    id: proposal.id,
    taskId: proposal.taskId,
    teamId: proposal.teamId,
    idea: proposal.idea,
    plan: proposal.plan,
    duration: proposal.timeline,
    prototype: proposal.prototypeUrl,
    status: proposal.status,
    createdAt: proposal.createdAt,
    milestoneConfirmed: proposal.milestoneConfirmed,
  };
}

export function createWorkspaceApi(
  base = process.env.NEXT_PUBLIC_API_URL ?? "",
) {
  const business = createSkillArenaClient(base, { businessId });
  // Keep successful intermediate writes on retry, including a newly-created draft.
  // Never fetch a newer revision to overwrite another editor's changes.
  const pending = new Map<string, { inputVersion?: number; draft: Task }>();
  type TaskWrite = {
    version: number;
    card: Card;
    topic: string;
    company: string;
    description: string;
  };
  const uncertain = new Map<
    string,
    { inputVersion?: number; id: string; write: TaskWrite }
  >();
  const creations = new Map<string, CreateTaskInput>();
  return {
    async load(teamId?: string): Promise<ServerWorkspace> {
      const [catalog, drafts, teams, health] = await Promise.all([
        business.catalog(),
        business.businessTasks(),
        business.teams(),
        business.health(),
      ]);
      const responses = await Promise.all(
        drafts.items.map((task) => business.proposals(task.id)),
      );
      const selectedTeamId =
        teams.items.find((team) => team.id === teamId)?.id ??
        teams.items[0]?.id;
      const own = selectedTeamId
        ? await createSkillArenaClient(base, {
            teamId: selectedTeamId,
          }).myProposals()
        : { items: [] };
      return {
        catalog: catalog.items.map(toTask),
        drafts: drafts.items.map(toTask),
        proposals: responses.flatMap((list) => list.items.map(toProposal)),
        teamProposals: own.items.map(toProposal),
        teams: teams.items.map((team) => ({
          ...team,
          initials: team.name
            .split(/\s+/)
            .map((word) => word[0])
            .join("")
            .slice(0, 2),
        })),
        aiConfigured: health.aiConfigured,
      };
    },
    async recover(input: BusinessTask): Promise<BusinessTask> {
      const id =
        pending.get(input.id)?.draft.id ??
        uncertain.get(input.id)?.id ??
        input.id;
      const latest = await business.draft(id);
      pending.delete(input.id);
      uncertain.delete(input.id);
      creations.delete(input.id);
      return toTask(latest);
    },
    async save(input: BusinessTask, publish: boolean): Promise<BusinessTask> {
      let cached = pending.get(input.id);
      if (cached?.inputVersion !== input.serverVersion) cached = undefined;
      if (input.serverVersion === undefined && !creations.has(input.id)) {
        creations.set(input.id, {
          description: input.brief,
          industry: input.topic,
          topic: input.topic,
          company: input.company,
          requestId: input.id,
        });
      }
      let created: Task | undefined;
      if (input.serverVersion === undefined && !cached) {
        try {
          created = await business.createTask(creations.get(input.id)!);
        } catch (error) {
          if (
            error instanceof SkillArenaApiError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 408 &&
            error.status !== 409
          )
            creations.delete(input.id);
          throw error;
        }
      }
      if (created) {
        cached = { inputVersion: input.serverVersion, draft: created };
        pending.set(input.id, cached);
      }
      const previousAttempt = uncertain.get(input.id);
      if (
        previousAttempt &&
        previousAttempt.inputVersion === input.serverVersion
      ) {
        const current = await business.draft(previousAttempt.id);
        const attempted = previousAttempt.write;
        const matches =
          current.version === attempted.version + 1 &&
          current.company === attempted.company.trim() &&
          current.description === attempted.description.trim() &&
          current.topic === attempted.topic.trim() &&
          Object.entries(attempted.card).every(
            ([key, value]) => current.card[key as keyof Card] === value.trim(),
          );
        if (matches || current.version === attempted.version) {
          cached = { inputVersion: input.serverVersion, draft: current };
          pending.set(input.id, cached);
        } else
          throw new SkillArenaApiError(
            409,
            "CONFLICT",
            "Карточка изменилась. Загрузите текущую версию и повторите действие.",
          );
      }
      uncertain.delete(input.id);
      const id = cached?.draft.id ?? input.id;
      const version = cached?.draft.version ?? input.serverVersion!;
      const write = {
        version,
        card: toCard(input),
        topic: input.topic,
        company: input.company,
        description: input.brief,
      };
      let edited: Task;
      try {
        edited = await business.editTask(id, write);
      } catch (error) {
        if (
          error instanceof SkillArenaApiError &&
          (error.status >= 500 || error.status === 408)
        )
          uncertain.set(input.id, {
            inputVersion: input.serverVersion,
            id,
            write,
          });
        throw error;
      }
      pending.set(input.id, {
        inputVersion: input.serverVersion,
        draft: edited,
      });
      if (!publish) {
        pending.delete(input.id);
        creations.delete(input.id);
        return toTask(edited);
      }
      const confirmed = await business.confirm(id, edited.version);
      pending.set(input.id, {
        inputVersion: input.serverVersion,
        draft: confirmed,
      });
      const published = await business.publish(id, confirmed.version);
      pending.delete(input.id);
      creations.delete(input.id);
      return toTask({
        ...confirmed,
        published,
        hasUnpublishedChanges: false,
        status: "published",
      });
    },
    async submit(proposal: Proposal): Promise<Proposal> {
      const student = createSkillArenaClient(base, { teamId: proposal.teamId });
      return toProposal(
        await student.submitProposal(proposal.taskId, {
          requestId: proposal.id,
          idea: proposal.idea,
          plan: proposal.plan,
          timeline: proposal.duration,
          prototypeUrl: proposal.prototype,
        }),
      );
    },
    async decide(id: string, status: "selected" | "rejected") {
      return toProposal(await business.decide(id, status));
    },
    async confirmProgress(proposal: Proposal) {
      return business.confirmProgress(proposal.id, {
        key: "accepted-stage",
        description: "Бизнес проверил и принял результат этапа.",
        evidenceUrl: proposal.prototype,
      });
    },
  };
}
