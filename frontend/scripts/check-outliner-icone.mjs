// MICRO-SEG21 · the Outliner's rows carry the SAME icons in the same places:
//
//   node scripts/check-outliner-icone.mjs
//
// E.D., 21 Nov (Templu Mare v11 › Temple, the Space's Outliner): a row under the
// mouse or selected grew a «◎» and a «⤢» it had not before — «more icons, and it
// makes no sense». Here `unified-outliner.ts` is mounted on a linkedom document
// as the Space mounts it (`opts.space`, a `SpaceRowDeps`), with proxies, one of
// them surviving from an earlier epoch:
//
// · a selected row and one not selected have the same number of icons, the same
//   columns in the same order (isolate · arrow · eye), as the heading's;
// · no icon that comes with the hover or the selection (no `.uo-mini`, no CSS
//   that shows one only on :hover / .uo-sel), no padlock column, no «⤢»;
// · the eye is a line SVG (open / shut), the arrow full / an outline, the isolate
//   the ◎; each with its tooltip, on and off; the keys in EN and IT;
// · the «⟲» of a survivor sits beside the name, quiet (no dashed frame), only on
//   the rows it applies to; a locked object has a quiet padlock beside its name;
// · double click frames, H / Shift+H / Alt+H reach the Space's verbs, and in an
//   eye-only Outliner (Sheets, Sources…) H shuts the row's eye, Alt+H opens all;
// · light and dark: the icons take the text's ink (`--text`), the isolate on the
//   accent — tokens both themes define.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const { window, document } = parseHTML(`<!doctype html><html><body><div id="host"></div><div id="host2"></div></body></html>`);
globalThis.window = window;
globalThis.document = document;
globalThis.MouseEvent = window.MouseEvent ?? window.Event;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
const P = window.HTMLElement.prototype;
Object.defineProperty(P, "scrollTop", { configurable: true, get() { return this._st ?? 0; }, set(v) { this._st = v; } });
Object.defineProperty(P, "clientHeight", { configurable: true, get() { return this.classList?.contains("uo-scroll") ? 2000 : 0; } });

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
  N("US1", "US"), N("US2", "US"), N("US3", "US"), N("SF1", "SF"),
], edges: [
  E("US1", "E1", "has_first_epoch"), E("US2", "E1", "has_first_epoch"), E("US3", "E1", "has_first_epoch"),
  E("SF1", "E0", "has_first_epoch"), E("SF1", "E1", "survive_in_epoch"),
] } };
const facts = () => ({ proxies: new Set(["US1", "US2", "US3", "SF1"]), rmdocs: new Map(), rmsf: new Map(), tilesets: new Set(), rmEpochs: new Map(), gis: [] });
const texts = { dim: { units: "Units", documents: "Documents", authors: "Authors", epochs: "Epochs", models: "Models", proxies: "Proxies",
  gis: "GIS", paradata: "Paradata", other: "Other", aux: "Aux" }, noEpoch: "No epoch", typeLabel: (t) => t, sourceNone: "Not on disk", empty: "—",
  space: { proxies: "Proxies", models: "Models", rmdoc: "doc", rmsf: "sf", gis: "GIS", survives: (from) => `survives from ${from}`, survivesMark: "⟲" } };
const sources = [{ id: "f1", name: "T.em.json", kind: "file", graphs: [{ slot: "s1", name: "T", active: true, doc: () => doc, facts, aux: [] }] }];

const i18n = readFileSync(`${SRC}i18n.ts`, "utf8");
const enOf = (k) => new RegExp(`"${k.replace(/\./g, "\\.")}": "([^"]*)"`).exec(i18n)?.[1];
const W = Object.fromEntries(["eye", "arrow", "isolate", "eyeOn", "eyeOff", "arrowOn", "arrowOff", "isolateOn", "isolateOff", "pinned"]
  .map((k) => [k, enOf(`uo.col.${k}`)]));

