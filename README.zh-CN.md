# dsh-video-skills

`dsh-video-skills` 是一个 DSH Web 插件：在设置页中浏览 [awesome-claude-video-skills](https://github.com/zhuyansen/awesome-claude-video-skills) 目录，并通过下载 GitHub 归档、复制文件的方式，把所选仓库的技能安装到 `~/.claude/skills` 或 `~/.dsh/skills`，全程不执行仓库中的任何代码。

English documentation: [README.md](./README.md)

## 插件提供什么

- DSH 设置界面中的一个页面席位（`key: video-skills`，`order: 900`）：顶部"安装到"一栏有 `Claude` / `DSH` 两个复选框（默认只勾 `DSH`，选择记在 `localStorage`），另有"只看已安装"筛选；下方是筛选栏（类型标签、最低星数、评级、许可证、搜索）与最多 100 行的列表、"加载更多"。每行可跳转到对应的 GitHub 仓库与仓库内的技能目录，并带一个约等于的仓库体积徽章（`≈ 27.4 MB`，尚未取到时显示 `—`），安装时以不确定形态的进度条显示下载进度（`已下载 <n> MB`，随后 `归档 <n> MB / <m> 文件`，再 `拷贝 <n> 文件`），并提供取消按钮，已安装的目标打勾，卸载需点两次确认。文案支持中英双语，默认 `zh-CN`，可选 `en-US`，所有字符串都在 `locale/*.json` 中。
- 三个模型工具：`video_skill_search`、`video_skill_install` 与 `video_skill_uninstall`。
- 一条 HTTP 前缀路由 `/video-skills/api/v1`，供页面调用。即使宿主没有组合出工具注册表，该路由仍然提供服务；工具只在注册表存在时才注册。

## 环境要求

- Node.js 20 或更高版本（`package.json` 中的 `engines`）。
- 任意 DSH 组合。入口声明 `inject = []` 并按服务响应式注入：存在 `tools` 服务时就注册工具，存在 `webServer` 时才挂 HTTP 路由，因此 CLI 与 TUI 会话同样能用上三个工具。
- 运行时依赖：`tar`（用于流式下载、列出与解压归档）。除此之外运行时不再安装其他依赖。

## 安装

从登记处安装到某个 DSH 配置档：

```bash
dsh plugin --profile <name> add dsh-video-skills
```

`dsh plugin` 会把后续参数转发给配置档目录中的 pnpm，因此该包会被固定为该配置档的依赖。配置档只组合其 `package.json` 中 `dsh.profile.bundles` 列出的插件，所以还需要把 `"dsh-video-skills"` 加入该数组：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-video-skills"]
    }
  }
}
```

本地开发，直接使用本仓库的检出目录：

```bash
dsh plugin --profile <name> add link:/绝对路径/dsh-plugin-video-skills
```

`link:` 建立的是符号链接而不是拷贝，后续改动无需重装即可生效；若 `dsh.profile.bundles` 里还没有 `"dsh-video-skills"`，再补上。

## 工具

三个工具在任何组合里都可用——CLI、TUI、Web 都行。只有浏览安装页面需要 Web UI；没有 Web 服务时插件只注册工具，不挂任何 HTTP 路由。

### `video_skill_search`

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `query` | string | — | 对仓库名与描述做不区分大小写的子串匹配。 |
| `kind` | string | — | 精确类型：`general`、`promo`、`explainer`、`editing`、`shorts`、`avatar`、`story`、`motion`、`craft`、`music`。 |
| `grade` | `safe` \| `caution` | — | 目录记录的安全评级。 |
| `license` | string | — | 精确许可证标识，不区分大小写。 |
| `minStars` | integer | — | 只保留星数不低于该值的条目。 |
| `limit` | integer | `20` | 分页大小，限制在 1–100。 |

返回 `{ count, items }`：`count` 是分页前的命中总数，`items` 是按星数降序排列的当前页。每个条目包含 `repo`、`path`、`stars`、`description`、`kind`、`grade`、`language`、`license`、`previewUrl` 与 `sizeBytes`。`sizeBytes` 是缓存的 GitHub 仓库体积（字节），与 `GET /catalog` 对同一条目给出的值同源同值——工具与路由共用同一个目录加载器（`createToolCatalogLoader`）。缓存里还没有该仓库的值时为 `null`（字段照常存在，只是取值为 null），工具的声明式输出结构中也以可空数字声明（见[仓库体积](#仓库体积)）。

### `video_skill_install`

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `repo`（必填） | string | — | `owner/name`；会去掉 `https://github.com/` 前缀与 `.git` 后缀。 |
| `path` | string | 自动探测 | 仓库内的技能目录；省略时取最浅的 `SKILL.md`。 |
| `name` | string | 自动探测 | 覆盖安装后的技能目录名。 |
| `targets` | `claude` \| `dsh` 的数组 | `["dsh"]` | 要安装到的技能根目录；重复项会被去掉。 |

