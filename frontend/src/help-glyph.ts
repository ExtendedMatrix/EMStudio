/**
 * MICRO-OUTLINER-UNICO · THE RULE OF THE TEXTS (E.D., 7 Nov 2026): a panel shows
 * state and actions; an explanation stands behind a «?»; an empty state is one
 * line.
 *
 * The «?» of a panel (the window bar has its own, `helpMark` in main.ts, with
 * the same look): the text is its tooltip and what a screen reader hears; a
 * click (or Enter) opens it under the glyph, for whoever has no pointer to
 * hover with, and a second click closes it. A leaf: no import, so the panels
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
  q.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const was = q.nextElementSibling;
    if (was?.classList.contains("help-pop")) { was.remove(); return; }
    const pop = document.createElement("div");
    pop.className = "help-pop";
    pop.textContent = text;
    pop.addEventListener("click", (ev) => { ev.stopPropagation(); pop.remove(); });
    q.after(pop);
  });
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
