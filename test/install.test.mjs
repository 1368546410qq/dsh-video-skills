import assert from 'node:assert/strict';
import { createReadStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { create as createArchive } from 'tar';

import {
  archiveBudgetMessage,
  createProgressReporter,
  DEFAULT_TARGETS,
  installSkill,
  isSafeRelativePath,
  listInstalled,
  MARKER_FILE,
  measureDir,
  MAX_ARCHIVE_BYTES,
  MAX_FILE_BYTES,
  normalizeArchivePath,
  normalizeRepo,
  normalizeTargets,
  parseFrontmatterName,
  pickSkillDir,
  resolveConflict,
  resolveSkillDir,
  sanitizeSkillName,
  skillRoot,
  skipReason,
  stripArchiveRoot,
  uninstallSkill,
} from '../src/host/install.js';
import { filterEntries, mapEntry, normalizeCatalog } from '../src/host/catalog.js';
import { API_BASE, createHandler, createToolCatalogLoader, startSizes } from '../src/host/index.js';
import { createJobStore, JOB_TTL_MS, MAX_RUNNING_JOBS } from '../src/host/jobs.js';
import {
  createSizeWarmer,
  GITHUB_REPO_API,
  loadSizeStore,
  saveSizeStore,
  sizeOf,
  SIZE_TTL_MS,
} from '../src/host/sizes.js';
import { buildVideoTools, ENTRY_SCHEMA, localDefineTool } from '../src/host/tool-schema.js';

test('pickSkillDir selects the shallowest SKILL.md', () => {
  const files = [
    'README.md',
    'skills/wrapper/SKILL.md',
    'skills/wrapper/deep/nested/SKILL.md',
    'skills/other/README.md',
  ];
  assert.equal(pickSkillDir(files, 'wrapper'), 'skills/wrapper');
  assert.equal(pickSkillDir(['SKILL.md', 'skills/wrapper/SKILL.md'], 'wrapper'), '');
  assert.equal(pickSkillDir(['README.md'], 'wrapper'), null);
});

test('pickSkillDir breaks a depth tie on the repository name', () => {
  const files = ['alpha/SKILL.md', 'wrapper/SKILL.md'];
  assert.equal(pickSkillDir(files, 'wrapper'), 'wrapper');
  assert.equal(pickSkillDir(files, 'unrelated'), 'alpha');
});

test('resolveSkillDir honours the explicit path field', () => {
  const files = ['SKILL.md', 'skills/wrapper/SKILL.md'];
  assert.equal(resolveSkillDir({ files, repoName: 'wrapper', requested: 'skills/wrapper' }), 'skills/wrapper');
  assert.equal(resolveSkillDir({ files, repoName: 'wrapper', requested: null }), '');
  assert.equal(resolveSkillDir({ files, repoName: 'wrapper', requested: '  ' }), '');
  assert.equal(resolveSkillDir({ files, repoName: 'wrapper', requested: 'skills/../../etc' }), null);
});

test('skipReason covers .git, node_modules and the size budget', () => {
  assert.equal(skipReason('.git/config', 10), 'git');
  assert.equal(skipReason('vendor/node_modules/left-pad/index.js', 10), 'node_modules');
  assert.equal(skipReason('assets/big.mp4', MAX_FILE_BYTES + 1), 'too-large');
  assert.equal(skipReason('assets/small.mp4', MAX_FILE_BYTES), null);
  assert.equal(skipReason('SKILL.md', 32), null);
});

test('isSafeRelativePath rejects traversal and absolute entries', () => {
  assert.equal(isSafeRelativePath('skills/wrapper/SKILL.md'), true);
  assert.equal(isSafeRelativePath('../escape'), false);
  assert.equal(isSafeRelativePath('skills/../../escape'), false);
  assert.equal(isSafeRelativePath('/etc/passwd'), false);
  assert.equal(isSafeRelativePath('C:/Windows/system32'), false);
  assert.equal(isSafeRelativePath(''), false);
});

test('resolveConflict has exactly three outcomes', () => {
  assert.equal(resolveConflict({ dirExists: false, marker: null, repo: 'a/b' }), 'install');
  assert.equal(resolveConflict({ dirExists: true, marker: null, repo: 'a/b' }), 'exists');
  assert.equal(resolveConflict({ dirExists: true, marker: { repo: 'a/b' }, repo: 'a/b' }), 'overwrite');
  assert.equal(resolveConflict({ dirExists: true, marker: { repo: 'c/d' }, repo: 'a/b' }), 'exists');
});

test('sanitizeSkillName keeps only path-safe characters', () => {
  assert.equal(sanitizeSkillName('My Skill!'), 'my-skill');
  assert.equal(sanitizeSkillName('  Trailing Dots...  '), 'trailing-dots');
  assert.equal(sanitizeSkillName('../../etc/passwd'), 'etc-passwd');
  assert.equal(sanitizeSkillName('..'), '');
  assert.equal(sanitizeSkillName(''), '');
  assert.equal(sanitizeSkillName(null), '');
});

test('parseFrontmatterName reads the name field', () => {
  assert.equal(parseFrontmatterName('---\nname: Demo Skill\ndescription: x\n---\n# body'), 'Demo Skill');
  assert.equal(parseFrontmatterName('---\nname: "quoted-name"\n---\n'), 'quoted-name');
  assert.equal(parseFrontmatterName('---\ndescription: no name\n---\n'), null);
  assert.equal(parseFrontmatterName('# no frontmatter'), null);
});

test('normalizeRepo accepts repository forms and refuses anything else', () => {
  assert.equal(normalizeRepo('owner/repo'), 'owner/repo');
  assert.equal(normalizeRepo(' https://github.com/owner/repo.git '), 'owner/repo');
  assert.equal(normalizeRepo('owner/repo/extra'), null);
  assert.equal(normalizeRepo('../repo'), null);
  assert.equal(normalizeRepo(''), null);
  assert.equal(normalizeRepo(undefined), null);
});

test('normalizeTargets defaults to DSH, the v2 default target, and de-duplicates', () => {
  assert.deepEqual(normalizeTargets(undefined), DEFAULT_TARGETS);
  assert.deepEqual(normalizeTargets(undefined), ['dsh']);
  assert.deepEqual(normalizeTargets(['dsh', 'claude', 'dsh']), ['dsh', 'claude']);
  assert.equal(normalizeTargets([]), null);
  assert.equal(normalizeTargets(['claude', 'nope']), null);
});

test('skillRoot prefers the environment override', () => {
  assert.equal(
    skillRoot('claude', { DSH_VIDEO_SKILLS_CLAUDE_ROOT: '/tmp/claude-root', DSH_VIDEO_SKILLS_DSH_ROOT: '/tmp/dsh-root' }),
    '/tmp/claude-root',
  );
  assert.equal(skillRoot('dsh', { DSH_VIDEO_SKILLS_DSH_ROOT: '/tmp/dsh-root' }), '/tmp/dsh-root');
  assert.match(skillRoot('claude', {}), /skills$/);
  assert.match(skillRoot('dsh', {}), /skills$/);
});

test('archive path helpers drop the synthetic root directory', () => {
  assert.equal(normalizeArchivePath('./repo-sha/skills/demo/SKILL.md'), 'repo-sha/skills/demo/SKILL.md');
  assert.equal(normalizeArchivePath('repo-sha/skills/'), 'repo-sha/skills');
  assert.equal(stripArchiveRoot('repo-sha/skills/demo/SKILL.md', 'repo-sha'), 'skills/demo/SKILL.md');
  assert.equal(stripArchiveRoot('repo-sha', 'repo-sha'), '');
  assert.equal(stripArchiveRoot('skills/demo/SKILL.md', ''), 'skills/demo/SKILL.md');
});

/** A stubbed fetch that serves one locally built archive instead of the network. */
function stubFetch(archive) {
  return async () => ({ ok: true, status: 200, body: Readable.toWeb(createReadStream(archive)) });
}

/** Build a codeload-shaped archive: one synthetic root directory holding the tree. */
async function buildArchive(workspace) {
  const repoDir = path.join(workspace, 'owner-demo-sha');
  await fs.mkdir(path.join(repoDir, 'skills', 'demo', 'node_modules'), { recursive: true });
  await fs.mkdir(path.join(repoDir, 'skills', 'demo', '.git'), { recursive: true });
  await fs.writeFile(path.join(repoDir, 'skills', 'demo', 'SKILL.md'), '---\nname: Demo Skill\n---\n# demo\n');
  await fs.writeFile(path.join(repoDir, 'skills', 'demo', 'README.md'), 'docs');
  await fs.writeFile(path.join(repoDir, 'skills', 'demo', 'node_modules', 'lib.js'), 'x');
  await fs.writeFile(path.join(repoDir, 'skills', 'demo', '.git', 'config'), 'x');
  const archive = path.join(workspace, 'HEAD.tar.gz');
  await createArchive({ gzip: true, file: archive, cwd: workspace }, ['owner-demo-sha']);
  return archive;
}

/** Whether one path exists. */
async function exists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

/** Let the microtask queue drain, so a started job can settle. */
function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('installSkill copies the skill, skips .git/node_modules and writes the marker', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-test-'));
  const archive = await buildArchive(workspace);
  const fetchImpl = stubFetch(archive);
  const env = {
    DSH_VIDEO_SKILLS_CLAUDE_ROOT: path.join(workspace, 'claude-root'),
    DSH_VIDEO_SKILLS_DSH_ROOT: path.join(workspace, 'dsh-root'),
  };
  const now = new Date('2026-10-29T00:00:00.000Z');
  const result = await installSkill({ repo: 'owner/demo', targets: ['claude', 'dsh'], env, fetchImpl, now });

  assert.equal(result.ok, true);
  assert.equal(result.name, 'demo-skill');
  assert.deepEqual(result.installed.map((entry) => entry.target), ['claude', 'dsh']);
  assert.equal(result.installed[0].files, 2);
  assert.equal(result.installed[1].files, 2);
  assert.deepEqual(result.warnings, [
    'skipped:git:.git/',
    'skipped:node_modules:node_modules/',
  ]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(result.installed[0].dir, MARKER_FILE), 'utf8')), {
    repo: 'owner/demo',
    path: null,
    ref: 'HEAD',
    installedAt: '2026-10-29T00:00:00.000Z',
    files: 2,
  });

  await fs.writeFile(
    path.join(env.DSH_VIDEO_SKILLS_CLAUDE_ROOT, 'demo-skill', MARKER_FILE),
    JSON.stringify({ repo: 'someone/else' }),
  );
  assert.deepEqual(await installSkill({ repo: 'owner/demo', targets: ['claude'], env, fetchImpl }), {
    ok: false,
    error: 'exists',
    dir: path.join(env.DSH_VIDEO_SKILLS_CLAUDE_ROOT, 'demo-skill'),
  });

  await fs.writeFile(
    path.join(env.DSH_VIDEO_SKILLS_CLAUDE_ROOT, 'demo-skill', MARKER_FILE),
    JSON.stringify({ repo: 'owner/demo' }),
  );
  const overwrite = await installSkill({ repo: 'owner/demo', targets: ['claude'], env, fetchImpl });
  assert.equal(overwrite.ok, true);
  assert.equal(overwrite.installed[0].files, 2);

  assert.deepEqual(await installSkill({ repo: 'owner/demo', path: 'missing-dir', targets: ['claude'], env, fetchImpl }), {
    ok: false,
    error: 'no-skill-md',
  });

  const renamed = await installSkill({ repo: 'owner/demo', name: 'Custom Name!', targets: ['claude'], env, fetchImpl });
  assert.equal(renamed.ok, true);
  assert.equal(renamed.name, 'custom-name');

  const cleanRepo = path.join(workspace, 'owner-clean-sha', 'skills', 'clean');
  await fs.mkdir(cleanRepo, { recursive: true });
  await fs.writeFile(path.join(cleanRepo, 'SKILL.md'), '---\nname: Clean Skill\n---\n# clean\n');
  await fs.writeFile(path.join(cleanRepo, 'README.md'), 'docs');
  const cleanArchive = path.join(workspace, 'clean.tar.gz');
  await createArchive({ gzip: true, file: cleanArchive, cwd: workspace }, ['owner-clean-sha']);
  const clean = await installSkill({ repo: 'owner/clean', targets: ['claude'], env, fetchImpl: stubFetch(cleanArchive) });
  assert.equal(clean.ok, true);
  assert.equal(clean.installed[0].files, 2);
  assert.deepEqual(clean.warnings, []);

  await fs.rm(workspace, { recursive: true, force: true });
});

