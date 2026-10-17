/**
 * MICRO-PANNELLI-LATERALI p.2 · «Associa a un'unità» in the Inspector: the
 * units a sketch can be given to, in the order the person looks for them
 * (E.D., 17 Oct 2026):
 *
 *   1. the units WITHOUT a proxy of the epoch in the scene («orfane»);
 *   2. the units without a proxy of the other epochs, their epoch beside;
 *   3. the units that HAVE a proxy (◆), asked «Sostituisci / Aggiungi come parte».
 *
 * A search by name and a filter by type over all three, the counts per group.
 * Pure: the caller gives the units as it reads them from the graph.
 */

export interface AssocUnit {
  id: string;
  name: string;
  type: string;
  /** the epochs the unit lives in (ids), the first one first */
  epochs: string[];
  hasProxy: boolean;
  /** a geometry with no file: counted without a proxy */
  empty?: boolean;
}

export type AssocGroupKey = "here" | "elsewhere" | "withProxy";

export interface AssocGroups {
  here: AssocUnit[];
  elsewhere: AssocUnit[];
  withProxy: AssocUnit[];
  /** the types present, for the filter, in the order of `typeOrder` */
  types: string[];
}

const byName = (a: AssocUnit, b: AssocUnit) => a.name.localeCompare(b.name, undefined, { numeric: true });

/** The three groups, filtered by `query` (a part of the name, any case) and
 *  `type` ("" = every type). `epoch` is the scene's. */
export function assocGroups(units: AssocUnit[], epoch: string | null, query = "", type = "",
                            typeOrder: readonly string[] = []): AssocGroups {
  const q = query.trim().toLocaleLowerCase();
  const seen = new Set(units.map((u) => u.type));
  const rank = (t: string) => { const i = typeOrder.indexOf(t); return i < 0 ? typeOrder.length : i; };
  const types = [...seen].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const keep = units.filter((u) => (!q || u.name.toLocaleLowerCase().includes(q)) && (!type || u.type === type));
  const here: AssocUnit[] = [], elsewhere: AssocUnit[] = [], withProxy: AssocUnit[] = [];
  for (const u of keep) {
    if (u.hasProxy) withProxy.push(u);
    else if (epoch && u.epochs.includes(epoch)) here.push(u);
    else elsewhere.push(u);
  }
  // the scene's epoch first among those with a proxy too
  const inEpoch = (u: AssocUnit) => Number(!!epoch && u.epochs.includes(epoch));
  return { here: here.sort(byName), elsewhere: elsewhere.sort(byName),
    withProxy: withProxy.sort((a, b) => inEpoch(b) - inEpoch(a) || byName(a, b)), types };
}

/** The types a unit can be born with from a shape: the datamodel's
 *  stratigraphic types, without the abstract, the events, the continuity and
 *  the series (a series is not drawn by one proxy); US first. */
export const NEW_UNIT_ORDER = ["US", "USVs", "USVn", "USD", "SF", "VSF", "RSF", "USN", "USNt", "TSU", "UL"] as const;
export function newUnitTypes(stratigraphic: readonly string[]): string[] {
  const ok = stratigraphic.filter((t) => !/^ser/.test(t) && !["StratigraphicNode", "unknown", "SE", "BR"].includes(t));
  const rank = (t: string) => { const i = (NEW_UNIT_ORDER as readonly string[]).indexOf(t); return i < 0 ? NEW_UNIT_ORDER.length : i; };
  return ok.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
