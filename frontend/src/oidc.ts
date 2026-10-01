/**
 * Sign in to a StratiGraph Server, from EMStudio — Authorization Code + PKCE.
 *
 * The half of the handoff the link deliberately does NOT carry. A deep-link says
 * `{server, room}`; this is how the app turns that into a token that belongs to
 * the person sitting here rather than to whoever forwarded the link.
 *
 * **The token never touches disk.** Not localStorage, not the settings file, not
 * a cookie — the same rule the AI key follows in this codebase, and the same one
 * `sync.ts::HubOptions` states: a token on disk outlives the reason it was
 * issued. It lives in a module variable for this session, and the PKCE verifier
 * lives in `sessionStorage` only for the length of the round trip and is deleted
 * on read.
 *
 * **No client secret.** A desktop app and a browser build are both PUBLIC
 * clients: a secret shipped inside them is a secret published. PKCE is what
 * replaces it, and `code_challenge_method=S256` is not optional here — `plain`
 * would make the interception it prevents possible again.
 *
 * This is a port of the node console's `auth.js` (which the server serves for
 * its two web faces), not a second design. What differs is only what must: it
 * signs in against a server named at RUNTIME by a link, so nothing about the
 * endpoint can be baked in, and on the desktop the redirect comes back through
 * the app's own deep-link handler rather than through a page load.
 */

/** What a node says about how a browser signs in — `GET /v1/auth-config`. */
export interface AuthConfig {
  issuer: string;
  client_id: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string | null;
  scope?: string;
  /** false on a node running open (dev): there is nobody to be */
  enforcing?: boolean;
  /** dev27 · the alias of the ORCID identity provider the realm brokers
   *  (`kc_idp_hint`), and the node's name — the one that attests a sign-in
   *  made with its password (stratigraph-server `/v1/auth-config`) */
  orcid_idp?: string | null;
  node_name?: string | null;
}

export interface SignInResult {
  ok: boolean;
  token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  /** WHERE THE SIGN-IN WAS STARTED FROM, handed back so the caller can return
   *  the person to it — with whatever they were doing still on the address.
   *
   *  Without this, signing in from a page that was opening something LOSES the
   *  something: measured in Chrome on 5 September 2026, a restricted study said
   *  «sign in and open it again», the sign-in worked, and the study was gone —
   *  the realm's return replaces the query string, so `?study=` was overwritten
   *  by `code`, `state`, `session_state` and `iss`. Re-opening from the door
   *  produced a fresh tab with no session, which is a RING: it closes only if you
   *  know a trick no user can guess. */
  returnTo?: string;
  /** Whether the attempt was the SILENT one (`prompt=none`). A caller must not
   *  report a failed silent attempt as a failure: `login_required` is the
   *  expected answer when there is no session, and saying so out loud would be
   *  an error message for something that went exactly as designed. */
  silent?: boolean;
}

/** What this tab asked for, kept for the length of one round trip.
 *
 *  The return address rides HERE and not in the `state` parameter, and the
 *  difference matters: `state` travels through the IdP and into its logs, and the
 *  address being remembered is a page URL that may legitimately carry
 *  `?token=` (a study link for a restricted study does). One entry, one lifetime,
 *  deleted on read — the verifier's own discipline, which this shares because it
 *  has exactly the same lifetime. `state` stays what it is for: an opaque nonce
 *  that makes the round trip mean something. */
interface PendingSignIn {
  verifier: string;
  state: string;
  returnTo?: string;
  silent?: boolean;
}

const VERIFIER_KEY = "emstudio.pkce";

/** How this node wants a client to sign in. `null` when it has no OIDC at all —
 *  a dev node, where every call is open and there is nothing to sign in as. */
export async function loadAuthConfig(server: string): Promise<AuthConfig | null> {
  const base = server.replace(/\/+$/, "");
  try {
    const answer = await fetch(`${base}/v1/auth-config`, {
      headers: { Accept: "application/json" },
    });
    if (!answer.ok) return null;
    return (await answer.json()) as AuthConfig;
  } catch {
    return null;
  }
}

// ── PKCE ────────────────────────────────────────────────────────────────────

function randomVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Where the IdP sends the browser back. The page's own directory, derived and
 *  never written down: a redirect URI that is right for one build and wrong for
 *  the other fails at the IdP, far from the line that caused it. */
export function redirectUri(): string {
  const path = window.location.pathname.replace(/[^/]*$/, "");
  return `${window.location.origin}${path}`;
}

/** Build the authorization URL and remember what this tab asked for.
 *
 *  Returned rather than navigated to, because the two builds go different ways:
 *  the web build assigns it to `location`, the desktop one opens it in the
 *  system browser (an embedded webview is a phishing surface and several IdPs
 *  refuse it outright). */
