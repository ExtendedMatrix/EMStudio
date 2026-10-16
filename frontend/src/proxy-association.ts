/**
 * MICRO-SPAZIO-3D p.4 · a sketch becomes a unit's PROXY — the parts that are
 * rules, pure (`scripts/check-space-associate.mjs`).
 *
 * EM Tools' rule, measured in the Heriverse report of 6 Oct 2026: the glb at
 * `proxies/<unit name>.glb`, relative to the project's folder, Y-up; the chain
 * property `geometry` → `has_semantic_shape` → SemanticShape →
 * `has_linked_resource` → a `proxy_model` resource, written by s3Dgraphy's
 * `create_geometry_proxy` (through the bridge: the ids are the library's). What
 * EMStudio adds is what it knows and the library does not: the file is THERE —
 * its digest, resident, its media type and size — so the Space draws it at once,
 * from the folder or from the room's store by digest.
 */
import type { EmNode } from "./types";

/** A file name from a unit's name: what a file system takes, nothing else. */
export function proxyFileName(name: string): string {
  return (name.trim() || "proxy").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_");
}

/** `proxies/<unit>.glb`, relative to the em.json's folder. */
export function proxyRelPath(unitName: string): string {
  return `proxies/${proxyFileName(unitName)}.glb`;
}

/** The nodes the library returned, the proxy's resource told that its file is
 *  there: `checksum` sha256, `residency` resident, glb, its size. */
export function patchProxyNodes(nodes: EmNode[], rel: string, sha256hex: string, size: number): EmNode[] {
  return nodes.map((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (n.node_type !== "resource" || d.url_type !== "proxy_model") return n;
    return { ...n, data: { ...d, url: rel, checksum: `sha256:${sha256hex}`, residency: "resident",
      media_type: "model/gltf-binary", size_bytes: size } };
  });
}
