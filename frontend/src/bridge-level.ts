// MICRO-INSTALLER-PULSANTE p.3 · the bridge that answers is not the one this
// app expects.
//
// Measured on E.D.'s Windows (21 Oct 2026): the installer could not overwrite
// em-bridge.exe, «Ignore» kept the old one (level 33) while the app wanted 34,
// and the Space showed no models — with no word anywhere. The page reads the
// level in `/health` (`bridge_level`, DEV30 U9) and says, once per bridge, that
// it differs. Pure: the caller fetches and says.

export interface BridgeHealth {
  bridge_level?: unknown;
  pid?: unknown;
  started_at?: unknown;
  sidecar?: unknown;
}

export type LevelVerdict =
  | { kind: "same"; have: number; wanted: number }
  | { kind: "older" | "newer"; have: number | null; wanted: number };

/** the level the bridge says against the one the app wants; a bridge that
 *  says no level is older than DEV30 (`have: null`) */
export function bridgeLevelVerdict(health: BridgeHealth, wanted: number): LevelVerdict {
  const have = typeof health.bridge_level === "number" && Number.isFinite(health.bridge_level) ? health.bridge_level : null;
  if (have === wanted) return { kind: "same", have, wanted };
  return { kind: have !== null && have > wanted ? "newer" : "older", have, wanted };
}

/** one bridge, one sentence: the same base, level and process are said once */
export function levelKey(base: string, health: BridgeHealth): string {
  return `${base}\u0000${String(health.bridge_level ?? "")}\u0000${String(health.pid ?? health.started_at ?? "")}`;
}
