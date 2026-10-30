/**
 * CMD1 · the COMMAND channel — EMStudio conducts, Blender is the 3D arm.
 *
 * The live channel until now carried an ECHO (a selection there showed up here).
 * A command is a different kind of message and the difference matters: EMStudio
 * asks the host to **do** something in its scene — model the proxy for this
 * unit, import this asset — and what comes back is a **graph delta** that is
 * merged into the document. The result is DATA, so it outlives the session; the
 * socket is how it travelled, not where it lives.
 *
 * This module is pure: it mints ids and shapes messages. Sending, merging and
 * drawing belong to the caller.
 *
 * The graph-first claim this makes real: you reason in the graph, and the 3D
 * materialises in Blender on demand — rather than modelling first and hoping
 * the graph catches up.
 */

/** The verbs the protocol defines today. Small on purpose: a vocabulary
 *  invented before the two ends agree on the mechanism is how protocols rot. */
import { envelope, type WireMessage } from "./wire";

// MICRO-BLEND-OFFICINA-1 · `blend_apply`: «Apply» of «Check against the graph»
// sent to the Blender that has the .blend open (EM Tools' `commands.blend_apply`)
export const COMMAND_VERBS = ["create_proxy_for_unit", "import_geometry", "blend_apply"] as const;
export type CommandVerb = (typeof COMMAND_VERBS)[number];

/** The BODY of a `command` message. WIRE 2: the envelope (`v`, `type`,
 *  `source`) is `wire.ts`'s and is not repeated here — which is also what stops
 *  a future verb with a `target` or a `source` parameter from colliding with
 *  the wire's own words. */
export interface CommandBody {
  verb: CommandVerb;
  /** what the verb acts on: a US id, a ResourceNode id */
  target: string;
  params: Record<string, unknown>;
  /** deterministic over (verb, target, params) — see `commandId` */
  cmd_id: string;
}

export type CommandMessage = WireMessage & { payload: CommandBody };

export interface CommandResult {
  cmd_id: string;
  ok: boolean;
  delta?: { nodes?: unknown[]; edges?: unknown[] };
  error?: string;
  /** the host recognised this cmd_id and returned the first answer */
  repeated?: boolean;
  info?: Record<string, unknown>;
}

/**
 * The namespace of command ids. It MUST match `CMD_NAMESPACE` in
 * `sync_manager/commands.py`: the whole point of a deterministic id is that both
 * ends mint the same one, so a re-send is recognised as the same command by the
 * side that would otherwise build a second proxy.
 */
const CMD_NAMESPACE = "6f1f2f4a-3f2a-5c7e-9d1b-4a6c8e2f0b31";

/** Canonical JSON — sorted keys, no spaces — so two dictionaries that say the
 *  same thing hash the same. Without this the id would depend on key order,
 *  which nobody controls. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

/** uuid5 (SHA-1, name-based) — the same function Python's `uuid.uuid5` is. */
export function commandId(
  verb: string,
  target: string,
  params: Record<string, unknown> = {},
): string {
  const name = `${verb}|${target}|${canonical(params)}`;
  return uuid5(CMD_NAMESPACE, name);
}

export function buildCommand(
  verb: CommandVerb,
  target: string,
  params: Record<string, unknown> = {},
): CommandMessage {
  const body: CommandBody = {
    verb, target, params, cmd_id: commandId(verb, target, params),
  };
  const message = envelope("command", body as unknown as Record<string, unknown>);
  return message as CommandMessage;
}

// ── uuid5 ────────────────────────────────────────────────────────────────────
// RFC 4122 §4.3: SHA-1 over (namespace bytes ++ name bytes), version 5.
// Implemented here for the same reason `sha256.ts` is: `crypto.subtle` is async
// and absent over `file://`, and a command id that cannot be computed in the
// single-file build is a command id that does not exist where it is needed.

function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/-/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

function sha1(bytes: number[]): number[] {
  const ml = bytes.length * 8;
  const msg = bytes.slice();
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  // 64-bit length, big-endian; the high word is 0 for anything we hash here
  const hi = Math.floor(ml / 0x100000000);
  msg.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  msg.push((ml >>> 24) & 0xff, (ml >>> 16) & 0xff, (ml >>> 8) & 0xff, ml & 0xff);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Array<number>(80);
  const rol = (n: number, s: number): number => ((n << s) | (n >>> (32 - s))) >>> 0;

  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const tmp = (rol(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rol(b, 30); b = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out: number[] = [];
  for (const h of [h0, h1, h2, h3, h4])
    out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  return out;
}

export function uuid5(namespace: string, name: string): string {
  const bytes = hexToBytes(namespace).concat([...new TextEncoder().encode(name)]);
  const hash = sha1(bytes).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;      // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80;      // RFC 4122 variant
  const hex = hash.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
