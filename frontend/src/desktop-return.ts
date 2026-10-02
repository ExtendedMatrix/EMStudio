/**
 * ENTRARE DAL DESKTOP · where a sign-in started from the desktop comes back.
 *
 * The desktop's page is served by its shell (`tauri://localhost`,
 * `http://tauri.localhost`), which no identity provider will ever accept as a
 * redirect. So the sign-in opens in the SYSTEM browser and the answer comes back
 * to the app on its own private scheme — the reverse-DNS of its identifier
 * (RFC 8252 §7.1), never `stratigraph://`, which is the ecosystem's handoff
 * scheme and shared by several tools:
 *
 *   - **ORCID** (`orcid-signin.ts`, implicit flow) returns to the public page
 *     `https://extendedmatrix.org/orcid/callback/` — the redirect registered for
 *     the client, since ORCID accepts only https on a registered domain — and
 *     the page jumps to `org.extendedmatrix.emstudio:/orcid-return#id_token=…`.
 *   - **A node** (`oidc.ts`, code + PKCE) returns STRAIGHT to
 *     `org.extendedmatrix.emstudio:/oidc-return?code=…&state=…`: Keycloak
 *     accepts a private-use scheme (measured on 24.0.4, 3 Oct 2026), and a
 *     detour through a page on the internet would close the node's password —
 *     the way in WITHOUT internet — exactly where it is needed.
 *
 * When the scheme does not open (not registered on that machine, a browser that
 * asks first and was told no), the answer is PASTED: the page shows it as a code,
 * and the same reader takes the text. Nothing here verifies anything — that is
 * `completeOrcidSignIn` and `completeSignIn`, each with the nonce, the state and
 * the verifier only this window holds.
 */

/** The app's own scheme (`tauri.conf.json`, plugins › deep-link). */
export const APP_SCHEME = "org.extendedmatrix.emstudio:";
/** ORCID's redirect for the desktop: the page registered for the client. */
export const ORCID_DESKTOP_RETURN = "https://extendedmatrix.org/orcid/callback/";
/** A node's redirect for the desktop (`em-console` must list it). */
export const NODE_DESKTOP_RETURN = `${APP_SCHEME}/oidc-return`;

export type DesktopReturn =
  | { kind: "orcid"; hash: string }
  | { kind: "node"; search: string };

/** Is this URL one of OUR answers (and not a `stratigraph://` handoff)? */
export function isAppReturn(url: string): boolean {
  return url.trim().toLowerCase().startsWith(APP_SCHEME);
}

/**
 * Read an answer: the deep link the OS delivered, or what a person pasted —
 * the code the page shows (`#id_token=…&state=…`), the whole deep link, the
 * page's own address with its fragment, or a node's return with its query.
 * `null` when it is none of them.
 */
export function readReturn(text: string): DesktopReturn | null {
  const raw = text.trim().replace(/^["'<\s]+|["'>\s]+$/g, "");
  if (!raw) return null;
  const hashAt = raw.indexOf("#");
  const queryAt = raw.indexOf("?");
  const fragment = hashAt >= 0 ? raw.slice(hashAt + 1) : "";
  const query = queryAt >= 0 ? raw.slice(queryAt + 1, hashAt > queryAt ? hashAt : undefined) : "";
  const has = (s: string, key: string) => new RegExp(`(^|&)${key}=`).test(s);
  // the deep links, by their path
  if (isAppReturn(raw)) {
    const path = raw.slice(APP_SCHEME.length).replace(/^\/+/, "/").split(/[?#]/)[0];
    if (path === "/orcid-return" && (has(fragment, "id_token") || has(fragment, "error"))) return { kind: "orcid", hash: `#${fragment}` };
    if (path === "/oidc-return" && (has(query, "code") || has(query, "error"))) return { kind: "node", search: `?${query}` };
    return null;
  }
  // pasted: ORCID's answer is a fragment with an id_token (or an error)…
  if (has(fragment, "id_token") || (has(fragment, "error") && !has(query, "code"))) return { kind: "orcid", hash: `#${fragment}` };
  // …a node's is a query with a code (or an error)
  if (has(query, "code") || has(query, "error")) return { kind: "node", search: `?${query}` };
  // the bare parameters, with neither sign in front
  if (hashAt < 0 && queryAt < 0) {
    if (has(raw, "id_token")) return { kind: "orcid", hash: `#${raw}` };
    if (has(raw, "code") && has(raw, "state")) return { kind: "node", search: `?${raw}` };
  }
  return null;
}
