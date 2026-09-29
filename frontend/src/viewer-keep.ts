/**
 * RIFINITURE · the 3D viewer of a window SURVIVES a repaint.
 *
 * The Doc window repaints on every change (a traced point is a change), and
 * until now every repaint disposed the viewer and mounted a new one — which
 * framed the model again, so the camera jumped back after each point. E.D.'s
 * rule: the camera reframes only when the model OPENS and on the explicit ⤢.
 *
 * So a window keeps its viewer while it shows the same model: `keep` hands back
 * the one it has (the caller moves its element into the new paint and updates
 * its markers), and makes a new one only for another model. Pure — no DOM, no
 * three.js — so `check-paradata-chain.mjs` holds the rule in node.
 */
export interface KeptViewer {
  dispose(): void;
}

export class ViewerKeeper<O extends object, V extends KeptViewer, X = unknown> {
  private kept = new WeakMap<O, { key: string; v: V; extra: X }>();

  /** The viewer of `owner` for `key`: the kept one when the key is the same
   *  (`fresh: false` — do not frame), else a new one from `make` (`fresh: true`). */
  keep(owner: O, key: string, make: () => { v: V; extra: X }): { v: V; extra: X; fresh: boolean } {
    const had = this.kept.get(owner);
    if (had && had.key === key) return { ...had, fresh: false };
    had?.v.dispose();
    const made = make();
    this.kept.set(owner, { key, ...made });
    return { ...made, fresh: true };
  }

  /** The window shows no model any more (another medium, another document). */
  drop(owner: O): void {
    this.kept.get(owner)?.v.dispose();
    this.kept.delete(owner);
  }

  get(owner: O): { key: string; v: V; extra: X } | undefined {
    return this.kept.get(owner);
  }
}
