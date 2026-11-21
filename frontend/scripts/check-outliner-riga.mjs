// MICRO-SEG10 · the Outliner keeps the ROW clicked, not the node's first row:
//
//   node scripts/check-outliner-riga.mjs
//
// E.D., 21 Nov (Templu Mare v11): a click on T20 inside VSF155 (epoch II A.D.)
// selected the unit, then the Outliner lit and scrolled to the FIRST row of T20,
// higher up. The same unit is listed under several epochs and containers. Here
// `unified-outliner.ts` is mounted on a linkedom document (virtual list, a short
// viewport) with a unit listed in two epochs (SF1: born in Età arcaica, still
// there in Età romana — `check-outliner-tree.mjs` case 1), and the app's round
// trip is the real one: the row's pick selects, and the selection comes back to
// `setSelected` synchronously (main.ts `select` → `nodeList.setSelected`).
//
// · a click on the SECOND row of SF1: that row stays lit, the first gets the
//   light «same unit» sign, scrollTop does not move (not one pixel);
// · the selection coming back from elsewhere (Matrix, Graph, Space, search) for
//   the same node keeps the row remembered;
// · from elsewhere for a node with no row remembered: the row under the epoch in
//   front (`contextEpoch`), else the first — and no branch opened when a row of
//   the node is already in sight;
// · ↓ walks from the row lit, not from the node's first row;
// · light and dark: the sign is a theme token (`--accent`) both themes define.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const { window, document } = parseHTML(`<!doctype html><html><body><div id="host"></div></body></html>`);
globalThis.window = window;
globalThis.document = document;
globalThis.MouseEvent = window.MouseEvent ?? window.Event;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
const P = window.HTMLElement.prototype;
// a viewport of 5 rows: what is out of it needs a scroll to be seen
Object.defineProperty(P, "scrollTop", { configurable: true, get() { return this._st ?? 0; }, set(v) { this._st = v; } });
Object.defineProperty(P, "clientHeight", { configurable: true, get() { return this.classList?.contains("uo-scroll") ? 110 : 0; } });

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}unified-outliner.ts`], bundle: true, format: "esm", write: false,
  loader: { ".json": "json" } });
const U = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (c, what) => { assert.ok(c, what); checks++; };
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

const N = (id, node_type, name = id, data = {}) => ({ id, node_type, name, data });
const E = (source, target, edge_type) => ({ source, target, edge_type });
const doc = { graph: { graph_id: "g", nodes: [
  N("E1", "EpochNode", "Età romana", { start_time: -100, end_time: 300 }),
  N("E0", "EpochNode", "Età arcaica", { start_time: -600, end_time: -100 }),
  ...Array.from({ length: 12 }, (_, i) => N(`US${i + 1}`, "US", `US${i + 1}`)),
  ...Array.from({ length: 6 }, (_, i) => N(`US${i + 21}`, "US", `US${i + 21}`)),
  N("SF1", "SF", "SF1"),
], edges: [
  ...Array.from({ length: 12 }, (_, i) => E(`US${i + 1}`, "E1", "has_first_epoch")),
  ...Array.from({ length: 6 }, (_, i) => E(`US${i + 21}`, "E0", "has_first_epoch")),
  E("SF1", "E0", "has_first_epoch"),
] } };
const facts = () => ({ proxies: new Set(), rmdocs: new Map(), rmsf: new Map(), tilesets: new Set(), rmEpochs: new Map(), gis: [] });
const texts = { dim: { units: "Units", documents: "Documents", authors: "Authors", epochs: "Epochs", models: "Models", proxies: "Proxies",
  gis: "GIS", paradata: "Paradata", other: "Other", aux: "Aux" }, noEpoch: "No epoch", typeLabel: (t) => t, sourceNone: "Not on disk", empty: "—" };
const sources = [{ id: "f1", name: "T.em.json", kind: "file", graphs: [{ slot: "s1", name: "T", active: true, doc: () => doc, facts, aux: [] }] }];

let selected = null;
let ctxEpoch = null;
let toggled = new Set();
let setToggledCalls = 0;
let api;
const select = (id) => { selected = id; api.setSelected(id, true); };   // main.ts select → nodeList.setSelected
api = U.mountUnifiedOutliner(document.getElementById("host"), {
  sources: () => sources, texts: () => texts, opts: () => ({ ...U.readOpts(null) }),
  toggled: () => toggled, setToggled: (s) => { toggled = s; setToggledCalls++; },
  selectedId: () => selected, contextEpoch: () => ctxEpoch, sameWord: () => "same unit",
  pick: (r) => select(r.id),
  eyeOpen: () => true, toggleEye: () => {}, gisOpen: () => false, toggleGis: () => {},
  menu: () => {}, mark: () => document.createElement("span"), word: (k) => k,
});
const scroll = document.querySelector(".uo-scroll");
const rows = () => api.rows();
const sfRows = () => rows().map((r, i) => ({ r, i })).filter((x) => x.r.id === "SF1" && x.r.kind === "node");
const rowEl = (key) => [...document.querySelectorAll(".uo-row")].find((el) => el.dataset.key === key) ?? null;

// the case: SF1 listed twice, the second row in sight, the first out of it
const two = sfRows();
eq(two.length, 2, "SF1 is two rows (Età romana, Età arcaica)");
ok(two[0].r.key.includes("ep:E1") && two[1].r.key.includes("ep:E0"), "the first under Età romana, the second under Età arcaica");
const [first, second] = two; if (process.env.DUMP) console.log(rows().map((r, i) => `${i} ${"  ".repeat(r.depth)}${r.label} ${r.key}`).join("\n"));
scroll.scrollTop = second.i * 22 - 44;   // the second row is the third in sight
api.paintNow();
const before = scroll.scrollTop;
ok(first.i * 22 < before, "the first row of SF1 is out of sight, above");

// 1 · a click on the second row
rowEl(second.r.key).querySelector(".uo-label").dispatchEvent(new window.Event("click", { bubbles: true }));
eq(selected, "SF1", "the click selects the unit");
eq(scroll.scrollTop, before, "the list did not move (not one pixel)");
ok(rowEl(second.r.key).classList.contains("uo-sel"), "the row clicked stays lit");
eq(document.querySelectorAll(".uo-row.uo-sel").length, 1, "one row lit");
eq(setToggledCalls, 0, "no branch opened or closed");
// the first row: painted (overscan), with the light sign, not lit
const firstEl = rowEl(first.r.key);
ok(firstEl && firstEl.classList.contains("uo-same") && !firstEl.classList.contains("uo-sel"), "the other row of SF1: «same unit», not lit");
ok(firstEl.title.endsWith(" — same unit"), "…and its tip says so");

// 2 · the selection comes back from elsewhere for the same node: the row remembered stays
select("SF1");
ok(rowEl(second.r.key).classList.contains("uo-sel"), "from elsewhere, the same node: the row remembered stays");
eq(scroll.scrollTop, before, "…and in sight, nothing moves");

// 3 · from elsewhere, a node with no row remembered, then SF1 again with the epoch in front
select("US1");
ctxEpoch = "E0";
select("SF1");
ok(rowEl(second.r.key)?.classList.contains("uo-sel"), "from elsewhere (pickedKey of another node): the row under the epoch in front");
select("US1");
ctxEpoch = null;
select("SF1");
eq(rows()[first.i].key, first.r.key, "rows unchanged");
eq(setToggledCalls, 0, "a row of the node in sight: no branch opened");
ok(scroll.scrollTop <= first.i * 22, "no epoch in front: the first row, revealed");
ok(rowEl(first.r.key).classList.contains("uo-sel") && rowEl(second.r.key) === null || !rowEl(second.r.key)?.classList.contains("uo-sel"),
  "…and it is the first that is lit");

// 4 · keyboard: ↓ walks from the row lit
scroll.scrollTop = second.i * 22 - 44;
api.paintNow();
rowEl(second.r.key).querySelector(".uo-label").dispatchEvent(new window.Event("click", { bubbles: true }));
const after = rows().slice(second.i + 1).find((r) => r.id && (r.kind === "node" || r.kind === "sub"));
const root = document.querySelector(".uo");
root.dispatchEvent(Object.assign(new window.Event("keydown", { bubbles: true }), { key: "ArrowUp" }));
const up = rows().slice(0, second.i).reverse().find((r) => r.id && (r.kind === "node" || r.kind === "sub"));
eq(selected, up.id, "↑ from the row clicked: the row above IT (not above the node's first row)");
ok(rowEl(up.key)?.classList.contains("uo-sel"), "…lit");
if (after) {
  root.dispatchEvent(Object.assign(new window.Event("keydown", { bubbles: true }), { key: "ArrowDown" }));
  root.dispatchEvent(Object.assign(new window.Event("keydown", { bubbles: true }), { key: "ArrowDown" }));
  eq(selected, after.id, "↓ ↓ back over SF1 (the second row) and to the row after it");
}

// 5 · light and dark: the sign is the accent of the theme, both themes define it
const css = readFileSync(`${SRC}style.css`, "utf8");
const rule = /\.uo-row\.uo-same \.uo-label \{([^}]*)\}/.exec(css)?.[1] ?? "";
ok(/var\(--accent\)/.test(rule) && /dotted/.test(rule), "the «same unit» sign: a dotted underline in var(--accent)");
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
const darkBlock = /\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
ok(/--accent:/.test(rootBlock) && /--accent:/.test(darkBlock), "--accent in the light theme and in the dark one");
ok(/\.uo-row\.uo-band\.uo-sel/.test(css) && !/\.uo-same[^{]*\{[^}]*background/.test(css), "the sign paints no background: the row lit keeps its own");

// i18n: EN + IT
const i18n = readFileSync(`${SRC}i18n.ts`, "utf8");
eq((i18n.match(/"uo\.sameUnit":/g) ?? []).length, 2, "uo.sameUnit in EN and IT");

console.log(`check-outliner-riga: ${checks} checks ok`);
api.destroy();
