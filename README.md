# dsh-video-skills

`dsh-video-skills` is a DSH web plugin that lists the [awesome-claude-video-skills](https://github.com/zhuyansen/awesome-claude-video-skills) catalog in one settings page and installs a chosen repository's skill into `~/.claude/skills` or `~/.dsh/skills` by downloading its GitHub archive and copying files — no code from the installed repository is ever executed.

Chinese documentation: [README.zh-CN.md](./README.zh-CN.md)

## What the plugin adds

- One page seat in the DSH settings UI (`key: video-skills`, `order: 900`): a filter bar (kind chips, minimum stars, grade, license, search), a list of at most 100 rows with "load more", and a per-row install control with a `claude` / `dsh` target choice and an installed badge. Copy is bilingual — `zh-CN` default, `en-US` available — and every string lives in `locale/*.json`.
- Two model tools: `video_skill_search` and `video_skill_install`.
- One HTTP prefix route, `/video-skills/api/v1`, that the page talks to. The route is served even when no tool registry is composed, and the tools are registered only when one is.

## Requirements

- Node.js 20 or newer (`engines` in `package.json`).
- A DSH profile that provides the `webServer` service — the host entry declares `inject = ['webServer']`.
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
dsh plugin --profile <name> add file:/absolute/path/to/dsh-plugin-video-skills
```

then append `"dsh-video-skills"` to `dsh.profile.bundles` in the same profile `package.json`. The plugin is linked from the working tree, so later edits are picked up from there.

## Tools

### `video_skill_search`

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `query` | string | — | Case-insensitive substring match over repository name and description. |
| `kind` | string | — | Exact kind: `general`, `promo`, `explainer`, `editing`, `shorts`, `avatar`, `story`, `motion`, `craft`, `music`. |
| `grade` | `safe` \| `caution` | — | Security grade recorded by the catalog. |
| `license` | string | — | Exact license id, matched case-insensitively. |
| `minStars` | integer | — | Only entries with at least this many stars. |
| `limit` | integer | `20` | Page size, clamped to 1–100. |

Returns `{ count, items }`: `count` is the number of matches before the page limit, `items` is the page sorted by stars descending. Each entry carries `repo`, `path`, `stars`, `description`, `kind`, `grade`, `language`, `license` and `previewUrl`.

### `video_skill_install`

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `repo` (required) | string | — | `owner/name`; an `https://github.com/` prefix and a `.git` suffix are stripped. |
| `path` | string | detected | Skill directory inside the repository. Omit to pick the shallowest `SKILL.md`. |
| `name` | string | detected | Override the installed skill directory name. |
| `targets` | array of `claude` \| `dsh` | `["claude"]` | Skill roots to install into; duplicates are dropped. |

Returns the same object as `POST /install` — on success `{ ok: true, name, installed: [{ target, dir, files }], warnings: string[] }`; on failure `{ ok: false, error, message?, dir? }` with `error` one of `bad-repo`, `bad-targets`, `fetch-failed`, `no-skill-md`, `exists`.

## HTTP API

Base path `/video-skills/api/v1`, same origin, no authentication. Every response is JSON with `cache-control: no-store`; a request body on a POST route is capped at 64 KiB (`MAX_BODY_BYTES`).

| Method | Path | Success | Failure |
| --- | --- | --- | --- |
| `GET` | `/catalog` | `200` catalog payload | none — an unreachable upstream yields the bundled snapshot with `stale: true` |
| `GET` | `/installed` | `200 {"ok":true,"items":[{"name","target","dir","repo","installedAt"}]}` | none |
| `POST` | `/install` | `200` install result | `409 {"ok":false,"error":"exists","dir"}` when the target directory exists and is not this plugin's install of the same repository; `400` with `error` `bad-repo`, `bad-targets`, `no-skill-md` or `fetch-failed` |
| `POST` | `/refresh` | `200 {"ok":true,"generated","count","stale":false}` | `502 {"ok":false,"error":"fetch-failed","message"}` |
| any | any other path | — | `404 {"ok":false,"error":"not-found"}` |

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
      "previewUrl": "https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews/heygen-com__hyperframes.jpg"
    }
  ]
}
```

`generated` is copied from upstream and may be `null`; `grade` is `safe` unless the catalog marks the entry `caution`.

## Install targets and environment overrides

| Target | Default root | Environment override |
| --- | --- | --- |
| `claude` | `~/.claude/skills` | `DSH_VIDEO_SKILLS_CLAUDE_ROOT` |
| `dsh` | `~/.dsh/skills` | `DSH_VIDEO_SKILLS_DSH_ROOT` |

What an install does:

1. Download `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD` into a fresh temporary directory. The download is aborted past 80 MiB.
2. Resolve the skill directory: the explicit `path` when given, otherwise the shallowest `SKILL.md` in the archive — ties go to a directory named after the repository, then alphabetically.
3. Copy that directory into `<root>/<name>`, skipping `.git/**`, `node_modules/**` and any file above 10 MiB. Every skip is appended to `warnings` as `skipped:<reason>:<path>`.
4. Write `<root>/<name>/.dsh-video-skills.json` = `{ repo, path, ref: "HEAD", installedAt, files }`.

The directory name comes from the `name` parameter, then the `name` field of the target `SKILL.md` frontmatter, then the directory basename, then `skill`; it is lowercased and reduced to `[a-z0-9._-]`, at most 64 characters.

Conflicts: a target directory with no marker, or whose marker names a different repository, is refused with `exists`. A marker for the same repository makes the install an overwrite.

DSH watches both skill roots, so a newly installed skill becomes available without any rescan command.

## Security posture

- No `child_process`, no shell, no `npm`, no `git` anywhere in `src/` — the only runtime dependency is `tar`.
- Nothing from the downloaded archive is executed. The tarball is listed and its entries are copied; no postinstall, no script from the repository, no build step.
- Archive entries are validated: an entry that escapes the extraction root is a hard error, and both listing and extraction run with `strict: true`.
- Files only: the engine writes the skill directory and the marker file and nothing else. A path-traversal entry or an unusable `path` parameter is rejected rather than repaired.
- A directory this plugin did not create is never overwritten.
- The page makes same-origin requests to `/video-skills/api/v1` only; preview images are loaded from `raw.githubusercontent.com`. There is no write path into the catalog.

## Catalog, cache, and offline snapshot

- Upstream JSON: `https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/data/skills.json`.
- Cache file: `~/.dsh/video-skills/catalog.json`, reused while younger than 24 h.
- Fetch budget for one request: 15 s.
- `GET /catalog` reads cache, then network (writing the result back to the cache), then the bundled `data/skills.json` marked `stale: true`. It never fails.
- `POST /refresh` skips the cache and answers `502` when the fetch fails.
- Preview images are not bundled. `previewUrl` points at `https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews/<owner>__<repo>.jpg`.

## Repository layout

```
src/host/index.js        Cordis plugin entry: the HTTP prefix route and tool registration
src/host/catalog.js      fetch, 24 h cache, snapshot fallback, filtering
src/host/install.js      archive download, skill-directory detection, copy engine
src/host/tool-schema.js  the two tool definitions
client/client.js         settings page (classic script, no build step)
locale/zh-CN.json        Chinese copy
locale/en-US.json        English copy
data/skills.json         snapshot of the upstream catalog (CC0-1.0)
data/NOTICE.md           data provenance note
cordis.patch.yml         bundle patch
test/                    node --test suites (not published)
CONTRACT.md              implementation contract (not published)
```

## License and data provenance

- Plugin code: MIT — see [LICENSE](./LICENSE). Copyright (c) 2026 dujiacheng.
- Bundled catalog data `data/skills.json`: an unmodified snapshot of `data/skills.json` from <https://github.com/zhuyansen/awesome-claude-video-skills> (commit ref `HEAD`, 373 entries), released upstream under **CC0 1.0 Universal** and redistributed here under the same terms. The full credit is in [data/NOTICE.md](./data/NOTICE.md).
- The snapshot is a fallback only: at runtime a freshly fetched upstream copy is preferred, and the snapshot is served marked `stale: true`.
