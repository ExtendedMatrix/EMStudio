// IDENTITY · executable check of src/identity.ts.
//
//   node scripts/check-identity.mjs
//
// Same harness as check-tiling.mjs: the frontend has no test runner, so the
// module is bundled with the project's own esbuild and exercised in node, with
// a stub localStorage. Everything here is pure state and arithmetic — the
// network lives behind IdentityProvider, which is exactly why the FLOW can be
// checked with no infrastructure at all.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}identity.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const I = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};
const reset = () => mem.clear();

// ── the iD: shape AND checksum ──────────────────────────────────────────────
//
// The checksum is what catches the mistake that actually happens: two digits
// transposed. That passes every shape test and points at a REAL OTHER PERSON.
{
  // real, published iDs (their check digits are the point of the exercise)
  for (const id of [
    "0000-0002-1825-0097",   // ORCID's own example
    "0000-0001-5109-3700",
    "0000-0002-1694-233X",   // check digit X
  ]) {
    ok(I.isValidOrcid(id), `${id} is a valid iD`);
  }

  // a transposition of a valid iD: right shape, wrong checksum
  ok(!I.isValidOrcid("0000-0002-1825-0079"), "a transposed pair is refused");
  ok(!I.isValidOrcid("0000-0002-1825-0098"), "one wrong digit is refused");
  ok(!I.isValidOrcid("0000-0002-1825-009"), "fifteen characters are refused");
  ok(!I.isValidOrcid("abcd-efgh-ijkl-mnop"), "letters are refused");
  ok(!I.isValidOrcid(""), "empty is refused");

  eq(I.orcidProblem(""), "empty", "empty reports as empty");
  eq(I.orcidProblem("0000-0002"), "shape", "a short iD reports as shape");
  eq(I.orcidProblem("0000-0002-1825-0079"), "checksum", "a bad check digit reports as checksum");
  eq(I.orcidProblem("0000-0002-1825-0097"), null, "a good iD has no problem");

  // what a human actually pastes
  eq(I.normalizeOrcid("https://orcid.org/0000-0002-1825-0097"), "0000-0002-1825-0097", "a pasted URL normalises");
  eq(I.normalizeOrcid("0000 0002 1825 0097"), "0000-0002-1825-0097", "spaces normalise");
  eq(I.normalizeOrcid("0000-0002-1694-233x"), "0000-0002-1694-233X", "a lower-case x normalises");
  ok(I.isValidOrcid("https://orcid.org/0000-0002-1825-0097"), "…and the pasted URL validates");
}

// ── declaring, offline ──────────────────────────────────────────────────────
{
  reset();
  eq(I.currentIdentity(), null, "no identity to begin with");

  const bad = I.declareIdentity("0000-0002-1825-0079");
  eq(bad, { ok: false, problem: "checksum" }, "a bad checksum never becomes an identity");
  eq(I.currentIdentity(), null, "…and nothing was stored");

  const res = I.declareIdentity("0000-0002-1825-0097", { name: "Josiah", surname: "Carberry" });
  ok(res.ok, "a valid iD is accepted");
  eq(res.identity.verified, false, "a declared identity is NOT verified");
  eq(I.currentIdentity().orcid, "0000-0002-1825-0097", "and becomes the current author");
  eq(I.currentIdentity().name, "Josiah", "the optional name is kept");
}

// ── the shared field laptop: adding someone must not erase anyone ───────────
{
  reset();
  I.declareIdentity("0000-0002-1825-0097", { name: "Josiah" });
  I.declareIdentity("0000-0001-5109-3700", { name: "Second" });

  eq(I.currentIdentity().orcid, "0000-0001-5109-3700", "the newcomer is now the author");
  eq(I.knownIdentities().length, 2, "…and the first person is still known");

  I.useIdentity("0000-0002-1825-0097");
  eq(I.currentIdentity().name, "Josiah", "switching back finds the first identity intact");

  eq(I.useIdentity("0000-0002-1694-233X"), null, "switching to an unknown iD does nothing");
  eq(I.currentIdentity().orcid, "0000-0002-1825-0097", "…and leaves the current one alone");

  I.forgetIdentity("0000-0002-1825-0097");
  eq(I.knownIdentities().length, 1, "forgetting removes one");
  eq(I.currentIdentity().orcid, "0000-0001-5109-3700", "and the pointer moves to who is left");
}

