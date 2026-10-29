/**
 * dsh-video-skills client smoke test.
 *
 * Loads client/client.js as the classical script DSH serves: a sandbox owns
 * window.__ModuleLoader__ and the require handed to the factory, so the test
 * proves the bundle registers a factory, exports inject + apply, and seats
 * exactly one page through either the parent service or the slot fallback.
 * It also proves the inlined dictionaries match locale/*.json exactly — that
 * parity is what keeps the JSON files authoritative without a bundler.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CLIENT = join(ROOT, "client", "client.js");
const BUNDLE_ID = "dsh-video-skills";
const NS = "dsh-video-skills";
const SETTINGS_SECTION = "settings.section";

const failures = [];

async function check(label, body) {
	try {
		await body();
		console.log("  ok    " + label);
	} catch (error) {
		failures.push(label + " -> " + error.message);
		console.log("  FAIL  " + label + " -> " + error.message);
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

/** Prototype-agnostic, order-independent snapshot of a string map. */
function snapshot(map) {
	const keys = Object.keys(map).sort();
	return JSON.stringify(keys.map((key) => [key, map[key]]));
}

/** Minimal React double: enough for the factory to materialize without rendering. */
const ReactStub = {
	Fragment: "Fragment",
	createElement(type, props, ...children) {
		return { type, props, children };
	},
	useState(initial) {
		return [typeof initial === "function" ? initial() : initial, () => {}];
	},
	useEffect() {},
	useMemo(factory) {
		return factory();
	},
	useCallback(fn) {
		return fn;
	},
	useRef(value) {
		return { current: value };
	}
};

/** The shell provides platform seed words only; anything else is a contract breach. */
function makeRequire(react) {
	const seen = [];
	const require = (specifier) => {
		seen.push(specifier);
		if (specifier === "react") return react === undefined ? ReactStub : react;
		throw new Error("unexpected require(\"" + specifier + "\") — the bundle may only require platform seed words");
	};
	require.seen = seen;
	return require;
}

/** Load the bundle and return the registered factory spec. */
function loadBundle() {
	const registered = [];
	const sandbox = { console };
	sandbox.window = {
		__ModuleLoader__: {
			load(spec) {
				registered.push(spec);
			}
		}
	};
	vm.runInNewContext(readFileSync(CLIENT, "utf8"), sandbox, { filename: "client/client.js" });
	return registered;
}

/**
* Cordis context double. `slots.spec` is deliberately absent so the fallback
* branch registers: the probe only short-circuits a shell that declares the slot
* surface and does not know this one.
*/
function makeCtx(options) {
	const pages = [];
	const slots = [];
	const dictionaries = [];
	const effects = [];
	// Built here, not by the caller, so the recursion is observable: every
	// registerPage call lands in this context's own page list.
	const parent = options.parent === "web-ui-plugins"
		? {
			sectionId: "web-ui-plugins",
			registerPage(seat) {
				pages.push(seat);
				return () => {};
			}
		}
		: options.parent === "foreign"
			? {
				sectionId: "some-other-section",
				registerPage(seat) {
					pages.push(seat);
					return () => {};
				}
			}
			: undefined;
	const ctx = {
		get(name) {
			return name === "webUiExtensions" ? parent : undefined;
		},
		effect(body, label) {
			effects.push(label);
			const disposer = body();
			return typeof disposer === "function" ? disposer : () => {};
		},
		slots: {
			register(options_, component) {
				slots.push({ options: options_, component });
				return () => {};
			}
		},
		locale: {
			register(namespace, dicts) {
				dictionaries.push({ namespace, dicts });
				return () => {};
			},
			bind() {
				return (key) => key;
			}
		}
	};
	return { ctx, pages, slots, dictionaries, effects };
}

