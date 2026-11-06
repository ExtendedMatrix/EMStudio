// MICRO-MEMORIA-SESSIONE p.2 · the session kept (E.D., 30 Oct 2026, (c): «EMStudio
// che esaurisce la memoria … si ricarica e perde il grafo»). A WebView that falls
// reloads the page, and the page starts empty. Here: a SAFETY COPY of the session
// written often and lightly — which files are open (their path, their name, a room
// they belong to), the unsaved ones' content, the active graph, the selection and
// the view — and, at the next start, the decision whether to take it back.
//
// Where: IndexedDB (a study's em.json is megabytes: Templu Mare v6 2.7 MB, more
// than the 5 MB of localStorage leaves to everything else), one record per
// session; the heartbeat in localStorage (tiny, read before anything else).
// The decision is pure (`decideRestore`): `scripts/check-session-keep.mjs`.

/** one open file, as kept */
export interface KeptFile {
  path: string | null;
  name: string;
  /** unsaved when the copy was written: the content is kept, and comes back unsaved */
  dirty: boolean;
  /** a room's graph comes back by entering the room again, never from a copy */
  room?: { id: string; title: string; node: string } | null;
  /** the em.json container (text), when it cannot be read back from its path */
  text?: string | null;
}

export interface KeptSession {
  id: string;
  /** when the session started, and when this copy was written (ms) */
  started: number;
  at: number;
  files: KeptFile[];
  /** the graph in front, by its graph_id; the file it is in (index in `files`) */
  activeGraphId: string | null;
  activeFile: number | null;
  /** the node selected, and the canvas's view (matrix, graph…) */
  selected: string | null;
  view: string | null;
}

/** the heartbeat: which session is alive, its last sign of life, and whether it
 *  ended by itself with nothing unsaved */
export interface Beat { id: string; beat: number; clean: boolean }

export const BEAT_KEY = "emstudio.session.beat";

/** this page's session, alive: kept HERE, in a module evaluated before the
 *  page's body (a selection made while the page is still starting reads it) */
export const live = {
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  started: Date.now(),
  /** off until the copy of before is decided (and while it is taken back) */
  keeping: false,
  timer: null as number | null,
  firstWait: 0,
  /** the page went away with nothing unsaved: a copy still being written
   *  (the «hidden» before the «pagehide») must not undo that */
  closedClean: false,
  /** the text of each file's last copy, by the revisions it was made from */
  texts: new Map<string, { sig: string; text: string }>(),
};
/** a heartbeat every 5 s: a session whose last one is younger than this did not
 *  end, it fell (the WebView reloaded it) — taken back without asking */
export const BEAT_MS = 5_000;
export const FRESH_MS = 120_000;

/** what to do with the copy found at a start:
 *  - `auto`: the session fell a moment ago (its heart beat < 2 min ago) → back, said;
 *  - `ask`: an older session ended without saving → offered (Riprendi / Lascia);
 *  - `none`: it ended clean, or holds nothing to take back. */
export function decideRestore(rec: KeptSession | null, beat: Beat | null, now: number): "auto" | "ask" | "none" {
  if (!rec || !rec.files.length) return "none";
  const mine = beat && beat.id === rec.id ? beat : null;
  if (mine?.clean) return "none";
  const last = Math.max(rec.at, mine?.beat ?? 0);
  if (mine && now - last <= FRESH_MS) return "auto";
  return rec.files.some((f) => f.dirty) ? "ask" : "none";
}

/** a file's content goes into the copy when its path cannot give it back: it is
 *  unsaved, it has no path, or the page cannot read a path (a browser) */
export function keepsText(f: { path: string | null; dirty: boolean; room?: unknown }, canReadPaths: boolean): boolean {
  if (f.room) return false;
  return f.dirty || !f.path || !canReadPaths;
}

/** «14:32» of a copy */
export function clockOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** the copies to drop: all but the `keep` newest, never the live one */
export function staleIds(recs: Array<{ id: string; at: number }>, live: string, keep = 2): string[] {
  const others = recs.filter((r) => r.id !== live).sort((a, b) => b.at - a.at);
  return others.slice(keep).map((r) => r.id);
}

export function readBeat(): Beat | null {
  try {
    const v = JSON.parse(localStorage.getItem(BEAT_KEY) ?? "null") as Beat | null;
    return v && typeof v.id === "string" ? v : null;
  } catch {
    return null;
  }
}

export function writeBeat(b: Beat): void {
  try { localStorage.setItem(BEAT_KEY, JSON.stringify(b)); } catch { /* private mode: no heartbeat */ }
}

// ── IndexedDB ────────────────────────────────────────────────────────────────

const DB = "emstudio-session";
const STORE = "sessions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE, { keyPath: "id" }); };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const rq = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(rq.result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  }));
}

export const putKept = (rec: KeptSession): Promise<unknown> => tx("readwrite", (s) => s.put(rec));
export const allKept = (): Promise<KeptSession[]> => tx("readonly", (s) => s.getAll() as IDBRequest<KeptSession[]>);
export const dropKept = (id: string): Promise<unknown> => tx("readwrite", (s) => s.delete(id));
