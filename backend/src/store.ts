import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Task, Team, Proposal, Milestone } from './contracts.js';

type Tables = { tasks: Task; teams: Team; proposals: Proposal; milestones: Milestone };

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS milestone_key ON milestones(json_extract(body, '$.proposalId'), json_extract(body, '$.key'));
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      UPDATE tasks SET body = json_set(body, '$.humanEditedFields', json('[]'))
        WHERE json_type(body, '$.humanEditedFields') IS NULL;`);
  }
  get<K extends keyof Tables>(table: K, id: string): Tables[K] | undefined {
    const row = this.db.prepare(`SELECT body FROM ${table} WHERE id = ?`).get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as Tables[K] : undefined;
  }
  all<K extends keyof Tables>(table: K): Tables[K][] {
    return (this.db.prepare(`SELECT body FROM ${table} ORDER BY rowid`).all() as { body: string }[]).map(row => JSON.parse(row.body) as Tables[K]);
  }
  save<K extends keyof Tables>(table: K, item: Tables[K]): Tables[K] {
    this.db.prepare(`INSERT INTO ${table}(id, body) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body`).run(item.id, JSON.stringify(item));
    return item;
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
