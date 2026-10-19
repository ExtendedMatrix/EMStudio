/**
 * MICRO-DOVE-CHI-MENU p.7 · CHECK FOR UPDATES (desktop only).
 *
 * E.D. (19 Oct 2026): «Check for updates…» did nothing. It now asks GitHub for
 * the newest release of the CHANNEL the installed version belongs to, and
 * compares:
 *
 * - a `-dev.N` build is on the dev channel: every published release counts,
 *   dev or stable (a stable 1.6.0 is newer than 1.6.0-dev.99);
 * - a stable build is on the stable channel: pre-releases do not count;
 * - drafts never count (they are not published).
 *
 * Newer → its version and the release page («Download»), and «Install and
 * restart» when the release carries a signed update (`latest.json`, see
 * main.rs `update_install`). Not newer → «You have the latest version». No
 * network → it says so.
 */

export const RELEASES_REPO = "ExtendedMatrix/EMStudio";
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases`;
const RELEASES_API = `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=30`;

export type Channel = "dev" | "stable";

export interface ReleaseInfo {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets?: Array<{ name: string }>;
}

export type UpdateCheck =
  | { kind: "newer"; version: string; tag: string; url: string; installable: boolean; channel: Channel }
  | { kind: "current"; version: string; channel: Channel }
  | { kind: "offline"; why: string };

interface Parsed { core: [number, number, number]; pre: Array<string | number> }

function parse(v: string): Parsed | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim());
  if (!m) return null;
  const pre = m[4] ? m[4].split(".").map((x) => (/^\d+$/.test(x) ? Number(x) : x)) : [];
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre };
}

/** Semver order: <0, 0, >0. `1.6.0-dev.51` > `1.6.0-dev.50`; `1.6.0` > `1.6.0-dev.99`. */
export function compareVersions(a: string, b: string): number {
  const x = parse(a), y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? -1 : 0) + (y.pre.length ? 1 : 0);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p - q;
    if (typeof p === "number") return -1;
    if (typeof q === "number") return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

export function channelOf(version: string): Channel {
  return parse(version)?.pre.length ? "dev" : "stable";
}

/** The newest release of the channel, or null when the channel has none. */
export function pickLatest(releases: ReleaseInfo[], channel: Channel): ReleaseInfo | null {
  let best: ReleaseInfo | null = null;
  for (const r of releases) {
    if (r.draft || !parse(r.tag_name)) continue;
    if (channel === "stable" && (r.prerelease || channelOf(r.tag_name) === "dev")) continue;
    if (!best || compareVersions(r.tag_name, best.tag_name) > 0) best = r;
  }
  return best;
}

/** What the installed `current` is, against the releases GitHub lists. */
export function judge(current: string, releases: ReleaseInfo[]): UpdateCheck {
  const channel = channelOf(current);
  const latest = pickLatest(releases, channel);
  if (!latest || compareVersions(latest.tag_name, current) <= 0) return { kind: "current", version: current, channel };
  return {
    kind: "newer", version: latest.tag_name.replace(/^v/, ""), tag: latest.tag_name, url: latest.html_url, channel,
    installable: (latest.assets ?? []).some((a) => a.name === "latest.json"),
  };
}

/** Ask GitHub. `fetchFn` is the page's `fetch` (a probe passes its own). */
export async function checkForUpdates(current: string, fetchFn: typeof fetch = fetch): Promise<UpdateCheck> {
  let res: Response;
  try {
    res = await fetchFn(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
  } catch (error) {
    return { kind: "offline", why: String((error as Error)?.message ?? error) };
  }
  if (!res.ok) return { kind: "offline", why: `GitHub ${res.status}` };
  try {
    return judge(current, await res.json() as ReleaseInfo[]);
  } catch (error) {
    return { kind: "offline", why: String((error as Error)?.message ?? error) };
  }
}
