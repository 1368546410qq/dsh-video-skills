# dsh-video-skills

`dsh-video-skills` 是一个 DSH Web 插件：在设置页中浏览 [awesome-claude-video-skills](https://github.com/zhuyansen/awesome-claude-video-skills) 目录，并通过下载 GitHub 归档、复制文件的方式，把所选仓库的技能安装到 `~/.claude/skills` 或 `~/.dsh/skills`，全程不执行仓库中的任何代码。

English documentation: [README.md](./README.md)

## 插件提供什么

- DSH 设置界面中的一个页面席位（`key: video-skills`，`order: 900`）：筛选栏（类型标签、最低星数、评级、许可证、搜索），最多 100 行的列表与"加载更多"，以及每行一个安装控件，可选 `claude` / `dsh` 目标并显示已安装标记。文案支持中英双语，默认 `zh-CN`，可选 `en-US`，所有字符串都在 `locale/*.json` 中。
- 两个模型工具：`video_skill_search` 与 `video_skill_install`。
- 一条 HTTP 前缀路由 `/video-skills/api/v1`，供页面调用。即使宿主没有组合出工具注册表，该路由仍然提供服务；工具只在注册表存在时才注册。

## 环境要求

- Node.js 20 或更高版本（`package.json` 中的 `engines`）。
- 提供 `webServer` 服务的 DSH 配置档——宿主入口声明了 `inject = ['webServer']`。
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
dsh plugin --profile <name> add file:/绝对路径/dsh-plugin-video-skills
```

然后在同一个配置档的 `package.json` 中把 `"dsh-video-skills"` 追加到 `dsh.profile.bundles`。此时插件链接自工作目录，后续改动会直接从该目录生效。

## 工具

两个工具在任何组合里都可用——CLI、TUI、Web 都行。只有浏览安装页面需要 Web UI；没有 Web 服务时插件只注册工具，不挂任何 HTTP 路由。

### `video_skill_search`

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `query` | string | — | 对仓库名与描述做不区分大小写的子串匹配。 |
| `kind` | string | — | 精确类型：`general`、`promo`、`explainer`、`editing`、`shorts`、`avatar`、`story`、`motion`、`craft`、`music`。 |
| `grade` | `safe` \| `caution` | — | 目录记录的安全评级。 |
| `license` | string | — | 精确许可证标识，不区分大小写。 |
| `minStars` | integer | — | 只保留星数不低于该值的条目。 |
| `limit` | integer | `20` | 分页大小，限制在 1–100。 |

返回 `{ count, items }`：`count` 是分页前的命中总数，`items` 是按星数降序排列的当前页。每个条目包含 `repo`、`path`、`stars`、`description`、`kind`、`grade`、`language`、`license` 与 `previewUrl`。

### `video_skill_install`

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `repo`（必填） | string | — | `owner/name`；会去掉 `https://github.com/` 前缀与 `.git` 后缀。 |
| `path` | string | 自动探测 | 仓库内的技能目录；省略时取最浅的 `SKILL.md`。 |
| `name` | string | 自动探测 | 覆盖安装后的技能目录名。 |
| `targets` | `claude` \| `dsh` 的数组 | `["claude"]` | 要安装到的技能根目录；重复项会被去掉。 |

返回值与 `POST /install` 相同——成功时 `{ ok: true, name, installed: [{ target, dir, files }], warnings: string[] }`；失败时 `{ ok: false, error, message?, dir? }`，`error` 取值 `bad-repo`、`bad-targets`、`fetch-failed`、`no-skill-md`、`exists`。

## HTTP 接口

基路径 `/video-skills/api/v1`，同源，无鉴权。所有响应均为 JSON，并带 `cache-control: no-store`；POST 路由的请求体上限为 64 KiB（`MAX_BODY_BYTES`）。

| 方法 | 路径 | 成功 | 失败 |
| --- | --- | --- | --- |
| `GET` | `/catalog` | `200` 目录载荷 | 无——上游不可达时返回随包快照，并标记 `stale: true` |
| `GET` | `/installed` | `200 {"ok":true,"items":[{"name","target","dir","repo","installedAt"}]}` | 无 |
| `POST` | `/install` | `200` 安装结果 | 目标目录已存在且不是本插件为同一仓库安装的目录时返回 `409 {"ok":false,"error":"exists","dir"}`；否则 `400`，`error` 为 `bad-repo`、`bad-targets`、`no-skill-md` 或 `fetch-failed` |
| `POST` | `/refresh` | `200 {"ok":true,"generated","count","stale":false}` | `502 {"ok":false,"error":"fetch-failed","message"}` |
| 任意 | 其他路径 | — | `404 {"ok":false,"error":"not-found"}` |

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
      "previewUrl": "https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews/heygen-com__hyperframes.jpg"
    }
  ]
}
```

`generated` 原样取自上游，可能为 `null`；除目录标记为 `caution` 的条目外，`grade` 均为 `safe`。

## 安装目标与环境变量

| 目标 | 默认根目录 | 环境变量覆盖 |
| --- | --- | --- |
| `claude` | `~/.claude/skills` | `DSH_VIDEO_SKILLS_CLAUDE_ROOT` |
| `dsh` | `~/.dsh/skills` | `DSH_VIDEO_SKILLS_DSH_ROOT` |

一次安装的流程：

1. 把 `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD` 下载到一个新建的临时目录；超过 80 MiB 立即中断。
2. 解析技能目录：给了 `path` 就用它，否则取归档中最浅的 `SKILL.md`——同层时优先目录名与仓库名相同者，其次按字典序。
3. 把该目录复制到 `<root>/<name>`，跳过 `.git/**`、`node_modules/**` 以及任何大于 10 MiB 的文件；每次跳过都会以 `skipped:<原因>:<路径>` 追加到 `warnings`。
4. 写入 `<root>/<name>/.dsh-video-skills.json` = `{ repo, path, ref: "HEAD", installedAt, files }`。

目录名的解析顺序为：`name` 参数 → 目标 `SKILL.md` frontmatter 的 `name` 字段 → 目录基名 → `skill`；随后统一转小写并收敛为 `[a-z0-9._-]`，最多 64 个字符。

冲突处理：目标目录没有标记文件，或标记文件指向另一个仓库时，以 `exists` 拒绝；标记文件指向同一仓库时，本次安装为覆盖。

DSH 会监视两个技能根目录，因此新安装的技能会自动生效，不需要任何重新扫描命令。

## 安全设计

- `src/` 中没有任何 `child_process`、没有 shell、不调用 `npm` 或 `git`——运行时唯一依赖是 `tar`。
- 归档中的内容不会被任何形式执行：只做列出与复制，没有 postinstall，不运行仓库中的脚本，也没有构建步骤。
- 归档条目会被校验：越出解压根目录的条目直接报错，列出与解压都使用 `strict: true`。
- 只写文件：引擎只写技能目录与标记文件。路径穿越条目或不可用的 `path` 参数会被拒绝，而不是被修补。
- 不是本插件创建的目录永远不会被覆盖。
- 页面只向同源的 `/video-skills/api/v1` 发起请求；预览图来自 `raw.githubusercontent.com`。目录没有写入路径。

## 目录、缓存与离线快照

- 上游 JSON：`https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/data/skills.json`。
- 缓存文件：`~/.dsh/video-skills/catalog.json`，24 小时内直接复用。
- 单次请求的网络预算：15 秒。
- `GET /catalog` 依次读取缓存、网络（结果写回缓存）、随包的 `data/skills.json`（标记 `stale: true`）；该接口不会失败。
- `POST /refresh` 跳过缓存，抓取失败时返回 `502`。
- 预览图不随包分发，`previewUrl` 指向 `https://raw.githubusercontent.com/zhuyansen/awesome-claude-video-skills/HEAD/assets/previews/<owner>__<repo>.jpg`。

## 仓库结构

```
src/host/index.js        Cordis 插件入口：HTTP 前缀路由与工具注册
src/host/catalog.js      抓取、24 小时缓存、快照兜底、筛选
src/host/install.js      归档下载、技能目录探测、复制引擎
src/host/tool-schema.js  两个工具的定义
client/client.js         设置页（经典脚本，无构建步骤）
locale/zh-CN.json        中文文案
locale/en-US.json        英文文案
data/skills.json         上游目录快照（CC0-1.0）
data/NOTICE.md           数据来源说明
cordis.patch.yml         打包补丁
test/                    node --test 测试（不随包发布）
CONTRACT.md              实现契约（不随包发布）
```

## 许可证与数据来源

- 插件代码：MIT，见 [LICENSE](./LICENSE)。Copyright (c) 2026 dujiacheng。
- 随包数据 `data/skills.json`：源自 <https://github.com/zhuyansen/awesome-claude-video-skills> 的 `data/skills.json`，为未修改的快照（提交引用 `HEAD`，373 条），上游以 **CC0 1.0 Universal** 发布，此处按同样的条款再分发。完整署名见 [data/NOTICE.md](./data/NOTICE.md)。
- 该快照仅作兜底：运行时优先使用刚抓取的上游副本，快照以下发时标记 `stale: true`。
