// ENTRARE DAL DESKTOP · executable check of the way back of a sign-in started
// from the desktop (`src/desktop-return.ts`, `src/oidc.ts`).
//
//   node scripts/check-desktop-return.mjs
//
// Two halves.
//   1. READING the answer: the deep link the OS hands over, or what a person
//      pastes (the code the public page shows, the whole deep link, the page's
//      address with its fragment, a node's return). Each is recognised for what
//      it is, and nothing else is.
//   2. A NODE's round trip with the desktop's redirect, against a FAKE IdP: the
//      realm is asked to return to `org.extendedmatrix.emstudio:/oidc-return`,
//      and the code exchange names the SAME redirect (an exchange that named the
//      page's derived address — `tauri://localhost/` — is the one Keycloak
//      refuses). PKCE S256, no secret, state checked.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const store = new Map();
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { location: { origin: "tauri://localhost", pathname: "/", href: "tauri://localhost/", search: "", hash: "" } };

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (file) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${file}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const R = await load("desktop-return.ts");
const O = await load("oidc.ts");

let checks = 0;
const fails = [];
const eq = (a, b, what) => { checks++; try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); } };
const ok = (c, what) => { checks++; if (!c) fails.push(what); };

// ── 1 · reading the answer ───────────────────────────────────────────────────
const T = "eyJh.eyJz.c2ln";
eq([R.APP_SCHEME, R.NODE_DESKTOP_RETURN, R.ORCID_DESKTOP_RETURN],
   ["org.extendedmatrix.emstudio:", "org.extendedmatrix.emstudio:/oidc-return", "https://extendedmatrix.org/orcid/callback/"],
   "the scheme is the app's identifier; ORCID returns to the registered page");
eq(R.readReturn(`org.extendedmatrix.emstudio:/orcid-return#id_token=${T}&state=s1`), { kind: "orcid", hash: `#id_token=${T}&state=s1` },
   "deep link from the public page → ORCID, the fragment intact");
eq(R.readReturn("org.extendedmatrix.emstudio:/oidc-return?state=s2&session_state=x&iss=https%3A%2F%2Fkc&code=C0DE"),
   { kind: "node", search: "?state=s2&session_state=x&iss=https%3A%2F%2Fkc&code=C0DE" }, "deep link from a node's Keycloak → node, the query intact");
eq(R.readReturn("org.extendedmatrix.emstudio:/orcid-return#error=access_denied&error_description=User%20denied&state=s"),
   { kind: "orcid", hash: "#error=access_denied&error_description=User%20denied&state=s" }, "ORCID's refusal is an answer too");
eq(R.readReturn("org.extendedmatrix.emstudio:/oidc-return?error=access_denied&state=s"), { kind: "node", search: "?error=access_denied&state=s" },
   "a node's refusal is an answer too");
eq(R.readReturn(`  #id_token=${T}&state=s1 \n`), { kind: "orcid", hash: `#id_token=${T}&state=s1` }, "pasted: the code the page shows (spaces around)");
eq(R.readReturn(`https://extendedmatrix.org/orcid/callback/#id_token=${T}&state=s1`), { kind: "orcid", hash: `#id_token=${T}&state=s1` },
   "pasted: the page's own address with its fragment");
eq(R.readReturn(`id_token=${T}&state=s1`), { kind: "orcid", hash: `#id_token=${T}&state=s1` }, "pasted: the bare parameters");
eq(R.readReturn("code=C0DE&state=s2"), { kind: "node", search: "?code=C0DE&state=s2" }, "pasted: a node's bare parameters");
eq(R.readReturn("stratigraph://open?server=https%3A%2F%2Fx&room=r"), null, "a handoff link is not a sign-in answer");
eq(R.readReturn("org.extendedmatrix.emstudio:/other#id_token=x"), null, "our scheme on another path is nothing");
eq(R.readReturn("0000-0002-1825-0097"), null, "an iD is not an answer");
eq(R.readReturn(""), null, "nothing is nothing");
ok(R.isAppReturn("ORG.EXTENDEDMATRIX.EMSTUDIO:/oidc-return?code=1") && !R.isAppReturn("stratigraph://open"), "isAppReturn: ours (any case), not the handoff");

// ── 2 · a node, with the desktop's redirect, against a fake IdP ──────────────
const CONFIG = { issuer: "https://kc.test/realms/em-dev", client_id: "em-console",
  authorization_endpoint: "https://kc.test/realms/em-dev/protocol/openid-connect/auth",
  token_endpoint: "https://kc.test/realms/em-dev/protocol/openid-connect/token" };
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const posted = [];
globalThis.fetch = async (url, init) => {
  const body = new URLSearchParams(init.body);
  posted.push({ url, body: Object.fromEntries(body) });
  // the fake realm: the code it issued, the redirect it was asked for, the verifier that matches the challenge
  const good = body.get("code") === "C0DE" && body.get("redirect_uri") === R.NODE_DESKTOP_RETURN
    && b64u(createHash("sha256").update(body.get("code_verifier")).digest()) === issued.challenge && !body.has("client_secret");
  return { ok: good, status: good ? 200 : 400, json: async () => good
    ? { access_token: "AT", refresh_token: "RT", expires_in: 900 } : { error: "invalid_grant", error_description: "Code not valid" } };
};
const issued = {};
{
  const url = new URL(await O.authorizeUrl(CONFIG, { returnTo: "tauri://localhost/", loginHint: "0000-0002-1825-0097", redirectUri: R.NODE_DESKTOP_RETURN }));
  issued.challenge = url.searchParams.get("code_challenge");
  eq([url.searchParams.get("redirect_uri"), url.searchParams.get("code_challenge_method"), url.searchParams.get("login_hint")],
     [R.NODE_DESKTOP_RETURN, "S256", "0000-0002-1825-0097"], "the realm is asked to return to the app's scheme (PKCE S256, the iD as user name)");
  const state = url.searchParams.get("state");
  const r = await O.completeSignIn(CONFIG, `?state=${state}&session_state=x&code=C0DE`);
  eq([r.ok, r.token, r.refresh_token], [true, "AT", "RT"], "the code that came back by deep link becomes a token");
  eq(posted.at(-1).body.redirect_uri, R.NODE_DESKTOP_RETURN, "…and the exchange names the SAME redirect, not the page's tauri:// address");
  ok(!("client_secret" in posted.at(-1).body), "no secret is sent");
  eq(store.size, 0, "the verifier is gone after one read");
}
{
  const url = new URL(await O.authorizeUrl(CONFIG, { redirectUri: R.NODE_DESKTOP_RETURN }));
  issued.challenge = url.searchParams.get("code_challenge");
  const r = await O.completeSignIn(CONFIG, "?state=SOMEBODY-ELSE&code=C0DE");
  ok(r.ok === false && /state did not match/.test(r.error), `a code with another state is refused (${r.error})`);
}
{
  const url = new URL(await O.authorizeUrl(CONFIG, {}));
  eq(url.searchParams.get("redirect_uri"), "tauri://localhost/", "without a redirect given, the page's own (the web build's rule, unchanged)");
  store.clear();
}

if (fails.length) {
  console.error(`desktop-return: ${fails.length} of ${checks} checks FAILED`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`desktop-return: ${checks} checks passed`);
