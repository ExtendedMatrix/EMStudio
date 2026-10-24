// CONSUMER · Heriverse as a real, live consumer of a real room — headless.
//
//   node scripts/check-consumer-live.mjs
//
// Connector #1 (Blender) writes: app-side, bidirectional, guarded. This is the
// OTHER half of the same contract — a **consumer**: read-only, over the cloud,
// for dissemination. It is the test of whether "one contract, many tools" is a
// design or a slogan, and the thing it measures is what 3DR's viewer will
// actually do:
//
//   1. it JOINS a room and READS the published graph;
//   2. somebody edits in EMStudio and the change ARRIVES (subscribe rides the
//      existing op channel — no new transport was built for it);
//   3. it RESOLVES an asset by sha256, and the LICENCE travels with the bytes;
//   4. it may not WRITE: the room refuses, out loud, with the role;
//   5. an EMBARGOED asset is refused **with the date** — and the library's own
//      verdict (`s3dgraphy.contract.consumer.serve_asset`) says the same thing
//      about the same document, which is the only way to know that the seam and
//      the server have not drifted;
//   6. …and the embargo lifted, both serve it again.
//
// **The stand-in is deliberately hand-written.** For the room test the rule is
// the opposite (drive the REAL client, or the proof outlives the agreement) —
// here the hand-written half IS the deliverable: it is the minimal client
// Heriverse has to implement, in the language Heriverse is written in, and if it
// needed anything from our source tree it would not be minimal. The EDITOR half
// still drives the real `SyncClient`, so what the consumer receives is what
// EMStudio actually sends.
//
// What it needs, and refuses to invent: a stack that is up, and two tokens
// (`dev-stack/token.sh`, plus `--user viewer` for somebody who is NOT an
// editor — a read-only gate cannot be measured with a writer's token). It leaves
// behind one throwaway room, the same discipline as the smokes.
//
// NOT measured here, and declared: a consumer cannot ANNOUNCE its descriptor in
// a room. `host_info` is the frame that carries one, and the relay does not
// forward it between clients (it sends its own). So today EMStudio learns a
// descriptor from a paired host, never from a room member. The descriptor half
// therefore lives in `check-connectors.mjs` (the registry, the handshake, the
// grant) and in `s3Dgraphy/tests/test_contract_consumer.py` (the serving seam).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import * as esbuild from "esbuild";