// ── the gate: data prep is free, publishing is not ──────────────────────────
{
  reset();
  eq(I.publishGate(), { allowed: false, reason: "no-identity" }, "nobody declared → cannot publish");

  I.declareIdentity("0000-0002-1825-0097");
  eq(I.publishGate(), { allowed: false, reason: "not-verified", orcid: "0000-0002-1825-0097" },
     "declared but unverified → cannot publish, and the message can name the iD");

  // storage tampering must not open the gate
  const raw = JSON.parse(mem.get("emstudio.identities"));
  raw.known[0].verified = "true";                       // a string, not a boolean
  mem.set("emstudio.identities", JSON.stringify(raw));
  eq(I.publishGate().allowed, false, 'a "true" STRING in storage does not verify an identity');
  eq(I.currentIdentity().verified, false, "…and it reads back as the boolean false");
}

// ── verification through the seam ───────────────────────────────────────────
{
  reset();
  I.declareIdentity("0000-0002-1825-0097");

  // the iD matches → verified, and publishing unlocks
  const good = await I.verifyCurrentIdentity(
    new I.MockIdentityProvider({ orcid: "0000-0002-1825-0097", name: "Josiah Carberry" }));
  eq(good.status, "verified", "a matching iD verifies");
  eq(I.currentIdentity().verified, true, "the stored identity is now verified");
  ok(typeof I.currentIdentity().verifiedAt === "string", "…and remembers when");
  eq(I.publishGate(), { allowed: true }, "publishing is unlocked");

  // a DIFFERENT iD → never promoted silently
  reset();
  I.declareIdentity("0000-0002-1825-0097");
  const other = await I.verifyCurrentIdentity(
    new I.MockIdentityProvider({ orcid: "0000-0001-5109-3700" }));
  eq(other.status, "mismatch", "a different iD reports a mismatch");
  eq(other.declared, "0000-0002-1825-0097", "…naming what was declared");
  eq(other.verified, "0000-0001-5109-3700", "…and what was verified");
  eq(I.currentIdentity().verified, false, "the declared identity is NOT promoted");
  eq(I.publishGate().allowed, false, "and publishing stays closed until a human chooses");

  // choosing, explicitly
  I.adoptVerifiedIdentity("0000-0001-5109-3700", "Second");
  eq(I.currentIdentity().orcid, "0000-0001-5109-3700", "adopting switches the identity");
  eq(I.currentIdentity().verified, true, "…verified");
  eq(I.knownIdentities().length, 2, "…and the old declaration is still on this machine");

  // the provider failing is not a verification
  reset();
  I.declareIdentity("0000-0002-1825-0097");
  const failed = await I.verifyCurrentIdentity(
    new I.MockIdentityProvider(new Error("no network")));
  eq(failed.status, "failed", "a provider error reports as failed");
  eq(I.currentIdentity().verified, false, "…and verifies nothing");

  // no identity at all
  reset();
  const none = await I.verifyCurrentIdentity(
    new I.MockIdentityProvider({ orcid: "0000-0002-1825-0097" }));
  eq(none.status, "no-identity", "verifying with nobody declared reports it");
}

// ── the seam hands back no token, by construction ───────────────────────────
{
  const result = await new I.MockIdentityProvider({ orcid: "0000-0002-1825-0097" }).verify();
  eq(Object.keys(result).sort(), ["orcid"], "a verification result carries the CLAIM, never a token");
}

// ── is a node's answer a confirmation OF THE SIGNATURE THIS SESSION DECLARED? ─
//
// Measured in Chrome, 5 September 2026, and the reason this function exists:
// declared `0000-0002-5065-7970` «Emanuel Demetrescu», signed in against the dev
// node, and the node confirmed `0000-0002-1825-0097` «Dev User» — because the dev
// realm's seeded user carries a sample iD, not his. The chip read «Emanuel
// Demetrescu · em.localhost:8443»: the declared name presented as confirmed by a
// node that had confirmed somebody else. Same species as a tick beside a name
// nobody checked, one rung further up.
//
// The three answers are the whole point. `false` is «a different person», and it
// must not be reachable from «cannot tell» — a realm that answers with a username
// instead of an iD is not a mismatch, and refusing the rung there would break
// every deployment that does not put ORCID in the token.
{
  const A = "0000-0002-5065-7970";           // the signature E.D. declares
  const B = "0000-0002-1825-0097";           // what the dev realm actually says

  eq(I.sameSignature(A, A), true, "the same iD is a confirmation of the signature");
  eq(I.sameSignature(A, B), false,
     "the two iDs that disagreed on 5 September are NOT a confirmation");
  eq(I.sameSignature(B, A), false, "…and it does not depend on which side you ask");

  // spelling is not identity
  eq(I.sameSignature("0000-0002-5065-7970", "https://orcid.org/0000-0002-5065-7970"),
     true, "the same iD written as a URL is still the same person");
  eq(I.sameSignature("0000-0002-5065-7970", " 0000-0002-5065-7970 "),
     true, "…and whitespace is not a second person");

  // the third answer, which is not `false`
  for (const [declared, said, why] of [
    [A, undefined, "a node that has not answered yet"],
    [undefined, A, "a signature nobody declared"],
    ["", "", "two absences"],
    [A, "dev", "a realm that answers with a username"],
    [A, "e9a4c1f2-0000-4000-8000-000000000000", "…or with a subject id"],
    ["not-an-orcid", A, "a declaration that is not an iD"],
  ]) {
    eq(I.sameSignature(declared, said), null,
       `${why} is «cannot tell», not «a different person»`);
  }

  // and «cannot tell» must not be mistakable for a confirmation by a caller that
  // only checks truthiness — this is why the value is `null` and not `false`
  ok(I.sameSignature(A, "dev") !== false,
     "«cannot tell» is not the same value as «a different person»");
  ok(I.sameSignature(A, "dev") !== true,
     "…and it is not a confirmation either");
}