/**
* A live React double: hook state survives re-renders, effects run after the
* render that scheduled them, and a setState re-renders synchronously — so a
* test can click a control and assert on the new tree in the same turn.
*/
function makeLiveReact() {
	const driver = { hooks: [], cursor: 0, effects: [], dirty: false, busy: false, instance: null, tree: null };

	function createElement(type, props, ...children) {
		return { type, props: props === undefined || props === null ? {} : props, children };
	}

	function sameDeps(left, right) {
		if (right === undefined) return false;
		if (left === undefined) return false;
		if (left.length !== right.length) return false;
		for (let index = 0; index < left.length; index += 1) {
			if (!Object.is(left[index], right[index])) return false;
		}
		return true;
	}

	function slotAt(index, factory) {
		if (driver.hooks.length <= index) driver.hooks.push(factory());
		return driver.hooks[index];
	}

	function renderOnce() {
		driver.cursor = 0;
		driver.effects = [];
		try {
			driver.tree = driver.instance.component(driver.instance.props);
			const effects = driver.effects;
			driver.effects = [];
			for (const effect of effects) {
				if (typeof effect.slot.cleanup === "function") effect.slot.cleanup();
				const cleanup = effect.fn();
				effect.slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
			}
		} finally {
			driver.busy = false;
		}
	}

	function flush() {
		driver.busy = true;
		let guard = 0;
		while (driver.dirty === true && guard < 200) {
			driver.dirty = false;
			if (driver.instance === null) break;
			renderOnce();
			guard += 1;
		}
		driver.busy = false;
	}

	function schedule() {
		driver.dirty = true;
		if (driver.busy === true) return;
		flush();
	}

	driver.React = {
		Fragment: "Fragment",
		createElement,
		useState(initial) {
			const slot = slotAt(driver.cursor++, () => ({ value: typeof initial === "function" ? initial() : initial }));
			const set = (next) => {
				slot.value = typeof next === "function" ? next(slot.value) : next;
				schedule();
			};
			return [slot.value, set];
		},
		useRef(initial) {
			return slotAt(driver.cursor++, () => ({ current: initial }));
		},
		useMemo(factory, deps) {
			const slot = slotAt(driver.cursor++, () => ({ deps: undefined, value: undefined }));
			if (sameDeps(slot.deps, deps) !== true) {
				slot.value = factory();
				slot.deps = deps;
			}
			return slot.value;
		},
		useCallback(fn, deps) {
			const slot = slotAt(driver.cursor++, () => ({ deps: undefined, fn }));
			if (sameDeps(slot.deps, deps) !== true) {
				slot.fn = fn;
				slot.deps = deps;
			}
			return slot.fn;
		},
		useEffect(fn, deps) {
			const slot = slotAt(driver.cursor++, () => ({ deps: undefined, cleanup: undefined }));
			if (sameDeps(slot.deps, deps) !== true) {
				slot.deps = deps;
				driver.effects.push({ slot, fn });
			}
		}
	};

	driver.mount = (component, props) => {
		driver.instance = { component, props };
		driver.hooks = [];
		driver.cursor = 0;
		driver.dirty = true;
		flush();
		return driver.tree;
	};

	driver.unmount = () => {
		for (const slot of driver.hooks) {
			if (slot && typeof slot.cleanup === "function") slot.cleanup();
		}
		driver.instance = null;
	};

	driver.page = () => driver.tree;
	return driver;
}

/** Depth-first walk over an element tree; strings and arrays are transparent. */
function eachNode(node, visit) {
	if (node === null || node === undefined || node === false || node === true) return;
	if (Array.isArray(node)) {
		for (const child of node) eachNode(child, visit);
		return;
	}
	if (typeof node !== "object") return;
	visit(node);
	eachNode(node.children, visit);
}

function nodes(root, predicate) {
	const found = [];
	eachNode(root, (node) => {
		if (predicate(node) === true) found.push(node);
	});
	return found;
}

function textOf(node) {
	if (node === null || node === undefined || node === false || node === true) return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	if (typeof node !== "object") return "";
	return (node.children || []).map(textOf).join("");
}

function ownText(node) {
	return (node.children || []).map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : "")).join("");
}

function buttons(root, label) {
	return nodes(root, (node) => node.type === "button" && ownText(node) === label && typeof node.props.onClick === "function");
}

function clickButton(root, label) {
	const found = buttons(root, label);
	if (found.length === 0) throw new Error("no button labelled " + JSON.stringify(label) + " — page text: " + textOf(root).slice(0, 160));
	found[0].props.onClick({ target: {} });
}

function checkboxes(root) {
	return nodes(root, (node) => node.type === "input" && node.props.type === "checkbox");
}

function boxFor(root, target) {
	const found = checkboxes(root).filter((node) => node.props.value === target);
	if (found.length !== 1) throw new Error("expected one checkbox for " + target + ", got " + found.length);
	return found[0];
}

function phaseLines(root) {
	return nodes(root, (node) => node.props.key === "phase").map(textOf);
}

function errorNodes(root) {
	return nodes(root, (node) => node.props.key === "error");
}

function badgeTexts(root) {
	const labels = ["已安装", "外部安装", "Claude ✓", "DSH ✓"];
	return nodes(root, (node) => node.type === "span" && labels.indexOf(ownText(node)) >= 0).map(ownText);
}

