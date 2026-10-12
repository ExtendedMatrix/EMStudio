// TAVOLO 8 · the work done without network leaves when the network comes back.
//
//   node scripts/check-room-offline.mjs
//
// Measured on the table of 12 Oct 2026 (prova 8): EMStudio lost the network for
// nine seconds, three edits were made in the dark, and when the socket opened
// again it sent ONE frame — `request_snapshot` — and no operation. The snapshot
// replaced the copy and the three edits were gone, from the room and from the
// screen. The app had only the RE-SYNC road for unconfirmed work; a client that
// came back on a RESUME (the ordinary case) sent nothing.
//
// The twin of `check-room-live.mjs`, and like it this drives the REAL client:
// `SyncClient` (its own reconnect, its own backoff), the room URL of `hub.ts`,
// the envelope of `wire.ts`, and the decision the app asks after every snapshot
// of the room — `hub.toSendAfterSnapshot`. The socket is closed under the client
// (the network going away, not a «Leave»), an edit is made while it is down, and
// the room must have it once the client is back.
//
// Needs what check-room-live needs: the stack up, a token (`EM_TOKEN` or
// `dev-stack/token.sh`), the internal CA for the https base. Leaves behind one
// description in the room (`EM_ROOM`, default `basilica-demo`), named as a check.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as esbuild from "esbuild";

const BASE = process.env.EM_HUB_BASE ?? "https://em.localhost:8443/em";
const ROOM = process.env.EM_ROOM ?? "basilica-demo";
const CA = process.env.EM_CA ?? `${homedir()}/caddy-em-root.crt`;
const HERE = new URL(".", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;

if (BASE.startsWith("https://") && !process.env.NODE_EXTRA_CA_CERTS) {
  if (!existsSync(CA)) {
    console.log(`room-offline: no CA at ${CA} — the https base cannot be verified.`);
    console.log("      EM_HUB_BASE=http://localhost:8000 node scripts/check-room-offline.mjs");
    process.exit(0);
  }
  const { spawnSync } = await import("node:child_process");
  const self = new URL(import.meta.url).pathname;
  const again = spawnSync(process.execPath, [self], {
    stdio: "inherit",
    env: { ...process.env, NODE_EXTRA_CA_CERTS: CA },
  });
  process.exit(again.status ?? 1);
}

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
  console.log("room-offline: no token (EM_TOKEN unset and dev-stack/token.sh did not "
              + "answer) — is the stack up? checks SKIPPED");
  process.exit(0);
}

globalThis.window = globalThis;   // sync.ts schedules its reconnect on `window`
const load = async (entry) => import("data:text/javascript;base64," + Buffer.from(
  (await esbuild.build({ entryPoints: [`${SRC}${entry}`], bundle: true,
                         format: "esm", write: false })).outputFiles[0].text,
).toString("base64"));
const S = await load("sync.ts");
const H = await load("hub.ts");
const W = await load("wire.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

async function until(what, predicate, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function join() {
  const heard = { snapshots: [], results: [], status: [], opens: 0, reconnects: 0 };
  const client = new S.SyncClient();
  client.connectHub({ url: BASE, room: ROOM, token: TOKEN }, {
    onSelect: () => {},
    onOp: () => {},
    onSnapshot: (doc) => heard.snapshots.push(doc),
    onOpResult: (r) => heard.results.push(r),
    onReconnect: () => { heard.reconnects += 1; },
    onStatus: (state) => {
      heard.status.push(state);
      if (state === "open") heard.opens += 1;
    },
  });
  return { client, heard };
}

const unitOf = (doc, id) => Object.values(doc?.graphs ?? {})
  .flatMap((s) => s?.nodes ?? []).find((n) => n.id === id);

console.log(`room  : ${ROOM}\nbase  : ${BASE}\n`);

const A = join();
// what main.ts keeps: the unconfirmed ops, and the socket each one left on
const unconfirmed = new Map();
const sentOn = new Map();
const send = (op) => {
  const sent = A.client.sendCommand(W.envelope("op", op));
  if (sent) sentOn.set(H.opKey(op), A.heard.opens);
  return sent;
};

try {
  await until("A's first snapshot", () => A.heard.snapshots.length);
  const units = Object.values(A.heard.snapshots[0].graphs ?? {})
    .flatMap((s) => s?.nodes ?? []).filter((n) => n.node_type === "US");
  ok(units.length >= 1, `offline · the room's units arrived (${units.length})`);
  const target = units[units.length - 1].id;

  // ── the network goes away under the client (not a «Leave») ──────────────────
  A.client.ws.close();
  await until("A to notice the socket closed", () => !A.client.connected);
  ok(A.client.inRoom, "offline · without network the client is still IN the room");
  ok(A.client.room === ROOM, "offline · …the same room, which a reconnect resumes");

  // ── an edit in the dark ────────────────────────────────────────────────────
  const value = `${target} · scritta senza rete dal check ${new Date().toISOString()}`;
  const [op] = H.opsForLocalChange({
    op: "update_node", node_id: target,
    fields: [{ field: "description", value,
               ts: new Date().toISOString() }],
  });
  unconfirmed.set(H.opKey(op), op);
  ok(!send(op), "offline · with the socket down the op does not leave…");
  eq(H.toSendAfterSnapshot(unconfirmed.values(), sentOn, A.heard.opens).length, 1,
     "offline · …and it is still what the next socket must send");

  // ── the network comes back: the client's own backoff opens a new socket ────
  await until("A's reconnect", () => A.heard.opens >= 2 && A.heard.snapshots.length >= 2);
  ok(A.heard.reconnects >= 1, "offline · the client reconnected by itself");
  eq(A.heard.snapshots.length, 2,
     "offline · ONE snapshot per door: the relay's own, none asked on top of it");
  ok(unitOf(A.heard.snapshots[1], target)?.description !== value,
     "offline · the room's snapshot does not have the edit (it never left)");
  const due = H.toSendAfterSnapshot(unconfirmed.values(), sentOn, A.heard.opens);
  eq(due.length, 1, "offline · after the snapshot, the waiting edit is due on this socket");
  ok(due.every(send), "offline · …and it leaves");
  eq(H.toSendAfterSnapshot(unconfirmed.values(), sentOn, A.heard.opens).length, 0,
     "offline · …once: a second snapshot on the same socket would not send it again");

  const answer = await until("the room's answer to the waiting edit",
    () => A.heard.results.find((r) => r.op?.node_id === target && r.op?.value === value));
  ok(answer.applied, `offline · the room applied it (${answer.reason})`);
  eq(answer.op.ts, op.ts, "offline · …with the clock of the moment it was MADE");
  unconfirmed.delete(H.opKey(answer.op));
  eq(unconfirmed.size, 0, "offline · …and the answer confirms the waiting copy");

  const C = join();
  await until("C's snapshot", () => C.heard.snapshots.length);
  eq(unitOf(C.heard.snapshots[0], target)?.description, value,
     "offline · a client that joins afterwards finds the edit made in the dark");
  C.client.disconnect();
} finally {
  A.client.disconnect();
}
ok(!A.client.inRoom, "offline · «Leave» is the only door out of the room");

console.log(`room-offline: ${checks} checks passed`);
process.exit(0);
