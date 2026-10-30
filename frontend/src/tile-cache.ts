/**
 * MICRO-OTTIMIZZA-3 · the tiles do not come again at every return (E.D.'s
 * MICRO). In memory the renderer's `lruCache` (an eighth of the machine,
 * `settings.ts`) lets the tiles out of view go; the browser's HTTP cache kept
 * a folder's for 60 s and a .3tz's almost never (206 answers, and the tiles
 * of an archive are asked under a base nobody serves). This is a cache ON
 * DISK, the browser's Cache Storage, under a ceiling in MB (the Preferences,
 * beside the tiles' memory), the least recently used going first:
 *
 *   · a tile of a `.3tz` read over HTTP: the key is the ARCHIVE's identity —
 *     its sha256 when the bridge has it from the DTC stamp (`ETag:
 *     "sha256-…"`) or the URL is content-addressed (a room's store), else its
 *     URL and `ETag` (mtime + size: a file rewritten is another archive) —
 *     and the tile's path; asked again, it costs no request;
 *   · a file of a FOLDER tileset: its URL, kept with its `ETag` and the
 *     freshness its `Cache-Control` gives (the bridge: 60 s for a folder being
 *     worked on); stale, a `HEAD` revalidates it (a simple request: no CORS
 *     preflight, no body) and the bytes come from here when the ETag is the same.
 *
 * A file on this machine (a drop, `Blob.slice`) is not kept: the disk is
 * already where it is. Where there is no Cache Storage (an insecure context)
 * the cache is off and everything goes as before.
 *
 * The order of use is kept in one entry of the same cache (`INDEX_KEY`), saved
 * a few seconds after a change; at the first use it is reconciled with what
 * the cache holds (an entry the index does not know — another window's — is
 * dropped, an index row whose entry is gone too).
 */

/** the ceiling's default, MB (the Preferences say otherwise) */
export const TILE_CACHE_MB = 1024;
const MB = 1024 * 1024;
const INDEX_KEY = "\u0000index";
const SAVE_AFTER_MS = 3000;

/** where the bytes are kept: the browser's Cache Storage, or memory (the checks) */
export interface TileStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

export function cacheStorageStore(name = "em-tiles-v1"): TileStore | null {
  if (typeof caches === "undefined") return null;
  const req = (key: string) => new Request(`https://em-tiles.invalid/${encodeURIComponent(key)}`);
  let open: Promise<Cache> | null = null;
  const c = () => (open ??= caches.open(name));
  return {
    async get(key) {
      const r = await (await c()).match(req(key));
      return r ? new Uint8Array(await r.arrayBuffer()) : null;
    },
    async put(key, bytes) {
      await (await c()).put(req(key), new Response(bytes as BodyInit, { headers: { "Content-Type": "application/octet-stream" } }));
    },
    async delete(key) { await (await c()).delete(req(key)); },
    async keys() {
      return (await (await c()).keys()).map((r) => decodeURIComponent(new URL(r.url).pathname.slice(1)));
    },
    async clear() { open = null; await caches.delete(name); },
  };
}

export function memoryStore(): TileStore & { map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>();
  return {
    map,
    get: async (k) => map.get(k)?.slice() ?? null,
    put: async (k, b) => { map.set(k, b.slice()); },
    delete: async (k) => { map.delete(k); },
    keys: async () => [...map.keys()],
    clear: async () => { map.clear(); },
  };
}

/** a row of the index: the bytes it holds, until when it is fresh (ms since
 *  the epoch; 0 = revalidate), the validator it was kept with */
interface Row { bytes: number; fresh: number; etag?: string }

export class TileCache {
  /** the order of use: the least recent first (a Map keeps insertion order) */
  private rows = new Map<string, Row>();
  private total = 0;
  private maxBytes: number;
  private ready: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  hits = 0;
  misses = 0;
  evicted = 0;

  constructor(private store: TileStore | null, opts: { maxMB?: number } = {}) {
    this.maxBytes = Math.max(0, opts.maxMB ?? TILE_CACHE_MB) * MB;
  }

  get enabled(): boolean { return !!this.store && this.maxBytes > 0; }

