/**
 * MICRO-F-BUCKET-E-TILESET p.1 · Archive ▸ Files ▸ **Bucket**: what the bucket
 * the bridge is configured with holds (`GET /bucket/list`: the S3_* environment,
 * the same Heriverse uses — RustFS here, MinIO or S3 elsewhere; no secret ever
 * reaches the page), beside «Disco» and read the same way: folders (the
 * prefixes) first, name, size, date, the search and the type filter of the
 * disk (`files-browser.ts visibleEntries`). A choice of files → «Porta dentro
 * {n} file…»: the one door, the files passed as their `address` — they stay
 * in the bucket and the graph cites them so. A row dragged onto the Space is
 * the same door (`BUCKET_MIME`). No bucket, or one that does not answer, is
 * said in one line with where it is configured.
 *
 * The pure half (rows, steps of the path, the line of state) is read by
 * `check-bucket-view.mjs`; the DOM half takes its few needs from main.ts.
 */
import { KIND_FILTERS, visibleEntries, type BrowserEntry, type BrowserKind, type SortKey } from "./files-browser";

/** the drag of rows of the bucket: `[{address, name}]` */
export const BUCKET_MIME = "application/x-em-bucket-entries";

export interface BucketObject { key: string; name: string; size: number; modified: string | null; etag?: string; address: string }
export interface BucketAnswer {
  ok: boolean;
  configured?: boolean;
  reachable?: boolean;
  bucket?: string;
  endpoint?: string;
  base?: string;
  prefix?: string;
  folders?: string[];
  objects?: BucketObject[];
  next_token?: string | null;
  truncated?: boolean;
  scanned?: number;
  ms?: number;
  error?: string;
  where?: string;
}

/** a row of the bucket: a BrowserEntry (so the disk's filter and order read it)
 *  with its address; `path` is the key (a folder's ends with «/») */
export interface BucketEntry extends BrowserEntry { address: string; ext: string }

const leaf = (key: string): string => key.replace(/\/$/, "").split("/").pop() ?? key;

/** the rows of one or more pages: the folders, then the objects (no repeats) */
export function bucketEntries(pages: BucketAnswer[], bucket = ""): BucketEntry[] {
  const out: BucketEntry[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    for (const f of p.folders ?? []) {
      if (seen.has(f)) continue;
      seen.add(f);
      out.push({ path: f, name: leaf(f), type: "dir", size: 0, mtime: 0, ext: "", address: `s3://${p.bucket ?? bucket}/${f}` });
    }
    for (const o of p.objects ?? []) {
      if (seen.has(o.key)) continue;
      seen.add(o.key);
      const name = o.name || leaf(o.key);
      const m = /\.([^.]+)$/.exec(name);
      out.push({ path: o.key, name, type: "file", size: o.size, mtime: o.modified ? Date.parse(o.modified) || 0 : 0,
        ext: m ? m[1].toLowerCase() : "", address: o.address });
    }
  }
  return out;
}

/** the steps of a prefix, from the bucket's base: `[{label, prefix}]` */
export function bucketCrumbs(prefix: string, base = "", bucket = "bucket"): { label: string; prefix: string }[] {
  const out = [{ label: bucket, prefix: base }];
  const rest = prefix.startsWith(base) ? prefix.slice(base.length) : prefix;
  let at = base;
  for (const part of rest.split("/").filter(Boolean)) {
    at += `${part}/`;
    out.push({ label: part, prefix: at });
  }
  return out;
}

/** the prefix one level up (never above the base) */
export function bucketUp(prefix: string, base = ""): string {
  if (!prefix || prefix === base) return base;
  const parts = prefix.replace(/\/$/, "").split("/");
  parts.pop();
  const up = parts.length ? `${parts.join("/")}/` : "";
  return up.length < base.length ? base : up;
}

type T = (key: string, vars?: Record<string, string | number>) => string;

/** the line that says why there is no list (null when there is one) */
export function bucketRefusal(a: BucketAnswer | null, t: T): string | null {
  if (!a) return t("bucket.bridgeDown");
  if (a.ok) return null;
  // where it is configured, in the page's language (the bridge's own words in the tooltip)
  if (a.configured === false) return t("bucket.none", { where: t("bucket.where") });
  return t("bucket.unreachable", { bucket: a.bucket ?? "", endpoint: a.endpoint ?? "", why: a.error ?? "", where: t("bucket.where") });
}

