// APRI IN EMSTUDIO (13 Oct 2026) · Blender's «Open in EMStudio» opens the room
// in the session that is already there, and the main window never leaves the
// app without a way back.
//
//   node scripts/check-open-in-emstudio.mjs
//
// Three halves, none needing a browser (the live ones are `check-interactions`
// AE1.stay and AE2.signin, and `cargo test` in apps/desktop/src-tauri):
//   1. `roomPlan` — what a room link does to a session: stay, enter, sign in;
//   2. the `redirect_uri` the old path sent, MEASURED: the page's own address,
//      `tauri://localhost/`, which the realm refuses — and the desktop's one;
//   3. the shell is wired: the navigation guard is registered, and a deep link
//      brings the window forward on macOS.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = new Map();
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { location: { origin: "tauri://localhost", pathname: "/", href: "tauri://localhost/", search: "", hash: "" } };

const SRC = new URL("../src/", import.meta.url).pathname;
const load = async (file) => {
  const b = await esbuild.build({ entryPoints: [`${SRC}${file}`], bundle: true, format: "esm", write: false, logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const H = await load("handoff.ts");
const O = await load("oidc.ts");
const R = await load("desktop-return.ts");

let checks = 0;
const fails = [];
const eq = (a, b, what) => { checks++; try { assert.deepStrictEqual(a, b); } catch { fails.push(`${what}\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); } };

// ── 1 · the plan ─────────────────────────────────────────────────────────────
const link = H.parseHandoff("stratigraph://open?server=https%3A%2F%2Fem.localhost%3A8443%2Fem%2F&room=tavolo-2026-10-12&node=US_7");
eq([link.server, link.room, link.node], ["https://em.localhost:8443/em", "tavolo-2026-10-12", "US_7"], "the link Blender sends reads back");
const at = (over) => ({ node: "https://em.localhost:8443/em", room: "tavolo-2026-10-12", connected: true, signedIn: true, ...over });
eq(H.roomPlan(link, at({})), "stay", "13 Oct: in the room already → stay (no sign-in, no join)");
eq(H.roomPlan(link, at({ signedIn: false })), "stay", "…even on a node that runs open (no token)");
eq(H.roomPlan(link, at({ room: "altra" })), "enter", "same node, another room, a token → enter with this session");
eq(H.roomPlan(link, at({ connected: false })), "enter", "same node, the room dropped, a token → enter");
eq(H.roomPlan(link, at({ room: null, connected: false, signedIn: false })), "sign-in", "same node, no token → sign in");
eq(H.roomPlan(link, at({ node: "https://altro.example.org" })), "sign-in", "another node → its own sign-in");
eq(H.roomPlan(link, at({ node: "" })), "sign-in", "no node at all → sign in");
eq(H.sameNode("https://em.localhost:8443/em/", "HTTPS://EM.LOCALHOST:8443/em"), true, "a trailing slash and the case are one node");
eq(H.sameNode("http://127.0.0.1:8000", "http://localhost:8000/"), true, "127.0.0.1 and localhost are one node");
eq(H.sameNode("http://localhost:8000", "http://localhost:8001"), false, "another port is another node");
eq(H.sameNode("", ""), false, "nothing is not a node");

// ── 2 · the redirect_uri, measured ───────────────────────────────────────────
const cfg = { issuer: "https://kc.test/realms/em-dev", client_id: "em-console",
  authorization_endpoint: "https://kc.test/realms/em-dev/protocol/openid-connect/auth", token_endpoint: "https://kc.test/t" };
const before = new URL(await O.authorizeUrl(cfg));
eq(before.searchParams.get("redirect_uri"), "tauri://localhost/",
   "THE OLD PATH (`openHandoff` → `authorizeUrl(handoffAuth)`): the page's own address — what the realm refused");
const now = new URL(await O.authorizeUrl(cfg, { redirectUri: R.NODE_DESKTOP_RETURN }));
eq(now.searchParams.get("redirect_uri"), "org.extendedmatrix.emstudio:/oidc-return",
   "the desktop's way in names the app's scheme (admitted by realm em-dev since 3 Oct)");
const realm = (() => { try { return readFileSync(new URL("../../../stratigraph-server/dev-stack/keycloak/realm-em-dev.json", import.meta.url), "utf8"); } catch { return null; } })();
if (realm) {
  const uris = JSON.parse(realm).clients.find((c) => c.clientId === "em-console")?.redirectUris ?? [];
  eq(uris.includes("org.extendedmatrix.emstudio:/oidc-return"), true, "realm em-dev › em-console admits the desktop's redirect");
  eq(uris.some((u) => u.startsWith("tauri:")), false, "…and not tauri:// (nothing to add: the page's address is no redirect)");
}

// ── 3 · the shell is wired ───────────────────────────────────────────────────
const rs = readFileSync(new URL("../../apps/desktop/src-tauri/src/main.rs", import.meta.url), "utf8");
eq(/\.plugin\(navigation_guard\(\)\)/.test(rs), true, "the navigation guard is registered");
eq(/RunEvent::Opened \{ urls \} => \{[\s\S]{0,600}bring_forward\(app\)/.test(rs), true, "a deep link brings the window forward (macOS)");
const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const body = main.slice(main.indexOf("export async function openHandoff"), main.indexOf("let pendingHandoffNode"));
const iPlan = body.indexOf("roomPlan("), iAuth = body.indexOf("loadAuthConfig("), iTauri = body.indexOf("if (isTauri())"), iAssign = body.indexOf("window.location.assign");
eq(iPlan > 0 && iPlan < iAuth, true, "openHandoff asks the session BEFORE asking the node how to sign in");
eq(iTauri > 0 && iTauri < iAssign, true, "…and the desktop returns before the page would navigate");

console.log(`open-in-emstudio: ${checks - fails.length}/${checks} checks`);
if (fails.length) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1); }
