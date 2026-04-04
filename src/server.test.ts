import { describe, test, expect, afterEach } from 'vitest';
import { createOneShotServer, type OneShotServer } from './server.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let server: OneShotServer | undefined;
let tempDir: string | undefined;

async function makeTempSite(files: Record<string, string> = { 'index.html': '<h1>Hello</h1>' }): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), 'deploy-once-test-'));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(tempDir, name), content);
  }
  return tempDir;
}

afterEach(async () => {
  if (server) {
    // Server may already be closed (via done resolution), ignore errors
    await server.close().catch(() => {});
    server = undefined;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    tempDir = undefined;
  }
});

describe('one-shot middleware', () => {
  test('serves index.html on first visit', async () => {
    const dir = await makeTempSite();
    server = await createOneShotServer({ path: dir, ttlMs: 5000 });

    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>Hello</h1>');
  });

  test('returns 410 Gone on second visit', async () => {
    const dir = await makeTempSite();
    server = await createOneShotServer({ path: dir, ttlMs: 10000 });

    await fetch(`${server.url}/`);
    // Wait for visited flag to set
    await new Promise(r => setTimeout(r, 50));

    const res2 = await fetch(`${server.url}/`);
    expect(res2.status).toBe(410);
    expect(await res2.text()).toContain('self-destructed');
  });

  test('emits visited event on HTML request', async () => {
    const dir = await makeTempSite();
    server = await createOneShotServer({ path: dir, ttlMs: 5000 });

    const visited = new Promise<void>(resolve => {
      server!.events.on('visited', () => resolve());
    });

    await fetch(`${server.url}/`);
    await visited;
  });

  test('serves static assets without triggering one-shot', async () => {
    const dir = await makeTempSite({
      'index.html': '<h1>Hi</h1>',
      'style.css': 'body { color: red; }',
    });
    server = await createOneShotServer({ path: dir, ttlMs: 5000 });

    const cssRes = await fetch(`${server.url}/style.css`);
    expect(cssRes.status).toBe(200);
    expect(await cssRes.text()).toBe('body { color: red; }');

    // HTML still works — CSS didn't trigger one-shot
    const htmlRes = await fetch(`${server.url}/`);
    expect(htmlRes.status).toBe(200);
  });

  test('returns 404 for missing files', async () => {
    const dir = await makeTempSite();
    server = await createOneShotServer({ path: dir, ttlMs: 5000 });

    const res = await fetch(`${server.url}/nope.txt`);
    expect(res.status).toBe(404);
  });

  test('serves a single HTML file', async () => {
    const dir = await makeTempSite({ 'page.html': '<p>single</p>' });
    server = await createOneShotServer({ path: join(dir, 'page.html'), ttlMs: 5000 });

    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<p>single</p>');
  });
});

describe('TTL logic', () => {
  test('auto-expires and resolves done with ttl', async () => {
    const dir = await makeTempSite();
    server = await createOneShotServer({ path: dir, ttlMs: 200 });

    const expired = new Promise<void>(resolve => {
      server!.events.on('expired', () => resolve());
    });

    const reason = await server.done;
    expect(reason).toBe('ttl');
    await expired;
  });

  test('resolves done with visited on visit', async () => {
    const dir = await makeTempSite();
    server = await createOneShotServer({ path: dir, ttlMs: 30000 });

    await fetch(`${server.url}/`);
    const reason = await server.done;
    expect(reason).toBe('visited');
  });
});
