// MICRO-DOVE-CHI-MENU p.2 · ONE LIST OF RECENTS — File ▸ Open Recent (the page's
// and the system's) and the Stratigraphy panel read `recent.ts`, files and rooms.
//
//   node scripts/check-recents.mjs
//
// Measures: a room entered is a recent beside the files, deduplicated by node +
// room; the menu's items say where each one lives; a browser drop is listed and
// not reopenable; «Clear the list» empties it; every change is told to the
// drawers (`onRecentsChange`), which is how the system's menu follows; the cap
// is 10; and the page's «Open Recent» draws exactly the list's items.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const { window: win, document: doc } = parseHTML(html);
globalThis.window = win; globalThis.document = doc;

const bundle = await esbuild.build({
  stdin: { contents: `export * from "./recent"; export * from "./menu-ui";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false,
});
const R = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let told = 0;
R.onRecentsChange(() => told++);
R.addRecent({ path: "/Users/ed/scavi/sarmi.emj", name: "sarmi.emj" }, 1);
R.addRecent({ path: null, name: "dropped.emj" }, 2);
R.addRecentRoom({ node: "https://em.localhost:8443/em/", room: "sarmitest-16102026", name: "Sarmizegetusa test" }, 3);
R.addRecentRoom({ node: "https://em.localhost:8443/em", room: "sarmitest-16102026", name: "Sarmizegetusa" }, 4);
eq(told, 4, "every change is told to the drawers");
const list = R.getRecents();
eq(list.map((r) => r.kind ?? "file"), ["room", "file", "file"], "a room beside the files, the same room once (node + room)");
eq(list[0].name, "Sarmizegetusa", "the newest title wins");
eq(R.recentWhere(list[0]), "em.localhost:8443 · sarmitest-16102026", "a room says node · room");
eq(R.recentWhere(list[2]), "/Users/ed/scavi", "a file says its folder");
eq([R.recentReopenable(list[0]), R.recentReopenable(list[1]), R.recentReopenable(list[2])], [true, false, true],
   "a browser drop is listed, not reopenable");
for (let i = 0; i < 12; i++) R.addRecent({ path: `/f/${i}.emj`, name: `${i}.emj` }, 10 + i);
eq(R.getRecents().length, 10, "capped at 10");
R.removeRecentEntry(R.getRecents()[0]);
eq(R.getRecents()[0].name, "10.emj", "one entry removed (Remove from the list)");

// the page's File ▸ Open Recent draws the hook's items, fresh at every opening
R.clearRecents();
eq(R.getRecents().length, 0, "Clear the list empties it");
R.addRecentRoom({ node: "https://nodo.esempio.eu/em", room: "r1", name: "Uno" }, 5);
R.addRecent({ path: "/a/b.emj", name: "b.emj" }, 6);
const items = () => R.getRecents().map((r, i) => ({ id: String(i), label: r.name, detail: R.recentWhere(r), run() {} }))
  .concat([{ id: "—", label: "", run() {} }, { id: "clear", label: "Clear the list", run() {} }]);
R.buildPageMenus("web", { recent: items });
const toggle = doc.querySelector('#dd-file [data-sub="openRecent"] .dd-sub-toggle');
ok(toggle, "File has Open Recent");
toggle.dispatchEvent(new win.Event("click"));
const drawn = [...doc.querySelectorAll('#dd-file [data-sub="openRecent"] .dd-sub-menu > *')]
  .map((e) => e.classList.contains("dd-sep") ? "—" : `${e.querySelector(".dd-label-text")?.textContent}|${e.querySelector(".dd-detail")?.textContent ?? ""}`);
eq(drawn, ["b.emj|/a", "Uno|nodo.esempio.eu · r1", "—", "Clear the list|"], "the menu draws the list: name, where, Clear");

// one source: the panel and the menus import the same module
const emtree = readFileSync(`${SRC}emtree.ts`, "utf8");
ok(/from "\.\/recent"/.test(emtree) && /getRecents\(\)/.test(emtree), "the Stratigraphy panel reads recent.ts");
const main = readFileSync(`${SRC}main.ts`, "utf8");
ok(/recentMenuItems\(\)[\s\S]*getRecents\(\)/.test(main), "File ▸ Open Recent reads recent.ts");
ok(/addRecentRoom\(/.test(main), "a room entered is recorded");
ok(/recent\.missingAsk/.test(main) && /removeRecentEntry\(r\)/.test(main), "a missing file is said, and «Remove from the list» offered");

console.log(`check-recents: ${checks} checks passed`);