test('the download budget is 512 MiB and its refusal names the received bytes', () => {
  assert.equal(MAX_ARCHIVE_BYTES, 512 * 1024 * 1024);
  assert.equal(
    archiveBudgetMessage(536870913),
    'archive exceeds the 512 MiB download budget (received 536870913 bytes)',
  );
  assert.equal(
    archiveBudgetMessage(MAX_ARCHIVE_BYTES + 1),
    'archive exceeds the 512 MiB download budget (received 536870913 bytes)',
  );
});

test('createProgressReporter caps progress at ten calls a second and swallows callback errors', () => {
  const seen = [];
  const report = createProgressReporter((progress) => seen.push(progress));
  for (let index = 0; index < 50; index += 1) report({ phase: 'download', bytes: index });
  assert.equal(seen.length, 1);
  report({ phase: 'inspect' });
  report({ phase: 'extract' });
  assert.deepEqual(seen.map((progress) => progress.phase), ['download', 'inspect', 'extract']);
  assert.doesNotThrow(() => createProgressReporter(() => {
    throw new Error('boom');
  })({ phase: 'download' }));
  assert.doesNotThrow(() => createProgressReporter(null)({ phase: 'download' }));
});

test('installSkill streams progress and cancels at download and at copy', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-cancel-'));
  const archive = await buildArchive(workspace);

  const phases = [];
  const env = {
    DSH_VIDEO_SKILLS_CLAUDE_ROOT: path.join(workspace, 'claude-root'),
    DSH_VIDEO_SKILLS_DSH_ROOT: path.join(workspace, 'dsh-root'),
  };
  const installed = await installSkill({
    repo: 'owner/demo',
    targets: ['claude'],
    env,
    fetchImpl: stubFetch(archive),
    onProgress: (progress) => phases.push(progress.phase),
  });
  assert.equal(installed.ok, true);
  assert.deepEqual([...new Set(phases)], ['download', 'inspect', 'extract', 'copy']);
  assert.ok(phases.length <= 10, 'progress fired ' + phases.length + ' times');

  const preAborted = new AbortController();
  preAborted.abort();
  assert.deepEqual(
    await installSkill({ repo: 'owner/demo', targets: ['claude'], env, fetchImpl: stubFetch(archive), signal: preAborted.signal }),
    { ok: false, error: 'cancelled' },
  );

  const downloadAbort = new AbortController();
  const downloadEnv = { DSH_VIDEO_SKILLS_CLAUDE_ROOT: path.join(workspace, 'claude-download') };
  const chunkedFetch = async () => {
    const bytes = await fs.readFile(archive);
    const half = Math.floor(bytes.length / 2);
    return { ok: true, status: 200, body: Readable.toWeb(Readable.from([bytes.subarray(0, half), bytes.subarray(half)])) };
  };
  assert.deepEqual(
    await installSkill({
      repo: 'owner/demo',
      targets: ['claude'],
      env: downloadEnv,
      fetchImpl: chunkedFetch,
      signal: downloadAbort.signal,
      onProgress: (progress) => {
        if (progress.phase === 'download') downloadAbort.abort();
      },
    }),
    { ok: false, error: 'cancelled' },
  );
  assert.equal(await exists(downloadEnv.DSH_VIDEO_SKILLS_CLAUDE_ROOT), false);

  const copyAbort = new AbortController();
  const copyEnv = { DSH_VIDEO_SKILLS_CLAUDE_ROOT: path.join(workspace, 'claude-copy') };
  assert.deepEqual(
    await installSkill({
      repo: 'owner/demo',
      targets: ['claude'],
      env: copyEnv,
      fetchImpl: stubFetch(archive),
      signal: copyAbort.signal,
      onProgress: (progress) => {
        if (progress.phase === 'copy') copyAbort.abort();
      },
    }),
    { ok: false, error: 'cancelled' },
  );
  assert.equal(await exists(path.join(copyEnv.DSH_VIDEO_SKILLS_CLAUDE_ROOT, 'demo-skill')), false);

  await fs.rm(workspace, { recursive: true, force: true });
});

