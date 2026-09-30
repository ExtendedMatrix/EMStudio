// NIGHT-RISORSA-FILE · parte 4 · «Impacchetta un tileset in .3tz» (desktop), and
// the two FORMS of one content.
//
// The writing is the bridge's (`POST /fs/pack-3tz`, 3D Survey Collection's
// writer vendored byte for byte as `tools/archive_3tz.py`): the one canonical
// profile of dtcstamp, so the sha256 of the archive names its content and not
// the moment it was packed. Measured on TempluMare: `232dfcbc…`, the same as
// 3DSC. Why the bridge and not Rust: the report of the night (the `zip` crate
// writes version 10 where the profile has 20, exposes no local-header offsets
// for the index, and NFC needs another crate — a second writer of the same
// bytes to keep in step, for 0.3 s on 200 MB).
//
// FORMS (dtcstamp's word, «forma»): a folder and its `.3tz` are the same thing
// in two packagings, and what says so is the equality of their
// `content_digest` — the digest of the list (role, path, sha256) of what is
// inside, the same for both. The graph keeps two resources (`directory`,
// `archive`), the archive `dtc_derived_from` the folder (a representation of
// it, E.D. 30 Sep: siblings tied by derivation), both carrying the
// `content_digest`; `formsOf` finds them, and the drawing shows one resource
// with two forms. EMtools' `_link` / `_archive` are recognised the same way
// the day they carry the digest.
//
// Pure but for `packTileset` (the network): `check-pack3tz.mjs`.
import {
  addResource,
  declareRepresentation,
  type ResourceGraph,
} from "./resources";
import type { EmEdge, EmNode } from "./types";

export interface PackResult {
  ok: boolean;
  state?: "written" | "same";
  path?: string;
  sha256?: string;
  bytes?: number;
  entries?: number;
  seconds?: number;
  content_digest?: { digest: string; files: number; computed_by: string };
  canonical?: { canonical?: boolean; reasons?: string[] } | null;
  error?: string;
}

/** Ask the bridge to pack `folder` (holding `tileset.json`) beside itself. */
export async function packTileset(bridge: string, folder: string): Promise<PackResult> {
  const r = await fetch(`${bridge}/fs/pack-3tz`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  const body = (await r.json().catch(() => ({}))) as PackResult & { detail?: string; message?: string };
  if (!r.ok || !body.ok) return { ok: false, error: body.error ?? body.detail ?? body.message ?? `bridge ${r.status}` };
  return body;
}

const dataOf = (n: EmNode | undefined): Record<string, unknown> =>
  ((n?.data ?? {}) as Record<string, unknown>);
export const contentDigestOf = (n: EmNode | undefined): string | null => {
  const c = dataOf(n).content_digest;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && typeof (c as { digest?: unknown }).digest === "string")
    return (c as { digest: string }).digest;
  return null;
};

/** The resources that are the SAME content as `resId` in another form (equal
 *  `content_digest`), `resId` first. One resource → itself only. */
export function formsOf(g: ResourceGraph, resId: string): EmNode[] {
  const me = g.node(resId);
  const cd = contentDigestOf(me);
  if (!me || !cd) return me ? [me] : [];
  return [me, ...g.nodes().filter((n) => n.id !== resId && n.node_type === "resource" && contentDigestOf(n) === cd)];
}

/** The folder and the archive in the graph after a pack: found by their url
 *  (or made, by `addResource`), both carrying the `content_digest`, the
 *  archive a representation of the folder. Returns the two ids. */
export function landPack(g: ResourceGraph, folderLocator: string, out: PackResult,
    names: { folder: string; archive: string }): { folderId: string; archiveId: string } {
  const entry = `${folderLocator.replace(/\/+$/, "")}/tileset.json`;
  const find = (url: string) => g.nodes().find((n) => n.node_type === "resource" && dataOf(n).url === url);
  const cd = { ...out.content_digest! };
  return g.batch(() => {
    const folder = find(entry) ?? addResource(g, { name: names.folder, kind: "3d_model",
      packaging: "directory", files: [{ path: entry }] });
    const archive = find(out.path!) ?? addResource(g, { name: names.archive, kind: "3d_model",
      packaging: "archive", files: [{ path: out.path!, checksum: out.sha256, size_bytes: out.bytes,
        media_type: "application/vnd.maxar.archive.3tz+zip" }] });
    for (const n of [folder, archive]) {
      const d = { ...dataOf(g.node(n.id)) };
      if (JSON.stringify(d.content_digest) !== JSON.stringify(cd)) g.setData(n.id, { ...d, content_digest: cd });
    }
    declareRepresentation(g, archive.id, folder.id);
    return { folderId: folder.id, archiveId: archive.id };
  });
}

/** The drawing: of the resources that are one content in several forms, the
 *  FIRST (a directory before an archive, then by id) stands for all of them
 *  until it is opened; the others are folded away with their edges. Returns
 *  also how many forms each shown one stands for. */
export function foldForms<N extends EmNode, E extends EmEdge>(nodes: N[], edges: E[], open: ReadonlySet<string>):
    { nodes: N[]; edges: E[]; forms: Map<string, number> } {
  const groups = new Map<string, N[]>();
  for (const n of nodes) {
    if (n.node_type !== "resource") continue;
    const cd = contentDigestOf(n);
    if (cd) (groups.get(cd) ?? groups.set(cd, []).get(cd)!).push(n);
  }
  const hidden = new Set<string>();
  const forms = new Map<string, number>();
  const rank = (n: N) => (dataOf(n).packaging === "directory" ? 0 : dataOf(n).packaging === "archive" ? 1 : 2);
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
    forms.set(sorted[0].id, sorted.length);
    if (open.has(sorted[0].id)) continue;
    for (const n of sorted.slice(1)) hidden.add(n.id);
  }
  if (!hidden.size) return { nodes, edges, forms };
  return { nodes: nodes.filter((n) => !hidden.has(n.id)),
           edges: edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)), forms };
}
