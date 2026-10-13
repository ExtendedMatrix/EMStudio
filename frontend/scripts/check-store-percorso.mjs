// MICRO-STORE-PERCORSO · EMStudio reads a room's bytes by the PATH and the
// DIGEST, whatever host wrote the resource's url.
//
//   node scripts/check-store-percorso.mjs
//
// Measured in `tavolo-2026-10-12` (13 ott 2026): resident resources whose url
// names `localhost:8000`, `em.localhost:8443/em` or `MacBook-Pro-di-Emanuel.local:8000`,
// and a checksum without `sha256:`. With hubUrl = https://em.localhost:8443/em
// every form ends on `…/em/v1/rooms/tavolo-2026-10-12/asset/sha256:<hex>`; a
// web locator stays as it is. Then the road as `main.ts` installs it, against
// a fake node: a url on a host EMStudio is not connected to is asked on the
// node's base, with the bearer in the header.
import * as esbuild from "esbuild";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const SRC = new URL("../src/", import.meta.url).pathname;
let checks = 0;
const failures = [];
function ok(condition, what, detail = "") {
  checks += 1;
  console.log(`${condition ? "PASS" : "FAIL"}: ${what}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(what);
}

const b = await esbuild.build({
  stdin: { contents: `export * from "./store-url"; export * from "./node-road"; export { normDigest as invNormDigest } from "./room-inventory";`,
           resolveDir: SRC, loader: "ts" },
  bundle: true, format: "esm", write: false, logLevel: "silent" });
const M = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));

const ROOM = "tavolo-2026-10-12";
const HUB = "https://em.localhost:8443/em";
const BASE = `${HUB}/v1/rooms/${ROOM}/asset/`;          // assetStoreBase()
const HEX = "e5228d" + "0123456789abcdef".repeat(3) + "0123456789";
const WANT = `${BASE}sha256:${HEX}`;

// ── the digest, in one place ────────────────────────────────────────────────
ok(M.normDigest(HEX) === `sha256:${HEX}`, "digest · without prefix → sha256:<hex>");
ok(M.normDigest(`SHA256:${HEX.toUpperCase()}`) === `sha256:${HEX}`, "digest · upper case → lower case");
ok(M.normDigest(`sha256%3A${HEX}`) === `sha256:${HEX}`, "digest · an escaped colon too");
ok(M.normDigest("not-a-digest") === null, "digest · anything else → null");
ok(M.invNormDigest === M.normDigest, "digest · the Storage's (room-inventory) IS the same function");

// ── the three hosts measured, and the bare checksum ─────────────────────────
const forms = [
  `http://localhost:8000/v1/rooms/${ROOM}/asset/sha256:${HEX}`,
  `https://em.localhost:8443/em/v1/rooms/${ROOM}/asset/sha256:${HEX}`,
  `http://MacBook-Pro-di-Emanuel.local:8000/v1/rooms/${ROOM}/asset/sha256:${HEX}`,
  `http://MacBook-Pro-di-Emanuel.local:8000/v1/rooms/${ROOM}/asset/sha256%3A${HEX}`,
];
for (const url of forms) {
  ok(M.rebaseRoomUrl(url, BASE, ROOM) === WANT, `rebase · ${url.split("/")[2]} → the current base`, M.rebaseRoomUrl(url, BASE, ROOM));
  ok(M.storeAddress({ url, checksum: `sha256:${HEX}`, residency: "resident" }, BASE, ROOM) === WANT,
     `address · resident, url on ${url.split("/")[2]} → the store by digest`);
  ok(M.storeAddress({ url, checksum: HEX }, BASE, ROOM) === WANT,
     `address · checksum without prefix, no residency, url on ${url.split("/")[2]} → the store`);
  ok(M.storeAddress({ url }, BASE, ROOM) === WANT, `address · no checksum: the url rebased (${url.split("/")[2]})`);
}
ok(M.storeAddress({ url: "models/us1.glb", checksum: HEX, residency: "resident" }, BASE, ROOM) === WANT,
   "address · a path on disk with a checksum, in a room → the store");
ok(M.rebaseRoomUrl(`http://localhost:8000/v1/rooms/${ROOM}/asset-home/sha256:${HEX}`, BASE, ROOM)
   === `${HUB}/v1/rooms/${ROOM}/asset-home/sha256:${HEX}`, "rebase · asset-home too");

// ── what stays as it is ─────────────────────────────────────────────────────
const WEB = "https://sketchfab.example.org/models/us1.glb";
ok(M.storeAddress({ url: WEB }, BASE, ROOM) === WEB, "external · a web locator stays as it is");
ok(M.storeAddress({ url: WEB, checksum: HEX }, BASE, ROOM) === WEB, "external · …even with a checksum (no residency: a reference)");
ok(M.storeAddress({ url: WEB, checksum: HEX, residency: "reference" }, BASE, ROOM) === WEB, "external · residency reference keeps its url");
ok(M.storeAddress({ url: forms[0], checksum: HEX, residency: "reference" }, BASE, ROOM) === WANT,
   "reference · a url of this room is still rebased");
const OTHER = `http://localhost:8000/v1/rooms/altra-stanza/asset/sha256:${HEX}`;
ok(M.rebaseRoomUrl(OTHER, BASE, ROOM) === OTHER, "another room · not rewritten");
ok(M.storeAddress({ url: forms[0], checksum: HEX }, null, null) === forms[0], "offline · the url as written");

// ── the road, as main.ts installs it, against a fake node ───────────────────
const TOKEN = "TOKEN-percorso-0123456789";
const asked = [];
const server = createServer((req, res) => {
  asked.push({ url: req.url, auth: req.headers.authorization ?? null, host: req.headers.host });
  const m = /^\/em\/v1\/rooms\/([^/]+)\/asset\/([^/?]+)$/.exec(req.url ?? "");
  if (!m) { res.writeHead(404); res.end(); return; }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); res.end(); return; }
  if (decodeURIComponent(m[2]) !== `sha256:${HEX}`) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "model/gltf-binary" });
  res.end("GLB");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const NODE = `http://127.0.0.1:${server.address().port}/em`;
