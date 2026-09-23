import { randomUUID } from 'node:crypto';
import { emptyCard, type Card, type CardField, type Task, type PublishedTask, type ProposalInput, type Team, type MilestoneInput } from './contracts.js';
import { calculateRating } from './rating.js';
import { ApiError, conflict, notFound } from './errors.js';
import { Store } from './store.js';

export const BUSINESSES = [{ id: 'business-demo', name: 'Demo Business' }];
const now = () => new Date().toISOString();

export class Service {
  constructor(readonly store: Store) {}

  business(id: string | undefined) {
    if (!id) throw new ApiError(401, 'IDENTITY_REQUIRED', 'Передайте X-Business-Id выбранного демо-бизнеса.');
    if (!BUSINESSES.some(b => b.id === id)) throw new ApiError(403, 'FORBIDDEN', 'Неизвестный демо-бизнес.');
    return id;
  }
  team(id: string | undefined) {
    if (!id) throw new ApiError(401, 'IDENTITY_REQUIRED', 'Передайте X-Team-Id выбранной команды.');
    const team = this.store.get('teams', id); if (!team) throw notFound(); return team;
  }
  ownedTask(id: string, businessId: string | undefined) {
    const owner = this.business(businessId);
    const task = this.store.get('tasks', id); if (!task) throw notFound();
    if (task.businessId !== owner) throw new ApiError(403, 'FORBIDDEN', 'Задача принадлежит другому бизнесу.');
    return task;
  }
  version(task: Task, version: number) {
    if (task.version !== version) throw conflict('Карточка изменилась. Загрузите текущую версию и повторите действие.');
  }
  createTask(businessId: string | undefined, input: { description: string; industry: string; topic?: string }, id: string = randomUUID()) {
    const owner = this.business(businessId); const timestamp = now();
    const card = { ...emptyCard(), context: input.description.trim().slice(0, 4000) };
    return this.store.save('tasks', {
      id, businessId: owner, description: input.description.trim(), industry: input.industry.trim(), topic: (input.topic ?? input.industry).trim(),
      card, humanEditedFields: [], version: 1, confirmedVersion: null, status: 'draft', hasUnpublishedChanges: true,
      rating: calculateRating(card, false), published: null, createdAt: timestamp, updatedAt: timestamp,
    });
  }
  editTask(id: string, owner: string | undefined, input: { version: number; card?: Partial<Card>; industry?: string; topic?: string }, humanFields: CardField[] = Object.keys(input.card ?? {}) as CardField[]) {
    return this.store.transaction(() => {
      const task = this.ownedTask(id, owner); this.version(task, input.version);
      task.card = { ...task.card, ...Object.fromEntries(Object.entries(input.card ?? {}).map(([key, value]) => [key, value.trim()])) };
      task.humanEditedFields = [...new Set([...task.humanEditedFields, ...humanFields])];
      if (input.industry !== undefined) task.industry = input.industry.trim();
      if (input.topic !== undefined) task.topic = input.topic.trim();
      task.version++; task.confirmedVersion = null; task.status = 'draft'; task.hasUnpublishedChanges = true;
      task.rating = calculateRating(task.card, false); task.updatedAt = now();
      return this.store.save('tasks', task);
    });
  }
  confirmTask(id: string, owner: string | undefined, version: number) {
    return this.store.transaction(() => {
      const task = this.ownedTask(id, owner); this.version(task, version);
      task.confirmedVersion = task.version; task.rating = calculateRating(task.card, true);
      task.status = task.published?.version === task.version ? 'published' : 'confirmed'; task.updatedAt = now();
      return this.store.save('tasks', task);
    });
  }
  publishTask(id: string, owner: string | undefined, version: number) {
    return this.store.transaction(() => {
      const task = this.ownedTask(id, owner); this.version(task, version);
      if (task.confirmedVersion !== task.version) throw conflict('Сначала подтвердите текущую версию карточки.');
      if (!task.card.title.trim()) throw new ApiError(422, 'TITLE_REQUIRED', 'Добавьте название задачи перед публикацией.');
      const timestamp = now();
      task.published = {
        id: task.id, businessId: task.businessId, industry: task.industry, topic: task.topic, card: { ...task.card },
        version: task.version, rating: calculateRating(task.card, true), publishedAt: task.published?.publishedAt ?? timestamp, updatedAt: timestamp,
      };
      task.status = 'published'; task.hasUnpublishedChanges = false; task.updatedAt = timestamp;
      this.store.save('tasks', task); return task.published;
    });
  }
  catalog(filters: { topic?: string; readiness?: string; industry?: string } = {}) {
    return this.store.all('tasks').map(task => task.published).filter((task): task is PublishedTask => task !== null)
      .filter(task => (!filters.topic || task.topic.toLowerCase() === filters.topic.toLowerCase()) && (!filters.readiness || task.rating.level === filters.readiness) && (!filters.industry || task.industry.toLowerCase() === filters.industry.toLowerCase()))
      .sort((a, b) => b.rating.score - a.rating.score || a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
  }
  publishedTask(id: string) { const published = this.store.get('tasks', id)?.published; if (!published) throw notFound(); return published; }
  businessTasks(owner: string | undefined) { const id = this.business(owner); return this.store.all('tasks').filter(task => task.businessId === id); }
  createTeam(input: Omit<Team, 'id' | 'xp'>, id: string = randomUUID()) { return this.store.save('teams', { ...input, name: input.name.trim(), id, xp: 0 }); }
  teams() {
    const milestones = this.store.all('milestones');
    return this.store.all('teams').map(team => ({ ...team, xp: milestones.filter(m => m.teamId === team.id).reduce((sum, m) => sum + m.points, 0) }));
  }
  submitProposal(taskId: string, teamId: string | undefined, input: ProposalInput, id: string = randomUUID()) {
    this.publishedTask(taskId); const team = this.team(teamId);
    return this.store.save('proposals', { id, taskId, teamId: team.id, ...input, status: 'pending', createdAt: now(), decidedAt: null });
  }
  proposals(taskId: string, owner: string | undefined) {
    this.ownedTask(taskId, owner); return this.store.all('proposals').filter(proposal => proposal.taskId === taskId);
  }
  teamProposals(teamId: string | undefined) { const team = this.team(teamId); return this.store.all('proposals').filter(p => p.teamId === team.id); }
  decide(id: string, owner: string | undefined, decision: 'selected' | 'rejected') {
    return this.store.transaction(() => {
      const proposal = this.store.get('proposals', id); if (!proposal) throw notFound();
      this.ownedTask(proposal.taskId, owner);
      if (decision === 'rejected' && this.store.all('milestones').some(m => m.proposalId === id)) throw conflict('У команды уже есть подтверждённый прогресс по этому отклику.');
      proposal.status = decision; proposal.decidedAt = now(); return this.store.save('proposals', proposal);
    });
  }
  confirmProgress(id: string, owner: string | undefined, input: MilestoneInput) {
    return this.store.transaction(() => {
      const proposal = this.store.get('proposals', id); if (!proposal) throw notFound();
      const task = this.ownedTask(proposal.taskId, owner);
      if (proposal.status !== 'selected') throw conflict('Подтвердить прогресс можно только выбранной команды.');
      const existing = this.store.all('milestones').find(m => m.proposalId === id && m.key === input.key);
      if (existing) {
        if (existing.description !== input.description || existing.evidenceUrl !== input.evidenceUrl) throw conflict('Этот ключ этапа уже использован с другими данными.');
        return existing;
      }
      return this.store.save('milestones', { id: randomUUID(), proposalId: id, teamId: proposal.teamId, ...input, points: 100, confirmedAt: now(), confirmedBy: task.businessId });
    });
  }
}
