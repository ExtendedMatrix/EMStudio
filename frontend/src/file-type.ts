/**
 * MICRO-FILE-DELLA-STANZA (EMStudio#2) · what a file IS, for whoever picks a
 * reader for it — never decided by the extension of its address alone.
 *
 * A file another tool uploaded to a room (`s3dgraphy.room_import`, pyArchInit's
 * «Send site») has `data.url = https://<node>/…/v1/rooms/<room>/asset/sha256:<hex>`:
 * an address with no extension at all. What the bytes are is still in the
 * graph, so it is read in this order:
 *
 *   1. `data.media_type` (`image/jpeg`, `application/geo+json`, …);
 *   2. the extension of the node's `name` (`US_1_3.jpg`);
 *   3. the leaf of a locator in `data.addresses` (the original local path);
 *   4. the extension of `data.url` / `filename` / `path` (the rule of before).
 *
 * `typeKeyOf` hands back a NAME whose extension says the type («file.jpg»,
 * «US_1_3.jpg», «…/tileset.json»), so every classifier that reads an extension
 * (`mediumOfLocator`, `mediumOfFile`, `viewerMediumOf`, `mediaKindOf`) takes it
 * unchanged. It never replaces the LOCATOR: the bytes are still fetched from
 * the address. A name or a leaf counts only with an extension this table knows
 * («D.08», «1.1.US1» are names, not types).
 */

/** media type → the extension that says it (parameters dropped: `image/tiff; application=geotiff`) */
const EXT_OF_MEDIA: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/pjpeg": "jpg", "image/png": "png", "image/tiff": "tif",
  "image/webp": "webp", "image/gif": "gif", "image/bmp": "bmp", "image/heic": "heic", "image/heif": "heic",
  "image/avif": "avif", "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/geo+json": "geojson", "application/vnd.geo+json": "geojson",
  "application/geopackage+sqlite3": "gpkg", "image/vnd.dxf": "dxf", "application/dxf": "dxf",
  "model/gltf-binary": "glb", "model/gltf+json": "gltf", "model/obj": "obj", "model/ply": "ply",
  "application/vnd.3dtiles+zip": "3tz",
  "text/plain": "txt", "text/markdown": "md", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.oasis.opendocument.text": "odt", "application/msword": "doc",
};

/** the extensions a name may carry and be believed (every type a reader of EMStudio tells apart) */
const KNOWN_EXT = new Set([
  ...Object.values(EXT_OF_MEDIA),
  "jpeg", "tiff", "dng", "cr2", "nef", "arw", "exr", "hdr",
  "dwg", "ai", "eps", "shp", "json",
  "fbx", "las", "laz", "e57", "spz", "sog", "rad", "lcc2", "mtl", "blend",
]);

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The extension a media type says, without the dot; "" when it says none we know. */
export function extOfMediaType(mediaType: unknown): string {
  const mt = str(mediaType).toLowerCase().split(";")[0].trim();
  return EXT_OF_MEDIA[mt] ?? "";
}

/** The leaf of a name or address (query and fragment dropped), and its extension when known. */
function knownLeaf(s: string): string {
  const leaf = s.split(/[?#]/)[0].split(/[\\/]/).pop() ?? "";
  const m = /\.([a-z0-9]{1,8})$/i.exec(leaf);
  return m && KNOWN_EXT.has(m[1].toLowerCase()) ? leaf : "";
}

interface Typed { name?: unknown; data?: unknown }

/** The name a node's file TYPE is read from (see the head of this module); "" when nothing says it. */
export function typeKeyOf(n: Typed | null | undefined): string {
  const d = (n?.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;
  // 1 · what the bytes are
  const ext = extOfMediaType(d.media_type);
  if (ext) {
    // the name kept when it says the same thing (a tileset.json, a «US_1_3.jpg»)
    const own = knownLeaf(str(n?.name));
    return own && own.toLowerCase().endsWith(`.${ext}`) ? own : `file.${ext}`;
  }
  // 2 · the node's name
  const byName = knownLeaf(str(n?.name));
  if (byName) return byName;
  // 3 · the leaf of an address (the path it came from)
  if (Array.isArray(d.addresses)) {
    for (const a of d.addresses) {
      const loc = a && typeof a === "object" ? str((a as Record<string, unknown>).locator) : str(a);
      const leaf = loc ? knownLeaf(loc) : "";
      if (leaf) return leaf;
    }
  }
  // 4 · the address itself (the rule of before)
  for (const k of ["url", "filename", "path"]) {
    const v = str(d[k]);
    if (v && !/^sha256:/i.test(v)) return v;
  }
  return "";
}
