import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { mapEntry, normalizeCatalog } from '../src/host/catalog.js';
import { createSizeWarmer, GITHUB_REPO_API, loadSizeStore, saveSizeStore, sizeOf, SIZE_TTL_MS } from '../src/host/sizes.js';
import { API_BASE, createHandler, SIZE_WARM_BATCH, startSizes } from '../src/host/index.js';

/** Whether one path exists. */
async function exists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

test('sizeOf applies the seven day TTL and treats absent, stale and missing entries as unknown', () => {
  const now = 10 * SIZE_TTL_MS;
  const store = {
    entries: {
      'owner/fresh': { bytes: 4096, at: now - 1000 },
      'owner/stale': { bytes: 4096, at: now - SIZE_TTL_MS - 1 },
      'owner/missing': { bytes: 0, missing: true, at: now },
      'owner/broken': { bytes: 'x', at: now },
    },
  };
  assert.equal(sizeOf(store, 'owner/fresh', now), 4096);
  assert.equal(sizeOf(store, 'owner/stale', now), null);
  assert.equal(sizeOf(store, 'owner/missing', now), null);
  assert.equal(sizeOf(store, 'owner/broken', now), null);
  assert.equal(sizeOf(store, 'owner/absent', now), null);
  assert.equal(sizeOf(null, 'owner/fresh', now), null);
  assert.equal(sizeOf(store, '', now), null);
});

test('loadSizeStore survives a corrupt cache and saveSizeStore round-trips through a temporary file', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-sizes-'));
  const file = path.join(workspace, 'nested', 'sizes.json');
  assert.deepEqual(await loadSizeStore({ file }), { entries: {} });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '{not json');
  assert.deepEqual(await loadSizeStore({ file }), { entries: {} });
  await fs.writeFile(file, JSON.stringify({ entries: [] }));
  assert.deepEqual(await loadSizeStore({ file }), { entries: {} });
  const store = { entries: { 'owner/demo': { bytes: 2048, at: 5 } } };
  await saveSizeStore(store, { file });
  assert.deepEqual(await loadSizeStore({ file }), store);
  assert.equal(await exists(file + '.tmp'), false);
  await fs.rm(workspace, { recursive: true, force: true });
});

test('the warmer writes GitHub sizes, marks a 404 missing and reports coverage', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-warm-'));
  const file = path.join(workspace, 'sizes.json');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith('owner/gone')) return { status: 404, headers: new Map() };
    return { status: 200, headers: new Map([['x-ratelimit-remaining', '42']]), json: async () => ({ size: 1024 }) };
  };
  const store = { entries: {} };
  const warmer = createSizeWarmer({
    repos: ['owner/demo', 'owner/gone'],
    store,
    file,
    fetchImpl,
    clock: () => 1000,
    token: 'secret',
  });

  assert.deepEqual(await warmer.warm(5), { fetched: 2, skipped: 0, blocked: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], GITHUB_REPO_API + 'owner/demo');
  assert.deepEqual(calls[0][1].headers, {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-video-skills',
    authorization: 'Bearer secret',
  });
  assert.deepEqual(store.entries['owner/demo'], { bytes: 1024 * 1024, at: 1000 });
  assert.deepEqual(store.entries['owner/gone'], { bytes: 0, missing: true, at: 1000 });
  assert.deepEqual(warmer.coverage(), { known: 1, total: 2 });
  assert.deepEqual(await loadSizeStore({ file }), { entries: store.entries });

  assert.deepEqual(await warmer.warm(5), { fetched: 0, skipped: 0, blocked: false });
  assert.equal(calls.length, 2);

  await fs.rm(workspace, { recursive: true, force: true });
});

