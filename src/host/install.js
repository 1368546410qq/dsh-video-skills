/**
 * Install engine: download a GitHub source archive, locate the skill directory,
 * and copy it into a skill root. Nothing from the downloaded tree is executed.
 * @module dsh-video-skills/install
 */
import { createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { t as listArchive, x as extractArchive } from 'tar';

/** Skill roots a user can install into. */
export const SKILL_TARGETS = ['claude', 'dsh'];
/** Marker written inside every installed skill directory. */
export const MARKER_FILE = '.dsh-video-skills.json';
/** Per-file copy budget; larger files are skipped with a warning. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Download budget for one archive. */
export const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
/** Archive endpoint; HEAD follows the repository default branch. */
export const ARCHIVE_URL_BASE = 'https://codeload.github.com';
/** Environment override for the Claude skill root (printers and tests). */
export const CLAUDE_ROOT_ENV = 'DSH_VIDEO_SKILLS_CLAUDE_ROOT';
/** Environment override for the DSH skill root (printers and tests). */
export const DSH_ROOT_ENV = 'DSH_VIDEO_SKILLS_DSH_ROOT';

/** Normalize one archive entry path: forward slashes, no leading './', no trailing slash. */
export function normalizeArchivePath(candidate) {
  return String(candidate ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

/** Drop the single synthetic root directory codeload puts around a repository. */
export function stripArchiveRoot(normalized, root) {
  if (root === '') return normalized;
  if (normalized === root) return '';
  if (normalized.startsWith(root + '/')) return normalized.slice(root.length + 1);
  return normalized;
}

/** Whether a relative path stays inside the directory it is joined to. */
export function isSafeRelativePath(candidate) {
  const value = typeof candidate === 'string' ? candidate : '';
  if (value === '' || value.includes('\0')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  if (value.includes('\\')) return false;
  return !value.split('/').some((segment) => segment === '..' || segment === '');
}

/** owner/repo in canonical form, or null when the input cannot name a repository. */
export function normalizeRepo(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const parts = trimmed.split('/');
  if (parts.length !== 2) return null;
  const safe = parts.every((part) => /^[A-Za-z0-9._-]+$/.test(part) && part !== '.' && part !== '..');
  return safe ? parts[0] + '/' + parts[1] : null;
}

/** The install targets a request asked for, or null when the request is malformed. */
export function normalizeTargets(input) {
  const requested = input === undefined || input === null ? ['claude'] : input;
  if (!Array.isArray(requested) || requested.length === 0) return null;
  const unique = [];
  for (const target of requested) {
    if (!SKILL_TARGETS.includes(target)) return null;
    if (!unique.includes(target)) unique.push(target);
  }
  return unique;
}

/** Filesystem root of one skill target; environment overrides win. */
export function skillRoot(target, env = process.env) {
  if (target === 'dsh') {
    return env?.[DSH_ROOT_ENV] || path.join(os.homedir(), '.dsh', 'skills');
  }
  return env?.[CLAUDE_ROOT_ENV] || path.join(os.homedir(), '.claude', 'skills');
}

/** A skill directory name made only of a-z0-9 dot underscore dash; empty when nothing usable is left. */
export function sanitizeSkillName(input) {
  const raw = typeof input === 'string' ? input : '';
  const cleaned = raw
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return '';
  return cleaned.slice(0, 64).replace(/[-.]+$/, '');
}

/** The name field of a SKILL.md frontmatter block, or null. */
export function parseFrontmatterName(markdown) {
  const text = typeof markdown === 'string' ? markdown : '';
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (block === null) return null;
  const line = /^name\s*:\s*(.+)$/m.exec(block[1]);
  if (line === null) return null;
  const value = line[1].trim().replace(/^['"]+/, '').replace(/['"]+$/, '').trim();
  return value === '' ? null : value;
}

/** Why one entry must not be copied, or null when it may be. */
export function skipReason(relativePath, size) {
  const segments = String(relativePath ?? '').replace(/\\/g, '/').split('/');
  if (segments.includes('.git')) return 'git';
  if (segments.includes('node_modules')) return 'node_modules';
  if (Number(size) > MAX_FILE_BYTES) return 'too-large';
  return null;
}

/** The shallowest directory holding a SKILL.md; an empty string means the archive root. */
export function pickSkillDir(files, repoName = '') {
  const candidates = [];
  for (const file of files ?? []) {
    const normalized = normalizeArchivePath(file);
    if (normalized === '') continue;
    const segments = normalized.split('/');
    if (segments[segments.length - 1].toLowerCase() !== 'skill.md') continue;
    const dir = segments.slice(0, -1).join('/');
    candidates.push({
      dir,
      depth: segments.length - 1,
      base: segments.length > 1 ? segments[segments.length - 2] : '',
    });
  }
  if (candidates.length === 0) return null;
  const shallowest = Math.min(...candidates.map((candidate) => candidate.depth));
  const tier = candidates.filter((candidate) => candidate.depth === shallowest);
  const named = repoName === '' ? [] : tier.filter((candidate) => candidate.base === repoName);
  const pool = (named.length > 0 ? named : tier).slice().sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
  return pool[0].dir;
}

/** The skill directory for one request: an explicit path, else the shallowest SKILL.md. */
export function resolveSkillDir(input = {}) {
  const requested = input.requested;
  if (typeof requested === 'string' && requested.trim() !== '') {
    const normalized = normalizeArchivePath(requested.trim().replace(/^\.\/+/, ''));
    if (normalized === '' || normalized === '.') return '';
    return isSafeRelativePath(normalized) ? normalized : null;
  }
  return pickSkillDir(input.files ?? [], input.repoName ?? '');
}

/** What to do with an existing target directory. */
export function resolveConflict({ dirExists, marker, repo }) {
  if (!dirExists) return 'install';
  if (marker !== null && marker !== undefined && marker.repo === repo) return 'overwrite';
  return 'exists';
}

/** Read one install marker, or null when it is absent or unreadable. */
export async function readMarker(dir) {
  try {
    const marker = JSON.parse(await fs.readFile(path.join(dir, MARKER_FILE), 'utf8'));
    return marker && typeof marker === 'object' ? marker : null;
  } catch {
    return null;
  }
}

/** Count the regular files a directory tree holds. */
export async function countFiles(dir) {
  const stack = [dir];
  let total = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name));
      else if (entry.isFile()) total += 1;
    }
  }
  return total;
}

/** Download one repository archive into the workspace; returns the byte count. */
async function downloadArchive(repo, destination, fetchImpl) {
  const response = await fetchImpl(ARCHIVE_URL_BASE + '/' + repo + '/tar.gz/HEAD', {
    headers: { 'user-agent': 'dsh-video-skills' },
  });
  if (!response.ok || response.body === null || response.body === undefined) {
    throw new Error('archive fetch failed: HTTP ' + response.status);
  }
  let total = 0;
  const budget = new Transform({
    transform(chunk, _encoding, done) {
      total += chunk.length;
      if (total > MAX_ARCHIVE_BYTES) done(new Error('archive exceeds the download budget'));
      else done(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), budget, createWriteStream(destination));
  return total;
}

/** List the archive: its synthetic root directory and every file path below it. */
async function inspectArchive(file) {
  const entries = [];
  await listArchive({
    file,
    strict: true,
    onReadEntry: (entry) => entries.push({ path: normalizeArchivePath(entry.path), type: entry.type }),
  });
  let root = '';
  for (const entry of entries) {
    if (entry.path === '') continue;
    const separator = entry.path.indexOf('/');
    if (separator !== -1) {
      root = entry.path.slice(0, separator);
      break;
    }
  }
  const files = [];
  for (const entry of entries) {
    const relative = stripArchiveRoot(entry.path, root);
    if (relative === '') continue;
    if (!isSafeRelativePath(relative)) throw new Error('archive entry escapes the extraction root: ' + entry.path);
    if (entry.type === 'File') files.push(relative);
  }
  return { root, files };
}

/** Extract the entries that belong to one scope; an empty scope means the whole root. */
async function extractScope(file, root, scope, destination) {
  await fs.mkdir(destination, { recursive: true });
  await extractArchive({
    file,
    cwd: destination,
    strict: true,
    filter: (entryPath) => {
      const relative = stripArchiveRoot(normalizeArchivePath(entryPath), root);
      if (scope === '') return true;
      return relative === scope || relative.startsWith(scope + '/');
    },
  });
}

/** Copy one skill directory, applying the skip rules; returns the copied file count. */
async function copySkillDir(sourceDir, destinationDir, warnings) {
  const stack = [['', sourceDir]];
  let copied = 0;
  while (stack.length > 0) {
    const [prefix, dir] = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const relative = prefix === '' ? entry.name : prefix + '/' + entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const reason = skipReason(relative, 0);
        if (reason === null) stack.push([relative, absolute]);
        else warnings.push('skipped:' + reason + ':' + relative + '/');
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = await fs.stat(absolute);
      const reason = skipReason(relative, stats.size);
      if (reason !== null) {
        warnings.push('skipped:' + reason + ':' + relative);
        continue;
      }
      const target = path.join(destinationDir, ...relative.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(absolute, target);
      copied += 1;
    }
  }
  return copied;
}

/** Write the marker that makes a later install of the same repo an overwrite. */
async function writeMarker(dir, marker) {
  await fs.writeFile(path.join(dir, MARKER_FILE), JSON.stringify(marker, null, 2) + '\n', 'utf8');
}

/** The name field of the SKILL.md at one directory, or an empty string. */
async function readSkillName(dir) {
  try {
    return parseFrontmatterName(await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8')) ?? '';
  } catch {
    return '';
  }
}

/** Skill directories installed under the two target roots. */
export async function listInstalled(options = {}) {
  const env = options.env ?? process.env;
  const items = [];
  for (const target of SKILL_TARGETS) {
    const root = skillRoot(target, env);
    let names;
    try {
      names = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of names) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const marker = await readMarker(dir);
      if (marker === null) continue;
      items.push({
        name: entry.name,
        target,
        dir,
        repo: typeof marker.repo === 'string' ? marker.repo : null,
        installedAt: typeof marker.installedAt === 'string' ? marker.installedAt : null,
      });
    }
  }
  return items;
}

/**
 * Install one repository skill into one or more skill roots.
 * Refuses rather than overwriting a directory this plugin did not create.
 */
export async function installSkill(options = {}) {
  const {
    repo,
    path: requestedPath = null,
    name: requestedName = null,
    targets = ['claude'],
    fetchImpl = globalThis.fetch,
    env = process.env,
    now = new Date(),
  } = options;

  const normalizedRepo = normalizeRepo(repo);
  if (normalizedRepo === null) return { ok: false, error: 'bad-repo' };
  const targetList = normalizeTargets(targets);
  if (targetList === null) return { ok: false, error: 'bad-targets' };

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-video-skills-'));
  try {
    const archive = path.join(workspace, 'HEAD.tar.gz');
    try {
      await downloadArchive(normalizedRepo, archive, fetchImpl);
    } catch (error) {
      return { ok: false, error: 'fetch-failed', message: error instanceof Error ? error.message : String(error) };
    }

    let listing;
    try {
      listing = await inspectArchive(archive);
    } catch (error) {
      return { ok: false, error: 'fetch-failed', message: error instanceof Error ? error.message : String(error) };
    }

    const repoName = normalizedRepo.split('/')[1];
    const skillDir = resolveSkillDir({ files: listing.files, repoName, requested: requestedPath });
    if (skillDir === null) return { ok: false, error: 'no-skill-md' };

    const extractRoot = path.join(workspace, 'tree');
    await extractScope(archive, listing.root, skillDir, extractRoot);
    const sourceDir =
      skillDir === ''
        ? path.join(extractRoot, listing.root)
        : path.join(extractRoot, listing.root, ...skillDir.split('/'));

    let skillMdPresent = true;
    try {
      await fs.access(path.join(sourceDir, 'SKILL.md'));
    } catch {
      skillMdPresent = false;
    }
    if (!skillMdPresent) return { ok: false, error: 'no-skill-md' };

    const fallbackName = skillDir === '' ? repoName : skillDir.split('/').pop();
    const installedName =
      sanitizeSkillName(requestedName) ||
      sanitizeSkillName(await readSkillName(sourceDir)) ||
      sanitizeSkillName(fallbackName) ||
      'skill';

    const destinations = targetList.map((target) => ({
      target,
      dir: path.join(skillRoot(target, env), installedName),
    }));

    for (const destination of destinations) {
      let dirExists = true;
      try {
        await fs.access(destination.dir);
      } catch {
        dirExists = false;
      }
      const marker = dirExists ? await readMarker(destination.dir) : null;
      if (resolveConflict({ dirExists, marker, repo: normalizedRepo }) === 'exists') {
        return { ok: false, error: 'exists', dir: destination.dir };
      }
    }

    const warnings = [];
    const installed = [];
    for (const destination of destinations) {
      await fs.mkdir(destination.dir, { recursive: true });
      const files = await copySkillDir(sourceDir, destination.dir, warnings);
      await writeMarker(destination.dir, {
        repo: normalizedRepo,
        path: requestedPath ?? null,
        ref: 'HEAD',
        installedAt: now.toISOString(),
        files,
      });
      installed.push({ target: destination.target, dir: destination.dir, files });
    }

    return { ok: true, name: installedName, installed, warnings: [...new Set(warnings)] };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}
