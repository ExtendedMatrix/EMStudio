// ROOM · EMStudio as a real client of a real StratiGraph Server room, headless.
//
//   node scripts/check-room-live.mjs
//
// Walkthrough Tappa 4 is a manual test: two EMStudios, two Macs, one room. This
// is the part of it a machine can hold — and it holds the part that actually
// breaks. Two clients join, one edits, the other must see it; the roster must
// say two. Everything else in Tappa 4 (does the matrix redraw, does the other
// Mac reach this one over Bonjour) is a human's job.
//
// **It drives the REAL client.** Not a hand-written WebSocket that speaks what
// the protocol is supposed to be: `SyncClient` from `src/sync.ts`, which is what
// the application constructs, over `roomUrl` from `src/hub.ts` and the envelope
// from `src/wire.ts`. A proof written against a reimplementation would keep
// passing after the client stopped agreeing with it — which is the one failure a
// protocol test exists to catch.
//
// What it needs, and refuses to invent:
//
// * a stack that is up. The room is its OWN since 24 Oct (MICRO-SUITE-VERDE:
//   no check may need a room that already exists): the engine seats
//   `testdata/catena.em.json` in `room-live-claude-<time>` (`s3dgraphy
//   room-import`, as «Bring into a room…»), and the room is DELETED at the end,
//   also when a check fails. `EM_ROOM=<id>` runs it in a room that exists (a
//   demo room seeded by `dev-stack/seed_rooms.py`), which is then left as it was
//   found but for the rename;
// * a token — `EM_TOKEN`, or `dev-stack/token.sh` beside this checkout;
// * the internal CA, when the base is the https one: Node reads
//   `NODE_EXTRA_CA_CERTS` at startup, so this re-execs itself once with it set
//   rather than telling you to remember an environment variable.
//
// Not a smoke: nothing is left behind (with EM_ROOM, one renamed unit in that
// room, and the rename is the proof).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import * as esbuild from "esbuild";

const BASE = process.env.EM_HUB_BASE ?? "https://em.localhost:8443/em";
const OWN_ROOM = !process.env.EM_ROOM;
const ROOM = process.env.EM_ROOM ?? `room-live-claude-${Date.now().toString(36)}`;
// the engine seats the room through the node's direct port when the base is
// the https one (Python would need the internal CA); the same node behind it
const IMPORT_NODE = process.env.EM_IMPORT_NODE
  ?? (BASE.startsWith("https://") ? "http://localhost:8000" : BASE);
