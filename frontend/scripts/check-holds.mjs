// MICRO-BLEND-OFFICINA-2 (D7, D8) · the leases of the .blend files in a room,
// EMStudio's client side: `hold` frames out (take / renew / release, `force`
// for the room's owner), `holds` and `hold_refused` in — against an IN-TEST
// FAKE RELAY that keeps the contract fork C gives stratigraph-server (the
// running dev node predates it): one lease per key, 15 min since `renewed`,
// the whole list to everybody after each change, a refusal with the holder.
// Two SyncClients sit in the same fake room. The labels are blend-room.ts'.
//
//   node scripts/check-holds.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (f) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${f}`], bundle: true, format: "esm", write: false, platform: "browser" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const S = await load("sync.ts");
const R = await load("blend-room.ts");

let checks = 0;
const ok = (c, what) => { checks++; assert.ok(c, what); };

// ── the fake relay ──────────────────────────────────────────────────────────
let clock = 1_000_000;
const sockets = [];
const holds = new Map();
const who = new Map();     // socket → {person, display}
const send = (ws, type, payload) => ws.onmessage?.({ data: JSON.stringify({ v: 2, type, payload, source: "em-server" }) });
const alive = (h) => clock - h.renewed <= 900;
const list = () => [...holds.values()].filter(alive);
const broadcast = () => { for (const ws of sockets) send(ws, "holds", { holds: list(), ttl_seconds: 900 }); };
class FakeWS {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    sockets.push(this);
    const n = sockets.length;
    who.set(this, n === 1 ? { person: "orcid:ED", display: "Emanuel", role: "owner" } : { person: "orcid:EL", display: "Elisa", role: "editor" });
    setTimeout(() => {
      this.readyState = 1; this.onopen?.();
      send(this, "host_info", { tool: "em-server", room: "r", holds: true, author: who.get(this).person, role: who.get(this).role });
      send(this, "holds", { holds: list(), ttl_seconds: 900 });
    }, 0);
  }
  send(text) {
    const m = JSON.parse(text);
    if (m.type !== "hold") return;
    const p = m.payload, me = who.get(this), cur = holds.get(p.key);
    const live = cur && alive(cur) ? cur : null;
    if (p.action === "take") {
      if (live && live.person !== me.person) return send(this, "hold_refused", { key: p.key, action: "take", reason: "held", holder: live });
      holds.set(p.key, { key: p.key, person: me.person, display: me.display, host: p.host, client: p.client,
                         since: live?.since ?? clock, renewed: clock, connection_id: String(sockets.indexOf(this)) });
    } else if (p.action === "renew") {
      if (!live || live.person !== me.person) return send(this, "hold_refused", { key: p.key, action: "renew", reason: "not yours", holder: live });
      live.renewed = clock;
    } else if (p.action === "release") {
      if (live && live.person !== me.person && !(p.force && me.role === "owner"))
        return send(this, "hold_refused", { key: p.key, action: "release", reason: "not yours", holder: live });
      holds.delete(p.key);
    }
    broadcast();
  }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
}
globalThis.WebSocket = FakeWS;
FakeWS.OPEN = 1;

const tick = () => new Promise((r) => setTimeout(r, 5));
const mk = () => {
  const st = { holds: [], refused: [], host: {} };
  const c = new S.SyncClient();
  c.connectHub({ url: "https://node.example", room: "r", token: null, since: null }, {
    onStatus: () => {}, onSelect: () => {}, onOp: () => {}, onSnapshot: () => {},
    onHostInfo: (h) => { st.host = { ...st.host, ...h }; },
    onHolds: (m) => { st.holds = m.holds; },
    onHoldRefused: (m) => { st.refused.push(m); },
  });
  return { c, st };
};
const A = mk(), B = mk();
await tick();
ok(A.st.host.holds === true && B.st.host.holds === true, "the room says it keeps leases (host_info.holds)");
const key = R.fileKey("/p/T/SB/GreatTemple_2026_v2.blend", "/p/T");
ok(A.c.sendHold("take", key, "mac-ed"), "A takes the lease of the .blend");
await tick();
ok(B.st.holds.length === 1 && B.st.holds[0].person === "orcid:ED", "B sees it in the list");
const label = R.leaseLabel(B.st.holds[0], "it", () => "10:05");
ok(label === "aperto da Emanuel su mac-ed dalle 10:05", `the label B shows: ${label}`);
ok(R.mayWrite(R.leaseFor(B.st.holds, key, clock), "orcid:EL", "pc-lab", clock) === "readonly", "for B: read only");
ok(R.mayWrite(R.leaseFor(A.st.holds, key, clock), "orcid:ED", "mac-ed", clock) === "mine", "for A: mine");
B.c.sendHold("take", key, "pc-lab");
await tick();
ok(B.st.refused.length === 1 && B.st.refused[0].holder.person === "orcid:ED", "B's take is refused, with the holder");
clock += 600; A.c.sendHold("renew", key, "mac-ed"); await tick();
clock += 600;
ok(R.leaseFor(B.st.holds, key, clock) !== null, "renewed at 10 min: still alive at 20 min");
clock += 400;
ok(R.leaseFor(B.st.holds, key, clock) === null, "15 min without a sign: lapsed");
ok(R.mayWrite(B.st.holds[0], "orcid:EL", "", clock) === "free", "…and free for B");
B.c.sendHold("take", key, "pc-lab"); await tick();
ok(A.st.holds.length === 1 && A.st.holds[0].person === "orcid:EL", "B takes it after it lapsed");
ok(R.mayRelease(A.st.holds[0], "orcid:ED", "owner") && !R.mayRelease(A.st.holds[0], "orcid:XX", "editor"), "who may release");
A.c.sendHold("release", key, "mac-ed", true); await tick();
ok(B.st.holds.length === 0, "the owner releases it by hand (force, after the confirmation)");
B.c.sendHold("take", key, "pc-lab"); await tick();
A.c.sendHold("release", key, "mac-ed"); await tick();
ok(A.st.refused.some((m) => m.action === "release"), "without force not even the owner releases another's lease");
A.c.disconnect(); B.c.disconnect();
ok(!A.c.sendHold("take", key, "x"), "out of the room nothing is sent");
console.log(`check-holds: ${checks} checks ✓`);
