// STUDY LINK · what «open this study in EMStudio» resolves to, and the two
// silences that made a failure look like a success.
//
//   node scripts/check-studylink.mjs
//
// Two bugs are pinned here, one of each kind, and both were found by measuring
// rather than by reading:
//
//  1. **AMBIGUITY WAS PREFERRED, NOT REFUSED** (5 September 2026). `?emjson=`
//     won over `?study=` in silence, so a link whose two halves named different
//     studies loaded one of them and labelled it with the other — the status bar
//     said «Villa di Aiano» over a page opened as Porta Marina, the address bar
//     was cleaned because the success branch had run, and there was no toast and
//     no log line. The URL that produces it is the ordinary one: you edit
//     `study=` and leave `emjson=` where it was.
//
//     `handoff.ts` had the right rule three hours earlier in the same tree — a
//     link naming both a room and a study is refused — and it was not carried
//     across. So this file measures BOTH readers against the same principle.
//
//  2. **THE ORDER WAS A COINCIDENCE.** The study link won over the restored
//     workspace only because its `fetch` happened to resolve after
//     `applyWorkspace`. A link is an explicit request and a restore is a habit,
//     so the link must win — and that has to be written down, which is what the
//     boot assertions at the end are about.
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as Sorg from "./sorgenti.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

let checks = 0;
const failures = [];
const ok = (condition, what, detail = "") => {
  checks += 1;
  if (condition) return true;
  failures.push(what + (detail ? ` — ${detail}` : ""));
  return false;
};

const load = async (entry) => {
  const built = await esbuild.build({ entryPoints: [join(SRC, entry)],
                                      bundle: true, format: "esm", write: false });
  return import("data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64"));
};

const S = await load("studylink.ts");
const A = "study%3A275dc72c-3c30-4ffe-92b3-401c23c6d949";   // Villa di Aiano
const B = "study%3A44c0be86-ab93-476c-a227-7a04a5bce017";   // Porta Marina
const urlOf = (id) => `/catalog/study/${id}/emjson`;

console.log("\n1 · the two forms the Catalog documents");
ok(S.readStudyLink(`?emjson=${encodeURIComponent(urlOf(A))}`)?.url === urlOf(A),
   "`?emjson=` is the container, taken as given");
{
  // the id is percent-encoded into the path — `study:abc` → `study%3Aabc`. Legal
  // either way and the Catalog decodes it (measured: `/em/read/?study=…` opens
  // through this very branch), and encoding is what keeps an id containing a
  // slash from inventing a path segment.
  const link = S.readStudyLink(`?study=${A}&catalog=https%3A%2F%2Fem.example.org`);
  ok(link?.url === `https://em.example.org/catalog/study/${A}/emjson`,
     "`?study=&catalog=` resolves against the catalogue", link?.url);
  ok(link?.study === decodeURIComponent(A), "…and the id travels for the title");
}
ok(S.readStudyLink(`?study=${A}`)?.url === `/catalog/study/${A}/emjson`,
   "…with no catalogue named, against THIS origin — which is the arrangement "
   + "`/em/studio/` exists to create");
ok(S.readStudyLink("?nothing=here") === null,
   "a URL that names no study is not a study link");

console.log("\n2 · a RELATIVE emjson is the good case, not a bug to fix");
ok(S.readStudyLink(`?emjson=${encodeURIComponent(urlOf(A))}`)?.url.startsWith("/"),
   "a root-relative container URL is passed through untouched: the fetch "
   + "resolves it against `location`, and turning it absolute is exactly the "
   + "mixed-content bug the Catalog already measured in Chrome");

