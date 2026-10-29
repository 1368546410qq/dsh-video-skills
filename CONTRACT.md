# dsh-video-skills — implementation contract (locked by the dispatcher)

Repo root: `C:/Users/dujiacheng/Desktop/shalong/dsh-plugin-video-skills`
Package name: `dsh-video-skills` (free on npm, HTTP 404). License MIT; upstream catalog data is CC0 1.0.
Target: a DSH **web** plugin that lists the `awesome-claude-video-skills` catalog (373 entries) in one settings page and installs a chosen repo's skill into the user's skill directories **without executing any repo code**.

## Settled product decisions (do not re-litigate)
1. Install = download tarball + copy files only. NEVER run npm/git/bash from the target repo, never postinstall, never spawn anything from the downloaded tree.
2. Both skill roots are supported and the page lets the user choose per install: `~/.claude/skills` (`claude`) and `~/.dsh/skills` (`dsh`).
3. Bilingual UI: `zh-CN` default, `en-US` available. All strings come from `locale/*.json`; no hardcoded copy in components.
4. Offline: catalog comes from GitHub raw with a 24 h cache; if the network fails the package's own snapshot is used and the response is marked `stale:true`.
5. First release has no uninstall/update and no market-score writeback.

## Layout (exact paths)
```
package.json
cordis.patch.yml
LICENSE                      (MIT, task C)
README.md / README.zh-CN.md   (task C)
.gitignore                   (task C)
data/skills.json             snapshot of upstream data/skills.json (CC0)
data/NOTICE.md               provenance + CC0 note (task A writes)
locale/zh-CN.json
locale/en-US.json
src/host/index.js            Cordis plugin entry (ESM, exports name/inject/apply)
src/host/catalog.js          fetch + 24h cache + snapshot fallback + entry mapping
src/host/install.js          tarball fetch, skill-dir detection, copy engine, conflict rules
src/host/tool-schema.js      defineTool schema helpers (per dsh-tools spec)
client/client.js             hand-written CJS factory bundle (classic script, no build step)
test/install.test.mjs        node --test for the pure functions
```

## package.json (authoritative; task A creates it, task C only edits metadata)
```json
{
  "name": "dsh-video-skills",
  "version": "0.1.0",
  "description": "Browse the awesome-claude-video-skills catalog inside DSH and install a skill with one click.",
  "license": "MIT",
  "type": "module",
  "main": "src/host/index.js",
  "exports": { ".": "./src/host/index.js", "./client": "./client/client.js", "./package.json": "./package.json" },
  "files": ["src", "client", "locale", "data", "cordis.patch.yml", "README.md", "README.zh-CN.md", "LICENSE"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "platform": "web", "inject": [] } },
  "dependencies": { "tar": "^7.4.3" },
  "engines": { "node": ">=20" },
  "scripts": { "test": "node --test test/*.test.mjs" }
}
```
`dsh.client.inject` stays `[]` unless the client truly `require()`s a shared package; if it requires React, list exactly the packages it uses.

## cordis.patch.yml
```yaml
- insert:
    - id: video-skills
      name: "dsh-video-skills"
```

## Host entry (src/host/index.js)
Cordis plugin: `export const name = 'video-skills'`, `export const inject = ['webServer']` plus `'tools'` guarded so registration is optional (if `ctx.tools` is absent the plugin still serves HTTP), `export function apply(ctx)`.
- Registers exactly one prefix route `/video-skills/api/v1` via `webServer.register({ kind:'prefix', path, handler(req,res) })` (no get/post helper exists).
- Registers two tools through `ctx.tools.register(defineTool({...}))`: schema spec at `C:/Users/dujiacheng/.npm-global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/types/schema.d.ts:74-84`; `output.render` is mandatory.