test('uninstallSkill removes only directories carrying the ownership marker', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-uninstall-'));
  const root = path.join(workspace, 'claude-root');
  await fs.mkdir(path.join(root, 'demo-skill'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'demo-skill', MARKER_FILE),
    JSON.stringify({ repo: 'owner/demo', installedAt: '2026-01-01T00:00:00.000Z', files: 1 }),
  );
  await fs.mkdir(path.join(root, 'handmade'), { recursive: true });
  await fs.writeFile(path.join(root, 'handmade', 'SKILL.md'), '# handmade');
  await fs.mkdir(path.join(root, 'stray-dir'), { recursive: true });
  const env = { DSH_VIDEO_SKILLS_CLAUDE_ROOT: root };

  assert.deepEqual(await uninstallSkill({ name: 'demo-skill', target: 'claude', env }), {
    ok: true,
    removed: { name: 'demo-skill', target: 'claude', dir: path.join(root, 'demo-skill') },
  });
  assert.equal(await exists(path.join(root, 'demo-skill')), false);

  assert.deepEqual(await uninstallSkill({ name: 'handmade', target: 'claude', env }), { ok: false, error: 'not-owned' });
  assert.equal(await exists(path.join(root, 'handmade', 'SKILL.md')), true);
  assert.deepEqual(await uninstallSkill({ name: 'stray-dir', target: 'claude', env }), { ok: false, error: 'not-owned' });
  assert.deepEqual(await uninstallSkill({ name: 'missing-skill', target: 'claude', env }), { ok: false, error: 'not-found' });
  assert.deepEqual(await uninstallSkill({ name: '../escape', target: 'claude', env }), { ok: false, error: 'bad-name' });
  assert.deepEqual(await uninstallSkill({ name: '', target: 'claude', env }), { ok: false, error: 'bad-name' });
  assert.deepEqual(await uninstallSkill({ name: 'handmade', target: 'wsl', env }), { ok: false, error: 'bad-target' });

  await fs.rm(workspace, { recursive: true, force: true });
});

