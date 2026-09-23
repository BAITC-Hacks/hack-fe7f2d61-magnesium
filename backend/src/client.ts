// Browser-safe client: all server schema imports are erased by TypeScript.
import type { Analysis, Answer, AiMeta, Card, Milestone, MilestoneInput, Proposal, ProposalInput, PublishedTask, Question, Task, Team } from './contracts.js';
export type { Analysis, Answer, Card, Milestone, Proposal, PublishedTask, Task, Team } from './contracts.js';

export class SkillArenaApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function createSkillArenaClient(baseUrl: string, identity: { businessId?: string; teamId?: string } = {}) {
  const base = baseUrl.replace(/\/$/, '');
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (identity.businessId) headers['X-Business-Id'] = identity.businessId;
    if (identity.teamId) headers['X-Team-Id'] = identity.teamId;
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new SkillArenaApiError(response.status, data.error?.code ?? 'HTTP_ERROR', data.error?.message ?? `HTTP ${response.status}`);
    return data as T;
  }
  const id = encodeURIComponent;
  return {
    health: () => request<{ status: string; aiConfigured: boolean; storage: string; authentication: string }>('/api/health'),
    businesses: () => request<{ items: { id: string; name: string }[] }>('/api/businesses'),
    teams: () => request<{ items: Team[] }>('/api/teams'),
    createTeam: (input: Omit<Team, 'id' | 'xp'>) => request<Team>('/api/teams', 'POST', input),
    catalog: (filters: { topic?: string; industry?: string; readiness?: 'draft' | 'working' | 'ready' | 'priority' } = {}) => {
      const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== undefined));
      return request<{ items: PublishedTask[] }>(`/api/tasks?${query}`);
    },
    publicTask: (taskId: string) => request<PublishedTask>(`/api/tasks/${id(taskId)}`),
    businessTasks: () => request<{ items: Task[] }>('/api/business/tasks'),
    draft: (taskId: string) => request<Task>(`/api/business/tasks/${id(taskId)}`),
    createTask: (input: { description: string; industry: string; topic?: string }) => request<Task>('/api/tasks', 'POST', input),
    editTask: (taskId: string, input: { version: number; card?: Partial<Card>; industry?: string; topic?: string }) => request<Task>(`/api/tasks/${id(taskId)}`, 'PATCH', input),
    clarify: (taskId: string, version: number) => request<Analysis>(`/api/tasks/${id(taskId)}/clarify`, 'POST', { version }),
    generateCard: (taskId: string, version: number, answers: Answer[]) => request<{ task: Task; questions: Question[]; ai: AiMeta }>(`/api/tasks/${id(taskId)}/generate-card`, 'POST', { version, answers }),
    confirm: (taskId: string, version: number) => request<Task>(`/api/tasks/${id(taskId)}/confirm`, 'POST', { version }),
    publish: (taskId: string, version: number) => request<PublishedTask>(`/api/tasks/${id(taskId)}/publish`, 'POST', { version }),
    proposals: (taskId: string) => request<{ items: Proposal[] }>(`/api/tasks/${id(taskId)}/proposals`),
    myProposals: () => request<{ items: Proposal[] }>('/api/team/proposals'),
    submitProposal: (taskId: string, input: ProposalInput) => request<Proposal>(`/api/tasks/${id(taskId)}/proposals`, 'POST', input),
    decide: (proposalId: string, decision: 'selected' | 'rejected') => request<Proposal>(`/api/proposals/${id(proposalId)}/decision`, 'PATCH', { decision }),
    confirmProgress: (proposalId: string, input: MilestoneInput) => request<Milestone>(`/api/proposals/${id(proposalId)}/progress`, 'POST', input),
  };
}