function repoLinks(root) {
	return nodes(root, (node) => node.type === "a" && node.props.key === "repo");
}

/** Controllable clock: nothing fires until the test advances it. */
function makeClock() {
	let now = 0;
	let sequence = 0;
	const timers = new Map();
	return {
		setTimeout(fn, ms) {
			sequence += 1;
			timers.set(sequence, { at: now + (Number(ms) || 0), fn });
			return sequence;
		},
		clearTimeout(id) {
			timers.delete(id);
		},
		get pending() {
			return timers.size;
		},
		async advance(ms) {
			const target = now + (Number(ms) || 0);
			for (;;) {
				let pick = null;
				for (const entry of timers) {
					if (entry[1].at > target) continue;
					if (pick === null || entry[1].at < pick[1].at) pick = entry;
				}
				if (pick === null) break;
				timers.delete(pick[0]);
				now = pick[1].at;
				pick[1].fn();
				await tick();
			}
			now = target;
			await tick();
		}
	};
}

function makeStorage() {
	const map = new Map();
	return {
		getItem(key) {
			return map.has(String(key)) ? map.get(String(key)) : null;
		},
		setItem(key, value) {
			map.set(String(key), String(value));
		},
		removeItem(key) {
			map.delete(String(key));
		},
		raw(key) {
			return map.has(String(key)) ? map.get(String(key)) : null;
		}
	};
}

/** fetch double: /installed and /catalog answer from the fixture, everything else waits for the test. */
function makeServer() {
	const calls = [];
	const routes = [];

	function respond(status, body) {
		return {
			status,
			ok: status >= 200 && status < 300 && body !== null && body !== undefined,
			text() {
				return Promise.resolve(body === null || body === undefined ? "" : JSON.stringify(body));
			}
		};
	}

	function fetchStub(url, init) {
		const options = init === undefined || init === null ? {} : init;
		const call = {
			url: String(url),
			method: typeof options.method === "string" ? options.method : "GET",
			body: typeof options.body === "string" ? JSON.parse(options.body) : null,
			settled: false
		};
		let land = {};
		const promise = new Promise((resolve, reject) => {
			land = { resolve, reject };
		});
		call.resolveWith = (status, body) => {
			if (call.settled === true) throw new Error("call already settled: " + call.method + " " + call.url);
			call.settled = true;
			land.resolve(respond(status, body));
		};
		call.failWith = (message) => {
			if (call.settled === true) throw new Error("call already settled: " + call.method + " " + call.url);
			call.settled = true;
			const error = new Error(message);
			error.network = true;
			land.reject(error);
		};
		calls.push(call);
		for (const route of routes) {
			if (route.match(call) === true) {
				route.handle(call);
				break;
			}
		}
		return promise;
	}

	const server = {
		calls,
		installed: { ok: true, items: [] },
		catalog: { ok: true, entries: [], stale: false, generated: "" },
		fetch: fetchStub,
		route(match, handle) {
			routes.push({ match, handle });
		},
		count(method, suffix) {
			return calls.filter((call) => call.method === method && call.url.endsWith(suffix)).length;
		},
		pending(predicate) {
			return calls.filter((call) => call.settled !== true && predicate(call) === true);
		}
	};

	server.route((call) => call.method === "GET" && call.url.endsWith("/installed"), (call) => call.resolveWith(200, server.installed));
	server.route((call) => call.method === "GET" && call.url.endsWith("/catalog"), (call) => call.resolveWith(200, server.catalog));
	return server;
}

/** The zh copy with {placeholder} substitution, straight from locale/zh-CN.json. */
function makeTranslator(dict) {
	return (key, params) => {
		const template = typeof dict[key] === "string" ? dict[key] : String(key);
		if (params === undefined || params === null) return template;
		let out = template;
		for (const name of Object.keys(params)) out = out.split("{" + name + "}").join(String(params[name]));
		return out;
	};
}

/** Load the bundle into a sandbox with fake fetch/clock/storage and mount the page. */
function loadUi(options) {
	const settings = options === undefined ? {} : options;
	const clock = makeClock();
	const storage = makeStorage();
	const server = makeServer();
	if (Array.isArray(settings.items)) server.installed = { ok: true, items: settings.items };
	if (Array.isArray(settings.entries)) server.catalog = { ok: true, entries: settings.entries, stale: false, generated: "2026-01-01T00:00:00.000Z" };
	const driver = makeLiveReact();
	const require = makeRequire(driver.React);
	const registered = [];
	const sandbox = {
		console,
		fetch: server.fetch,
		setTimeout: clock.setTimeout,
		clearTimeout: clock.clearTimeout,
		localStorage: storage
	};
	sandbox.window = {
		__ModuleLoader__: {
			load(spec) {
				registered.push(spec);
			}
		},
		localStorage: storage
	};
	vm.runInNewContext(readFileSync(CLIENT, "utf8"), sandbox, { filename: "client/client.js" });
	const client = registered[0].factory(require);
	const ui = makeCtx({});
	client.apply(ui.ctx);
	driver.mount(ui.slots[0].component, { t: makeTranslator(zhFile) });
	return { clock, storage, server, driver, ui };
}