const CA = process.env.EM_CA ?? `${homedir()}/caddy-em-root.crt`;
const HERE = new URL(".", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;

// ── the internal CA, once ────────────────────────────────────────────────────
// Node builds its TLS trust store at startup, so setting this from inside the
// process is too late — hence the re-exec. Only for an https base: the direct
// port needs nothing, and a missing CA there is not a reason to refuse.
if (BASE.startsWith("https://") && !process.env.NODE_EXTRA_CA_CERTS) {
  if (!existsSync(CA)) {
    console.log(`room: no CA at ${CA} — the https base cannot be verified.`);
    console.log("      Take one with `docker cp em-dev-caddy:"
                + "/data/caddy/pki/authorities/local/root.crt ~/caddy-em-root.crt`,");
    console.log("      or run against the direct port:");
    console.log("      EM_HUB_BASE=http://localhost:8000 node "
                + "scripts/check-room-live.mjs");
    process.exit(0);
  }
  const { spawnSync } = await import("node:child_process");
  // Its OWN path, not `argv[1]`: re-running the invocation verbatim re-resolves
  // a relative path against the cwd, and the second process then looks for this
  // file somewhere else entirely.
  const self = new URL(import.meta.url).pathname;
  const again = spawnSync(process.execPath, [self], {
    stdio: "inherit",
    env: { ...process.env, NODE_EXTRA_CA_CERTS: CA },
  });
  process.exit(again.status ?? 1);
}

// ── the token ────────────────────────────────────────────────────────────────
function token() {
  if (process.env.EM_TOKEN) return process.env.EM_TOKEN;
  const helper = `${HERE}../../../stratigraph-server/dev-stack/token.sh`;
  if (!existsSync(helper)) return null;
  try {
    return execFileSync(helper, { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

const TOKEN = token();
if (!TOKEN) {
  console.log("room: no token (EM_TOKEN unset and dev-stack/token.sh did not "
              + "answer) — is the stack up? checks SKIPPED");
  process.exit(0);
}

// ── the room, made here (unless EM_ROOM names one) ──────────────────────────
const HTTP = BASE.replace(/\/+$/, "");
/** DELETE the room this check made: 409 while a socket of ours is still open,
 *  so it asks again for a few seconds. */
async function deleteRoom() {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${HTTP}/v1/rooms/${encodeURIComponent(ROOM)}`, {
      method: "DELETE", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ confirm: ROOM }) }).catch((e) => ({ status: 0, text: async () => String(e) }));
    if (r.status === 200 || r.status === 404) return r.status === 200 ? "deleted" : "not there";
    if (r.status !== 409) return `NOT deleted (${r.status} ${(await r.text()).slice(0, 120)})`;
    await new Promise((res) => setTimeout(res, 500));
  }
  return "NOT deleted (somebody still connected after 10 s)";
}
if (OWN_ROOM) {
  const S3D = process.env.S3DGRAPHY_DIR ?? `${HERE}../../../s3Dgraphy/`;
  const work = `${process.env.TMPDIR ?? "/tmp/"}room-live/${ROOM}`;
  mkdirSync(work, { recursive: true });
  let seated = null;
  try {
    seated = JSON.parse(execFileSync(`${S3D}.venv/bin/python`, ["-m", "s3dgraphy", "room-import",
      `${HERE}../testdata/catena.em.json`, "--node", IMPORT_NODE, "--room", ROOM, "--title", `Room live ${ROOM}`,
      "--token", TOKEN, "--journal", `${work}/journal.json`, "--report-dir", work, "--work-dir", `${work}/packs`, "--json"],
      { env: { ...process.env, PYTHONPATH: `${S3D}src` }, encoding: "utf-8", maxBuffer: 1 << 26 }));
  } catch (err) {
    console.log(`room: the engine could not seat ${ROOM}: ${String(err.message ?? err).split("\n")[0]}`);
  }
  if (!seated?.room_state?.created || !(seated?.seeded?.applied > 0)) {
    console.log(`room: ${ROOM} not seated — ${await deleteRoom()}`);
    process.exit(1);
  }
}

// ── the real client, loaded the way check-narrative loads modules ────────────
globalThis.window = globalThis;   // sync.ts schedules its reconnect on `window`
const bundle = await esbuild.build({
  entryPoints: [`${SRC}sync.ts`], bundle: true, format: "esm", write: false,
});
const S = await import("data:text/javascript;base64,"
  + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const H = await import("data:text/javascript;base64," + Buffer.from(
  (await esbuild.build({ entryPoints: [`${SRC}hub.ts`], bundle: true,
                         format: "esm", write: false })).outputFiles[0].text,
).toString("base64"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

/** Wait for something to become true, or say what never happened. */
async function until(what, predicate, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** One joined client, with everything it heard. */
function join(label) {
  const heard = { snapshot: null, presence: [], ops: [], results: [],
                  status: [], mismatch: [] };
  const client = new S.SyncClient();
  client.connectHub({ url: BASE, room: ROOM, token: TOKEN }, {
    onSelect: () => {},
    onOp: (op) => heard.ops.push(op),
    onSnapshot: (doc) => { heard.snapshot = doc; },
    // main.ts folds the FRAME, not the payload (`reducePresence` switches on
    // `type`): the same adaptation here, so what is measured is what the app does
    onPresence: (message) => heard.presence.push({ type: "presence", ...message }),
    // …and the host_info frame is folded too, because it is the ONLY one that
    // says which member of the roster this client is (`presence.me`). Without it
    // the check could count people but not recognise its own — which is exactly
    // what made it fragile (see `rosterOf` below).
    onHostInfo: (info) => heard.presence.push({ type: "host_info", ...info }),
    onOpResult: (r) => heard.results.push(r),
    onWireMismatch: (why) => heard.mismatch.push(why),
    onStatus: (state) => heard.status.push(state),
  });
  return { label, client, heard };
}

/** What one client believes about who is in the room, folded the app's way. */
function rosterOf(client) {
  return client.heard.presence.reduce(
    (state, frame) => H.reducePresence(state, frame), H.emptyPresence());
}

// ── the URL the client builds, before anything is opened ─────────────────────
const url = H.roomUrl(BASE, ROOM, { token: "T0KEN" });
ok(url.startsWith(BASE.startsWith("https") ? "wss://" : "ws://"),
   `room · the base becomes a WebSocket scheme (${url.split("/")[0]}//)`);
ok(url.includes(`/v1/rooms/${ROOM}/ws`), "room · …with the room's own endpoint");
ok(url.includes("token=T0KEN"),
   "room · …and the token in the QUERY, where a browser can put it");

console.log(`room  : ${ROOM}\nbase  : ${BASE}\n`);

const A = join("A");
const B = join("B");

try {
  // ── the join: three frames, and the seeded graph ───────────────────────────
  await until("A's snapshot", () => A.heard.snapshot);
  await until("B's snapshot", () => B.heard.snapshot);
  eq(A.heard.mismatch, [], "room · A read every frame (no wire mismatch)");

  const section = A.heard.snapshot.graphs?.[ROOM]
    ?? Object.values(A.heard.snapshot.graphs ?? {})[0];
  ok(section, "room · the snapshot is a CONTAINER, and the room is a section of it");
  const units = (section.nodes ?? []).filter((n) => n.node_type === "US");
  ok(units.length >= 2,
     `room · the seeded stratigraphy arrived (${units.length} units)`);

  // ── presence: MY two clients are in there, and each knows which one it is ──
  //
  // It used to assert `members.length === 2`, which made the check fail for a
  // reason that has nothing to do with the relay: an EMStudio TAB open on the
  // same room is a third member, and the wait timed out with "a roster of two".
  // Measured in a session, and the wrong conclusion was one step away — the
  // protocol was fine, the assertion was counting strangers.
  //
  // A room is a shared place: how many people are in it is not this check's
  // business. What IS its business is that the two clients it opened are both
  // there, each recognising itself — which is a stronger statement than a count,
  // and true whoever else is connected.
  const roster = await until("a roster holding BOTH of my clients", () => {
    const a = rosterOf(A);
    const b = rosterOf(B);
    if (!a.me || !b.me) return null;          // neither has heard host_info yet
    const present = new Set(a.members.map((m) => m.id));
    return present.has(a.me) && present.has(b.me) ? { a, b } : null;
  });
  const mine = [roster.a.me, roster.b.me];
  ok(mine.every((id) => roster.a.members.some((m) => m.id === id)),
     `room · presence holds BOTH clients this check opened (${mine.length} of mine, `
     + `${roster.a.members.length} in the room)`);
  ok(roster.a.me !== roster.b.me,
     "room · …and they are two connections, not one counted twice");
  ok(roster.a.members.filter((m) => mine.includes(m.id)).every((m) => m.author),
     "room · …each of them is somebody: the author is the token's");

  // ── the edit: A renames a unit, B must see it ─────────────────────────────
  const target = units[0].id;
  // Named so that somebody who opens the room later can tell what did it: the
  // rename is left behind (it is the proof the room KEPT it), so it should read
  // as a measurement rather than as somebody's abandoned edit.
  // Built from the node's ID and not from its CURRENT name: appending to what
  // is already there compounds on every run, and the room ends up holding a
  // sentence made of three of these. Measured, on the second run.
  const name = `${target} · rinominata dal check ${new Date().toISOString()}`;
  const [op] = H.opsForLocalChange({
    op: "update_node", node_id: target,
    fields: [{ field: "name", value: name, ts: new Date().toISOString() }],
  });
  ok(op?.op === "update_field",
     "room · the app's own translation makes an update_field op");
  A.client.sendOp(op);

  const arrived = await until("B to see A's edit",
                              () => B.heard.ops.find((o) => o.node_id === target));
  eq(arrived.op, "update_field", "room · B received the operation A sent");
  eq(arrived.field, "name", "room · …the field A actually changed");
  eq(arrived.value, name, "room · …carrying the value, not a notification");
  ok(arrived.author,
     `room · …stamped with the sender's identity by the relay (${arrived.author})`);
  ok(arrived.ts, "room · …and dated, which is what the merge decides on");

  const applied = await until("A's own op_result",
                              () => A.heard.results.find((r) => r.applied));
  ok(applied.applied === true, "room · the hub told A it was applied");
  eq(B.heard.results, [], "room · …and told B nothing: an op_result is the "
     + "answer to YOUR op, not a broadcast");

  // ── and it is the ROOM's now, not one client's ─────────────────────────────
  // A third join sees the edit without anybody replaying it: the proof that the
  // room holds state rather than relaying keystrokes.
  const C = join("C");
  await until("C's snapshot", () => C.heard.snapshot);
  const seenByC = Object.values(C.heard.snapshot.graphs ?? {})[0]
    ?.nodes?.find((n) => n.id === target);
  eq(seenByC?.name, name,
     "room · a client that joins AFTERWARDS gets the edit in its snapshot");
  C.client.disconnect();
} finally {
  A.client.disconnect();
  B.client.disconnect();
  if (OWN_ROOM) console.log(`room: ${ROOM} ${await deleteRoom()}`);
}

console.log(`room: ${checks} checks passed`);
process.exit(0);
