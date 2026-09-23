// Browser-safe client: all server schema imports are erased by TypeScript.
import type { Analysis, Answer, AiMeta, BriefAnalysis, BriefAnalysisInput, CreateTaskInput, EditTaskInput, Milestone, MilestoneInput, Proposal, ProposalInput, PublishedTask, Question, Task, Team } from './contracts.js';
export type { Analysis, Answer, BriefAnalysis, BriefAnalysisInput, BriefFields, Card, CreateTaskInput, EditTaskInput, Milestone, Proposal, PublishedTask, Task, Team } from './contracts.js';

export class SkillArenaApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };

export function createSkillArenaClient(baseUrl: string, identity: { businessId?: string; teamId?: string } = {}, defaults: RequestOptions = {}) {
  const base = baseUrl.replace(/\/$/, '');
  async function request<T>(path: string, method = 'GET', body?: unknown, requestOptions: RequestOptions = {}): Promise<T> {
    const options = { ...defaults, ...requestOptions };
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 20000);
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (identity.businessId) headers['X-Business-Id'] = identity.businessId;
    if (identity.teamId) headers['X-Team-Id'] = identity.teamId;
    const unavailable = 'Сервер недоступен. Проверьте, что backend запущен, и повторите попытку.';
    try {
      const response = await fetch(`${base}${path}`, { method, headers, signal: controller.signal, body: body === undefined ? undefined : JSON.stringify(body) });
      let data;
      try { data = await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        throw new SkillArenaApiError(response.ok ? 502 : response.status, response.ok ? 'INVALID_RESPONSE' : 'BACKEND_UNAVAILABLE', response.ok ? 'Сервер вернул некорректный ответ. Повторите попытку.' : unavailable);
      }
      if (!response.ok) throw new SkillArenaApiError(response.status, data?.error?.code ?? 'HTTP_ERROR', data?.error?.message ?? `Ошибка сервера (HTTP ${response.status}). Повторите попытку.`);
      return data as T;
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      if (timedOut) throw new SkillArenaApiError(408, 'TIMEOUT', 'Сервер не ответил вовремя. Повторите попытку.');
      if (error instanceof SkillArenaApiError) throw error;
      throw new SkillArenaApiError(503, 'BACKEND_UNAVAILABLE', unavailable);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
    }
  }
  const id = encodeURIComponent;
  return {
    health: (options?: RequestOptions) => request<{ status: string; aiConfigured: boolean; storage: string; authentication: string }>('/api/health', 'GET', undefined, options),
    businesses: (options?: RequestOptions) => request<{ items: { id: string; name: string }[] }>('/api/businesses', 'GET', undefined, options),
    teams: (options?: RequestOptions) => request<{ items: Team[] }>('/api/teams', 'GET', undefined, options),
    createTeam: (input: Omit<Team, 'id' | 'xp'>, options?: RequestOptions) => request<Team>('/api/teams', 'POST', input, options),
    catalog: (filters: { topic?: string; industry?: string; readiness?: 'draft' | 'working' | 'ready' | 'priority' } = {}, options?: RequestOptions) => {
      const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== undefined));
      return request<{ items: PublishedTask[] }>(`/api/tasks?${query}`, 'GET', undefined, options);
    },
    publicTask: (taskId: string, options?: RequestOptions) => request<PublishedTask>(`/api/tasks/${id(taskId)}`, 'GET', undefined, options),
    businessTasks: (options?: RequestOptions) => request<{ items: Task[] }>('/api/business/tasks', 'GET', undefined, options),
    draft: (taskId: string, options?: RequestOptions) => request<Task>(`/api/business/tasks/${id(taskId)}`, 'GET', undefined, options),
    createTask: (input: CreateTaskInput, options?: RequestOptions) => request<Task>('/api/tasks', 'POST', input, options),
    editTask: (taskId: string, input: EditTaskInput, options?: RequestOptions) => request<Task>(`/api/tasks/${id(taskId)}`, 'PATCH', input, options),
    analyzeBrief: (input: BriefAnalysisInput, options?: RequestOptions) => request<BriefAnalysis>('/api/brief/analyze', 'POST', input, options),
    clarify: (taskId: string, version: number, options?: RequestOptions) => request<Analysis>(`/api/tasks/${id(taskId)}/clarify`, 'POST', { version }, options),
    generateCard: (taskId: string, version: number, answers: Answer[], options?: RequestOptions) => request<{ task: Task; questions: Question[]; ai: AiMeta }>(`/api/tasks/${id(taskId)}/generate-card`, 'POST', { version, answers }, options),
    confirm: (taskId: string, version: number, options?: RequestOptions) => request<Task>(`/api/tasks/${id(taskId)}/confirm`, 'POST', { version }, options),
    publish: (taskId: string, version: number, options?: RequestOptions) => request<PublishedTask>(`/api/tasks/${id(taskId)}/publish`, 'POST', { version }, options),
    proposals: (taskId: string, options?: RequestOptions) => request<{ items: Proposal[] }>(`/api/tasks/${id(taskId)}/proposals`, 'GET', undefined, options),
    myProposals: (options?: RequestOptions) => request<{ items: Proposal[] }>('/api/team/proposals', 'GET', undefined, options),
    submitProposal: (taskId: string, input: ProposalInput, options?: RequestOptions) => request<Proposal>(`/api/tasks/${id(taskId)}/proposals`, 'POST', input, options),
    decide: (proposalId: string, decision: 'selected' | 'rejected', options?: RequestOptions) => request<Proposal>(`/api/proposals/${id(proposalId)}/decision`, 'PATCH', { decision }, options),
    confirmProgress: (proposalId: string, input: MilestoneInput, options?: RequestOptions) => request<Milestone>(`/api/proposals/${id(proposalId)}/progress`, 'POST', input, options),
  };
}