function tick() {
	return new Promise((resolve) => setImmediate(resolve));
}

const zhFile = JSON.parse(readFileSync(join(ROOT, "locale", "zh-CN.json"), "utf8"));
const enFile = JSON.parse(readFileSync(join(ROOT, "locale", "en-US.json"), "utf8"));

console.log("client-smoke: " + CLIENT);
console.log("");

const registered = loadBundle();

console.log("[factory registration]");
await check("registers exactly one factory", () => {
	assert(registered.length === 1, "expected 1 registration, got " + registered.length);
});
await check("factory id is " + BUNDLE_ID, () => {
	assert(registered[0].id === BUNDLE_ID, "got id " + JSON.stringify(registered[0].id));
});
await check("factory is a function", () => {
	assert(typeof registered[0].factory === "function", "factory is " + typeof registered[0].factory);
});

const require = makeRequire();
const client = registered[0].factory(require);

console.log("");
console.log("[exports shape]");
await check("exports.apply is a function", () => {
	assert(typeof client.apply === "function", "apply is " + typeof client.apply);
});
await check("exports.inject is an array of strings", () => {
	assert(Array.isArray(client.inject), "inject is " + typeof client.inject);
	assert(client.inject.every((name) => typeof name === "string"), "inject holds a non-string");
});
console.log("    exports.inject = " + JSON.stringify(client.inject));
console.log("    require() whitelist = " + JSON.stringify(require.seen));

await check("only platform seed words were required", () => {
	const unexpected = require.seen.filter((specifier) => specifier !== "react");
	assert(unexpected.length === 0, "unexpected specifiers: " + unexpected.join(", "));
});

console.log("");
console.log("[case A: webUiExtensions parent present]");
const caseA = makeCtx({ parent: "web-ui-plugins" });
let caseAError = "";
try {
	client.apply(caseA.ctx);
} catch (error) {
	caseAError = String(error && error.message ? error.message : error);
}
await check("apply does not throw", () => {
	assert(caseAError === "", caseAError);
});
await check("registerPage called exactly once", () => {
	assert(caseA.pages.length === 1, "registerPage calls: " + caseA.pages.length);
});
await check("slot fallback not used", () => {
	assert(caseA.slots.length === 0, "slots.register calls: " + caseA.slots.length);
});
const seat = caseA.pages[0];
await check("component renders without throwing", () => {
	// The hook double makes this a pure render pass: no effect runs, so no fetch.
	const tree = seat.component({ t: (key) => key });
	assert(tree !== null && typeof tree === "object", "render returned " + typeof tree);
	assert(Array.isArray(tree.children) && tree.children.length > 0, "render produced no children");
});
await check("seat key/order/locale", () => {
	assert(seat.key === "video-skills", "key = " + JSON.stringify(seat.key));
	assert(seat.order === 900, "order = " + JSON.stringify(seat.order));
	assert(seat.locale === NS, "locale = " + JSON.stringify(seat.locale));
});
await check("seat label() and inject() are callable", () => {
	assert(typeof seat.label === "function", "label is " + typeof seat.label);
	assert(typeof seat.inject === "function", "inject is " + typeof seat.inject);
	assert(typeof seat.component === "function", "component is " + typeof seat.component);
	const label = seat.label();
	assert(typeof label === "string" && label.length > 0, "label() returned " + JSON.stringify(label));
	const props = seat.inject();
	assert(props !== null && typeof props === "object", "inject() returned " + typeof props);
	assert(typeof props.t === "function", "inject().t is " + typeof props.t);
});

