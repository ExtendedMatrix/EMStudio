/**
 * IDENTITY — the ORCID iD is who you are; verification says who checked.
 *
 * The model, before any code:
 *
 *   An archaeologist on a dig, with no network, adds themselves with **their
 *   ORCID iD alone**. They DECLARE it — claimed, not verified — and that is
 *   enough to work: create, edit, annotate, save, author every node they touch.
 *   Nothing about preparing data waits for a connection.
 *
 *   On the first connection they verify that iD through ORCID, and only then
 *   does **publishing as that person** unlock. Claim now, verify later; publish
 *   only if verified.
 *
 * Why the gate sits exactly there. Authorship inside your own document is a
 * statement you make to yourself and your team; the graph records who did what,
 * and being wrong about it costs a correction. Publishing is a statement to
 * everyone else, permanently, under a name that belongs to a real person with a
 * real record — and there, "I typed my colleague's iD by mistake" is not a
 * correction, it is a false attribution in somebody else's bibliography.
 *
 * What is secret and what is not:
 *
 *   · the **ORCID iD** is a PUBLIC identifier. It is printed on papers. It may
 *     sit in localStorage in clear text, and it does here.
 *   · the **tokens** from the identity broker are secrets, and they follow the
 *     LLM key's rule exactly: OS keychain or session memory, and NO READ PATH —
 *     nothing in this module returns a token, the same way nothing returns the
 *     API key (see `tauri.ts`: there is no `getLlmKey`, on purpose).
 *
 * This module is PURE except for `localStorage`: no DOM, no network. The
 * network lives behind `IdentityProvider`, so the flow is testable without any
 * infrastructure — and so Keycloak can be wired in later without this file
 * knowing it exists.
 */

export interface Identity {
  /** the ORCID iD, canonical form `0000-0000-0000-000X` — this IS the identity */
  orcid: string;
  /** optional, and only ever for humans to read */
  name?: string;
  surname?: string;
  /** false = declared by whoever typed it; true = confirmed through ORCID */
  verified: boolean;
  /** when the verification happened (ISO), for the UI to show "last checked" */
  verifiedAt?: string;
  /** IDENTITÀ · WHO witnessed it: a StratiGraph node (its host, through its
   *  Keycloak) or `orcid.org` (ORCID's own sign-in). Absent for the mock. */
  verifiedBy?: string;
  /** dev27 · L'ACCESSO SUL CAMPO (E.D. 2026-10-01). How this identity entered
   *  LAST: `orcid` (ORCID, directly or brokered by a node's Keycloak) or
   *  `node_password` (the iD and a password of a StratiGraph node, offline: the
   *  node ATTESTS it). Absent for a declared iD, which entered nowhere. */
  authMode?: AuthMode;
  /** the node that attested it (`/v1/whoami` `attested_by`), with the instant */
  attestedBy?: string;
  attestedAt?: string;
  /** the node said the iD is in its list of accredited iDs (`/v1/whoami`
   *  `accredited`): it was verified by ORCID once, at the accreditation */
  accredited?: boolean;
}

/** How a person entered: verified by ORCID, attested by a node's password, or
 *  (dev28, s3Dgraphy `declared`) an iD typed here and checked by nobody. */
export type AuthMode = "orcid" | "node_password" | "declared";

/** The access mode a SIGNATURE carries (s3Dgraphy dev27 `created_auth`,
 *  `modified_auth`, `validated_auth`: `{mode, attested_by?}`). */
export interface SignatureAuth {
  mode: AuthMode;
  attested_by?: string;
}

/** The three states an identity can be in, as the chip and the panel say them:
 *  `verified` (ORCID), `attested` (a node, by its password), `declared`. */
export type IdentityState = "verified" | "attested" | "declared";

export function identityState(identity: Identity | null | undefined): IdentityState | null {
  if (!identity) return null;
  if (identity.authMode === "node_password" && identity.attestedBy) return "attested";
  if (identity.verified === true) return "verified";
  return identity.attestedBy ? "attested" : "declared";
}