## HTTP contract (single source of truth for tasks A and B)
All JSON, same-origin, no auth. Base `/video-skills/api/v1`.
- `GET /catalog` -> `200 {ok:true, generated:"2026-10-28", source:"https://github.com/zhuyansen/awesome-claude-video-skills", stale:boolean, count:number, entries:Entry[]}`
  `Entry = { repo, path: string|null, stars:number, description:string, kind:"general"|"promo"|"explainer"|"editing"|"shorts"|"avatar"|"story"|"motion"|"craft"|"music", grade:"safe"|"caution", language:string|null, license:string|null, previewUrl:string|null }`
  `previewUrl` = `https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews/<owner>__<repo>.jpg` where `<owner>__<repo>` is repo_full_name with '/' replaced by '__'.
- `POST /install` body `{ repo:string, path?:string|null, name?:string, targets:("claude"|"dsh")[] }` -> `200 {ok:true, name, installed:[{target,dir,files:number}], warnings:string[]}` | `409 {ok:false,error:"exists",dir}` | `400 {ok:false,error:"no-skill-md"|"bad-repo"|"bad-targets"|"fetch-failed", message?}`
- `GET /installed` -> `{ok:true, items:[{name,target,dir,repo,installedAt}]}`
- `POST /refresh` -> `{ok:true,generated,count,stale:false}` | `502 {ok:false,error:"fetch-failed",message}`

## Tools
- `video_skill_search` params `{query?, kind?, grade?, license?, minStars?, limit?}` -> `{count, items:Entry[]}` (limit default 20, max 100).
- `video_skill_install` params `{repo, path?, name?, targets?:("claude"|"dsh")[]}` (targets default `["claude"]`) -> same result object as `POST /install`.

## Install engine rules (src/host/install.js)
1. Source: `https://codeload.github.com/<repo>/tar.gz/HEAD`, streamed through `tar` (the only runtime dependency). No git, no npm, no child_process anywhere in this file.
2. Skill dir resolution: if `path` is given use it; else pick the shallowest `SKILL.md` inside the tarball (ties broken by a dir whose name matches the repo name). No `SKILL.md` -> `no-skill-md`.
3. Copy the whole skill dir except `.git/**`, `node_modules/**`, and any file larger than 10 MB (each skip appends a warning). A path-traversal entry is a hard error.
4. Skill name: from the target `SKILL.md` frontmatter `name` when present and path-safe, else the dir basename; sanitize to `[a-z0-9._-]`.
5. Conflicts: target dir exists without a marker -> `exists`; marker present and `repo` matches -> overwrite; `repo` differs -> `exists`.
6. Marker `<targetDir>/<name>/.dsh-video-skills.json` = `{repo, path, ref:"HEAD", installedAt:<ISO>, files:<count>}`.
7. After a successful install, ask the host to re-scan skills only if a supported mechanism exists; otherwise return `warnings:["rescan-unavailable"]` and never emit a fabricated event.

## Client (client/client.js)
- Hand-written classic script, no bundler, no imports: `window.__ModuleLoader__.load({ id: "dsh-video-skills", factory: (require) => { ... return module.exports } })`. Mirror the shape of `C:/Users/dujiacheng/.dsh/profiles/web/node_modules/@wenaixi/dsh-superpower/lib/client.js`.
- Exports `inject` and `apply(ctx)`; registers ONE page seat `{key:"video-skills", order:900, locale, label(), inject(), component}` inside `ctx.effect(...)`, obtained through `ctx.get('webUiExtensions')` when its `sectionId` matches `web-ui-plugins`, and falling back to `ctx.slots.register` when the parent is absent (copy the guarded pattern; do not depend on the @linxin666 family).
- Page = filter bar (kind chips, min-stars slider, grade select, license select, search input, refresh button) + list of at most 100 rows with a "load more" button + per-row install control with target radio (`claude` / `dsh`) + installed badge. Preview images use `loading="lazy"`; a missing image must not break a row.
- All fetches are document-relative against the contract above; failure renders an inline error line, never throws.

## Non-goals
Uninstall/update, score writeback, non-web platforms, executing downloaded code, bundling preview images.