console.log("");
console.log("[case B: webUiExtensions absent]");
const caseB = makeCtx({});
let caseBError = "";
try {
	client.apply(caseB.ctx);
} catch (error) {
	caseBError = String(error && error.message ? error.message : error);
}
await check("apply does not throw", () => {
	assert(caseBError === "", caseBError);
});
await check("slots.register called exactly once", () => {
	assert(caseB.slots.length === 1, "slots.register calls: " + caseB.slots.length);
});
await check("parent path not used", () => {
	assert(caseB.pages.length === 0, "registerPage calls: " + caseB.pages.length);
});
const fallback = caseB.slots[0];
await check("fallback uses id + settings.section", () => {
	assert(fallback.options.name === SETTINGS_SECTION, "name = " + JSON.stringify(fallback.options.name));
	assert(fallback.options.id === "video-skills", "id = " + JSON.stringify(fallback.options.id));
	assert(fallback.options.order === 900, "order = " + JSON.stringify(fallback.options.order));
	assert(typeof fallback.component === "function", "component is " + typeof fallback.component);
	assert(fallback.options.component === undefined, "component must travel as the second argument, not in options");
});

console.log("");
console.log("[case C: parent present with a foreign sectionId -> loose gate still registers]");
const caseC = makeCtx({ parent: "foreign" });
let caseCError = "";
try {
	client.apply(caseC.ctx);
} catch (error) {
	caseCError = String(error && error.message ? error.message : error);
}
await check("apply does not throw", () => {
	assert(caseCError === "", caseCError);
});
await check("foreign sectionId is accepted, integrated registration used exactly once", () => {
	assert(caseC.pages.length === 1, "registerPage calls: " + caseC.pages.length);
	assert(caseC.slots.length === 0, "slots.register calls: " + caseC.slots.length);
});

console.log("");
console.log("[locale dictionaries]");
const registeredDicts = caseA.dictionaries[0];
await check("one dictionary registration under " + NS, () => {
	assert(caseA.dictionaries.length === 1, "registrations: " + caseA.dictionaries.length);
	assert(registeredDicts.namespace === NS, "namespace = " + JSON.stringify(registeredDicts.namespace));
	assert(registeredDicts.dicts && typeof registeredDicts.dicts.zh === "object" && typeof registeredDicts.dicts.en === "object", "missing zh/en dictionaries");
});
await check("zh-CN.json and en-US.json share an identical key set", () => {
	const zhKeys = Object.keys(zhFile).sort();
	const enKeys = Object.keys(enFile).sort();
	assert(JSON.stringify(zhKeys) === JSON.stringify(enKeys), "key sets differ");
	assert(zhKeys.length > 0, "no keys");
});
await check("inlined zh matches locale/zh-CN.json", () => {
	assert(snapshot(registeredDicts.dicts.zh) === snapshot(zhFile), "zh dictionary drifted from locale/zh-CN.json");
});
await check("inlined en matches locale/en-US.json", () => {
	assert(snapshot(registeredDicts.dicts.en) === snapshot(enFile), "en dictionary drifted from locale/en-US.json");
});
await check("no placeholder drift between zh and en", () => {
	const placeholders = (text) => (String(text).match(/\{(\w+)\}/g) || []).sort().join(",");
	const drift = Object.keys(zhFile).filter((key) => placeholders(zhFile[key]) !== placeholders(enFile[key]));
	assert(drift.length === 0, "placeholder mismatch on: " + drift.join(", "));
});

console.log("");
console.log("");
console.log("[v2 target selection]");
const CATALOG = [
	{ repo: "acme/veo3", path: "skills/veo3", name: "veo3", description: "Veo 3 prompt kit", kind: "general", grade: "safe", stars: 1200, license: "MIT" }
];
const targetsUi = loadUi({ entries: CATALOG });
await tick();

await check("target bar defaults to DSH only", () => {
	const root = targetsUi.driver.page();
	assert(textOf(root).includes("安装到"), "the 安装到 label is missing");
	assert(boxFor(root, "dsh").props.checked === true, "DSH must be checked by default");
	assert(boxFor(root, "claude").props.checked === false, "Claude must not be checked by default");
	assert(targetsUi.storage.raw("dsh-video-skills.targets") === null, "nothing should be stored before the user chooses");
});

await check("unchecking the last target is refused with the hint", () => {
	boxFor(targetsUi.driver.page(), "dsh").props.onChange({ target: {} });
	const root = targetsUi.driver.page();
	assert(boxFor(root, "dsh").props.checked === true, "the last target must stay checked");
	assert(textOf(root).includes("至少要保留一个安装目标"), "the refusal hint is missing");
	assert(targetsUi.storage.raw("dsh-video-skills.targets") === null, "a refused choice must not be stored");
});

