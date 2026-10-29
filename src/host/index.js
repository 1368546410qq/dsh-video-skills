/**
 * Host entry: one prefix HTTP route under /video-skills/api/v1 and three model
 * tools. The route works even when the tool registry is not composed.
 * @module dsh-video-skills
 */
import { filterEntries, loadCatalog, refreshCatalog } from './catalog.js';
import { installSkill, listInstalled, normalizeRepo, normalizeTargets, uninstallSkill } from './install.js';
import { createJobStore } from './jobs.js';
import { createSizeWarmer, loadSizeStore } from './sizes.js';
import { buildVideoTools, resolveDefineTool } from './tool-schema.js';

/** Cordis plugin name. */
export const name = 'video-skills';
/** Nothing is required: the tools work in any composition, the route waits for a web server. */
export const inject = [];
/** Single prefix route the client talks to. */
export const API_BASE = '/video-skills/api/v1';
/** Largest JSON body accepted on POST routes. */
export const MAX_BODY_BYTES = 64 * 1024;
/** Background repository-size prefetch interval, in milliseconds. */
export const SIZE_WARM_INTERVAL_MS = 60 * 1000;
/** Repositories prefetched per background batch. */
export const SIZE_WARM_BATCH = 5;

/** Write one JSON response. */
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-length', Buffer.byteLength(text));
  res.end(text);
}

/** Read one JSON body, returning null for an empty, oversized or malformed one. */
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/** A JSON object body, or null when the request carried something else. */
function objectBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  return body;
}

/** HTTP status for one uninstall error code. */
function uninstallStatus(error) {
  if (error === 'not-found') return 404;
  if (error === 'not-owned') return 409;
  return 400;
}

/**
 * Build the route handler around its services, so a test can drive it with
 * stubs and the plugin mounts the real ones.
 * @param options.store - job table; a fresh one by default.
 * @param options.install - install engine.
 * @param options.uninstall - uninstall engine.
 * @param options.listInstalled - installed-skill inventory.
 * @param options.loadCatalog - cached catalog loader.
 * @param options.refreshCatalog - forced catalog refetch.
 * @param options.sizeState - live size cache holder; store and warmer fill it.
 * @param options.sizes - size store, when the caller owns the holder itself.
 * @param options.warmer - size warmer reporting the response coverage.
 */