// ── dev27 · L'ACCESSO SUL CAMPO: three modes, and the word each one says ────
//
// Verified by ORCID, attested by a node's password, declared. A signature
// carries the mode it was made in; publishing asks for an iD verified by ORCID
// once — an attested iD passes when the node says it is accredited, because the
// accreditation was online.
{
  const A = "0000-0002-1825-0097";
  const B = "0000-0001-5109-3700";

  // declared: no mode in the signature, no publication
  reset();
  I.declareIdentity(A);
  eq(I.identityState(I.currentIdentity()), "declared", "a typed iD is declared");
  eq(I.signatureAuth(I.currentIdentity()), null, "a declared iD signs with no access mode");
  eq(I.publishGate(), { allowed: false, reason: "not-verified", orcid: A }, "…and does not publish");

  // attested by the node, accredited: signs as node_password, publishes
  const r = I.attestIdentity(A, { node: "fcn-segni", name: "Emanuel Demetrescu", accredited: true });
  eq(r.status, "attested", "the node attests the declared iD");
  eq(I.identityState(I.currentIdentity()), "attested", "the state is attested");
  eq(I.currentIdentity().verified, false, "an attestation is not a verification");
  eq(I.signatureAuth(I.currentIdentity()), { mode: "node_password", attested_by: "fcn-segni" },
     "the signature names the mode and the node");
  eq(I.publishGate(), { allowed: true, via: "accreditation" },
     "an attested and accredited iD publishes: the accreditation was online");

  // attested but not accredited: works, does not publish
  reset();
  I.attestIdentity(A, { node: "fcn-segni", accredited: false });
  eq(I.publishGate().allowed, false, "an attested iD the node does not list does not publish");
  eq(I.currentIdentity().orcid, A, "an attestation with no identity declared adopts the iD (read, not typed)");

  // never another person
  reset();
  I.declareIdentity(B);
  const m = I.attestIdentity(A, { node: "fcn-segni", accredited: true });
  eq(m, { status: "mismatch", declared: B, attested: A }, "a node attesting another person changes nothing");
  eq(I.currentIdentity().orcid, B, "…the declared identity stays");
  eq(I.identityState(I.currentIdentity()), "declared", "…and stays declared");

  // the network comes back: confirmed with ORCID, and the mode follows
  reset();
  I.attestIdentity(A, { node: "fcn-segni", accredited: true });
  const v = await I.verifyCurrentIdentity(new I.MockIdentityProvider({ orcid: A, witness: "orcid.org" }));
  eq(v.status, "verified", "an attested identity is confirmed with ORCID when the network is back");
  eq(I.identityState(I.currentIdentity()), "verified", "the state is verified");
  eq(I.signatureAuth(I.currentIdentity()), { mode: "orcid" }, "and a signature made now says orcid");
  eq(I.currentIdentity().attestedBy, "fcn-segni", "the attestation stays on record");
  eq(I.publishGate(), { allowed: true }, "it publishes through ORCID");

  // a tampered store cannot promote an attestation
  mem.set("emstudio.identities", JSON.stringify({ current: A, known: [
    { orcid: A, verified: "true", authMode: "node_password", attestedBy: "x", accredited: "true" }] }));
  eq(I.publishGate().allowed, false, "«true» as a string promotes nothing");
  mem.set("emstudio.identities", JSON.stringify({ current: A, known: [
    { orcid: A, verified: false, authMode: "password" }] }));
  eq(I.identityState(I.currentIdentity()), "declared", "an unknown mode is dropped on the way in");
}

console.log(`identity: ${checks} checks passed`);