console.log("\n3 · A LINK NAMING TWO STUDIES IS REFUSED — the 5 September bug");
{
  // study says B, emjson points at A: the URL you get by editing only `study=`
  let said = "";
  try {
    S.readStudyLink(`?study=${B}&emjson=${encodeURIComponent(urlOf(A))}`);
  } catch (error) { said = String(error.message); }
  ok(said.includes("two different studies"),
     "the refusal happens at all — it used to load A under B's name", said);
  ok(said.includes(decodeURIComponent(A)) && said.includes(decodeURIComponent(B)),
     "…and the sentence names BOTH, because the reader cannot tell which half "
     + "is the mistake", said);
  ok(/drop the .?emjson|drop `emjson/i.test(said),
     "…and says what to do about it", said);
}
{
  // the halves AGREEING is the normal case and must still work
  const link = S.readStudyLink(
    `?study=${A}&emjson=${encodeURIComponent(urlOf(A))}`);
  ok(link?.url === urlOf(A),
     "…while a link whose halves agree is opened, not interrogated");
}
{
  // an `?emjson=` that is not a catalogue URL cannot be compared, and must NOT
  // be refused: an object-store link, a presigned URL and a file on a share are
  // all legitimate and none of them mentions a study id
  const link = S.readStudyLink(
    `?study=${A}&emjson=${encodeURIComponent("https://store.example.org/x.json?sig=abc")}`);
  ok(link?.url === "https://store.example.org/x.json?sig=abc",
     "…and an emjson that names no study is taken as given: the check reports a "
     + "disagreement it can SEE, never one it has guessed");
}
ok(S.studyIdInContainerUrl(urlOf(A)) === decodeURIComponent(A),
   "the id is read out of the Catalog's own shape");
ok(S.studyIdInContainerUrl("https://store.example.org/x.json") === null,
   "…and out of nothing else");

console.log("\n4 · a token is USED and never kept");
{
  const link = S.readStudyLink(`?study=${A}&token=abc`);
  ok(link?.token === "abc", "the token is read for the fetch");
  ok(S.clearStudyLinkFromLocation.toString().includes("token"),
     "…and the cleaner takes it off the address bar: a credential in a URL "
     + "outlives the tab it was useful in");
  for (const key of ["emjson", "study", "catalog", "narrative"]) {
    ok(S.clearStudyLinkFromLocation.toString().includes(key),
       `…along with \`${key}\`, so a reload does not re-open over the work since`);
  }
}

console.log("\n5 · THE ORDER IS DECLARED, not won by a race");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  // the ordered sequence lives in ONE function, because each step can rewrite
  // the address bar that the next one reads
  const at = main.indexOf("async function bootSession()");
  ok(at > 0, "`bootSession` is where the order is written down");
  const body = main.slice(at, main.indexOf("\n}", at));
  const land = body.indexOf("await followHandoff()");
  const read = body.indexOf("readStudyLinkOrSay()");
  const open = body.indexOf("await openStudyFromLink(pendingStudy)");
  ok(land >= 0 && read > 0 && open > 0,
     "the three steps are all in it", `${land} ${read} ${open}`);
  ok(land < read,
     "the sign-in is AWAITED FIRST: the realm's return replaces the query "
     + "string, so at that moment the URL says `code` and not `?study=`. "
     + "Reading the link before the address has been restored is how the study "
     + "was lost after signing in — measured in Chrome on 5 September.");
  ok(read < open,
     "…then READ, then OPEN — over the arrangement the synchronous boot has "
     + "already restored. A link is an explicit request and a restore is a "
     + "habit, so the link wins by being last.");
  const bootAt = main.indexOf("void bootSession()");
  // 15 set 2026 · the restore used to be `applyWorkspace(activeWorkspace())` —
  // "mount the editor of the workspace's active window". There is no editor to
  // mount: every window of the arrangement is built in its own area, so
  // `renderTiles()` IS the restore, and it is the boot line that has to come
  // first. The clause is the same sentence about the same order.
  const restore = main.indexOf(
    "renderTiles(); // WIN5 · lay out the arrangement this session was left in");
  ok(restore > 0 && bootAt > restore,
     "…and the whole sequence is started AFTER the arrangement is put back");
  ok(/function readStudyLinkOrSay/.test(main),
     "a refused link is caught where there is a canvas to say it on");
  ok(/studyFailed\(t\("study\.ambiguous"\)/.test(main),
     "…and it IS said, through the same three-sentence path as any other failure");
  // and the failure reaches the canvas, not only the status bar
  ok(/drop-hint/.test(main.slice(main.indexOf("function studyFailed"),
                                 main.indexOf("function studyFailed") + 1400)),
     "`studyFailed` writes into the empty canvas too: the status bar is a line "
     + "at the bottom right and a toast is gone in four seconds");
  ok(/emtree\.slots\.length/.test(main.slice(main.indexOf("function studyFailed"),
                                            main.indexOf("function studyFailed") + 1400)),
     "…but only when the canvas is EMPTY — painting a failure across a graph "
     + "somebody is working on is the wrong kind of loud");
}