export async function authorizeUrl(
  config: AuthConfig,
  opts: { returnTo?: string; silent?: boolean; idpHint?: string; loginHint?: string } = {},
): Promise<string> {
  const verifier = randomVerifier();
  const state = randomVerifier();
  const pending: PendingSignIn = {
    verifier, state,
    returnTo: opts.returnTo, silent: opts.silent || undefined,
  };
  sessionStorage.setItem(VERIFIER_KEY, JSON.stringify(pending));
  const url = new URL(config.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.client_id);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", config.scope || "openid profile email");
  url.searchParams.set("code_challenge", await challengeFor(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  // ONE SILENT ATTEMPT. `prompt=none` asks the realm to answer without showing
  // anything: a code if there is a session, `error=login_required` if there is
  // not. It is what turns «sign in and open it again» into nothing at all for
  // somebody who is already signed in on this node — and the caller is
  // responsible for trying it only once, because a redirect loop is worse than
  // a refusal.
  if (opts.silent) url.searchParams.set("prompt", "none");
  // IDENTITÀ · straight to an identity provider the realm brokers (`orcid`):
  // Keycloak skips its own login page for it — and ignores the hint when the
  // realm has no provider of that alias (measured on em-dev, 1 Oct 2026)
  if (opts.idpHint) url.searchParams.set("kc_idp_hint", opts.idpHint);
  // dev27 · L'ACCESSO SUL CAMPO: the iD as the user name of the node's own
  // login form (iD + the node's password), so nobody types it twice
  if (opts.loginHint) url.searchParams.set("login_hint", opts.loginHint);
  return url.toString();
}

/** `?code=…` is on this page's URL — the IdP just sent the browser back. */
export function returningFromIdp(search?: string): boolean {
  const query = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""));
  return query.has("code") || query.has("error");
}

function readSaved(): PendingSignIn | null {
  const raw = sessionStorage.getItem(VERIFIER_KEY);
  // DELETED ON READ: a verifier is single-use, and one left behind is one a
  // second tab could spend.
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingSignIn;
  } catch {
    return null;
  }
}

/** Turn the returned code into a token. */
export async function completeSignIn(
  config: AuthConfig, search?: string,
): Promise<SignInResult> {
  const query = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""));
  const code = query.get("code");
  const failed = query.get("error");
  const returned = query.get("state");
  const saved = readSaved();
  // The return address travels back on EVERY exit, success or not: somebody who
  // could not sign in still has to end up where they were, with what they were
  // doing still on the address. A failure that also loses the page is two
  // failures.
  const where = { returnTo: saved?.returnTo, silent: saved?.silent };
  if (failed) {
    return { ok: false, ...where,
             error: query.get("error_description") || failed };
  }
  if (!code) return { ok: false, ...where,
                      error: "no authorization code came back" };
  if (!saved) {
    return { ok: false, error: "this session has no sign-in in progress (the "
                             + "code came back where none was started)" };
  }
  if (saved.state && returned !== saved.state) {
    // The one check that makes the round trip mean anything: a code delivered
    // with somebody else's state is a code this client did not ask for.
    return { ok: false, ...where,
             error: "the sign-in state did not match — refusing a "
                  + "code this session did not ask for" };
  }
  const result = await exchange(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: saved.verifier,
  });
  return { ...result, ...where };
}

export async function refresh(
  config: AuthConfig, refreshToken: string,
): Promise<SignInResult> {
  return await exchange(config, {
    grant_type: "refresh_token", refresh_token: refreshToken });
}

async function exchange(
  config: AuthConfig, fields: Record<string, string>,
): Promise<SignInResult> {
  const body = new URLSearchParams({ client_id: config.client_id, ...fields });
  // NO client_secret. A public client that sent one would be publishing it.
  let answer: Response;
  try {
    answer = await fetch(config.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (error) {
    return { ok: false, error: `cannot reach the sign-in service: ${String(error)}` };
  }
  const payload = await answer.json().catch(() => null) as
    Record<string, unknown> | null;
  if (!answer.ok || !payload) {
    const detail = payload
      ? String(payload.error_description || payload.error || answer.status)
      : `HTTP ${answer.status}`;
    return { ok: false, error: detail };
  }
  return {
    ok: true,
    token: String(payload.access_token || ""),
    refresh_token: payload.refresh_token ? String(payload.refresh_token) : undefined,
    expires_in: Number(payload.expires_in || 0) || undefined,
  };
}

/** Where to send somebody to end the session at the IdP, if it offers one. */
export function signOutUrl(config: AuthConfig): string {
  if (!config.end_session_endpoint) return "";
  const url = new URL(config.end_session_endpoint);
  url.searchParams.set("post_logout_redirect_uri", redirectUri());
  url.searchParams.set("client_id", config.client_id);
  return url.toString();
}
