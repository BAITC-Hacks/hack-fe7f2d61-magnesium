import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('backend dev ignores dependency changes but reloads edited source and reads .env', { timeout: 20000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'skillarena-watch-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'node_modules', 'watch-probe'), { recursive: true });
  await symlink(fileURLToPath(new URL('../node_modules/tsx', import.meta.url)), join(root, 'node_modules', 'tsx'), 'junction');
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(join(root, '.env'), 'SKILLARENA_WATCH_PROBE=loaded\n');
  await writeFile(join(root, 'node_modules/watch-probe/package.json'), JSON.stringify({ type: 'module', main: 'index.js' }));
  const dependency = join(root, 'node_modules/watch-probe/index.js');
  const source = join(root, 'src/value.ts');
  await writeFile(dependency, 'export const dependency = 1;\n');
  await writeFile(source, 'export const value = 1;\n');
  await writeFile(join(root, 'src/server.ts'), `
    import { dependency } from 'watch-probe';
    import { value } from './value.ts';
    console.log('WATCH_READY:' + JSON.stringify({ value, dependency, env: process.env.SKILLARENA_WATCH_PROBE }));
    setInterval(() => {}, 1000);
  `);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const args = (manifest.scripts.dev as string).split(' ').slice(1);
  const env = { ...process.env };
  delete env.SKILLARENA_WATCH_PROBE;
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  let output = '';
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { output += data.toString(); });
  t.after(async () => {
    if (process.platform === 'win32' && child.pid) {
      // Windows SIGTERM does not reach the watcher's child, which holds the pipes open.
      const treeKill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      await once(treeKill, 'close');
      await closed;
      await rm(root, { recursive: true, force: true });
      return;
    }
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await closed; } finally { clearTimeout(force); await rm(root, { recursive: true, force: true }); }
  });
  const starts = () => output.split('\n').filter(line => line.startsWith('WATCH_READY:'));
  async function waitForVersion(value: number) {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      if (starts().some(line => line.includes(`"value":${value}`))) return;
      await delay(50);
    }
    assert.fail(`Watcher did not run source version ${value}: ${output}`);
  }
  await waitForVersion(1);
  assert.match(starts()[0]!, /"env":"loaded"/);
  await delay(300);
  await writeFile(dependency, 'export const dependency = 2;\n');
  await delay(1200);
  assert.equal(starts().length, 1, `Dependency edit restarted the backend: ${output}`);
  await writeFile(source, 'export const value = 2;\n');
  await waitForVersion(2);
  assert.match(starts().at(-1)!, /"dependency":2/);
});
