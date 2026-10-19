// MICRO-DOVE-CHI-MENU p.5 · SETTINGS BY TOPIC, AND NOTHING LOST ON THE WAY.
//
//   node scripts/check-settings-migrate.mjs
//
// A settings file written by dev.50 (one node in `hubUrl`, a room in `hubRoom`,
// Blender's host and port, the old `direction`, an ORCID client on the sandbox)
// is read by this build: the node becomes the first of the saved nodes AND stays
// the active one, the room is kept (it is chosen in «Where you are» now), Blender
// keeps its address, the ORCID client and base are kept, `direction` becomes
// `accept`; a round trip through save keeps all of it. Then the markup: the
// tabs are General · Identity · Connections · Viewers · Advanced, «Sync» is gone,
// no Room field and no Sign in in Settings, the ORCID client in a CLOSED
// «Advanced».
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
// what dev.50 wrote
store.set("emstudio.settings", JSON.stringify({
  identity: { orcidClientId: "APP-SANDBOX0001", orcidBase: "https://sandbox.orcid.org" },
  sync: { protocol: "ws", host: "192.168.1.5", port: 8790, tool: "blender", direction: "receive",
          hubUrl: "https://em.localhost:8443/em/", hubRoom: "sarmitest-16102026" },
  viewer: { atonBase: "https://aton.example" },
}));
const bundle = await esbuild.build({ stdin: { contents: `export * from "./settings";`, resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false });
const S = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const s = S.getSettings();
eq(s.sync.nodes, ["https://em.localhost:8443/em"], "the one node becomes the saved list");
eq(s.sync.hubUrl, "https://em.localhost:8443/em/", "…and stays the active one");
eq(S.savedNodes(s), ["https://em.localhost:8443/em"], "savedNodes: clean, once");
eq(s.sync.hubRoom, "sarmitest-16102026", "the room is kept");
eq([s.sync.protocol, s.sync.host, s.sync.port, s.sync.tool], ["ws", "192.168.1.5", 8790, "blender"], "Blender keeps its address");
eq(s.sync.accept, "everything", "direction receive → accept everything");
ok(!("direction" in s.sync), "direction is gone");
eq(s.identity, { orcidClientId: "APP-SANDBOX0001", orcidBase: "https://sandbox.orcid.org" }, "the ORCID client and base are kept");
eq(s.viewer.atonBase, "https://aton.example", "the rest is untouched");
eq(S.getSyncUrl(), "ws://192.168.1.5:8790", "the app's address");
// a round trip through save
S.saveSettings({ ...s, sync: { ...s.sync, nodes: [...s.sync.nodes, "https://nodo.esempio.eu/em"] } });
const back = JSON.parse(store.get("emstudio.settings"));
eq(back.sync.nodes, ["https://em.localhost:8443/em", "https://nodo.esempio.eu/em"], "saved: the list");
eq([back.sync.hubUrl, back.sync.hubRoom, back.sync.port, back.identity.orcidClientId],
   ["https://em.localhost:8443/em/", "sarmitest-16102026", 8790, "APP-SANDBOX0001"], "saved: nothing lost");
// an empty profile
store.clear();
const fresh = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text + "\n//2").toString("base64"));
eq(fresh.getSettings().sync.nodes, [], "a new profile: no node");

// the markup
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const tabs = [...html.matchAll(/data-settings-tab="([a-z]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
eq(tabs, ["general", "identity", "connections", "viewers", "advanced"], "the tabs, by topic");
ok(!/data-settings-tab="sync"/.test(html), "«Sync» is gone");
ok(!/id="set-hub-room"/.test(html), "no Room field in Settings");
ok(!/id="set-node-signin"/.test(html), "no Sign in in Settings");
ok(/id="set-node-test"|data-node-test|id="set-nodes"/.test(html), "Connections lists the nodes (Test, Remove per row)");
const adv = html.slice(html.indexOf('id="set-orcid-adv"') - 40, html.indexOf("</details>", html.indexOf('id="set-orcid-adv"')));
ok(/<details class="settings-adv" id="set-orcid-adv">/.test(adv) && !/<details[^>]*\bopen\b/.test(adv), "the ORCID client is in a CLOSED «Advanced»");
ok(/set-orcid-client/.test(adv) && /set-orcid-base/.test(adv), "…client id and orcid.org / sandbox both in it");
const ident = html.slice(html.indexOf('id="settings-sect-identity"'), html.indexOf("</section>", html.indexOf('id="settings-sect-identity"')));
ok(/id="set-orcid"/.test(ident) && /set-orcid-name/.test(ident) && /set-orcid-surname/.test(ident), "Identity: ORCID, name, surname");
const sync = html.slice(html.indexOf('id="settings-sect-sync"'), html.indexOf("</section>", html.indexOf('id="settings-sect-sync"')));
ok(/data-settings-tab="connections"/.test(html.slice(html.indexOf('id="settings-sect-sync"') - 80)) && /set-sync-protocol/.test(sync)
   && /set-sync-host/.test(sync) && /set-sync-port/.test(sync), "Connections: Blender's protocol, host, port");

console.log(`check-settings-migrate: ${checks} checks passed`);
