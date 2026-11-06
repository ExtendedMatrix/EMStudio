// MICRO-RIFINITURE p.2 (E.D., 1 Nov 2026) · «Condividi con…» inside EMStudio:
// the room's invitations and permissions (the chip's room panel, the node's
// API), only for whoever manages the room — owner or admin; an editor or a
// viewer does not see it; «Condividi questa stanza…» (the node's page, the
// whole management) stays beside it.
//
//   node scripts/check-share-with.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

const SRC = new URL("../src/", import.meta.url).pathname;
let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { window: win, document: doc } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = win; globalThis.document = doc;
const b = await esbuild.build({ stdin: { contents: `export * from "./connection"; export { setLocale } from "./i18n";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false });
const C = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
C.setLocale?.("it");

const state = (role) => ({ mode: "hub", node: "https://node.example/em", room: "cantiere", role, access: "entered",
  hostFile: null, notice: null, misaligned: false, reconnecting: false, waitingOps: 0, readOnly: false, sync: "aligned", who: null, nodes: [], appUrl: "" });
const draw = (role, gestures) => {
  const host = doc.createElement("div");
  doc.body.appendChild(host);
  C.renderWhereSection(host, state(role), gestures);
  return host;
};
let opened = 0;
const g = { shareWith: () => { opened++; }, shareRoom: () => {}, leave: () => {} };
for (const role of ["owner", "admin"]) {
  const h = draw(role, g);
  const sw = h.querySelector('[data-act="share-with"]');
  ok(sw && /Condividi con/.test(sw.textContent), `${role}: «Condividi con…» is there`);
  ok(h.querySelector('[data-act="share-room"]'), `${role}: «Condividi questa stanza…» (the node's page) stays beside it`);
  sw.dispatchEvent(new win.Event("click"));
}
ok(opened === 2, "a click opens the room's panel (invitations, roles)");
for (const role of ["editor", "viewer", null]) {
  const h = draw(role, g);
  ok(!h.querySelector('[data-act="share-with"]'), `${String(role)}: no «Condividi con…» (only whoever can)`);
}
const h = draw("owner", { shareRoom: () => {}, leave: () => {} });
ok(!h.querySelector('[data-act="share-with"]'), "outside a room (no gesture): nothing");
const main = readFileSync(`${SRC}main.ts`, "utf8");
ok(/shareWith: sync\.connected && sync\.room \? \(\) => openRoomPanel\(sync\.room!\)/.test(main), "main.ts: the gesture opens the chip's room panel, in a room only");
const conn = readFileSync(`${SRC}connection.ts`, "utf8");
ok(/const manager = info\.your_role === "owner" \|\| info\.your_role === "admin";/.test(conn), "the panel itself draws members, ORCID and link only for a manager (the node refuses the rest)");
console.log(`check-share-with: ${checks} checks passed`);
