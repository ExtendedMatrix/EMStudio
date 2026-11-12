// MEMBERS · executable check of src/members.ts — what is LEFT after the panel
// was retired, and a fence so it does not come back.
//
//   node scripts/check-members.mjs
//
// ## What this file used to check, and what happened to it
//
// It checked a PANEL: a viewer shown no controls, an owner's row with no role
// dropdown, an invite token rendered once, a role as a PUT and a revocation as a
// DELETE. Twenty-nine assertions about a surface that was retired on 8 September
// 2026 — `EM_design_condividi-e-firma.md`, Regola IV: «EMStudio, il chatbot e il
// catalogo ci portano un link, mai una copia del pannello».
//
// Those assertions are NOT deleted. They became the test of absence below, with
// the reason beside each one, so whoever puts the panel back has to read why it
// left before their diff goes green. Two measured reasons:
//
//   1. it showed HALF THE ACL. Teams can hold a role in a room since
//      7 September (`PUT /v1/rooms/{id}/groups/{gid}`) and this surface never
//      drew one. A panel that tells you it is showing half is still a panel
//      somebody decides an access on;
//   2. it minted a DIFFERENT invite link. `inviteUrl()` pointed at this build;
//      the node's panel takes the link from the door the node declares. Two
//      addresses for one door, and which one an invited person got depended on
//      where the inviter was standing. Not an incompleteness — an ambiguity.
//
// ## What is checked now
//
// The half that STAYS, because it is the other end of the same gesture: minting
// and managing were the copy, RECEIVING an invite lives here by construction —
// a link arrives at an app, and the app has to honour it. So: `POST /v1/join`
// with the identity attached, and the server's own sentence when it refuses.
//
// Plus the link that replaced the panel, and the fence.
//
// `fetch` is stubbed, so this runs with no node and no network.
import assert from "node:assert/strict";
import * as Sorg from "./sorgenti.mjs";
import * as esbuild from "esbuild";

const SRC = new URL("../src/", import.meta.url).pathname;

// NO DOM ANY MORE, and its absence is the measure: `members.ts` no longer
// builds an element. What is left reads `window.location` (`pendingJoin`) and
// calls `fetch` (`acceptInvite`) — so a location and a stub, and nothing that
// pretends to be a browser.
//
// (`linkedom`, `navigator.clipboard` and the `settle()` helper went with the
// panel: 40 lines of scaffolding for a surface that is not there.)
function setLocation(href) {
  const url = new URL(href);
  Object.defineProperty(globalThis, "location", {
    configurable: true, value: url,
  });
  globalThis.window = { location: url };
}
setLocation("https://emstudio.example/app/?x=1");

// ── the stub: every call recorded, every answer scripted ────────────────────
const calls = [];
let script = {};
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || "GET";
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  calls.push({ method, path, body: options.body ? JSON.parse(options.body) : null,
               auth: (options.headers || {}).Authorization });
  const key = `${method} ${path}`;
  const answer = script[key] ?? script[`${method} *`];
  if (!answer) return reply(404, { detail: `no stub for ${key}` });
  return typeof answer === "function" ? answer() : answer;
};

function reply(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload); },
  };
}