/** What a signature made NOW records about how its hand entered: the last
 *  sign-in's mode — `{mode: "node_password", attested_by}` for an attested
 *  session, `{mode: "orcid"}` for a verified one — and, since dev28, `{mode:
 *  "declared"}` for a declared iD: s3Dgraphy has the word for it now
 *  (`editorial.AUTH_MODES`), so the record says what it is instead of saying
 *  nothing. Null with no identity. In a ROOM the relay writes the mode from
 *  the token over whatever this says (`crdt.stamp_auth`): this is the local
 *  signature. */
export function signatureAuth(identity: Identity | null | undefined): SignatureAuth | null {
  const state = identityState(identity);
  if (state === "attested") return { mode: "node_password", attested_by: identity!.attestedBy! };
  if (state === "verified") return { mode: "orcid" };
  if (state === "declared") return { mode: "declared" };
  return null;
}

// ── the iD itself ───────────────────────────────────────────────────────────

const ORCID_SHAPE = /^(\d{4})-(\d{4})-(\d{4})-(\d{3}[\dX])$/;

/** Strip whatever a human pasted down to the 16 characters that matter.
 *
 * People paste `https://orcid.org/0000-…`, or with spaces, or lower-case `x`.
 * All of those ARE the same iD, and refusing them would be pedantry dressed as
 * validation. What is NOT accepted is a different number of digits: that is a
 * different identifier, or a typo, and either way not an identity. */
export function normalizeOrcid(input: string): string {
  const raw = String(input ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?orcid\.org\//i, "")
    .replace(/[\s‐-―]/g, "-")   // spaces and the unicode dashes
    .replace(/[^0-9Xx-]/g, "")
    .toUpperCase();
  const digits = raw.replace(/-/g, "");
  if (digits.length !== 16) return raw;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Is this a well-formed ORCID iD — shape AND checksum?
 *
 * The last character is a MOD-11-2 check digit (ISO/IEC 7064) over the first
 * fifteen. Checking it costs six lines and catches the mistake that actually
 * happens: a transposed pair of digits, which passes any shape test and points
 * at a REAL OTHER PERSON. An identity that is validated only by its shape is
 * not validated.
 */
/**
 * Is the iD a node just confirmed THE SAME ONE this session declared?
 *
 *  `true`  — the same person, so a confirmation of the signature;
 *  `false` — a different person, so NOT a confirmation of it;
 *  `null`  — cannot tell, and that is a third answer rather than a `false`.
 *
 * The middle rung of the identity ladder is defined by that sameness: «un nodo ha
 * validato **quella stessa firma**» — a login does not give you another name, it
 * confirms the one you had already written. So this question is what decides
 * whether the rung was reached, and it lives here rather than in the chip because
 * it is a question about two identities and not about a piece of chrome.
 *
 * Found by measuring, 5 September 2026: declared `0000-0002-5065-7970` «Emanuel
 * Demetrescu», signed in against the dev node, and the node confirmed
 * `0000-0002-1825-0097` «Dev User». The chip read «Emanuel Demetrescu ·
 * em.localhost:8443» — the declared name presented as confirmed by a node that
 * had confirmed somebody else. The same species as a tick beside a name nobody
 * checked, one rung further up.
 *
 * `null` when either side is not an ORCID: a realm that answers with a
 * `preferred_username` or a `sub` is not a reason to refuse the rung, and
 * refusing it there would break every such deployment. «I cannot tell» is the
 * honest answer, and the caller keeps the rung while saying what was confirmed.
 */
export function sameSignature(declared: unknown, said: unknown): boolean | null {
  const a = String(declared ?? "").trim();
  const b = String(said ?? "").trim();
  if (!a || !b) return null;
  if (!isValidOrcid(a) || !isValidOrcid(b)) return null;
  return normalizeOrcid(a) === normalizeOrcid(b);
}


export function isValidOrcid(input: string): boolean {
  const id = normalizeOrcid(input);
  const m = ORCID_SHAPE.exec(id);
  if (!m) return false;
  const digits = id.replace(/-/g, "");
  let total = 0;
  for (let i = 0; i < 15; i++) {
    total = (total + Number(digits[i])) * 2;
  }
  const remainder = total % 11;
  const result = (12 - remainder) % 11;
  const expected = result === 10 ? "X" : String(result);
  return digits[15] === expected;
}

/** The reason an iD is refused, for a message that helps. */
export function orcidProblem(input: string): "empty" | "shape" | "checksum" | null {
  const id = normalizeOrcid(input);
  if (!id) return "empty";
  if (!ORCID_SHAPE.test(id)) return "shape";
  return isValidOrcid(id) ? null : "checksum";
}

// ── who is working right now ────────────────────────────────────────────────
//
// Several people share one field laptop, so this is a LIST plus a pointer, not
// a single slot: adding yourself must not erase the person before you, and
// coming back tomorrow should find your identity where you left it.

const STORAGE_KEY = "emstudio.identities";

interface IdentityStore {
  current: string | null;   // an orcid, or null
  known: Identity[];
}

function readStore(): IdentityStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { current: null, known: [] };
    const parsed = JSON.parse(raw) as IdentityStore;
    const known = Array.isArray(parsed.known)
      ? parsed.known.filter((i) => i && typeof i.orcid === "string")
      : [];
    // `verified` is re-derived as a strict boolean on the way in. A tampered or
    // hand-edited localStorage must not be able to promote an identity by
    // holding the string "true" — the value that gates publication only ever
    // comes back as a real boolean.
    for (const i of known) {
      i.verified = i.verified === true;
      // the same strictness for what the field attestation can unlock
      if (i.accredited !== undefined) i.accredited = i.accredited === true;
      if (i.authMode !== undefined && i.authMode !== "orcid" && i.authMode !== "node_password")
        delete i.authMode;
    }
    return { current: typeof parsed.current === "string" ? parsed.current : null, known };
  } catch {
    return { current: null, known: [] };
  }
}

