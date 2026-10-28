// Matrix view: the Extended Matrix swimlane projection. Geometry comes from
// the .em.json layout section (em-cli `layout` / em-core WASM); folding is
// a view-state projection. Every EM node group is a yEd-style container:
//
//  * ParadataNodeGroup — "relocate" mode: members are pulled into a grid
//    inside the box (their canvas position is the box), swimlanes expand
//    dynamically when the box needs room;
//  * ActivityNodeGroup / TimeBranchNodeGroup / LocationNodeGroup —
//    "outline" mode: the layout engine already placed the members in a
//    contiguous band (layout v3), the box is drawn AROUND them without
//    moving anything.
import { buildMembership, type FoldedView } from "../folding";
import { BAND_GAP } from "../scene";
import type { Scene, SceneGroup, SceneNode, SubBand } from "../scene";
import type { EmDocument } from "../types";
import { threedInstances, viewIndex, viewInstances, type ViewInstance } from "../paradata-view";
import { paradataGroupScene, reattachedReadings } from "./pd-arrange";
import { isRemoved } from "../crdt";
import { t } from "../i18n";
import { ancestorsOf, endReasonLabel, isContinuityType, isVirtualType } from "../rules";
import { continuityKind, continuityLinks, continuityPlace, endReasonOf, endReasonWritten } from "../continuity";

/**
 * TOCCARE · the re-stack, remembered.
 *
 * Two passes below move nodes for the VIEW: the phase sub-bands translate each
 * band rigidly so it starts at a cursor (`delta = cursor − band top`), and the
 * swimlane re-stack grows a lane upwards by whatever pokes above it (`top`).
 * Both read the CURRENT positions, so both used to answer a hand-moved node by
 * moving it back: nudge the topmost node of a band 3 px down and the band's top
 * moves 3 px down, the delta shrinks by 3, and the node is drawn exactly where it
 * was — with every other node of the band 3 px higher. That is the «nodo
 * inchiodato» of the night of 30 set, measured, and it cannot be fixed by
 * storing the position better: the position WAS stored.
 *
 * So the translations are computed when the STRUCTURE of the view changes and
 * then kept: `key` says what the structure was (main.ts builds it from the
 * em-core swimlanes, the shown phases, the folds, the filters and the node
 * count, plus a counter bumped by an explicit «Riordina»). With the same key the
 * band deltas and the lane `top` growths are reused, so moving a node — or
 * changing its epoch — moves that node and nothing else. Lanes still grow
 * DOWNWARDS when content passes their bottom (pushing the lanes below), never
 * upwards: growing upwards is what dragged the whole lane along.
 */
export interface RestackMemo {
  key: string;
  /** `${laneId}|${bandKey}` → the band's translation */
  band: Map<string, number>;
  /** lane id → the upward growth (`top`) of the lane */
  top: Map<string, number>;
}

export function newRestackMemo(): RestackMemo {
  return { key: "", band: new Map(), top: new Map() };
}

export const GROUP_HEADER = 20;
export const GROUP_PAD = 12;
const CELL_GAP = 14;
export const LANE_PAD = 14;
const CLOSED_W = 150;
const CLOSED_H = 40;

/**
 * Groups whose members are RELOCATED into the box (grid). Empty since the
 * engine allocates a dedicated sub-band column slot to every nested group
 * (layout v3.1): all EM node groups are now outline containers around
 * engine-placed members. The relocate machinery stays for view-only spaces.
 */
export const CONTAINER_TYPES = new Set<string>([]);
/** groups drawn as an outline around their engine-placed members */
export const OUTLINE_TYPES = new Set([
  "ActivityNodeGroup",
  "ParadataNodeGroup",
  "TimeBranchNodeGroup",
  "LocationNodeGroup",
]);

