/**
 * MICRO-ARCHIVIO-1 · what a REMOTE resource on the Shelf looks like — a URI, a
 * IIIF image or manifest, a catalogue's record (iDAI.objects / Arachne) — read
 * from its own address, with the source said.
 *
 * E.D. (decision on V3, 27 Oct 2026): «le anteprime delle risorse citate nello
 * scaffale (anche risorse remote su server, per esempio il risultato di una
 * ricerca su un catalogo del DAI) vanno nella metà destra dello scaffale». So a
 * web address is not a «🔗» and a string: it is the thing, its picture and its
 * words, and where they were read.
 *
 * The order of the readings, from the most to the least specific:
 *   1. a catalogue this module knows by its address (Arachne's data API, which
 *      answers JSON with CORS) — its title, its kind, its place, its picture;
 *   2. IIIF: an image service (`…/info.json`, a `…/full/…/default.jpg`) or a
 *      Presentation manifest (v2 or v3) — its label and its thumbnail;
 *   3. the address's own form: an image, a PDF, a 3D model, a tileset;
 *   4. the page's self-description, read by the bridge (`/web-meta`: OpenGraph,
 *      Twitter cards, JSON-LD, the <title>) — a page cannot read another site.
 * Nothing is invented: a field nobody said stays absent, and an address that
 * says nothing is shown as an address with its link.
 *
 * Pure module with its two reads injected (`deps`), so the readings are checked
 * in node (`scripts/check-web-preview.mjs`).
 */

import { resourceTypeOfLocator } from "./rules";

export type RemoteKind = "image" | "pdf" | "model" | "tileset" | "record" | "page" | "none";

export interface RemotePreview {
  kind: RemoteKind;
  /** the address read (after a redirect, the final one) */
  url: string;
  /** where the reader goes to see it at home */
  link: string;
  /** who said it: «iDAI.objects · Arachne (DAI)», «IIIF», the site's name */
  source: string;
  title?: string;
  description?: string;
  /** a picture of it, an address an <img> can load */
  image?: string;
  /** a few facts, as the source names them (kind, place, date, material) */
  fields?: Array<[string, string]>;
  /** why nothing could be read (said under the address) */
  error?: string;
}

/** what the bridge's `/web-meta` answers */
export interface WebMeta {
  ok: boolean;
  kind?: "image" | "pdf" | "json" | "page";
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  site?: string;
  type?: string;
  json?: unknown;
  error?: string;
}

export interface PreviewDeps {
  /** a JSON read straight from the page (works where the server allows CORS);
   *  null when it cannot */
  fetchJson: (url: string) => Promise<unknown | null>;
  /** the bridge's reading of an address; null without a bridge that has it */
  webMeta: (url: string) => Promise<WebMeta | null>;
}

