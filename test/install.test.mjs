import assert from 'node:assert/strict';
import { createReadStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { create as createArchive } from 'tar';

import {
  installSkill,
  isSafeRelativePath,
  MARKER_FILE,
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
} from '../src/host/install.js';

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

test('normalizeTargets defaults to claude and de-duplicates', () => {
  assert.deepEqual(normalizeTargets(undefined), ['claude']);
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
