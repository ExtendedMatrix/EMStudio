/**
 * P4.1 — the algebra that makes async and real-time the same thing.
 *
 * The twin of `s3dgraphy/crdt.py`, field for field and rule for rule. Two
 * implementations that never meet must be comparable on something: the shared
 * fixture (`testdata/crdt-parity.json`) and the canonical digest are that
 * something, and `scripts/check-crdt.mjs` pins the number.
 *
 * The thesis (design note `EM_design_P4_realtime-collaborazione.md`): co-editing
 * does not need a NEW mechanism, it needs P3's dated merge promoted to a CRDT.
 * One model — operations keyed by UUID, tombstones, LWW-per-field with the
 * editorial stamps as clocks — answers BOTH "integrate later" and "we are typing
 * at the same time". Async and real-time become the same thing at two latencies.
 *
 * This module is ONLY the algebra: no socket, no server, no UI. It is provable
 * on a table, which is why it is built first.
 */

import type { EmDocument } from "./types";

/** The four editorial stamps (AUDIT1). */
export const STAMP_KEYS = ["created_by", "created_at", "modified_by", "modified_at"];
/** Where the lazy per-field clocks live. */
export const FIELD_CLOCKS_KEY = "field_clocks";
/** Where the tombstone lives. */
export const REMOVED_KEY = "removed";
/** Everything in `data` that is metadata rather than content: comparing it as
 *  content would report a conflict about when somebody saved. */
export const META_KEYS = new Set([...STAMP_KEYS, FIELD_CLOCKS_KEY, REMOVED_KEY,
                                  "em_volatile_aux"]);

/** The closed set of operations. */
export const OPS = ["add_node", "update_field", "remove_node",
                    "add_edge", "remove_edge"] as const;
export type OpKind = (typeof OPS)[number];

/** Why one side won a field. `unstamped` means the DATE DID NOT DECIDE. */
export type FieldReason = "newer" | "tie-author" | "unstamped" | "resurrected";

export interface Clock {
  ts?: string | null;
  by?: string | null;
}

export type Payload = Record<string, unknown>;
type Section = Record<string, unknown>;

// ── clocks ───────────────────────────────────────────────────────────────────

export function clockOf(ts?: string | null, by?: string | null): Clock {
  const c: Clock = {};
  if (ts) c.ts = ts;
  if (by) c.by = by;
  return c;
}

export function isStamped(c: Clock): boolean {
  return !!c.ts;
}

function instant(ts?: string | null): number | null {
  if (!ts) return null;
  const t = Date.parse(String(ts));
  return Number.isNaN(t) ? null : t;
}

/**
 * `[order, reason]` — is `a` older, the same, or newer than `b`?
 *
 * `0` means the SAME clock, which is what makes an operation idempotent:
 * re-applying it is neither a win nor a loss, so nothing moves.
 *
 * One side unstamped: it loses, but the reason stays `unstamped` — a known
 * instant beats an unknown one, and calling that "newer" would claim knowledge
 * we do not have. An absent stamp is unknown, not older.
 */
export function compareClocks(a: Clock, b: Clock): [number, FieldReason] {
  const ia = instant(a.ts);
  const ib = instant(b.ts);
  if (ia === null && ib === null) return [0, "unstamped"];
  if (ia === null) return [-1, "unstamped"];
  if (ib === null) return [1, "unstamped"];
  if (ia > ib) return [1, "newer"];
  if (ia < ib) return [-1, "newer"];
  const ka = a.by ?? "";
  const kb = b.by ?? "";
  if (ka === kb) return [0, "tie-author"];
  if (!ka) return [-1, "tie-author"];
  if (!kb) return [1, "tie-author"];
  return ka < kb ? [1, "tie-author"] : [-1, "tie-author"];
}

export function clockOrder(a: Clock, b: Clock): number {
  return compareClocks(a, b)[0];
}

export function newerClock(a: Clock, b: Clock): Clock {
  return clockOrder(a, b) >= 0 ? a : b;
}

// ── reading a payload ────────────────────────────────────────────────────────

function dataOf(payload: Payload): Record<string, unknown> {
  const d = payload.data;
  return d && typeof d === "object" && !Array.isArray(d)
    ? (d as Record<string, unknown>)
    : {};
}