test('listInstalled reports owned and external skills and tolerates an old marker', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-list-'));
  const dshRoot = path.join(workspace, 'dsh-root');
  await fs.mkdir(path.join(dshRoot, 'demo-skill'), { recursive: true });
  await fs.writeFile(path.join(dshRoot, 'demo-skill', 'SKILL.md'), '# demo');
  await fs.writeFile(path.join(dshRoot, 'demo-skill', 'extra.md'), 'more');
  await fs.writeFile(
    path.join(dshRoot, 'demo-skill', MARKER_FILE),
    JSON.stringify({ repo: 'owner/demo', ref: 'HEAD', installedAt: '2026-01-01T00:00:00.000Z' }),
  );
  await fs.mkdir(path.join(dshRoot, 'handmade'), { recursive: true });
  await fs.writeFile(path.join(dshRoot, 'handmade', 'SKILL.md'), '# handmade');
  await fs.mkdir(path.join(dshRoot, 'empty-dir'), { recursive: true });
  await fs.writeFile(path.join(dshRoot, 'stray.txt'), 'not a skill');
  const env = {
    DSH_VIDEO_SKILLS_CLAUDE_ROOT: path.join(workspace, 'claude-root'),
    DSH_VIDEO_SKILLS_DSH_ROOT: dshRoot,
  };

  const items = await listInstalled({ env });
  assert.equal(items.length, 2);

  const owned = items.find((item) => item.name === 'demo-skill');
  assert.deepEqual(owned, {
    name: 'demo-skill',
    target: 'dsh',
    dir: path.join(dshRoot, 'demo-skill'),
    repo: 'owner/demo',
    path: null,
    installedAt: '2026-01-01T00:00:00.000Z',
    files: 2,
    bytes: 10,
    owned: true,
    external: false,
  });

  const external = items.find((item) => item.name === 'handmade');
  assert.deepEqual(external, {
    name: 'handmade',
    target: 'dsh',
    dir: path.join(dshRoot, 'handmade'),
    repo: null,
    path: null,
    installedAt: null,
    files: 1,
    bytes: 10,
    owned: false,
    external: true,
  });

  await fs.rm(workspace, { recursive: true, force: true });
});

