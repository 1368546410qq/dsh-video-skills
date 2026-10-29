# CONTRACT v2 — 进度、取消、卸载、多目标

v1 见 CONTRACT.md。本文只写 v2 的增量，**任何与 v1 冲突处以此为准**。host 半边与 client 半边各自实现，双方都只对本文负责，不读对方的实现来猜语义。

## 决定（用户已选）

1. 卸载**只允许删本插件装的目录**（有 .dsh-video-skills.json 标记）。手动拷进技能根的目录标为 external，只读。
2. 安装改成**后台任务 + 轮询**：阶段、已下载字节、已拷贝文件数，可取消。
3. 已安装**在同一个列表里**表示（徽章 + 每个目标一个勾），顶部加「只看已安装」筛选。
4. 下载上限 **512 MiB**，超限报错必须带**实际收到的字节数**。
5. 安装目标改成**多选**，默认只选 DSH。

## 引擎 API（src/host/install.js）

```ts
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;   // 512 MiB
export const SKILL_TARGETS = ['claude', 'dsh'];       // 顺序不变
export const DEFAULT_TARGETS = ['dsh'];               // v2 默认

type Progress = {
  phase: 'download' | 'inspect' | 'extract' | 'copy';
  bytes?: number;    // download：累计收到的字节
  files?: number;    // inspect/extract：已读归档条目数
  copied?: number;   // copy：已拷贝文件数
};

installSkill(options: {
  repo: string, path?: string|null, name?: string|null,
  targets?: string[],            // 缺省 DEFAULT_TARGETS
  fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv, now?: Date,
  signal?: AbortSignal,          // 取消用
  onProgress?: (p: Progress) => void,   // 可选，每秒最多 10 次
}): Promise<
  | { ok: true, name: string, installed: { target, dir, files }[], warnings: string[] }
  | { ok: false, error: 'bad-repo'|'bad-targets'|'fetch-failed'|'no-skill-md'|'exists'|'cancelled', message?: string }
>

uninstallSkill(options: { name: string, target: string, env?: NodeJS.ProcessEnv }):
  | { ok: true, removed: { name, target, dir } }
  | { ok: false, error: 'bad-name'|'bad-target'|'not-found'|'not-owned' }

listInstalled(options: { env?: NodeJS.ProcessEnv }): Promise<Item[]>
type Item = { name, target, dir, repo: string|null, path: string|null, installedAt: string|null,
              files: number, owned: boolean, external: boolean }
```

规则细节：
- 超限错误文案固定为 `archive exceeds the 512 MiB download budget (received <N> bytes)`，N 是**实际字节数**（十进制，无千分位）。
- `signal` abort：`installSkill` 返回 `{ok:false, error:'cancelled'}`；下载中止用 fetch 的 signal，后续阶段在每步开始与拷贝循环每 50 个文件检查一次 `signal.aborted`；中止后清理临时目录，不留半装目录（已拷进技能根的目录要删掉）。
- `onProgress` 抛错必须被吞掉，不能影响安装。
- `listInstalled`：遍历两个技能根的**直接子目录**；有标记 → `owned:true, external:false`；没有标记但目录里有 `SKILL.md` → `owned:false, external:true, repo:null, path:null, installedAt:null`；两者都没有 → 跳过。`files` 用现有 countFiles。
- 标记文件 v2 追加 `path`（安装时用的子目录，可为 null）与 `files`（数量）；读取时对老标记（无这两个键）要能容忍。

## HTTP（前缀 /video-skills/api/v1）

所有响应 `content-type: application/json`、`cache-control: no-store`。

`POST /install` body `{ repo, path?, name?, targets? }`（targets 缺省 DEFAULT_TARGETS）
- 202 `{ ok:true, job: Job }`（此刻 phase 为 queued 或 download）
- 400 `{ ok:false, error:'bad-body'|'bad-repo'|'bad-targets' }`
- 409 `{ ok:false, error:'busy' }`（同时在跑的任务已达 8 个）

`GET /install/<id>` → 200 `{ ok:true, job: Job }` / 404 `{ ok:false, error:'unknown-job' }`

`POST /install/<id>/cancel` → 200 `{ ok:true, job: Job }`（已结束的任务原样返回，phase 不变）/ 404