const ARACHNE = /^https?:\/\/arachne\.dainst\.org\/(?:data\/)?entity\/(\d+)/i;
const IIIF_INFO = /\/info\.json(\?.*)?$/i;
const IIIF_IMAGE = /\/(full|square|\d+,\d+,\d+,\d+|pct:[^/]+)\/[^/]+\/!?\d+\/(default|color|gray|bitonal)\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;
const IIIF_MANIFEST = /(manifest(\.json)?|\/iiif\/[^?#]*\/manifest[^/]*)(\?.*)?$/i;
const TILESET = /(\.3tz|(^|\/)tileset\.json)(\?.*)?$/i;

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

/** a IIIF label, v2 (string, or [{@value}]) or v3 ({lang: [..]}) */
export function iiifLabel(label: unknown, lang = "it"): string {
  if (!label) return "";
  if (typeof label === "string") return label;
  if (Array.isArray(label)) {
    const first = label[0] as { "@value"?: string } | string | undefined;
    return typeof first === "string" ? first : String(first?.["@value"] ?? "");
  }
  if (typeof label === "object") {
    const map = label as Record<string, unknown>;
    const pick = map[lang] ?? map.en ?? map.none ?? Object.values(map)[0];
    return Array.isArray(pick) ? String(pick[0] ?? "") : String(pick ?? "");
  }
  return "";
}

/** A IIIF Presentation manifest → its label, summary and a picture. */
export function readManifest(json: unknown, url: string): RemotePreview | null {
  const m = json as Record<string, unknown> | null;
  if (!m || typeof m !== "object") return null;
  const ctx = JSON.stringify(m["@context"] ?? "");
  const type = String(m.type ?? m["@type"] ?? "");
  if (!/iiif\.io\/api\/presentation/.test(ctx) && !/Manifest/.test(type)) return null;
  const thumbOf = (t: unknown): string => {
    const x = Array.isArray(t) ? t[0] : t;
    if (!x) return "";
    if (typeof x === "string") return x;
    const o = x as Record<string, unknown>;
    return String(o.id ?? o["@id"] ?? "");
  };
  let image = thumbOf(m.thumbnail);
  if (!image) {
    // v2: sequences[0].canvases[0].images[0].resource; v3: items[0].items[0].items[0].body
    const v2 = (m.sequences as Array<Record<string, unknown>> | undefined)?.[0]?.canvases as Array<Record<string, unknown>> | undefined;
    const res2 = (v2?.[0]?.images as Array<Record<string, unknown>> | undefined)?.[0]?.resource as Record<string, unknown> | undefined;
    const v3 = (((m.items as Array<Record<string, unknown>> | undefined)?.[0]?.items as Array<Record<string, unknown>> | undefined)?.[0]?.items as Array<Record<string, unknown>> | undefined)?.[0]?.body as Record<string, unknown> | undefined;
    const body = res2 ?? v3;
    const service = body?.service as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
    const svc = Array.isArray(service) ? service[0] : service;
    const sid = String(svc?.id ?? svc?.["@id"] ?? "");
    image = sid ? `${sid.replace(/\/$/, "")}/full/!600,600/0/default.jpg` : String(body?.id ?? body?.["@id"] ?? "");
  }
  const summary = iiifLabel(m.summary ?? m.description);
  const provider = (m.provider as Array<Record<string, unknown>> | undefined)?.[0];
  const source = iiifLabel(provider?.label) || iiifLabel(m.attribution) || hostOf(url);
  return {
    kind: "record", url, link: url, source: `IIIF · ${source}`,
    ...(iiifLabel(m.label) ? { title: iiifLabel(m.label) } : {}),
    ...(summary ? { description: summary } : {}),
    ...(image ? { image } : {}),
  };
}

/** Arachne's record (`/data/entity/N`) → title, facts, picture. */
export function readArachne(json: unknown, id: string): RemotePreview | null {
  const r = json as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || !r.title) return null;
  const first = (k: string): string => {
    const v = r[k];
    return Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "";
  };
  const dates = (r.dates as Array<{ label?: string }> | undefined)?.map((d) => d.label).filter(Boolean).join(", ") ?? "";
  const fields: Array<[string, string]> = [];
  for (const [label, v] of [["type", String(r.type ?? "")], ["place", first("facet_ort") || first("facet_locality")],
    ["date", dates], ["material", first("facet_material")]] as Array<[string, string]>) if (v) fields.push([label, v]);
  const thumb = r.thumbnailId ?? (r.images as Array<{ imageId?: number }> | undefined)?.[0]?.imageId;
  return {
    kind: "record",
    url: `https://arachne.dainst.org/data/entity/${id}`,
    link: `https://arachne.dainst.org/entity/${id}`,
    source: "iDAI.objects · Arachne (DAI)",
    title: String(r.title),
    ...(r.subtitle ? { description: String(r.subtitle) } : {}),
    ...(thumb ? { image: `https://arachne.dainst.org/data/image/preview/${thumb}` } : {}),
    fields,
  };
}

/** The form of the address alone, with no read: image, PDF, model, tileset. */
export function formOf(url: string): RemoteKind | null {
  if (IIIF_IMAGE.test(url)) return "image";
  if (TILESET.test(url)) return "tileset";
  const t = resourceTypeOfLocator(url);
  if (t === "image") return "image";
  if (t === "document" && /\.pdf(\?|#|$)/i.test(url)) return "pdf";
  if (/model/.test(t)) return "model";
  return null;
}

export async function resolveRemote(url: string, deps: PreviewDeps): Promise<RemotePreview> {
  const plain: RemotePreview = { kind: "none", url, link: url, source: hostOf(url) };
  // 1 · a catalogue known by its address
  const ar = ARACHNE.exec(url);
  if (ar) {
    const json = await deps.fetchJson(`https://arachne.dainst.org/data/entity/${ar[1]}`)
      ?? (await deps.webMeta(`https://arachne.dainst.org/data/entity/${ar[1]}`))?.json ?? null;
    const rec = readArachne(json, ar[1]);
    if (rec) return rec;
  }
  // 2 · IIIF
  if (IIIF_INFO.test(url)) {
    const base = url.replace(IIIF_INFO, "");
    return { kind: "image", url, link: url, source: `IIIF · ${hostOf(url)}`, image: `${base}/full/!600,600/0/default.jpg` };
  }
  if (IIIF_MANIFEST.test(url)) {
    const json = await deps.fetchJson(url) ?? (await deps.webMeta(url))?.json ?? null;
    const man = readManifest(json, url);
    if (man) return man;
  }
  // 3 · the address's own form
  const form = formOf(url);
  if (form === "image") return { kind: "image", url, link: url, source: hostOf(url), image: url };
  if (form) return { ...plain, kind: form };
  // 4 · what the page says of itself, through the bridge
  const meta = await deps.webMeta(url);
  if (!meta) return { ...plain, error: "no-bridge" };
  if (!meta.ok) return { ...plain, error: meta.error || "unreachable" };
  const at = meta.url || url;
  if (meta.kind === "image") return { kind: "image", url: at, link: url, source: hostOf(at), image: at };
  if (meta.kind === "pdf") return { kind: "pdf", url: at, link: url, source: hostOf(at) };
  if (meta.kind === "json") {
    const man = readManifest(meta.json, at);
    if (man) return man;
    const j = meta.json as Record<string, unknown> | null;
    const title = j && typeof j === "object" ? String(j.title ?? j.name ?? iiifLabel(j.label) ?? "") : "";
    return title ? { kind: "record", url: at, link: url, source: hostOf(at), title } : { ...plain, url: at };
  }
  return {
    kind: "page", url: at, link: url, source: meta.site || hostOf(at),
    ...(meta.title ? { title: meta.title } : {}),
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.image ? { image: meta.image } : {}),
    ...(meta.type ? { fields: [["type", meta.type]] as Array<[string, string]> } : {}),
  };
}
