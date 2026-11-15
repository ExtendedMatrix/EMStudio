/**
 * MICRO-D-GIS-DOCUMENTI (15 Nov 2026) · «uso di studio, non pubblicabile».
 *
 * A licence of the study's own vocabulary (s3Dgraphy `rights.STUDY_ONLY_LICENSE`):
 * the material may be studied in the project (a cadastre lent by an archive)
 * and is never published — not in «Publish…», not in an export for Heriverse.
 * It is written on the DOCUMENT; its sheets inherit it: read with the
 * resolver of provenance (`provenance.ts`, s3Dgraphy's walk), so an inherited
 * licence counts like an own one. The sign «solo studio» in the Space and the
 * Outliner, and the gate of Publish, read this one function.
 */
import { provIndex, resolveProvenance, type ProvIndex } from "./provenance";
import type { EmDocument } from "./types";

export const STUDY_ONLY = "EM-STUDY-ONLY";

export interface StudyOnly { id: string; name: string; origin: string | null; originName: string; inherited: boolean }

const code = (v: unknown): string => String(v ?? "").split(" (")[0].trim();

/** Is this node held back (own or inherited)? null when it may go out. */
export function studyOnlyOf(ix: ProvIndex, id: string): StudyOnly | null {
  const p = resolveProvenance(ix, id, "license");
  if (code(p.value) !== STUDY_ONLY) return null;
  return { id, name: ix.name(id), origin: p.origin, originName: ix.name(p.origin), inherited: p.level !== "node" };
}

/** Every node held back, one index for the pass (the licence nodes themselves aside). */
export function studyOnlyNodes(doc: EmDocument | null | undefined): Map<string, StudyOnly> {
  const out = new Map<string, StudyOnly>();
  if (!doc?.graph) return out;
  const ix = provIndex(doc);
  for (const [id, n] of ix.nodes) {
    if (n.node_type === "license") continue;
    const s = studyOnlyOf(ix, id);
    if (s) out.set(id, s);
  }
  return out;
}