export function nodeStamp(payload: Payload): Clock {
  const data = dataOf(payload);
  if (data.modified_at) return clockOf(String(data.modified_at), data.modified_by as string);
  if (data.created_at) return clockOf(String(data.created_at), data.created_by as string);
  return {};
}

export function creationStamp(payload: Payload): Clock {
  const data = dataOf(payload);
  if (data.created_at) return clockOf(String(data.created_at), data.created_by as string);
  return {};
}

/**
 * The clock of ONE field. Its own when it has one — and the fallback is the
 * hinge on which field-level merging actually turns.
 *
 * No field clocks anywhere → the node's last hand answers for every field (a
 * node from a tool that does not keep them). SOME field clocks → the tool
 * stamps what it writes, so a field without one has not been touched since the
 * node was made, and it falls back to the CREATION — otherwise an edit somebody
 * made to a DIFFERENT field would overwrite this one.
 *
 * The contract that rule asks of editors: **if you write a field, stamp it.**
 */
export function fieldClock(payload: Payload, name: string): Clock {
  const clocks = dataOf(payload)[FIELD_CLOCKS_KEY];
  if (clocks && typeof clocks === "object") {
    const map = clocks as Record<string, Clock>;
    if (name in map) return map[name] ?? {};
    if (Object.keys(map).length) {
      const born = creationStamp(payload);
      if (isStamped(born)) return born;
    }
  }
  return nodeStamp(payload);
}

/** The removal mark of ONE field, or null (P4.1b). Same shape as the node's
 *  tombstone, one level down: the clock entry carries `removed: true`, and the
 *  KEY stays — an emptied field that simply vanished would be indistinguishable
 *  from one that was never there, and the merge would hand it back. */
export function fieldTombstone(payload: Payload, name: string): Clock | null {
  const clocks = dataOf(payload)[FIELD_CLOCKS_KEY];
  if (!clocks || typeof clocks !== "object") return null;
  const raw = (clocks as Record<string, Record<string, unknown>>)[name];
  if (raw && typeof raw === "object" && raw[REMOVED_KEY])
    return clockOf(raw.ts as string, raw.by as string);
  return null;
}

/** Every field this side KNOWS ABOUT: with a value, or deliberately emptied.
 *  A removed field is invisible to a view and must stay visible to the merge. */
export function knownFields(payload: Payload): string[] {
  const out = contentFields(payload);
  const clocks = dataOf(payload)[FIELD_CLOCKS_KEY];
  if (clocks && typeof clocks === "object") {
    for (const [name, raw] of Object.entries(clocks as Record<string, Record<string, unknown>>)) {
      if (raw && typeof raw === "object" && raw[REMOVED_KEY] && !out.includes(name))
        out.push(name);
    }
  }
  return out;
}

/** Keys the exporter lifts from the CLASS, not from an author. Never a conflict,
 *  and never a "somebody wrote this without stamping it". */
export const DERIVED_KEYS = new Set(["data.symbol", "data.label"]);

/**
 * Fields that carry a value and no clock, on a node that stamps its fields.
 *
 * The diagnostic behind the P4.1b contract. Honest about its limits: it reads a
 * STATE, so it cannot tell a constructor-set value from an edit that bypassed
 * `setField`. The exact guard belongs where the write happens — the store knows
 * which field it just changed, and warns in dev.
 */
export function unstampedFields(payload: Payload): string[] {
  const clocks = dataOf(payload)[FIELD_CLOCKS_KEY];
  if (!clocks || typeof clocks !== "object" || !Object.keys(clocks).length) return [];
  const map = clocks as Record<string, unknown>;
  return contentFields(payload).filter((n) => !(n in map) && !DERIVED_KEYS.has(n));
}

/** Does this side hold the field only because it copied it? (See the .py twin.) */
export function isStaleCopy(payload: Payload, name: string): boolean {
  const clocks = dataOf(payload)[FIELD_CLOCKS_KEY];
  if (!clocks || typeof clocks !== "object") return false;
  const map = clocks as Record<string, unknown>;
  return Object.keys(map).length > 0 && !(name in map);
}

