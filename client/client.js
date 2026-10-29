/**
 * dsh-video-skills — browser half: the video-skills catalog page.
 *
 * Hand-written CJS factory bundle. DSH loads a client bundle as a classical
 * script whose only module-scope act is REGISTERING a factory: the body runs on
 * first materialization, so every side effect (and every require) lives inside
 * the factory closure. There is no build step and no ESM syntax here.
 *
 * The single specifier required is "react", a platform seed word: the web
 * frontend builds its module table with
 *   staticModules: { react, "react/jsx-runtime", "react-dom",
 *     "react-dom/client", "@deepseek-ai/cordis", zod,
 *     "@tanstack/react-virtual", "@deepseek-ai/dsh-client-store",
 *     "@deepseek-ai/dsh-client-ui-slots",
 *     "@deepseek-ai/dsh-client-ui-primitives",
 *     "@deepseek-ai/dsh-client-ui-dockkit" }
 * and dsh-client-modules resolves seed words before any graph row, so no
 * dsh.client.inject entry is needed for them. Everything visual is therefore
 * built from plain React plus inline styles.
 *
 * Copy: locale/zh-CN.json and locale/en-US.json are the authored source. A
 * classical script cannot read JSON synchronously, so the same dictionaries are
 * inlined in the factory below, and test/client-smoke.mjs asserts exact
 * key/value parity with those two files — drift breaks the test, not the UI.
 */
