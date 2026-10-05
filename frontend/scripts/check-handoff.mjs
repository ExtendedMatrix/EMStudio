// HANDOFF · the deep-link, read the way EMStudio reads it.
//
// The link is the ecosystem's contract (`stratigraph-server/app/handoff.py`) and
// its ONE security property is that it carries a place and never a permission.
// So the check is not only "do we parse it" but "would we ACCEPT a token in
// one" — a reader that tolerates a credential is a reader whose next caller
// sends one.
//
// The grammar is implemented twice on purpose (Python on the server, TypeScript
// here): a client that had to reach a server to find out WHICH server to reach
// could not start. Two implementations of one grammar drift unless something
// measures them against the same strings — this file holds those strings, and
// `stratigraph-server/tests/test_handoff.py` holds the same ones.

import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

let checks = 0;
const failures = [];
function ok(condition, what, detail = "") {
  checks += 1;
  if (condition) return true;
  failures.push(what + (detail ? ` — ${detail}` : ""));
  return false;
}

// esbuild, like the wire check next door: the module is real TypeScript and a
// hand-rolled type-stripper is a second parser to get wrong.
const load = async (entry) => {
  const built = await esbuild.build({ entryPoints: [join(SRC, entry)],
                                      bundle: true, format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64"));
};

const H = await load("handoff.ts");

console.log("\n1 · the scheme is the ecosystem's");
ok(H.SCHEME === "stratigraph", "the scheme is `stratigraph`", H.SCHEME);
ok(H.ACTION === "open", "the action is `open`", H.ACTION);

console.log("\n2 · both forms read back to the same place");
const scheme = "stratigraph://open?server=https%3A%2F%2Fem.example.org&room=saggio-b";
const web = "https://em.example.org/open?server=https%3A%2F%2Fem.example.org&room=saggio-b";
for (const [name, link] of [["scheme", scheme], ["web", web]]) {
  const got = H.parseHandoff(link);
  ok(got.kind === "room" && got.server === "https://em.example.org"
     && got.room === "saggio-b",
     `${name} form → a ROOM {server, room}`, JSON.stringify(got));
}
ok(H.parseHandoff("https://em.example.org/open?room=r").server
   === "https://em.example.org",
   "the web form may leave the server implicit: the page is ON it");

// ── 2b · THE OTHER ACTION on the same namespace: a STUDY ────────────────────
//
// The Catalog emits this, and until 4 September 2026 this reader refused every
// one of them — «the link names no room», into the app's console. The study
// button of the front door could not work BY CONSTRUCTION and failed in silence,
// which is the failure mode this whole contract exists to avoid.
console.log("\n2b · a STUDY is the second action, not a broken room");
{
  const link = "stratigraph://open?study=study%3Aabc&catalog=https%3A%2F%2Fem.example.org";
  const got = H.parseHandoff(link);
  ok(got.kind === "study", "a study link parses as a study", JSON.stringify(got));
  ok(got.study === "study:abc" && got.catalog === "https://em.example.org",
     "…with the study and the catalogue that can resolve it", JSON.stringify(got));
  // the web spelling, where the page is ON the catalogue
  const onSite = H.parseHandoff("https://em.example.org/open?study=study%3Aabc");
  ok(onSite.kind === "study" && onSite.catalog === "https://em.example.org",
     "the web form may leave the catalogue implicit: the page is ON it",
     JSON.stringify(onSite));
  // a study with no catalogue and no origin to borrow one from: REFUSED, and
  // the sentence says which half is missing rather than naming the other action
  let said = "";
  try { H.parseHandoff("stratigraph://open?study=study%3Aabc"); }
  catch (error) { said = String(error.message); }
  ok(said.includes("no catalogue"),
     "a study with nowhere to fetch it from is refused, naming that half", said);
  ok(!said.includes("no room"),
     "…and NOT by complaining about a room, which is the other action");
  // both halves at once is not one action
  let both = "";
  try {
    H.parseHandoff("stratigraph://open?study=s&room=r&server=https%3A%2F%2Fx");
  } catch (error) { both = String(error.message); }
  ok(both.includes("one action"), "a link naming both is refused", both);
  // and the credential rule is the SAME rule for both actions — a study link
  // must not become a way in through the back
  let leaked = "";
  try {
    H.parseHandoff("stratigraph://open?study=s&catalog=https%3A%2F%2Fx&token=t");
  } catch (error) { leaked = String(error.message); }
  ok(leaked.includes("token"),
     "a STUDY link carrying a token is refused too: one FORBIDDEN list, both "
     + "actions", leaked);
  // round trip
  const rebuilt = H.buildHandoff({ kind: "study", study: "study:abc",
                                   catalog: "https://em.example.org/" });
  const again = H.parseHandoff(rebuilt);
  ok(again.kind === "study" && again.study === "study:abc"
     && again.catalog === "https://em.example.org",
     "a built study link reads back identically", rebuilt);
}

console.log("\n3 · a link that carries a credential is REFUSED");
for (const key of ["token", "access_token", "id_token", "password", "secret",
                   "code", "authorization", "bearer", "api_key"]) {
  let refused = false;
  try {
    H.parseHandoff(`stratigraph://open?server=https%3A%2F%2Fx&room=r&${key}=v`);
  } catch (error) {
    refused = String(error.message).includes(key);
  }
  ok(refused, `a link carrying \`${key}\` is refused by name`);
}

console.log("\n4 · what is not a handoff is said");
for (const [bad, fragment] of [
  ["", "empty"],
  ["stratigraph://join?room=r", "unknown action"],
  ["mailto:someone@example.org", "not a handoff link"],
  ["https://em.example.org/rooms?room=r", "not a handoff link"],
  ["stratigraph://open?server=https%3A%2F%2Fx", "neither a room nor a study"],
]) {
  let said = "";
  try { H.parseHandoff(bad); } catch (error) { said = String(error.message); }
  ok(said.includes(fragment), `"${bad || "(empty)"}" → “${fragment}”`, said);
}

console.log("\n5 · round trip");
const built = H.buildHandoff({ kind: "room", server: "https://em.example.org/",
                               room: "a b/c" });
ok(built.startsWith("stratigraph://open?"), "built link uses the scheme", built);
const back = H.parseHandoff(built);
ok(back.server === "https://em.example.org" && back.room === "a b/c",
   "a built link reads back identically", JSON.stringify(back));
ok(!/token|secret|password/i.test(built), "nothing we build carries a credential");

console.log("\n6 · the URL form, and the one it must NOT be mistaken for");
ok(H.handoffFromLocation("?server=https%3A%2F%2Fx&room=r")?.room === "r",
   "handoff parameters on the page's own URL are read");
ok(H.handoffFromLocation("?join=abc&room=r") === null,
   "an INVITE link (`?join=`) is not a handoff: it carries a role, and joining "
   + "it is a different act");
ok(H.handoffFromLocation("?room=r") === null,
   "a room with no server is not a handoff");

console.log("\n6b · the bar keeps nothing from the round trip");
{
  const src = readFileSync(join(SRC, "handoff.ts"), "utf8");
  const at = src.indexOf("export function clearHandoffFromLocation");
  const body = src.slice(at, src.indexOf("\n}", at));
  for (const key of ["code", "state", "session_state", "iss"]) {
    ok(body.includes(`"${key}"`),
       `\`${key}\` is taken off the address bar on the way back from the IdP`);
  }
  ok(body.includes('"room"'),
     "…along with the handoff's own parameters, which is what it already did — "
     + "the same rule, applied to the whole problem instead of half of it");
}

console.log("\n7 · the app signs in ITSELF — the link cannot");
// ── E4 · `&node=`: the unit to land on (E.D., 4 October 2026) ─────────────
console.log("\n2c · a link may name the NODE to land on");
{
  const room = H.parseHandoff(scheme + "&node=6f1c-us10");
  ok(room.kind === "room" && room.node === "6f1c-us10",
     "a room link carries its node", JSON.stringify(room));
  ok(H.parseHandoff(web + "&node=6f1c-us10").node === "6f1c-us10",
     "…in the web form too");
  ok(!("node" in H.parseHandoff(scheme)), "no node → no node key (the old links unchanged)");
  ok(H.parseHandoff(scheme + "&node=").node === undefined, "an empty node is no node");
  const study = H.parseHandoff(
    "stratigraph://open?study=s1&catalog=https%3A%2F%2Fem.example.org&node=n7");
  ok(study.kind === "study" && study.node === "n7", "a study link carries its node too",
     JSON.stringify(study));
  const back = H.parseHandoff(H.buildHandoff({ kind: "room", server: "https://em.example.org",
                                               room: "saggio-b", node: "6f1c-us10" }));
  ok(back.node === "6f1c-us10" && back.room === "saggio-b", "build ↔ parse keep the node",
     JSON.stringify(back));
  let refused = false;
  try { H.parseHandoff(scheme + "&node=" + "x".repeat(201)); } catch { refused = true; }
  ok(refused, "a node longer than any id is refused, not carried");
  const loc = H.handoffFromLocation("?server=https%3A%2F%2Fem.example.org&room=r&node=n1");
  ok(loc && loc.node === "n1", "the web page's own query carries the node", JSON.stringify(loc));
}

const main = readFileSync(join(SRC, "main.ts"), "utf8");
ok(/pendingHandoffNode = handoff\.node/.test(main),
   "E4 · the node of the link is kept until its document is open");
ok(/loadContainerDocument\(doc, roomFileName\(room\)[\s\S]{0,200}landOnHandoffNode\(\)/.test(main),
   "…and landed on when the room's snapshot is loaded");
ok(/function landOnHandoffNode[\s\S]{0,1600}activateSlot\(slot\.id\);\s*select\(id\);[\s\S]{0,60}centerWhenDrawn\(id\)/.test(main),
   "…its graph made active, the node selected (Inspector) and centred once drawn");
ok(/if \(nodeId && nodeId !== handoffLanded\) handoffLanded = null/.test(main),
   "…and a room's re-sync puts it back, unless somebody picked another node");
ok(/function\s+joinFromHandoff/.test(main),
   "the join path exists and is fed by the link");
ok(/connectToHub\(handoff\.server, handoff\.room, token\)/.test(main),
   "HubOptions are filled from the LINK (server, room) plus the app's own token");
ok(/handoff\.kind === "study"/.test(main),
   "…and the OTHER action is followed too: a study link opens the container "
   + "rather than being refused for not being a room");
ok(/toast\(why\)/.test(main),
   "a link the parser refuses is said ON SCREEN, not only in the log — it was "
   + "`logWarn` alone, and a button that cannot work silently is what makes "
   + "people doubt their own machine");
ok(/authorizeUrl\(handoffAuth\)/.test(main),
   "…and the token comes from an OIDC round trip, not from the link");
const oidc = readFileSync(join(SRC, "oidc.ts"), "utf8");
ok(/code_challenge_method"?,\s*"S256"/.test(oidc),
   "PKCE S256 — `plain` would make the interception it prevents possible again");
ok(!/client_secret/.test(oidc.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")),
   "no client secret: a public client that sent one would be publishing it");
for (const sink of ["localStorage", "document.cookie", "indexedDB"]) {
  ok(!new RegExp(`${sink}\\.setItem|${sink}\\s*=`).test(oidc),
     `the token never reaches ${sink}`);
}

console.log(`\nhandoff: ${checks} checks passed`);
if (failures.length) {
  console.error(`\nhandoff: ${failures.length} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
