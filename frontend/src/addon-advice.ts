/**
 * MICRO-PREPARA-RITOCCHI p.4 (E.D., 30 Oct 2026) · Settings › Add-ons says
 * first, in plain words, what each add-on is FOR YOU — which action of
 * Ottimizza uses it — and WHEN to install it: «recommended» when it serves
 * what you do, «optional» otherwise, so that it is clear they are not all
 * needed; one line on top sums it up («for what you do these are enough: …»).
 *
 * What you do is read from the choices already made in Ottimizza: the
 * Variants (gltfpack) are on by default; the tileset from a mesh and Blender
 * are behind their «experimental» switches; the profile of use chosen in
 * «Prepare for a use» names the actions it needs. Pure (the checks read it).
 */

/** The part of an add-on's state this module reads (`GET /addons`). */
export interface AdviceAddon {
  id: string; name: string; installed: unknown | null; available: boolean;
  fit?: { ok: boolean }; serves?: { actions: string[]; profiles: string[]; for?: string[] };
  /** the Node add-on: a Node of 18 or newer already on this machine */
  system_node?: string | null;
}

/** What the person does, from the switches and choices of Ottimizza. */
export interface Usage {
  /** the Variants section (gltfpack) — on by default */
  variants: boolean;
  /** «A tileset from a mesh» switched on */
  tileset: boolean;
  /** «Blender (the second way)» switched on */
  blender: boolean;
  /** the profile chosen in «Prepare for a use», when one was */
  profile?: string | null;
}

export type AdviceCode = "recommended" | "optional" | "not_needed" | "not_here";

export interface Advice {
  id: string; code: AdviceCode;
  /** the actions of Ottimizza it serves that the person uses */
  serving: string[];
  /** why «not needed»: another serves (the Node of this machine) */
  because?: string;
}

/** The actions a profile of use leads to (the profiles that prefer KTX2 and
 *  meshopt go through the Variants; desktop realtime and webXR may become a
 *  tileset, but only when the tileset switch is on). */
export const PROFILE_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  preview: ["variants"], mobile_webxr: ["variants"],
};

/** The actions in use. */
export function actionsInUse(u: Usage): Set<string> {
  const out = new Set<string>();
  if (u.variants) out.add("variants");
  if (u.tileset) out.add("tileset");
  if (u.blender) out.add("blender");
  for (const a of PROFILE_ACTIONS[u.profile ?? ""] ?? []) out.add(a);
  return out;
}

/** Each add-on's advice, in the list's order. */
export function adviseAddons(list: readonly AdviceAddon[], u: Usage): Advice[] {
  const using = actionsInUse(u);
  const byId = new Map(list.map((a) => [a.id, a]));
  return list.map((a) => {
    const serving = (a.serves?.actions ?? []).filter((x) => using.has(x));
    if (a.fit && a.fit.ok === false && !a.installed) return { id: a.id, code: "not_here", serving };
    // Node: needed only for the add-ons it runs, and only without a Node here
    if (a.serves?.for?.length) {
      const users = a.serves.for.map((id) => byId.get(id)).filter((x): x is AdviceAddon => !!x);
      const wanted = users.some((x) => (x.serves?.actions ?? []).some((y) => using.has(y)));
      if (a.system_node) return { id: a.id, code: "not_needed", serving, because: a.system_node };
      return { id: a.id, code: wanted ? "recommended" : "optional", serving };
    }
    return { id: a.id, code: serving.length ? "recommended" : "optional", serving };
  });
}

/** The names that are enough for what the person does (the recommended ones),
 *  for the line on top; empty when none is. */
export function enoughFor(list: readonly AdviceAddon[], advice: readonly Advice[]): string[] {
  const names = new Map(list.map((a) => [a.id, a.name]));
  return advice.filter((x) => x.code === "recommended").map((x) => names.get(x.id) ?? x.id);
}
