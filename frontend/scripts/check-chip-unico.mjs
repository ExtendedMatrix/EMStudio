// MICRO-CHIP-UNICO (E.D. 1 Nov 2026) · ONE place for who you are, with which
// node and where you work: the chip at the top right.
//
//   node scripts/check-chip-unico.mjs
//
// Measures, pure and in linkedom: the pair's steps ① Author → ② Node → ③ Sign
// in → ④ My space and their states; what each node-side action still misses,
// in order, and the step a click on a grey item leads to; THE node selector
// (`node-chooser.ts`) drawing inside its host without the bridge (the saved
// nodes and the typed one asked by the page, this computer and the network
// said unavailable) and with the bridge (the four groups, «Turn on a node»);
// «Le mie stanze» grey with the reason and the click to the step. And in the
// sources: the «Where you are» popup is gone (no #conn-pop), every door of the
// place opens the chip's menu, the selector is imported once and used by the
// chip and by Settings › Connections, Settings keeps only what lasts.
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
const { window: win, document: doc } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = win; globalThis.document = doc;
const load = async (what) => {
  const b = await esbuild.build({ stdin: { contents: what, resolveDir: SRC, loader: "ts" }, bundle: true, format: "esm", write: false });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const W = await load(`export * from "./who-chip";`);
const N = await load(`export * from "./node-chooser";`);
const C = await load(`export * from "./connection"; export { t, setLocale } from "./i18n";`);

// ── 1 · the four sections, in order ─────────────────────────────────────────
eq([...W.WHO_SECTIONS], ["author", "node", "where", "space"], "four sections: Autore, Nodo e account, Dove lavori, Il mio spazio");
eq([...W.PAIR_STEPS], ["author", "node", "login", "space"], "the pair's steps ① Autore → ② Nodo → ③ Accesso → ④ Il mio spazio");

// ── 2 · the pair completing itself ──────────────────────────────────────────
const author = { name: "Emanuel Demetrescu", orcid: "0000-0003-1234-5678", state: "declared" };
const NODE = "https://em.localhost:8443/em";
const st = (f) => W.pairSteps(f).map((s) => `${s.step}:${s.state}`).join(" ");
eq(st({ author: null, node: "", signedIn: false }), "author:todo node:todo login:todo space:todo", "nobody, no node");
eq(st({ author, node: "", signedIn: false }), "author:done node:todo login:todo space:todo", "an author, no node");
eq(st({ author, node: NODE, signedIn: false, reach: "reachable" }), "author:done node:done login:todo space:todo", "a node, not signed in");
eq(st({ author, node: NODE, signedIn: true, reach: "reachable" }), "author:done node:done login:done space:done", "signed in: the pair complete");
eq(st({ author, node: NODE, signedIn: true, reach: "unreachable" }), "author:done node:warn login:done space:warn", "a node that does not answer: warn");
eq(st({ author: null, node: NODE, signedIn: true, reach: "reachable" }), "author:todo node:done login:done space:done", "signed in without an author: my space is there, publishing is not");

// ── 3 · grey items: what is missing, in order, and where a click leads ──────
const none = { author: null, node: "", signedIn: false };
eq(W.pairMissing("rooms", none), ["node", "login"], "my rooms: «scegli un nodo → accedi»");
eq(W.pairMissing("space", { author, node: NODE, signedIn: false, reach: "reachable" }), ["login"], "my space with a node: «accedi»");
eq(W.pairMissing("publish", none), ["author", "node", "login"], "publish: the author too, first");
eq(W.pairMissing("roomCreate", { author: null, node: NODE, signedIn: true, reach: "reachable" }), ["author"], "a room signed in without an author: the author");
eq(W.pairMissing("publish", { author, node: NODE, signedIn: true, reach: "reachable" }), [], "complete: publish may go (phase 2 says the rest)");
eq(W.pairMissing("rooms", { author, node: NODE, signedIn: true, reach: "unreachable" }), ["node"], "a node that does not answer is missing");
eq(["author", "node", "login", "space"].map(W.sectionOfStep), ["author", "node", "node", "space"], "a missing step is done in its section");
C.setLocale("it");
eq(C.t("pair.needs", { steps: W.needKeys(["node", "login"]).map((k) => C.t(k)).join(" → ") }), "serve: scegli un nodo → accedi",
   "the sentence, in Italian: «serve: scegli un nodo → accedi»");
C.setLocale("en");
eq(C.t("pair.needs", { steps: W.needKeys(["author", "node", "login"]).map((k) => C.t(k)).join(" → ") }), "needs: say who signs → choose a node → sign in",
   "…and in English");
// the SignOp gate of MICRO-TESTATA-CLOUD stays coherent with the pair
for (const op of ["publish", "roomCreate", "roomBring"]) {
  ok(W.SIGN_NEEDS[op] === "node" && W.PAIR_NEEDS[op].includes("login"), `${op}: needSigner and the pair both want the node's login`);
}

// ── 4 · «Le mie stanze»: grey new room / bring, the reason, the click ──────
const calls = [];
const g = { setMode() {}, openNodeSettings() {}, openRoomSettings() {}, openOnNode() {}, leaveRoom() {},
  newRoom: () => calls.push("new"), bringIntoRoom: () => calls.push("bring"), listRooms: async () => [] };
const host = doc.createElement("div");
doc.body.appendChild(host);
C.renderMyRooms(host, { mode: "standalone", node: NODE, access: "orcid_node", reach: "reachable", room: null }, g,
  { newRoom: { say: "needs: say who signs", go: () => calls.push("go:author") },
    bringIntoRoom: { say: "needs: say who signs", go: () => calls.push("go:author") } });
const nr = host.querySelector('[data-act="new-room"]');
ok(nr.getAttribute("aria-disabled") === "true" && nr.title === "needs: say who signs", "New room: visible, grey, saying what is missing");
nr.dispatchEvent(new win.Event("click"));
eq(calls.at(-1), "go:author", "…and a click leads to the missing step, not to the room");
host.textContent = "";
C.renderMyRooms(host, { mode: "standalone", node: NODE, access: "orcid_node", reach: "reachable", room: null }, g);
host.querySelector('[data-act="new-room"]').dispatchEvent(new win.Event("click"));
eq(calls.at(-1), "new", "complete: New room does its work");

// ── 5 · THE node selector, without and with the bridge ─────────────────────
const used = [];
const hooks = (over = {}) => ({ bridge: "", saved: [NODE, "https://down.example/em"], current: () => NODE, projectRoot: "",
  use: (u) => used.push(u), log() {},
  probe: async (u) => ({ url: u, reachable: !u.includes("down"), version: "1.6" }), ...over });
const ch = doc.createElement("div");
doc.body.appendChild(ch);
await N.paintChooser(ch, hooks());
eq(ch.dataset.bridge, "no", "no bridge: the selector says so");
eq([...ch.querySelectorAll(".nc-group")].map((x) => x.dataset.group), ["local", "lan", "saved", "typed"],
   "the same four groups: this computer, the local network, saved, by hand");
eq([...ch.querySelectorAll('[data-group="saved"] .nc-row')].map((r) => r.dataset.url), [NODE, "https://down.example/em"], "the saved nodes, asked by the page");
ok(ch.querySelector('[data-group="saved"] .nc-row [data-act="use"]').disabled, "the node in use: its button off");
ok(!ch.querySelector('[data-act="turn-on"]') && /bridge/.test(ch.textContent), "«Turn on a node» needs the bridge, and that is said");
const typed = ch.querySelector("[data-nc-typed]");
typed.value = "https://altro.example/em";
ch.querySelector('[data-group="typed"] [data-act="try"]').dispatchEvent(new win.Event("click"));
await new Promise((r) => setTimeout(r, 10));
const trow = ch.querySelector('[data-group="typed"] .nc-row[data-url="https://altro.example/em"]');
ok(trow, "by hand: the typed address asked");
trow.querySelector('[data-act="use"]').dispatchEvent(new win.Event("click"));
eq(used.at(-1), "https://altro.example/em", "«Use» hands the node to the host");
// MICRO-RIFINITURE p.3 · a node typed by hand that does not answer: chosen, «non risponde» beside it, and it stays
await new Promise((r) => setTimeout(r, 10));
const downSaved = ch.querySelector('[data-group="saved"] .nc-row[data-url="https://down.example/em"]');
ok(downSaved && downSaved.querySelector('[data-act="use"]') && !downSaved.querySelector('[data-act="use"]').disabled
   && /non risponde|does not answer/.test(downSaved.textContent), "a saved node that does not answer: «Use», with «does not answer» beside it");
ch.querySelector("[data-nc-typed]").value = "https://down.typed.example/em";
ch.querySelector('[data-group="typed"] [data-act="try"]').dispatchEvent(new win.Event("click"));
await new Promise((r) => setTimeout(r, 10));
const drow = ch.querySelector('[data-group="typed"] .nc-row[data-url="https://down.typed.example/em"]');
ok(drow && /non risponde|does not answer/.test(drow.textContent) && drow.querySelector('[data-act="use"]'), "typed, silent: chosen with «does not answer» beside it");
drow.querySelector('[data-act="use"]').dispatchEvent(new win.Event("click"));
await new Promise((r) => setTimeout(r, 10));
eq(used.at(-1), "https://down.typed.example/em", "…handed to the host");
ok(ch.querySelector('[data-group="typed"] .nc-row[data-url="https://down.typed.example/em"]'), "…and its row is still there after «Use» (it vanished)");
// Settings' flavour: «Add», the saved ones marked
await N.paintChooser(ch, hooks({ pickLabel: "Add", picked: (u) => u === NODE }));
const savedBtns = [...ch.querySelectorAll('[data-group="saved"] .nc-row [data-act="use"]')].map((b) => `${b.textContent}:${b.disabled}`);
eq(savedBtns, ["saved:true", "Add:false"], "in Settings the same rows say «saved» / «Add» (the unreachable one too, since MICRO-RIFINITURE p.3)");
// with the bridge: its finder answers, «Turn on a node on this computer»
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => ({ ok: true, json: async () => String(url).endsWith("/nodes")
  ? { local: [], lan: [{ url: "http://192.168.1.9:8443", reachable: true }], saved: [], typed: [], lan_how: "mdns", lan_note: "",
      suggestion: "Nothing on this computer.", suggestion_key: "none", real_node: "" }
  : { ok: true, running: false } });
await N.paintChooser(ch, hooks({ bridge: "http://localhost:8765" }));
globalThis.fetch = realFetch;
eq(ch.dataset.bridge, "yes", "with the bridge: its finder");
ok(ch.querySelector('[data-act="turn-on"]'), "…and «Turn on a node on this computer»");
eq(ch.querySelector('[data-group="lan"] .nc-row')?.dataset.url, "http://192.168.1.9:8443", "…the local network's nodes");

// ── 6 · the sources: one menu, one selector, three doors ───────────────────
const main = readFileSync(`${SRC}main.ts`, "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
ok(!/conn-pop/.test(main), "the «Where you are» popup is gone (no #conn-pop)");
ok(!/renderConnectionPanel/.test(main + readFileSync(`${SRC}connection.ts`, "utf8")), "no second panel of the place");
ok(/modeIndicator\.addEventListener\("click", \(\) => toggleConnectionPanel\(\)\)/.test(main)
   && /function toggleConnectionPanel\([^)]*\): void \{\s*toggleWhoMenu\("where"\);/.test(main),
   "«On this computer» in the status bar opens the chip's menu at «Dove lavori»");
eq((main.match(/paintChooser\(/g) ?? []).length, 2, "the selector painted in two places of the page (the chip, Settings)…");
ok(/nodeChooserHooks\("chip"\)/.test(main) && /nodeChooserHooks\("settings"\)/.test(main), "…with the same hooks factory");
eq([...readFileSync(`${SRC}main.ts`, "utf8").matchAll(/from "\.\/node-chooser"/g)].length, 1, "imported once");
ok(!/id="set-node-add"/.test(html) && /id="set-node-chooser"/.test(html), "Settings › Connections adds a node with THE selector");
ok(/data-node-default|nodeDefault/.test(main) && /nodeEdit/.test(main) && /nodeRemove/.test(main), "Settings keeps what lasts: default, edit, remove");
ok(/who\.manage/.test(main) && /openNodeSettings\(\)/.test(main), "from the chip: «Manage nodes and connections…»");
ok(/paintRoomView\(menu, whoRoomView\)/.test(main), "the room's panel drawn inside the chip's menu (never a popup over it)");
ok(/openWhoMenu\("space"\)/.test(main), "after signing in: the menu lands on «Il mio spazio»");

console.log(`check-chip-unico: ${checks} checks passed`);
