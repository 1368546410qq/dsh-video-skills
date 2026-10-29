# dsh-video-skills

`dsh-video-skills` is a DSH web plugin that lists the [awesome-claude-video-skills](https://github.com/zhuyansen/awesome-claude-video-skills) catalog in one settings page and installs a chosen repository's skill into `~/.claude/skills` or `~/.dsh/skills` by downloading its GitHub archive and copying files — no code from the installed repository is ever executed.

Chinese documentation: [README.zh-CN.md](./README.zh-CN.md)

## What the plugin adds

- One page seat in the DSH settings UI (`key: video-skills`, `order: 900`): an **Install to** bar with `Claude` / `DSH` checkboxes (only `DSH` is checked by default and the choice is remembered in `localStorage`), an **installed only** filter, and the filter bar (kind chips, minimum stars, grade, license, search) over a list of at most 100 rows with "load more". Each row links to its GitHub repository and to the skill path inside it, carries an approximate repository-size badge (`≈ 27.4 MB`, or `—` while the size is not known yet), shows download progress as an indeterminate bar (`downloaded <n> MB`, then `archive <n> MB / <m> files`, then `copying <n> files`) with a cancel button, ticks every installed target, and uninstalls in two clicks. Copy is bilingual — `zh-CN` default, `en-US` available — and every string lives in `locale/*.json`.
- Three model tools: `video_skill_search`, `video_skill_install` and `video_skill_uninstall`.
- One HTTP prefix route, `/video-skills/api/v1`, that the page talks to. The route is served even when no tool registry is composed, and the tools are registered only when one is.

## Requirements

- Node.js 20 or newer (`engines` in `package.json`).
- Any DSH composition. The entry declares `inject = []` and resolves its services reactively: the tools appear whenever a `tools` service exists, and the HTTP route is mounted only when `webServer` exists, so CLI and TUI sessions still get all three tools.
- Runtime dependency: `tar` (used to stream, list and extract the downloaded archive). Nothing else is installed at runtime.

## Installation

Installed from the registry into a DSH profile:

```bash
dsh plugin --profile <name> add dsh-video-skills
```

`dsh plugin` forwards the remaining arguments to pnpm inside the profile directory, so the package is pinned as a profile dependency. A profile composes the plugins named in `dsh.profile.bundles` of its own `package.json`, so `"dsh-video-skills"` must also appear in that array:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-video-skills"]
    }
  }
}
```

Local development, from a checkout of this repository:

```bash
dsh plugin --profile <name> add link:/absolute/path/to/dsh-plugin-video-skills
```

`link:` installs a symlink rather than a copy, so later edits are picked up without reinstalling. Append `"dsh-video-skills"` to `dsh.profile.bundles` if it is not listed already.

## Tools

All three tools work in any composition — CLI, TUI, or Web. Only the browse-and-install page needs the Web UI; without a web server the plugin simply registers the tools and mounts no HTTP route.

### `video_skill_search`

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `query` | string | — | Case-insensitive substring match over repository name and description. |
| `kind` | string | — | Exact kind: `general`, `promo`, `explainer`, `editing`, `shorts`, `avatar`, `story`, `motion`, `craft`, `music`. |
| `grade` | `safe` \| `caution` | — | Security grade recorded by the catalog. |
| `license` | string | — | Exact license id, matched case-insensitively. |
| `minStars` | integer | — | Only entries with at least this many stars. |
| `limit` | integer | `20` | Page size, clamped to 1–100. |

Returns `{ count, items }`: `count` is the number of matches before the page limit, `items` is the page sorted by stars descending. Each entry carries `repo`, `path`, `stars`, `description`, `kind`, `grade`, `language`, `license`, `previewUrl` and `sizeBytes`. `sizeBytes` is the cached GitHub repository size in bytes — the same value `GET /catalog` serves for the same entry, because the tools and the route share one catalog loader (`createToolCatalogLoader`). It is `null` while the cache holds no value for that repository yet, and the field is declared as a nullable number in the tool's output schema (see [Repository sizes](#repository-sizes)).

### `video_skill_install`

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `repo` (required) | string | — | `owner/name`; an `https://github.com/` prefix and a `.git` suffix are stripped. |
| `path` | string | detected | Skill directory inside the repository. Omit to pick the shallowest `SKILL.md`. |
| `name` | string | detected | Override the installed skill directory name. |
| `targets` | array of `claude` \| `dsh` | `["dsh"]` | Skill roots to install into; duplicates are dropped. |