export function createHandler(services = {}) {
  const store = services.store ?? createJobStore();
  const install = services.install ?? installSkill;
  const uninstall = services.uninstall ?? uninstallSkill;
  const inventory = services.listInstalled ?? listInstalled;
  const load = services.loadCatalog ?? loadCatalog;
  const refresh = services.refreshCatalog ?? refreshCatalog;
  const sizeState = services.sizeState ?? { store: services.sizes ?? null, warmer: services.warmer ?? null };

  /** Route dispatch for every request under API_BASE. */
  async function handle(req, res) {
    const method = String(req.method ?? 'GET').toUpperCase();
    const pathname = new URL(String(req.url ?? '/'), 'http://localhost').pathname;
    const route = pathname.slice(API_BASE.length).replace(/\/+$/, '') || '/';

    if (route === '/catalog' && method === 'GET') {
      const catalog = await load({ sizes: sizeState.store ?? null });
      const warmer = sizeState.warmer ?? null;
      if (warmer !== null && Array.isArray(catalog?.entries)) {
        warmer.setRepos(catalog.entries.map((entry) => entry.repo));
        // A cold start knows no repos until the first catalog read, so the read
        // itself kicks a batch; repeats are absorbed by the warmer's own flight.
        warmer.warm(SIZE_WARM_BATCH).catch(() => {});
      }
      const coverage = warmer === null ? null : warmer.coverage();
      const body = coverage === null || catalog === null || typeof catalog !== 'object' ? catalog : { ...catalog, sizes: coverage };
      sendJson(res, 200, body);
      return;
    }
    if (route === '/installed' && method === 'GET') {
      sendJson(res, 200, { ok: true, items: await inventory() });
      return;
    }
    if (route === '/install' && method === 'POST') {
      const body = objectBody(await readJsonBody(req));
      if (body === null) {
        sendJson(res, 400, { ok: false, error: 'bad-body' });
        return;
      }
      const repo = normalizeRepo(body.repo);
      if (repo === null) {
        sendJson(res, 400, { ok: false, error: 'bad-repo' });
        return;
      }
      const targets = normalizeTargets(body.targets);
      if (targets === null) {
        sendJson(res, 400, { ok: false, error: 'bad-targets' });
        return;
      }
      const created = store.create({
        repo,
        targets,
        run: ({ signal, onProgress }) =>
          install({ repo, path: body.path ?? null, name: body.name ?? null, targets, signal, onProgress }),
      });
      if (created.ok !== true) {
        sendJson(res, 409, { ok: false, error: 'busy' });
        return;
      }
      sendJson(res, 202, { ok: true, job: created.job });
      return;
    }
    const pollRoute = /^\/install\/([^/]+)$/.exec(route);
    if (pollRoute !== null && method === 'GET') {
      const job = store.get(pollRoute[1]);
      if (job === null) {
        sendJson(res, 404, { ok: false, error: 'unknown-job' });
        return;
      }
      sendJson(res, 200, { ok: true, job });
      return;
    }
    const cancelRoute = /^\/install\/([^/]+)\/cancel$/.exec(route);
    if (cancelRoute !== null && method === 'POST') {
      const job = store.cancel(cancelRoute[1]);
      if (job === null) {
        sendJson(res, 404, { ok: false, error: 'unknown-job' });
        return;
      }
      sendJson(res, 200, { ok: true, job });
      return;
    }
    if (route === '/uninstall' && method === 'POST') {
      const body = objectBody(await readJsonBody(req));
      if (body === null) {
        sendJson(res, 400, { ok: false, error: 'bad-body' });
        return;
      }
      const result = await uninstall({ name: body.name, target: body.target });
      if (result.ok === true) {
        sendJson(res, 200, { ok: true, removed: result.removed });
        return;
      }
      sendJson(res, uninstallStatus(result.error), { ok: false, error: result.error });
      return;
    }
    if (route === '/refresh' && method === 'POST') {
      try {
        const catalog = await refresh();
        sendJson(res, 200, { ok: true, generated: catalog.generated, count: catalog.count, stale: false });
      } catch (error) {
        sendJson(res, 502, {
          ok: false,
          error: 'fetch-failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    sendJson(res, 404, { ok: false, error: 'not-found' });
  }

  /** Route handler with every failure contained as JSON. */
  return async function handler(req, res) {
    try {
      await handle(req, res);
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          ok: false,
          error: 'internal',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}

/** Size cache the route reads; the store and the warmer fill it once loaded. */
const sizeState = { store: null, warmer: null };

/** The handler the web server mounts, backed by the real services. */
const handler = createHandler({ sizeState });

/** Run one background batch; the warmer itself never rejects on a transport failure. */
function warmSizes() {
  if (sizeState.warmer === null) return;
  sizeState.warmer.warm(SIZE_WARM_BATCH).catch(() => {});
}

/**
 * Load the per-user size cache and start the background prefetch inside the
 * composition's effect scope, so the timer dies with the plugin.
 *
 * The first batch runs before the interval is armed: a restarted host would
 * otherwise show an empty size column for a whole minute.
 *
 * @param scope - composition scope carrying `effect`, when the host has one.
 * @param services - seams for tests; production composes the real collaborators.
 * @param services.loadSizeStore - size cache reader.
 * @param services.createSizeWarmer - warmer factory.
 */
export async function startSizes(scope, services = {}) {
  const readSizes = services.loadSizeStore ?? loadSizeStore;
  const buildWarmer = services.createSizeWarmer ?? createSizeWarmer;
  const store = await readSizes();
  sizeState.store = store;
  sizeState.warmer = buildWarmer({ store });
  warmSizes();
  if (typeof scope?.effect === 'function') {
    scope.effect(() => {
      const timer = setInterval(warmSizes, SIZE_WARM_INTERVAL_MS);
      return () => clearInterval(timer);
    });
    return;
  }
  const timer = setInterval(warmSizes, SIZE_WARM_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * Build the catalog loader the tools share with the route.
 *
 * The store is read at call time, so a tool call that lands before the size
 * cache finished loading still answers — with unknown sizes instead of a throw.
 *
 * @param readStore - store accessor; defaults to the live size state.
 * @param load - catalog loader; defaults to the cached loader.
 */
export function createToolCatalogLoader(readStore = () => sizeState.store, load = loadCatalog) {
  return () => load({ sizes: readStore() ?? null });
}

/** Register the three tools when the host composed a tool registry. */
async function registerTools(ctx) {
  let tools;
  try {
    tools = (typeof ctx?.get === 'function' ? ctx.get('tools') : undefined) ?? ctx?.tools;
  } catch {
    return false;
  }
  if (!tools || typeof tools.register !== 'function') return false;
  const defineTool = await resolveDefineTool();
  const definitions = buildVideoTools({
    defineTool,
    loadCatalog: createToolCatalogLoader(),
    filterEntries,
    installSkill,
    uninstallSkill,
  });
  for (const definition of definitions) tools.register(definition);
  return true;
}

/** Mount the prefix route once a web server is composed. */
function mountRoutes(scope) {
  const webServer = scope?.webServer ?? (typeof scope?.get === 'function' ? scope.get('webServer') : undefined);
  if (!webServer || typeof webServer.register !== 'function') return;
  const registerRoute = () => webServer.register({ kind: 'prefix', path: API_BASE, handler });
  if (typeof scope.effect === 'function') scope.effect(registerRoute);
  else registerRoute();
}

/**
 * Compose the plugin against the host context.
 *
 * The two halves have different requirements: the model tools are useful in
 * every composition (CLI, TUI, web), while the HTTP route only exists where a
 * web server is composed, so each waits for its own service instead of making
 * the web server a precondition for the whole plugin.
 */
export function apply(ctx) {
  startSizes(ctx).catch(() => {
    /* an unreadable cache only costs sizes; the route still answers */
  });
  if (typeof ctx?.inject === 'function') {
    ctx.inject(['tools'], (scope) => { registerTools(scope).catch(() => {}); });
    ctx.inject(['webServer'], mountRoutes);
    return;
  }
  mountRoutes(ctx);
  registerTools(ctx).catch(() => {});
}
