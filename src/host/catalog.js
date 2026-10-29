/**
 * Catalog access: fetch the upstream skill list, cache it for 24 h, fall back to
 * the bundled snapshot when the network or the cache is unusable.
 * @module dsh-video-skills/catalog
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Upstream JSON the catalog is read from. */
export const CATALOG_URL = 'https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/data/skills.json';
/** Human-facing project page reported as the payload source. */
export const CATALOG_SOURCE = 'https://github.com/zhuyansen/awesome-claude-video-skills';
/** Preview image prefix; one jpg per repo, never bundled. */
export const PREVIEW_URL_BASE = 'https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews';
/** Cache lifetime; older copies are refetched. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Network budget for one catalog fetch. */
export const FETCH_TIMEOUT_MS = 15_000;
/** Bundled snapshot shipped inside the package. */
export const SNAPSHOT_FILE = fileURLToPath(new URL('../../data/skills.json', import.meta.url));
/** Per-user cache file, shared by every DSH profile of this user. */
export const CACHE_FILE = path.join(os.homedir(), '.dsh', 'video-skills', 'catalog.json');

/** Preview image URL for one `owner/repo`. */
export function previewUrl(repo) {
  return `${PREVIEW_URL_BASE}/${String(repo).replace('/', '__')}.jpg`;
}

/** Map one upstream record onto the public entry shape. */
export function mapEntry(raw) {
  const repo = typeof raw?.repo_full_name === 'string' ? raw.repo_full_name : '';
  return {
    repo,
    path: typeof raw?.path === 'string' && raw.path !== '' ? raw.path : null,
    stars: Number.isFinite(raw?.stars) ? raw.stars : 0,
    description: typeof raw?.description === 'string' ? raw.description : '',
    kind: typeof raw?.kind === 'string' && raw.kind !== '' ? raw.kind : 'general',
    grade: raw?.security_grade === 'caution' ? 'caution' : 'safe',
    language: typeof raw?.language === 'string' && raw.language !== '' ? raw.language : null,
    license: typeof raw?.license === 'string' && raw.license !== '' ? raw.license : null,
    previewUrl: repo === '' ? null : previewUrl(repo),
  };
}

/** Shape one upstream payload into the response body; entries keep upstream order. */
export function normalizeCatalog(payload, { stale = false } = {}) {
  const skills = Array.isArray(payload) ? payload : Array.isArray(payload?.skills) ? payload.skills : [];
  const entries = skills.map(mapEntry);
  return {
    ok: true,
    generated: typeof payload?.generated === 'string' ? payload.generated : null,
    source: CATALOG_SOURCE,
    stale,
    count: entries.length,
    entries,
  };
}

/** Read the cached payload when it is still inside its TTL. */
async function readCache(now) {
  try {
    const cached = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    if (!cached || typeof cached.fetchedAt !== 'number' || !cached.payload) return null;
    if (now - cached.fetchedAt > CACHE_TTL_MS) return null;
    const body = normalizeCatalog(cached.payload);
    return body.count > 0 ? body : null;
  } catch {
    return null;
  }
}

/** Persist one fetched payload; a failure here only costs the next fetch. */
async function writeCache(payload, now) {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify({ fetchedAt: now, payload }), 'utf8');
  } catch {
    /* cache write is best effort */
  }
}

/** Fetch the upstream payload; any transport or shape problem rejects. */
async function fetchUpstream(fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(CATALOG_URL, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`catalog fetch failed: HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.skills) || payload.skills.length === 0) {
      throw new Error('catalog payload carries no skills array');
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

/** Read the bundled snapshot, marked stale. */
export async function readSnapshot() {
  const payload = JSON.parse(await fs.readFile(SNAPSHOT_FILE, 'utf8'));
  return normalizeCatalog(payload, { stale: true });
}

/**
 * The catalog for one request: cache first, then network, then snapshot.
 * Never rejects; an offline host gets the snapshot with `stale: true`.
 */
export async function loadCatalog(options = {}) {
  const { fetchImpl = globalThis.fetch, force = false, now = Date.now() } = options;
  if (!force) {
    const cached = await readCache(now);
    if (cached) return cached;
  }
  try {
    const payload = await fetchUpstream(fetchImpl);
    await writeCache(payload, now);
    return normalizeCatalog(payload);
  } catch {
    return readSnapshot();
  }
}

/** Forced refetch for the refresh action; rejects so the caller can answer 502. */
export async function refreshCatalog(options = {}) {
  const { fetchImpl = globalThis.fetch, now = Date.now() } = options;
  const payload = await fetchUpstream(fetchImpl);
  await writeCache(payload, now);
  return normalizeCatalog(payload);
}

/**
 * Filter + rank entries for the search surface: query over repo and
 * description, exact facets, stars floor, and a bounded page.
 */
export function filterEntries(entries, params = {}) {
  const query = typeof params.query === 'string' ? params.query.trim().toLowerCase() : '';
  const kind = typeof params.kind === 'string' && params.kind !== '' ? params.kind : null;
  const grade = typeof params.grade === 'string' && params.grade !== '' ? params.grade : null;
  const license = typeof params.license === 'string' && params.license !== '' ? params.license.toLowerCase() : null;
  const minStars = Number.isFinite(params.minStars) ? Number(params.minStars) : null;
  const requested = Number.isFinite(params.limit) ? Math.trunc(Number(params.limit)) : 20;
  const limit = Math.min(Math.max(requested, 1), 100);

  const items = [];
  for (const entry of entries) {
    if (kind !== null && entry.kind !== kind) continue;
    if (grade !== null && entry.grade !== grade) continue;
    if (license !== null && (entry.license ?? '').toLowerCase() !== license) continue;
    if (minStars !== null && entry.stars < minStars) continue;
    if (query !== '' && !`${entry.repo} ${entry.description}`.toLowerCase().includes(query)) continue;
    items.push(entry);
  }
  items.sort((a, b) => b.stars - a.stars);
  return { count: items.length, items: items.slice(0, limit) };
}