const NBASE = `${NODE}/v1/rooms/${ROOM}/asset/`;
M.setNodeRoad({
  owns: (u) => u.startsWith(NBASE) || M.isRoomUrl(u, ROOM),
  fetch: (u, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${TOKEN}`);
    return fetch(M.rebaseRoomUrl(u, NBASE, ROOM), { ...init, headers });
  },
});
for (const url of forms) {
  const n0 = asked.length;
  let body = null;
  try { body = new TextDecoder().decode(await M.nodeBytes(url)); } catch (e) { body = String(e); }
  const a = asked[n0];
  ok(body === "GLB" && a?.auth === `Bearer ${TOKEN}` && decodeURIComponent(a.url) === `/em/v1/rooms/${ROOM}/asset/sha256:${HEX}`,
     `road · ${url.split("/")[2]} asked on the node's base, signed`, JSON.stringify({ body, a }));
}
ok(!M.ownedByNode(WEB), "road · a web locator is not the node's (plain fetch, no bearer)");
server.close();

// ── main.ts is wired to the one rule ────────────────────────────────────────
const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const body = (sig) => { const i = main.indexOf(sig); return i < 0 ? "" : main.slice(i, main.indexOf("\n}\n", i)); };
const sfu = body("function spaceFileUrl(");
ok(sfu.indexOf("storeAddress(") > 0 && sfu.indexOf("storeAddress(") < sfu.indexOf("https?|blob|data"),
   "main · the scene asks storeAddress BEFORE keeping a web url");
ok(/storeAddress\(/.test(body("function docMediaUrl(")), "main · the Doc's viewer reads the store by digest");
ok(/storeUrlOf\(store0, c\)/.test(body("function docModelOf(")), "main · a file set's digests through storeUrlOf");
ok(/setNodeRoad\(\{ fetch: \(url, init\) => nodeAuthFetch\(nodeRoadUrl\(url\), init\)/.test(main),
   "main · the road rebases before signing");
ok(/isRoomUrl\(url, sync\.room\)/.test(body("function nodeOwnsUrl(")), "main · a url of this room is the node's on any host");

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) process.exit(1);