export function clockSource(payload: Payload, name: string): string {
  const data = dataOf(payload);
  const clocks = data[FIELD_CLOCKS_KEY];
  if (clocks && typeof clocks === "object" && name in (clocks as object))
    return "field_clock";
  if (data.modified_at) return "modified_at";
  if (data.created_at) return "created_at";
  return "none";
}

export function tombstoneOf(payload: Payload): Clock | null {
  const raw = dataOf(payload)[REMOVED_KEY];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Clock;
  return clockOf(r.ts, r.by);
}

/**
 * Is this node deleted AS OF ITS OWN STATE?
 *
 * A tombstone older than an edit on the same node is not a deletion any more:
 * somebody wrote after somebody deleted, and the later hand wins. Deciding it
 * here (rather than "has a removed key") is what makes the resurrection
 * deliberate instead of accidental.
 */
export function isRemoved(payload: Payload): boolean {
  const mark = tombstoneOf(payload);
  if (!mark) return false;
  // a field REMOVAL is an edit like any other: somebody acted on this node
  for (const name of knownFields(payload)) {
    if (clockOrder(fieldClock(payload, name), mark) > 0) return false;
  }
  return true;
}

/** The addressable content fields: `name`, `description`, `data.<key>`.
 *  `id` and `node_type` are identity, not registers. */
export function contentFields(payload: Payload): string[] {
  const out: string[] = [];
  for (const key of ["name", "description"]) if (key in payload) out.push(key);
  const data = dataOf(payload);
  for (const key of Object.keys(data).sort()) {
    if (!META_KEYS.has(key)) out.push(`data.${key}`);
  }
  return out;
}

export function getField(payload: Payload, name: string): unknown {
  if (name.startsWith("data.")) return dataOf(payload)[name.slice(5)];
  return payload[name];
}

export function setField(payload: Payload, name: string, value: unknown): void {
  if (name.startsWith("data.")) {
    const data = (payload.data ??= {}) as Record<string, unknown>;
    if (value === undefined || value === null) delete data[name.slice(5)];
    else data[name.slice(5)] = value;
    return;
  }
  if (value === undefined || value === null) delete payload[name];
  else payload[name] = value;
}

/** Record a field's clock — lazily, and only when it says something.
 *  `removed` writes the FIELD TOMBSTONE (P4.1b): one place for "when was this
 *  field last touched", whether the touch was a value or an emptying. */
export function setFieldClock(payload: Payload, name: string, clock: Clock,
                              removed = false): void {
  if (!isStamped(clock)) return;
  const data = (payload.data ??= {}) as Record<string, unknown>;
  const clocks = (data[FIELD_CLOCKS_KEY] ??= {}) as Record<string, unknown>;
  const entry: Record<string, unknown> = { ...clockOf(clock.ts, clock.by) };
  if (removed) entry[REMOVED_KEY] = true;
  clocks[name] = entry;
}

/**
 * Write a field AND its clock, in ONE act (P4.1b).
 *
 * The cure for "remember to stamp what you write" is not discipline, it is
 * making the mistake impossible: one function, both things. A value written
 * without its clock is back-dated to the node's last save, and the next merge
 * quietly loses whoever's edit that was.
 */
export function writeField(payload: Payload, name: string, value: unknown,
                           clock: Clock): void {
  setField(payload, name, value);
  setFieldClock(payload, name, clock);
}

/**
 * Empty a field: drop the value, keep the KEY as a tombstone (P4.1b).
 *
 * Emptying is an act and must travel as one. Without the mark the other side
 * sees a field it has and I do not, keeps its own (P4.1: absence is not
 * deletion) and hands the value back — right for a field I never had, wrong for
 * one I deliberately emptied.
 */
export function clearField(payload: Payload, name: string, clock: Clock): void {
  setField(payload, name, null);
  setFieldClock(payload, name, clock, true);
}

/** The CONTENT of a payload, without clocks or stamps — for asking "did this
 *  change anything?" without a clock counting as a change. */
export function contentSignature(payload: Payload): string {
  const out: Record<string, unknown> = {};
  for (const name of contentFields(payload)) out[name] = getField(payload, name);
  return canonicalValue(out);
}

