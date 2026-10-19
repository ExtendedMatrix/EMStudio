// MICRO-DOVE-CHI-MENU p.3 · «WHERE YOU ARE» — the status bar's left label and
// its panel, in three sections, and nothing else in charge of the place.
//
//   node scripts/check-dove-sei.mjs
//
// Measures, on `connection.ts` drawn in linkedom: the label's four phrases
// («On this computer», «… · with Blender», «Room X · em.localhost»,
// «Room … · nodo.esempio.eu») and its dot (green / amber reconnecting / red
// unreachable); the panel's sections in order (mode · apps · nodes), the rooms
// UNDER the active node; a node that does not answer said in one line with
// «Try again» — never the browser's «Load failed»; the access as the list says
// it; Enter with ORCID / with the node's password on the active node, Leave
// once entered; no «Mode» menu in the top bar.
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
const bundle = await esbuild.build({ stdin: { contents: `export * from "./connection";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false });
const C = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const base = { mode: "standalone", node: "https://em.localhost:8443/em", access: "none", reach: "reachable", room: null };
eq(C.wherePhrase(base), "On this computer", "on this computer");
eq(C.wherePhrase({ ...base, mode: "sidecar", hostTool: "Blender" }), "On this computer · with Blender", "with Blender");
eq(C.wherePhrase({ ...base, mode: "hub", room: "sarmitest-16102026" }), "Room sarmitest-16102026 · em.localhost", "a room on em.localhost");
eq(C.wherePhrase({ ...base, mode: "hub", room: "r", roomTitle: "Foro", node: "https://nodo.esempio.eu/em" }), "Room Foro · nodo.esempio.eu", "a room on another node");
eq([C.whereHealth({ ...base, mode: "hub", room: "r" }), C.whereHealth({ ...base, mode: "hub", room: "r", reconnecting: true }),
    C.whereHealth({ ...base, mode: "hub", room: "r", reach: "unreachable" })], ["ok", "warn", "bad"], "green, amber, red");
eq(["orcid_node", "node_password", "room_token", "declared", "none", "expired"].map(C.nodeAccessOf),
   ["accredited", "declared", "declared", "none", "none", "expired"], "the access as the node list says it");
ok(C.unreachableError(new TypeError("Load failed")) && !C.unreachableError(new C.NodeError("forbidden", 403)), "Load failed = unreachable, a 403 is a refusal");

const calls = [];
const g = {
  setMode: (m) => calls.push(`mode:${m}`), openNodeSettings() {}, openRoomSettings() {}, openOnNode() {}, leaveRoom() {},
  chooseNode: () => calls.push("find-nodes"), addNode: () => calls.push("add-node"),
  enterNode: (u, how) => calls.push(`enter:${how}:${u}`), retryNode: (u) => calls.push(`retry:${u}`),
  useNode: (u) => calls.push(`use:${u}`), signOutOfNode: () => calls.push("leave-node"),
  findApp: async () => "ws://localhost:8788",
  listRooms: async () => { throw new TypeError("Load failed"); },
};
const host = doc.createElement("div");
doc.body.appendChild(host);
const nodes = [
  { url: "https://em.localhost:8443/em", active: true, reach: "reachable", access: "none" },
  { url: "https://nodo.esempio.eu/em", active: false, reach: "unreachable", access: "none" },
];
C.renderConnectionPanel(host, { ...base, nodes, appUrl: "ws://localhost:8788" }, g);
eq([...host.querySelectorAll(":scope > .conn-sect")].map((s) => s.dataset.sect), ["mode", "apps", "nodes"], "three sections, in order");
eq([...host.querySelectorAll(".conn-mode")].map((b) => b.textContent), ["On this computer", "With an app", "In a room"], "the three modes");
eq(host.querySelector(".conn-app-url").textContent, "ws://localhost:8788", "the app's address");
const active = host.querySelector('.conn-node[data-node="https://em.localhost:8443/em"]');
ok(active.querySelector('[data-sect="rooms"]'), "the rooms are drawn under the active node");
eq([...active.querySelectorAll("[data-act]")].map((b) => b.dataset.act).filter((a) => a.startsWith("enter")), ["enter-orcid", "enter-password"],
   "not entered: Enter with ORCID / with the node's password");
const down = host.querySelector('.conn-node[data-node="https://nodo.esempio.eu/em"] [data-err="unreachable"]');
ok(down && /does not answer/.test(down.textContent) && !/Load failed/.test(down.textContent), "an unreachable node in one plain line");
down.querySelector('[data-act="retry-node"]').dispatchEvent(new win.Event("click"));
eq(calls.at(-1), "retry:https://nodo.esempio.eu/em", "«Try again» asks that node again");
active.querySelector('[data-act="enter-orcid"]').dispatchEvent(new win.Event("click"));
eq(calls.at(-1), "enter:orcid:https://em.localhost:8443/em", "Enter with ORCID on the active node");
await new Promise((r) => setTimeout(r, 0));
const roomsErr = host.querySelector('[data-sect="rooms"] .conn-err');
ok(roomsErr && !/Load failed/.test(roomsErr.textContent) && /does not answer/.test(roomsErr.textContent),
   "the rooms list of a node that does not answer: no «Load failed»");
// entered: Leave this node
C.renderConnectionPanel(host, { ...base, access: "orcid_node", nodes: [{ ...nodes[0], access: "accredited" }] }, g);
ok(host.querySelector('[data-act="sign-out-node"]') && !host.querySelector('[data-act="enter-orcid"]'), "entered: Leave this node");
ok(/accredited/.test(host.querySelector(".conn-access").textContent), "the access is said: accredited");

// «Mode» left the top bar; the label is the way in, and ⇧⌘L
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
ok(!/id="dd-mode"/.test(html), "no Mode menu in the top bar");
ok(/id="mode-actions" hidden/.test(html), "the mode buttons stay, hidden, pressed by the panel");
const keymap = readFileSync(`${SRC}keymap.ts`, "utf8");
ok(/id: "where", keys: "⇧⌘L"/.test(keymap), "⇧⌘L is in the key map (Help ▸ Shortcuts)");

console.log(`check-dove-sei: ${checks} checks passed`);