test('a job runs to done and stays readable until the ten minute window closes', async () => {
  let now = 0;
  const store = createJobStore({ now: () => now });
  const created = store.create({
    repo: 'owner/demo',
    targets: ['dsh'],
    run: async () => ({ ok: true, name: 'demo', installed: [{ target: 'dsh', dir: '/skills/demo', files: 2 }], warnings: [] }),
  });
  assert.equal(created.ok, true);
  const job = created.job;
  assert.match(job.id, /^job-[0-9a-f]{8}$/);
  assert.equal(job.phase, 'queued');
  assert.equal(job.repo, 'owner/demo');
  assert.deepEqual(job.targets, ['dsh']);
  assert.deepEqual(job.installed, []);
  assert.equal(job.error, null);
  assert.equal(job.message, null);
  assert.equal(job.startedAt, job.updatedAt);
  assert.equal(store.runningCount(), 1);
  assert.equal(store.get('job-00000000'), null);

  await tick();
  const done = store.get(job.id);
  assert.equal(done.phase, 'done');
  assert.equal(done.name, 'demo');
  assert.deepEqual(done.installed, [{ target: 'dsh', dir: '/skills/demo', files: 2 }]);
  assert.equal(done.error, null);
  assert.equal(store.runningCount(), 0);

  now = JOB_TTL_MS - 1;
  assert.equal(store.get(job.id).phase, 'done');
  now = JOB_TTL_MS;
  assert.equal(store.get(job.id), null);
  assert.deepEqual(store.list(), []);
});

