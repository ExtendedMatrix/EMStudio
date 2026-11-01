// MICRO-TESTATA-CLOUD (E.D. 1 Nov 2026) · «Chi sei», at the top right of the
// name strip: ONE chip (initials, name, a dot for its state) and a menu of TWO
// sections that must not be confused —
//
//   Autore · the identity that SIGNS stamps and paradata (name, ORCID), kept on
//            this computer; changed in Settings › Identity;
//   Nodo   · the account on a StratiGraph node (sign in / out, the node, «Il
//            mio spazio sul nodo» = the node's console, only when signed in).
//
// The two are tied by the same ORCID: the node's account is an ORCID too (its
// Keycloak brokers ORCID, or the node's password attests one), and the chip
// says when the node knows this session as somebody else.
//
// Signing needs the right identity (E.D.: «firmare richiede un login»): each
// operation that signs names what it needs (`SIGN_NEEDS`); when it is missing
// the chip's menu opens on the right section and, once done, the operation
// resumes by itself — never a mute error. Pure: the page draws it.

export type SignNeed = "author" | "node";

/** What each operation that signs needs: the author on this computer, or
 *  also an account on the node (where what is signed is written). */
export const SIGN_NEEDS = {
  stamp: "author",          // a file's stamp (Archive › Timbro)
  derive: "author",         // a version made and registered (the queue, Ottimizza)
  paradata: "author",       // verifying / translating a block, a paradata
  publish: "node",          // Publish… to a node
  roomCreate: "node",       // a new room on the node
  roomBring: "node",        // a study brought into a room
} as const satisfies Record<string, SignNeed>;
export type SignOp = keyof typeof SIGN_NEEDS;

export interface WhoFacts {
  /** the author on this computer (the signature), null when nobody */
  author: { name: string; orcid: string; state: "declared" | "verified" | "attested" } | null;
  /** the node in use (its address), "" when none */
  node: string;
  /** signed in on that node (a token in this session) */
  signedIn: boolean;
  /** who the node says this session is, when it said so */
  nodeWho?: { name: string; orcid: string } | null;
  /** the node knows this session as another person than the author */
  mismatch?: boolean;
}

export type WhoDot = "none" | "author" | "node" | "mismatch";

/** «ED» for «Emanuel Demetrescu», «E» for one word, the ORCID's last two
 *  characters when there is no name, «?» when there is nobody. */
export function initialsOf(name: string, orcid = ""): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const o = orcid.replace(/[^0-9X]/gi, "");
  return o ? o.slice(-2).toUpperCase() : "?";
}

/** The chip: what it says and its dot — no author: «Chi firma?» (the key
 *  `who.whoSigns`); an author: the name (or the ORCID); the dot says the
 *  rung: hollow nobody, amber the author only, green signed in on the node,
 *  red the node knows somebody else. */
export function chipModel(f: WhoFacts): { initials: string; label: string; labelKey: string | null; dot: WhoDot } {
  if (!f.author) return { initials: "?", label: "", labelKey: "who.whoSigns", dot: "none" };
  const label = f.author.name.trim() || f.author.orcid;
  const dot: WhoDot = f.mismatch ? "mismatch" : f.signedIn ? "node" : "author";
  return { initials: initialsOf(f.author.name, f.author.orcid), label, labelKey: null, dot };
}

/** What is missing for a need, in the order it must be done: the author
 *  first (it is who signs), then the node's login. null: nothing. */
export function missingFor(need: SignNeed, f: Pick<WhoFacts, "author" | "signedIn">): SignNeed | null {
  if (!f.author) return "author";
  if (need === "node" && !f.signedIn) return "node";
  return null;
}

/** «Il mio spazio sul nodo»: the node's console (rooms, space used,
 *  permissions), only when signed in on a node. */
export function mySpaceUrl(f: Pick<WhoFacts, "node" | "signedIn">): string | null {
  if (!f.node || !f.signedIn) return null;
  return `${f.node.replace(/\/+$/, "")}/admin/`;
}

