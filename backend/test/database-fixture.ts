import type { TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function databaseFixture(t: TestContext, prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const resources: { close: () => unknown }[] = [];
  t.after(async () => {
    // Windows cannot unlink SQLite files while any app/store still holds them.
    for (const resource of resources.reverse()) await resource.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, track<T extends { close: () => unknown }>(resource: T): T {
    resources.push(resource);
    return resource;
  } };
}