test('the job table keeps 32 jobs, answers busy past eight running, and cancels', async () => {
  const store = createJobStore();
  const running = store.create({
    repo: 'owner/demo',
    targets: ['dsh'],
    run: ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ ok: false, error: 'cancelled' }), { once: true });
      }),
  });
  assert.equal(store.cancel(running.job.id).phase, 'queued');
  await tick();
  assert.equal(store.get(running.job.id).phase, 'cancelled');
  assert.equal(store.cancel(running.job.id).phase, 'cancelled');
  assert.equal(store.cancel('job-00000000'), null);

  const capped = createJobStore();
  for (let index = 0; index < MAX_RUNNING_JOBS; index += 1) {
    const started = capped.create({ repo: 'owner/demo', targets: ['dsh'], run: () => new Promise(() => {}) });
    assert.equal(started.ok, true);
  }
  assert.deepEqual(capped.create({ repo: 'owner/demo', targets: ['dsh'], run: () => new Promise(() => {}) }), {
    ok: false,
    error: 'busy',
  });

  const bounded = createJobStore({ maxRunning: 64 });
  const ids = [];
  for (let index = 0; index < 34; index += 1) {
    ids.push(bounded.create({
      repo: 'owner/demo',
      targets: ['dsh'],
      run: async () => ({ ok: true, name: 'demo', installed: [], warnings: [] }),
    }).job.id);
  }
  assert.equal(bounded.list().length, 32);
  assert.equal(bounded.get(ids[0]), null);
  assert.equal(bounded.get(ids[33]).phase, 'queued');
  await tick();
  assert.equal(bounded.get(ids[33]).phase, 'done');
});

/** One fake request carrying an optional JSON body. */
function jsonRequest(method, route, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]);
  req.method = method;
  req.url = API_BASE + route;
  return req;
}

/** One fake response that captures the status, the headers and the parsed body. */
function captureResponse() {
  return {
    statusCode: 0,
    headers: {},
    headersSent: false,
    body: null,
    setHeader(header, value) {
      this.headers[header] = value;
    },
    end(text) {
      this.body = JSON.parse(text);
      this.headersSent = true;
    },
  };
}

/** Drive the route handler directly, without a socket. */
async function callRoute(handler, method, route, body) {
  const res = captureResponse();
  await handler(jsonRequest(method, route, body), res);
  return { status: res.statusCode, body: res.body, headers: res.headers };
}

test('POST /install answers 202 with a job that polls to done and GET /installed keeps the v2 shape', async () => {
  const handler = createHandler({
    store: createJobStore(),
    install: async ({ targets }) => ({
      ok: true,
      name: 'demo',
      installed: targets.map((target) => ({ target, dir: '/skills/demo', files: 2 })),
      warnings: [],
    }),
    listInstalled: async () => [
      {
        name: 'demo',
        target: 'dsh',
        dir: '/skills/demo',
        repo: 'owner/demo',
        path: null,
        installedAt: '2026-01-01T00:00:00.000Z',
        files: 2,
        owned: true,
        external: false,
      },
    ],
  });

  const accepted = await callRoute(handler, 'POST', '/install', { repo: 'owner/demo' });
  assert.equal(accepted.status, 202);
  assert.equal(accepted.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(accepted.headers['cache-control'], 'no-store');
  assert.equal(accepted.body.ok, true);
  assert.match(accepted.body.job.id, /^job-[0-9a-f]{8}$/);
  assert.deepEqual(accepted.body.job.targets, ['dsh']);
  assert.equal(accepted.body.job.error, null);
  const jobId = accepted.body.job.id;

  await tick();
  const polled = await callRoute(handler, 'GET', '/install/' + jobId);
  assert.equal(polled.status, 200);
  assert.equal(polled.body.job.phase, 'done');
  assert.deepEqual(polled.body.job.installed, [{ target: 'dsh', dir: '/skills/demo', files: 2 }]);

  const settled = await callRoute(handler, 'POST', '/install/' + jobId + '/cancel');
  assert.equal(settled.status, 200);
  assert.equal(settled.body.job.id, jobId);
  assert.equal(settled.body.job.phase, 'done');

  const unknown = await callRoute(handler, 'GET', '/install/job-00000000');
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.body, { ok: false, error: 'unknown-job' });
  const unknownCancel = await callRoute(handler, 'POST', '/install/job-00000000/cancel');
  assert.equal(unknownCancel.status, 404);
  assert.deepEqual(unknownCancel.body, { ok: false, error: 'unknown-job' });

  const installed = await callRoute(handler, 'GET', '/installed');
  assert.equal(installed.status, 200);
  assert.equal(installed.body.items.length, 1);
  assert.deepEqual(installed.body.items[0], {
    name: 'demo',
    target: 'dsh',
    dir: '/skills/demo',
    repo: 'owner/demo',
    path: null,
    installedAt: '2026-01-01T00:00:00.000Z',
    files: 2,
    owned: true,
    external: false,
  });
});

