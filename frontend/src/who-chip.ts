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