返回引擎结果——成功时 `{ ok: true, name, installed: [{ target, dir, files }], warnings: string[] }`；失败时 `{ ok: false, error, message?, dir? }`，`error` 取值 `bad-repo`、`bad-targets`、`fetch-failed`、`no-skill-md`、`exists`。工具会等整个引擎跑完，只返回最终结果——没有任务对象，也没有中间进度；页面走 `POST /install` 并轮询任务对象取进度。

### `video_skill_uninstall`

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `name`（必填） | string | — | 技能目录名，取自 `GET /installed`。 |
| `target`（必填） | `claude` \| `dsh` | — | 要从哪个技能根目录移除。 |

成功返回 `{ ok: true, removed: { name, target, dir } }`；失败返回 `{ ok: false, error }`，`error` 取 `bad-name`、`bad-target`、`not-found` 或 `not-owned`。只有带本插件 `.dsh-video-skills.json` 标记的目录会被删除；手工拷进去的技能以 `not-owned` 拒绝，永不触碰。

## HTTP 接口

基路径 `/video-skills/api/v1`，同源，无鉴权。所有响应均为 JSON，并带 `cache-control: no-store`；POST 路由的请求体上限为 64 KiB（`MAX_BODY_BYTES`）。

| 方法 | 路径 | 成功 | 失败 |
| --- | --- | --- | --- |
| `GET` | `/catalog` | `200` 目录载荷 | 无——上游不可达时返回随包快照，并标记 `stale: true` |
| `GET` | `/installed` | `200 {"ok":true,"items":[{"name","target","dir","repo","path","installedAt","files","bytes","owned","external"}]}`；`bytes` 是实测的已安装目录占用，不含标记文件，也不含 `.git`/`node_modules` | 无 |
| `POST` | `/install` | `202 {"ok":true,"job"}`——安装在后台运行 | `400`，`error` 为 `bad-body`、`bad-repo` 或 `bad-targets`；已有 8 个任务在跑时 `409 {"ok":false,"error":"busy"}` |
| `GET` | `/install/<id>` | `200 {"ok":true,"job"}` | `404 {"ok":false,"error":"unknown-job"}` |
| `POST` | `/install/<id>/cancel` | `200 {"ok":true,"job"}`——已结束的任务原样返回 | `404` `unknown-job` |
| `POST` | `/uninstall` | `200 {"ok":true,"removed":{"name","target","dir"}}` | `400` `bad-body` \| `bad-name` \| `bad-target`；`404` `not-found`；目录没有标记时 `409 {"ok":false,"error":"not-owned"}` |
| `POST` | `/refresh` | `200 {"ok":true,"generated","count","stale":false}` | `502 {"ok":false,"error":"fetch-failed","message"}` |
| 任意 | 其他路径 | — | `404 {"ok":false,"error":"not-found"}` |

任务对象为 `{ id, repo, targets, phase, bytes, archiveBytes, files, copied, name, installed, warnings, error, message, startedAt, updatedAt }`，`phase` 取 `queued`、`download`、`inspect`、`extract`、`copy`、`done`、`error`、`cancelled`。`bytes` 是已下载字节，`archiveBytes` 是归档的最终体积（下载结束前为 `null`），`copied` 是已写入文件数。取消会中断下载，并删掉该任务已经写出的目录。任务表最多保留 32 条，结束的任务在十分钟内仍可读；页面每 500 ms 轮询一次。