test('POST /install answers 400 for a bad body, repo or target list', async () => {
  const handler = createHandler({ store: createJobStore(), install: async () => ({ ok: true, name: 'demo', installed: [], warnings: [] }) });

  const noBody = await callRoute(handler, 'POST', '/install');
  assert.equal(noBody.status, 400);
  assert.deepEqual(noBody.body, { ok: false, error: 'bad-body' });

  const badRepo = await callRoute(handler, 'POST', '/install', { repo: 'not-a-repo' });
  assert.equal(badRepo.status, 400);
  assert.deepEqual(badRepo.body, { ok: false, error: 'bad-repo' });

  const badTargets = await callRoute(handler, 'POST', '/install', { repo: 'owner/demo', targets: ['wsl'] });
  assert.equal(badTargets.status, 400);
  assert.deepEqual(badTargets.body, { ok: false, error: 'bad-targets' });

  const unknownRoute = await callRoute(handler, 'GET', '/nope');
  assert.equal(unknownRoute.status, 404);
  assert.deepEqual(unknownRoute.body, { ok: false, error: 'not-found' });
});

test('POST /install answers 409 busy once eight jobs are running', async () => {
  const handler = createHandler({ store: createJobStore(), install: () => new Promise(() => {}) });
  for (let index = 0; index < MAX_RUNNING_JOBS; index += 1) {
    const started = await callRoute(handler, 'POST', '/install', { repo: 'owner/demo' });
    assert.equal(started.status, 202);
  }
  const busy = await callRoute(handler, 'POST', '/install', { repo: 'owner/demo' });
  assert.equal(busy.status, 409);
  assert.deepEqual(busy.body, { ok: false, error: 'busy' });
});

test('POST /uninstall maps owned, unowned and missing skills onto 200/409/404', async () => {
  const handler = createHandler({
    uninstall: async ({ name, target }) => {
      if (name === 'owned') return { ok: true, removed: { name, target, dir: '/skills/owned' } };
      if (name === 'handmade') return { ok: false, error: 'not-owned' };
      if (name === 'gone') return { ok: false, error: 'not-found' };
      return { ok: false, error: 'bad-name' };
    },
  });

  const removed = await callRoute(handler, 'POST', '/uninstall', { name: 'owned', target: 'dsh' });
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body, { ok: true, removed: { name: 'owned', target: 'dsh', dir: '/skills/owned' } });

  const unowned = await callRoute(handler, 'POST', '/uninstall', { name: 'handmade', target: 'dsh' });
  assert.equal(unowned.status, 409);
  assert.deepEqual(unowned.body, { ok: false, error: 'not-owned' });

  const missing = await callRoute(handler, 'POST', '/uninstall', { name: 'gone', target: 'dsh' });
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { ok: false, error: 'not-found' });

  const invalid = await callRoute(handler, 'POST', '/uninstall', { name: '../escape', target: 'dsh' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { ok: false, error: 'bad-name' });

  const noBody = await callRoute(handler, 'POST', '/uninstall');
  assert.equal(noBody.status, 400);
  assert.deepEqual(noBody.body, { ok: false, error: 'bad-body' });
});
test('GET /catalog answers with sizeBytes per entry and the warmer coverage', async () => {
  const store = { entries: { 'owner/demo': { bytes: 1048576, at: Date.now() } } };
  const repos = [];
  const warmer = {
    setRepos: (list) => repos.push(list),
    warm: () => Promise.resolve({ fetched: 0, skipped: 0, blocked: false }),
    coverage: () => ({ known: 1, total: 2 }),
  };
  const handler = createHandler({
    sizes: store,
    warmer,
    loadCatalog: async ({ sizes }) =>
      normalizeCatalog({ skills: [{ repo_full_name: 'owner/demo' }, { repo_full_name: 'owner/other' }] }, { sizes }),
  });

  const answer = await callRoute(handler, 'GET', '/catalog');
  assert.equal(answer.status, 200);
  assert.equal(answer.body.entries[0].sizeBytes, 1048576);
  assert.equal(answer.body.entries[1].sizeBytes, null);
  assert.deepEqual(answer.body.sizes, { known: 1, total: 2 });
  assert.deepEqual(repos, [['owner/demo', 'owner/other']]);
});