window.__ModuleLoader__.load({
	id: "dsh-video-skills",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");
		var h = React.createElement;
		var useState = React.useState;
		var useEffect = React.useEffect;
		var useMemo = React.useMemo;
		var useCallback = React.useCallback;
		var useRef = React.useRef;

		/** Locale namespace this package registers (also the page seat locale field). */
		var NS = "dsh-video-skills";
		/** HTTP base from CONTRACT.md, resolved document-relative — never origin-absolute. */
		var API_BASE = "video-skills/api/v1";
		/** Fallback shell when ctx.get("webUiExtensions") does not supply a parent. */
		var SETTINGS_SECTION = "settings.section";
		/** Slot the parent service mirrors its page seats into; a seat without it is invisible. */
		var WEB_EXTENSION_SLOT = "web-ui.extension";
		/** Parent service id the settings family exposes through ctx.get(). */
		var WEB_UI_EXTENSIONS = "webUiExtensions";
		var PAGE_KEY = "video-skills";
		var PAGE_ORDER = 900;
		/** Hard row ceiling from the contract, and the page step of "load more". */
		var ROW_LIMIT = 100;
		var PAGE_STEP = 20;
		var TARGETS = ["claude", "dsh"];
		/** CONTRACT v2 default: a fresh install goes to DSH unless the user says otherwise. */
		var DEFAULT_TARGETS = ["dsh"];
		/** localStorage key holding the install-target selection as a JSON array. */
		var TARGETS_KEY = "dsh-video-skills.targets";
		/** Poll cadence of one background install job, in milliseconds. */
		var POLL_MS = 500;
		/** Bytes per MiB, for the download phase line. */
		var MIB = 1048576;
		/** Bytes per GiB, the top rung of the human-size ladder. */
		var GIB = MIB * 1024;
		/** Keyframes of the indeterminate download bar; an inline style cannot carry @keyframes. */
		var PROGRESS_CSS = "@keyframes dsh-video-skills-progress { from { transform: translateX(-100%); } to { transform: translateX(320%); } }"
			+ ".dsh-video-skills-progress { animation: dsh-video-skills-progress 1.15s ease-in-out infinite; }"
			+ "@media (prefers-reduced-motion: reduce) { .dsh-video-skills-progress { animation: none; } }";
		/** Public web root of a catalog repository. */
		var GITHUB = "https://github.com/";
		var KINDS = ["general", "promo", "explainer", "editing", "shorts", "avatar", "story", "motion", "craft", "music"];
		var GRADES = ["safe", "caution"];

		/** Chinese copy — mirrors locale/zh-CN.json key for key. */
		var zh = {
			"videoSkills.title": "视频技能",
			"videoSkills.subtitle": "浏览 awesome-claude-video-skills 目录，一键安装到本地技能目录",
			"videoSkills.filter.search": "搜索仓库或描述…",
			"videoSkills.filter.kind": "类型",
			"videoSkills.filter.kind.all": "全部类型",
			"videoSkills.filter.minStars": "至少 {n} 星",
			"videoSkills.filter.grade": "评级",
			"videoSkills.filter.grade.all": "全部评级",
			"videoSkills.filter.license": "许可证",
			"videoSkills.filter.license.all": "全部许可证",
			"videoSkills.filter.reset": "重置筛选",
			"videoSkills.refresh": "刷新目录",
			"videoSkills.refreshing": "刷新中…",
			"videoSkills.loading": "正在加载目录…",
			"videoSkills.empty": "没有符合条件的技能",
			"videoSkills.count": "共 {n} 个技能",
			"videoSkills.stale": "离线快照",
			"videoSkills.more": "加载更多",
			"videoSkills.noMore": "已显示全部",
			"videoSkills.stars": "{n} 星",
			"videoSkills.install": "安装",
			"videoSkills.installing": "安装中…",
			"videoSkills.installed": "已安装",
			"videoSkills.target.label": "安装到",
			"videoSkills.target.claude": "Claude",
			"videoSkills.target.dsh": "DSH",
			"videoSkills.files": "{n} 个文件",
			"videoSkills.error.load": "目录加载失败：{message}",
			"videoSkills.error.refresh": "刷新失败：{message}",
			"videoSkills.error.install": "安装失败：{message}",
			"videoSkills.error.exists": "目标目录已存在且不属于该仓库：{dir}",
			"videoSkills.error.network": "网络不可用，请稍后重试",
			"videoSkills.kind.general": "综合",
			"videoSkills.kind.promo": "宣传片",
			"videoSkills.kind.explainer": "讲解",
			"videoSkills.kind.editing": "剪辑",
			"videoSkills.kind.shorts": "短视频",
			"videoSkills.kind.avatar": "数字人",
			"videoSkills.kind.story": "叙事",
			"videoSkills.kind.motion": "动效",
			"videoSkills.kind.craft": "手艺",
			"videoSkills.kind.music": "音乐",
			"videoSkills.grade.safe": "安全",
			"videoSkills.grade.caution": "需留意",
			"videoSkills.installTo": "安装到",
			"videoSkills.filter.installedOnly": "只看已安装",
			"videoSkills.phase.download": "下载中 {mb} MB",
			"videoSkills.phase.unpack": "解包中",
			"videoSkills.phase.copy": "拷贝 {n} 文件",
			"videoSkills.cancel": "取消",
			"videoSkills.cancelled": "已取消",
			"videoSkills.uninstall": "卸载",
			"videoSkills.uninstallConfirm": "确认卸载？",
			"videoSkills.installedBadge": "已安装",
			"videoSkills.external": "外部安装",
			"videoSkills.targetHint": "至少要保留一个安装目标",
			"videoSkills.openRepo": "在 GitHub 打开仓库",
			"videoSkills.openPath": "路径",
			"videoSkills.error.ownership": "该目录不属于本插件，无法卸载：{name}",
			"videoSkills.sizeUnknown": "—",
			"videoSkills.sizeHintKnown": "GitHub 仓库大小（含 .git），本地缓存 7 天",
			"videoSkills.sizeHintUnknown": "尚未取得大小（后台预取，约每小时 60 条）",
			"videoSkills.sizeCoverage": "共 {n} 个技能 · 大小 {known}/{total}",
			"videoSkills.phase.queued": "排队中",
			"videoSkills.phase.downloaded": "已下载 {mb} MB",
			"videoSkills.phase.archive": "归档 {mb} MB / {n} 文件",
			"videoSkills.installedBytes": "占用 {mb} MB",
			"videoSkills.claudeTargetHint": "装到 Claude 目标不会出现在技能中心（它只扫 ~/.dsh/skills、~/.agents/skills），技能本身照常可用"
			};

		/** English copy — mirrors locale/en-US.json key for key. */
		var en = {
			"videoSkills.title": "Video Skills",
			"videoSkills.subtitle": "Browse the awesome-claude-video-skills catalog and install a skill with one click",
			"videoSkills.filter.search": "Search repo or description…",
			"videoSkills.filter.kind": "Kind",
			"videoSkills.filter.kind.all": "All kinds",
			"videoSkills.filter.minStars": "At least {n} stars",
			"videoSkills.filter.grade": "Grade",
			"videoSkills.filter.grade.all": "All grades",
			"videoSkills.filter.license": "License",
			"videoSkills.filter.license.all": "All licenses",
			"videoSkills.filter.reset": "Reset filters",
			"videoSkills.refresh": "Refresh catalog",
			"videoSkills.refreshing": "Refreshing…",
			"videoSkills.loading": "Loading catalog…",
			"videoSkills.empty": "No skills match these filters",
			"videoSkills.count": "{n} skills",
			"videoSkills.stale": "Offline snapshot",
			"videoSkills.more": "Load more",
			"videoSkills.noMore": "All shown",
			"videoSkills.stars": "{n} stars",
			"videoSkills.install": "Install",
			"videoSkills.installing": "Installing…",
			"videoSkills.installed": "Installed",
			"videoSkills.target.label": "Install to",
			"videoSkills.target.claude": "Claude",
			"videoSkills.target.dsh": "DSH",
			"videoSkills.files": "{n} files",
			"videoSkills.error.load": "Catalog failed to load: {message}",
			"videoSkills.error.refresh": "Refresh failed: {message}",
			"videoSkills.error.install": "Install failed: {message}",
			"videoSkills.error.exists": "Target directory already exists and belongs to another repo: {dir}",
			"videoSkills.error.network": "Network unavailable, please retry later",
			"videoSkills.kind.general": "General",
			"videoSkills.kind.promo": "Promo",
			"videoSkills.kind.explainer": "Explainer",
			"videoSkills.kind.editing": "Editing",
			"videoSkills.kind.shorts": "Shorts",
			"videoSkills.kind.avatar": "Avatar",
			"videoSkills.kind.story": "Story",
			"videoSkills.kind.motion": "Motion",
			"videoSkills.kind.craft": "Craft",
			"videoSkills.kind.music": "Music",
			"videoSkills.grade.safe": "Safe",
			"videoSkills.grade.caution": "Caution",
			"videoSkills.installTo": "Install to",
			"videoSkills.filter.installedOnly": "Installed only",
			"videoSkills.phase.download": "Downloading {mb} MB",
			"videoSkills.phase.unpack": "Unpacking",
			"videoSkills.phase.copy": "Copying {n} files",
			"videoSkills.cancel": "Cancel",
			"videoSkills.cancelled": "Cancelled",
			"videoSkills.uninstall": "Uninstall",
			"videoSkills.uninstallConfirm": "Uninstall?",
			"videoSkills.installedBadge": "Installed",
			"videoSkills.external": "External",
			"videoSkills.targetHint": "Keep at least one install target selected",
			"videoSkills.openRepo": "Open the repository on GitHub",
			"videoSkills.openPath": "Path",
			"videoSkills.error.ownership": "That directory was not installed by this plugin: {name}",
			"videoSkills.sizeUnknown": "—",
			"videoSkills.sizeHintKnown": "GitHub repository size (includes .git), cached locally for 7 days",
			"videoSkills.sizeHintUnknown": "Size not fetched yet (background warming, about 60 per hour)",
			"videoSkills.sizeCoverage": "{n} skills · sizes {known}/{total}",
			"videoSkills.phase.queued": "Queued",
			"videoSkills.phase.downloaded": "Downloaded {mb} MB",
			"videoSkills.phase.archive": "Archive {mb} MB / {n} files",
			"videoSkills.installedBytes": "{mb} MB on disk",
			"videoSkills.claudeTargetHint": "The Claude target keeps this skill out of the skill explorer (it only scans ~/.dsh/skills and ~/.agents/skills); the skill still works"
			};

				var STYLE = {
			page: { display: "flex", flexDirection: "column", gap: "10px", padding: "16px", font: "13px/1.45 system-ui, -apple-system, Segoe UI, sans-serif", color: "inherit" },
			header: { display: "flex", flexDirection: "column", gap: "2px" },
			title: { margin: 0, fontSize: "15px", fontWeight: 600 },
			subtitle: { margin: 0, fontSize: "12px", color: "color-mix(in srgb, currentColor 74%, transparent)" },
			bar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" },
			row: { display: "flex", alignItems: "center", gap: "6px" },
			chip: { padding: "2px 9px", borderRadius: "999px", border: "1px solid color-mix(in srgb, currentColor 26%, transparent)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "11.5px", lineHeight: 1.6 },
			chipOn: { padding: "2px 9px", borderRadius: "999px", border: "1px solid var(--dsh-accent, #4f8cff)", background: "var(--dsh-accent, #4f8cff)", color: "#fff", cursor: "pointer", fontSize: "11.5px", lineHeight: 1.6 },
			input: { padding: "3px 8px", borderRadius: "6px", border: "1px solid color-mix(in srgb, currentColor 26%, transparent)", background: "transparent", color: "inherit", fontSize: "12.5px" },
			button: { padding: "3px 10px", borderRadius: "6px", border: "1px solid color-mix(in srgb, currentColor 26%, transparent)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "12.5px" },
			primary: { padding: "3px 12px", borderRadius: "6px", border: "1px solid var(--dsh-accent, #4f8cff)", background: "var(--dsh-accent, #4f8cff)", color: "#fff", cursor: "pointer", fontSize: "12.5px", fontWeight: 500 },
			list: { display: "flex", flexDirection: "column", gap: "0" },
			item: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: "10px", padding: "6px 0", borderTop: "1px solid color-mix(in srgb, currentColor 13%, transparent)" },
			body: { display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 },
			head: { display: "flex", alignItems: "baseline", gap: "0 8px", minWidth: 0 },
			repoLink: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12.5px", fontWeight: 600, color: "inherit", textDecoration: "none", borderBottom: "1px dotted color-mix(in srgb, currentColor 38%, transparent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: "0 1 auto", minWidth: 0 },
			pathLink: { fontSize: "10.5px", color: "var(--dsh-accent, #4f8cff)", textDecoration: "none", whiteSpace: "nowrap", flex: "0 0 auto" },
			tick: { fontSize: "10.5px", color: "#2f9e5f", whiteSpace: "nowrap" },
			desc: { margin: 0, fontSize: "12px", color: "color-mix(in srgb, currentColor 78%, transparent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
			meta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "color-mix(in srgb, currentColor 70%, transparent)", flex: "0 0 auto", marginLeft: "auto" },
			badge: { padding: "0 5px", borderRadius: "4px", border: "1px solid color-mix(in srgb, currentColor 20%, transparent)", fontSize: "10.5px", lineHeight: "15px" },
			badgeOn: { padding: "0 5px", borderRadius: "4px", border: "1px solid rgba(60,190,120,0.55)", background: "rgba(60,190,120,0.14)", color: "#2f9e5f", fontSize: "10.5px", lineHeight: "15px" },
			badgeStale: { padding: "0 5px", borderRadius: "4px", border: "1px solid rgba(210,150,40,0.55)", background: "rgba(210,150,40,0.14)", color: "#a97614", fontSize: "10.5px", lineHeight: "15px" },
			actions: { display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" },
			error: { color: "#d4382f", fontSize: "12px", margin: 0 },
			errorRow: { color: "#d4382f", fontSize: "11px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" },
			phase: { fontSize: "11px", color: "color-mix(in srgb, currentColor 74%, transparent)" },
			targetHint: { fontSize: "11px", color: "#a97614" },
			hint: { margin: 0, fontSize: "12px", color: "color-mix(in srgb, currentColor 74%, transparent)" },
			buttonDanger: { padding: "3px 10px", borderRadius: "6px", border: "1px solid rgba(212,56,47,0.6)", background: "rgba(212,56,47,0.1)", color: "#d4382f", cursor: "pointer", fontSize: "12.5px" },
			check: { display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", cursor: "pointer", color: "color-mix(in srgb, currentColor 88%, transparent)" },
			checkInput: { margin: 0, accentColor: "var(--dsh-accent, #4f8cff)" },
			phaseBox: { position: "relative", display: "block", margin: 0, fontSize: "11px", color: "color-mix(in srgb, currentColor 74%, transparent)" },
			barTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: "2px", overflow: "hidden", borderRadius: "999px", background: "color-mix(in srgb, currentColor 16%, transparent)", pointerEvents: "none" },
			barFill: { position: "absolute", top: 0, bottom: 0, width: "34%", borderRadius: "999px", background: "color-mix(in srgb, currentColor 56%, transparent)" },
			installedBox: { display: "flex", flexDirection: "column", minWidth: 0 },
			installedLine: { margin: 0, fontSize: "10.5px", color: "color-mix(in srgb, currentColor 64%, transparent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
			targetNote: { fontSize: "10.5px", lineHeight: "15px", color: "color-mix(in srgb, currentColor 62%, transparent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: "0 1 auto" }
			};

		/** Substitute {name} placeholders; an unknown placeholder is left verbatim. */
		function fmt(template, params) {
			if (typeof template !== "string") return "";
			if (params === undefined) return template;
			return template.replace(/\{(\w+)\}/g, function (match, name) {
				return params[name] === undefined ? match : String(params[name]);
			});
		}

		/**
		* Read one dictionary key for the active locale. The shell locale binding is
		* preferred; the inlined dictionary is the fallback, so a page never renders
		* a raw key when the shell has no binding yet.
		*/
		function readKey(table, key, params) {
			if (table !== null && typeof table === "object" && typeof table[key] === "string") return fmt(table[key], params);
			if (zh[key] !== undefined) return fmt(zh[key], params);
			return key;
		}

		/** Build the page translator: shell locale when bound, inlined dictionaries otherwise. */
		function translator(ctx) {
			var bound;
			try {
				if (ctx !== undefined && ctx !== null && ctx.locale && typeof ctx.locale.bind === "function") bound = ctx.locale.bind(NS);
			} catch (error) {
				bound = undefined;
			}
			/**
			* @param key - dictionary key.
			* @param params - placeholder values, substituted into the copy.
			* @returns the localized string, never throws.
			*/
			return function (key, params) {
				if (typeof bound === "function") {
					try {
						var text = bound(key, params);
						if (typeof text === "string" && text !== "" && text !== key) return text;
					} catch (error) {
						/* fall through to the inlined dictionaries */
					}
				}
				return readKey(zh, key, params);
			};
		}

		/** Resolve an API path document-relative: no hardcoded origin, no absolute path assumption. */
		function apiUrl(path) {
			var relative = API_BASE + path;
			try {
				if (typeof document !== "undefined" && document !== null && typeof document.baseURI === "string" && document.baseURI !== "" && typeof URL === "function") {
					return new URL(relative, document.baseURI).toString();
				}
			} catch (error) {
				/* keep the bare relative form below */
			}
			return relative;
		}

		/**
		* One JSON round-trip. Always resolves to {status, ok, body}; a transport
		* failure rejects with an Error carrying network:true so callers can tell
		* "could not reach the host" from "the host said no".
		*/
		function requestJson(path, init) {
			var options = init === undefined ? {} : init;
			var pending;
			try {
				pending = typeof fetch === "function" ? fetch(apiUrl(path), options) : Promise.reject(new Error("fetch-unavailable"));
			} catch (error) {
				pending = Promise.reject(error);
			}
			return pending.then(function (response) {
				return response.text().then(function (text) {
					var body = null;
					try {
						body = text === "" ? null : JSON.parse(text);
					} catch (error) {
						body = null;
					}
					return { status: response.status, ok: response.ok === true && body !== null, body: body };
				});
			}, function (error) {
				var wrapped = new Error(error !== null && error !== undefined && error.message !== undefined ? String(error.message) : "network-error");
				wrapped.network = true;
				throw wrapped;
			});
		}

		/**
		* Read the optional section parent. Loose gate on purpose: the page-contribution
		* helper of the settings family accepts any string sectionId, and only its
		* deep-link opener insists on "web-ui-plugins" — we never deep-link, so the looser
		* shape is what actually mounts a seat (dsh-usage/lib/client.js:4029-4037).
		*/
		function serviceOf(ctx) {
			try {
				if (ctx === undefined || ctx === null || typeof ctx.get !== "function") return undefined;
				var candidate = ctx.get(WEB_UI_EXTENSIONS);
				if (candidate === null || typeof candidate !== "object") return undefined;
				if (typeof candidate.sectionId !== "string") return undefined;
				if (typeof candidate.registerPage !== "function") return undefined;
				return candidate;
			} catch (error) {
				return undefined;
			}
		}

		/**
		* Seat the one page seat: through the parent service when present, through this
		* plugin own slot registry otherwise. Mirrors the guarded reference pattern:
		* options carry id (not key) and the component travels as the second argument.
		*/
		function registerSeat(ctx, seat, target) {
			if (target === "integrated") {
				var service = serviceOf(ctx);
				if (service === undefined) throw new Error("webUiExtensions service is unavailable");
				return service.registerPage(seat);
			}
			if (ctx === undefined || ctx === null) return undefined;
			var slots = ctx.slots;
			if (slots === null || typeof slots !== "object" || typeof slots.register !== "function") return undefined;
			return slots.register({
				name: SETTINGS_SECTION,
				id: seat.key,
				order: seat.order,
				label: seat.label,
				locale: seat.locale,
				inject: seat.inject
			}, seat.component);
		}

		/**
		* Keep one reachable seat while the parent service, and the slot it mirrors into,
		* arrive after this plugin: reconcile on every slot change instead of one attempt
		* at activation time (dsh-usage/lib/client.js:4049-4113).
		*/
		function installPage(ctx) {
			var t = translator(ctx);
			var seat = {
				key: PAGE_KEY,
				order: PAGE_ORDER,
				locale: NS,
				label: function () {
					try {
						return t("videoSkills.title");
					} catch (error) {
						return "Video Skills";
					}
				},
				inject: function () {
					return { t: t };
				},
				component: VideoSkillsPage
			};
			var disposeSeat;
			var current;
			var reconciling = false;
			var disposed = false;
			var warn = function (target, error) {
				try {
					console.warn("[dsh-video-skills] page " + PAGE_KEY + " could not be mounted in " + target, error);
				} catch (ignored) {
					/* console may be unavailable in a constrained shell */
				}
			};
			var reconcile = function () {
				if (disposed || reconciling) return;
				var slots = ctx === undefined || ctx === null ? undefined : ctx.slots;
				if (slots === null || typeof slots !== "object" || typeof slots.register !== "function") return;
				var target = serviceOf(ctx) === undefined ? "legacy" : "integrated";
				if (current === target) return;
				var slotName = target === "integrated" ? WEB_EXTENSION_SLOT : SETTINGS_SECTION;
				if (typeof slots.spec === "function" && slots.spec(slotName) === undefined) return;
				reconciling = true;
				var previous = current;
				var disposePrevious = disposeSeat;
				current = undefined;
				disposeSeat = undefined;
				if (typeof disposePrevious === "function") {
					try {
						disposePrevious();
					} catch (error) {
						/* a seat that is already gone is not a failure */
					}
				}
				try {
					disposeSeat = registerSeat(ctx, seat, target);
					current = target;
				} catch (error) {
					warn(target, error);
					if (previous !== undefined) {
						try {
							disposeSeat = registerSeat(ctx, seat, previous);
							current = previous;
						} catch (restoreError) {
							warn(previous, restoreError);
						}
					}
				} finally {
					reconciling = false;
				}
			};
			try {
				if (typeof ctx.on === "function") ctx.on("slots/changed", reconcile);
			} catch (error) {
				/* a shell without events still gets the activation-time attempt below */
			}
			reconcile();
			return function () {
				if (disposed) return;
				disposed = true;
				if (typeof disposeSeat === "function") {
					try {
						disposeSeat();
					} catch (error) {
						/* dispose is best-effort */
					}
				}
				disposeSeat = undefined;
				current = undefined;
			};
		}

		/** Map an /install failure body onto one inline error line. */
		function installErrorText(t, result) {
			var body = result !== null && result !== undefined ? result.body : null;
			if (body !== null && typeof body === "object") {
				if (body.error === "exists") return t("videoSkills.error.exists", { dir: typeof body.dir === "string" ? body.dir : "" });
				if (typeof body.message === "string" && body.message !== "") return t("videoSkills.error.install", { message: body.message });
				if (typeof body.error === "string" && body.error !== "") return t("videoSkills.error.install", { message: body.error });
			}
			return t("videoSkills.error.install", { message: "HTTP " + String(result !== undefined && result !== null ? result.status : "?") });
		}

		/** Shallow copy of a plain map with one key replaced, or dropped when value is undefined. */
		function patchMap(map, name, value) {
			var next = {};
			for (var key in map) {
				if (Object.prototype.hasOwnProperty.call(map, key) && key !== name) next[key] = map[key];
			}
			if (value !== undefined) next[name] = value;
			return next;
		}

		/** The row view of one host Job: only what the row renders survives, plus the local cancelling flag. */
		function jobView(job, previous) {
			var source = job !== null && job !== undefined && typeof job === "object" ? job : {};
			var prior = previous !== null && previous !== undefined ? previous : { id: "", cancelling: false };
			return {
				id: typeof source.id === "string" && source.id !== "" ? source.id : prior.id,
				phase: typeof source.phase === "string" ? source.phase : "",
				bytes: Number(source.bytes) || 0,
				archiveBytes: Number(source.archiveBytes) || 0,
				files: Number(source.files) || 0,
				copied: Number(source.copied) || 0,
				message: typeof source.message === "string" ? source.message : "",
				error: typeof source.error === "string" ? source.error : "",
				cancelling: prior.cancelling === true
			};
		}

		/** Copy of one row view: state is never mutated in place. */
		function copyJob(view) {
			return {
				id: view.id,
				phase: view.phase,
				bytes: view.bytes,
				archiveBytes: view.archiveBytes,
				files: view.files,
				copied: view.copied,
				message: view.message,
				error: view.error,
				cancelling: view.cancelling === true
			};
		}

		/** A phase no longer changes: polling stops and the cancel control disappears. */
		function isTerminal(phase) {
			return phase === "done" || phase === "error" || phase === "cancelled";
		}

		/** A job the host accepted and has not finished yet. */
		function isRunning(job) {
			return job !== null && job !== undefined && typeof job.phase === "string" && job.phase !== "" && isTerminal(job.phase) !== true;
		}

		/** Human size of a byte count: whole bytes below 1 KB, then one decimal for KB / MB / GB. Empty when the value is not a byte total. */
		function formatBytes(bytes) {
			if (typeof bytes !== "number" || isFinite(bytes) !== true || bytes < 0) return "";
			if (bytes < 1024) return String(Math.round(bytes)) + " B";
			if (bytes < MIB) return (bytes / 1024).toFixed(1) + " KB";
			if (bytes < GIB) return (bytes / MIB).toFixed(1) + " MB";
			return (bytes / GIB).toFixed(1) + " GB";
		}

		/**
		* The one line an install job renders. done and error carry none: done clears the
		* phase and refreshes /installed, error renders the host message in full instead.
		*/
		function phaseText(t, job) {
			if (job === null || job === undefined || typeof job !== "object") return "";
			var phase = job.phase;
			if (phase === "queued") return t("videoSkills.phase.queued");
			if (phase === "download") return t("videoSkills.phase.downloaded", { mb: ((Number(job.bytes) || 0) / MIB).toFixed(1) });
			if (phase === "inspect" || phase === "extract") {
				var archiveBytes = Number(job.archiveBytes) || 0;
				if (archiveBytes > 0) return t("videoSkills.phase.archive", { mb: (archiveBytes / MIB).toFixed(1), n: Number(job.files) || 0 });
				return t("videoSkills.phase.unpack");
			}
			if (phase === "copy") return t("videoSkills.phase.copy", { n: Number(job.copied) || 0 });
			if (phase === "cancelled") return t("videoSkills.cancelled");
			return "";
		}

		/** The full host failure text of one job: never truncated, never replaced by a code. */
		function jobErrorText(t, job) {
			if (job !== null && job !== undefined && typeof job.message === "string" && job.message !== "") return job.message;
			if (job !== null && job !== undefined && typeof job.error === "string" && job.error !== "") return t("videoSkills.error.install", { message: job.error });
			return t("videoSkills.error.install", { message: "error" });
		}

		/** Map an /uninstall failure onto one inline line; the host text wins, ownership is spelled out. */
		function uninstallErrorText(t, result, name) {
			var body = result !== null && result !== undefined ? result.body : null;
			if (body !== null && typeof body === "object") {
				if (body.error === "not-owned") return t("videoSkills.error.ownership", { name: typeof body.name === "string" && body.name !== "" ? body.name : name });
				if (typeof body.message === "string" && body.message !== "") return body.message;
				if (typeof body.error === "string" && body.error !== "") return body.error + " (HTTP " + String(result.status) + ")";
			}
			return "HTTP " + String(result !== undefined && result !== null ? result.status : "?");
		}

		/** GitHub home of one catalog entry. */
		function repoUrl(repo) {
			return GITHUB + String(repo);
		}

		/** GitHub tree URL of the catalog entry subdirectory, when it has one. */
		function pathUrl(repo, path) {
			return GITHUB + String(repo) + "/tree/HEAD/" + String(path);
		}

		/** Last non-empty path segment of a repo or a skill path. */
		function leafName(value) {
			if (typeof value !== "string" || value === "") return "";
			var parts = value.split("/");
			for (var index = parts.length - 1; index >= 0; index -= 1) {
				if (parts[index] !== "") return parts[index];
			}
			return "";
		}

		/** Keep only known targets, in contract order: storage may hold anything. */
		function normalizeTargets(value) {
			var output = [];
			if (!Array.isArray(value)) return output;
			for (var index = 0; index < TARGETS.length; index += 1) {
				if (value.indexOf(TARGETS[index]) >= 0) output.push(TARGETS[index]);
			}
			return output;
		}

		/** The storage holding the target selection, or null when the browser refuses one. */
		function targetStorage() {
			try {
				if (typeof localStorage !== "undefined" && localStorage !== null && typeof localStorage.getItem === "function") return localStorage;
			} catch (error) {
				/* a privacy-mode getter can throw; window.localStorage may still answer */
			}
			try {
				if (typeof window !== "undefined" && window !== null && window.localStorage !== null && typeof window.localStorage === "object") return window.localStorage;
			} catch (error) {
				/* no storage at all is a valid browser state */
			}
			return null;
		}

		/** Read the stored target selection; an unreadable or empty choice falls back to the default. */
		function readTargets() {
			var fallback = DEFAULT_TARGETS.slice();
			var store = targetStorage();
			if (store === null) return fallback;
			try {
				var raw = store.getItem(TARGETS_KEY);
				if (typeof raw !== "string" || raw === "") return fallback;
				var list = normalizeTargets(JSON.parse(raw));
				return list.length > 0 ? list : fallback;
			} catch (error) {
				return fallback;
			}
		}

		/** Persist the target selection; a full or disabled store leaves the in-memory choice intact. */
		function writeTargets(list) {
			var store = targetStorage();
			if (store === null) return;
			try {
				store.setItem(TARGETS_KEY, JSON.stringify(list));
			} catch (error) {
				/* storage is a convenience here, not the source of truth */
			}
		}

		/**
		* Index /installed by name (the contract shape) and keep a repo alias: the skills
		* root knows a directory name while a catalog row knows its repository.
		*/
		function indexInstalled(items) {
			var byName = {};
			var byRepo = {};
			var list = Array.isArray(items) ? items : [];
			for (var index = 0; index < list.length; index += 1) {
				var item = list[index];
				if (item === null || typeof item !== "object" || typeof item.name !== "string" || item.name === "") continue;
				var group = byName[item.name];
				if (group === undefined) {
					group = { name: item.name, targets: [], owned: [], external: false, repo: null, path: null, rows: [] };
					byName[item.name] = group;
				}
				if (typeof item.target === "string" && group.targets.indexOf(item.target) < 0) group.targets.push(item.target);
				if (item.owned === true && typeof item.target === "string" && group.owned.indexOf(item.target) < 0) group.owned.push(item.target);
				if (item.external === true) group.external = true;
				if (typeof item.repo === "string" && item.repo !== "") group.repo = item.repo;
				if (typeof item.path === "string" && item.path !== "") group.path = item.path;
				group.rows.push({
					target: typeof item.target === "string" ? item.target : "",
					dir: typeof item.dir === "string" ? item.dir : "",
					files: Number(item.files) || 0,
					bytes: Number(item.bytes) || 0
				});
				if (typeof item.repo === "string" && item.repo !== "" && byRepo[item.repo] === undefined) byRepo[item.repo] = group.name;
			}
			return { byName: byName, byRepo: byRepo };
		}

		/** The installed projection of one catalog row, or null when nothing of it is installed. */
		function installedFor(index, entry) {
			if (entry === null || typeof entry !== "object") return null;
			var candidates = [];
			if (typeof entry.name === "string" && entry.name !== "") candidates.push(entry.name);
			if (typeof entry.repo === "string" && entry.repo !== "" && index.byRepo[entry.repo] !== undefined) candidates.push(index.byRepo[entry.repo]);
			if (typeof entry.path === "string" && entry.path !== "") candidates.push(leafName(entry.path));
			if (typeof entry.repo === "string" && entry.repo !== "") candidates.push(leafName(entry.repo));
			for (var index2 = 0; index2 < candidates.length; index2 += 1) {
				var hit = index.byName[candidates[index2]];
				if (hit !== undefined) return hit;
			}
			return null;
		}

		/** The size coverage /catalog reports, or null when the host does not carry it. */
		function catalogSizes(body) {
			var sizes = body !== null && typeof body === "object" ? body.sizes : null;
			if (sizes === null || typeof sizes !== "object") return null;
			var known = Number(sizes.known);
			var total = Number(sizes.total);
			if (isFinite(known) !== true || isFinite(total) !== true || total <= 0 || known < 0) return null;
			return { known: known, total: total };
		}

		/** The catalog page: target bar, filter bar, at most 100 rows, per-row install job and uninstall control. */
		function VideoSkillsPage(props) {
			var t = props !== undefined && props !== null && typeof props.t === "function" ? props.t : translator(undefined);

			var snapshotState = useState({ status: "loading", entries: [], stale: false, generated: "", sizes: null, error: "" });
			var snapshot = snapshotState[0];
			var setSnapshot = snapshotState[1];
			var installedState = useState({ byName: {}, byRepo: {} });
			var installed = installedState[0];
			var setInstalled = installedState[1];
			var jobsState = useState({});
			var jobs = jobsState[0];
			var setJobs = jobsState[1];
			var confirmingState = useState("");
			var confirming = confirmingState[0];
			var setConfirming = confirmingState[1];
			var targetState = useState(readTargets());
			var targets = targetState[0];
			var setTargets = targetState[1];
			var hintState = useState("");
			var hint = hintState[0];
			var setHint = hintState[1];
			var onlyInstalledState = useState(false);
			var onlyInstalled = onlyInstalledState[0];
			var setOnlyInstalled = onlyInstalledState[1];
			var filterState = useState({ kinds: [], minStars: 0, grade: "", license: "", search: "" });
			var filters = filterState[0];
			var setFilters = filterState[1];
			var visibleState = useState(PAGE_STEP);
			var visible = visibleState[0];
			var setVisible = visibleState[1];
			var rowErrorState = useState({});
			var rowErrors = rowErrorState[0];
			var setRowErrors = rowErrorState[1];
			var refreshingState = useState(false);
			var refreshing = refreshingState[0];
			var setRefreshing = refreshingState[1];

			/** Timer ids this page owns; the unmount cleanup empties it, so no poll outlives the page. */
			var runtime = useRef({ alive: true, timers: [] });

			var alive = function () {
				return runtime.current.alive === true;
			};

			var clearTimers = function () {
				var ids = runtime.current.timers;
				for (var index = 0; index < ids.length; index += 1) {
					try {
						clearTimeout(ids[index]);
					} catch (error) {
						/* a cleared id is already harmless */
					}
				}
				runtime.current.timers = [];
			};

			/** One tracked setTimeout: firing untracks itself, and never runs after unmount. */
			var later = function (fn, ms) {
				var id = setTimeout(function () {
					var ids = runtime.current.timers;
					var at = ids.indexOf(id);
					if (at >= 0) ids.splice(at, 1);
					if (runtime.current.alive !== true) return;
					try {
						fn();
					} catch (error) {
						/* one failing poll must not stop the rest of the page */
					}
				}, ms);
				runtime.current.timers.push(id);
				return id;
			};

			var loadCatalog = useCallback(function () {
				setSnapshot(function (previous) {
					return { status: "loading", entries: previous.entries, stale: previous.stale, generated: previous.generated, sizes: previous.sizes, error: "" };
				});
				requestJson("/catalog", { method: "GET" }).then(function (result) {
					if (!alive()) return;
					var body = result.body;
					if (result.ok !== true || body === null || body.ok !== true) {
						setSnapshot({ status: "error", entries: [], stale: false, generated: "", sizes: null, error: t("videoSkills.error.load", { message: "HTTP " + String(result.status) }) });
						return;
					}
					setSnapshot({
						status: "ready",
						entries: Array.isArray(body.entries) ? body.entries : [],
						stale: body.stale === true,
						generated: typeof body.generated === "string" ? body.generated : "",
						sizes: catalogSizes(body),
						error: ""
					});
				}, function (error) {
					if (!alive()) return;
					setSnapshot({
						status: "error",
						entries: [],
						stale: false,
						generated: "",
						sizes: null,
						error: error !== null && error !== undefined && error.network === true ? t("videoSkills.error.network") : t("videoSkills.error.load", { message: String(error !== null && error !== undefined ? error.message : error) })
					});
				});
			}, [t]);

			var loadInstalled = useCallback(function () {
				requestJson("/installed", { method: "GET" }).then(function (result) {
					if (!alive()) return;
					var body = result.body;
					if (result.ok !== true || body === null || body.ok !== true || !Array.isArray(body.items)) return;
					setInstalled(indexInstalled(body.items));
				}, function () {
					/* the installed badge is decoration: a failure leaves it empty, never blocks the page */
				});
			}, []);

			useEffect(function () {
				runtime.current.alive = true;
				try {
					loadCatalog();
					loadInstalled();
				} catch (error) {
					/* a throwing effect would blank the page; the inline error state carries it */
				}
				return function () {
					runtime.current.alive = false;
					clearTimers();
				};
			}, [loadCatalog, loadInstalled]);

			var refresh = function () {
				try {
					setRefreshing(true);
					requestJson("/refresh", { method: "POST" }).then(function () {
						setRefreshing(false);
						loadCatalog();
					}, function (error) {
						setRefreshing(false);
						setSnapshot(function (previous) {
							return {
								status: "error",
								entries: previous.entries,
								stale: previous.stale,
								generated: previous.generated,
								sizes: previous.sizes,
								error: t("videoSkills.error.refresh", { message: String(error !== null && error !== undefined ? error.message : error) })
							};
						});
					});
				} catch (error) {
					setRefreshing(false);
				}
			};

			/** Replace (or drop, with undefined) the job view of one row. */
			var updateJob = function (repo, value) {
				setJobs(function (previous) {
					var current = previous[repo];
					var next = typeof value === "function" ? value(current) : value;
					if (next === undefined || next === null) return patchMap(previous, repo, undefined);
					return patchMap(previous, repo, next);
				});
			};

			/** Describe a failed /install/<id> read as the row error it is. */
			var jobReadError = function (repo, status) {
				updateJob(repo, function (previous) {
					if (previous === undefined) return undefined;
					var next = copyJob(previous);
					next.phase = "error";
					next.message = t("videoSkills.error.install", { message: "HTTP " + String(status) });
					return next;
				});
			};

			/** One 500 ms step of the job poll: a terminal phase ends the chain, everything else reschedules. */
			var pollJob = function (repo, id) {
				if (!alive() || typeof id !== "string" || id === "") return;
				later(function () {
					requestJson("/install/" + encodeURIComponent(id), { method: "GET" }).then(function (result) {
						if (!alive()) return;
						var body = result.body === undefined ? null : result.body;
						var job = body !== null && typeof body === "object" && body.ok === true && body.job !== null && typeof body.job === "object" ? body.job : null;
						if (job === null) {
							jobReadError(repo, result.status);
							return;
						}
						var view = jobView(job, undefined);
						if (view.phase === "done") {
							updateJob(repo, undefined);
							loadInstalled();
							return;
						}
						setJobs(function (previous) {
							return patchMap(previous, repo, jobView(job, previous[repo]));
						});
						if (isTerminal(view.phase)) return;
						pollJob(repo, view.id !== "" ? view.id : id);
					}, function (error) {
						if (!alive()) return;
						jobReadError(repo, error !== null && error !== undefined && error.network === true ? t("videoSkills.error.network") : String(error !== null && error !== undefined ? error.message : error));
					});
				});
			};

			var install = function (entry) {
				var repo = String(entry.repo === undefined ? "" : entry.repo);
				var chosen = normalizeTargets(targets);
				if (chosen.length === 0) {
					setHint(t("videoSkills.targetHint"));
					return;
				}
				setConfirming("");
				setRowErrors(function (previous) {
					return patchMap(previous, repo, undefined);
				});
				var payload = { repo: repo, targets: chosen };
				if (typeof entry.path === "string" && entry.path !== "") payload.path = entry.path;
				if (typeof entry.name === "string" && entry.name !== "") payload.name = entry.name;
				try {
					requestJson("/install", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then(function (result) {
						if (!alive()) return;
						var body = result.body === undefined ? null : result.body;
						if (result.ok !== true || body === null || typeof body !== "object" || body.ok !== true || body.job === null || typeof body.job !== "object") {
							setRowErrors(function (previous) {
								return patchMap(previous, repo, installErrorText(t, result));
							});
							return;
						}
						var view = jobView(body.job, undefined);
						updateJob(repo, view);
						if (view.phase === "done") {
							updateJob(repo, undefined);
							loadInstalled();
							return;
						}
						if (isTerminal(view.phase) !== true) pollJob(repo, view.id);
					}, function (error) {
						if (!alive()) return;
						setRowErrors(function (previous) {
							return patchMap(previous, repo, error !== null && error !== undefined && error.network === true ? t("videoSkills.error.network") : t("videoSkills.error.install", { message: String(error !== null && error !== undefined ? error.message : error) }));
						});
					});
				} catch (error) {
					setRowErrors(function (previous) {
						return patchMap(previous, repo, t("videoSkills.error.install", { message: String(error !== null && error !== undefined ? error.message : error) }));
					});
				}
			};

			var cancelJob = function (repo) {
				var job = jobs[repo];
				if (job === undefined || isRunning(job) !== true || job.cancelling === true) return;
				updateJob(repo, function (previous) {
					var next = copyJob(previous);
					next.cancelling = true;
					return next;
				});
				try {
					requestJson("/install/" + encodeURIComponent(job.id) + "/cancel", { method: "POST" }).then(function (result) {
						if (!alive()) return;
						var body = result.body === undefined ? null : result.body;
						if (result.ok !== true || body === null || typeof body !== "object" || body.job === null || typeof body.job !== "object") return;
						setJobs(function (previous) {
							return patchMap(previous, repo, jobView(body.job, previous[repo]));
						});
					}, function () {
						/* the poll that is still in flight keeps governing the row */
					});
				} catch (error) {
					/* same: the row keeps its own phase until the poll answers */
				}
			};

			var toggleTarget = function (target) {
				var next = targets.indexOf(target) < 0
					? normalizeTargets(targets.concat([target]))
					: targets.filter(function (value) { return value !== target; });
				if (next.length === 0) {
					setHint(t("videoSkills.targetHint"));
					return;
				}
				setHint("");
				setTargets(next);
				writeTargets(next);
			};

			/** Two-step uninstall: one armed row at a time, then one serial /uninstall per owned target. */
			var uninstall = function (entry, hit) {
				if (hit === null || hit.owned.length === 0) return;
				var repo = String(entry.repo === undefined ? "" : entry.repo);
				if (confirming !== repo) {
					setConfirming(repo);
					return;
				}
				setConfirming("");
				var step = function (index) {
					if (index >= hit.owned.length) {
						loadInstalled();
						return;
					}
					setRowErrors(function (previous) {
						return patchMap(previous, repo, undefined);
					});
					try {
						requestJson("/uninstall", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ name: hit.name, target: hit.owned[index] })
						}).then(function (result) {
							if (!alive()) return;
							var body = result.body === undefined ? null : result.body;
							if (result.ok === true && body !== null && typeof body === "object" && body.ok === true) {
								step(index + 1);
								return;
							}
							setRowErrors(function (previous) {
								return patchMap(previous, repo, uninstallErrorText(t, result, hit.name));
							});
							step(index + 1);
						}, function (error) {
							if (!alive()) return;
							setRowErrors(function (previous) {
								return patchMap(previous, repo, error !== null && error !== undefined && error.network === true ? t("videoSkills.error.network") : t("videoSkills.error.install", { message: String(error !== null && error !== undefined ? error.message : error) }));
							});
							step(index + 1);
						});
					} catch (error) {
						setRowErrors(function (previous) {
							return patchMap(previous, repo, t("videoSkills.error.install", { message: String(error !== null && error !== undefined ? error.message : error) }));
						});
						step(index + 1);
					}
				};
				step(0);
			};

			var licenses = useMemo(function () {
				var seen = {};
				var list = [];
				var entries = snapshot.entries;
				for (var index = 0; index < entries.length; index += 1) {
					var item = entries[index];
					if (item === null || typeof item !== "object") continue;
					if (typeof item.license !== "string" || item.license === "" || seen[item.license] === true) continue;
					seen[item.license] = true;
					list.push(item.license);
				}
				list.sort();
				return list;
			}, [snapshot.entries]);

			var filtered = useMemo(function () {
				var needle = filters.search.trim().toLowerCase();
				var entries = snapshot.entries;
				var output = [];
				for (var index = 0; index < entries.length; index += 1) {
					var item = entries[index];
					if (item === null || typeof item !== "object") continue;
					if (onlyInstalled === true && installedFor(installed, item) === null) continue;
					if (filters.kinds.length > 0 && filters.kinds.indexOf(item.kind) < 0) continue;
					if (typeof item.stars === "number" && item.stars < filters.minStars) continue;
					if (filters.grade !== "" && item.grade !== filters.grade) continue;
					if (filters.license !== "" && item.license !== filters.license) continue;
					if (needle !== "") {
						var haystack = String(item.repo === undefined ? "" : item.repo) + " " + String(item.description === undefined ? "" : item.description);
						if (haystack.toLowerCase().indexOf(needle) < 0) continue;
					}
					output.push(item);
				}
				return output;
			}, [snapshot.entries, filters, onlyInstalled, installed]);

			var shown = filtered.slice(0, Math.min(visible, ROW_LIMIT));

			var setFilter = function (patch) {
				setFilters(function (previous) {
					var next = { kinds: previous.kinds, minStars: previous.minStars, grade: previous.grade, license: previous.license, search: previous.search };
					for (var name in patch) {
						if (Object.prototype.hasOwnProperty.call(patch, name)) next[name] = patch[name];
					}
					return next;
				});
				setVisible(PAGE_STEP);
			};

			var toggleKind = function (kind) {
				var current = filters.kinds;
				var next = current.indexOf(kind) < 0 ? current.concat([kind]) : current.filter(function (value) { return value !== kind; });
				setFilter({ kinds: next });
			};

			var header = h("div", { style: STYLE.header }, [
				h("h2", { key: "title", style: STYLE.title }, t("videoSkills.title")),
				h("p", { key: "subtitle", style: STYLE.subtitle }, t("videoSkills.subtitle"))
			]);

			var targetBar = h("div", { key: "targets", style: STYLE.bar }, [
				h("span", { key: "label", style: STYLE.hint }, t("videoSkills.installTo"))
			].concat(TARGETS.map(function (target) {
				var parts = [h("label", { key: target, style: STYLE.check, title: target === "claude" ? "~/.claude/skills" : "~/.dsh/skills" }, [
					h("input", {
						type: "checkbox",
						value: target,
						style: STYLE.checkInput,
						checked: targets.indexOf(target) >= 0,
						onChange: function () { try { toggleTarget(target); } catch (error) { } }
					}),
					t("videoSkills.target." + target)
				])];
				/** The skill explorer behind the shell only scans the DSH roots, so a Claude-only install is invisible there. */
				if (target === "claude" && targets.indexOf("claude") >= 0) {
					parts.push(h("span", { key: "claude-note", style: STYLE.targetNote, title: t("videoSkills.claudeTargetHint") }, t("videoSkills.claudeTargetHint")));
				}
				return parts;
			})).concat([
				h("button", {
					key: "onlyInstalled",
					type: "button",
					style: onlyInstalled === true ? STYLE.chipOn : STYLE.chip,
					onClick: function () { try { setOnlyInstalled(onlyInstalled !== true); setVisible(PAGE_STEP); } catch (error) { } }
				}, t("videoSkills.filter.installedOnly")),
				hint !== "" ? h("span", { key: "hint", style: STYLE.targetHint, role: "alert" }, hint) : null
			]));

			var kindChips = h("div", { key: "kinds", style: STYLE.bar }, [
				h("span", { key: "label", style: STYLE.hint }, t("videoSkills.filter.kind")),
				h("button", {
					key: "all",
					type: "button",
					style: filters.kinds.length === 0 ? STYLE.chipOn : STYLE.chip,
					onClick: function () { try { setFilter({ kinds: [] }); } catch (error) { } }
				}, t("videoSkills.filter.kind.all"))
			].concat(KINDS.map(function (kind) {
				return h("button", {
					key: kind,
					type: "button",
					style: filters.kinds.indexOf(kind) >= 0 ? STYLE.chipOn : STYLE.chip,
					onClick: function () { try { toggleKind(kind); } catch (error) { } }
				}, t("videoSkills.kind." + kind));
			})));

			var licenseOptions = [h("option", { key: "all", value: "" }, t("videoSkills.filter.license.all"))].concat(licenses.map(function (license) {
				return h("option", { key: license, value: license }, license);
			}));

			var controls = h("div", { key: "controls", style: STYLE.bar }, [
				h("label", { key: "search", style: STYLE.row }, [
					h("input", {
						type: "search",
						style: STYLE.input,
						placeholder: t("videoSkills.filter.search"),
						value: filters.search,
						onChange: function (event) { try { setFilter({ search: event.target.value }); } catch (error) { } }
					})
				]),
				h("label", { key: "stars", style: STYLE.row }, [
					h("span", { style: STYLE.hint }, t("videoSkills.filter.minStars", { n: filters.minStars })),
					h("input", {
						type: "range",
						min: 0,
						max: 5000,
						step: 50,
						value: filters.minStars,
						onChange: function (event) { try { setFilter({ minStars: Number(event.target.value) || 0 }); } catch (error) { } }
					})
				]),
				h("label", { key: "grade", style: STYLE.row }, [
					h("span", { style: STYLE.hint }, t("videoSkills.filter.grade")),
					h("select", {
						style: STYLE.input,
						value: filters.grade,
						onChange: function (event) { try { setFilter({ grade: event.target.value }); } catch (error) { } }
					}, [h("option", { key: "all", value: "" }, t("videoSkills.filter.grade.all"))].concat(GRADES.map(function (grade) {
						return h("option", { key: grade, value: grade }, t("videoSkills.grade." + grade));
					})))
				]),
				h("label", { key: "license", style: STYLE.row }, [
					h("span", { style: STYLE.hint }, t("videoSkills.filter.license")),
					h("select", {
						style: STYLE.input,
						value: filters.license,
						onChange: function (event) { try { setFilter({ license: event.target.value }); } catch (error) { } }
					}, licenseOptions)
				]),
				h("button", {
					key: "refresh",
					type: "button",
					style: STYLE.button,
					disabled: refreshing,
					onClick: function () { try { refresh(); } catch (error) { } }
				}, refreshing ? t("videoSkills.refreshing") : t("videoSkills.refresh")),
				h("button", {
					key: "reset",
					type: "button",
					style: STYLE.button,
					onClick: function () { try { setFilter({ kinds: [], minStars: 0, grade: "", license: "", search: "" }); } catch (error) { } }
				}, t("videoSkills.filter.reset"))
			]);

			var statusLine = null;
			if (snapshot.status === "loading") statusLine = h("p", { key: "status", style: STYLE.hint }, t("videoSkills.loading"));
			else if (snapshot.error !== "") statusLine = h("p", { key: "status", style: STYLE.error, role: "alert" }, snapshot.error);
			else {
				statusLine = h("div", { key: "status", style: STYLE.meta }, [
					h("span", { key: "count" }, snapshot.sizes !== null && snapshot.sizes !== undefined
						? t("videoSkills.sizeCoverage", { n: filtered.length, known: snapshot.sizes.known, total: snapshot.sizes.total })
						: t("videoSkills.count", { n: filtered.length })),
					snapshot.stale === true ? h("span", { key: "stale", style: STYLE.badgeStale }, t("videoSkills.stale")) : null
				]);
			}

			var rows = shown.map(function (entry, index) {
				var repo = String(entry.repo === undefined ? "" : entry.repo);
				var descText = String(entry.description === undefined ? "" : entry.description);
				var hit = installedFor(installed, entry);
				var job = jobs[repo];
				var running = isRunning(job);
				var hasPath = typeof entry.path === "string" && entry.path !== "";
				var sizeText = formatBytes(entry.sizeBytes);
				var downloading = job !== undefined && job.phase === "download";
				var sizeBadge = h("span", {
					key: "size",
					style: STYLE.badge,
					title: sizeText === "" ? t("videoSkills.sizeHintUnknown") : t("videoSkills.sizeHintKnown")
				}, sizeText === "" ? t("videoSkills.sizeUnknown") : "≈ " + sizeText);
				var line = "";
				var failure = "";
				if (job !== undefined) {
					if (job.phase === "error") failure = jobErrorText(t, job);
					else line = phaseText(t, job);
				}
				if (rowErrors[repo] !== undefined) failure = String(rowErrors[repo]);
				var metaBits = [
					h("span", { key: "stars", style: STYLE.badge }, t("videoSkills.stars", { n: Number(entry.stars) || 0 })),
					sizeBadge,
					h("span", { key: "grade", style: entry.grade === "caution" ? STYLE.badgeStale : STYLE.badge }, t("videoSkills.grade." + String(entry.grade)))
				];
				if (hit !== null) {
					metaBits.push(h("span", { key: "installed", style: STYLE.badgeOn }, t("videoSkills.installedBadge")));
					if (hit.external === true) metaBits.push(h("span", { key: "external", style: STYLE.badgeStale }, t("videoSkills.external")));
					TARGETS.forEach(function (target) {
						if (hit.targets.indexOf(target) < 0) return;
						metaBits.push(h("span", { key: "tick-" + target, style: STYLE.tick }, t("videoSkills.target." + target) + " ✓"));
					});
				}
				/** One line per installed target: where it landed, how many files, and the disk usage /installed reports. */
				var installedLines = hit === null || Array.isArray(hit.rows) !== true ? [] : hit.rows.map(function (row, at) {
					var text = row.dir !== "" ? row.dir : String(row.target);
					text += " · " + t("videoSkills.files", { n: row.files });
					if (row.bytes > 0) text += " · " + t("videoSkills.installedBytes", { mb: (row.bytes / MIB).toFixed(1) });
					return h("p", { key: "installed-" + String(at), style: STYLE.installedLine }, text);
				});
				var detail = repo;
				if (typeof entry.kind === "string" && entry.kind !== "") detail += " · " + t("videoSkills.kind." + entry.kind);
				if (typeof entry.license === "string" && entry.license !== "") detail += " · " + entry.license;

				var actions = [
					running === true ? h("button", {
						key: "cancel",
						type: "button",
						style: STYLE.button,
						disabled: job.cancelling === true,
						onClick: function () { try { cancelJob(repo); } catch (error) { } }
					}, t("videoSkills.cancel")) : null,
					h("button", {
						key: "install",
						type: "button",
						style: STYLE.primary,
						disabled: running === true,
						onClick: function () { try { install(entry); } catch (error) { } }
					}, running === true ? t("videoSkills.installing") : t("videoSkills.install")),
					hit !== null && hit.external !== true && hit.owned.length > 0 ? h("button", {
						key: "uninstall",
						type: "button",
						style: confirming === repo ? STYLE.buttonDanger : STYLE.button,
						onClick: function () { try { uninstall(entry, hit); } catch (error) { } }
					}, confirming === repo ? t("videoSkills.uninstallConfirm") : t("videoSkills.uninstall")) : null
				];

				return h("div", { key: repo + "#" + String(index), style: STYLE.item }, [
					h("div", { key: "body", style: STYLE.body }, [
						h("div", { key: "head", style: STYLE.head }, [
							h("a", { key: "repo", style: STYLE.repoLink, href: repoUrl(repo), target: "_blank", rel: "noreferrer", title: t("videoSkills.openRepo") }, repo),
							hasPath ? h("a", { key: "path", style: STYLE.pathLink, href: pathUrl(repo, entry.path), target: "_blank", rel: "noreferrer", title: t("videoSkills.openPath") }, t("videoSkills.openPath")) : null,
							h("span", { key: "meta", style: STYLE.meta }, metaBits)
						]),
						h("p", { key: "desc", style: STYLE.desc, title: descText }, descText),
						installedLines.length > 0 ? h("div", { key: "installed", style: STYLE.installedBox }, installedLines) : null,
						line !== "" ? h("div", { key: "phase", style: STYLE.phaseBox }, [
							h("span", { key: "text", style: STYLE.phase }, line),
							downloading === true ? h("span", { key: "bar", style: STYLE.barTrack }, h("span", { className: "dsh-video-skills-progress", style: STYLE.barFill })) : null
						]) : null,
						failure !== "" ? h("p", { key: "error", style: STYLE.errorRow, role: "alert" }, failure) : null
					]),
					h("div", { key: "actions", style: STYLE.actions }, actions)
				]);
			});

			var list = rows.length > 0
				? h("div", { style: STYLE.list }, rows)
				: snapshot.status === "ready" ? h("p", { style: STYLE.hint }, t("videoSkills.empty")) : null;

			var more = null;
			if (filtered.length > shown.length) {
				more = h("button", {
					type: "button",
					style: STYLE.button,
					onClick: function () { try { setVisible(Math.min(visible + PAGE_STEP, ROW_LIMIT)); } catch (error) { } }
				}, t("videoSkills.more"));
			} else if (filtered.length > 0) {
				more = h("span", { style: STYLE.hint }, t("videoSkills.noMore"));
			}

			var keyframes = h("style", { key: "progress-keyframes" }, PROGRESS_CSS);
			var children = [keyframes, header, targetBar, kindChips, controls, statusLine];
			if (list !== null) children.push(list);
			if (more !== null) children.push(h("div", { key: "more", style: STYLE.bar }, more));
			return h("div", { style: STYLE.page }, children);
		}

		/** Services this client plugin needs; both are shell-level and always mounted. */
		var inject = ["slots", "locale"];

		/**
		* Client plugin body: register the dictionaries, then seat the one page.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
				try {
				ctx.effect(function () {
					try {
						if (ctx.locale && typeof ctx.locale.register === "function") return ctx.locale.register(NS, { zh: zh, en: en });
					} catch (error) {
						/* dictionary registration is best-effort: the inlined copy still renders */
					}
					return function () { };
				}, "dsh-video-skills: dictionaries");
			} catch (error) {
				/* a shell without effect() must not take the page down with it */
			}
			try {
				ctx.effect(function () {
					return installPage(ctx);
				}, "dsh-video-skills: page");
			} catch (error) {
				try {
					console.warn("[dsh-video-skills] page registration failed", error);
				} catch (ignored) {
					/* console may be unavailable in a constrained shell */
				}
			}
		}

		module.exports.apply = apply;
		module.exports.inject = inject;
		return module.exports;
	}
});
