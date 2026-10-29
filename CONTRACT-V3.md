# CONTRACT-V3 — 大小展示与下载进度（锁定，勿改）

用户诉求（m01167）：① 技能中心看不到装好的技能 / 装到哪了 ② 每个 skill 标出大小 ③ 安装时能看到「下了多少 / 总共多少」。
用户决策：② 用 GitHub API 仓库大小 + 本地缓存 7 天；③ 用「已下载 X MB + 不确定进度条，结束报归档 Y MB/N 文件」（不问「总共」，因为 codeload 三端点都不给 Content-Length）。

## 已核实的事实（不要重新猜）
- 归档端点 https://codeload.github.com/<repo>/tar.gz/HEAD 一律 Transfer-Encoding: chunked，HEAD/legacy/zip/Range 均无 Content-Length → 归档总长度不可知。
- https://api.github.com/repos/<owner>/<repo> 返回 size（KB，含 .git）；未认证限额 60/h（响应头 x-ratelimit-remaining / x-ratelimit-reset，后者为秒级 epoch）。
- jsDelivr 对大仓库 403，已放弃。
- 现有代码锚点（v0.1.3，提交 fb27fa1）：
  - src/host/catalog.js:31-45 mapEntry(raw)；:47-59 normalizeCatalog(payload,{stale})；:114-127 loadCatalog(options)；:130-135 refreshCatalog
  - src/host/index.js:16 API_BASE='/video-skills/api/v1'；:88-91 /catalog GET；:95 /installed；:99 /install POST；:128 /install/<id>；:138 /cancel；:148 /uninstall；:162 /refresh；:212-216 registerRoute + ctx.inject(['webServer'])
  - src/host/install.js:261-302 downloadArchive(...)→total；:290 report({phase:'download',bytes:total})；:399-444 listInstalled()（Item 现为 {name,target,dir,repo,path,installedAt,files,owned,external}）；:481-586 installSkill()
  - src/host/jobs.js:25-42 copyJob；:90-99 applyProgress；:101-122 settle；:143-160 初始 job 形状
- profile 用 link: 指向本仓库：改动立即落盘，但宿主需重启才重新编译；本会话活宿主 3080 已加载 v2（有 video_skill_uninstall）。

## 1. host 半边（agent A）

### 1.1 新文件 src/host/sizes.js（导出这些名字，签名别改）
- SIZES_FILE = path.join(os.homedir(), '.dsh', 'video-skills', 'sizes.json')
- SIZE_TTL_MS = 7 * 24 * 60 * 60 * 1000
- GITHUB_REPO_API = 'https://api.github.com/repos/'
- sizeOf(store, repo, now = Date.now()) → number|null（缺失/过期/missing 都是 null）
- loadSizeStore({ file = SIZES_FILE } = {}) → { entries: { [repo]: { bytes, at, missing? } } }；坏 JSON 或读失败 → { entries: {} }
- saveSizeStore(store, { file = SIZES_FILE } = {})：尽力而为，先写 .tmp 再 rename；异常吞掉
- createSizeWarmer({ repos, store, file, fetchImpl, clock, token } = {}) → { warm(count = 5), coverage(), setRepos(list) }