function writeStore(store: IdentityStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage disabled — the identity lives for this session only */
  }
}

/** Every identity this machine knows, most recent first. */
export function knownIdentities(): Identity[] {
  return readStore().known;
}

/** Who is authoring right now, or null. */
export function currentIdentity(): Identity | null {
  const { current, known } = readStore();
  if (!current) return null;
  return known.find((i) => i.orcid === current) ?? null;
}

/**
 * Declare an identity and make it current — the offline path, no network.
 *
 * Returns the identity, or a problem code. An iD that fails the checksum is
 * refused BEFORE it becomes an identity: letting it in would mean authoring
 * nodes under an identifier that belongs to someone else or to nobody.
 */
export function declareIdentity(
  input: string,
  extra: { name?: string; surname?: string } = {},
): { ok: true; identity: Identity } | { ok: false; problem: "empty" | "shape" | "checksum" } {
  const problem = orcidProblem(input);
  if (problem) return { ok: false, problem };
  const orcid = normalizeOrcid(input);
  const store = readStore();
  const existing = store.known.find((i) => i.orcid === orcid);
  const identity: Identity = existing ?? { orcid, verified: false };
  if (extra.name !== undefined) identity.name = extra.name;
  if (extra.surname !== undefined) identity.surname = extra.surname;
  store.known = [identity, ...store.known.filter((i) => i.orcid !== orcid)];
  store.current = orcid;
  writeStore(store);
  return { ok: true, identity };
}

/** Switch to an identity already known to this machine (the shared laptop). */
export function useIdentity(orcid: string): Identity | null {
  const store = readStore();
  const found = store.known.find((i) => i.orcid === normalizeOrcid(orcid));
  if (!found) return null;
  store.current = found.orcid;
  writeStore(store);
  return found;
}