  /** the Preferences' ceiling; lowered, the least used go at once */
  setCeilingMB(mb: number): void {
    this.maxBytes = Math.max(0, Number(mb) || 0) * MB;
    // not opened yet (the boot sets it): the first use reads the index and evicts
    if (this.store && this.ready) void this.ready.then(() => this.evict());
  }

  private init(): Promise<void> {
    return (this.ready ??= (async () => {
      const store = this.store!;
      let saved: Array<[string, number, number, string?]> = [];
      try {
        const raw = await store.get(INDEX_KEY);
        if (raw) saved = JSON.parse(new TextDecoder().decode(raw));
      } catch { saved = []; }
      const held = new Set(await store.keys().catch(() => [] as string[]));
      for (const [k, bytes, fresh, etag] of saved) {
        if (!held.has(k)) continue;
        this.rows.set(k, { bytes, fresh, ...(etag ? { etag } : {}) });
        this.total += bytes;
        held.delete(k);
      }
      held.delete(INDEX_KEY);
      // what the index does not know (another window wrote it): let go
      await Promise.all([...held].map((k) => store.delete(k).catch(() => undefined)));
      if (typeof addEventListener === "function") {
        addEventListener("pagehide", () => { void this.flush(); });
      }
      // a ceiling lowered while the cache was closed
      this.evict();
    })());
  }

  /** the row of `key` (its validator, its freshness), or undefined */
  async row(key: string): Promise<Readonly<Row> | undefined> {
    if (!this.enabled) return undefined;
    await this.init();
    return this.rows.get(key);
  }

  async get(key: string): Promise<Uint8Array | null> {
    if (!this.enabled) return null;
    await this.init();
    const row = this.rows.get(key);
    if (!row) { this.misses++; return null; }
    const bytes = await this.store!.get(key).catch(() => null);
    if (!bytes) {
      // the browser let it go (its own pressure): the row goes too
      this.rows.delete(key); this.total -= row.bytes; this.misses++; this.save();
      return null;
    }
    this.rows.delete(key); this.rows.set(key, row);     // the most recent now
    this.hits++;
    this.save();
    return bytes;
  }

  /** a row still good: fresh again until `fresh` */
  async refresh(key: string, fresh: number): Promise<void> {
    await this.init();
    const row = this.rows.get(key);
    if (row) { row.fresh = fresh; this.save(); }
  }

  async put(key: string, bytes: Uint8Array, meta: { fresh?: number; etag?: string } = {}): Promise<void> {
    // one tile over an eighth of the ceiling would push out too much for itself
    if (!this.enabled || bytes.byteLength > this.maxBytes / 8) return;
    await this.init();
    try {
      await this.store!.put(key, bytes);
    } catch {
      // the browser's quota: make room, and leave this one out
      this.evict(this.total * 0.75);
      return;
    }
    const old = this.rows.get(key);
    if (old) { this.rows.delete(key); this.total -= old.bytes; }
    this.rows.set(key, { bytes: bytes.byteLength, fresh: meta.fresh ?? 0, ...(meta.etag ? { etag: meta.etag } : {}) });
    this.total += bytes.byteLength;
    if (this.total > this.maxBytes) this.evict();
    this.save();
  }

  /** the least recently used go, down to 90 % of the ceiling (or `to`) */
  private evict(to = this.maxBytes * 0.9): void {
    if (this.total <= this.maxBytes && to >= this.maxBytes * 0.9) return;
    const gone: string[] = [];
    for (const [k, row] of this.rows) {
      if (this.total <= to) break;
      gone.push(k);
      this.total -= row.bytes;
    }
    for (const k of gone) this.rows.delete(k);
    this.evicted += gone.length;
    if (gone.length) {
      void Promise.all(gone.map((k) => this.store!.delete(k).catch(() => undefined)));
      this.save();
    }
  }

  private save(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, SAVE_AFTER_MS);
  }

  /** the index, written now */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.store || !this.ready) return;
    await this.ready;
    const rows = [...this.rows].map(([k, r]) => (r.etag ? [k, r.bytes, r.fresh, r.etag] : [k, r.bytes, r.fresh]));
    await this.store.put(INDEX_KEY, new TextEncoder().encode(JSON.stringify(rows))).catch(() => undefined);
  }

  /** «Svuota la cache delle tile» */
  async clear(): Promise<void> {
    if (!this.store) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.store.clear();
    this.rows.clear();
    this.total = 0;
    this.ready = Promise.resolve();
  }

  async stats(): Promise<{ enabled: boolean; entries: number; bytes: number; maxBytes: number; hits: number; misses: number; evicted: number }> {
    if (this.store) await this.init();
    return { enabled: this.enabled, entries: this.rows.size, bytes: this.total, maxBytes: this.maxBytes,
             hits: this.hits, misses: this.misses, evicted: this.evicted };
  }
}