await check("a second target is persisted in contract order", () => {
	boxFor(targetsUi.driver.page(), "claude").props.onChange({ target: {} });
	const root = targetsUi.driver.page();
	assert(boxFor(root, "claude").props.checked === true, "Claude should be checked");
	assert(boxFor(root, "dsh").props.checked === true, "DSH should stay checked");
	assert(targetsUi.storage.raw("dsh-video-skills.targets") === JSON.stringify(["claude", "dsh"]), "stored: " + targetsUi.storage.raw("dsh-video-skills.targets"));
	assert(textOf(root).includes("至少要保留一个安装目标") === false, "the hint should clear once a target is added");
});

await check("targets live only in the top bar (no per-row radio)", () => {
	const root = targetsUi.driver.page();
	const radios = nodes(root, (node) => node.type === "input" && node.props.type === "radio");
	assert(radios.length === 0, "a per-row target radio still renders: " + radios.length);
	assert(checkboxes(root).length === 2, "expected exactly two target checkboxes, got " + checkboxes(root).length);
	assert(repoLinks(root).length === 1, "catalog row missing");
});

console.log("");
console.log("[v2 install job]");
const jobUi = loadUi({ entries: CATALOG });
await tick();

await check("install posts the selected targets and starts the job", async () => {
	clickButton(jobUi.driver.page(), "安装");
	const posted = jobUi.server.pending((call) => call.method === "POST" && call.url.endsWith("/install"));
	assert(posted.length === 1, "POST /install calls: " + posted.length);
	assert(JSON.stringify(posted[0].body) === JSON.stringify({ repo: "acme/veo3", targets: ["dsh"], path: "skills/veo3", name: "veo3" }), "payload: " + JSON.stringify(posted[0].body));
	posted[0].resolveWith(202, { ok: true, job: { id: "job-1", repo: "acme/veo3", phase: "download", bytes: 0 } });
	await tick();
	const root = jobUi.driver.page();
	assert(buttons(root, "取消").length === 1, "a running job renders no cancel button");
	assert(phaseLines(root).join("|") === "下载中 0.0 MB", "phase line: " + phaseLines(root).join("|"));
});

await check("phase text maps download / unpack / copy", async () => {
	const steps = [
		{ phase: "download", extra: { bytes: 1572864 }, expected: "下载中 1.5 MB" },
		{ phase: "inspect", extra: {}, expected: "解包中" },
		{ phase: "extract", extra: {}, expected: "解包中" },
		{ phase: "copy", extra: { copied: 7, files: 7 }, expected: "拷贝 7 文件" }
	];
	for (const step of steps) {
		await jobUi.clock.advance(500);
		const polls = jobUi.server.pending((call) => call.method === "GET" && call.url.indexOf("/install/job-1") >= 0);
		assert(polls.length === 1, "poll requests for " + step.phase + ": " + polls.length);
		polls[0].resolveWith(200, { ok: true, job: Object.assign({ id: "job-1" }, step.extra, { phase: step.phase }) });
		await tick();
		assert(phaseLines(jobUi.driver.page()).join("|") === step.expected, step.phase + " -> " + phaseLines(jobUi.driver.page()).join("|"));
	}
});

await check("done clears the phase and reloads /installed", async () => {
	jobUi.server.installed = { ok: true, items: [
		{ name: "veo3", target: "dsh", dir: "/home/u/.dsh/skills/veo3", repo: "acme/veo3", path: "skills/veo3", installedAt: "2026-01-01T00:00:00.000Z", files: 7, owned: true, external: false }
	] };
	const before = jobUi.server.count("GET", "/installed");
	await jobUi.clock.advance(500);
	const polls = jobUi.server.pending((call) => call.method === "GET" && call.url.indexOf("/install/job-1") >= 0);
	assert(polls.length === 1, "job poll requests: " + polls.length);
	polls[0].resolveWith(200, { ok: true, job: { id: "job-1", phase: "done", files: 7 } });
	await tick();
	const root = jobUi.driver.page();
	assert(phaseLines(root).length === 0, "phase line outlived done: " + phaseLines(root).join("|"));
	assert(jobUi.server.count("GET", "/installed") === before + 1, "/installed was not reloaded after done");
	assert(badgeTexts(root).indexOf("已安装") >= 0, "installed badge missing after done");
	assert(jobUi.clock.pending === 0, "polling continued after done: " + jobUi.clock.pending);
});

const cancelUi = loadUi({ entries: CATALOG });
await tick();

