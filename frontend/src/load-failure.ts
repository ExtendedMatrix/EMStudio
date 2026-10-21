/**
 * MICRO-WINDOWS-MODELLI p.1 · a model that does not come SAYS why.
 *
 * Measured on E.D.'s Windows (21 Oct 2026, dev.56): the Space drew nothing and
 * the Log said nothing about the models — a failed load left no trace. Every
 * load the Space and the Viewer give up on comes here once: the name, the URL
 * asked (the bridge's base included), the HTTP status or the error, and the
 * cause in words. The cause is read from the answer, never guessed:
 *
 *   - an HTTP status → what the bridge (or the node) meant by it;
 *   - no status (three's loaders, a tileset's root, a network error) → the URL
 *     is asked again with a HEAD, which the bridge serves for its byte routes;
 *   - no answer to that either → the bridge's `/health` at the same base: down
 *     (another port, not listening) or up and older than this page, or up and
 *     answering without CORS (the browser hides the status);
 *   - the bytes came and could not be read → decoding.
 *
 * Pure apart from the two probes, which are injected (`check-load-failure.mjs`).
 */

export type LoadCause =
  | "folder"       // 403 from the bridge: the file's folder is not served
  | "refused"      // 401/403 from a node: access
  | "missing"      // 404
  | "cloud-only"   // 409 from the bridge: in OneDrive, online only
  | "older"        // the bridge at that base is of an older level
  | "down"         // nothing answers at that base (the bridge on another port, not started)
  | "cors"         // the bridge answers, the browser hid the answer
  | "decode"       // the bytes came, the loader could not read them
  | "slow"         // it answers to a HEAD, its bytes did not arrive (a slow disk, OneDrive downloading it)
  | "http";        // another HTTP status

export interface LoadFailure {
  name: string;
  url: string;
  status: number | null;
  error: string | null;
  cause: LoadCause;
}

export interface Probes {
  /** HEAD the URL: its status, or null when nothing answered */
  head: (url: string) => Promise<number | null>;
  /** the bridge's `/health` at a base: its level, or null when nothing answered */
  health: (base: string) => Promise<{ bridge_level?: number } | null>;
  /** the level this page wants (`BRIDGE_LEVEL_WANTED`) */
  wanted: number;
}

/** The HTTP status an error carries: three's `HttpError` (`.response.status`),
 *  a road's `RoadError` (`.status`, 0 = no answer), a `Response`. */
export function statusOf(e: unknown): number | null {
  const x = e as { response?: { status?: unknown }; status?: unknown } | null;
  const s = typeof x?.response?.status === "number" ? x.response.status
    : typeof x?.status === "number" ? x.status : null;
  return s && s > 0 ? s : null;
}

/** The error in a line, for the Log. */
export function errorText(e: unknown): string | null {
  if (e == null) return null;
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 200);
  if (typeof e === "string") return e.slice(0, 200);
  const x = e as { type?: unknown; message?: unknown };
  if (typeof x.message === "string") return x.message.slice(0, 200);
  if (typeof x.type === "string") return `event: ${x.type}`;
  return String(e).slice(0, 200);
}

/** A network error (nothing answered, or the browser hid the answer), as
 *  opposed to bytes that came and could not be read. */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return /fetch|load failed|network|NetworkError/i.test(e.message) || !e.message;
  const x = e as { type?: unknown } | null;
  return x?.type === "error";    // an <img>'s / XHR's error event
}

/** Is this URL one of the bridge's byte routes? */
export function isBridgeFile(url: string): boolean {
  return /\/fs\/(at\/|file\b)/.test(url);
}

function baseOf(url: string): string | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
}

function causeOfStatus(status: number, bridge: boolean): LoadCause {
  if (status === 403 && bridge) return "folder";
  if (status === 401 || status === 403) return "refused";
  if (status === 404) return "missing";
  if (status === 409 && bridge) return "cloud-only";
  return "http";
}

/** Why the load of `url` failed, with `error` as the loader gave it. */
export async function diagnose(name: string, url: string, error: unknown, probes: Probes): Promise<LoadFailure> {
  const bridge = isBridgeFile(url);
  const base = baseOf(url);
  const out = (cause: LoadCause, status: number | null): LoadFailure =>
    ({ name, url, status, error: errorText(error), cause });
  const older = async (): Promise<boolean> => {
    if (!bridge || !base) return false;
    const h = await probes.health(base).catch(() => null);
    return !!h && (typeof h.bridge_level === "number" ? h.bridge_level : 0) < probes.wanted;
  };
  let status = statusOf(error);
  if (status == null && error != null && !isNetworkError(error)) {
    // the bytes came: a decoding error (a parse, a typed array, a format)
    return out("decode", null);
  }
  const silent = status == null;
  if (status == null && base) status = await probes.head(url).catch(() => null);
  if (status != null) {
    // there, and its bytes did not come: not a decoding (nothing was read)
    if (status >= 200 && status < 300) return out(silent ? "slow" : "decode", status);
    // an older bridge has neither the route nor the folder of the open em.json
    if ((status === 404 || status === 403) && await older()) return out("older", status);
    return out(causeOfStatus(status, bridge), status);
  }
  if (!base) return out("missing", null);
  const h = await probes.health(base).catch(() => null);
  if (!h) return out("down", null);
  if (bridge && (typeof h.bridge_level === "number" ? h.bridge_level : 0) < probes.wanted) return out("older", null);
  return out("cors", null);
}

/** One line per (url, cause) for a document: the Space redraws often, and the
 *  same failure is said once. `reset` when another document opens. */
export class FailureLog {
  private seen = new Set<string>();
  /** the failures by object key (`rm:<id>`, `proxy:<unit>`), for the Outliner */
  readonly byKey = new Map<string, LoadFailure>();
  /** true when this failure is new and should be written */
  note(key: string | null, f: LoadFailure): boolean {
    if (key) this.byKey.set(key, f);
    const k = `${f.url}\u0000${f.cause}`;
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    return true;
  }
  /** the object came after all: its mark goes */
  cleared(key: string): boolean { return this.byKey.delete(key); }
  reset(): void { this.seen.clear(); this.byKey.clear(); }
}