export function buildMatrixScene(
  doc: EmDocument,
  view?: FoldedView,
  layoutOverride?: EmDocument["layout"],
  /** epochs whose phases (sub-epochs) are shown as lane sub-bands. When an
   *  epoch is absent, its phases are hidden and all its units render in the
   *  single epoch lane. View-state only — never touches the document. */
  phasesVisible?: Set<string>,
  /** epoch/phase ids with a chronology-coherence conflict → warning marker */
  warnIds?: Set<string>,
  /** TOCCARE · the remembered re-stack, and the key of the structure it was
   *  computed for (see RestackMemo). Without it every build re-flows. */
  memo?: RestackMemo,
  memoKey?: string,
): Scene | null {
  const frozen = !!memo && memoKey !== undefined && memo.key === memoKey;
  if (memo && !frozen) {
    memo.key = memoKey ?? "";
    memo.band.clear();
    memo.top.clear();
  }
  // A layoutOverride (a VIEW layout computed by em-core on the filtered
  // subgraph) recompacts the Matrix when detail-rings hide nodes, so hidden
  // nodes leave no gaps — the archival doc.layout is untouched (folding carried
  // over from it).
  const layout = layoutOverride
    ? { ...layoutOverride, folded_groups: doc.layout?.folded_groups }
    : doc.layout;
  const positions = layout?.positions;
  if (!layout || !positions || !Object.keys(positions).length) return null;

  const nodes = view?.nodes ?? doc.graph.nodes;
  const edges = view?.edges ?? doc.graph.edges;
  const nodeById = new Map(doc.graph.nodes.map((n) => [n.id, n]));
  const asStr = (v: unknown): string | undefined =>
    v != null && v !== "" ? String(v) : undefined;
  const folded = new Set(layout.folded_groups ?? []);
  const pinnedSet = new Set(doc.layout?.pinned ?? []);
  // B1 · a time projection: places are not its containers (em-core agrees)
  const membership = buildMembership(doc, { temporal: true });

  const scene: Scene = {
    nodes: [],
    byId: new Map(),
    edges: [],
    lanes: [],
    groups: [],
    groupsById: new Map(),
    memberOf: new Map(),
  };

  // phases (sub-epochs) are EpochNodes too, so a full em-core relayout gives
  // them their own swimlane — but they must NOT appear as top-level lanes
  // (they render as lane sub-bands later). Drop phase lanes here.
  const phaseIds = new Set<string>();
  for (const e of doc.graph.edges)
    if (e.edge_type === "has_sub_epoch") phaseIds.add(e.target);
  for (const lane of [...(layout.swimlanes ?? [])].sort((a, b) => a.y - b.y)) {
    if (phaseIds.has(lane.epoch_id)) continue; // sub-epoch, not a top-level lane
    const epoch = nodeById.get(lane.epoch_id);
    // G4 · a lane whose epoch is not in this graph is another graph's (an old
    // file's layout given to the wrong graph, dev.17): it is not drawn, and its
    // id never becomes a label
    if (!epoch) continue;
    const ed = (epoch?.data as Record<string, unknown> | undefined) ?? {};
    const ecolor = ed.color;
    const asText = (v: unknown): string | undefined =>
      v != null && v !== "" ? String(v) : undefined;
    // G4 · an epoch with no name is «Unnamed epoch», never its id
    const ename = String(epoch?.name ?? "").trim();
    scene.lanes.push({
      id: lane.epoch_id,
      label: ename || t("lane.unnamed"),
      unnamed: !ename,
      y: lane.y,
      height: lane.height,
      color: typeof ecolor === "string" && ecolor ? ecolor : undefined,
      start: asText(ed.start_time),
      end: asText(ed.end_time),
      warn: warnIds?.has(lane.epoch_id),
    });
  }

  // lane index of a world-y (used by the epoch-paradata anchoring below AND the
  // container/expansion passes), plus the node→lane map the expansion reads.
  const laneIdxOfY = (cy: number): number => {
    for (let i = 0; i < scene.lanes.length; i++) {
      const l = scene.lanes[i];
      if (cy >= l.y && cy < l.y + l.height) return i;
    }
    return scene.lanes.length - 1;
  };
  const laneOf = new Map<string, number>(); // node id → lane index

  // ---- epoch / phase temporal PDG → "PD" tag ------------------------------
  // An epoch's (or phase's) temporal ParadataNodeGroup is NOT drawn as a box on
  // the canvas; it is represented by a small "PD" tag in the lane / band label
  // chip (click to enter the group). So build the epoch/phase→PDG lookup (for
  // the tag + its click target) and HIDE the PDG nodes (group + members) from
  // the Matrix — they live behind the tag. The Graph view still shows them.
  const parentOfPhase = new Map<string, string>(); // phase → immediate parent
  for (const e of doc.graph.edges)
    if (e.edge_type === "has_sub_epoch") parentOfPhase.set(e.target, e.source);
  const topEpochOf = (id: string): string => {
    let cur = id;
    const seen = new Set<string>();
    while (parentOfPhase.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = parentOfPhase.get(cur)!;
    }
    return cur;
  };
  // any EpochNode (top-level epoch OR phase) → its temporal PDG id
  const pdgOfEpochNode = new Map<string, string>();
  for (const e of doc.graph.edges)
    if (
      e.edge_type === "has_paradata_nodegroup" &&
      nodeById.get(e.source)?.node_type === "EpochNode"
    )
      pdgOfEpochNode.set(e.source, e.target);
  const pdgOfPhase = pdgOfEpochNode; // phases are EpochNodes too — same lookup
  // PD1 · a NON-epoch PDG (attached to a stratigraphic node via
  // has_paradata_nodegroup) collapses, when folded, to a tablet on that node
  // instead of a closed box. Epoch/phase PDGs keep the lane "PD" tag.
  const pdReferentNode = new Map<string, string>(); // pdg id → referent node id
  for (const e of doc.graph.edges)
    if (
      e.edge_type === "has_paradata_nodegroup" &&
      nodeById.get(e.source)?.node_type !== "EpochNode"
    )
      pdReferentNode.set(e.target, e.source);
  // BUGFIX-PDG · the ONE condition for "this PDG is collapsed to a bottom-left
  // tablet" (PD1). Shared by every path — the SceneNode (skip as a box), the
  // SceneGroup pass (do not generate a box at all), the drawn edges (drop the
  // has_paradata_nodegroup / is_in_paradata_nodegroup lines to it), and
  // hit-testing — so they cannot drift and leave a phantom body or connector.
  const isCollapsedTablet = (id: string): boolean =>
    folded.has(id) &&
    nodeById.get(id)?.node_type === "ParadataNodeGroup" &&
    pdReferentNode.has(id);
  const propsOfPdg = new Map<string, string[]>(); // PDG id → member ids
  for (const e of doc.graph.edges)
    if (e.edge_type === "is_in_paradata_nodegroup") {
      const arr = propsOfPdg.get(e.target);
      if (arr) arr.push(e.source);
      else propsOfPdg.set(e.target, [e.source]);
    }
  // PDG nodes (group + members) hidden from the Matrix — reached via the tag
  const hiddenEpochPdg = new Set<string>();
  for (const [, pdg] of pdgOfEpochNode) {
    hiddenEpochPdg.add(pdg);
    for (const p of propsOfPdg.get(pdg) ?? []) hiddenEpochPdg.add(p);
  }
  // ALSO hide ORPHAN ParadataNodeGroups — a "· paradata" group with no incoming
  // has_paradata_nodegroup edge is a leftover (e.g. from an older delete-phase
  // that didn't clean it up); it would otherwise render as a stray box.
  const pdgTargets = new Set<string>();
  for (const e of doc.graph.edges)
    if (e.edge_type === "has_paradata_nodegroup") pdgTargets.add(e.target);
  for (const n of doc.graph.nodes)
    if (n.node_type === "ParadataNodeGroup" && !pdgTargets.has(n.id)) {
      hiddenEpochPdg.add(n.id);
      for (const p of propsOfPdg.get(n.id) ?? []) hiddenEpochPdg.add(p);
    }
  // give each lane its epoch's PDG id so the renderer draws the "PD" tag
  for (const lane of scene.lanes)
    lane.paradataGroupId = pdgOfEpochNode.get(lane.id);

  // MICRO-PROPRIETA-PARADATI p.2 · a paradata node born after the archival
  // layout (an extractor added from the Inspector, its new document, the
  // combiner of a second source) has no stored position, and a node without
  // one was never drawn: D.01.61 under `geometry` of SU020 stayed out of the
  // Matrix and of PD_SU020. It takes, for the view only, the place of its unit's
  // paradata group, sized as a sibling: an open group arranges it with the
  // others (`paradataGroupScene`), a folded one hides it. Nothing is written.
  const pdgOfMember = new Map<string, string>();
  for (const [pdg, ms] of propsOfPdg)
    if (pdReferentNode.has(pdg)) for (const m of ms) if (!pdgOfMember.has(m)) pdgOfMember.set(m, pdg);
  const sizeOfType = new Map<string, { w: number; h: number }>();
  const provisional = (id: string): { x: number; y: number; w: number; h: number } | undefined => {
    const pdg = pdgOfMember.get(id);
    const at = pdg ? positions[pdg] : undefined;
    if (!pdg || !at) return undefined;
    // sized as a node of its own type (a member of the group first)
    const type = nodeById.get(id)?.node_type ?? "";
    let size = sizeOfType.get(type);
    if (!size) {
      const same = (m: string) => m !== id && nodeById.get(m)?.node_type === type && !!positions[m];
      const sib = (propsOfPdg.get(pdg) ?? []).find(same) ?? doc.graph.nodes.find((n) => same(n.id))?.id;
      size = sib ? { w: positions[sib].w, h: positions[sib].h } : { w: 120, h: 30 };
      sizeOfType.set(type, size);
    }
    return { x: at.x, y: at.y, ...size };
  };

  // base placement from the stored layout
  const relocateIds: string[] = [];
  const outlineIds: string[] = [];
  const normal: SceneNode[] = [];
  for (const node of nodes) {
    // in the swimlane projection the epoch IS the lane — epochs render as
    // nodes only in graph view (E.D., 12 July 2026)
    if (node.node_type === "epoch" || node.node_type === "EpochNode") continue;
    // epoch/phase temporal PDGs are represented by a "PD" tag in the label chip,
    // not a box — drop the group + its members here (Matrix-only; Graph keeps them)
    if (hiddenEpochPdg.has(node.id)) continue;
    // B1 (#25) · a place is not drawn in the time projection, even when a
    // layout saved before the rule still holds a position for it
    if (ancestorsOf(node.node_type).includes("LocationNodeGroup")) continue;
    const r = positions[node.id] ?? provisional(node.id);
    if (!r) continue;
    const sn: SceneNode = {
      id: node.id,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      node,
      badge: view?.badges.get(node.id),
      pinned: pinnedSet.has(node.id),
      adornments: view?.adornments?.get(node.id),
      // PD1/BUGFIX-PDG · a folded PDG shown as a bottom-left tablet is never a
      // node: mark it so drawing, the connect handle and hit-testing skip it.
      collapsed: isCollapsedTablet(node.id),
      // FONTE · a trace the view kept (a live chain still reads it)
      ...(isRemoved(node as unknown as Record<string, unknown>) ? { trace: true } : {}),
    };
    scene.byId.set(node.id, sn);
    // outline containers: group-type nodes AND any stratigraphic node that
    // physically contains others. Containment follows the PRIMARY parent
    // (engine-consistent): a shared node lives in ONE box, its other
    // memberships stay visible as edges (yEd single-parent semantics).
    const hasMembers =
      (membership.childrenOf.get(node.id)?.filter((m) => m !== node.id)
        .length ?? 0) > 0;
    if (CONTAINER_TYPES.has(node.node_type)) {
      relocateIds.push(node.id);
    } else if (OUTLINE_TYPES.has(node.node_type) || hasMembers) {
      outlineIds.push(node.id);
    } else {
      normal.push(sn);
    }
  }

  // containers first (drawn under their members): outlines are the
  // outermost boxes, then relocate boxes, then plain nodes
  const outlineNodes = outlineIds.map((id) => scene.byId.get(id)!);
  const containerNodes = relocateIds.map((id) => scene.byId.get(id)!);
  scene.nodes = [...outlineNodes, ...containerNodes, ...normal];

  // ---- phase (sub-epoch) re-homing --------------------------------------
  // Phase lanes were dropped above (they never show as top-level lanes), but
  // their member units must still render inside the PARENT epoch's lane. We
  // assign those nodes the parent lane so the swimlane-expansion pass grows it
  // to hold them. Two sources, both robust to em-core's flat epoch ordering:
  //   1. EM attribution edges (has_first_epoch / survive_in_epoch) → phase;
  //   2. a geometric catch-all for anything em-core placed inside a dropped
  //      phase lane's rect (e.g. paradata that inherited the phase's lane).
  // `phasesVisible` (view state) will later split the lane into sub-bands
  // (Step B); when an epoch is hidden its units simply share the one lane.
  const showPhases = phasesVisible ?? new Set<string>();
  const laneIndexOf = new Map<string, number>();
  scene.lanes.forEach((l, i) => laneIndexOf.set(l.id, i));
  if (phaseIds.size) {
    // em-core swimlane rect per top-level epoch (compact allocation)
    const swimOf = new Map(
      (layout.swimlanes ?? []).map((l) => [l.epoch_id, l]),
    );
    // 1. membership-based re-homing of phase members to the parent epoch's lane —
    // but ONLY when the member actually sits within the parent's compact swimlane
    // band. em-core can scatter a unit far into another epoch's rows (a
    // conflicting is_after → laid out below its older predecessor); such an
    // outlier stays where it is (as it did pre-phase), instead of being pulled
    // into the parent lane and ballooning it into a giant mostly-empty band.
    for (const e of doc.graph.edges) {
      if (e.edge_type !== "has_first_epoch" && e.edge_type !== "survive_in_epoch")
        continue;
      if (!phaseIds.has(e.target)) continue;
      const top = topEpochOf(e.target);
      const li = laneIndexOf.get(top);
      const sn = scene.byId.get(e.source);
      if (li == null || !sn) continue;
      const sw = swimOf.get(top);
      if (sw) {
        const cy = sn.y + sn.h / 2;
        if (cy < sw.y || cy >= sw.y + sw.height) continue; // scattered → leave put
      }
      laneOf.set(e.source, li);
    }
    // 2. geometric catch-all: nodes inside a dropped phase lane's rect
    const droppedPhaseRects: { y: number; h: number; li: number }[] = [];
    for (const lane of layout.swimlanes ?? []) {
      if (!phaseIds.has(lane.epoch_id)) continue;
      const li = laneIndexOf.get(topEpochOf(lane.epoch_id));
      if (li != null) droppedPhaseRects.push({ y: lane.y, h: lane.height, li });
    }
    for (const sn of scene.byId.values()) {
      if (laneOf.has(sn.id)) continue;
      const cy = sn.y + sn.h / 2;
      for (const r of droppedPhaseRects)
        if (cy >= r.y && cy < r.y + r.h) {
          laneOf.set(sn.id, r.li);
          break;
        }
    }
  }

  // ---- resolve rule anchors (view-side, compact) ----
  // layout.anchors carries the RULE: a node placed at a CORNER of a container
  // (epoch lane) + offset. em-core also resolves anchors (for headless/CLI and
  // portability, e.g. Heriverse), but the VIEW re-resolves against the COMPACT
  // scene: container content = nodes whose CENTRE falls in the lane's y-band
  // (position-based), so a node em-core scattered into another lane's rows
  // (attributed here but edge-pulled elsewhere) does NOT inflate this lane. That
  // keeps the epoch paradata box tight under its lane's real content instead of
  // trailing a far-flung outlier. laneOf is set so the re-stack sizes the lane.
  const anchorList = doc.layout?.anchors ?? [];
  if (anchorList.length) {
    const laneById = new Map(scene.lanes.map((l, i) => [l.id, i]));
    const anchoredIds = new Set(anchorList.map((a) => a.node));
    for (const a of anchorList) {
      const laneIdx = laneById.get(a.to);
      if (laneIdx == null) continue;
      const node = scene.byId.get(a.node);
      if (!node) continue;
      const lane = scene.lanes[laneIdx];
      let minx = Infinity;
      let miny = Infinity;
      let maxx = -Infinity;
      let maxy = -Infinity;
      for (const sn of scene.byId.values()) {
        if (anchoredIds.has(sn.id)) continue;
        const cy = sn.y + sn.h / 2;
        if (cy >= lane.y && cy < lane.y + lane.height) {
          minx = Math.min(minx, sn.x);
          miny = Math.min(miny, sn.y);
          maxx = Math.max(maxx, sn.x + sn.w);
          maxy = Math.max(maxy, sn.y + sn.h);
        }
      }
      if (!Number.isFinite(minx)) {
        minx = 0;
        maxx = 0;
        miny = lane.y;
        maxy = lane.y;
      }
      const corner = a.corner || "bl";
      node.x = (corner.includes("r") ? maxx : minx) + (a.dx ?? 0);
      node.y = (corner.includes("t") ? miny : maxy) + (a.dy ?? 0);
      laneOf.set(a.node, laneIdx);
    }
  }

  // ---- container pass: relocate members inside open boxes ----
  for (const g of containerNodes) {
    if (folded.has(g.id)) {
      g.w = CLOSED_W;
      g.h = CLOSED_H;
      continue; // members are already hidden by the folding projection
    }
    const memberIds = (membership.membersOf.get(g.id) ?? []).filter((m) =>
      scene.byId.has(m),
    );
    if (!memberIds.length) continue;
    const space = layout.group_spaces?.[g.id] ?? {};
    const originX = g.x + GROUP_PAD;
    const originY = g.y + GROUP_HEADER + GROUP_PAD;

    // auto-grid defaults for members without a stored local position
    // (narrow grid: keeps the box inside its band, less outline overlap)
    const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(memberIds.length))));
    let gi = 0;
    let maxW = 0;
    let maxH = 0;
    for (const m of memberIds) {
      const sn = scene.byId.get(m)!;
      maxW = Math.max(maxW, sn.w);
      maxH = Math.max(maxH, sn.h);
    }
    for (const m of memberIds) {
      const sn = scene.byId.get(m)!;
      const local = space[m];
      if (local) {
        sn.x = originX + local.x;
        sn.y = originY + local.y;
      } else {
        sn.x = originX + (gi % cols) * (maxW + CELL_GAP);
        sn.y = originY + Math.floor(gi / cols) * (maxH + CELL_GAP);
        gi++;
      }
      scene.memberOf!.set(m, g.id);
    }
    // box from members' bbox
    let mx = Infinity,
      my = Infinity,
      Mx = -Infinity,
      My = -Infinity;
    for (const m of memberIds) {
      const sn = scene.byId.get(m)!;
      mx = Math.min(mx, sn.x);
      my = Math.min(my, sn.y);
      Mx = Math.max(Mx, sn.x + sn.w);
      My = Math.max(My, sn.y + sn.h);
    }
    g.w = Math.max(CLOSED_W, Mx - g.x + GROUP_PAD);
    g.h = Math.max(CLOSED_H + 20, My - g.y + GROUP_PAD);
    // members always share the group's lane for the expansion pass
    const gLane = laneIdxOfY(g.y + GROUP_HEADER / 2);
    laneOf.set(g.id, gLane);
    for (const m of memberIds) laneOf.set(m, gLane);
  }

  // ---- the instances: a view, never data (FONTE, E.D. 9 Oct 2026) ----
  // The graph holds ONE node per source: the canonical document, the property
  // in its own unit; an extractor is `extracted_from` that master. The DRAWING
  // puts, inside every OPEN paradata group, each master outside it that a
  // reader of the group reaches — `em_visual_rules.json` → `paradata_instances`,
  // read by `paradata-view.ts` exactly as s3Dgraphy's `view_instances` reads it
  // (`check-instances.mjs`). One rule for documents and properties: id
  // `<master>##<group>`, the badge «from <owner>» (the property's unit, the
  // document's epoch), the reading's `extracted_from` re-attached to it. A
  // closed group draws none: its chip counts them (main.ts). The master stays
  // where it is; a document read by some group carries the use count.
  const instanceByEdge = new Map<string, string>(); // edge key → instance id
  const instancesByGroup = new Map<string, SceneNode[]>();
  const recordsByGroup = new Map<string, ViewInstance[]>(); // the instances drawn, per group
  const vix = viewIndex(doc);
  // MICRO-SPAZIO-3D p.5 · the 3D among the instances (rules 1.6.35): a proxy in
  // the group of its geometry property, under the property; a model in its
  // epoch's group, with «×N» when it is in N epochs. Drawn when the filter
  // shows the 3D nodes (the «Links & other» ring), like any other instance.
  const threeD = new Map<string, Array<ViewInstance & { countLabel?: string | null }>>();
  if (!view?.instanceKindsHidden?.has("proxy") || !view?.instanceKindsHidden?.has("rm"))
    for (const r of threedInstances(doc, vix)) {
      if (!r.group || view?.instanceKindsHidden?.has(r.kind)) continue;
      const rec = { id: r.id, master: r.master, kind: r.kind, node_type: r.node_type, name: r.name,
        owner: r.owner, owner_kind: r.owner_kind, owner_name: r.owner_name, removed: r.removed,
        readers: r.beside ? [r.beside] : [], extractors: [], through: [], countLabel: r.count_label ?? null };
      (threeD.get(r.group) ?? threeD.set(r.group, []).get(r.group)!).push(rec);
    }
  {
    const uses = new Map<string, number>();       // master → groups drawing it
    const below = new Map<string, number>();      // reader → instances stacked under it
    for (const g of doc.graph.nodes) {
      if (g.node_type !== "ParadataNodeGroup") continue;
      const gs = scene.byId.get(g.id);
      if (!gs || folded.has(g.id) || gs.collapsed) continue;
      const firstMember = (scene.memberOf ? [...scene.memberOf.entries()].find(([m, gg]) => gg === g.id && !scene.byId.get(m)?.collapsed)?.[0] : undefined);
      for (const r of [...viewInstances(doc, g.id, vix), ...(threeD.get(g.id) ?? [])]) {
        if (view?.instanceKindsHidden?.has(r.kind)) continue;
        // a model has no reader in the group, and a proxy whose geometry
        // property is not drawn here has none either: they hang under the
        // group's first member
        const own = r.readers.map((id) => scene.byId.get(id)).find((x) => !!x && !x.collapsed);
        const reader = own ?? ((r.kind === "rm" || r.kind === "proxy") && firstMember ? scene.byId.get(firstMember) : undefined);
        const masterNode = nodeById.get(r.master);
        if (!reader || !masterNode) continue;
        const ms = scene.byId.get(r.master);
        const pos = positions[r.master];
        const w = ms?.w ?? pos?.w ?? 120;
        const h = ms?.h ?? pos?.h ?? 30;
        const k = below.get(reader.id) ?? 0;
        below.set(reader.id, k + 1);
        const inst: SceneNode = {
          id: r.id,
          x: reader.x + reader.w / 2 - w / 2,
          y: reader.y + reader.h + 26 + k * (h + 12),
          w,
          h,
          node: masterNode,
          instanceOf: r.master,
          instanceBadge: { owner: r.owner, ownerName: r.owner_name, ownerKind: r.owner_kind, group: g.id },
          ...(r.removed ? { trace: true } : {}),
          ...((r as { countLabel?: string | null }).countLabel ? { countLabel: (r as { countLabel?: string }).countLabel } : {}),
        };
        scene.nodes.push(inst);
        scene.byId.set(inst.id, inst);
        scene.memberOf!.set(inst.id, g.id);
        (instancesByGroup.get(g.id) ?? instancesByGroup.set(g.id, []).get(g.id)!).push(inst);
        (recordsByGroup.get(g.id) ?? recordsByGroup.set(g.id, []).get(g.id)!).push(r);
        uses.set(r.master, (uses.get(r.master) ?? 0) + 1);
      }
      // the readings re-attached to the instances: one rule, `pd-arrange.ts`
      for (const [k, id] of reattachedReadings(vix, recordsByGroup.get(g.id) ?? []))
        instanceByEdge.set(k, id);
    }
    // the use count on the documents (the corner decorator): the groups that
    // draw it, the master's own place included when somebody reads it there
    for (const [m, k] of uses) {
      if (nodeById.get(m)?.node_type !== "document") continue;
      const total = k + 1;
      const master = scene.byId.get(m);
      if (master) master.useCount = total;
      for (const insts of instancesByGroup.values())
        for (const i of insts) if (i.instanceOf === m) i.useCount = total;
    }
    for (const e of vix.edges)
      if (e.edge_type === "has_first_epoch" && nodeById.get(e.source)?.node_type === "document") {
        const master = scene.byId.get(e.source);
        if (master) master.dated = true;
      }
  }

  // ---- MICRO-BADGE-PD · an OPEN paradata group, arranged as its soloing ----
  // Inside the box the general layout gives way to the group's own arrangement
  // (`paradataGroupScene`, the function the soloing draws with): properties in
  // a row on top, combiners and extractors under them, documents and instances
  // at the bottom, no empty row. The members' stored positions were the lane's
  // (v5 ranks are global to the lane; «Compact» leaves the group closed and
  // nothing made room for it): opened in place, USV132_PD on TempluMare_v2 was
  // a box 7993 × 400 over 51 nodes of other units, measured.
  //
  // So the box goes right under its unit, centred on it. Since 11 Oct 2026
  // (MICRO-AUTORI-LAYOUT p.2) the lane does not make room by itself: nothing
  // outside the box moves when a group opens or closes.
  scene.arrangedIn = new Map();
  scene.arrangedAt = new Map();
  scene.pdAnchor = new Map();
  const GAP = 24;
  for (const g of doc.graph.nodes) {
    if (g.node_type !== "ParadataNodeGroup") continue;
    const gs = scene.byId.get(g.id);
    if (!gs || folded.has(g.id) || gs.collapsed || !pdReferentNode.has(g.id)) continue;
    const members = (membership.childrenOf.get(g.id) ?? []).filter(
      (m) => m !== g.id && scene.byId.has(m) && !scene.byId.get(m)!.collapsed);
    // a member that is a container itself keeps the general layout
    if (members.some((m) => (membership.childrenOf.get(m)?.length ?? 0) > 0)) continue;
    const drawn = [...members.map((m) => scene.byId.get(m)!), ...(instancesByGroup.get(g.id) ?? [])];
    if (!drawn.length) continue;
    // the soloing's input exactly (every member, the ones drawn in another
    // group's box included), so the two arrangements are the same one
    const arr = paradataGroupScene(doc, g.id, membership.membersOf.get(g.id) ?? [], vix,
                                   recordsByGroup.get(g.id) ?? [], Math.max(...drawn.map((sn) => sn.w)));
    // MICRO-AUTORI-LAYOUT p.2 · the box's place is decided by the arrangement
    // the rule gives (the stored hand positions left out): a member the hand
    // moved does not move the anchor, so it stays where it was left (measured:
    // the anchor followed the extent, and a member dragged above the top row
    // came back to it)
    const base = paradataGroupScene(doc, g.id, membership.membersOf.get(g.id) ?? [], vix,
                                    recordsByGroup.get(g.id) ?? [], Math.max(...drawn.map((sn) => sn.w)),
                                    false);
    let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity;
    for (const sn of drawn) {
      const a = base.byId.get(sn.id);
      if (!a) continue;
      const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
      ax0 = Math.min(ax0, cx - sn.w / 2); ay0 = Math.min(ay0, cy - sn.h / 2);
      ax1 = Math.max(ax1, cx + sn.w / 2);
    }
    if (!Number.isFinite(ax0)) continue;
    const ref = scene.byId.get(pdReferentNode.get(g.id)!);
    let ox0 = Infinity, oy0 = Infinity;
    for (const sn of drawn) { ox0 = Math.min(ox0, sn.x); oy0 = Math.min(oy0, sn.y); }
    // the box: under the unit, centred on it (without one, where the members were)
    const lineY = ref ? ref.y + ref.h + GAP : oy0 - GROUP_HEADER - 6;
    const left = ref ? ref.x + ref.w / 2 - (ax1 - ax0) / 2 : ox0;
    // MICRO-GLIFI-OVERLAY-CONTINUITA p.4 · the box moved by hand: its offset from
    // the place under the unit, kept in the group's own space under its own id
    const moved = doc.layout?.group_spaces?.[g.id]?.[g.id];
    const anchor = { x: left - ax0 + (moved?.x ?? 0), y: lineY + GROUP_HEADER + 6 - ay0 + (moved?.y ?? 0) };
    for (const sn of drawn) {
      const a = arr.byId.get(sn.id);
      if (!a) continue;
      sn.x = anchor.x + a.x + a.w / 2 - sn.w / 2;
      sn.y = anchor.y + a.y + a.h / 2 - sn.h / 2;
      // p.4 · an instance too: what the hand moves is written in the group's
      // space (pd-arrange reads it back), as for a member
      scene.arrangedIn.set(sn.id, g.id);
      scene.arrangedAt!.set(sn.id, { x: a.x, y: a.y, w: a.w, h: a.h });
    }
    scene.pdAnchor.set(g.id, anchor);
    // MICRO-AUTORI-LAYOUT p.2 · the lane no longer «makes room» by moving the
    // blocks under the box (E.D., 11 Oct 2026: no automatic arrangement, ever):
    // that push depended on where each node stood, so a node moved by hand
    // across the box's line jumped by the box's height — D.43.01 on
    // TempluMare_v3.2, under the open «Graph paradata». What the open box
    // covers, the hand or «Layout» moves.
  }

  // ---- outline containers: box AROUND engine-placed members ----
  // computed BEFORE lane expansion so the expansion accounts for the boxes;
  // innermost groups first, so an activity's box wraps its PD boxes
  const groupDepth = (id: string): number => {
    let d = 0;
    let cur = id;
    const seen = new Set<string>();
    while (!seen.has(cur) && d < 10) {
      seen.add(cur);
      const parents = membership.groupsOf.get(cur);
      if (!parents?.length) break;
      cur = [...parents].sort()[0];
      d++;
    }
    return d;
  };
  outlineNodes.sort((a, b) => groupDepth(b.id) - groupDepth(a.id));
  const outlineMemberOf = new Map<string, string>();
  const emptyOutline = new Set<string>(); // childless groups drawn as small boxes
  for (const g of outlineNodes) {
    if (folded.has(g.id)) {
      g.w = CLOSED_W;
      g.h = CLOSED_H;
      continue;
    }
    let memberIds = (membership.childrenOf.get(g.id) ?? []).filter(
      (m) => m !== g.id && scene.byId.has(m),
    );
    // MICRO-BADGE-PD-CRONOLOGIA · a dated document stands in the epoch of its
    // date (em-core): when that is not its group's lane, the group does not
    // wrap it across the lanes — the membership is drawn as an edge.
    // MICRO-CORSIA-GRUPPI p.1 · the same for any member given another epoch (a
    // unit of an activity moved to its new lane): the group stays in the lane
    // where most of its members are, the one elsewhere is joined by its edge
    const laneOfSn = (id: string): number => {
      const sn = scene.byId.get(id)!;
      return laneOf.get(id) ?? laneIdxOfY(sn.y + sn.h / 2);
    };
    const docs = memberIds.filter((m) => scene.byId.get(m)!.node.node_type === "document");
    if (docs.length < memberIds.length && memberIds.length > 1) {
      const tally = new Map<number, number>();
      for (const m of memberIds)
        if (!docs.includes(m)) tally.set(laneOfSn(m), (tally.get(laneOfSn(m)) ?? 0) + 1);
      const home = [...tally].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
      if (home != null) memberIds = memberIds.filter((m) => laneOfSn(m) === home);
    }
    // document instances drawn inside this group count as members
    for (const inst of instancesByGroup.get(g.id) ?? []) memberIds.push(inst.id);
    if (!memberIds.length) {
      // a freshly-created / childless group still renders as a small EMPTY
      // container box (dashed outline + coloured header) so it reads as a
      // group, not a stray node.
      g.w = Math.max(g.w, 150);
      g.h = GROUP_HEADER + 30;
      emptyOutline.add(g.id);
      continue;
    }
    let mx = Infinity,
      my = Infinity,
      Mx = -Infinity,
      My = -Infinity;
    for (const m of memberIds) {
      const sn = scene.byId.get(m)!;
      mx = Math.min(mx, sn.x);
      my = Math.min(my, sn.y);
      Mx = Math.max(Mx, sn.x + sn.w);
      My = Math.max(My, sn.y + sn.h);
      outlineMemberOf.set(m, g.id);
    }
    g.x = mx - GROUP_PAD;
    g.y = my - GROUP_HEADER - 6;
    g.w = Mx - mx + GROUP_PAD * 2;
    g.h = My - g.y + GROUP_PAD;
  }

  // ---- phase sub-band reflow ----
  // For each epoch whose phases are toggled visible, split its lane into
  // stacked sub-bands: one per phase (newest start on top), then the epoch's
  // own residual band at the bottom (only if it holds units). Each band is
  // translated as a RIGID unit — every node keeps its relative position, so
  // group containers stay intact and only cross-band edges stretch. A node's
  // band is the phase it (or its group root) is attributed to; unattributed
  // roots fall in the residual band.
  const subBands: SubBand[] = [];
  // bottom Y reached by each phased lane's stacked sub-bands (incl. empty phase
  // strips, which carry no nodes) — folded into the swimlane re-stack below so a
  // lane with many/empty phases grows to contain them instead of spilling into
  // the next lane.
  const bandExtentByLane = new Map<string, number>();
  if (phaseIds.size && showPhases.size) {
    const laneOfNode = (sn: SceneNode): number =>
      laneOf.get(sn.id) ?? laneIdxOfY(sn.y + sn.h / 2);
    // node → the phase it is attributed to (first has_first_epoch / survive)
    const phaseOfNode = new Map<string, string>();
    for (const e of doc.graph.edges) {
      if (e.edge_type !== "has_first_epoch" && e.edge_type !== "survive_in_epoch")
        continue;
      if (phaseIds.has(e.target) && !phaseOfNode.has(e.source))
        phaseOfNode.set(e.source, e.target);
    }
    const rootOf = (id: string): string => {
      let cur = id;
      const seen = new Set<string>();
      while (membership.primaryOf.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        const p = membership.primaryOf.get(cur)!;
        if (!scene.byId.has(p)) break;
        cur = p;
      }
      return cur;
    };
    const num = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : -Infinity;
    };
    for (let li = 0; li < scene.lanes.length; li++) {
      const lane = scene.lanes[li];
      if (!showPhases.has(lane.id)) continue;
      // build the band order over the WHOLE phase subtree (phases can nest):
      // depth-first, each level newest start_time on top, a node's own
      // (direct-member) band placed AFTER its sub-phases, and the epoch's
      // residual band last — so finer/newer periods sit above coarser ones.
      const childPhases = new Map<string, string[]>();
      for (const [ph, par] of parentOfPhase) {
        if (!childPhases.has(par)) childPhases.set(par, []);
        childPhases.get(par)!.push(ph);
      }
      const bandOrder: string[] = [];
      const bandDepth = new Map<string, number>();
      const collect = (id: string, depth: number): void => {
        const subs = (childPhases.get(id) ?? [])
          .slice()
          .sort(
            (a, b) =>
              num(nodeById.get(b)?.data?.start_time) -
              num(nodeById.get(a)?.data?.start_time),
          );
        for (const s of subs) collect(s, depth + 1);
        bandOrder.push(id);
        bandDepth.set(id, depth);
      };
      collect(lane.id, 0);
      if (bandOrder.length <= 1) continue; // epoch has no phases
      const bandIndex = new Map(bandOrder.map((k, i) => [k, i]));
      // which sub-tree phase, if any, does a node resolve to?
      const phaseFor = (id: string): string | undefined => {
        // direct attribution wins
        const direct = phaseOfNode.get(id);
        if (direct && topEpochOf(direct) === lane.id) return direct;
        return undefined;
      };
      // gather this lane's nodes, grouped by root block
      const rootBand = new Map<string, number>(); // root id → band index
      const rootKids = new Map<string, SceneNode[]>();
      for (const sn of scene.nodes) {
        if (laneOfNode(sn) !== li) continue;
        const root = rootOf(sn.id);
        if (!rootKids.has(root)) rootKids.set(root, []);
        rootKids.get(root)!.push(sn);
      }
      // No "senza fase" residual band (E.D. 2026-07-18): whenever an epoch has
      // phases, its un-phased units — whether born directly here and left
      // unassigned, or SURVIVING from an earlier epoch (survive_in_epoch), or
      // synced from Blender where the auto-absorb never ran — fold into this
      // epoch's DOMINANT phase band. Pure view: the graph/attribution is
      // untouched. `phaseFor` is lane-scoped (topEpochOf === lane.id), so the
      // tally only ever counts THIS lane's phases; with a phase guaranteed
      // (bandOrder.length > 1 above) the fallback is always a phase, never the
      // residual (lane.id) — so the residual band stays empty and is skipped.
      const gt = new Map<string, number>();
      for (const sn of scene.nodes) {
        const ph = phaseFor(sn.id);
        if (ph) gt.set(ph, (gt.get(ph) ?? 0) + 1);
      }
      let bn = 0;
      let dom: string | undefined;
      for (const [ph, n] of gt)
        if (n > bn) {
          dom = ph;
          bn = n;
        }
      const fallbackKey = dom ?? bandOrder.find((k) => k !== lane.id) ?? lane.id;
      // assign each root a band = majority phase among its subtree, else fallback
      for (const [root, kids] of rootKids) {
        const tally = new Map<string, number>();
        for (const k of kids) {
          const ph = phaseFor(k.id);
          if (ph) tally.set(ph, (tally.get(ph) ?? 0) + 1);
        }
        let best: string | undefined;
        let bestN = 0;
        for (const [ph, n] of tally)
          if (n > bestN) {
            best = ph;
            bestN = n;
          }
        rootBand.set(
          root,
          bandIndex.get(best ?? fallbackKey) ?? bandOrder.length - 1,
        );
      }
      // per-band bbox (over all member nodes) at current positions
      const bMinY = bandOrder.map(() => Infinity);
      const bMaxY = bandOrder.map(() => -Infinity);
      const nodeBand = new Map<string, number>();
      for (const [root, kids] of rootKids) {
        const bi = rootBand.get(root)!;
        for (const sn of kids) {
          nodeBand.set(sn.id, bi);
          bMinY[bi] = Math.min(bMinY[bi], sn.y);
          bMaxY[bi] = Math.max(bMaxY[bi], sn.y + sn.h);
        }
      }
      // stack the bands from the lane top, translating each content band
      // rigidly. An empty PHASE band still renders as a thin labelled strip (its
      // "PD" tag + name) so a freshly-created / unit-less phase is visible and
      // can receive dropped units; an empty residual band is skipped.
      const EMPTY_BAND_H = 26;
      // reserve space at the lane top for the epoch header chip so the first
      // band (its label) doesn't overlap it
      const LANE_TOP_RESERVE = 40;
      let cursor = lane.y + LANE_TOP_RESERVE;
      let firstBand = true;
      for (let bi = 0; bi < bandOrder.length; bi++) {
        const key = bandOrder[bi];
        const isResidual = key === lane.id;
        const hasContent = Number.isFinite(bMinY[bi]);
        if (!hasContent && isResidual) continue; // empty residual → skip
        const h = hasContent ? bMaxY[bi] - bMinY[bi] : EMPTY_BAND_H;
        // TOCCARE · the band's translation: remembered while the structure is
        // the same (see RestackMemo), so its content — including a node just
        // moved by hand — is never re-anchored to the band top
        const memoK = `${lane.id}|${key}`;
        const delta = hasContent
          ? frozen && memo!.band.has(memoK)
            ? memo!.band.get(memoK)!
            : cursor - bMinY[bi]
          : 0;
        if (hasContent) {
          memo?.band.set(memoK, delta);
          for (const [id, b] of nodeBand)
            if (b === bi) {
              const sn = scene.byId.get(id);
              if (sn) sn.y += delta;
            }
        }
        // the band's rect is where its content IS (with a fresh delta that is
        // `cursor`, as before); an empty band takes the running cursor
        const bandY = hasContent ? bMinY[bi] + delta : cursor;
        subBands.push({
          laneId: lane.id,
          phaseId: key,
          label: isResidual
            ? t("lane.noPhase", { lane: lane.label })
            : (String(nodeById.get(key)?.name ?? "").trim() || t("lane.unnamedPhase")),
          color:
            typeof nodeById.get(key)?.data?.color === "string"
              ? (nodeById.get(key)!.data!.color as string)
              : lane.color,
          y: bandY,
          height: h,
          residual: isResidual,
          first: firstBand,
          depth: bandDepth.get(key) ?? 0,
          paradataGroupId: isResidual ? undefined : pdgOfPhase.get(key),
          start: isResidual
            ? undefined
            : asStr(nodeById.get(key)?.data?.start_time),
          end: isResidual ? undefined : asStr(nodeById.get(key)?.data?.end_time),
          warn: isResidual ? undefined : warnIds?.has(key),
        });
        firstBand = false;
        cursor = Math.max(cursor, bandY + h + BAND_GAP);
      }
      bandExtentByLane.set(lane.id, cursor);
    }
  }
  if (subBands.length) scene.subBands = subBands;

  // ---- dynamic swimlane re-stack ----
  // Re-flow the top-level lanes into a contiguous vertical stack. This both
  //  (a) grows a lane to fit content that overflows its em-core rect (group
  //      headers poking above, boxes / re-homed phase units below), and
  //  (b) closes the gaps left where phase lanes were dropped (a phase's
  //      em-core swimlane leaves an empty slot between top-level lanes).
  // Every node moves by a single constant delta for its lane, so intra-lane
  // layout and edge geometry are preserved.
  if (scene.lanes.length) {
    for (const sn of scene.nodes) {
      if (!laneOf.has(sn.id)) laneOf.set(sn.id, laneIdxOfY(sn.y + sn.h / 2));
    }
    const origY = scene.lanes.map((l) => l.y);
    const origH = scene.lanes.map((l) => l.height);
    // content overflow beyond each lane's original rect, both directions
    const bottom = scene.lanes.map(() => 0);
    const top = scene.lanes.map(() => 0);
    for (const sn of scene.nodes) {
      const li = laneOf.get(sn.id)!;
      const over = sn.y + sn.h + LANE_PAD - (origY[li] + origH[li]);
      if (over > 0) bottom[li] = Math.max(bottom[li], over);
      const above = origY[li] + 8 - sn.y;
      if (above > 0) top[li] = Math.max(top[li], above);
    }
    // TOCCARE · a lane's upward growth is remembered too (RestackMemo): a node
    // nudged above the lane top pokes out instead of dragging the lane down
    scene.lanes.forEach((l, i) => {
      if (frozen && memo!.top.has(l.id)) top[i] = memo!.top.get(l.id)!;
      else memo?.top.set(l.id, top[i]);
    });
    // Empty phase bands carry no nodes, so the node loop above misses them —
    // grow the lane to the bottom of its stacked sub-bands too, or a lane with
    // several (or unit-less) phases spills its bands over the next lane.
    for (const [laneId, extent] of bandExtentByLane) {
      const li = laneIndexOf.get(laneId);
      if (li == null) continue;
      const over = extent + LANE_PAD - (origY[li] + origH[li]);
      if (over > 0) bottom[li] = Math.max(bottom[li], over);
    }
    let cursor = origY[0] - top[0]; // keep the first lane roughly anchored
    const nodeShift = scene.lanes.map(() => 0);
    for (let i = 0; i < scene.lanes.length; i++) {
      const newY = cursor;
      const newH = origH[i] + top[i] + bottom[i];
      nodeShift[i] = newY + top[i] - origY[i];
      scene.lanes[i].y = newY;
      scene.lanes[i].height = newH;
      cursor = newY + newH;
    }
    for (const sn of scene.nodes) sn.y += nodeShift[laneOf.get(sn.id)!];
    // keep sub-band separators aligned with the nodes they bracket
    for (const sb of subBands) {
      const bi = laneIndexOf.get(sb.laneId);
      if (bi != null) sb.y += nodeShift[bi];
    }
  }

  // MICRO-GLIFI-OVERLAY-CONTINUITA p.3 · a continuity node (BR) is drawn as its
  // unit's: straight above it, in the lane of its epoch (continuity.ts), where
  // the lanes are final. Its line is drawn straight (routing.ts, renderer.ts).
  {
    const links = continuityLinks(doc.graph.edges, (id) => isContinuityType(nodeById.get(id)?.node_type));
    for (const [brId, l] of links) {
      const br = scene.byId.get(brId), unit = scene.byId.get(l.unit);
      if (!br || !unit || unit.collapsed) continue;
      const band = l.epoch
        ? scene.subBands?.find((b) => b.phaseId === l.epoch && !b.residual) ?? scene.lanes.find((x) => x.id === l.epoch) ?? null
        : null;
      const at = continuityPlace(unit, br, band);
      br.x = at.x;
      br.y = at.y;
      br.continuity = { unit: unit.id, kind: continuityKind(isVirtualType(unit.node.node_type)),
        ...(endReasonWritten(br.node.data) ? { reason: endReasonLabel(endReasonOf(br.node.data)) } : {}) };
    }
  }

  // ---- container descriptors for the renderer ----
  for (const g of [...outlineNodes, ...containerNodes]) {
    // BUGFIX-PDG · a PDG collapsed to a bottom-left tablet gets NO SceneGroup at
    // all — no box (the phantom body E.D. saw), no ± toggle hit area. The tablet
    // (drawn from the referent's SceneNode + this pdg id, see the renderer) IS
    // the representation. Same `isCollapsedTablet` the node/edge/hit paths use.
    if (isCollapsedTablet(g.id)) continue;
    if (
      OUTLINE_TYPES.has(g.node.node_type) &&
      !folded.has(g.id) &&
      ![...outlineMemberOf.values()].includes(g.id) &&
      !emptyOutline.has(g.id)
    )
      continue; // outline group without visible members: plain node
    const sg: SceneGroup = {
      id: g.id,
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      headerH: GROUP_HEADER,
      title: String(g.node.name || g.id),
      folded: folded.has(g.id),
    };
    scene.groups!.push(sg);
    scene.groupsById!.set(g.id, sg);
  }

  // BUGFIX-PDG · pin each collapsed-tablet PDG onto its referent SceneNode so the
  // renderer draws the tablet from the referent (no SceneGroup needed).
  for (const [pdg, refId] of pdReferentNode)
    if (isCollapsedTablet(pdg)) {
      const ref = scene.byId.get(refId);
      if (ref) ref.pdCollapsed = pdg;
    }

  // MICRO-AUTORI-LAYOUT · the authorship of an extractor in an open group is
  // drawn to the author's instance there (elsewhere it is the badge): the
  // `has_author` the view folded into badges, taken back for those instances
  const seenEdge = new Set(edges.map((e) => e.id ?? `${e.source}→${e.target}`));
  const authorLines = instanceByEdge.size
    ? vix.edges.filter((e) => e.edge_type === "has_author" && !seenEdge.has(e.id ?? `${e.source}→${e.target}`)
                         && instanceByEdge.has(e.id ?? `${e.source}→${e.target}`))
    : [];
  for (const e00 of [...edges, ...authorLines]) {
    // FONTE · a reading re-attached to its instance: the instance is drawn in
    // the reader's open group even when the master is folded away or hidden
    const instTarget = instanceByEdge.get(e00.id ?? `${e00.source}→${e00.target}`);
    const e0 = instTarget ? { ...e00, target: instTarget } : e00;
    if (!scene.byId.has(e0.source) || !scene.byId.has(e0.target)) continue;
    // BUGFIX-PDG · a PDG collapsed to a tablet has no box to point at: drop the
    // has_paradata_nodegroup line (referent → PDG) AND any is_in_paradata_nodegroup
    // (member → PDG), so no connector dangles to where the box used to be.
    if (
      (e0.edge_type === "has_paradata_nodegroup" && isCollapsedTablet(e0.target)) ||
      (e0.edge_type === "is_in_paradata_nodegroup" && isCollapsedTablet(e0.target))
    )
      continue;
    // PROPRIETA · an heir's `has_property` the folding re-attached to a closed
    // group (its property is inside) ends on the group's referent, where the
    // chip is — not on the empty place of a box that is not drawn. Only this
    // edge: a chain element read from outside the group would end on the unit
    // and read as an upward (red) arrow, which it is not
    const e = e0.edge_type === "has_property" && isCollapsedTablet(e0.target)
      ? { ...e0, target: pdReferentNode.get(e0.target)! } : e0;
    if (e.source === e.target) continue;
    // …and every other line the folding hung on a closed group goes with the
    // box, as its membership lines already do (BUGFIX-PDG): a reading's
    // `extracted_from` would otherwise start from an empty place
    if (isCollapsedTablet(e.source) || isCollapsedTablet(e.target)) continue;
    // containment already expresses membership: hide the member→own-container
    // edge when the container is drawn open (yEd semantics)
    if (
      scene.memberOf!.get(e.source) === e.target ||
      scene.memberOf!.get(e.target) === e.source ||
      outlineMemberOf.get(e.source) === e.target ||
      outlineMemberOf.get(e.target) === e.source
    )
      continue;
    scene.edges.push({ source: e.source, target: e.target, edge: instTarget ? e00 : e });
  }
  return scene;
}
