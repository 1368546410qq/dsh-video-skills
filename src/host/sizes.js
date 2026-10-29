/**
 * Repository size cache: the GitHub repository API reports one size in
 * kilobytes, cached per user for a week, with a background warmer that respects
 * the unauthenticated rate limit. Nothing here downloads a repository.
 * @module dsh-video-skills/sizes
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Per-user size cache, shared by every DSH profile of this user. */
export const SIZES_FILE = path.join(os.homedir(), '.dsh', 'video-skills', 'sizes.json');
/** How long one fetched size stays usable, in milliseconds. */
export const SIZE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Repository metadata endpoint; its `size` field counts kilobytes. */
export const GITHUB_REPO_API = 'https://api.github.com/repos/';
/** Bytes in one reported size unit. */
const BYTES_PER_UNIT = 1024;
/** Backoff when a throttling response carries no reset header, in milliseconds. */
const RATE_LIMIT_FALLBACK_MS = 10 * 60 * 1000;
/** Remaining quota at or below which the warmer stops a batch. */
const RATE_LIMIT_FLOOR = 5;
/** Consecutive transport failures that end a batch. */
const MAX_FAILURES = 3;

/** One cached size in bytes, or null when it is absent, stale or known missing. */
export function sizeOf(store, repo, now = Date.now()) {
  if (store === null || typeof store !== 'object') return null;
  if (typeof repo !== 'string' || repo === '') return null;
  const entries = store.entries;
  if (entries === null || typeof entries !== 'object') return null;
  const entry = entries[repo];
  if (entry === null || typeof entry !== 'object') return null;
  if (entry.missing === true) return null;
  if (!Number.isFinite(entry.bytes) || entry.bytes <= 0) return null;
  if (!Number.isFinite(entry.at) || now - entry.at > SIZE_TTL_MS) return null;
  return Number(entry.bytes);
}

/** Read the cache; a missing, unreadable or malformed file is an empty store. */
export async function loadSizeStore({ file = SIZES_FILE } = {}) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    const entries = parsed?.entries;
    if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) return { entries: {} };
    return { entries: { ...entries } };
  } catch {
    return { entries: {} };
  }
}

/** Persist the cache through a temporary file; failures are ignored. */
export async function saveSizeStore(store, { file = SIZES_FILE } = {}) {
  try {
    const entries = store?.entries ?? {};
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    await fs.writeFile(temporary, JSON.stringify({ entries }), 'utf8');
    await fs.rename(temporary, file);
  } catch {
    /* the size cache is best effort */
  }
}

/** One response header, read from either a Headers instance or a plain object. */
function headerOf(response, name) {
  const headers = response?.headers;
  if (headers === null || headers === undefined) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const direct = headers[name] ?? headers[name.toLowerCase()];
  return typeof direct === 'string' ? direct : null;
}

/** Epoch milliseconds at which a throttled window reopens. */
function resetAt(response, now) {
  const seconds = Number(headerOf(response, 'x-ratelimit-reset'));
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000 + 1000;
  return now + RATE_LIMIT_FALLBACK_MS;
}

/** Whether a response reports the rate limit as (nearly) spent. */
function throttledBy(response) {
  const remaining = Number(headerOf(response, 'x-ratelimit-remaining'));
  return Number.isFinite(remaining) && remaining <= RATE_LIMIT_FLOOR;
}

/** Request headers for one repository lookup. */
function requestHeaders(token) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-video-skills',
  };
  if (typeof token === 'string' && token !== '') headers.authorization = 'Bearer ' + token;
  return headers;
}

/**
 * Create the background warmer.
 *
 * warm(count) fetches at most `count` due repositories and answers
 * { fetched, skipped, blocked } — `fetched` counts the store entries this
 * batch wrote (a 404 counts: it is recorded as missing), `skipped` counts the
 * due repositories the batch left alone, `blocked` says the rate limit ended
 * it. coverage() answers { known, total } over the current repository list.
 */
export function createSizeWarmer(options = {}) {
  const file = options.file ?? SIZES_FILE;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const clock = typeof options.clock === 'function' ? options.clock : () => Date.now();
  const store = options.store ?? { entries: {} };
  if (store.entries === null || typeof store.entries !== 'object') store.entries = {};
  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null;
  let repos = [];
  let blockedUntil = 0;
  let warming = false;

  /** Replace the repository list the warmer works through. */
  function setRepos(list) {
    const next = Array.isArray(list) ? list : [];
    const unique = [];
    for (const repo of next) {
      if (typeof repo === 'string' && repo !== '' && !unique.includes(repo)) unique.push(repo);
    }
    repos = unique;
  }

  /** Repositories whose cached size is absent, unreadable or past its TTL. */
  function due(now) {
    const wanted = [];
    for (const repo of repos) {
      const entry = store.entries[repo];
      if (entry === null || typeof entry !== 'object' || !Number.isFinite(entry.at)) {
        wanted.push(repo);
        continue;
      }
      if (now - entry.at > SIZE_TTL_MS) wanted.push(repo);
    }
    return wanted;
  }

  /** How many repositories carry a usable size. */
  function coverage() {
    const now = clock();
    let known = 0;
    for (const repo of repos) {
      if (sizeOf(store, repo, now) !== null) known += 1;
    }
    return { known, total: repos.length };
  }

  /** Fetch one repository; returns 'written', 'retry' or 'stop'. */
  async function fetchOne(repo) {
    let response;
    try {
      response = await fetchImpl(GITHUB_REPO_API + repo, { headers: requestHeaders(token) });
    } catch {
      return 'retry';
    }
    const status = Number(response?.status);
    if (status === 403 || status === 429) {
      blockedUntil = Math.max(blockedUntil, resetAt(response, clock()));
      return 'stop';
    }
    if (status === 200) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        return 'retry';
      }
      const size = Number(payload?.size);
      if (Number.isFinite(payload?.size) && size >= 0) store.entries[repo] = { bytes: size * BYTES_PER_UNIT, at: clock() };
      else store.entries[repo] = { bytes: 0, missing: true, at: clock() };
    } else if (status === 404) {
      store.entries[repo] = { bytes: 0, missing: true, at: clock() };
    } else {
      return 'retry';
    }
    if (throttledBy(response)) {
      blockedUntil = Math.max(blockedUntil, resetAt(response, clock()));
      return 'stop';
    }
    return 'written';
  }

  /** Fetch one bounded batch of due repositories. */
  async function warm(count = 5) {
    if (warming) return { fetched: 0, skipped: 0, blocked: true };
    const now = clock();
    if (now < blockedUntil) return { fetched: 0, skipped: 0, blocked: true };
    const limit = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
    const target = due(now).slice(0, limit);
    warming = true;
    let fetched = 0;
    let skipped = 0;
    let failures = 0;
    let blocked = false;
    let dirty = false;
    try {
      for (let index = 0; index < target.length; index += 1) {
        const outcome = await fetchOne(target[index]);
        if (outcome === 'written') {
          fetched += 1;
          failures = 0;
          dirty = true;
          continue;
        }
        if (outcome === 'stop') {
          blocked = true;
          skipped += target.length - index - 1;
          break;
        }
        failures += 1;
        if (failures >= MAX_FAILURES) {
          skipped += target.length - index - 1;
          break;
        }
      }
    } finally {
      warming = false;
    }
    if (dirty) await saveSizeStore(store, { file });
    return { fetched, skipped, blocked };
  }

  setRepos(options.repos);

  return { warm, coverage, setRepos };
}