/** DEV30 U15 · nobody is authoring: the known list stays, none is current. */
export function useNoIdentity(): void {
  const store = readStore();
  store.current = null;
  writeStore(store);
}

/** Forget an identity on this machine (it is not deleted anywhere else). */
export function forgetIdentity(orcid: string): void {
  const store = readStore();
  const id = normalizeOrcid(orcid);
  store.known = store.known.filter((i) => i.orcid !== id);
  if (store.current === id) store.current = store.known[0]?.orcid ?? null;
  writeStore(store);
}

// ── the publication gate ────────────────────────────────────────────────────

export type PublishGate =
  | { allowed: true; via?: "accreditation" }
  | { allowed: false; reason: "no-identity" }
  | { allowed: false; reason: "not-verified"; orcid: string };

/**
 * May the current identity publish?
 *
 * Only this. Everything else — creating, editing, annotating, saving, exporting
 * to a file on your own disk — is DATA PREPARATION and is never asked this
 * question. A tool that refuses to let you work until you have logged in is
 * useless in a trench.
 */
export function publishGate(): PublishGate {
  const identity = currentIdentity();
  if (!identity) return { allowed: false, reason: "no-identity" };
  if (identity.verified === true) return { allowed: true };
  // dev27 · an identity ATTESTED by a node passes when the node says the iD is
  // accredited: the accreditation was online, through ORCID, so the iD was
  // verified once — the field attestation only says it is the same person now.
  if (identity.attestedBy && identity.accredited === true)
    return { allowed: true, via: "accreditation" };
  return { allowed: false, reason: "not-verified", orcid: identity.orcid };
}

// ── verification: the seam ──────────────────────────────────────────────────

export interface VerificationResult {
  /** the iD the provider actually verified — NOT necessarily the declared one */
  orcid: string;
  /** display name from the provider, when it gives one */
  name?: string;
  /** who witnessed it (a node's host, `orcid.org`) — kept on the identity */
  witness?: string;
  /** dev27 · the node's `/v1/whoami` `accredited` */
  accredited?: boolean;
}

/**
 * The seam. One method, and deliberately no token in the return value.
 *
 * A real adapter (Keycloak brokering ORCID: Authorization Code + PKCE on the
 * web, Device flow on desktop/headless) holds its tokens in the OS keychain or
 * in session memory and hands back only the CLAIM it established. If this
 * interface returned an access token, every caller would become a place a token
 * can leak from — which is the mistake the LLM key design already refused.
 */
export interface IdentityProvider {
  readonly id: string;
  /** Run the flow. Resolves with the verified iD, or rejects with a reason. */
  verify(): Promise<VerificationResult>;
}

/** A provider that verifies whatever it is told to — for testing the FLOW
 *  without any infrastructure, which is the only way the flow can be tested at
 *  all until a Keycloak realm exists. */