await check("cancel posts /install/<id>/cancel and stops at 已取消", async () => {
	clickButton(cancelUi.driver.page(), "安装");
	cancelUi.server.pending((call) => call.method === "POST" && call.url.endsWith("/install"))[0].resolveWith(202, { ok: true, job: { id: "job-9", phase: "download", bytes: 0 } });
	await tick();
	clickButton(cancelUi.driver.page(), "取消");
	const cancels = cancelUi.server.pending((call) => call.method === "POST" && call.url.endsWith("/cancel"));
	assert(cancels.length === 1, "cancel calls: " + cancels.length);
	assert(cancels[0].url.endsWith("/install/job-9/cancel"), "cancel url: " + cancels[0].url);
	cancels[0].resolveWith(200, { ok: true, job: { id: "job-9", phase: "cancelled" } });
	await tick();
	assert(textOf(cancelUi.driver.page()).includes("已取消"), "cancelled text: " + phaseLines(cancelUi.driver.page()).join("|"));
	await cancelUi.clock.advance(500);
	const polls = cancelUi.server.pending((call) => call.method === "GET" && call.url.indexOf("/install/job-9") >= 0);
	assert(polls.length === 1, "the in-flight poll should settle once, got " + polls.length);
	polls[0].resolveWith(200, { ok: true, job: { id: "job-9", phase: "cancelled" } });
	await tick();
	assert(textOf(cancelUi.driver.page()).includes("已取消"), "cancelled text lost after the last poll");
	assert(cancelUi.clock.pending === 0, "polling continued after cancelled: " + cancelUi.clock.pending);
});

const errorUi = loadUi({ entries: CATALOG });
await tick();

await check("a failed job renders the full message, untruncated", async () => {
	const message = "下载失败：HTTP 502 Bad Gateway（重试 3 次后放弃）";
	clickButton(errorUi.driver.page(), "安装");
	errorUi.server.pending((call) => call.method === "POST" && call.url.endsWith("/install"))[0].resolveWith(202, { ok: true, job: { id: "job-5", phase: "download", bytes: 0 } });
	await tick();
	await errorUi.clock.advance(500);
	errorUi.server.pending((call) => call.method === "GET" && call.url.indexOf("/install/job-5") >= 0)[0].resolveWith(200, { ok: true, job: { id: "job-5", phase: "error", error: "download-failed", message } });
	await tick();
	const root = errorUi.driver.page();
	const errors = errorNodes(root);
	assert(errors.length === 1, "error lines: " + errors.length);
	assert(textOf(errors[0]) === message, "error text: " + textOf(errors[0]));
	const style = errors[0].props.style;
	assert(style.whiteSpace === "pre-wrap", "whiteSpace: " + style.whiteSpace);
	assert(style.wordBreak === "break-word", "wordBreak: " + style.wordBreak);
	assert(style.textOverflow === undefined && style.overflow === undefined, "the error line still truncates");
	assert(errorUi.clock.pending === 0, "a failed job must stop polling: " + errorUi.clock.pending);
});

const unmountUi = loadUi({ entries: CATALOG });
await tick();

await check("unmount clears every pending timer", async () => {
	clickButton(unmountUi.driver.page(), "安装");
	unmountUi.server.pending((call) => call.method === "POST" && call.url.endsWith("/install"))[0].resolveWith(202, { ok: true, job: { id: "job-7", phase: "download", bytes: 0 } });
	await tick();
	assert(unmountUi.clock.pending === 1, "expected one pending poll, got " + unmountUi.clock.pending);
	unmountUi.driver.unmount();
	assert(unmountUi.clock.pending === 0, "timers survived unmount: " + unmountUi.clock.pending);
	const calls = unmountUi.server.calls.length;
	await unmountUi.clock.advance(3000);
	assert(unmountUi.server.calls.length === calls, "a poll fired after unmount");
});

console.log("");
console.log("[v2 installed view]");
const OTHERS = { repo: "acme/ext-skill", name: "ext-skill", description: "External one", kind: "motion", grade: "safe", stars: 400, license: "Apache-2.0" };
const installedUi = loadUi({
	entries: CATALOG.concat([OTHERS]),
	items: [
		{ name: "veo3", target: "claude", dir: "/x/.claude/skills/veo3", repo: "acme/veo3", path: "skills/veo3", installedAt: "t", files: 7, owned: true, external: false },
		{ name: "veo3", target: "dsh", dir: "/x/.dsh/skills/veo3", repo: "acme/veo3", path: "skills/veo3", installedAt: "t", files: 7, owned: true, external: false },
		{ name: "ext-skill", target: "claude", dir: "/x/.claude/skills/ext-skill", repo: "acme/ext-skill", path: null, installedAt: "t", files: 3, owned: false, external: true }
	]
});
await tick();