`POST /uninstall` body `{ name, target }`
- 200 `{ ok:true, removed:{ name, target, dir } }`
- 400 `{ ok:false, error:'bad-body'|'bad-name'|'bad-target' }`
- 404 `{ ok:false, error:'not-found' }`
- 409 `{ ok:false, error:'not-owned' }`

`GET /installed` → `{ ok:true, items: Item[] }`（形状见上）

`GET /catalog`、`POST /refresh` 不变。

```ts
type Job = {
  id: string;                    // 'job-' + 8 hex
  repo: string;                  // 规范化后的 owner/repo
  targets: string[];             // 实际生效的目标
  phase: 'queued'|'download'|'inspect'|'extract'|'copy'|'done'|'error'|'cancelled';
  bytes: number;                 // 已下载字节
  files: number;                 // 归档条目数（inspect/extract 阶段）
  copied: number;                // 已拷贝文件数
  name: string|null;             // 解析出的技能目录名
  installed: { target, dir, files }[];   // 仅 done 时有内容
  warnings: string[];            // 仅 done 时有内容
  error: string|null;            // 失败时的 error code
  message: string|null;          // 失败时的完整人类可读文本，不得截断
  startedAt: string; updatedAt: string;  // ISO
}
```

任务表在内存里，最多保留 32 条（超出丢最老的），同一 job 完成后 10 分钟内仍可读。

## client（client/client.js）

- 顶部一行：`安装到` + 两个复选框 `Claude` / `DSH`（默认只勾 DSH）；选择存 localStorage 键 `dsh-video-skills.targets`（JSON 数组，读失败就回落到默认）；**不允许两个都取消**（点掉最后一个时忽略并显示提示）。
- 行内目标控件取消（顶部是唯一入口，行里不再有单选）。
- 仓库名是链接：`https://github.com/<repo>`，新标签打开（`target="_blank" rel="noreferrer"`）；条目有 `path` 时旁边再加一个 `路径` 链接指向 `https://github.com/<repo>/tree/HEAD/<path>`。
- 安装：`POST /install` 拿 job.id → 每 500 ms `GET /install/<id>`，行内显示阶段：
  - download → `下载中 <MB>`（bytes/1048576，一位小数）
  - inspect/extract → `解包中`
  - copy → `拷贝 <n> 文件`
  - done → 清掉阶段、重拉 `/installed`、显示已完成
  - error → 完整 message（换行、自动折行、不用省略号）
  - cancelled → `已取消`
  轮询期间那一行显示 `取消` 按钮 → `POST /install/<id>/cancel`；任务结束（done/error/cancelled）停止轮询。
- 已安装：`GET /installed` 的结果按 name 建索引；某行命中时显示 `已安装` 徽章 + 每个目标一个小勾（`Claude ✓` / `DSH ✓`）；`external` 的显示 `外部安装` 且不出现卸载按钮。
- 卸载：行内 `卸载` → 变成 `确认卸载？`，再点一次才 `POST /uninstall { name, target }`（对每个已由本插件安装的目标各发一次，串行）；403/409 之类错误按完整 message 显示。
- `只看已安装` 筛选 chip：打开后列表只显示已安装的条目（按 `/installed` 的 name 集合 + catalog 行匹配）。
- 错误展示：`whiteSpace: pre-wrap; wordBreak: break-word`，行内可见完整文本，不再用 `textOverflow: ellipsis`。

## 新增 i18n 键（zh/en 必须同键集，且 client 内联字典必须与 locale/*.json 逐字节一致）

`videoSkills.installTo` `videoSkills.filter.installedOnly` `videoSkills.phase.download` `videoSkills.phase.unpack` `videoSkills.phase.copy` `videoSkills.cancel` `videoSkills.cancelled` `videoSkills.uninstall` `videoSkills.uninstallConfirm` `videoSkills.installedBadge` `videoSkills.external` `videoSkills.targetHint` `videoSkills.openRepo` `videoSkills.openPath` `videoSkills.error.ownership`

## 不变的东西

- 不执行下载来的任何代码；install.js 内仍禁止 child_process/npm/git。
- 单文件 10 MiB 跳过规则不变（warning 文案不变、仍去重）。
- `GET /catalog` 的形状、缓存与离线快照不变。
- 工具名不变；`video_skill_install` 的 targets 缺省改为 `["dsh"]`；新增工具 `video_skill_uninstall({ name, target })`。
