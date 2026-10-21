// MICRO-PERCORSI-WINDOWS (21 Oct 2026) · ONE module for the paths of files.
//
// Measured on dev.55: Templu Mare v4 opened on Windows showed no 3D model,
// while on the Mac every one. Its locators are relative to the em.json
// (`../RB/versions/x.glb`), and the folder of `C:\Users\…\EM\x.em.json` was
// cut and joined with `/` in a dozen places: `C:\Users\…\EM\` + `../RB/…`,
// split on `/`, is ONE segment followed by `..` — the `..` ate the whole
// folder and the scene asked the bridge for `/SB/versions/x.glb` (0 of 97
// models resolved; 97 of 97 with a Mac path).
//
// The rule now: inside the app a path is POSIX-shaped — `/` as separator,
// also on Windows (`C:/Users/…`, `//server/share/…`) — and every cut, join and
// test of a file path goes through here. The native side turns it back
// (`toNative`, at the Tauri boundary; the bridge's Python reads `C:/…` as it
// is). `check-paths.mjs` tests these on Windows, UNC, spaces, accents, `@`,
// `#`, and refuses a new `lastIndexOf("/")` on a file path elsewhere.

/** `C:\x\y` → `C:/x/y`; `\\server\share` → `//server/share`; the verbatim
 *  prefixes (`\\?\C:\…`, `\\?\UNC\server\…`) dropped; a drive letter upper-case. */
