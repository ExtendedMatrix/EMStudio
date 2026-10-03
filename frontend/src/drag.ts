/**
 * TOCCARE · the two decisions a drag makes, written once and testable in node
 * (`scripts/check-drag.mjs`): WHEN it starts, and WHERE it lands.
 *
 * Everything else about a drag — moving the scene, committing to the store,
 * drawing the target — is `main.ts`'s; these are the parts that used to be
 * scattered through the pointer handlers and disagreed with each other (the
 * highlight nobody drew, the drop that picked a group the user had not aimed at).
 */
import type { Scene, SceneGroup, SubBand } from "./scene";

/** Screen pixels the pointer must travel, CUMULATIVELY from pointerdown, before
 *  a press becomes a drag. Below it the gesture is a click.
 *
 *  I5 · 6, not 3: a trackpad click moves the finger a few pixels between press
 *  and release. Measured on the dev.17 Tempio: a click with 4 px of travel
 *  became a 4 px move of the unit, and the unit was not selected («the plain
 *  click does not select, the right click does»). */
export const DRAG_START_PX = 6;

/**
 * The start threshold of a drag, measured from where the press began.
 *
 * `move()` answers `null` until the pointer is DRAG_START_PX away from the press
 * point, then the whole distance accumulated so far (the node catches up with
 * the cursor in one step, no jump later), and after that the delta since the
 * previous event — so the node follows 1:1.
 */
export class DragGate {
  private readonly x0: number;
  private readonly y0: number;
  private lastX: number;
  private lastY: number;
  started = false;

  constructor(x: number, y: number) {
    this.x0 = this.lastX = x;
    this.y0 = this.lastY = y;
  }

  move(x: number, y: number): { dx: number; dy: number } | null {
    if (!this.started) {
      if (Math.hypot(x - this.x0, y - this.y0) < DRAG_START_PX) return null;
      this.started = true;
    }
    const d = { dx: x - this.lastX, dy: y - this.lastY };
    this.lastX = x;
    this.lastY = y;
    return d;
  }

  /** total screen displacement since the press */
  total(x: number, y: number): { dx: number; dy: number } {
    return { dx: x - this.x0, dy: y - this.y0 };
  }
}

/** Where a drop would land. `null` = nothing to reassign (a plain move). */
export type DropTarget =
  | { kind: "group"; group: SceneGroup }
  | {
      kind: "lane";
      laneId: string;
      /** the epoch the node would be attributed to: a phase when the lane shows
       *  phase bands and the point is in one, else the lane's epoch */
      epochId: string;
      label: string;
      /** world-space band the highlight fills */
      y: number;
      h: number;
      band?: SubBand;
    };

export interface DropOptions {
  /** Alt held: ignore every group, aim only at the lane */
  alt: boolean;
  /** groups that can never be the target (the dragged nodes and their descendants) */
  forbidden: ReadonlySet<string>;
  /** the dragged node's own container chain: dropping inside one of them is a
   *  move WITHIN it, never a re-parenting */
  own: ReadonlySet<string>;
  /** does this group accept (a membership edge for) what is being dragged? */
  accepts: (groupId: string) => boolean;
}

/**
 * The lane — and, when its phases are shown, the band — at a world y.
 *
 * Band gaps belong to the band BELOW (the rule `handleDrop` has always used): a
 * drop between two phases lands in the later-drawn one.
 */
export function laneTargetAt(
  scene: Scene,
  wy: number,
): Extract<DropTarget, { kind: "lane" }> | null {
  const lane = scene.lanes.find((l) => wy >= l.y && wy <= l.y + l.height);
  if (!lane) return null;
  const bands = (scene.subBands ?? [])
    .filter((b) => b.laneId === lane.id)
    .sort((a, b) => a.y - b.y);
  if (bands.length) {
    let chosen = bands[0];
    for (const b of bands) if (wy >= b.y - 13) chosen = b;
    return {
      kind: "lane",
      laneId: lane.id,
      epochId: chosen.phaseId,
      label: chosen.residual ? lane.label : chosen.label,
      y: chosen.y,
      h: chosen.height,
      band: chosen,
    };
  }
  return {
    kind: "lane",
    laneId: lane.id,
    epochId: lane.id,
    label: lane.label,
    y: lane.y,
    h: lane.height,
  };
}

/**
 * THE RULE between a group and a lane, when a drop point is inside both.
 *
 * A group wins only if the pointer is in its BODY (below the title bar), the
 * group is open, it accepts what is dragged, and it is not one of the node's own
 * containers. The innermost qualifying group wins (smallest area — a matryoshka
 * resolves to the doll you are pointing into). Otherwise the lane wins; with
 * Alt held, the lane always wins.
 *
 * Why the body and not the whole box: the title bar is where a user aims to
 * grab or read the group, and it sits on top of the lane's rows — treating it
 * as a drop zone is exactly how a wide container "stole" drops meant for the
 * lane. Why not the own chain: a node nudged inside its own activity box was
 * silently RE-PARENTED into it (measured on TempluMare: 46 of 138 small drags
 * ended as «moved 1 into VAct.04 Temple» and snapped back). Being inside your
 * own box is not a request to join it.
 */
export function dropTargetAt(
  scene: Scene,
  wx: number,
  wy: number,
  opt: DropOptions,
): DropTarget | null {
  if (!opt.alt) {
    const bodies = (scene.groups ?? []).filter(
      (g) =>
        !g.folded &&
        !opt.forbidden.has(g.id) &&
        wx >= g.x &&
        wx <= g.x + g.w &&
        wy > g.y + g.headerH &&
        wy <= g.y + g.h,
    );
    bodies.sort((a, b) => a.w * a.h - b.w * b.h);
    for (const g of bodies) {
      if (opt.own.has(g.id)) break; // inside your own box: a move, not a join
      if (opt.accepts(g.id)) return { kind: "group", group: g };
    }
  }
  return laneTargetAt(scene, wy);
}

/** Same destination? (lane targets compare by the epoch they would assign) */
export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === "group" && b.kind === "group") return a.group.id === b.group.id;
  if (a.kind === "lane" && b.kind === "lane") return a.epochId === b.epochId;
  return false;
}