await check("installed hit shows the badge and one tick per target", () => {
	const badges = badgeTexts(installedUi.driver.page());
	assert(badges.indexOf("已安装") >= 0, "installed badge missing: " + badges.join("|"));
	assert(badges.indexOf("Claude ✓") >= 0 && badges.indexOf("DSH ✓") >= 0, "target ticks: " + badges.join("|"));
});

await check("repo and path open GitHub in a new tab", () => {
	const root = installedUi.driver.page();
	const links = repoLinks(root);
	assert(links.length === 2, "repo links: " + links.length);
	const veo = links.filter((node) => textOf(node) === "acme/veo3")[0];
	assert(veo !== undefined, "the veo3 repo link is missing");
	assert(veo.props.href === "https://github.com/acme/veo3", "repo href: " + veo.props.href);
	assert(veo.props.target === "_blank" && veo.props.rel === "noreferrer", "repo target/rel: " + veo.props.target + "/" + veo.props.rel);
	const paths = nodes(root, (node) => node.type === "a" && node.props.key === "path");
	assert(paths.length === 1, "path links: " + paths.length);
	assert(paths[0].props.href === "https://github.com/acme/veo3/tree/HEAD/skills/veo3", "path href: " + paths[0].props.href);
	assert(ownText(paths[0]) === "路径", "path label: " + ownText(paths[0]));
});

await check("external entries show 外部安装 and offer no uninstall", () => {
	const root = installedUi.driver.page();
	assert(badgeTexts(root).indexOf("外部安装") >= 0, "external badge missing");
	assert(buttons(root, "卸载").length === 1, "only the owned row may offer uninstall, got " + buttons(root, "卸载").length);
});

await check("uninstall needs two clicks and posts one target at a time", async () => {
	clickButton(installedUi.driver.page(), "卸载");
	assert(installedUi.server.count("POST", "/uninstall") === 0, "the first click must not uninstall");
	assert(buttons(installedUi.driver.page(), "确认卸载？").length === 1, "the confirm label is missing");
	clickButton(installedUi.driver.page(), "确认卸载？");
	await tick();
	const posts = installedUi.server.pending((call) => call.method === "POST" && call.url.endsWith("/uninstall"));
	assert(posts.length === 1, "uninstall posts after the confirm click: " + posts.length);
	assert(JSON.stringify(posts[0].body) === JSON.stringify({ name: "veo3", target: "claude" }), "first body: " + JSON.stringify(posts[0].body));
	assert(installedUi.server.count("POST", "/uninstall") === 1, "the second target must wait for the first: " + installedUi.server.count("POST", "/uninstall"));
	const before = installedUi.server.count("GET", "/installed");
	posts[0].resolveWith(200, { ok: true, removed: { target: "claude" } });
	await tick();
	const second = installedUi.server.pending((call) => call.method === "POST" && call.url.endsWith("/uninstall"));
	assert(second.length === 1, "the second target was not requested: " + second.length);
	assert(JSON.stringify(second[0].body) === JSON.stringify({ name: "veo3", target: "dsh" }), "second body: " + JSON.stringify(second[0].body));
	second[0].resolveWith(200, { ok: true, removed: { target: "dsh" } });
	await tick();
	assert(installedUi.server.count("GET", "/installed") === before + 1, "/installed was not reloaded after uninstall");
});

console.log("");
console.log("[v2 installed-only filter]");
const filterUi = loadUi({
	entries: CATALOG.concat([{ repo: "acme/other", name: "other", description: "Not installed", kind: "general", grade: "safe", stars: 10, license: "MIT" }]),
	items: [{ name: "veo3", target: "dsh", dir: "/x/.dsh/skills/veo3", repo: "acme/veo3", path: "skills/veo3", installedAt: "t", files: 7, owned: true, external: false }]
});
await tick();

await check("只看已安装 filters the list to installed rows", () => {
	assert(repoLinks(filterUi.driver.page()).length === 2, "rows before filtering: " + repoLinks(filterUi.driver.page()).length);
	clickButton(filterUi.driver.page(), "只看已安装");
	const root = filterUi.driver.page();
	assert(repoLinks(root).length === 1, "rows after filtering: " + repoLinks(root).length);
	assert(textOf(repoLinks(root)[0]) === "acme/veo3", "wrong row kept: " + textOf(repoLinks(root)[0]));
});

console.log("locale keys: " + Object.keys(zhFile).length + " (zh) / " + Object.keys(enFile).length + " (en)");

if (failures.length > 0) {
	console.log("");
	console.log("FAILED (" + failures.length + ")");
	for (const failure of failures) console.log("  - " + failure);
	process.exitCode = 1;
} else {
	console.log("");
	console.log("PASS — all client-smoke checks green");
}