/** what the foot of the list says: folders, objects, pages, the time */
export function bucketStatus(pages: BucketAnswer[], shown: number, t: T): string {
  const folders = pages.reduce((s, p) => s + (p.folders?.length ?? 0), 0);
  const objects = pages.reduce((s, p) => s + (p.objects?.length ?? 0), 0);
  const ms = pages.reduce((s, p) => s + (p.ms ?? 0), 0);
  const more = pages.length && pages[pages.length - 1].next_token ? ` · ${t("bucket.more")}` : "";
  return t("bucket.status", { folders, objects, shown, pages: pages.length, ms: Math.round(ms) }) + more;
}

export function bucketBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

// ── the DOM half ────────────────────────────────────────────────────────────

export interface BucketDeps {
  t: T;
  bridge(): Promise<string>;
  /** «Porta dentro…» with these files (addresses); false when no graph is open */
  door: ((files: { address: string; name: string }[]) => void) | null;
  /** a Disk-like kind label */
  kindLabel(k: BrowserKind | "all"): string;
}

interface BucketState {
  prefix: string | null;
  query: string;
  search: string;
  kind: BrowserKind | "all";
  sort: SortKey;
  desc: boolean;
  pages: BucketAnswer[];
  chosen: string[];
  anchor: string | null;
  loading: boolean;
  refusal: string | null;
  refusalWhy: string;
}
const states = new Map<string, BucketState>();
const stateOf = (id: string): BucketState => {
  let s = states.get(id);
  if (!s) {
    s = { prefix: null, query: "", search: "", kind: "all", sort: "name", desc: false, pages: [], chosen: [], anchor: null, loading: false, refusal: null, refusalWhy: "" };
    states.set(id, s);
  }
  return s;
};

/** the page's hook (tests): what a bucket view of a window holds now */
export function bucketViewState(winId: string): { prefix: string | null; chosen: string[]; pages: number; rows: number; refusal: string | null } {
  const s = stateOf(winId);
  return { prefix: s.prefix, chosen: [...s.chosen], pages: s.pages.length, rows: bucketEntries(s.pages).length, refusal: s.refusal };
}

const asked = new Map<string, number>();
async function load(winId: string, deps: BucketDeps, more: boolean): Promise<void> {
  const s = stateOf(winId);
  // the last question asked is the one answered (a folder left while it was read)
  const seq = (asked.get(winId) ?? 0) + 1;
  asked.set(winId, seq);
  const last = s.pages[s.pages.length - 1];
  const q = new URLSearchParams({ prefix: s.prefix ?? "", limit: "500" });
  if (s.search) q.set("q", s.search);
  if (more && last?.next_token) q.set("token", last.next_token);
  s.loading = true;
  let a: BucketAnswer | null = null;
  try {
    const base = await deps.bridge();
    a = await fetch(`${base}/bucket/list?${q}`).then((r) => r.json() as Promise<BucketAnswer>);
  } catch { a = null; }
  if (asked.get(winId) !== seq) return;
  s.loading = false;
  s.refusal = bucketRefusal(a, deps.t);
  s.refusalWhy = a && !a.ok ? [a.error, a.where].filter(Boolean).join(" — ") : "";
  if (!a?.ok) { if (!more) s.pages = []; return; }
  if (s.prefix === null) s.prefix = a.prefix ?? a.base ?? "";
  s.pages = more ? [...s.pages, a] : [a];
}

/** one box per window, KEPT across the window's repaints (as the Queue's): an
 *  answer that arrives after a repaint paints the box that is in the page */
const boxes = new Map<string, { box: HTMLElement; deps: BucketDeps; paint(): void }>();

