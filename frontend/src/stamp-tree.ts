/**
 * CAMPAGNA · what the BRIDGE says of a stamp and of a tree — asked, never
 * computed here (dtcstamp owns the rules: `verify_members`, `verify_tree`,
 * `new_tree_stamp`). Apart from `stamp-compose.ts` on purpose: that module
 * composes a draft and must not know the inner form of a stamp; this one only
 * carries the bridge's answers to the interface.
 */
import type { StampVerdict } from "./receipt";

let resolveBridge: (() => Promise<string>) | null = null;
export function setTreeBridgeResolver(fn: () => Promise<string>): void { resolveBridge = fn; }
async function bridge(): Promise<string> {
  if (!resolveBridge) throw new Error("no bridge resolver installed");
  return await resolveBridge();
}

/** CAMPAGNA · a stamp checked against its bytes by the KIND of thing it stamped
 *  (the bridge asks dtcstamp: `verify_members` for a file set, `verify_tree` for
 *  a folder or a .3tz, the sha256 for one file). `null` when nothing answers. */
export async function verifyStamp(path: string): Promise<StampVerdict | null> {
  const res = await fetch(`${await bridge()}/stamp/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) return null;
  const answer = (await res.json().catch(() => ({}))) as { ok?: boolean } & Partial<StampVerdict>;
  return answer.ok && answer.kind && answer.result ? { kind: answer.kind, result: answer.result } : null;
}

/** CAMPAGNA · a TREE as one resource — a folder with a `tileset.json`
 *  (`packaging: directory`) or a `.3tz` (`packaging: archive`): what its stamp
 *  would say, asked of dtcstamp (`new_tree_stamp`, nothing written). With
 *  `stamp`, also whether the stamp already beside it says so. */
export interface TreeInfo {
  ok: boolean; error?: string; path: string;
  packaging: "directory" | "archive";
  digest: string; digest_covers: "members" | "artifact";
  content_digest: { digest: string; files: number; computed_by?: string };
  files: number; size_bytes: number;
  proposed_self: Record<string, unknown>;
  canonical?: boolean; canonical_reasons?: string[];
  stamp?: { path: string; stale: boolean; why: Array<{ code: string; have?: string; want?: string }>;
           self: Record<string, unknown> };
}
export async function treeOf(path: string, stamp = false): Promise<TreeInfo | null> {
  const res = await fetch(`${await bridge()}/stamp/tree`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, stamp }),
  });
  if (!res.ok) return null;
  const answer = (await res.json().catch(() => null)) as TreeInfo | null;
  return answer && answer.ok ? answer : null;
}

/** A path a tree stamp is for: a `.3tz`, or a folder (its path) with a
 *  `tileset.json` at its root. */
export const TREE_EXT = /\.3tz$/i;