export class MockIdentityProvider implements IdentityProvider {
  readonly id = "mock";
  constructor(private readonly answer: VerificationResult | Error) {}
  async verify(): Promise<VerificationResult> {
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

/** A claim somebody ELSE already established — a StratiGraph node's
 *  `/v1/whoami` after its Keycloak, or ORCID's signed id_token — handed to the
 *  same comparison as every provider (`verifyCurrentIdentity`). It carries the
 *  witness, never a token. */
export class WitnessedClaim implements IdentityProvider {
  readonly id = "witness";
  constructor(private readonly claim: VerificationResult) {}
  async verify(): Promise<VerificationResult> {
    return this.claim;
  }
}

export type VerifyOutcome =
  | { status: "verified"; identity: Identity }
  | { status: "mismatch"; declared: string; verified: string }
  | { status: "no-identity" }
  | { status: "failed"; detail: string };

/**
 * Verify the CURRENT identity through a provider.
 *
 * The comparison is the point. If the verified iD differs from the declared
 * one, the declared one is NOT silently replaced and NOT promoted: somebody is
 * logged into ORCID as one person and has declared another, and only they know
 * which is the mistake. Quietly adopting the verified iD would re-attribute
 * every node they have authored so far.
 */
export async function verifyCurrentIdentity(
  provider: IdentityProvider,
): Promise<VerifyOutcome> {
  const identity = currentIdentity();
  if (!identity) return { status: "no-identity" };
  let result: VerificationResult;
  try {
    result = await provider.verify();
  } catch (err) {
    return { status: "failed", detail: err instanceof Error ? err.message : String(err) };
  }
  const verified = normalizeOrcid(result.orcid);
  if (verified !== identity.orcid) {
    return { status: "mismatch", declared: identity.orcid, verified };
  }
  const store = readStore();
  const found = store.known.find((i) => i.orcid === identity.orcid);
  if (found) {
    found.verified = true;
    found.verifiedAt = new Date().toISOString();
    found.authMode = "orcid";
    if (result.accredited !== undefined) found.accredited = result.accredited === true;
    if (result.witness) found.verifiedBy = result.witness;
    else delete found.verifiedBy;
    if (result.name && !found.name) found.name = result.name;
    writeStore(store);
    return { status: "verified", identity: found };
  }
  return { status: "failed", detail: "the identity disappeared mid-verification" };
}

/** Adopt the iD the provider verified, REPLACING the declared one. Only ever
 *  called after the user has been shown both and has chosen — never silently. */
export function adoptVerifiedIdentity(orcid: string, name?: string, witness?: string): Identity {
  const id = normalizeOrcid(orcid);
  const store = readStore();
  const identity: Identity = store.known.find((i) => i.orcid === id) ?? { orcid: id, verified: false };
  identity.verified = true;
  identity.verifiedAt = new Date().toISOString();
  identity.authMode = "orcid";
  if (witness) identity.verifiedBy = witness;
  if (name && !identity.name) identity.name = name;
  store.known = [identity, ...store.known.filter((i) => i.orcid !== id)];
  store.current = id;
  writeStore(store);
  return identity;
}

export type AttestOutcome =
  | { status: "attested"; identity: Identity }
  | { status: "mismatch"; declared: string; attested: string };

/**
 * dev27 · L'ACCESSO SUL CAMPO — a StratiGraph node ATTESTS the identity: the
 * person entered with their iD and the node's password, offline, and the node
 * (`/v1/whoami` → `auth_mode: node_password`, `attested_by`) says it is them.
 *
 * Adopted when no identity was declared (the iD is read, not typed), recorded
 * on the declared one when it is the same, and NEVER put in the place of
 * another person's (the same rule as a verification). An attestation does not
 * make an identity `verified`: «attestata dal nodo» and «verificata da ORCID»
 * are two facts, and one that was verified before stays verified.
 */
export function attestIdentity(orcid: string, opts: {
  node: string; name?: string; accredited?: boolean; at?: string;
}): AttestOutcome {
  const id = normalizeOrcid(orcid);
  const store = readStore();
  const current = store.current ? store.known.find((i) => i.orcid === store.current) : undefined;
  if (current && current.orcid !== id)
    return { status: "mismatch", declared: current.orcid, attested: id };
  const identity: Identity = current ?? store.known.find((i) => i.orcid === id) ?? { orcid: id, verified: false };
  identity.authMode = "node_password";
  identity.attestedBy = opts.node;
  identity.attestedAt = opts.at ?? new Date().toISOString();
  if (opts.accredited !== undefined) identity.accredited = opts.accredited === true;
  if (opts.name && !identity.name) {
    const full = opts.name.trim();
    const sp = full.lastIndexOf(" ");
    if (sp > 0) { identity.name = full.slice(0, sp); identity.surname ??= full.slice(sp + 1); }
    else identity.name = full;
  }
  store.known = [identity, ...store.known.filter((i) => i.orcid !== id)];
  store.current = id;
  writeStore(store);
  return { status: "attested", identity };
}
