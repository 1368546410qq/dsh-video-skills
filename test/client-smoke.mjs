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

function check(label, body) {
	try {
		body();
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
function makeRequire() {
	const seen = [];
	const require = (specifier) => {
		seen.push(specifier);
		if (specifier === "react") return ReactStub;
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

const zhFile = JSON.parse(readFileSync(join(ROOT, "locale", "zh-CN.json"), "utf8"));
const enFile = JSON.parse(readFileSync(join(ROOT, "locale", "en-US.json"), "utf8"));

console.log("client-smoke: " + CLIENT);
console.log("");

const registered = loadBundle();

console.log("[factory registration]");
check("registers exactly one factory", () => {
	assert(registered.length === 1, "expected 1 registration, got " + registered.length);
});
check("factory id is " + BUNDLE_ID, () => {
	assert(registered[0].id === BUNDLE_ID, "got id " + JSON.stringify(registered[0].id));
});
check("factory is a function", () => {
	assert(typeof registered[0].factory === "function", "factory is " + typeof registered[0].factory);
});

const require = makeRequire();
const client = registered[0].factory(require);

console.log("");
console.log("[exports shape]");
check("exports.apply is a function", () => {
	assert(typeof client.apply === "function", "apply is " + typeof client.apply);
});
check("exports.inject is an array of strings", () => {
	assert(Array.isArray(client.inject), "inject is " + typeof client.inject);
	assert(client.inject.every((name) => typeof name === "string"), "inject holds a non-string");
});
console.log("    exports.inject = " + JSON.stringify(client.inject));
console.log("    require() whitelist = " + JSON.stringify(require.seen));

check("only platform seed words were required", () => {
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
check("apply does not throw", () => {
	assert(caseAError === "", caseAError);
});
check("registerPage called exactly once", () => {
	assert(caseA.pages.length === 1, "registerPage calls: " + caseA.pages.length);
});
check("slot fallback not used", () => {
	assert(caseA.slots.length === 0, "slots.register calls: " + caseA.slots.length);
});
const seat = caseA.pages[0];
check("component renders without throwing", () => {
	// The hook double makes this a pure render pass: no effect runs, so no fetch.
	const tree = seat.component({ t: (key) => key });
	assert(tree !== null && typeof tree === "object", "render returned " + typeof tree);
	assert(Array.isArray(tree.children) && tree.children.length > 0, "render produced no children");
});
check("seat key/order/locale", () => {
	assert(seat.key === "video-skills", "key = " + JSON.stringify(seat.key));
	assert(seat.order === 900, "order = " + JSON.stringify(seat.order));
	assert(seat.locale === NS, "locale = " + JSON.stringify(seat.locale));
});
check("seat label() and inject() are callable", () => {
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
check("apply does not throw", () => {
	assert(caseBError === "", caseBError);
});
check("slots.register called exactly once", () => {
	assert(caseB.slots.length === 1, "slots.register calls: " + caseB.slots.length);
});
check("parent path not used", () => {
	assert(caseB.pages.length === 0, "registerPage calls: " + caseB.pages.length);
});
const fallback = caseB.slots[0];
check("fallback uses id + settings.section", () => {
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
check("apply does not throw", () => {
	assert(caseCError === "", caseCError);
});
check("foreign sectionId is accepted, integrated registration used exactly once", () => {
	assert(caseC.pages.length === 1, "registerPage calls: " + caseC.pages.length);
	assert(caseC.slots.length === 0, "slots.register calls: " + caseC.slots.length);
});

console.log("");
console.log("[locale dictionaries]");
const registeredDicts = caseA.dictionaries[0];
check("one dictionary registration under " + NS, () => {
	assert(caseA.dictionaries.length === 1, "registrations: " + caseA.dictionaries.length);
	assert(registeredDicts.namespace === NS, "namespace = " + JSON.stringify(registeredDicts.namespace));
	assert(registeredDicts.dicts && typeof registeredDicts.dicts.zh === "object" && typeof registeredDicts.dicts.en === "object", "missing zh/en dictionaries");
});
check("zh-CN.json and en-US.json share an identical key set", () => {
	const zhKeys = Object.keys(zhFile).sort();
	const enKeys = Object.keys(enFile).sort();
	assert(JSON.stringify(zhKeys) === JSON.stringify(enKeys), "key sets differ");
	assert(zhKeys.length > 0, "no keys");
});
check("inlined zh matches locale/zh-CN.json", () => {
	assert(snapshot(registeredDicts.dicts.zh) === snapshot(zhFile), "zh dictionary drifted from locale/zh-CN.json");
});
check("inlined en matches locale/en-US.json", () => {
	assert(snapshot(registeredDicts.dicts.en) === snapshot(enFile), "en dictionary drifted from locale/en-US.json");
});
check("no placeholder drift between zh and en", () => {
	const placeholders = (text) => (String(text).match(/\{(\w+)\}/g) || []).sort().join(",");
	const drift = Object.keys(zhFile).filter((key) => placeholders(zhFile[key]) !== placeholders(enFile[key]));
	assert(drift.length === 0, "placeholder mismatch on: " + drift.join(", "));
});

console.log("");
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
