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

		/** Locale namespace this package registers (also the page seat locale field). */
		var NS = "dsh-video-skills";
		/** HTTP base from CONTRACT.md, resolved document-relative — never origin-absolute. */
		var API_BASE = "video-skills/api/v1";
		/** Fallback shell when ctx.get("webUiExtensions") does not supply a parent. */
		var SETTINGS_SECTION = "settings.section";
		/** Parent service id the settings family exposes through ctx.get(). */
		var WEB_UI_EXTENSIONS = "webUiExtensions";
		var PAGE_KEY = "video-skills";
		var PAGE_ORDER = 900;
		/** Hard row ceiling from the contract, and the page step of "load more". */
		var ROW_LIMIT = 100;
		var PAGE_STEP = 20;
		var TARGETS = ["claude", "dsh"];
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
			"videoSkills.target.claude": "Claude（~/.claude/skills）",
			"videoSkills.target.dsh": "DSH（~/.dsh/skills）",
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
			"videoSkills.grade.caution": "需留意"
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
			"videoSkills.target.claude": "Claude (~/.claude/skills)",
			"videoSkills.target.dsh": "DSH (~/.dsh/skills)",
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
			"videoSkills.grade.caution": "Caution"
		};

		var STYLE = {
			page: { display: "flex", flexDirection: "column", gap: "16px", padding: "20px", font: "14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif", color: "var(--dsh-text, #e6e6e6)" },
			header: { display: "flex", flexDirection: "column", gap: "4px" },
			title: { margin: 0, fontSize: "18px", fontWeight: 600 },
			subtitle: { margin: 0, fontSize: "12px", opacity: 0.7 },
			bar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" },
			row: { display: "flex", alignItems: "center", gap: "8px" },
			chip: { padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.45)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "12px" },
			chipOn: { padding: "3px 10px", borderRadius: "999px", border: "1px solid var(--dsh-accent, #4f8cff)", background: "var(--dsh-accent, #4f8cff)", color: "#fff", cursor: "pointer", fontSize: "12px" },
			input: { padding: "5px 8px", borderRadius: "6px", border: "1px solid rgba(127,127,127,0.45)", background: "transparent", color: "inherit", fontSize: "13px" },
			button: { padding: "5px 12px", borderRadius: "6px", border: "1px solid rgba(127,127,127,0.45)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "13px" },
			primary: { padding: "5px 14px", borderRadius: "6px", border: "1px solid var(--dsh-accent, #4f8cff)", background: "var(--dsh-accent, #4f8cff)", color: "#fff", cursor: "pointer", fontSize: "13px" },
			list: { display: "flex", flexDirection: "column", gap: "0" },
			item: { display: "flex", gap: "12px", padding: "12px 0", borderTop: "1px solid rgba(127,127,127,0.22)" },
			preview: { width: "112px", height: "63px", objectFit: "cover", borderRadius: "6px", flex: "0 0 auto", background: "rgba(127,127,127,0.12)" },
			body: { display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: "1 1 auto" },
			repo: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px", overflowWrap: "anywhere" },
			desc: { fontSize: "12px", opacity: 0.78, margin: 0 },
			meta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", fontSize: "11px", opacity: 0.75 },
			badge: { padding: "1px 7px", borderRadius: "4px", background: "rgba(127,127,127,0.18)", fontSize: "11px" },
			badgeOn: { padding: "1px 7px", borderRadius: "4px", background: "rgba(60,190,120,0.22)", color: "#3cbe78", fontSize: "11px" },
			badgeStale: { padding: "1px 7px", borderRadius: "4px", background: "rgba(230,170,60,0.2)", color: "#e6aa3c", fontSize: "11px" },
			actions: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flex: "0 0 auto" },
			error: { color: "#e5534b", fontSize: "12px", margin: 0 },
			errorRow: { color: "#e5534b", fontSize: "11px", maxWidth: "220px", textAlign: "right" },
			hint: { fontSize: "12px", opacity: 0.7 },
			radio: { display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", opacity: 0.85, cursor: "pointer" }
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
		function registerSeat(ctx, seat) {
			var service = serviceOf(ctx);
			if (service !== undefined) return service.registerPage(seat);
			if (ctx === undefined || ctx === null) return undefined;
			var slots = ctx.slots;
			if (slots === null || typeof slots !== "object" || typeof slots.register !== "function") return undefined;
			if (typeof slots.spec === "function" && slots.spec(SETTINGS_SECTION) === undefined) return undefined;
			return slots.register({
				name: SETTINGS_SECTION,
				id: seat.key,
				order: seat.order,
				label: seat.label,
				locale: seat.locale,
				inject: seat.inject
			}, seat.component);
		}

		/** Build the seat and register it exactly once; a failure warns, never throws. */
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
			try {
				return registerSeat(ctx, seat);
			} catch (error) {
				try {
					console.warn("[dsh-video-skills] page " + PAGE_KEY + " could not be mounted", error);
				} catch (ignored) {
					/* console may be unavailable in a constrained shell */
				}
				return undefined;
			}
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

		/** The catalog page: filter bar, at most 100 rows, per-row install control. */
		function VideoSkillsPage(props) {
			var t = props !== undefined && props !== null && typeof props.t === "function" ? props.t : translator(undefined);

			var snapshotState = useState({ status: "loading", entries: [], stale: false, generated: "", error: "" });
			var snapshot = snapshotState[0];
			var setSnapshot = snapshotState[1];
			var installedState = useState({});
			var installed = installedState[0];
			var setInstalled = installedState[1];
			var filterState = useState({ kinds: [], minStars: 0, grade: "", license: "", search: "" });
			var filters = filterState[0];
			var setFilters = filterState[1];
			var visibleState = useState(PAGE_STEP);
			var visible = visibleState[0];
			var setVisible = visibleState[1];
			var pendingState = useState({});
			var pending = pendingState[0];
			var setPending = pendingState[1];
			var targetState = useState({});
			var targetChoice = targetState[0];
			var setTargetChoice = targetState[1];
			var rowErrorState = useState({});
			var rowErrors = rowErrorState[0];
			var setRowErrors = rowErrorState[1];
			var refreshingState = useState(false);
			var refreshing = refreshingState[0];
			var setRefreshing = refreshingState[1];

			var loadCatalog = useCallback(function () {
				setSnapshot(function (previous) {
					return { status: "loading", entries: previous.entries, stale: previous.stale, generated: previous.generated, error: "" };
				});
				requestJson("/catalog", { method: "GET" }).then(function (result) {
					var body = result.body;
					if (result.ok !== true || body === null || body.ok !== true) {
						setSnapshot({ status: "error", entries: [], stale: false, generated: "", error: t("videoSkills.error.load", { message: "HTTP " + String(result.status) }) });
						return;
					}
					setSnapshot({
						status: "ready",
						entries: Array.isArray(body.entries) ? body.entries : [],
						stale: body.stale === true,
						generated: typeof body.generated === "string" ? body.generated : "",
						error: ""
					});
				}, function (error) {
					setSnapshot({
						status: "error",
						entries: [],
						stale: false,
						generated: "",
						error: error !== null && error !== undefined && error.network === true ? t("videoSkills.error.network") : t("videoSkills.error.load", { message: String(error !== null && error !== undefined ? error.message : error) })
					});
				});
			}, [t]);

			var loadInstalled = useCallback(function () {
				requestJson("/installed", { method: "GET" }).then(function (result) {
					var body = result.body;
					if (result.ok !== true || body === null || body.ok !== true || !Array.isArray(body.items)) return;
					var next = {};
					for (var index = 0; index < body.items.length; index += 1) {
						var item = body.items[index];
						if (item === null || typeof item !== "object" || typeof item.repo !== "string") continue;
						if (next[item.repo] === undefined) next[item.repo] = [];
						if (typeof item.target === "string" && next[item.repo].indexOf(item.target) < 0) next[item.repo].push(item.target);
					}
					setInstalled(next);
				}, function () {
					/* the installed badge is decoration: a failure leaves it empty, never blocks the page */
				});
			}, []);

			useEffect(function () {
				try {
					loadCatalog();
					loadInstalled();
				} catch (error) {
					/* a throwing effect would blank the page; the inline error state carries it */
				}
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
								error: t("videoSkills.error.refresh", { message: String(error !== null && error !== undefined ? error.message : error) })
							};
						});
					});
				} catch (error) {
					setRefreshing(false);
				}
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
			}, [snapshot.entries, filters]);

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

			var install = function (entry) {
				var repo = String(entry.repo);
				var target = targetChoice[repo] === undefined ? "claude" : targetChoice[repo];
				setPending(function (previous) {
					var next = {};
					for (var name in previous) {
						if (Object.prototype.hasOwnProperty.call(previous, name)) next[name] = previous[name];
					}
					next[repo] = true;
					return next;
				});
				setRowErrors(function (previous) {
					var next = {};
					for (var name in previous) {
						if (Object.prototype.hasOwnProperty.call(previous, name)) next[name] = previous[name];
					}
					delete next[repo];
					return next;
				});
				var payload = { repo: repo, targets: [target] };
				if (typeof entry.path === "string" && entry.path !== "") payload.path = entry.path;
				var finish = function (message) {
					setPending(function (previous) {
						var next = {};
						for (var name in previous) {
							if (Object.prototype.hasOwnProperty.call(previous, name) && name !== repo) next[name] = previous[name];
						}
						return next;
					});
					if (message !== "") {
						setRowErrors(function (previous) {
							var next = {};
							for (var name in previous) {
								if (Object.prototype.hasOwnProperty.call(previous, name)) next[name] = previous[name];
							}
							next[repo] = message;
							return next;
						});
					}
				};
				try {
					requestJson("/install", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then(function (result) {
						var body = result.body;
						if (result.ok === true && body !== null && body.ok === true) {
							finish("");
							loadInstalled();
							return;
						}
						finish(installErrorText(t, result));
					}, function (error) {
						finish(error !== null && error !== undefined && error.network === true ? t("videoSkills.error.network") : t("videoSkills.error.install", { message: String(error !== null && error !== undefined ? error.message : error) }));
					});
				} catch (error) {
					finish(t("videoSkills.error.install", { message: String(error !== null && error !== undefined ? error.message : error) }));
				}
			};

			var header = h("div", { style: STYLE.header }, [
				h("h2", { key: "title", style: STYLE.title }, t("videoSkills.title")),
				h("p", { key: "subtitle", style: STYLE.subtitle }, t("videoSkills.subtitle"))
			]);

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
					h("span", { key: "count" }, t("videoSkills.count", { n: filtered.length })),
					snapshot.stale === true ? h("span", { key: "stale", style: STYLE.badgeStale }, t("videoSkills.stale")) : null
				]);
			}

			var rows = shown.map(function (entry, index) {
				var repo = String(entry.repo === undefined ? "" : entry.repo);
				var targets = installed[repo];
				var isInstalled = Array.isArray(targets) && targets.length > 0;
				var isPending = pending[repo] === true;
				var chosen = targetChoice[repo] === undefined ? "claude" : targetChoice[repo];
				var preview = typeof entry.previewUrl === "string" && entry.previewUrl !== ""
					? h("img", {
						key: "preview",
						style: STYLE.preview,
						src: entry.previewUrl,
						alt: "",
						loading: "lazy",
						onError: function (event) {
							try {
								if (event !== null && event !== undefined && event.target !== null && event.target !== undefined) event.target.style.visibility = "hidden";
							} catch (error) {
								/* a broken preview must never break the row */
							}
						}
					})
					: h("div", { key: "preview", style: STYLE.preview });

				var metaBits = [
					h("span", { key: "stars", style: STYLE.badge }, t("videoSkills.stars", { n: Number(entry.stars) || 0 })),
					h("span", { key: "kind", style: STYLE.badge }, t("videoSkills.kind." + String(entry.kind))),
					h("span", { key: "grade", style: entry.grade === "caution" ? STYLE.badgeStale : STYLE.badge }, t("videoSkills.grade." + String(entry.grade)))
				];
				if (typeof entry.license === "string" && entry.license !== "") metaBits.push(h("span", { key: "license", style: STYLE.badge }, entry.license));
				if (isInstalled) metaBits.push(h("span", { key: "installed", style: STYLE.badgeOn }, t("videoSkills.installed")));

				return h("div", { key: repo + "#" + String(index), style: STYLE.item }, [
					preview,
					h("div", { key: "body", style: STYLE.body }, [
						h("div", { key: "repo", style: STYLE.repo }, repo),
						h("p", { key: "desc", style: STYLE.desc }, String(entry.description === undefined ? "" : entry.description)),
						h("div", { key: "meta", style: STYLE.meta }, metaBits)
					]),
					h("div", { key: "actions", style: STYLE.actions }, [
						h("div", { key: "targets", style: STYLE.row }, TARGETS.map(function (target) {
							return h("label", { key: target, style: STYLE.radio }, [
								h("input", {
									type: "radio",
									name: "target-" + repo,
									value: target,
									checked: chosen === target,
									onChange: function () {
										try {
											setTargetChoice(function (previous) {
												var next = {};
												for (var name in previous) {
													if (Object.prototype.hasOwnProperty.call(previous, name)) next[name] = previous[name];
												}
												next[repo] = target;
												return next;
											});
										} catch (error) { }
									}
								}),
								t("videoSkills.target." + target)
							]);
						})),
						h("button", {
							key: "install",
							type: "button",
							style: STYLE.primary,
							disabled: isPending,
							onClick: function () { try { install(entry); } catch (error) { } }
						}, isPending ? t("videoSkills.installing") : t("videoSkills.install")),
						rowErrors[repo] !== undefined ? h("div", { key: "error", style: STYLE.errorRow, role: "alert" }, String(rowErrors[repo])) : null
					])
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
					onClick: function () { try { setVisible(function (previous) { return Math.min(previous + PAGE_STEP, ROW_LIMIT); }); } catch (error) { } }
				}, t("videoSkills.more"));
			} else if (filtered.length > 0) {
				more = h("span", { style: STYLE.hint }, t("videoSkills.noMore"));
			}

			var children = [header, kindChips, controls, statusLine];
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