/** The page's one cache — on `globalThis`, so the main bundle (the
 *  Preferences) and the lazy tiles bundle share it. */
export function tileCache(): TileCache {
  const g = globalThis as { __EM_TILE_CACHE__?: TileCache };
  return (g.__EM_TILE_CACHE__ ??= new TileCache(cacheStorageStore()));
}

/** Until when an answer is fresh, from its `Cache-Control`; null: not to keep. */
export function freshUntil(headers: Headers, now = Date.now()): number | null {
  const cc = (headers.get("cache-control") ?? "").toLowerCase();
  if (/\bno-store\b/.test(cc)) return null;
  if (/\bimmutable\b/.test(cc)) return now + 365 * 86400_000;
  if (/\bno-cache\b/.test(cc)) return 0;
  const m = /\bmax-age=(\d+)/.exec(cc);
  return m ? now + Number(m[1]) * 1000 : 0;
}

/** The identity of an archive read over HTTP, for the keys of its tiles; null
 *  when it has none to trust (no validator) or is a file on this machine. */
export function archiveIdentity(d: { kind: string; ranges: boolean | null; url?: string; etag?: string | null }): string | null {
  // a server without Range sent it whole: the next opening downloads it whole
  // again, and the tiles are sliced from it — nothing to gain from keeping them
  if (d.kind !== "http" || d.ranges === false) return null;
  const sha = /sha256(?::|%3A|-)([0-9a-f]{64})/i.exec(d.url ?? "");
  if (sha) return `sha256:${sha[1].toLowerCase()}`;
  const et = d.etag ?? "";
  const stamped = /^"sha256-([0-9a-f]{64})"$/.exec(et);
  if (stamped) return `sha256:${stamped[1]}`;
  return et ? `${d.url}#${et}` : null;
}

/**
 * The 3DTilesRendererJS plugin for a FOLDER tileset's files over HTTP: fresh,
 * from the cache with no request; stale, a `HEAD` and the cache when its
 * `ETag` is the one kept; otherwise the network (its bytes kept when they come
 * with an `ETag`). Registered after the archive's plugin (whose URLs it leaves
 * alone) and before the room's road, whose signed fetch it is handed.
 */
export class TileCachePlugin {
  readonly name = "EM_TILE_CACHE";
  hits = 0;
  revalidated = 0;
  constructor(readonly cache: TileCache, private fetchFn: (url: string, init?: RequestInit) => Promise<Response>) {}

  fetchData(url: string, options?: RequestInit): Promise<Response> | null {
    if (!this.cache.enabled || !/^https?:/i.test(url) || url.includes("/__3tz__/")) return null;
    if (options?.method && options.method !== "GET") return null;
    return (async () => {
      const key = `f ${url}`;
      const row = await this.cache.row(key);
      if (row?.etag) {
        let good = row.fresh > Date.now();
        if (!good) {
          this.revalidated++;
          const h = await this.fetchFn(url, { ...options, method: "HEAD" }).catch(() => null);
          good = !!h?.ok && h.headers.get("etag") === row.etag;
          const fresh = good ? freshUntil(h!.headers) : null;
          if (good && fresh !== null) void this.cache.refresh(key, fresh);
        }
        const bytes = good ? await this.cache.get(key) : null;
        if (bytes) { this.hits++; return new Response(bytes as BodyInit, { status: 200 }); }
      }
      const r = await this.fetchFn(url, options);
      const etag = r.headers.get("etag");
      const fresh = freshUntil(r.headers);
      if (r.status !== 200 || !etag || fresh === null) return r;
      const bytes = new Uint8Array(await r.arrayBuffer());
      void this.cache.put(key, bytes, { etag, fresh });
      return new Response(bytes as BodyInit, { status: 200, headers: { "Content-Type": r.headers.get("content-type") ?? "application/octet-stream" } });
    })();
  }
}
