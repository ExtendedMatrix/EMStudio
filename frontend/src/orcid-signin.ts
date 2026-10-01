/**
 * IDENTITÀ · «Sign in with ORCID» — straight to orcid.org, when there is
 * internet and no StratiGraph node to go through.
 *
 * ORCID's OpenID Connect, IMPLICIT flow (`response_type=id_token`, scope
 * `openid`): the browser goes to ORCID, the person signs in THERE, and ORCID
 * sends it back with an `id_token` in the fragment. The token is a JWT signed by
 * ORCID; its `sub` IS the ORCID iD — the person never has to remember it.
 *
 * Why implicit and not code+PKCE: ORCID's token endpoint wants a client
 * SECRET for the code exchange, and a page or a desktop app is a public client
 * — a secret shipped inside it is a secret published. The implicit id_token is
 * what ORCID offers public clients, and it is enough: we want ONE claim (who),
 * not an access token for anybody's record.
 *
 * What makes it a verification and not a typed claim: the token's SIGNATURE is
 * checked against ORCID's published keys (`/oauth/jwks`, RS256), the issuer and
 * the audience (our client id) must match, it must not be expired, and the
 * `nonce` must be the one this tab sent (a replayed token from somebody else's
 * round trip is refused). Nothing is kept: the id_token is read and dropped —
 * the identity module stores the iD (public) and the fact it was verified,
 * never a token (the rule `identity.ts` states for every token).
 *
 * What it NEEDS and this code cannot invent: a client registered at ORCID
 * (`client_id`, public), with this page's address as a redirect URI. Without
 * one the mode is shown disabled, with the reason — see the night's report.
 */

export interface OrcidConfig {
  /** the public client id registered at ORCID (APP-…) */
  clientId: string;
  /** https://orcid.org, or https://sandbox.orcid.org to try it */
  base: string;
}

const PENDING_KEY = "emstudio.orcid.pending";

interface Pending { nonce: string; state: string; returnTo: string; base: string; clientId: string }

function random(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The page ORCID sends the browser back to: this page, without query or fragment. */
export function orcidRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Build the authorization URL and remember (sessionStorage, one round trip)
 *  the nonce and where to come back to. */
export function orcidAuthorizeUrl(cfg: OrcidConfig, returnTo: string = window.location.href): string {
  const pending: Pending = { nonce: random(), state: random(), returnTo, base: cfg.base, clientId: cfg.clientId };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const url = new URL(`${cfg.base.replace(/\/+$/, "")}/oauth/authorize`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("redirect_uri", orcidRedirectUri());
  url.searchParams.set("nonce", pending.nonce);
  url.searchParams.set("state", pending.state);
  return url.toString();
}

/** Is this page coming back from ORCID? (an `id_token` or an `error` in the fragment,
 *  and a round trip this tab started) */
export function returningFromOrcid(hash: string = window.location.hash): boolean {
  if (!/(^|[#&])(id_token|error)=/.test(hash)) return false;
  try { return !!sessionStorage.getItem(PENDING_KEY); } catch { return false; }
}

export type OrcidReturn =
  | { ok: true; orcid: string; name?: string; base: string; returnTo: string }
  | { ok: false; error: string; returnTo?: string };

const b64urlBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlJson = (s: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as Record<string, unknown>;

/**
 * Finish the round trip: read the fragment, VERIFY the id_token (signature with
 * ORCID's keys, iss, aud, exp, nonce, state), and answer the iD. The pending
 * record is deleted on read, whatever the outcome. `fetchJwks` is injectable for
 * the checks.
 */
export async function completeOrcidSignIn(
  hash: string = window.location.hash,
  fetchJwks: (url: string) => Promise<{ keys: JsonWebKey[] }> = async (u) => (await fetch(u)).json(),
  now: number = Date.now() / 1000,
): Promise<OrcidReturn> {
  let pending: Pending | null = null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    pending = raw ? JSON.parse(raw) as Pending : null;
  } catch { pending = null; }
  if (!pending) return { ok: false, error: "no sign-in was started from this tab" };
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const back = pending.returnTo;
  if (params.get("error")) return { ok: false, error: params.get("error_description") || params.get("error")!, returnTo: back };
  if (params.get("state") !== pending.state) return { ok: false, error: "the answer is not for the sign-in this tab started (state)", returnTo: back };
  const token = params.get("id_token");
  if (!token) return { ok: false, error: "ORCID answered without an id_token", returnTo: back };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "the id_token is not a JWT", returnTo: back };
  let header: Record<string, unknown>, claims: Record<string, unknown>;
  try { header = b64urlJson(parts[0]); claims = b64urlJson(parts[1]); }
  catch { return { ok: false, error: "the id_token does not parse", returnTo: back }; }
  const base = pending.base.replace(/\/+$/, "");
  if (header.alg !== "RS256") return { ok: false, error: `unexpected signature algorithm ${String(header.alg)}`, returnTo: back };
  let jwks: { keys: JsonWebKey[] };
  try { jwks = await fetchJwks(`${base}/oauth/jwks`); }
  catch (e) { return { ok: false, error: `ORCID's keys could not be read: ${String(e)}`, returnTo: back }; }
  const jwk = (jwks.keys ?? []).find((k) => (k as Record<string, unknown>).kid === header.kid) ?? (jwks.keys ?? [])[0];
  if (!jwk) return { ok: false, error: "ORCID published no key to check the token with", returnTo: back };
  try {
    const key = await crypto.subtle.importKey("jwk", { ...jwk, alg: "RS256", ext: true } as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!good) return { ok: false, error: "the id_token's signature is not ORCID's", returnTo: back };
  } catch (e) { return { ok: false, error: `the signature could not be checked: ${String(e)}`, returnTo: back }; }
  if (String(claims.iss ?? "").replace(/\/+$/, "") !== base) return { ok: false, error: `issuer ${String(claims.iss)} is not ${base}`, returnTo: back };
  const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud ?? "")];
  if (!aud.includes(pending.clientId)) return { ok: false, error: "the token was issued to another client", returnTo: back };
  if (typeof claims.exp === "number" && claims.exp < now) return { ok: false, error: "the token has expired", returnTo: back };
  if (claims.nonce !== pending.nonce) return { ok: false, error: "the token's nonce is not this tab's (a replay?)", returnTo: back };
  const orcid = String(claims.sub ?? "");
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) return { ok: false, error: `the token names no ORCID iD (${orcid})`, returnTo: back };
  const name = [claims.given_name, claims.family_name].filter((x) => typeof x === "string" && x).join(" ") || undefined;
  return { ok: true, orcid, name, base, returnTo: back };
}

/** Is orcid.org reachable from here? A no-cors probe: an opaque answer is an
 *  answer; a network error is none. Never a credential, never a cookie. */
export async function orcidReachable(base: string, timeoutMs = 4000): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    await fetch(`${base.replace(/\/+$/, "")}/favicon.ico`, { mode: "no-cors", credentials: "omit", signal: ctl.signal, cache: "no-store" });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