let keys = new Set();
const hidden = new Set();
const locked = new Set();
const pinned = new Set(["proxy:US3"]);
let isolated = null;
const calls = [];
let toggled = new Set();
const api = U.mountUnifiedOutliner(document.getElementById("host"), {
  sources: () => sources, texts: () => texts, opts: () => ({ ...U.readOpts(null), space: true, dims: ["proxies"] }),
  toggled: () => toggled, setToggled: (s) => { toggled = s; },
  selectedId: () => null, pick: () => {},
  eyeOpen: (k) => !hidden.has(k), toggleEye: (k) => { if (hidden.has(k)) hidden.delete(k); else hidden.add(k); },
  gisOpen: () => true, toggleGis: () => {},
  menu: () => {}, mark: () => document.createElement("span"), word: (k) => k,
  columnWords: W,
  frame: (r) => calls.push(["frame", r.skey ?? r.eye]),
  hideKey: (m) => calls.push(["hide", m]),
  selectedKeys: () => keys,
  pickKey: (r) => { keys = new Set([r.skey]); },
  space: {
    lockOpen: (k) => !locked.has(k), toggleLock: (k) => { if (locked.has(k)) locked.delete(k); else locked.add(k); },
    chip: () => null, chipMenu: () => {}, alt: () => null, altMenu: () => {}, failed: () => null, failMenu: () => {},
    isolated: () => isolated, isolate: (r) => { isolated = isolated === r.skey ? null : r.skey; },
    frame: (r) => calls.push(["sframe", r.skey]), chooseVersion: () => {}, forced: () => false,
    pinned: (k) => pinned.has(k), togglePin: () => {},
    words: { arrow: "Selectable", isolate: "Isolate", frame: "Frame", ghost: "ghost" },
  },
});
// open everything
const openAll = () => { for (let n = 0; n < 6; n++) { const s = new Set(toggled); for (const r of api.rows()) if (r.parent && !r.open) s.add(r.key); toggled = s; api.refresh(); } };
openAll();
if (process.env.DUMP) console.log(api.rows().map((r) => `${"  ".repeat(r.depth)}${r.label} ${r.key} ${r.skey ?? ""} ${r.note ?? ""}`).join("\n"));
const rowEl = (skey) => [...document.querySelectorAll(".uo-row")].find((el) => el.dataset.skey === skey && !el.dataset.key.includes("/sv:") && !el.querySelector("[data-note]")) ?? null;
const colsOf = (el) => [...el.querySelectorAll(".uo-cols > .uo-col")].map((c) => c.className.match(/uo-col-(isolate|arrow|eye|pin)/)?.[1]);
const iconsOf = (el) => el.querySelectorAll(".uo-cols svg").length;

// 1 · the heading: three columns, isolate · arrow · eye (the eye at the right, as Blender's)
const head = document.querySelector(".uo-colhead");
eq(colsOf(head), ["isolate", "arrow", "eye"], "the heading: isolate · arrow · eye");
eq(head.querySelectorAll("svg").length, 3, "…each a line icon (SVG)");
eq([...head.querySelectorAll(".uo-col")].map((c) => c.title), [W.isolate, W.arrow, W.eye], "…each with its tooltip");
ok(Object.values(W).every((v) => typeof v === "string" && v.length > 3), "the columns' words exist in EN");

// 2 · a row selected and one not: the same icons, the same places
const a = rowEl("proxy:US1"), b = rowEl("proxy:US2");
ok(a && b, "two proxies' rows drawn");
const restCount = iconsOf(a);
eq(restCount, 3, "a row at rest: three icons");
a.querySelector(".uo-label").dispatchEvent(new window.Event("click", { bubbles: true }));
const aSel = rowEl("proxy:US1"), bNot = rowEl("proxy:US2");
ok(aSel.classList.contains("uo-sel") && !bNot.classList.contains("uo-sel"), "US1 selected, US2 not");
eq(iconsOf(aSel), iconsOf(bNot), "a selected row and one not selected: the same number of icons");
eq(colsOf(aSel), colsOf(bNot), "…the same columns in the same order");
eq(colsOf(aSel), colsOf(head), "…the heading's");
eq(aSel.querySelectorAll("button, svg").length, bNot.querySelectorAll("button, svg").length, "…and nothing else appears on the row selected");
ok(!document.querySelector(".uo-mini, [data-sp=frame], [data-sp=pin]"), "no «◎ ⤢» that come with the hover, no padlock column");
ok(![...document.querySelectorAll(".uo-row")].some((el) => /[⤢🔒🔓]/u.test(el.textContent)), "no ⤢ and no padlock glyph on any row");