/** Archive ▸ Files ▸ Bucket, for one window */
export function bucketView(winId: string, deps: BucketDeps): HTMLElement {
  const kept = boxes.get(winId);
  if (kept) { kept.deps = deps; kept.paint(); return kept.box; }
  const s = stateOf(winId);
  const box = document.createElement("div");
  const entry = { box, deps, paint: (): void => {} };
  boxes.set(winId, entry);
  box.className = "bucket-view";
  box.dataset.bucketView = winId;
  const paint = (): void => {
    const { t } = entry.deps;
    deps = entry.deps;
    box.textContent = "";
    const first = s.pages[0];
    // the head: where (bucket › prefix), ↑, the search, the kind
    const head = document.createElement("div");
    head.className = "bucket-head";
    const up = document.createElement("button");
    up.type = "button"; up.className = "win-act"; up.textContent = "↑"; up.title = t("storage.up");
    up.dataset.bucketUp = "1";
    up.disabled = !first || (s.prefix ?? "") === (first.base ?? "");
    up.onclick = () => go(bucketUp(s.prefix ?? "", first?.base ?? ""));
    const crumb = document.createElement("span");
    crumb.className = "bucket-crumb";
    if (first) for (const [i, c] of bucketCrumbs(s.prefix ?? "", first.base ?? "", first.bucket ?? "bucket").entries()) {
      if (i) crumb.append(" › ");
      const a = document.createElement("a");
      a.href = "#"; a.textContent = c.label; a.dataset.bucketCrumb = c.prefix;
      a.onclick = (e) => { e.preventDefault(); go(c.prefix); };
      crumb.appendChild(a);
    }
    const qIn = document.createElement("input");
    qIn.type = "search"; qIn.className = "bucket-search"; qIn.dataset.bucketSearch = "1";
    qIn.placeholder = t("bucket.searchPh"); qIn.value = s.search || s.query;
    qIn.title = t("bucket.searchHint");
    qIn.oninput = () => { s.query = qIn.value; if (!qIn.value && s.search) { s.search = ""; void reload(); return; } paintRows(); };
    qIn.onkeydown = (e) => { if (e.key === "Enter") { s.search = qIn.value.trim(); s.query = ""; s.pages = []; void reload(); } };
    const kSel = document.createElement("select");
    kSel.dataset.bucketKind = "1";
    for (const k of KIND_FILTERS) { const o = document.createElement("option"); o.value = k; o.textContent = deps.kindLabel(k); o.selected = k === s.kind; kSel.appendChild(o); }
    kSel.onchange = () => { s.kind = kSel.value as BrowserKind | "all"; paintRows(); };
    const again = document.createElement("button");
    again.type = "button"; again.className = "win-act"; again.textContent = "⟳"; again.title = t("bucket.reload");
    again.onclick = () => void reload();
    head.append(up, crumb, qIn, kSel, again);
    box.appendChild(head);
    if (s.refusal) {
      const r = document.createElement("div");
      r.className = "bucket-refusal storage-empty";
      r.dataset.bucketRefusal = "1";
      r.textContent = s.refusal;
      r.title = s.refusalWhy;
      box.appendChild(r);
      return;
    }
    if (s.search) {
      const said = document.createElement("div");
      said.className = "bucket-said";
      said.dataset.bucketSearching = s.search;
      said.textContent = t("bucket.searching", { q: s.search, prefix: s.prefix || "/" });
      box.appendChild(said);
    }
    const table = document.createElement("table");
    table.className = "bucket-table";
    const hr = document.createElement("tr");
    for (const [k, label] of [["name", t("bucket.col.name")], ["size", t("bucket.col.size")], ["date", t("bucket.col.date")]] as const) {
      const th = document.createElement("th");
      th.textContent = label + (s.sort === k ? (s.desc ? " ▾" : " ▴") : "");
      th.dataset.bucketSort = k;
      th.onclick = () => { if (s.sort === k) s.desc = !s.desc; else { s.sort = k; s.desc = false; } paintRows(); };
      hr.appendChild(th);
    }
    const thead = document.createElement("thead"); thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    table.append(thead, tbody);
    const wrap = document.createElement("div");
    wrap.className = "bucket-list";
    wrap.appendChild(table);
    box.appendChild(wrap);
    const foot = document.createElement("div");
    foot.className = "bucket-foot";
    box.appendChild(foot);
    const paintRowsInner = (): void => {
      tbody.textContent = "";
      const rows = visibleEntries(bucketEntries(s.pages), { query: s.search ? "" : s.query, kind: s.kind, sort: s.sort, desc: s.desc });
      const files = rows.filter((r) => r.type === "file");
      for (const e of rows) {
        const tr = document.createElement("tr");
        tr.dataset.bucketRow = e.path;
        tr.dataset.type = e.type;
        tr.className = s.chosen.includes(e.path) ? "chosen" : "";
        const n = document.createElement("td");
        n.className = "fn";
        n.textContent = `${e.type === "dir" ? "📁 " : ""}${s.search && e.type === "file" ? e.path : e.name}`;
        n.title = e.address;
        const z = document.createElement("td"); z.textContent = e.type === "file" ? bucketBytes(e.size) : "";
        const d = document.createElement("td"); d.textContent = e.mtime ? new Date(e.mtime).toLocaleString() : "";
        tr.append(n, z, d);
        if (e.type === "dir") tr.onclick = () => go(e.path);
        else {
          tr.onclick = (ev) => {
            if (ev.shiftKey && s.anchor) {
              const i = files.findIndex((f) => f.path === s.anchor), j = files.findIndex((f) => f.path === e.path);
              const [a, b] = i < j ? [i, j] : [j, i];
              s.chosen = [...new Set([...s.chosen, ...files.slice(a, b + 1).map((f) => f.path)])];
            } else if (ev.metaKey || ev.ctrlKey) {
              s.chosen = s.chosen.includes(e.path) ? s.chosen.filter((x) => x !== e.path) : [...s.chosen, e.path];
              s.anchor = e.path;
            } else { s.chosen = s.chosen.length === 1 && s.chosen[0] === e.path ? [] : [e.path]; s.anchor = e.path; }
            paintRows();
          };
          tr.draggable = true;
          tr.addEventListener("dragstart", (ev) => {
            const all = bucketEntries(s.pages);
            const keys = s.chosen.includes(e.path) ? s.chosen : [e.path];
            const list = keys.map((k) => all.find((x) => x.path === k)).filter((x): x is BucketEntry => !!x)
              .map((x) => ({ address: x.address, name: x.name }));
            ev.dataTransfer?.setData(BUCKET_MIME, JSON.stringify(list));
            ev.dataTransfer?.setData("text/plain", list.map((x) => x.address).join("\n"));
            if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "copy";
          });
        }
        tbody.appendChild(tr);
      }
      // the foot: the state, «more», the door with the choice
      foot.textContent = "";
      const line = document.createElement("span");
      line.className = "bucket-status";
      line.dataset.bucketStatus = "1";
      line.textContent = s.loading ? t("storage.loading") : bucketStatus(s.pages, rows.length, t);
      foot.appendChild(line);
      const last = s.pages[s.pages.length - 1];
      if (last?.next_token) {
        const more = document.createElement("button");
        more.type = "button"; more.className = "insp-btn"; more.dataset.bucketMore = "1";
        more.textContent = t("bucket.loadMore");
        more.onclick = () => { s.loading = true; paintRows(); void load(winId, entry.deps, true).then(paint); };
        foot.append(" ", more);
      }
      const all = bucketEntries(s.pages);
      const chosen = s.chosen.map((k) => all.find((x) => x.path === k)).filter((x): x is BucketEntry => !!x);
      const door = document.createElement("button");
      door.type = "button"; door.className = "primary"; door.dataset.action = "bucket-door";
      door.textContent = chosen.length > 1 ? t("door.menuN", { n: String(chosen.length) }) : t("door.menu");
      door.disabled = !chosen.length || !deps.door;
      door.title = !deps.door ? t("toast.openADocument") : !chosen.length ? t("bucket.chooseFirst") : t("bucket.doorHint");
      door.onclick = () => deps.door?.(chosen.map((x) => ({ address: x.address, name: x.name })));
      foot.append(" ", door);
    };
    paintRows = paintRowsInner;
    paintRowsInner();
  };
  let paintRows = (): void => {};
  entry.paint = paint;
  const reload = async (): Promise<void> => { s.chosen = []; s.loading = true; paint(); await load(winId, entry.deps, false); paint(); };
  // another folder: its rows only, never the last folder's under the new path
  const go = (prefix: string): void => { s.prefix = prefix; s.search = ""; s.query = ""; s.pages = []; void reload(); };
  if (!s.pages.length && !s.refusal) void reload();
  else paint();
  return box;
}