Returns the engine result — on success `{ ok: true, name, installed: [{ target, dir, files }], warnings: string[] }`; on failure `{ ok: false, error, message?, dir? }` with `error` one of `bad-repo`, `bad-targets`, `fetch-failed`, `no-skill-md`, `exists`. The tool awaits the whole engine and returns only the final result — no job object and no intermediate progress; the page uses `POST /install` and polls the job for progress.

### `video_skill_uninstall`

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `name` (required) | string | — | Skill directory name, as listed by `GET /installed`. |
| `target` (required) | `claude` \| `dsh` | — | Skill root to remove it from. |

Returns `{ ok: true, removed: { name, target, dir } }`, or `{ ok: false, error }` with `bad-name`, `bad-target`, `not-found` or `not-owned`. Only a directory carrying this plugin's `.dsh-video-skills.json` marker is removed; a skill someone copied in by hand is refused with `not-owned` and never touched.

## HTTP API

Base path `/video-skills/api/v1`, same origin, no authentication. Every response is JSON with `cache-control: no-store`; a request body on a POST route is capped at 64 KiB (`MAX_BODY_BYTES`).

| Method | Path | Success | Failure |
| --- | --- | --- | --- |
| `GET` | `/catalog` | `200` catalog payload | none — an unreachable upstream yields the bundled snapshot with `stale: true` |
| `GET` | `/installed` | `200 {"ok":true,"items":[{"name","target","dir","repo","path","installedAt","files","bytes","owned","external"}]}`; `bytes` is the measured on-disk size of the installed directory, counted without the marker file and without `.git`/`node_modules` | none |
| `POST` | `/install` | `202 {"ok":true,"job"}` — the install runs in the background | `400` with `error` `bad-body`, `bad-repo` or `bad-targets`; `409 {"ok":false,"error":"busy"}` once eight jobs are running |
| `GET` | `/install/<id>` | `200 {"ok":true,"job"}` | `404 {"ok":false,"error":"unknown-job"}` |
| `POST` | `/install/<id>/cancel` | `200 {"ok":true,"job"}` — a settled job comes back unchanged | `404` `unknown-job` |
| `POST` | `/uninstall` | `200 {"ok":true,"removed":{"name","target","dir"}}` | `400` `bad-body` \| `bad-name` \| `bad-target`; `404` `not-found`; `409 {"ok":false,"error":"not-owned"}` when the directory has no marker |
| `POST` | `/refresh` | `200 {"ok":true,"generated","count","stale":false}` | `502 {"ok":false,"error":"fetch-failed","message"}` |
| any | any other path | — | `404 {"ok":false,"error":"not-found"}` |

A job is `{ id, repo, targets, phase, bytes, archiveBytes, files, copied, name, installed, warnings, error, message, startedAt, updatedAt }` where `phase` is one of `queued`, `download`, `inspect`, `extract`, `copy`, `done`, `error`, `cancelled`. `bytes` counts the archive received so far, `archiveBytes` is the final archive size and stays `null` until the download finishes, `copied` the files written so far. Cancelling aborts the download and removes every directory the job had already written. At most 32 jobs are retained, a finished job stays readable for ten minutes. The page polls every 500 ms.

An exception inside the handler is answered as `500 {"ok":false,"error":"internal","message"}`.

Catalog payload:

```json
{
  "ok": true,
  "generated": "2026-10-28",
  "source": "https://github.com/zhuyansen/awesome-claude-video-skills",
  "stale": false,
  "count": 373,
  "entries": [
    {
      "repo": "heygen-com/hyperframes",
      "path": null,
      "stars": 74420,
      "description": "Write HTML. Render video. Built for agents.",
      "kind": "general",
      "grade": "safe",
      "language": "TypeScript",
      "license": "Apache-2.0",
      "previewUrl": "https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews/heygen-com__hyperframes.jpg",
      "sizeBytes": 28762112
    }
  ],
  "sizes": {
    "known": 128,
    "total": 373
  }
}
```

`generated` is copied from upstream and may be `null`; `grade` is `safe` unless the catalog marks the entry `caution`. `sizeBytes` and `sizes` are computed locally from the size cache: `sizes.known` counts the entries that carry a size and `sizes.total` is the catalog size — see [Repository sizes](#repository-sizes).

## Install targets and environment overrides

| Target | Default root | Environment override |
| --- | --- | --- |
| `claude` | `~/.claude/skills` | `DSH_VIDEO_SKILLS_CLAUDE_ROOT` |
| `dsh` | `~/.dsh/skills` | `DSH_VIDEO_SKILLS_DSH_ROOT` |

What an install does:

1. Download `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD` into a fresh temporary directory. The download is aborted past 512 MiB, and the refusal reports the byte count actually received — `archive exceeds the 512 MiB download budget (received <n> bytes)`.
2. Resolve the skill directory: the explicit `path` when given, otherwise the shallowest `SKILL.md` in the archive — ties go to a directory named after the repository, then alphabetically.
3. Copy that directory into `<root>/<name>`, skipping `.git/**`, `node_modules/**` and any file above 10 MiB. Every skip is appended to `warnings` as `skipped:<reason>:<path>`.
4. Write `<root>/<name>/.dsh-video-skills.json` = `{ repo, path, ref: "HEAD", installedAt, files }`.

The directory name comes from the `name` parameter, then the `name` field of the target `SKILL.md` frontmatter, then the directory basename, then `skill`; it is lowercased and reduced to `[a-z0-9._-]`, at most 64 characters.

Conflicts: a target directory with no marker, or whose marker names a different repository, is refused with `exists`. A marker for the same repository makes the install an overwrite.

Progress and cancel: the engine reports `{ phase, bytes, archiveBytes, files, copied }` at most ten times a second, and at least 100 ms apart inside one phase, so a single job cannot flood the page. `bytes` grows while the archive streams in, but the total is unknown during the download: `codeload.github.com` sends no `Content-Length`, so the page renders an indeterminate bar instead of a percentage. When the download completes the job carries `archiveBytes`, and the finish line reports it together with the file count (`Archive <n> MB / <m> files`). Cancelling throws away the temporary tree and every directory the job already copied into. A cancelled overwrite therefore does not restore the previous version — it is a cleanup, not a rollback.

Uninstall: only a directory carrying this plugin's marker is removed. `GET /installed` also lists skill roots it does not own — a directory with a `SKILL.md` but no marker comes back with `owned: false, external: true`, appears as an external entry in the page, and has no uninstall button.

DSH watches both skill roots, so a newly installed skill becomes available without any rescan command.

## Security posture

- No `child_process`, no shell, no `npm`, no `git` anywhere in `src/` — the only runtime dependency is `tar`.
- Nothing from the downloaded archive is executed. The tarball is listed and its entries are copied; no postinstall, no script from the repository, no build step.
- Archive entries are validated: an entry that escapes the extraction root is a hard error, and both listing and extraction run with `strict: true`.
- Files only: the engine writes the skill directory and the marker file and nothing else. A path-traversal entry or an unusable `path` parameter is rejected rather than repaired.
- A directory this plugin did not create is never overwritten, and an uninstall removes a directory only when its marker proves this plugin installed it.
- The page makes same-origin requests to `/video-skills/api/v1` only; preview images are loaded from `raw.githubusercontent.com`. There is no write path into the catalog.

## Catalog, cache, and offline snapshot

- Upstream JSON: `https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/data/skills.json`.
- Cache file: `~/.dsh/video-skills/catalog.json`, reused while younger than 24 h.
- Fetch budget for one request: 15 s.
- `GET /catalog` reads cache, then network (writing the result back to the cache), then the bundled `data/skills.json` marked `stale: true`. It never fails.
- `POST /refresh` skips the cache and answers `502` when the fetch fails.
- Preview images are not bundled. `previewUrl` points at `https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews/<owner>__<repo>.jpg`.

## Repository sizes

The page shows how large a repository is before you download it. The number comes from GitHub, not from the archive.

- Source: `GET https://api.github.com/repos/<owner>/<repo>`, field `size`. GitHub reports it in kilobytes and covers the whole repository including `.git`, so it is the repository size, not the size of the `tar.gz` the installer downloads — which is why the badge is written with a leading `≈`.
- Cache file: `~/.dsh/video-skills/sizes.json`. An entry is reused for 7 days (`SIZE_TTL_MS`). A repository GitHub reports as missing — a `404`, or a `size` that is not a non-negative number — is remembered as missing for the same 7 days, and a reported `size` of `0` counts as unknown.
- Warming: five repositories per batch (`SIZE_WARM_BATCH`): one batch at startup, one every 60 s (`SIZE_WARM_INTERVAL_MS`), and one more on every `GET /catalog` read. Unauthenticated GitHub allows 60 requests per hour, so a cold cache fills in roughly 60 repositories per hour; only repositories currently in the catalog are asked for.
- Backoff: a batch stops as soon as GitHub answers `403` or `429`, or reports `x-ratelimit-remaining` at 5 or below (`RATE_LIMIT_FLOOR`). Warming then pauses until `x-ratelimit-reset`, or for 10 minutes when that header is absent. Three consecutive transport failures (`MAX_FAILURES`) abandon the batch; the next tick tries again.
- Token: optional. `GITHUB_TOKEN`, or `GH_TOKEN` as a fallback, raises the quota. It is sent as a bearer token to `api.github.com` only — never to `codeload.github.com`, which serves the archives.
- Unknown sizes: an entry with no usable size comes back with `sizeBytes: null`, the page shows `—`, and the tooltip says the size is not fetched yet. A repository GitHub answers `404` for is cached as missing, so it keeps showing `—` instead of being asked again on every batch. Nothing waits on a size: the catalog, the search and the installer work with the whole column empty.

## Repository layout

```
src/host/index.js        Cordis plugin entry: the HTTP prefix route and tool registration
src/host/catalog.js      fetch, 24 h cache, snapshot fallback, size join, filtering
src/host/sizes.js        GitHub repository-size cache, TTL, and background warmer
src/host/install.js      archive download, skill-directory detection, copy engine, uninstall
src/host/jobs.js         in-memory install job table: progress, cancel, retention
src/host/tool-schema.js  the three tool definitions
client/client.js         settings page (classic script, no build step)
locale/zh-CN.json        Chinese copy
locale/en-US.json        English copy
data/skills.json         snapshot of the upstream catalog (CC0-1.0)
data/NOTICE.md           data provenance note
cordis.patch.yml         bundle patch
test/                    node --test suites (not published)
CONTRACT.md              implementation contract (not published)
CONTRACT-V2.md           v2 increments: jobs, cancel, uninstall (not published)
```

## License and data provenance

- Plugin code: MIT — see [LICENSE](./LICENSE). Copyright (c) 2026 dujiacheng.
- Bundled catalog data `data/skills.json`: an unmodified snapshot of `data/skills.json` from <https://github.com/zhuyansen/awesome-claude-video-skills> (commit ref `HEAD`, 373 entries), released upstream under **CC0 1.0 Universal** and redistributed here under the same terms. The full credit is in [data/NOTICE.md](./data/NOTICE.md).
- The snapshot is a fallback only: at runtime a freshly fetched upstream copy is preferred, and the snapshot is served marked `stale: true`.
