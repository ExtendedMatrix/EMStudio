/**
 * MICRO-OUTLINER-UNICO · THE RULE OF THE TEXTS (E.D., 7 Nov 2026): a panel shows
 * state and actions; an explanation stands behind a «?»; an empty state is one
 * line.
 *
 * The «?» of a panel (the window bar has its own, `helpMark` in main.ts, with
 * the same look): the text is what a screen reader hears and what the one
 * popover of the app (`help-tip.ts`) shows beside the glyph — on hover, pinned
 * by a click, closed by Esc or a click elsewhere. A leaf: no import, so the panels
 * that are not main.ts (the Inspector, the GIS, the transform form) use it too.
 */
export function helpGlyph(text: string, probe?: string): HTMLElement {
  const q = document.createElement("button");
  q.type = "button";
  q.className = "win-help help-glyph";
  q.textContent = "?";
  q.title = text;
  q.setAttribute("aria-label", text);
  if (probe) q.dataset.help = probe;
  // MICRO-OUTLINER-EPOCHE-TOOLTIP p.3 · hover, click (pinned) and Esc are
  // the one «?» of the app (`help-tip.ts`): the text opens beside the glyph
  return q;
}

/** a line of state with its explanation behind a «?» (an empty state, a note) */
export function lineWithHelp(cls: string, line: string, help: string, probe?: string): HTMLElement {
  const p = document.createElement("p");
  p.className = cls;
  const s = document.createElement("span");
  s.textContent = line;
  p.append(s, " ", helpGlyph(help, probe));
  return p;
}
