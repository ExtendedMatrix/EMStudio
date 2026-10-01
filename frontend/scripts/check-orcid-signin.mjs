// IDENTITÀ · executable check of «Sign in with ORCID» (`src/orcid-signin.ts`).
//
//   node scripts/check-orcid-signin.mjs
//
// The id_token ORCID sends back is a VERIFICATION only if its signature is
// ORCID's and it was issued for THIS round trip. A test key plays ORCID here:
// it signs tokens, and the module must accept the right one and refuse each
// wrong one — another key, another issuer, another client, expired, another
// nonce, another state — and keep nothing (the pending record is gone after one
// read, whatever the outcome).
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const store = new Map();
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { location: { origin: "https://em.localhost:8443", pathname: "/em/studio/", href: "https://em.localhost:8443/em/studio/?x=1", hash: "" } };

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}orcid-signin.ts`], bundle: true, format: "esm", write: false, logLevel: "silent" });
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const fails = [];
const eq = (a, b, what) => { checks++; try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); } };
const ok = (c, what) => { checks++; if (!c) fails.push(what); };

const subtle = globalThis.crypto.subtle;
const gen = () => subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const orcidKey = await gen();
const otherKey = await gen();
const jwk = { ...(await subtle.exportKey("jwk", orcidKey.publicKey)), kid: "production-orcid-org-7hdmdswarosg3gjujo8agwtazgkp1ojs", use: "sig" };
const jwks = async (url) => { ok(url === "https://orcid.org/oauth/jwks", `the keys are ORCID's (${url})`); return { keys: [jwk] }; };
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function token(claims, key = orcidKey.privateKey) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid: jwk.kid }));
  const p = b64u(JSON.stringify(claims));
  const sig = await subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
const CFG = { clientId: "APP-TESTCLIENT0000001", base: "https://orcid.org" };
const ID = "0000-0002-1825-0097";
const NOW = 1_790_000_000;

/** start a round trip, then come back with a token built from what was asked */
async function roundTrip(mutate = (c) => c, opts = {}) {
  const url = new URL(M.orcidAuthorizeUrl(CFG, "https://em.localhost:8443/em/studio/?study=x"));
  const nonce = url.searchParams.get("nonce"), state = url.searchParams.get("state");
  const claims = mutate({ iss: "https://orcid.org", aud: CFG.clientId, sub: ID, nonce, exp: NOW + 600, iat: NOW, given_name: "Emanuel", family_name: "Demetrescu" });
  const tk = await token(claims, opts.key);
  const hash = `#id_token=${tk}&state=${opts.state ?? state}`;
  return { url, r: await M.completeOrcidSignIn(hash, jwks, NOW) };
}

// ── the authorization URL ────────────────────────────────────────────────────
{
  const { url, r } = await roundTrip();
  eq([url.origin + url.pathname, url.searchParams.get("response_type"), url.searchParams.get("scope"), url.searchParams.get("client_id"), url.searchParams.get("redirect_uri")],
     ["https://orcid.org/oauth/authorize", "id_token", "openid", CFG.clientId, "https://em.localhost:8443/em/studio/"], "the request: implicit id_token, openid, this page as redirect");
  ok(/^[0-9a-f]{48}$/.test(url.searchParams.get("nonce")) && url.searchParams.get("nonce") !== url.searchParams.get("state"), "a fresh nonce and a fresh state");
  eq(r, { ok: true, orcid: ID, name: "Emanuel Demetrescu", base: "https://orcid.org", returnTo: "https://em.localhost:8443/em/studio/?study=x" }, "a token signed by ORCID for this round trip: the iD, read");
  eq(store.size, 0, "nothing is kept after the round trip");
}
// ── each wrong one, refused ──────────────────────────────────────────────────
const refused = async (what, mutate, opts) => { const { r } = await roundTrip(mutate, opts); ok(r.ok === false, `refused: ${what} (${JSON.stringify(r)})`); eq(store.size, 0, `…and nothing kept (${what})`); };
await refused("another key", (c) => c, { key: otherKey.privateKey });
await refused("another issuer", (c) => ({ ...c, iss: "https://orcid.example" }));
await refused("another client", (c) => ({ ...c, aud: "APP-SOMEBODYELSE" }));
await refused("expired", (c) => ({ ...c, exp: NOW - 1 }));
await refused("another nonce (a replay)", (c) => ({ ...c, nonce: "0".repeat(48) }));
await refused("another state", (c) => c, { state: "x" });
await refused("no iD in sub", (c) => ({ ...c, sub: "dev" }));
{
  const r = await M.completeOrcidSignIn("#id_token=a.b.c&state=s", jwks, NOW);
  eq(r.ok, false, "a token with no round trip started from this tab is refused");
}
{
  M.orcidAuthorizeUrl(CFG, "https://x/");
  const r = await M.completeOrcidSignIn("#error=access_denied&error_description=User%20denied%20access", jwks, NOW);
  eq([r.ok, r.error], [false, "User denied access"], "ORCID's refusal is said in its words");
}
eq(M.returningFromOrcid("#id_token=x"), false, "no pending round trip: not ours");

if (fails.length) {
  console.error(`orcid-signin: ${fails.length} of ${checks} checks FAILED`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`orcid-signin: ${checks} checks passed`);