// 3 · the icons and their states
const eyeOf = (skey) => rowEl(skey).querySelector("[data-eye]");
eq(eyeOf("proxy:US2").title, W.eyeOn, "the eye open: «Visible: click to hide (H)»");
ok(eyeOf("proxy:US2").querySelector("circle"), "…an eye with its pupil");
eyeOf("proxy:US2").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(hidden.has("proxy:US2"), "a click on the eye hides");
ok(eyeOf("proxy:US2").classList.contains("uo-eye-off") && !eyeOf("proxy:US2").querySelector("circle"), "…the eye shut (no pupil), attenuated");
eq(eyeOf("proxy:US2").title, W.eyeOff, "…its tooltip says how to show it");
eq(iconsOf(rowEl("proxy:US2")), 3, "…still three icons");
const arrowOf = (skey) => rowEl(skey).querySelector("[data-sp=arrow]");
ok(arrowOf("proxy:US2").querySelector("path[fill=currentColor]"), "the arrow selectable: full");
arrowOf("proxy:US2").dispatchEvent(new window.Event("click", { bubbles: true }));
ok(locked.has("proxy:US2") && arrowOf("proxy:US2").classList.contains("uo-arrow-off"), "a click: not selectable, attenuated");
ok(!arrowOf("proxy:US2").querySelector("path[fill=currentColor]"), "…an empty outline");
eq(arrowOf("proxy:US2").title, W.arrowOff, "…its tooltip");
const isoOf = (skey) => rowEl(skey).querySelector("[data-sp=isolate]");
eq(isoOf("proxy:US2").title, W.isolateOff, "the isolate off: its tooltip");
isoOf("proxy:US2").dispatchEvent(new window.Event("click", { bubbles: true }));
eq(isolated, "proxy:US2", "a click isolates");
ok(isoOf("proxy:US2").classList.contains("uo-col-on") && isoOf("proxy:US2").querySelector("circle[fill=currentColor]"), "…the ◎ on: the inner disc full");
eq(isoOf("proxy:US1").getAttribute("aria-pressed"), "false", "the others' isolate stays where it is, off");
eq(iconsOf(rowEl("proxy:US1")), 3, "…and they keep their three icons");

// 4 · the informative signs: beside the name, only where they apply
const sv = [...document.querySelectorAll(".uo-row")].find((el) => el.querySelector("[data-note]"));
ok(sv, "the survivor's row is drawn");
const note = sv.querySelector("[data-note]");
eq(note.textContent, "⟲", "the survivor's sign ⟲");
ok(note.previousElementSibling?.classList.contains("uo-label"), "…right after the name");
ok(note.parentElement === sv && !note.closest(".uo-cols") && !note.closest(".uo-marks"), "…not a column, not among the marks at the right");
eq(iconsOf(sv), 3, "…and the row still has the three column icons");
eq(document.querySelectorAll("[data-note]").length, 1, "only the survivor's row carries it");
const pin = rowEl("proxy:US3").querySelector("[data-pinned]");
ok(pin && pin.title === W.pinned, "a locked object: a quiet padlock beside the name, saying where to unlock it");
ok(!rowEl("proxy:US1").querySelector("[data-pinned]"), "…only on the locked one");

// 5 · double click frames; the keys
rowEl("proxy:US1").querySelector(".uo-label").dispatchEvent(new window.Event("dblclick", { bubbles: true }));
ok(calls.some((c) => c[0] === "frame"), "a double click frames the object (what «⤢» did)");
const root = document.querySelector("#host .uo");
const key = (k, extra = {}) => root.dispatchEvent(Object.assign(new window.Event("keydown", { bubbles: true }), { key: k, code: "KeyH", altKey: false, shiftKey: false, metaKey: false, ctrlKey: false, ...extra }));
calls.length = 0;
key("h"); key("H", { shiftKey: true }); key("˙", { altKey: true });
eq(calls, [["hide", "selected"], ["hide", "unselected"], ["hide", "reveal"]], "H, Shift+H, Alt+H (by the key's place: «˙» on a Mac)");
calls.length = 0;
key("h", { metaKey: true });
eq(calls, [], "⌘H is not H");