/** Canonical JSON — the bytes `crdt.py` produces for the same value. */
export function canonicalValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalValue(obj[k])}`)
    .join(",")}}`;
}

// ── the report ───────────────────────────────────────────────────────────────

export interface FieldOutcome {
  nodeId: string;
  field: string;
  reason: FieldReason;
  winner: { by: string | null; at: string | null; stamp: string; side: string;
            removed?: boolean };
  loser: { by: string | null; at: string | null; stamp: string; side: string;
           removed?: boolean };
  loserValue: unknown;
}

export interface MergeOutcome {
  payload: Payload;
  fields: FieldOutcome[];
  removed: boolean;
  resurrected: boolean;
}

// ── the core: merge two versions of the same node ────────────────────────────

export function mergePayloads(mine: Payload, theirs: Payload): MergeOutcome {
  const nodeId = String(mine.id ?? theirs.id ?? "");
  const merged: Payload = {
    id: nodeId,
    node_type:
      (clockOrder(nodeStamp(theirs), nodeStamp(mine)) > 0
        ? theirs.node_type
        : mine.node_type) ?? mine.node_type ?? theirs.node_type,
  };
  const outcome: MergeOutcome = { payload: merged, fields: [], removed: false,
                                  resurrected: false };

  // `knownFields`, not `contentFields`: a field somebody EMPTIED has no value and
  // must still take part, or the emptying is forgotten when the two sides meet.
  const mineFields = new Set(knownFields(mine));
  const theirFields = new Set(knownFields(theirs));
  const names = [...new Set([...mineFields, ...theirFields])];
  const winning: Record<string, Clock> = {};

  const land = (name: string, value: unknown, clock: Clock, gone: boolean): void => {
    if (gone) clearField(merged, name, clock);
    else setField(merged, name, value);
    winning[name] = clock;
  };

  for (const name of names) {
    const hasMine = mineFields.has(name);
    const hasTheirs = theirFields.has(name);
    const mineGone = fieldTombstone(mine, name) !== null;
    const theirsGone = fieldTombstone(theirs, name) !== null;
    const vMine = getField(mine, name);
    const vTheirs = getField(theirs, name);
    const cMine = hasMine ? fieldClock(mine, name) : {};
    const cTheirs = hasTheirs ? fieldClock(theirs, name) : {};

    // ONE side knows the field: its state lands, whatever that state is. A
    // removal is a state — it does not lose to an absence.
    if (!hasMine) { land(name, vTheirs, cTheirs, theirsGone); continue; }
    if (!hasTheirs) { land(name, vMine, cMine, mineGone); continue; }
    if (mineGone && theirsGone) {
      const c = newerClock(cMine, cTheirs);
      clearField(merged, name, c);
      winning[name] = c;
      continue;
    }
    if (!mineGone && !theirsGone
        && canonicalValue(vMine) === canonicalValue(vTheirs)) {
      setField(merged, name, vMine);
      winning[name] = newerClock(cMine, cTheirs);
      continue;
    }

    const [order, rawReason] = compareClocks(cMine, cTheirs);
    let reason: FieldReason = rawReason;
    let winSide: "mine" | "theirs";
    if (order === 0 && rawReason === "unstamped") winSide = "theirs";
    else winSide = order >= 0 ? "mine" : "theirs";
    const winClock = winSide === "mine" ? cMine : cTheirs;
    const loseClock = winSide === "mine" ? cTheirs : cMine;
    const winValue = winSide === "mine" ? vMine : vTheirs;
    const loseValue = winSide === "mine" ? vTheirs : vMine;
    const winGone = winSide === "mine" ? mineGone : theirsGone;
    const loseGone = winSide === "mine" ? theirsGone : mineGone;
    const winPayload = winSide === "mine" ? mine : theirs;
    const losePayload = winSide === "mine" ? theirs : mine;

    land(name, winValue, winClock, winGone);
    // a field emptied and then written again (or the reverse) is a RESURRECTION
    // at field level — the node's event, one level down, and it is reported
    if (loseGone && !winGone) reason = "resurrected";
    if (isStaleCopy(losePayload, name) && !isStaleCopy(winPayload, name)) continue;
    outcome.fields.push({
      nodeId, field: name, reason,
      winner: { by: winClock.by ?? null, at: winClock.ts ?? null,
                stamp: clockSource(winPayload, name), side: winSide,
                removed: winGone },
      loser: { by: loseClock.by ?? null, at: loseClock.ts ?? null,
               stamp: clockSource(losePayload, name),
               side: winSide === "mine" ? "theirs" : "mine", removed: loseGone },
      loserValue: loseValue,
    });
  }

  // field clocks either side already carried must survive, or a third merge
  // would fall back to the node stamp and could flip a field back
  for (const src of [mine, theirs]) {
    const clocks = dataOf(src)[FIELD_CLOCKS_KEY];
    if (!clocks || typeof clocks !== "object") continue;
    for (const [name, raw] of Object.entries(clocks as Record<string, Clock>)) {
      if (name in winning && clockOrder(raw ?? {}, winning[name]) === 0)
        // …WITHOUT losing the removal mark: a plain clock written over a field
        // tombstone would quietly bring the field back
        setFieldClock(merged, name, winning[name],
                      fieldTombstone(merged, name) !== null);
    }
  }

  // created = the EARLIER creation; modified = the latest clock anywhere
  const cMine = creationStamp(mine);
  const cTheirs = creationStamp(theirs);
  if (isStamped(cMine) || isStamped(cTheirs)) {
    const first = isStamped(cMine) && (!isStamped(cTheirs) || clockOrder(cMine, cTheirs) <= 0)
      ? cMine : cTheirs;
    const data = (merged.data ??= {}) as Record<string, unknown>;
    data.created_at = first.ts;
    if (first.by) data.created_by = first.by;
  }
  let last: Clock = {};
  for (const clock of [...Object.values(winning), nodeStamp(mine), nodeStamp(theirs)])
    last = newerClock(last, clock);
  if (isStamped(last)) {
    const data = (merged.data ??= {}) as Record<string, unknown>;
    data.modified_at = last.ts;
    if (last.by) data.modified_by = last.by;
  }

  // presence (OR-Set)
  const marks = [tombstoneOf(mine), tombstoneOf(theirs)].filter(Boolean) as Clock[];
  if (marks.length) {
    const mark = marks.length === 1 ? marks[0] : newerClock(marks[0], marks[1]);
    let beatenBy: [string, Clock] | null = null;
    for (const [name, clock] of Object.entries(winning)) {
      if (clockOrder(clock, mark) > 0) { beatenBy = [name, clock]; break; }
    }
    const data = (merged.data ??= {}) as Record<string, unknown>;
    if (!beatenBy) {
      data[REMOVED_KEY] = clockOf(mark.ts, mark.by);
      outcome.removed = true;
    } else {
      delete data[REMOVED_KEY];
      outcome.resurrected = true;
      const [name, clock] = beatenBy;
      outcome.fields.push({
        nodeId, field: name, reason: "resurrected",
        winner: { by: clock.by ?? null, at: clock.ts ?? null, stamp: "field_clock",
                  side: "edit" },
        loser: { by: mark.by ?? null, at: mark.ts ?? null, stamp: "removed",
                 side: "delete" },
        loserValue: null,
      });
    }
  }
  return outcome;
}

