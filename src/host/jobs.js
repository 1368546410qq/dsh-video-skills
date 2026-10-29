/**
 * In-memory install job table: one AbortController per job, a bounded number of
 * retained jobs, and progress folded into a JSON-safe snapshot for the HTTP
 * layer. Nothing here touches the filesystem.
 * @module dsh-video-skills/jobs
 */
import { randomBytes } from 'node:crypto';

/** Jobs kept in memory at once; the oldest is dropped beyond this. */
export const MAX_JOBS = 32;
/** How long a finished job stays readable, in milliseconds. */
export const JOB_TTL_MS = 10 * 60 * 1000;
/** Jobs allowed to run at once before a new request is answered busy. */
export const MAX_RUNNING_JOBS = 8;

/** Phases a job never leaves again. */
const TERMINAL_PHASES = new Set(['done', 'error', 'cancelled']);

/** Whether one phase is final. */
export function isTerminalPhase(phase) {
  return TERMINAL_PHASES.has(phase);
}

/** One JSON-safe copy of a job, so a caller cannot mutate the table. */
function copyJob(job) {
  return {
    id: job.id,
    repo: job.repo,
    targets: job.targets.slice(),
    phase: job.phase,
    bytes: job.bytes,
    files: job.files,
    copied: job.copied,
    name: job.name,
    installed: job.installed.map((entry) => ({ target: entry.target, dir: entry.dir, files: entry.files })),
    warnings: job.warnings.slice(),
    error: job.error,
    message: job.message,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  };
}

/**
 * Create one job table.
 *
 * create(options) starts a job and answers { ok: true, job } or { ok: false,
 * error: 'busy' }; get(id) returns a snapshot or null; cancel(id) aborts a
 * running job and returns the snapshot unchanged for a settled one; list()
 * returns every retained job.
 */
export function createJobStore(options = {}) {
  const clock = typeof options.now === 'function' ? options.now : () => Date.now();
  const maxJobs = Number.isInteger(options.maxJobs) ? options.maxJobs : MAX_JOBS;
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : JOB_TTL_MS;
  const maxRunning = Number.isInteger(options.maxRunning) ? options.maxRunning : MAX_RUNNING_JOBS;
  const records = new Map();

  /** Drop finished jobs past the retention window. */
  function sweep() {
    const at = clock();
    for (const [id, record] of records) {
      if (record.finishedAt !== null && at - record.finishedAt >= ttlMs) records.delete(id);
    }
  }

  /** Keep the table bounded, dropping the oldest settled job first. */
  function prune() {
    while (records.size > maxJobs) {
      let victim = records.keys().next().value;
      for (const [id, record] of records) {
        if (isTerminalPhase(record.job.phase)) {
          victim = id;
          break;
        }
      }
      records.delete(victim);
    }
  }

  /** How many jobs are still running. */
  function runningCount() {
    let total = 0;
    for (const record of records.values()) {
      if (!isTerminalPhase(record.job.phase)) total += 1;
    }
    return total;
  }

  /** Fold one engine progress event into the job record. */
  function applyProgress(record, progress) {
    const job = record.job;
    if (isTerminalPhase(job.phase) || progress === null || typeof progress !== 'object') return;
    if (typeof progress.phase === 'string') job.phase = progress.phase;
    if (Number.isFinite(progress.bytes)) job.bytes = Number(progress.bytes);
    if (Number.isFinite(progress.files)) job.files = Number(progress.files);
    if (Number.isFinite(progress.copied)) job.copied = Number(progress.copied);
    job.updatedAt = new Date(clock()).toISOString();
  }

  /** Record the engine result as the final job state. */
  function settle(record, result) {
    const job = record.job;
    if (result !== null && typeof result === 'object' && result.ok === true) {
      job.phase = 'done';
      job.name = typeof result.name === 'string' ? result.name : null;
      job.installed = Array.isArray(result.installed)
        ? result.installed.map((entry) => ({ target: entry.target, dir: entry.dir, files: entry.files }))
        : [];
      job.warnings = Array.isArray(result.warnings) ? result.warnings.slice() : [];
      job.error = null;
      job.message = null;
    } else if (result !== null && typeof result === 'object' && result.error === 'cancelled') {
      job.phase = 'cancelled';
    } else {
      job.phase = 'error';
      job.error = typeof result?.error === 'string' ? result.error : 'internal';
      job.message = typeof result?.message === 'string' ? result.message : null;
    }
    job.updatedAt = new Date(clock()).toISOString();
    record.finishedAt = clock();
  }

  /** Drive one job to a terminal phase. */
  async function run(record) {
    let result;
    try {
      result = await record.run({
        signal: record.controller.signal,
        onProgress: (progress) => applyProgress(record, progress),
      });
    } catch (error) {
      settle(record, { ok: false, error: 'internal', message: error instanceof Error ? error.message : String(error) });
      return;
    }
    settle(record, result);
  }

  /** Start one job; the job begins running after the snapshot is taken. */
  function create(request = {}) {
    sweep();
    if (runningCount() >= maxRunning) return { ok: false, error: 'busy' };
    const startedAt = new Date(clock()).toISOString();
    const record = {
      job: {
        id: 'job-' + randomBytes(4).toString('hex'),
        repo: typeof request.repo === 'string' ? request.repo : '',
        targets: Array.isArray(request.targets) ? request.targets.slice() : [],
        phase: 'queued',
        bytes: 0,
        files: 0,
        copied: 0,
        name: null,
        installed: [],
        warnings: [],
        error: null,
        message: null,
        startedAt,
        updatedAt: startedAt,
      },
      controller: new AbortController(),
      run: request.run,
      finishedAt: null,
    };
    records.set(record.job.id, record);
    prune();
    const job = copyJob(record.job);
    if (typeof record.run === 'function') run(record).catch(() => {});
    return { ok: true, job };
  }

  /** One job snapshot, or null when it is unknown or past the retention window. */
  function get(id) {
    sweep();
    const record = records.get(id);
    return record === undefined ? null : copyJob(record.job);
  }

  /** Ask a running job to stop; a settled job comes back unchanged. */
  function cancel(id) {
    sweep();
    const record = records.get(id);
    if (record === undefined) return null;
    if (!isTerminalPhase(record.job.phase)) record.controller.abort();
    return copyJob(record.job);
  }

  /** Every retained job, oldest first. */
  function list() {
    sweep();
    return [...records.values()].map((record) => copyJob(record.job));
  }

  return { create, get, cancel, list, runningCount };
}
