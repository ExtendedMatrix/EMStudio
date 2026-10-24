// MICRO-CRONO-MULTIPLA p.2 · ONE EDIT, EVERY SELECTED NODE THAT HAS THE FIELD
// (E.D., 24 Oct 2026).
//
// With several nodes selected, an edit in the Inspector (or in a panel, or in a
// cell of the Tabular) goes to the ACTIVE node — that stays the normal way. With
// the multi key held at the moment of the confirmation (Enter, a click, a choice
// in a menu, the release of a slider) — ⌘ on macOS, Alt on Windows and Linux —
// the same edit goes to every node of the selection that has that field; those
// that do not have it are skipped and counted. While the key is held, every field
// that can propagate says it beside itself: «Apply to N selected nodes · M
// skipped» (`body.multi-held` shows the hints drawn with `multiHint`).
//
// The propagation is ONE undo step (`store.batch`), one line in the Log (which
// field, how many nodes), and in a room it travels as the ordinary operations of
// the same edit made N times — nothing new on the wire.
//
// What decides «has the field» is the caller's: a predicate on the node, the
// same one that decides whether the field is drawn for it.
import { t } from "./i18n";
import type { DocumentStore } from "./model";
import type { EmNode } from "./types";

/** ⌘ on macOS, Alt elsewhere (Ctrl stays the browser's and the app's shortcuts' key) */
export const MULTI_IS_META: boolean =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");

/** the multi key in a key or pointer event */
export function multiKeyOf(e: { metaKey?: boolean; altKey?: boolean }): boolean {
  return MULTI_IS_META ? !!e.metaKey : !!e.altKey;
}

/** the key's name as a hint says it */
export function multiKeyName(): string {
  return MULTI_IS_META ? "⌘" : "Alt";
}

let held = false;
let installed = false;
const listeners = new Set<(on: boolean) => void>();

function setHeld(on: boolean): void {
  if (on === held) return;
  held = on;
  if (typeof document !== "undefined") document.body?.classList.toggle("multi-held", on);
  for (const fn of listeners) fn(on);
}

/** Is the multi key down now? (kept from every key and pointer event: a key
 *  released while a native menu was open is corrected by the next event) */
export function multiHeld(): boolean {
  return held;
}

export function onMultiHeld(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Listen once, in the capture phase, on the window. */
export function installMultiKey(win: Window = window): void {
  if (installed) return;
  installed = true;
  const fromEvent = (e: Event): void => setHeld(multiKeyOf(e as KeyboardEvent));
  for (const ty of ["keydown", "keyup", "pointerdown", "pointerup", "pointermove", "mousedown", "click"])
    win.addEventListener(ty, fromEvent, { capture: true, passive: true });
  win.addEventListener("blur", () => setHeld(false));
  win.document.addEventListener("visibilitychange", () => { if (win.document.hidden) setHeld(false); });
}

/** Test hook: say the key is held (or not) without an event. */
export function setMultiHeldForTest(on: boolean): void {
  setHeld(on);
}

/** Where an edit can go: the store, the active node, the selection it belongs to. */
export interface MultiScope {
  store: DocumentStore;
  active: string;
  /** every selected node (the active among them) */
  selection: readonly string[];
  /** the Log line, when the edit went to more than the active node */
  log?: (msg: string, ids: string[]) => void;
}

export interface MultiPlan {
  /** the selected nodes that have the field, the active first */
  targets: string[];
  /** how many selected nodes do not have it */
  skipped: number;
}

/** Which selected nodes would take the edit. */
export function multiPlan(scope: MultiScope, has: (n: EmNode) => boolean): MultiPlan {
  const ids = scope.selection.includes(scope.active) ? scope.selection : [scope.active, ...scope.selection];
  const targets: string[] = [];
  let skipped = 0;
  for (const id of [scope.active, ...ids.filter((x) => x !== scope.active)]) {
    const n = scope.store.node(id);
    if (n && has(n)) targets.push(id);
    else if (id !== scope.active) skipped++;
  }
  return { targets, skipped };
}

/** Is there anything to propagate to, for this field? (more than the active one) */
export function multiOffered(scope: MultiScope | null | undefined): scope is MultiScope {
  return !!scope && scope.selection.length > 1;
}

/**
 * Confirm an edit of `field` (its label, said in the Log): to the active node
 * alone, or — the multi key held, `multi` true — to every selected node that
 * `has` the field, as ONE undo step. `apply(id)` makes the edit on one node.
 * Returns the nodes edited.
 */
export function commitField(
  scope: MultiScope | null | undefined,
  active: string,
  field: string,
  has: (n: EmNode) => boolean,
  apply: (id: string) => void,
  multi: boolean = multiHeld(),
): string[] {
  if (!multi || !multiOffered(scope)) {
    apply(active);
    return [active];
  }
  const plan = multiPlan(scope, has);
  if (plan.targets.length <= 1 && !plan.skipped) {
    apply(active);
    return [active];
  }
  scope.store.batch(() => {
    for (const id of plan.targets) apply(id);
  });
  scope.log?.(t("multi.log", { field, n: String(plan.targets.length), m: String(plan.skipped) }), plan.targets);
  return plan.targets;
}

/** The hint beside a field — shown only while the multi key is held
 *  (`body.multi-held .multi-hint`). Null when there is nothing to propagate to. */
export function multiHint(scope: MultiScope | null | undefined, has: (n: EmNode) => boolean): HTMLElement | null {
  if (!multiOffered(scope)) return null;
  const plan = multiPlan(scope, has);
  const el = document.createElement("div");
  el.className = "multi-hint";
  el.dataset.multiN = String(plan.targets.length);
  el.dataset.multiM = String(plan.skipped);
  el.textContent = t("multi.hint", { n: String(plan.targets.length), m: String(plan.skipped) });
  return el;
}

/** A text field, a text area or a menu: ⌘/Alt+Enter confirms it for the
 *  selection (an area's plain Enter is a new line, and a click elsewhere with ⌘
 *  would change the selection before the field let go). A changed field lets go
 *  (its own `change` writes, the key still down); an UNCHANGED one — the active
 *  node's value given to the others, which no `change` would ever say — calls
 *  `commit` itself. */
export function confirmOnMultiEnter(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, commit?: () => void): void {
  const initial = el.value;
  el.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Enter" || !multiKeyOf(e as KeyboardEvent)) return;
    e.preventDefault();
    e.stopPropagation();
    setHeld(true);
    if (el.value !== initial || !commit) el.blur();
    else commit();
  });
}