处理器内部抛出异常时返回 `500 {"ok":false,"error":"internal","message"}`。

目录载荷示例：

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

`generated` 原样取自上游，可能为 `null`；除目录标记为 `caution` 的条目外，`grade` 均为 `safe`。`sizeBytes` 与 `sizes` 由本地体积缓存算出：`sizes.known` 是带体积的条目数，`sizes.total` 是目录条目总数——见[仓库体积](#仓库体积)。

## 安装目标与环境变量

| 目标 | 默认根目录 | 环境变量覆盖 |
| --- | --- | --- |
| `claude` | `~/.claude/skills` | `DSH_VIDEO_SKILLS_CLAUDE_ROOT` |
| `dsh` | `~/.dsh/skills` | `DSH_VIDEO_SKILLS_DSH_ROOT` |

一次安装的流程：

1. 把 `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD` 下载到一个新建的临时目录；超过 512 MiB 立即中断，并报出实际收到的字节数——`archive exceeds the 512 MiB download budget (received <n> bytes)`。
2. 解析技能目录：给了 `path` 就用它，否则取归档中最浅的 `SKILL.md`——同层时优先目录名与仓库名相同者，其次按字典序。
3. 把该目录复制到 `<root>/<name>`，跳过 `.git/**`、`node_modules/**` 以及任何大于 10 MiB 的文件；每次跳过都会以 `skipped:<原因>:<路径>` 追加到 `warnings`。
4. 写入 `<root>/<name>/.dsh-video-skills.json` = `{ repo, path, ref: "HEAD", installedAt, files }`。

目录名的解析顺序为：`name` 参数 → 目标 `SKILL.md` frontmatter 的 `name` 字段 → 目录基名 → `skill`；随后统一转小写并收敛为 `[a-z0-9._-]`，最多 64 个字符。

冲突处理：目标目录没有标记文件，或标记文件指向另一个仓库时，以 `exists` 拒绝；标记文件指向同一仓库时，本次安装为覆盖。

进度与取消：引擎每秒最多上报 10 次 `{ phase, bytes, archiveBytes, files, copied }`，同一阶段内两次之间至少间隔 100 毫秒，单个任务不会刷爆页面。`bytes` 在归档流式下载时持续增长，但下载过程中总量不可知：`codeload.github.com` 不返回 `Content-Length`，所以页面画的是不确定形态的进度条，而不是百分比。下载结束后任务带上 `archiveBytes`，结束行会连同文件数一起报出（`归档 <n> MB / <m> 文件`）。取消会删掉临时目录树以及该任务已经拷进技能根的每一个目录。因此取消一次覆盖安装不会恢复旧版本——这是清理，不是回滚。

卸载：只删带本插件标记的目录。`GET /installed` 同时会列出不属于本插件的技能——目录里有 `SKILL.md` 但没有标记时返回 `owned: false, external: true`，页面上显示为"外部安装"，不提供卸载按钮。

DSH 会监视两个技能根目录，因此新安装的技能会自动生效，不需要任何重新扫描命令。

## 安全设计

- `src/` 中没有任何 `child_process`、没有 shell、不调用 `npm` 或 `git`——运行时唯一依赖是 `tar`。
- 归档中的内容不会被任何形式执行：只做列出与复制，没有 postinstall，不运行仓库中的脚本，也没有构建步骤。
- 归档条目会被校验：越出解压根目录的条目直接报错，列出与解压都使用 `strict: true`。
- 只写文件：引擎只写技能目录与标记文件。路径穿越条目或不可用的 `path` 参数会被拒绝，而不是被修补。
- 不是本插件创建的目录永远不会被覆盖；卸载时只有标记文件能证明是本插件装的目录才会被删除。
- 页面只向同源的 `/video-skills/api/v1` 发起请求；预览图来自 `raw.githubusercontent.com`。目录没有写入路径。

## 目录、缓存与离线快照

- 上游 JSON：`https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/data/skills.json`。
- 缓存文件：`~/.dsh/video-skills/catalog.json`，24 小时内直接复用。
- 单次请求的网络预算：15 秒。
- `GET /catalog` 依次读取缓存、网络（结果写回缓存）、随包的 `data/skills.json`（标记 `stale: true`）；该接口不会失败。
- `POST /refresh` 跳过缓存，抓取失败时返回 `502`。
- 预览图不随包分发，`previewUrl` 指向 `https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews/<owner>__<repo>.jpg`。

## 仓库体积

页面会在安装前显示仓库体积。这个数字来自 GitHub，不是归档本身的大小。

- 来源：`GET https://api.github.com/repos/<owner>/<repo>` 的 `size` 字段。GitHub 以千字节为单位返回，并计入包含 `.git` 在内的整个仓库，因此它是仓库体积而不是安装时下载的 `tar.gz` 大小——徽章前面带 `≈` 就是这个原因。
- 缓存文件：`~/.dsh/video-skills/sizes.json`。每个条目复用 7 天（`SIZE_TTL_MS`）。GitHub 报告为不存在的仓库——`404`，或 `size` 不是非负数——同样按缺失记住 7 天；返回的 `size` 为 `0` 时按未知处理。
- 预取：每批 5 个仓库（`SIZE_WARM_BATCH`），启动时一批，之后每 60 秒一批（`SIZE_WARM_INTERVAL_MS`），另外每次读取 `GET /catalog` 再踢一批。未认证的 GitHub 限额是每小时 60 次请求，所以冷缓存下大约每小时补齐 60 个仓库；只会查询当前目录里的仓库。
- 退避：GitHub 返回 `403` 或 `429`，或 `x-ratelimit-remaining` 不高于 5（`RATE_LIMIT_FLOOR`）时本批立即停止；随后暂停到 `x-ratelimit-reset` 指定的时刻，没有该响应头时暂停 10 分钟。连续 3 次传输失败（`MAX_FAILURES`）就放弃本批，等下一个周期再试。
- 令牌：可选。可用 `GITHUB_TOKEN`，没有时回退到 `GH_TOKEN`，以提高限额。它只作为 bearer 令牌发给 `api.github.com`，绝不会发给提供归档的 `codeload.github.com`。
- 未知体积：取不到可用体积的条目返回 `sizeBytes: null`，页面显示 `—`，悬浮提示说明尚未取到；GitHub 回 `404` 的仓库按缺失缓存，因此它会一直显示 `—`，而不会每批重新去问。任何环节都不会等待体积：即使整列都是空的，目录、搜索与安装照常工作。

## 仓库结构

```
src/host/index.js        Cordis 插件入口：HTTP 前缀路由与工具注册
src/host/catalog.js      抓取、24 小时缓存、快照兜底、体积合并、筛选
src/host/sizes.js        GitHub 仓库体积缓存、TTL 与后台预取
src/host/install.js      归档下载、技能目录探测、复制引擎、卸载
src/host/jobs.js         内存任务表：进度、取消、保留策略
src/host/tool-schema.js  三个工具的定义
client/client.js         设置页（经典脚本，无构建步骤）
locale/zh-CN.json        中文文案
locale/en-US.json        英文文案
data/skills.json         上游目录快照（CC0-1.0）
data/NOTICE.md           数据来源说明
cordis.patch.yml         打包补丁
test/                    node --test 测试（不随包发布）
CONTRACT.md              实现契约（不随包发布）
CONTRACT-V2.md           v2 增量：任务、取消、卸载（不随包发布）
```

## 许可证与数据来源

- 插件代码：MIT，见 [LICENSE](./LICENSE)。Copyright (c) 2026 dujiacheng。
- 随包数据 `data/skills.json`：源自 <https://github.com/zhuyansen/awesome-claude-video-skills> 的 `data/skills.json`，为未修改的快照（提交引用 `HEAD`，373 条），上游以 **CC0 1.0 Universal** 发布，此处按同样的条款再分发。完整署名见 [data/NOTICE.md](./data/NOTICE.md)。
- 该快照仅作兜底：运行时优先使用刚抓取的上游副本，快照以下发时标记 `stale: true`。