test('a throttled response blocks the warmer until the reset time without another request', async () => {
  let now = 5000;
  let calls = 0;
  let status = 403;
  const fetchImpl = async () => {
    calls += 1;
    return { status, headers: new Map([['x-ratelimit-reset', '10']]) };
  };
  const warmer = createSizeWarmer({
    repos: ['owner/demo'],
    store: { entries: {} },
    file: path.join(os.tmpdir(), 'vs-sizes-unwritten.json'),
    fetchImpl,
    clock: () => now,
  });

  assert.deepEqual(await warmer.warm(5), { fetched: 0, skipped: 0, blocked: true });
  assert.equal(calls, 1);

  now = 10 * 1000 + 999;
  assert.deepEqual(await warmer.warm(5), { fetched: 0, skipped: 0, blocked: true });
  assert.equal(calls, 1);

  now = 10 * 1000 + 1000;
  status = 200;
  const answer = await warmer.warm(5);
  assert.equal(calls, 2);
  assert.equal(answer.blocked, false);
});

test('catalog entries carry sizeBytes and the response reports the size coverage', () => {
  const store = { entries: { 'owner/demo': { bytes: 1048576, at: Date.now() } } };
  const payload = { skills: [{ repo_full_name: 'owner/demo' }, { repo_full_name: 'owner/other' }] };

  const body = normalizeCatalog(payload, { sizes: store });
  assert.equal(body.entries[0].sizeBytes, 1048576);
  assert.equal(body.entries[1].sizeBytes, null);
  assert.deepEqual(body.sizes, { known: 1, total: 2 });

  const plain = normalizeCatalog(payload);
  assert.deepEqual(plain.sizes, { known: 0, total: 2 });
  assert.equal(plain.entries[0].sizeBytes, null);
  assert.deepEqual(Object.keys(mapEntry({ repo_full_name: 'owner/demo' })), [
    'repo',
    'path',
    'stars',
    'description',
    'kind',
    'grade',
    'language',
    'license',
    'previewUrl',
    'sizeBytes',
  ]);
});
test('startSizes warms one batch before arming the interval and disposes that timer', async () => {
  const batches = [];
  const warmer = {
    warm: (count) => {
      batches.push(count);
      return Promise.resolve({ fetched: 0, skipped: 0, blocked: false });
    },
    coverage: () => ({ known: 0, total: 0 }),
    setRepos: () => {},
  };
  const effects = [];
  const scope = { effect: (factory) => effects.push(factory) };

  await startSizes(scope, { loadSizeStore: async () => ({ entries: {} }), createSizeWarmer: () => warmer });

  assert.deepEqual(batches, [SIZE_WARM_BATCH]);
  assert.equal(SIZE_WARM_BATCH, 5);
  assert.equal(effects.length, 1);
  const dispose = effects[0]();
  assert.equal(typeof dispose, 'function');
  dispose();
});
/** Drive one catalog request through the handler without a socket. */
async function getCatalog(handler) {
  const res = {
    statusCode: 0,
    headersSent: false,
    body: null,
    setHeader() {},
    end(text) {
      this.body = JSON.parse(text);
      this.headersSent = true;
    },
  };
  await handler({ method: 'GET', url: API_BASE + '/catalog' }, res);
  return { status: res.statusCode, body: res.body };
}

test('GET /catalog hands the warmer its repos and kicks one batch on every request', async () => {
  const repos = [];
  const batches = [];
  const warmer = {
    setRepos: (list) => repos.push(list),
    warm: (count) => {
      batches.push(count);
      return Promise.resolve({ fetched: 0, skipped: 0, blocked: false });
    },
    coverage: () => ({ known: 0, total: 373 }),
  };
  const skills = Array.from({ length: 373 }, (_, index) => ({ repo_full_name: 'owner/repo-' + index }));
  const handler = createHandler({
    warmer,
    loadCatalog: async ({ sizes }) => normalizeCatalog({ skills }, { sizes }),
  });

  const first = await getCatalog(handler);
  assert.equal(first.status, 200);
  assert.equal(repos.length, 1);
  assert.equal(repos[0].length, 373);
  assert.deepEqual(first.body.sizes, { known: 0, total: 373 });
  assert.deepEqual(batches, [SIZE_WARM_BATCH]);

  await getCatalog(handler);
  assert.deepEqual(batches, [SIZE_WARM_BATCH, SIZE_WARM_BATCH]);
});