// 6 · an eye-only Outliner (Sheets, Sources…): one column, the same on every row
const hidden2 = new Set();
let sel2 = null;
let api2;
api2 = U.mountUnifiedOutliner(document.getElementById("host2"), {
  sources: () => sources, texts: () => texts, opts: () => ({ ...U.readOpts(null) }),
  toggled: () => new Set(), setToggled: () => {}, selectedId: () => sel2, pick: (r) => { sel2 = r.id; api2.setSelected(r.id, false); },
  eyeOpen: (k) => !hidden2.has(k), toggleEye: (k) => { if (hidden2.has(k)) hidden2.delete(k); else hidden2.add(k); },
  gisOpen: () => true, toggleGis: () => {}, menu: () => {}, mark: () => document.createElement("span"), word: (k) => k,
  columnWords: W, hideKey: (m) => calls.push(["hide2", m]),
});
const h2 = document.getElementById("host2");
eq(colsOf(h2.querySelector(".uo-colhead")), ["eye"], "elsewhere: the eye alone in the heading");
const r2 = [...h2.querySelectorAll(".uo-row")].filter((el) => el.querySelector("[data-eye]"));
ok(r2.length >= 2, "rows with an eye");
const k0 = r2[0].dataset.key;
r2[0].querySelector(".uo-label").dispatchEvent(new window.Event("click", { bubbles: true }));
const rows2 = [...h2.querySelectorAll(".uo-row")];
const s2 = rows2.find((el) => el.classList.contains("uo-sel"));
const n2 = rows2.find((el) => !el.classList.contains("uo-sel") && el.querySelector("[data-eye]"));
ok(s2 && n2, "one row selected, one not");
eq(s2.querySelectorAll(".uo-cols > .uo-col").length, n2.querySelectorAll(".uo-cols > .uo-col").length, "…the same columns");
const root2 = h2.querySelector(".uo");
root2.dispatchEvent(Object.assign(new window.Event("keydown", { bubbles: true }), { key: "h", code: "KeyH", altKey: false, shiftKey: false, metaKey: false, ctrlKey: false }));
eq(hidden2.size, 1, "H shuts the eye of the row lit");
calls.length = 0;
root2.dispatchEvent(Object.assign(new window.Event("keydown", { bubbles: true }), { key: "˙", code: "KeyH", altKey: true, shiftKey: false, metaKey: false, ctrlKey: false }));
eq(calls, [["hide2", "reveal"]], "Alt+H shows everything");
void k0;

// 7 · the CSS: no icon shown only on hover / selection; tokens of both themes
const css = readFileSync(`${SRC}style.css`, "utf8");
ok(!/\.uo-mini/.test(css), "no `.uo-mini` rule left");
ok(!/(:hover|\.uo-sel)[^{]*\.uo-col[^{]*\{[^}]*display\s*:/.test(css), "no column displayed only on hover / selection");
ok(!/\.uo-badge-activate\s*\{[^}]*opacity:\s*0\s*;/.test(css), "the source's «activate» is there at rest too (quiet), not only on hover");
ok(/\.uo-row \.uo-col \{[^}]*var\(--text\)/.test(css) && /uo-isolate\.uo-col-on \{[^}]*var\(--accent/.test(css), "the icons in the text's ink, the isolate on in the accent");
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
const darkBlock = /\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
ok(/--text:/.test(rootBlock) && /--text:/.test(darkBlock) && /--accent:/.test(darkBlock), "--text and --accent in the light theme and in the dark one");
ok(/\.uo-note \{[^}]*\}/.test(css) && !/\.uo-note \{[^}]*dashed/.test(css), "the note: no dashed frame");

// i18n: EN + IT
for (const k of ["eye", "arrow", "isolate", "eyeOn", "eyeOff", "arrowOn", "arrowOff", "isolateOn", "isolateOff", "pinned"])
  eq((i18n.match(new RegExp(`"uo\\.col\\.${k}":`, "g")) ?? []).length, 2, `uo.col.${k} in EN and IT`);
for (const k of ["uo.sp.pin", "uo.sp.unpin"]) eq((i18n.match(new RegExp(`"${k.replace(/\./g, "\\.")}":`, "g")) ?? []).length, 2, `${k} in EN and IT`);

console.log(`check-outliner-icone: ${checks} checks ok`);
api.destroy(); api2.destroy();