const bundle = await esbuild.build({
  entryPoints: [`${SRC}members.ts`], bundle: true, format: "esm", write: false,
  // `i18n.ts` reads a stored locale through `localStorage`; the DOM linkedom
  // builds has none, so the shim is the smallest thing that lets the real module
  // load rather than a mock of it.
  external: [],
});
globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};
const M = await import("data:text/javascript;base64,"
  + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const ACCESS = { base: "https://node.example/em", room: "cantiere", token: "T" };
const ANNA = "0000-0002-1825-0097";
const BRUNO = "0000-0001-5109-3700";

// ── 1 · THE HALF THAT STAYS · joining is a POST /v1/join, with an identity ──
//
// Unchanged from the day it was written, because this round is what stayed.
{
  calls.length = 0;
  script = { "POST /em/v1/join": reply(200, { room_id: "cantiere",
                                              title: "Cantiere", role: "editor",
                                              already_had: false }) };
  const joined = await M.acceptInvite("https://node.example/em", "tok.secret", "T");
  eq(calls.at(-1).path, "/em/v1/join", "join · one call, to the node's join");
  eq(calls.at(-1).auth, "Bearer T",
     "join · with the identity attached — the link is not a credential");
  eq(joined.role, "editor", "join · and the role comes back from the server");

  script = { "POST /em/v1/join":
    reply(401, { detail: "an invitation opens the door; you still have to say "
                         + "who you are" }) };
  let refusal = "";
  try {
    await M.acceptInvite("https://node.example/em", "tok.secret", null);
  } catch (error) {
    refusal = error.message;
  }
  ok(/who you are/.test(refusal),
     "join · without an identity the server's 401 sentence is what surfaces");
}

// ── 2 · THE LINK that replaced it, from every app and from the chip ──────────
//
// Design note `EM_design_condividi-e-firma.md`, Regola IV: «il pannello sta sul
// nodo che ospita la stanza… EMStudio, il chatbot e il catalogo ci portano un
// link, mai una copia del pannello». The ACL and the owner live on the node;
// a second panel here is a second thing to keep in step, and the one that goes
// stale is whichever nobody is looking at.
//
// AND THIS FILE'S SUBJECT *IS* THE COPY, which is why the checks live here: the
// panel `members.ts` draws predates the node's, and it reads people only.
{
  const { readFileSync } = await import("node:fs");
  const main = readFileSync(new URL("../src/main.ts", import.meta.url).pathname, "utf8");
  const members = readFileSync(new URL("../src/members.ts", import.meta.url).pathname, "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url).pathname, "utf8");

  ok(/id="btn-share-room"/.test(html), "there is a «Share this room…» entry");
  ok(/function shareThisRoom\(\): void/.test(main),
     "…and it is a function, not a panel");

  // The function's REAL body, from the parser (`sorgenti.mjs`) — not
  // `slice(indexOf("function …"), indexOf("\n}\n"))`, which ends at the first
  // line that happens to start with a brace and has the fence reading somebody
  // else's function from then on.
  const share = Sorg.dentro(main, "shareThisRoom");
  ok(share, "…and the parser finds it: a rename must fail here, not pass on \"\"");

  // A LINK, and nothing else: no fetch, no roster, no ACL read.
  ok(Sorg.chiama(share, "window.open"), "it opens the node's page");
  ok(!Sorg.chiama(share, "fetch") && !Sorg.chiama(share, "request") &&
     !Sorg.chiama(share, "renderMembersPanel"),
     "…and reads nothing itself: a copy of the panel would start here, with one "
     + "fetch that seemed harmless");
  // MICRO-BUSSARE-ALLA-CASA (12 Nov 2026): the room's page is in the node's
  // house, at `#room=<id>`, and where the house is the NODE declares
  // (`/v1/node` → `faces`). `who.roomPageUrl` composes it; the address it makes
  // is asserted in `check-cloud-files.mjs`.
  ok(Sorg.chiama(share, "who.roomPageUrl") && Sorg.chiama(share, "nodeFacesNow"),
     "…at the room's address in the node's house (`<house>#room=<id>`), the house "
     + "being the one the node declares — the stable per-room address the note asks "
     + "every app to bring a link to");
  ok(!Sorg.stringheLetterali(share).some((v) => v.includes("/work/")),
     "…and not through `/work/`: that was the node's old face, kept alive only by a "
     + "redirect that is to be removed");

  // NO FIELD FOR A SERVER ADDRESS — the note says drawing one means you got lost
  ok(Sorg.chiama(share, "getSettings") && /sync\.hubUrl/.test(share),
     "the server is the one this session is connected to");
  // Asked of the STRING LITERALS, so the comment that explains this very rule
  // does not break it. Constructed and run: an honest
  // `// deliberately NOT https://em.example.org` made the text version fail —
  // the fence's own warning, written down, tripping the fence.
  ok(Sorg.indirizziNelCodice(share).length === 0,
     "…and no address is written into the code: a URL spelled here is a URL that "
     + "goes wrong on the first node whose EMStudio lives somewhere else");

  // …AND THE ENTRY IS GOVERNED BY THE SAME FACT AS ITS SIBLING
  const reflectBody = Sorg.corpoDi(main, "reflectRoundTrip");
  ok(/const inRoom = /.test(reflectBody) &&
     /btn-share-room[\s\S]{0,80}!inRoom/.test(reflectBody),
     "one `inRoom` governs both menu entries — two of them would drift, and the "
     + "one that drifts offers to share a table that is not there");

  // …AND THE CHIP LEADS THERE TOO, which is why the click was repointed rather
  // than deleted: the roster chip is where somebody already looks to see who is
  // in the room, and taking the click away would have retired an affordance
  // people use in order to retire a panel.
  ok(/chip\.addEventListener\("click", \(\) => shareThisRoom\(\)\)/.test(main),
     "the roster chip opens the NODE's panel — one road, not two");
  ok(!/openMembersPanel\(\)/.test(main.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")),
     "…and the local one is not mounted from anywhere");

}

// ── 3 · THE FENCE · the panel does not come back without somebody reading why ─
//
// The twenty-nine assertions that used to check the panel are here, turned
// inside out. Each one names what it forbade and why the surface left: a diff
// that re-adds one of these goes red, and the message is the argument.
{
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/members.ts", import.meta.url).pathname,
                              "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

  // 1 · THE WRITES. Each was one call to the room's own endpoint with the verb
  // the server declares. They still are — on the node's panel, which also draws
  // the team grants this one never did.
  for (const [symbol, why] of [
    ["setRole", "granting a role"],
    ["revokeMember", "revoking one"],
    ["mintInvite", "minting an invitation"],
    ["revokeInvite", "revoking one"],
    ["fetchInvites", "listing them"],
    ["fetchRoster", "reading the roster"],
  ]) {
    ok(!new RegExp(`export (function|const) ${symbol}\\b`).test(code),
       `${symbol} · ${why} belongs to the node's panel (/em/home/#room=<id>), `
       + "which shows people AND teams. This file showed people only, so it was "
       + "retired — see the header. If you are bringing it back, the question to "
       + "answer first is what happens to the team grants.");
  }

  // 2 · THE PANEL ITSELF, and the types that existed only to draw it.
  for (const symbol of ["renderMembersPanel", "PanelHooks", "ASSIGNABLE",
                        "Roster", "MemberRow", "InviteRow"]) {
    ok(!new RegExp(`export (function|const|interface|type) ${symbol}\\b`).test(code),
       `${symbol} · the panel is on the NODE. Regola IV: every app brings a `
       + "link, never a copy — a copy is a second thing to keep in step, and the "
       + "one that goes stale is whichever nobody is looking at.");
  }
  ok(!/document\.createElement|innerHTML/.test(code),
     "and nothing here builds a DOM at all: this module is a client of two "
     + "endpoints now, not a surface");

  // 3 · THE SECOND INVITE LINK, which was the sharper of the two reasons.
  ok(!/export function inviteUrl/.test(code),
     "inviteUrl · it pointed at THIS build while the node's panel takes the "
     + "link from the door the node declares (`/v1/rooms/{id}/open`). Two "
     + "addresses for one door, and which one an invited person received "
     + "depended on where the inviter was standing. That is not an "
     + "incompleteness, it is an ambiguity — and the reason the retirement was "
     + "worth doing today rather than later.");
  ok(!/searchParams\.set\("join"/.test(code),
     "…and no second form of the invite link is coined here by another name");

  // 4 · WHAT MUST STAY, because a fence around everything would take the other
  // half with it: receiving is the other end of the same gesture.
  for (const symbol of ["pendingJoin", "acceptInvite", "canManage"]) {
    ok(new RegExp(`export function ${symbol}\\b`).test(code),
       `${symbol} · this half stays: a link arrives at an app, and the app has `
       + "to be able to honour it. Removing it would land an invitation in a "
       + "program that cannot redeem it — a worse defect than the one repaired.");
  }
  ok(/export interface RoomAccess/.test(code) && /async function call</.test(code),
     "…and `RoomAccess` with the private `call`, because `acceptInvite` is built "
     + "on them — measured, not assumed: they have no other caller");
}


console.log(`members: ${checks} checks passed`);