// ── operations ───────────────────────────────────────────────────────────────

export interface CrdtOp {
  op: OpKind;
  ts?: string;
  author?: string;
  [key: string]: unknown;
}

export interface OpResult {
  applied: boolean;
  reason: string;
  nodeId?: string;
  fields: FieldOutcome[];
}

export function makeOp(kind: OpKind, fields: Record<string, unknown> = {}): CrdtOp {
  if (!(OPS as readonly string[]).includes(kind))
    throw new Error(`unknown operation '${kind}'`);
  return { op: kind, ...fields } as CrdtOp;
}

function opClock(op: CrdtOp): Clock {
  return clockOf(op.ts as string, op.author as string);
}

// dev27 · the birth language, as s3Dgraphy's crdt reads it (no import of
// translation.ts: this module stays the pure mirror of crdt.py)
const BIRTH_EXEMPT = new Set(["resource", "resource_file", "translation", "graph",
  "annotation_region", "semantic_shape", "geo_position"]);
const TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$/;
const isTag = (v: unknown): v is string => typeof v === "string" && TAG.test(v.trim());

/** The study's working language as an em.json section declares it: the
 *  graph-self node's `data.language`, else the section's own. */
export function sectionLanguage(section: Section): string | null {
  for (const n of ((section.nodes ?? []) as Payload[])) {
    if ((n.node_type ?? n.type) === "graph") {
      const v = ((n.data ?? {}) as Record<string, unknown>).language;
      if (isTag(v)) return v.trim();
    }
  }
  const v = ((section as Record<string, unknown>).data as Record<string, unknown> | undefined)?.language;
  return isTag(v) ? v.trim() : null;
}

