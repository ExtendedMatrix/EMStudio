/**
 * MICRO-PANNELLI-OVERLAY-TABULAR p.4 · THE ARROWS OF A LIST THAT SELECTS A NODE.
 *
 * One rule, written once for the Outliner's list (G6, `nodelist.ts`) and now
 * read by every list that picks a node — the Tabular's rows (`emdata.ts`) and
 * the Space's side panel (`space-outliner.ts`): ↓ the row after the current
 * one, ↑ the row before, Home the first, End the last; with no current row the
 * first. The caller says what «current» and «pick» mean in its list (the same
 * pick as a click, so the Inspector, the Matrix and the Space follow).
 *
 * Pure: no DOM (checked in node, `scripts/check-list-keys.mjs`).
 */

/** the index the key moves to, or null when the key is not a list key or there are no rows */
export function listStep(key: string, at: number, n: number, keys: readonly string[] = LIST_KEYS): number | null {
  if (n <= 0 || !keys.includes(key)) return null;
  switch (key) {
    case "ArrowDown": return at < 0 ? 0 : Math.min(n - 1, at + 1);
    case "ArrowUp": return at < 0 ? 0 : Math.max(0, at - 1);
    case "Home": return 0;
    case "End": return n - 1;
  }
  return null;
}
export const LIST_KEYS: readonly string[] = ["ArrowDown", "ArrowUp", "Home", "End"];
/** a table's rows: only ↑ and ↓ (Home and End stay the cell's and the page's) */
export const ROW_KEYS: readonly string[] = ["ArrowDown", "ArrowUp"];

/**
 * Whether a key pressed on `target` may move the list. A field being written
 * keeps its keys: a select, a number, a text area, an editable text, and a text
 * field whose value has been changed and not yet committed. An untouched text
 * cell lets the arrows go to the next row, as in a sheet.
 */
export function listMayMove(target: { tagName?: string; type?: string; value?: string; defaultValue?: string; isContentEditable?: boolean } | null): boolean {
  if (!target || !target.tagName) return true;
  const tag = target.tagName.toUpperCase();
  if (target.isContentEditable) return false;
  if (tag === "SELECT" || tag === "TEXTAREA") return false;
  if (tag === "INPUT") {
    const type = (target.type ?? "text").toLowerCase();
    if (type !== "text" && type !== "search") return false;
    return target.value === target.defaultValue;
  }
  return true;
}