warm() 语义：
- 单飞：同一时刻只跑一个批次；重入返回 { fetched: 0, skipped: 0, blocked: true }
- 目标 = repos 里「store 无条目 或 now - at > SIZE_TTL_MS」的仓库，最多 count 个
- 请求：fetchImpl(GITHUB_REPO_API + repo, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-video-skills', 可选 authorization: 'Bearer ' + token } })；token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null
- 200 且 json.size 是有限数字 → entries[repo] = { bytes: size * 1024, at: clock() }；size 不合法 → { bytes: 0, missing: true, at }
- 404 → { bytes: 0, missing: true, at: clock() }（TTL 内不再重试）
- 403/429 或 x-ratelimit-remaining ≤ 5 → blockedUntil = max(blockedUntil, resetMs + 1000)（reset 取 x-ratelimit-reset 秒级；缺失则 clock() + 600000），停止本批并返回 blocked: true；clock() < blockedUntil 时 warm 直接返回 blocked 且不发任何请求
- 网络/解析异常：不写 store，继续下一个；连续 3 次异常即停止本批
- 批次结束若 entries 有变化 → await saveSizeStore(store, { file })
- coverage() → { known, total }：known = repos 中在 TTL 内且 bytes > 0 的数量；total = repos.length

### 1.2 src/host/catalog.js
- mapEntry(raw, sizes = null)：新增字段 sizeBytes = sizeOf(sizes, repo)（无 store 为 null），追加在现有 8 个字段之后
- normalizeCatalog(payload, { stale = false, sizes = null } = {})：响应体新增 sizes: { known, total }；store 缺省时 { known: 0, total: entries.length }
- loadCatalog / refreshCatalog 接受 sizes 并透传

### 1.3 src/host/index.js
- apply 时创建 size store 与 warmer（repos 初值取自当前 entries 的 repo 列表；每次 /catalog 成功后用新 entries 刷新 warmer 的 repos）
- 后台预热：setInterval(() => warmer.warm(5), 60000)，用 ctx.effect 的 disposer clearInterval
- GET /catalog：store 传给 loadCatalog；响应 sizes 优先取 warmer.coverage()

### 1.4 src/host/install.js
- installSkill 里 downloadArchive 返回后补一条：report({ phase: 'download', bytes: total, archiveBytes: total })（既有 bytes 语义不变）
- 新增 measureDir(dir)：遍历求和，跳过 .dsh-video-skills.json 自身标记，与 countFiles 一样跳过 .git/ 与 node_modules/
- listInstalled() 每个 Item 增加 bytes（owned 与 external 都要；失败记 0）

### 1.5 src/host/jobs.js
- job 初始形状与 copyJob 增加 archiveBytes（init null）；applyProgress 接受 progress.archiveBytes（有限数字才写）

### 1.6 测试
- 覆盖：sizeOf TTL 过期；loadSizeStore 坏 JSON；warm 一次写入 store / 404 → missing / 403 → blocked 后不再发请求；coverage；listInstalled 带 bytes；job 折入 archiveBytes；/catalog 响应带 sizeBytes 与 sizes
- 一律用假 fetchImpl，禁止真实联网；最多 2 次真实 GitHub 调用做人工 sanity（配额 60/h）

## 2. client 半边（agent B）
- 行内大小徽章：entry.sizeBytes 是数字 → 约 3.6 MB（1 位小数，≥1024 KB 转 MB、≥1024 MB 转 GB，前缀 ≈）；否则 —。title：已知「GitHub 仓库大小（含 .git），本地缓存 7 天」；未知「尚未取得大小（后台预取，约每小时 60 条）」。位置：repo 名与星数/徽章同一行，不新增行高
- 进度区：queued → 排队中；download → 已下载 3.2 MB + 不确定进度条（CSS keyframes 平移，高 2-3px，不改变行高）；download 之后（inspect/extract）→ 归档 72.5 MB / 254 文件（用 job.archiveBytes 与 job.files）；copy → 拷贝 n 文件；done → 每个 target 一行 dir（files 文件，Z MB），installed[].bytes 缺失则省略大小
- 已安装行：/installed 的 Item.bytes 显示为磁盘占用，与 files 同行
- 大小覆盖率：/catalog 的 sizes.known/total → 共 373 个技能 · 大小 49/373；缺字段则只显示原句
- i18n 新增键（zh-CN 与 en-US 键集必须一致，JSON 与内联字典字节一致）：sizeUnknown、sizeHintKnown、sizeHintUnknown、sizeCoverage、phaseQueued、phaseDownloaded、phaseArchive、installedBytes
- 硬约束不变：无 import/export；require 白名单只有 ['react']；dsh.client.inject 保持 []；经典 script factory；不引第三方

## 3. 非目标
- 不发版、不改 package.json 的 version、不动 README*、CONTRACT*、data/、不跑 git、不 publish
- 不改 /install 的 202/job 协议、不改卸载语义、不引入 rescan