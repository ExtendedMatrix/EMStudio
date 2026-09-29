/**
 * AUDIT N0 · IL FOCUS È SACRO — a surface that holds the focus of a field is
 * not rebuilt by a document change.
 *
 * Every store write reaches `flushChange`, which repaints the windows on the
 * next frame. Before this module it rebuilt every one of them, and a rebuild is
 * `textContent = ""`: the field under the cursor went with it. Measured (audit
 * 29 set, `check-interactions` A1/A2/A6): the stamp form kept «V» of «Volo»;
 * Tab from the Inspector's name landed on the BODY, because the description it
 * moved into was destroyed by the name's own commit; a peer's rename wiped
 * text somebody had not blurred yet.
 *
 * The rule is narrow on purpose. It applies only WHILE A DOCUMENT CHANGE IS
 * BEING PAINTED (`duringStoreFlush`), and only to a host whose focused element
 * is somewhere one WRITES (a text field, a textarea, a contenteditable). A
 * button keeps the old behaviour — the window it belongs to must show what the
 * click did — and so does every repaint a surface asks for itself (the table
 * filter repaints its rows as you type, and must go on doing so).
 *
 * A held host is not forgotten: its repaint is owed, and paid when the focus
 * leaves it (`focusout` to something outside the host). Tab between two fields
 * of the same window keeps it held, which is the point — the second field stays
 * alive — and the first blur out of the window brings it up to date.
 */

let holding = 0;

/** Paint a document change: every `heldBy` asked meanwhile may hold. */
export function duringStoreFlush<T>(fn: () => T): T {
  holding++;
  try {
    return fn();
  } finally {
    holding--;
  }
}

const TEXT_INPUTS = new Set([
  "", "text", "search", "number", "email", "url", "tel", "password",
  "date", "datetime-local", "time", "month", "week",
]);

/** Is this element one where a person WRITES? (Not a button, not a select.) */
export function isWritingField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return TEXT_INPUTS.has(el.type) && !el.readOnly && !el.disabled;
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

const owed = new WeakMap<HTMLElement, () => void>();

/**
 * Should the repaint of `host` wait? True while a document change is painted
 * and the focus is in a field inside `host`; then `redo` is remembered and run
 * when the focus leaves the host.
 */
export function heldBy(host: HTMLElement, redo: () => void): boolean {
  if (!holding) return false;
  const a = document.activeElement;
  if (!a || !host.contains(a) || !isWritingField(a)) return false;
  const first = !owed.has(host);
  owed.set(host, redo);
  if (first) {
    const onOut = (e: FocusEvent): void => {
      const to = e.relatedTarget as Node | null;
      if (to && host.contains(to)) return;          // Tab inside the window
      host.removeEventListener("focusout", onOut);
      // after the blur's own commit (a `change` fires before `focusout`), in the
      // frame that paints it
      requestAnimationFrame(() => {
        const pay = owed.get(host);
        owed.delete(host);
        if (!pay || !host.isConnected) return;
        if (isWritingField(document.activeElement) && host.contains(document.activeElement)) {
          heldAgain(host, pay);
          return;
        }
        pay();
      });
    };
    host.addEventListener("focusout", onOut);
  }
  return true;
}

/** The focus came back before the frame: keep owing. */
function heldAgain(host: HTMLElement, redo: () => void): void {
  holding++;
  try { heldBy(host, redo); } finally { holding--; }
}

/** Is a repaint owed to this host? (For the checks.) */
export function isOwed(host: HTMLElement): boolean {
  return owed.has(host);
}

/**
 * AUDIT A4 · a surface that must rebuild ITSELF while you type (the mapping
 * editor's picker filters its files per key) keeps the field: the focused
 * field is found again in the new DOM — same tag, same class, same place among
 * its likes — and gets back its caret. Measured before: «scavo» → «s».
 */
export function keepFocusAcross(host: HTMLElement, rebuild: () => void): void {
  const a = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (!a || !host.contains(a) || !isWritingField(a)) {
    rebuild();
    return;
  }
  const sel = `${a.tagName.toLowerCase()}${a.className ? "." + a.className.trim().split(/\s+/).join(".") : ""}`;
  const index = [...host.querySelectorAll(sel)].indexOf(a);
  const start = "selectionStart" in a ? a.selectionStart : null;
  const end = "selectionEnd" in a ? a.selectionEnd : null;
  rebuild();
  const again = host.querySelectorAll<HTMLInputElement>(sel)[index];
  if (!again) return;
  again.focus();
  if (start !== null && end !== null) {
    try { again.setSelectionRange(start, end); } catch { /* not a text type */ }
  }
}