console.log("\n6 · THE RING IS BROKEN — the link survives the login");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  const oidc = readFileSync(join(SRC, "oidc.ts"), "utf8");
  // the round trip carries the address it started from
  ok(/returnTo: window\.location\.href/.test(main),
     "the sign-in remembers the page it was started from, with whatever was on "
     + "its address — the realm's return replaces the query, so this is the only "
     + "thing that can bring `?study=` back");
  ok(/returnTo\?: string/.test(oidc) && /interface PendingSignIn/.test(oidc),
     "…kept beside the PKCE verifier, one entry and one lifetime");
  ok(!/searchParams\.set\("state", .*returnTo/.test(oidc),
     "…and NOT inside the `state` parameter: that travels through the IdP and "
     + "into its logs, and the address may legitimately carry `?token=`");
  ok(/restoreAfterSignIn\(remembered\.returnTo \?\? result\.returnTo\)/.test(main),
     "the address is put back BEFORE anything reads the link");
  // …on every exit, success or not
  ok(/const where = \{ returnTo: saved\?\.returnTo/.test(oidc),
     "…on every exit of `completeSignIn`: a failure that also loses the page is "
     + "two failures");

  // ONE silent attempt, and the marker survives the redirect it guards
  ok(/silentSignInTried\(link\.url\)/.test(main)
     && /await trySilentSignIn\(link\.url\)/.test(main),
     "a 401 tries the node's session ONCE before asking");
  ok(/searchParams\.set\("prompt", "none"\)/.test(oidc),
     "…with `prompt=none`, which shows nothing when there is a session");
  ok(/sessionStorage\.setItem\(`emstudio\.silenttry:/.test(main),
     "…and the marker is in sessionStorage, because it has to survive the very "
     + "redirect it guards against — a flag in memory would loop for ever");
  // …and the sign-in has to CHANGE something, or it was a sign-in for nothing
  // (MICRO accesso, 5 Oct 2026: the session's token goes by `nodeAuthFetch`, the
  // one road to the node, which writes the bearer and renews it)
  ok(/link\.token\s*\?[\s\S]{0,160}:\s*await nodeAuthFetch\(link\.url\)/.test(main),
     "the study fetch sends the SESSION's token when the link carries none. "
     + "Without it the silent attempt worked, the chip firmed up to «confirmed» "
     + "and the study still said «is not published» — measured, and it made "
     + "everything else look broken");
  ok(/if \(wasSilent\)/.test(main),
     "a silent attempt that finds no session is NOT reported as a failure: "
     + "`login_required` is the expected answer, and shouting about it would be "
     + "an error message for something that went exactly as designed");
  ok(/return true;\s*\/\/ no session/.test(main)
     || /logInfo\(`identity: no session on this node yet/.test(main),
     "…it is logged, not toasted");
}

console.log("\n6c · A MARKER BELONGS TO THE IDENTITY THAT FAILED");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  ok(/function forgetSilentSignInAttempts/.test(main),
     "there is one place that drops the silent-attempt markers");
  // …and it is called when a sign-in SUCCEEDS, before the identity is used
  const at = main.indexOf("async function completeNodeSignIn");
  const body = main.slice(at, main.indexOf("\n}\n", at));
  ok(/forgetSilentSignInAttempts\(\)/.test(body),
     "…and a successful sign-in calls it. WITHOUT this the human sequence fails "
     + "on the half everybody does: open the study → refused, no session → sign "
     + "in → reopen in the same tab → refused AGAIN, without even trying. "
     + "Measured in Chrome with a live session: markers 1, chip still ◌.");
  const tokenAt = body.indexOf("hubToken = result.token");
  const forgetAt = body.indexOf("forgetSilentSignInAttempts()");
  ok(tokenAt > 0 && forgetAt > tokenAt,
     "…after the token is in hand, so a failed exchange does not clear a marker "
     + "it has not earned the right to clear");
  ok(/startsWith\("emstudio\.silenttry:"\)/.test(main),
     "the markers are ENUMERATED, not tracked in a second list that would drift");
}

console.log("\n6d · ONE return path for both rounds");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  ok(/interface PendingNodeSignIn/.test(main),
     "what a sign-in needs on the way back is one shape");
  // written by the ONE place both rounds go through…
  const at = main.indexOf("async function signIntoNode");
  const body = main.slice(at, main.indexOf("\n}\n", at));
  ok(/returnTo: window\.location\.href/.test(body)
     && /sessionStorage\.setItem\(SIGNIN_KEY/.test(body),
     "…written by `signIntoNode`, which is where BOTH rounds pass — silent and "
     + "interactive are two ways of asking the same question");
  // …and read back with OUR copy preferred over the PKCE record's
  ok(/restoreAfterSignIn\(remembered\.returnTo \?\? result\.returnTo\)/.test(main),
     "…and preferred on the way back. The record in `oidc.ts` is deleted on read "
     + "and read once, so a return that arrives without it reached "
     + "`restoreAfterSignIn(undefined)` — and a bare `/em/studio/` is all that is "
     + "left, because the realm's return REPLACED the query. Chip full, bar "
     + "clean, study gone.");
  ok(/const wasSilent = remembered\.silent \|\| result\.silent/.test(main),
     "…including whether the round was silent, so a `login_required` is never "
     + "shouted about even if the record is missing");
  // still NOT in `state`
  const oidc = readFileSync(join(SRC, "oidc.ts"), "utf8");
  ok(!/searchParams\.set\("state", .*returnTo/.test(oidc),
     "and still not inside `state`: that travels through the IdP and into its "
     + "logs, and a study link may carry a `?token=`");
}

console.log("\n6e · THE MIDDLE RUNG HAS TO BE EARNED");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  const identity = readFileSync(join(SRC, "identity.ts"), "utf8");

  // the comparison lives in `identity.ts`, because it is a question about two
  // identities and not about a piece of chrome — and `check-identity.mjs` puts
  // real values to it there, including the two that disagreed on E.D.'s screen
  ok(/export function sameSignature/.test(identity),
     "there is one question, and it lives with the identities: did the node "
     + "confirm THE SAME signature?");
  const at = identity.indexOf("export function sameSignature");
  const body = identity.slice(at, identity.indexOf("\n}\n", at));
  ok(/normalizeOrcid\(a\) === normalizeOrcid\(b\)/.test(body),
     "…compared as ORCIDs, normalised, so a URL form and a bare iD are one person");
  ok(/if \(!isValidOrcid\(a\) \|\| !isValidOrcid\(b\)\) return null/.test(body),
     "…and `null` — «cannot tell» — when either side is not an ORCID: a realm "
     + "that answers with a username is not a reason to refuse the rung, and "
     + "refusing it there would break every such deployment");
  ok(/sameSignature\(currentIdentity\(\)\?\.orcid, nodeIdentity\?\.orcid\)/.test(main),
     "…and the chip asks it of the DECLARED signature against what the node said, "
     + "in that order");

  const rung = main.slice(main.indexOf("function identityRung"),
                          main.indexOf("function servingNode"));
  ok(/nodeConfirmsTheSignature\(\) === false/.test(rung),
     "a node that confirmed SOMEBODY ELSE has not confirmed you: neither rung "
     + "above Firma is reached. Measured on E.D.'s screen — declared "
     + "0000-0002-5065-7970, the node said 0000-0002-1825-0097, and the chip "
     + "showed the DECLARED name as confirmed. A tick nobody earned, one rung up.");
  ok(/ident\.otherPerson/.test(main),
     "…and it is SAID, not silently dropped: a mute degradation is the failure "
     + "that looks like a success");
  ok(/ident\.otherPersonNext/.test(main),
     + "answer, so one of the two names has to change");
}

console.log("\n6f · THE ZERO RUNG: a refusal names the gesture you HAVE");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  const i18n = readFileSync(join(SRC, "i18n.ts"), "utf8");

  ok(/function nextRungInvitation/.test(main),
     "one function decides what a refusal invites you to do, so the three "
     + "refusals cannot drift apart");
  const at = main.indexOf("function nextRungInvitation");
  const body = main.slice(at, main.indexOf("\n}\n", at));

  // the bug: the sentence was STATIC while the gesture is dynamic. E.D. on a
  // clean profile — chip «no author», refusal «Sign in and open it again» —
  // asked «dove devo cliccare?». Two roads described where there is one.
  for (const [rung, key] of [["none", "ident.next.none"],
                             ["signature", "ident.next.signature"]]) {
    ok(new RegExp(`case "${rung}":\\s*return t\\("${key}"`).test(body),
       `rung «${rung}» invites its OWN gesture (${key})`);
  }
  ok(/default:\s*return t\("ident\.next\.confirmed"\)/.test(body),
     "…and a session the node ALREADY confirmed is not sent to sign in again: "
     + "a refusal there is access it was not given, which is a different place "
     + "to go and a different person to ask");
  ok(body.indexOf("nodeConfirmsTheSignature() === false") < body.indexOf("switch"),
     "…and the mismatch is answered BEFORE the rung, because at rung «signature» "
     + "with the node naming somebody else, «sign in» is the one instruction "
     + "that cannot help");

  // ── HERE THE SUBJECT IS THE PROSE, and these checks are NOT repaired ──────
  //
  // Everything above asks about a program and is asked of a parser. What
  // follows asks about SENTENCES A PERSON READS — whether a refusal still says
  // «sign in» — and searching a word inside one of those is not the defect, it
  // is the only correct way to ask. `Sorg.prosa` exists to say so at the call
  // site, so nobody later rewrites these as code fences and nobody counts them
  // among the ones that had to change.
  const none = i18n.match(/"ident\.next\.none": "([^"]*)"/);
  ok(none, "the zero rung has a sentence");
  ok(Sorg.prosa(none[1], "not a login") && Sorg.prosa(none[1], "signature"),
     "…and it says the step is a SIGNATURE and not a login: asking somebody to "
     + "sign in on a node before they have said who they claim to be says that "
     + "without that node they do not exist");
  ok(Sorg.prosa(none[1], "offline"),
     "…and that it needs nobody, which is the property that makes the ladder a "
     + "ladder rather than a gate");

  // and no refusal may still carry the contradicting instruction
  for (const key of ["study.restricted", "members.joinNeedsIdentity"]) {
    const found = i18n.match(new RegExp(`"${key}": "([^"]*)"`));
    ok(found, `${key} exists`);
    ok(!Sorg.prosa(found[1], "sign in"),
       `${key} states the FACT and leaves the instruction to the rung — it used `
       + "to end «Sign in and open it again», which on a clean profile named a "
       + "step the chip was not offering");
  }
}

console.log("\n7 · the bar keeps NOTHING from the round trip");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  const at = main.indexOf("function restoreAfterSignIn");
  ok(at > 0, "`restoreAfterSignIn` exists");
  const body = main.slice(at, main.indexOf("\n}\n", at));
  for (const key of ["code", "state", "session_state", "iss"]) {
    ok(body.includes(`"${key}"`),
       `\`${key}\` is taken off the address bar — it was left there while `
       + "`?study=` was removed, which is the same rule applied to half the "
       + "problem: a spent code written in a bar gets copied into chats");
  }
  ok(/replaceState/.test(body), "…without adding a history entry");
}

console.log("\n8 · the study is instrumented, so a lost one leaves a trail");
{
  const main = readFileSync(join(SRC, "main.ts"), "utf8");
  ok(/logInfo\(`study: opening /.test(main), "entering `openStudyFromLink`");
  ok(/logInfo\(`study: loaded /.test(main), "…and leaving it, with the slot count");
  ok(/logInfo\(`container: /.test(main),
     "…and `loadContainerDocument` says how many members it took");
}

console.log(`\nstudylink: ${checks} checks passed`);
if (failures.length) {
  console.error(`\nstudylink: ${failures.length} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