/** dev27 · an op's access mode (`auth`: "orcid" or {mode, attested_by}),
 *  normalised as s3Dgraphy `editorial.normalize_auth` does; null for none;
 *  `false` for one that is not valid (the op is refused). */
export function opAuth(op: CrdtOp): { mode: "orcid" | "node_password"; attested_by?: string } | null | false {
  let a = op.auth as unknown;
  if (a === undefined || a === null || a === "" ) return null;
  if (typeof a === "string") a = { mode: a };
  if (typeof a !== "object") return false;
  const o = a as Record<string, unknown>;
  if (o.mode === "orcid") return o.attested_by ? false : { mode: "orcid" };
  if (o.mode === "node_password") {
    const node = String(o.attested_by ?? "").trim();
    return node ? { mode: "node_password", attested_by: node } : false;
  }
  return Object.keys(o).length === 0 ? null : false;
}

function stampPayload(payload: Payload, clock: Clock, creation: boolean,
                      auth: { mode: string; attested_by?: string } | null = null): void {
  if (!isStamped(clock)) return;
  const data = (payload.data ??= {}) as Record<string, unknown>;
  if (creation && !data.created_at) {
    data.created_at = clock.ts;
    if (clock.by) {
      data.created_by = clock.by;
      if (auth) data.created_auth = { ...auth };
    }
  }
  if (clockOrder(clock, nodeStamp(payload)) >= 0) {
    data.modified_at = clock.ts;
    if (clock.by) {
      data.modified_by = clock.by;
      if (auth) data.modified_auth = { ...auth };
      else delete data.modified_auth;
    }
  }
}

/**
 * Apply ONE operation to an em.json graph section. Pure and testable.
 *
 * Every operation is idempotent: applying it twice changes nothing, because the
 * second application compares equal clocks and a tie is not a win. A refusal is
 * a normal answer — a stale op being stopped IS the CRDT working, and saying so
 * is what lets a caller tell "converged" from "dropped".
 */