export function toPosix(p: string): string {
  let s = String(p ?? "").replace(/\\/g, "/");
  s = s.replace(/^\/\/[?.]\/UNC\//i, "//").replace(/^\/\/[?.]\/(?=[A-Za-z]:)/, "");
  if (/^[a-z]:(\/|$)/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

/** a scheme (`https:`, `blend://`, `onedrive://`, `data:`), not a drive letter */
export const hasScheme = (p: string): boolean => /^[a-z][a-z0-9+.-]+:/i.test(String(p ?? ""));

const isUnc = (s: string): boolean => /^\/\/[^/]+\/[^/]+/.test(s);

/** the root of a path, POSIX-shaped: `/`, `C:/`, `//server/share/`, or `""` */
export function rootOf(p: string): string {
  const s = toPosix(p);
  if (isUnc(s)) { const m = /^\/\/[^/]+\/[^/]+/.exec(s)!; return `${m[0]}/`; }
  if (/^[A-Za-z]:(\/|$)/.test(s)) return `${s.slice(0, 2)}/`;
  if (s.startsWith("/")) return "/";
  return "";
}

/** absolute on some disk: POSIX, `C:\`, `C:/`, UNC (`~` is not: it is the
 *  bridge's to expand) */
export const isAbsolute = (p: string): boolean => rootOf(p) !== "";

/** `.` and `..` resolved, separators made one; never above the root. A
 *  relative path keeps its leading `..`; a trailing `/` (a folder) is kept. */
export function normalize(p: string): string {
  const s = toPosix(p);
  const root = rootOf(s);
  const rest = s.slice(Math.min(root.length, s.length)).replace(/^\/+/, "");
  const out: string[] = [];
  for (const seg of rest.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!root) out.push("..");
    } else out.push(seg);
  }
  const body = out.join("/");
  const slash = body && /\/$/.test(s) ? "/" : "";
  return root + body + slash;
}

/** the folder of a path: `C:/a/b.json` → `C:/a`, `C:/b.json` → `C:/`,
 *  `/b.json` → `/`, `b.json` → `""` */
export function dirname(p: string): string {
  const s = normalize(p).replace(/(.)\/$/, "$1");
  const root = rootOf(s);
  const i = s.lastIndexOf("/");
  if (s.length <= root.length || i < root.length) return root;
  return s.slice(0, i);
}

/** the last segment: the file's name (a folder's, with a trailing `/`) */
export function basename(p: string): string {
  const s = toPosix(p).replace(/\/+$/, "");
  return s.slice(s.lastIndexOf("/") + 1);
}

/** the name of what a locator or URL names, without `?…`/`#…`, decoded when
 *  it can be: what the eye reads in a list */
export function leafName(u: string): string {
  const s = basename(String(u ?? "").split(/[?#]/)[0]);
  try { return decodeURIComponent(s); } catch { return s; }
}

/** `a` then `b…`; an absolute part starts again from itself. An empty base
 *  joins nothing: `join("", "x.obj")` is `x.obj` (never `/x.obj`). */
export function join(a: string, ...parts: string[]): string {
  let acc = toPosix(a ?? "");
  for (const b0 of parts) {
    const b = toPosix(b0 ?? "");
    if (!b) continue;
    acc = isAbsolute(b) || !acc ? b : `${acc.replace(/\/+$/, "")}/${b}`;
  }
  return normalize(acc);
}

/** a locator of the document resolved on the disk: relative to the em.json's
 *  folder, an absolute one as it is (made POSIX). A scheme (`https:`,
 *  `blend://`) is not a path: returned untouched. No em.json path: the
 *  locator normalised, still relative. */
export function resolveRelative(emjsonPath: string | null | undefined, url: string): string {
  if (hasScheme(url) && !/^[A-Za-z]:/.test(url)) return url;
  if (!emjsonPath || isAbsolute(url)) return normalize(url);
  return join(dirname(emjsonPath), url);
}

/** case matters on POSIX disks, not on Windows' (a drive or a share) */
const sameSeg = (root: string) => (root === "/" ? (a: string, b: string) => a === b
  : (a: string, b: string) => a.toLowerCase() === b.toLowerCase());

/** an absolute path written relative to the em.json's folder (`../RB/x.glb`),
 *  as the document keeps it. Another disk (another drive, another share, a
 *  path without a root): the path itself, POSIX-shaped. */
export function relativeTo(emjsonPath: string, abs: string): string {
  const from = dirname(emjsonPath);
  const to = normalize(abs);
  const rf = rootOf(from), rt = rootOf(to);
  if (!rf || !rt || rf.toLowerCase() !== rt.toLowerCase()) return to;
  const eq = sameSeg(rf);
  const a = from.slice(rf.length).split("/").filter(Boolean);
  const b = to.slice(rt.length).split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && eq(a[i], b[i])) i++;
  const up = a.slice(i).map(() => "..");
  return [...up, ...b.slice(i)].join("/") + (/\/$/.test(to) && b.length > i ? "/" : "");
}

/** is `p` inside the folder `dir` (or `dir` itself)? Case as the disk's. */
export function isInside(dir: string, p: string): boolean {
  const d = normalize(dir).replace(/(.)\/$/, "$1"), s = normalize(p).replace(/(.)\/$/, "$1");
  const rd = rootOf(d);
  if (!rd || rd.toLowerCase() !== rootOf(s).toLowerCase()) return false;
  const eq = sameSeg(rd);
  if (eq(d, s)) return true;
  const pre = d.endsWith("/") ? d : `${d}/`;
  return s.length > pre.length && eq(s.slice(0, pre.length), pre);
}

/** a POSIX-shaped path as the platform writes it: a Windows one (a drive, a
 *  share) with `\`, any other as it is. For the native calls only. */
export function toNative(p: string): string {
  const s = toPosix(p);
  return /^[A-Za-z]:\//.test(s) || /^[A-Za-z]:$/.test(s) || isUnc(s) ? s.replace(/\//g, "\\") : s;
}

/** the bridge's `/fs/at/<path>` for an absolute path: each segment encoded; a
 *  drive stays first (`C%3A/Users/…`), a share is marked by its two
 *  backslashes (`%5C%5Cserver/share/…`), a POSIX path loses its first `/`
 *  (the bridge puts it back). */
export function fsAtPath(abs: string): string {
  const s = normalize(abs);
  const enc = (x: string) => x.split("/").map(encodeURIComponent).join("/");
  if (isUnc(s)) return `${encodeURIComponent("\\\\")}${enc(s.slice(2))}`;
  return enc(s.replace(/^\/+/, ""));
}