test('a job folds the archive byte count into its snapshot', async () => {
  const store = createJobStore();
  const created = store.create({
    repo: 'owner/demo',
    targets: ['dsh'],
    run: async ({ onProgress }) => {
      onProgress({ phase: 'download', bytes: 4096, archiveBytes: 76000000 });
      onProgress({ phase: 'inspect', files: 12 });
      return { ok: true, name: 'demo', installed: [], warnings: [] };
    },
  });
  assert.equal(created.job.archiveBytes, null);
  await tick();
  const done = store.get(created.job.id);
  assert.equal(done.archiveBytes, 76000000);
  assert.equal(done.bytes, 4096);
  assert.equal(done.phase, 'done');
});

test('measureDir sums skill files and skips the marker, .git and node_modules', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-measure-'));
  const dir = path.join(workspace, 'skill');
  await fs.mkdir(path.join(dir, '.git'), { recursive: true });
  await fs.mkdir(path.join(dir, 'node_modules'), { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), '12345');
  await fs.writeFile(path.join(dir, 'extra.md'), '1234');
  await fs.writeFile(path.join(dir, MARKER_FILE), 'ignored');
  await fs.writeFile(path.join(dir, '.git', 'config'), 'ignored');
  await fs.writeFile(path.join(dir, 'node_modules', 'a.js'), 'ignored');

  assert.equal(await measureDir(dir), 9);
  assert.equal(await measureDir(path.join(workspace, 'absent')), 0);
  await fs.rm(workspace, { recursive: true, force: true });
});

test('an install reports the archive byte count once the download ends', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-archive-'));
  const archive = await buildArchive(workspace);
  const env = { DSH_VIDEO_SKILLS_CLAUDE_ROOT: path.join(workspace, 'claude-root') };
  const seen = [];
  const result = await installSkill({
    repo: 'owner/demo',
    targets: ['claude'],
    env,
    fetchImpl: stubFetch(archive),
    onProgress: (progress) => {
      if (Number.isFinite(progress.archiveBytes)) seen.push([progress.phase, progress.archiveBytes]);
    },
  });

  const size = (await fs.stat(archive)).size;
  assert.equal(result.ok, true);
  assert.ok(seen.length >= 1, 'no progress carried archiveBytes');
  assert.equal(seen[seen.length - 1][1], size);
  assert.ok(Number.isFinite(seen[seen.length - 1][1]));
  await fs.rm(workspace, { recursive: true, force: true });
});
test('video_skill_search keeps working with unknown sizes while the store is still null', async () => {
  const seen = [];
  const loader = createToolCatalogLoader(undefined, async (options) => {
    seen.push(options.sizes);
    return normalizeCatalog({ skills: [{ repo_full_name: 'owner/demo' }] }, options);
  });
  const [search] = buildVideoTools({
    defineTool: localDefineTool,
    loadCatalog: loader,
    filterEntries,
    installSkill: async () => ({}),
    uninstallSkill: async () => ({}),
  });

  const value = await search.execute({});
  assert.equal(seen[0], null);
  assert.equal(value.items.length, 1);
  assert.equal(value.items[0].sizeBytes, null);
});

test('video_skill_search reports the live size store bytes for every entry', async () => {
  const store = { entries: { 'owner/demo': { bytes: 1048576, at: Date.now() } } };
  const armed = [];
  await startSizes(
    { effect: (factory) => armed.push(factory) },
    {
      loadSizeStore: async () => store,
      createSizeWarmer: () => ({
        warm: () => Promise.resolve({ fetched: 0, skipped: 0, blocked: false }),
        coverage: () => ({ known: 1, total: 2 }),
        setRepos: () => {},
      }),
    },
  );

  const seen = [];
  const loader = createToolCatalogLoader(undefined, async (options) => {
    seen.push(options.sizes);
    return normalizeCatalog(
      { skills: [{ repo_full_name: 'owner/demo' }, { repo_full_name: 'owner/other' }] },
      options,
    );
  });
  const [search] = buildVideoTools({
    defineTool: localDefineTool,
    loadCatalog: loader,
    filterEntries,
    installSkill: async () => ({}),
    uninstallSkill: async () => ({}),
  });

  const value = await search.execute({});
  assert.equal(seen[0], store);
  assert.equal(value.items[0].sizeBytes, 1048576);
  assert.equal(value.items[1].sizeBytes, null);
  assert.equal(armed.length, 1);
});

test('the shared entry schema declares the nullable size field', () => {
  assert.deepEqual(ENTRY_SCHEMA.properties.sizeBytes, { oneOf: [{ type: 'number' }, { type: 'null' }] });
  assert.equal(ENTRY_SCHEMA.additionalProperties, true);
});