export function applyOp(section: Section, op: CrdtOp): OpResult {
  const kind = String(op.op ?? "") as OpKind;
  if (!(OPS as readonly string[]).includes(kind))
    return { applied: false, reason: `unknown operation '${kind}'`, fields: [] };
  const clock = opClock(op);
  const nodes = ((section.nodes ??= []) as Payload[]);
  const edges = ((section.edges ??= []) as Payload[]);
  const byId = new Map(nodes.map((n) => [String(n.id), n]));

  if (kind === "add_node") {
    const payload = { ...((op.node ?? op.data ?? {}) as Payload) };
    const nodeId = String(op.id ?? payload.id ?? "");
    if (!nodeId) return { applied: false, reason: "add_node without an id", fields: [] };
    payload.id = nodeId;
    const auth = opAuth(op);
    if (auth === false)
      return { applied: false, reason: "the op's access mode is not orcid or node_password with its node: nothing was written",
               nodeId, fields: [] };
    stampPayload(payload, clock, true, auth);
    const existing = byId.get(nodeId);
    if (!existing) {
      // dev27 · rule A1 (s3Dgraphy crdt `_section_language`): a node born here
      // carries the language it is born in — the op's own, else the study's as
      // this section declares it, else none; a merge never rewrites it
      const lang = sectionLanguage(section);
      const type = String(payload.node_type ?? payload.type ?? "");
      const data = (payload.data ??= {}) as Record<string, unknown>;
      if (lang && !BIRTH_EXEMPT.has(type) && !isTag(data.lang)) data.lang = lang;
      nodes.push(payload);
      return { applied: true, reason: "added", nodeId, fields: [] };
    }
    const outcome = mergePayloads(existing, payload);
    const i = nodes.findIndex((n) => String(n.id) === nodeId);
    nodes[i] = outcome.payload;
    return { applied: true, reason: "merged", nodeId, fields: outcome.fields };
  }

  if (kind === "update_field") {
    const nodeId = String(op.node_id ?? op.id ?? "");
    const name = String(op.field ?? "");
    const existing = byId.get(nodeId);
    if (!existing)
      return { applied: false, reason: `node '${nodeId}' is not here`, nodeId, fields: [] };
    if (!name || (name !== "name" && name !== "description" && !name.startsWith("data.")))
      return { applied: false, reason: `'${name}' is not an addressable field`,
               nodeId, fields: [] };
    if (opAuth(op) === false)
      return { applied: false, reason: "the op's access mode is not orcid or node_password with its node: nothing was written",
               nodeId, fields: [] };
    const current = fieldClock(existing, name);
    const [order, reason] = compareClocks(clock, current);
    const gone = fieldTombstone(existing, name) !== null;
    const wantsGone = op.remove === true;
    const sameValue = gone === wantsGone
      && canonicalValue(getField(existing, name)) === canonicalValue(op.value);
    if (order < 0 || (order === 0 && sameValue))
      return { applied: false, reason: order < 0 ? "stale" : "idempotent", nodeId,
               fields: [] };
    const loserValue = getField(existing, name);
    // ONE act, the same one an editor performs: a value with its clock, or an
    // emptying with its tombstone (`remove: true`).
    if (wantsGone) clearField(existing, name, clock);
    else writeField(existing, name, op.value, clock);
    stampPayload(existing, clock, false, opAuth(op) || null);
    return {
      applied: true, reason: "set", nodeId,
      fields: [{
        nodeId, field: name, reason,
        winner: { by: clock.by ?? null, at: clock.ts ?? null, stamp: "field_clock",
                  side: "op" },
        loser: { by: current.by ?? null, at: current.ts ?? null,
                 stamp: clockSource(existing, name), side: "state" },
        loserValue,
      }],
    };
  }

  if (kind === "remove_node") {
    const nodeId = String(op.id ?? op.node_id ?? "");
    const existing = byId.get(nodeId);
    if (!existing)
      return { applied: false, reason: `node '${nodeId}' is not here`, nodeId, fields: [] };
    const mark = tombstoneOf(existing);
    if (mark && clockOrder(clock, mark) <= 0)
      return { applied: false, reason: "already removed, not older", nodeId, fields: [] };
    ((existing.data ??= {}) as Record<string, unknown>)[REMOVED_KEY] =
      clockOf(clock.ts, clock.by);
    return { applied: true, reason: "removed", nodeId, fields: [] };
  }

  if (kind === "add_edge") {
    const edge: Payload = {
      id: String(op.id ?? ""),
      edge_type: op.edge_type,
      source: op.source,
      target: op.target,
    };
    if (!edge.id) edge.id = `${edge.source}__${edge.edge_type}__${edge.target}`;
    const declared = declaredEdgeAttributes(op.attributes);
    const triple = `${edge.source}|${edge.edge_type}|${edge.target}`;
    for (const existing of edges) {
      if (`${existing.source}|${existing.edge_type}|${existing.target}` !== triple) continue;
      const attrs = ((existing.attributes ??= {}) as Record<string, unknown>);
      let learned = mergeDeclared(attrs, declared);
      // the relation was created by its OLDEST add, whichever arrives first:
      // without this two adds converge only in one order
      const born = clockOf(attrs.created_at as string | undefined, attrs.created_by as string | undefined);
      if (isStamped(clock) && (!isStamped(born) || clockOrder(clock, born) < 0)) {
        Object.assign(attrs, { created_at: clock.ts, created_by: clock.by });
        learned = true;
      }
      const mark = (attrs[REMOVED_KEY] ?? {}) as Clock;
      if (isStamped(mark) && clockOrder(clock, mark) > 0) {
        delete attrs[REMOVED_KEY];
        return { applied: true, reason: "resurrected", fields: [] };
      }
      if (!Object.keys(attrs).length) delete existing.attributes;
      return learned ? { applied: true, reason: "declared", fields: [] }
                     : { applied: false, reason: "idempotent", fields: [] };
    }
    const attrs: Record<string, unknown> = { ...declared };
    if (isStamped(clock)) Object.assign(attrs, { created_at: clock.ts, created_by: clock.by });
    if (Object.keys(attrs).length) edge.attributes = attrs;
    edges.push(edge);
    return { applied: true, reason: "added", fields: [] };
  }

  // remove_edge
  const edgeId = String(op.id ?? "");
  const triple = `${op.source}|${op.edge_type}|${op.target}`;
  for (const existing of edges) {
    const same = String(existing.id) === edgeId
      || `${existing.source}|${existing.edge_type}|${existing.target}` === triple;
    if (!same) continue;
    const attrs = ((existing.attributes ??= {}) as Record<string, unknown>);
    const mark = (attrs[REMOVED_KEY] ?? {}) as Clock;
    if (isStamped(mark) && clockOrder(clock, mark) <= 0)
      return { applied: false, reason: "already removed, not older", fields: [] };
    attrs[REMOVED_KEY] = clockOf(clock.ts, clock.by);
    return { applied: true, reason: "removed", fields: [] };
  }
  return { applied: false, reason: "no such relation", fields: [] };
}