const BASE = process.env.EM_HUB_BASE ?? "https://em.localhost:8443/em";
const CA = process.env.EM_CA ?? `${homedir()}/caddy-em-root.crt`;
const HERE = new URL(".", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;
const S3D = new URL("../../../s3Dgraphy/src", import.meta.url).pathname;

// ── the internal CA, once (same re-exec as check-room-live) ──────────────────
if (BASE.startsWith("https://") && !process.env.NODE_EXTRA_CA_CERTS) {
  if (!existsSync(CA)) {
    console.log(`consumer: no CA at ${CA} — the https base cannot be verified.`);
    console.log("      Run against the direct port instead:");
    console.log("      EM_HUB_BASE=http://localhost:8000 node "
                + "scripts/check-consumer-live.mjs");
    process.exit(0);
  }
  const { spawnSync } = await import("node:child_process");
  const self = new URL(import.meta.url).pathname;
  const again = spawnSync(process.execPath, [self], {
    stdio: "inherit", env: { ...process.env, NODE_EXTRA_CA_CERTS: CA },
  });
  process.exit(again.status ?? 1);
}

// ── the two identities ──────────────────────────────────────────────────────
const HELPER = `${HERE}../../../stratigraph-server/dev-stack/token.sh`;

function tokenFor(user) {
  if (!existsSync(HELPER)) return null;
  try {
    const args = user ? ["--user", user] : [];
    return execFileSync(HELPER, args, { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

/** What a token says it is. Decoded, never verified — StratiGraph Server checks the
 *  signature and it is right to be the only one that does. */
function claims(token) {
  const part = token.split(".")[1] ?? "";
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf-8"));
  } catch {
    return {};
  }
}

const EDITOR = process.env.EM_TOKEN ?? tokenFor(null);
const CONSUMER = tokenFor("viewer");
if (!EDITOR || !CONSUMER) {
  console.log("consumer: need two tokens (an editor and a `viewer` user) and "
              + "dev-stack/token.sh did not answer — is the stack up? "
              + "checks SKIPPED");
  process.exit(0);
}
const CONSUMER_ID = claims(CONSUMER).orcid ?? claims(CONSUMER).preferred_username;
if (!CONSUMER_ID) {
  console.log("consumer: the viewer's token carries no identity — SKIPPED");
  process.exit(0);
}

// A throwaway room: an embargo is declared and lifted in it, and doing that in
// a demo room would leave somebody else's fixture changed. It is DELETED at the
// end, also when a check fails (MICRO-SUITE-VERDE: until 24 Oct each run left
// one on the dev node — two hundred and more of them).
const ROOM = `heriverse-standin-${Math.random().toString(16).slice(2, 10)}`;
const HTTP = BASE.replace(/^ws/, "http").replace(/\/+$/, "");

// ── the real client, for the EDITOR half ────────────────────────────────────
globalThis.window = globalThis;             // sync.ts schedules on `window`
const load = async (file) => import("data:text/javascript;base64," + Buffer.from(
  (await esbuild.build({ entryPoints: [`${SRC}${file}`], bundle: true,
                         format: "esm", write: false })).outputFiles[0].text,
).toString("base64"));
const S = await load("sync.ts");
const H = await load("hub.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

async function until(what, predicate, ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** DELETE the throwaway room: the node refuses (409) while a socket is still
 *  open, so it asks again for a few seconds; 404 is a room never kept. */
async function deleteRoom() {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${HTTP}/v1/rooms/${encodeURIComponent(ROOM)}`, {
      method: "DELETE", headers: { authorization: `Bearer ${EDITOR}`, "content-type": "application/json" },
      body: JSON.stringify({ confirm: ROOM }) }).catch((e) => ({ status: 0, text: async () => String(e) }));
    if (r.status === 200) return "deleted";
    if (r.status === 404) return "not kept by the node (nothing to delete)";
    if (r.status !== 409) return `NOT deleted (${r.status} ${(await r.text()).slice(0, 120)})`;
    await new Promise((res) => setTimeout(res, 500));
  }
  return "NOT deleted (somebody still connected after 10 s)";
}

const stamp = () => new Date().toISOString();
const op = (kind, fields) => ({ op: kind, ts: stamp(), ...fields });

// ── the CONSUMER: the minimal client, by hand ───────────────────────────────
/**
 * Everything a Heriverse adapter needs is in here, and it is not much: one
 * WebSocket, the v2 envelope, and four frame types it cares about.
 */
function standIn(token) {
  const url = H.roomUrl(BASE, ROOM, { token });
  const heard = { host: null, snapshot: null, ops: [], denied: [],
                  presence: [], other: [] };
  const ws = new WebSocket(url);
  ws.addEventListener("message", (ev) => {
    let frame;
    try {
      frame = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    const { type, payload } = frame;
    if (type === "host_info") heard.host = payload;
    else if (type === "snapshot") heard.snapshot = payload.doc;
    else if (type === "op") heard.ops.push(payload);
    else if (type === "denied") heard.denied.push(payload);
    else if (type === "presence") heard.presence.push(payload);
    else heard.other.push(type);
  });
  const send = (type, payload) =>
    ws.send(JSON.stringify({ v: 2, type, source: "heriverse", payload }));
  return { ws, heard, send, open: new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
    ws.addEventListener("close", (e) => reject(new Error(
      `the room closed the socket: ${e.code} ${e.reason || ""}`)));
  }) };
}

/** An HTTP call with a token, returning status + headers + body. */
async function get(path, token) {
  const answer = await fetch(`${HTTP}${path}`,
                             { headers: { Authorization: `Bearer ${token}` } });
  const body = await answer.text();
  return { status: answer.status, headers: answer.headers, body };
}

/** The LIBRARY's own verdict on the same document — the whole point of asking
 *  it: if the seam and the server disagree, one of them is wrong and nobody
 *  would notice until a viewer showed an embargoed model. */
function libraryVerdict(document, digest, role) {
  if (!existsSync(S3D)) return null;
  const dir = mkdtempSync(joinPath(tmpdir(), "em-consumer-"));
  const file = joinPath(dir, "doc.json");
  writeFileSync(file, JSON.stringify(document));
  try {
    return JSON.parse(execFileSync("python3", ["-c", `
import json, sys
sys.path.insert(0, "${S3D}")
from s3dgraphy.contract import heriverse, serve_asset
document = json.load(open("${file}"))
out = serve_asset(document, "${digest}", heriverse(), role=${
      role === null ? "None" : `"${role}"`})
print(json.dumps({"ok": out.ok, "message": out.message,
                  "reason": out.data.get("reason"),
                  "embargo": out.data.get("embargo"),
                  "license": out.data.get("license")}))
`], { encoding: "utf8" }));
  } catch (err) {
    console.log("consumer: could not ask the library — the agreement case was "
                + "SKIPPED (declared): " + String(err).split("\n")[0]);
    return null;
  }
}

console.log(`room  : ${ROOM}\nbase  : ${BASE}\nviewer: ${CONSUMER_ID}\n`);

const editor = new S.SyncClient();
const editorHeard = { snapshot: null, results: [], host: null };
let viewer = null;

try {
  // ── 1 · the study, made by somebody who may ───────────────────────────────
  editor.connectHub({ url: BASE, room: ROOM, token: EDITOR }, {
    onSelect: () => {}, onOp: () => {},
    onSnapshot: (doc) => { editorHeard.snapshot = doc; },
    // MERGED, not replaced — the way `main.ts` folds it: the snapshot carries a
    // second, thinner `host` block ({tool, file}), and overwriting with it loses
    // the role the door said. Measured: the first run read "role undefined" from
    // a frame that had never claimed to carry one.
    onHostInfo: (info) => { editorHeard.host = { ...editorHeard.host, ...info }; },
    onOpResult: (r) => editorHeard.results.push(r),
    onStatus: () => {},
  });
  await until("the editor's snapshot", () => editorHeard.snapshot);
  ok(editorHeard.host?.can_write === true,
     `consumer · the editor may write here (role ${editorHeard.host?.role})`);

  // the asset FIRST: the digest is what the graph then points at
  const bytes = Buffer.from(`glTF-stand-in-${ROOM}`);
  const put = await fetch(
    `${HTTP}/v1/rooms/${ROOM}/asset?media_type=model%2Fgltf-binary`,
    { method: "PUT", body: bytes,
      headers: { Authorization: `Bearer ${EDITOR}` } });
  ok(put.ok, `consumer · the asset was published (${put.status})`);
  const asset = await put.json();
  const digest = asset.ref;                       // `sha256:<hex>`

  for (const one of [
    op("add_node", { node: { id: "us-1", node_type: "US", name: "US 1" } }),
    op("add_node", { node: { id: "us-2", node_type: "US", name: "US 2" } }),
    op("add_edge", { id: "e1", source: "us-1", target: "us-2",
                     edge_type: "is_before" }),
    op("add_node", { node: { id: "res-1", node_type: "resource",
                             name: "model.glb", data: { checksum: digest } } }),
    op("add_node", { node: { id: "lic-1", node_type: "license",
                             name: "CC-BY-4.0",
                             data: { license_type: "CC-BY-4.0" } } }),
    op("add_edge", { id: "e-lic", source: "res-1", target: "lic-1",
                     edge_type: "has_license" }),
  ]) editor.sendOp(one);
  await until("the study to land", () => editorHeard.results.length >= 6);
  eq(editorHeard.results.filter((r) => r.applied).length, 6,
     "consumer · the room applied the whole study");

  // ── 2 · the grant: a viewer is somebody who was GRANTED something ─────────
  const grant = await fetch(
    `${HTTP}/v1/rooms/${ROOM}/members/${encodeURIComponent(CONSUMER_ID)}`,
    { method: "PUT", body: JSON.stringify({ role: "viewer" }),
      headers: { Authorization: `Bearer ${EDITOR}`,
                 "Content-Type": "application/json" } });
  ok(grant.ok, `consumer · the viewer was granted a role (${grant.status})`);

  // ── 3 · the consumer joins, and READS the published graph ────────────────
  viewer = standIn(CONSUMER);
  await viewer.open;
  await until("the consumer's snapshot", () => viewer.heard.snapshot);
  eq(viewer.heard.host?.role, "viewer", "consumer · the room says what it is");
  eq(viewer.heard.host?.can_write, false,
     "consumer · …and that it may not write, at the door, before it tries");

  const section = Object.values(viewer.heard.snapshot.graphs ?? {})[0];
  ok(section, "consumer · the snapshot is a CONTAINER, the room is a section");
  const units = (section.nodes ?? []).filter((n) => n.node_type === "US");
  eq(units.length, 2, "consumer · it read the graph it was served");
  ok((section.nodes ?? []).some((n) => n.data?.checksum === digest),
     "consumer · …including which bytes the study points at");

  // ── 4 · a change ARRIVES (subscribe on the existing channel) ─────────────
  const name = `US 1 · rinominata dal check ${stamp()}`;
  const [rename] = H.opsForLocalChange({
    op: "update_node", node_id: "us-1",
    fields: [{ field: "name", value: name, ts: stamp() }],
  });
  editor.sendOp(rename);
  const arrived = await until("the consumer to see the edit",
                              () => viewer.heard.ops.find((o) => o.node_id === "us-1"));
  eq(arrived.op, "update_field", "consumer · the change arrived as an operation");
  eq(arrived.value, name, "consumer · …carrying the value, not a notification");
  ok(arrived.author, `consumer · …stamped by the relay (${arrived.author})`);

  // ── 5 · and it may not write. Refused OUT LOUD, with the role ────────────
  viewer.send("op", op("add_node", { node: { id: "hacked", node_type: "US",
                                             name: "not from a viewer" } }));
  const denied = await until("the room to refuse the consumer's write",
                             () => viewer.heard.denied[0]);
  eq(denied.verb, "op", "consumer · the write was refused");
  eq(denied.can_write, false, "consumer · …because of the role, not politeness");
  ok(/read-only/.test(denied.reason), `consumer · …and said why (${denied.reason})`);
  ok(!(Object.values(editorHeard.snapshot.graphs ?? {})[0]?.nodes ?? [])
       .some((n) => n.id === "hacked"),
     "consumer · …and nothing entered the study");

  // ── 6 · the bytes, and the licence that travels with them ────────────────
  const served = await get(`/v1/rooms/${ROOM}/asset/${digest}`, CONSUMER);
  eq(served.status, 200, "consumer · it resolved the asset by sha256");
  eq(served.headers.get("x-em-license"), "CC-BY-4.0",
     "consumer · …and the licence travelled with the bytes");
  eq(served.body.length, bytes.length, "consumer · …the bytes themselves");

  let verdict = libraryVerdict(viewer.heard.snapshot, digest, "viewer");
  if (verdict) {
    eq(verdict.ok, true, "agreement · the library serves it too");
    eq(verdict.license, "CC-BY-4.0", "agreement · …with the same licence");
  }

  // ── 7 · an EMBARGO: refused with the date, by both readers ───────────────
  const until_date = "2099-01-01";
  editor.sendOp(op("add_node", { node: { id: "emb-1", node_type: "embargo",
                                         name: until_date,
                                         data: { embargo_end: until_date } } }));
  editor.sendOp(op("add_edge", { id: "e-emb", source: "res-1", target: "emb-1",
                                 edge_type: "has_embargo" }));
  await until("the embargo to land", () => editorHeard.results.length >= 9);

  // polled, not assumed: the gate reads the LIVE room, and the op it reads has
  // to have been applied first — a single request here would measure the race
  let refused = null;
  for (let tries = 0; tries < 40 && refused?.status !== 403; tries++) {
    refused = await get(`/v1/rooms/${ROOM}/asset/${digest}`, CONSUMER);
    if (refused.status !== 403) await new Promise((r) => setTimeout(r, 100));
  }
  eq(refused.status, 403, "consumer · the embargoed asset is refused");
  ok(refused.body.includes(until_date),
     `consumer · …WITH THE DATE (${refused.body.slice(0, 120)})`);

  // the same question, asked of the library, about the same document
  viewer.send("request_snapshot", {});
  const fresh = await until("the consumer's fresh snapshot", () => {
    const doc = viewer.heard.snapshot;
    const s = Object.values(doc?.graphs ?? {})[0];
    return (s?.nodes ?? []).some((n) => n.id === "emb-1") ? doc : null;
  });
  verdict = libraryVerdict(fresh, digest, "viewer");
  if (verdict) {
    eq(verdict.ok, false, "agreement · the library refuses it too");
    eq(verdict.reason, "embargo-active", "agreement · …for the same reason");
    eq(verdict.embargo, until_date, "agreement · …and names the same date");
    eq(verdict.license, "CC-BY-4.0",
       "agreement · …with the licence still exposed, for the day it opens");
  }
  // …and while it runs, the people working on the study still have it
  const owner = await get(`/v1/rooms/${ROOM}/asset/${digest}`, EDITOR);
  eq(owner.status, 200,
     "consumer · an embargo is a gate for readers, not a lock on the study");
  if (verdict) {
    const asEditor = libraryVerdict(fresh, digest, "editor");
    eq(asEditor.ok, true, "agreement · …and the library says that too");
  }

  // ── 8 · lifted, and both serve it again ─────────────────────────────────
  editor.sendOp(op("remove_node", { id: "emb-1" }));
  await until("the embargo to be lifted", () => editorHeard.results.length >= 10);
  const again = await get(`/v1/rooms/${ROOM}/asset/${digest}`, CONSUMER);
  eq(again.status, 200, "consumer · the embargo lifted, the file is served");

  viewer.send("request_snapshot", {});
  const lifted = await until("the lifted snapshot", () => {
    const doc = viewer.heard.snapshot;
    const s = Object.values(doc?.graphs ?? {})[0];
    const node = (s?.nodes ?? []).find((n) => n.id === "emb-1");
    return node?.data?.removed ? doc : null;
  });
  const after = libraryVerdict(lifted, digest, "viewer");
  if (after)
    eq(after.ok, true,
       "agreement · a lifted embargo is lifted for the library too — a removed "
       + "EmbargoNode is a tombstone, and a tombstone has stopped speaking");

  // ── the ephemeral channel, and the gap ─────────────────────────────────
  ok(viewer.heard.presence.length > 0,
     "consumer · presence reaches it on the existing ephemeral channel");
  const anyDescriptor = [viewer.heard.host, ...viewer.heard.presence]
    .some((frame) => JSON.stringify(frame ?? {}).includes("capabilities"));
  console.log(anyDescriptor
    ? "\nconsumer: a room frame now carries a descriptor — wire the registry to it"
    : "\nconsumer: DECLARED GAP — no room frame carries a connector descriptor, "
      + "so a consumer cannot announce itself to EMStudio through a room. The "
      + "smallest fix is one field on the presence member (StratiGraph Server), not a "
      + "new channel.");
} finally {
  try { viewer?.ws.close(); } catch { /* already gone */ }
  editor.disconnect();
  console.log(`consumer: room ${ROOM} ${await deleteRoom()}`);
}

console.log(`consumer: ${checks} checks passed`);
process.exit(0);
