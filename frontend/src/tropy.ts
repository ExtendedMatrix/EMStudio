/**
 * CATENA · a Tropy session (its JSON-LD export) on the shelf, and an item
 * promoted to a DOCUMENT with its selections as readings.
 *
 * Tropy exports items with their photos, each photo with its notes and its
 * SELECTIONS — rectangles in the photo's pixels, with notes of their own. On
 * the shelf a photo is a resource before it is a source (the shelf's rule).
 * «Promuovi a documento» makes the DocumentNode and turns every selection into
 * an extractor whose geometry is the selection's region, normalised (the
 * AnnotationRegion of the datamodel), the selection's note as its description.
 *
 * The parser is tolerant on purpose: Tropy's context has changed between
 * versions (plain keys vs compacted IRIs, `photo` vs `photos`), and an import
 * that refuses a file because a key moved loses a person's afternoon of notes.
 * It reads what it recognises and says how much it read.
 */
import type { DocumentStore } from "./model";
import type { EmNode } from "./types";
import { nextDocumentName, initialName, renameOnAttach } from "./naming";
import { setReadingGeometry } from "./paradata-chain";
import type { ShelfEntry } from "./shelf";

export interface TropySelection { id: string; rect: [number, number, number, number]; note: string }
export interface TropyPhoto {
  id: string; path: string; title: string; checksum?: string;
  width?: number; height?: number; notes: string[]; selections: TropySelection[];
}
export interface TropyItem { id: string; title: string; photos: TropyPhoto[] }

export const TROPY_KEY = "tropy";

type J = Record<string, unknown>;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
/** A key by its local name, whatever prefix or IRI the context compacted it to. */
function get(o: J, ...names: string[]): unknown {
  for (const k of Object.keys(o)) {
    const local = k.replace(/^.*[#/:]/, "").toLowerCase();
    if (names.includes(local)) return o[k];
  }
  return undefined;
}
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(" ");
  const o = v as J;
  return text(o["@value"] ?? get(o, "text", "value") ?? (typeof get(o, "html") === "string"
    ? String(get(o, "html")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""));
}
const num = (v: unknown): number | undefined => {
  const n = Number(text(v));
  return Number.isFinite(n) ? n : undefined;
};
const typeOf = (o: J): string => arr(o["@type"] ?? o.type).map(String).join(" ").toLowerCase();
const notesOf = (o: J): string[] => arr(get(o, "note", "notes")).map(text).filter(Boolean);

/** Parse a Tropy JSON-LD export into items → photos → selections. */
export function parseTropy(json: unknown): TropyItem[] {
  const root = json as J;
  const graph = arr(root?.["@graph"] ?? (Array.isArray(json) ? json : [json]));
  const items: TropyItem[] = [];
  let n = 0;
  for (const raw of graph) {
    const it = raw as J;
    if (!it || typeof it !== "object") continue;
    const photos = arr(get(it, "photo", "photos"));
    if (!photos.length && !typeOf(it).includes("item")) continue;
    const id = String(it["@id"] ?? get(it, "id") ?? `tropy:item/${++n}`);
    const title = text(get(it, "title")) || id;
    const ps: TropyPhoto[] = photos.map((rp, i) => {
      const p = rp as J;
      const w = num(get(p, "width"));
      const h = num(get(p, "height"));
      const path = text(get(p, "path", "url", "filename")) || "";
      const sels = arr(get(p, "selection", "selections")).map((rs, k) => {
        const s = rs as J;
        const x = num(get(s, "x")) ?? 0, y = num(get(s, "y")) ?? 0;
        const sw = num(get(s, "width")) ?? 0, sh = num(get(s, "height")) ?? 0;
        const W = w || 1, H = h || 1;
        const q = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
        return { id: String(s["@id"] ?? `${id}#p${i}s${k}`),
                 rect: [q(x / W), q(y / H), q(sw / W), q(sh / H)] as [number, number, number, number],
                 note: notesOf(s).join(" ") || text(get(s, "title")) };
      }).filter((s) => s.rect[2] > 0 && s.rect[3] > 0);
      return { id: String(p["@id"] ?? `${id}#p${i}`), path, title: text(get(p, "title")) || title,
               ...(text(get(p, "checksum")) ? { checksum: text(get(p, "checksum")) } : {}),
               ...(w ? { width: w } : {}), ...(h ? { height: h } : {}),
               notes: notesOf(p), selections: sels };
    });
    items.push({ id, title, photos: ps });
  }
  return items;
}

/** One shelf entry per photo, carrying the item, its notes and its selections. */
export function tropyShelfInputs(items: TropyItem[]): Array<{ locator: string; name: string; extra: Record<string, unknown> }> {
  const out: Array<{ locator: string; name: string; extra: Record<string, unknown> }> = [];
  for (const it of items)
    it.photos.forEach((p, i) => out.push({
      locator: p.path || p.id,
      name: it.photos.length > 1 ? `${it.title} · ${i + 1}` : it.title,
      extra: { [TROPY_KEY]: { item: it.id, photo: p.id, title: p.title, notes: p.notes,
                              selections: p.selections, ...(p.checksum ? { md5: p.checksum } : {}),
                              ...(p.width ? { width: p.width, height: p.height } : {}) } },
    }));
  return out;
}

export function tropyOf(e: ShelfEntry | undefined): {
  item: string; photo: string; title: string; notes: string[]; selections: TropySelection[];
} | null {
  const t = e?.extra?.[TROPY_KEY];
  return t && typeof t === "object" ? (t as ReturnType<typeof tropyOf>) : null;
}

/**
 * «Promuovi a documento»: the DocumentNode (named `D.<n>`, the item's title as
 * its description, the file as `data.url`, the Tropy item id kept), and one
 * extractor per selection with the selection's REGION as its geometry and its
 * note as the reading's description. ONE undo step.
 *
 * The extractors' names follow NAME1 as it is written in `naming.ts`: the region
 * is ON the new document, so each reading has a source and is named
 * `D.<n>.<k>`, not `Temp<n>` (Temp is for an extractor with no source yet).
 */
export function promoteToDocument(store: DocumentStore, e: ShelfEntry): { documentId: string; extractors: string[] } {
  const tr = tropyOf(e);
  return store.batch(() => {
    const docId = store.newId();
    const url = e.locator;
    const data: Record<string, unknown> = /^(https?:|s3:|\/)/.test(url) ? { url } : { filename: url };
    if (tr) data.tropy = tr.item;
    if (e.checksum) data.checksum = e.checksum;
    const notes = tr?.notes?.length ? ` — ${tr.notes.join(" · ")}` : "";
    store.addNode({ id: docId, node_type: "document", name: nextDocumentName(store.doc),
                    description: `${tr?.title || e.name}${notes}` , data } as EmNode);
    const extractors: string[] = [];
    for (const s of tr?.selections ?? []) {
      const x = store.newId();
      store.addNode({ id: x, node_type: "extractor", name: initialName(store.doc, "extractor") ?? "Temp1",
                      description: s.note, data: { tropy_selection: s.id } } as EmNode);
      setReadingGeometry(store, x, docId, { kind: "region2d", shape_kind: "rect", rect: [...s.rect] });
      const renamed = renameOnAttach(store.doc, x);
      if (renamed) {
        store.updateNode(x, { name: renamed });
        const r = store.doc.graph.edges.find((ed) => ed.source === x && ed.edge_type === "extracted_from"
          && store.node(ed.target)?.node_type === "annotation_region")?.target;
        if (r) store.updateNode(r, { name: `${renamed} · region` });
      }
      extractors.push(x);
    }
    return { documentId: docId, extractors };
  });
}