/**
 * CATENA · the attributes an `add_edge` DECLARES about the relation — today
 * `inherited: true` on an heir's `has_property` (connections 1.6.23). The
 * bookkeeping keys are the clock's, never the op's: `created_at`/`created_by`
 * come from the op's clock and `removed` from a `remove_edge`, so an op that
 * carried them would be forging a stamp. Same rule in s3dgraphy `crdt.py`.
 */
const EDGE_CLOCK_KEYS = new Set([REMOVED_KEY, "created_at", "created_by"]);
function declaredEdgeAttributes(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw as Record<string, unknown>).sort()) {
    if (!EDGE_CLOCK_KEYS.has(k)) out[k] = (raw as Record<string, unknown>)[k];
  }
  return out;
}
/**
 * Fold declarations into an edge that already exists. Commutative, so two
 * adds of one relation converge in any order: a key nobody declared is taken,
 * and two different values of one key settle on the greater JSON (a rule with no
 * clock in it, because a declaration is not an edit of a field). True when the
 * edge learned something.
 */
function mergeDeclared(attrs: Record<string, unknown>, declared: Record<string, unknown>): boolean {
  let learned = false;
  for (const [k, v] of Object.entries(declared)) {
    if (!(k in attrs)) { attrs[k] = v; learned = true; continue; }
    if (JSON.stringify(v) > JSON.stringify(attrs[k])) { attrs[k] = v; learned = true; }
  }
  return learned;
}

export function applyOps(section: Section, ops: CrdtOp[]): OpResult[] {
  return ops.map((op) => applyOp(section, op));
}

// ── views ────────────────────────────────────────────────────────────────────

/** The nodes a VIEW should show: everything not tombstoned. The merge sees the
 *  tombstones; a view must not — that split is what makes them work. */
export function liveNodes(section: Section): Payload[] {
  return ((section.nodes ?? []) as Payload[]).filter((n) => !isRemoved(n));
}

export function liveEdges(section: Section): Payload[] {
  return ((section.edges ?? []) as Payload[]).filter((e) => {
    const mark = ((e.attributes ?? {}) as Record<string, unknown>)[REMOVED_KEY] as Clock;
    return !isStamped(mark ?? {});
  });
}

/** The live view of a whole document — what a canvas should draw. */
export function liveDocument(doc: EmDocument): EmDocument {
  const graph = doc.graph as unknown as Section;
  return {
    ...doc,
    graph: { ...(graph as object), nodes: liveNodes(graph), edges: liveEdges(graph) },
  } as EmDocument;
}