/** The theme button: what it shows (☀ light, ☾ dark — the theme in force)
 *  and the mode a click stores — the other theme, explicit, so it stops
 *  following the system; «auto» stays in Settings › Theme. */
export function themeToggle(mode: "auto" | "light" | "dark", resolved: "light" | "dark"):
  { glyph: string; next: "light" | "dark"; following: boolean } {
  return { glyph: resolved === "dark" ? "☾" : "☀", next: resolved === "dark" ? "light" : "dark", following: mode === "auto" };
}

// ── MICRO-CHIP-UNICO (E.D. 1 Nov 2026) · ONE place: the chip ─────────────────
// Three doors (the chip, «On this computer» in the status bar, Settings ›
// Connections) used to say the same thing with different contents and popups
// on top of each other. Now the chip's menu is the one place, in four
// sections in this order —
//
//   author · who signs (name, ORCID, verify, edit)
//   node   · the node and the account (THE node selector — this computer, the
//            local network, saved, by hand, turn on a node here — then Sign in
//            / Sign out)
//   where  · where you work (on the computer / with an app / in a room, the
//            synchronised apps, Find)
//   space  · my space (my rooms, space used, permissions; the node's engine
//            when it exists)
//
// — and on top the steps of the node–user pair: ① Author → ② Node → ③ Sign in
// → ④ My space. Until the pair is complete what needs the node stays visible
// but grey, saying what is missing, and a click leads to the missing step.

export type WhoSection = "author" | "node" | "where" | "space";
export const WHO_SECTIONS: readonly WhoSection[] = ["author", "node", "where", "space"];

export type PairStep = "author" | "node" | "login" | "space";
export const PAIR_STEPS: readonly PairStep[] = ["author", "node", "login", "space"];
export type PairState = "done" | "todo" | "warn";

export interface PairFacts extends Pick<WhoFacts, "author" | "node" | "signedIn"> {
  /** the node answers (`unreachable` = it was asked and did not) */
  reach?: "reachable" | "unreachable" | "unknown";
}

/** Each step with its state: author declared; a node chosen (warn when it
 *  does not answer); signed in on it; my space = all three, the node up. */
export function pairSteps(f: PairFacts): { step: PairStep; state: PairState }[] {
  const nodeState: PairState = !f.node ? "todo" : f.reach === "unreachable" ? "warn" : "done";
  const login: PairState = f.node && f.signedIn ? "done" : "todo";
  const space: PairState = login === "done" ? (nodeState === "done" ? "done" : "warn") : "todo";
  return [
    { step: "author", state: f.author ? "done" : "todo" },
    { step: "node", state: nodeState },
    { step: "login", state: login },
    { step: "space", state: space },
  ];
}

/** What each node-side action needs of the pair: seeing my rooms / my space
 *  needs the node and the login; publishing and a room (written, signed) also
 *  the author — the same order as the steps. */
export const PAIR_NEEDS = {
  rooms: ["node", "login"],
  space: ["node", "login"],
  publish: ["author", "node", "login"],
  roomCreate: ["author", "node", "login"],
  roomBring: ["author", "node", "login"],
} as const satisfies Record<string, readonly PairStep[]>;
export type PairAction = keyof typeof PAIR_NEEDS;

/** The steps still missing for an action, in order ([] = it may go). A node
 *  that does not answer counts as missing: nothing can be asked of it. */
export function pairMissing(action: PairAction, f: PairFacts): PairStep[] {
  const st = new Map(pairSteps(f).map((s) => [s.step, s.state]));
  return PAIR_NEEDS[action].filter((s) => st.get(s) !== "done");
}

/** Where a missing step is done: the author in «Autore», the node and the
 *  login in «Nodo e account» (the node first: the selector opens). */
export function sectionOfStep(step: PairStep): WhoSection {
  return step === "author" ? "author" : step === "space" ? "space" : "node";
}

/** The grey item's sentence, as keys: «serve: scegli un nodo → accedi». */
export function needKeys(missing: readonly PairStep[]): string[] {
  return missing.map((s) => `pair.do.${s}`);
}
