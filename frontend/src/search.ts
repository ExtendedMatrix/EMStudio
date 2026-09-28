import type { EmDocument, EmNode } from "./types";

import { liveNodes } from "./crdt";

/**
 * STRUTTURA · FULL-TEXT search over the graph — the name, the description, the
 * values of its properties and the epoch it belongs to (scrivania v5
 * `textOf` / `searchAll`). Every word of the query must occur somewhere in that
 * text; a hit on the NAME ranks first.
 *
 * Pure (no DOM) so it can be checked in node: `setupSearch` below is its one
 * drawing, mounted wherever a box asks for it.
 */
export interface SearchHit {
  node: EmNode;
  /** the words the node matched on, beyond its name: value · description · epoch */
  excerpt: string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));

/** A property's value, wherever the three writers put it (see em-data.ts). */
const valueOf = (p: EmNode): string =>
  str((p as Record<string, unknown>).value ?? p.data?.value ?? p.description);

export function searchGraph(doc: EmDocument | null, query: string, limit = 14): SearchHit[] {
  if (!doc) return [];
  const toks = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  // P4.5 · what somebody else just deleted must not still be findable: the
  // tombstone stays in the document for the merge, and every SURFACE reads the
  // live view (the canvas always did; the search does too).
  const nodes = liveNodes(doc.graph as never) as unknown as EmNode[];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const props = new Map<string, EmNode[]>();
  const epoch = new Map<string, EmNode>();
  for (const e of doc.graph.edges ?? []) {
    const s = byId.get(e.source);
    const d = byId.get(e.target);
    if (!s || !d) continue;
    if (e.edge_type === "has_property")
      props.set(s.id, [...(props.get(s.id) ?? []), d]);
    else if (e.edge_type === "has_first_epoch" && !epoch.has(s.id)) epoch.set(s.id, d);
  }
  const hits: Array<SearchHit & { rank: number }> = [];
  for (const n of nodes) {
    const name = str(n.name || n.id);
    const ps = props.get(n.id) ?? [];
    const ep = epoch.get(n.id);
    const bits = [name, n.id, n.node_type, str(n.description), valueOf(n),
                  ...ps.flatMap((p) => [str(p.name), valueOf(p)]),
                  ep ? str(ep.name) : ""];
    const text = bits.join(" ").toLowerCase();
    if (!toks.every((t) => text.includes(t))) continue;
    const rank = toks.every((t) => name.toLowerCase().includes(t)) ? 0 : 1;
    const excerpt = [valueOf(n) !== str(n.description) ? valueOf(n) : "",
                     str(n.description),
                     ...ps.map((p) => `${str(p.name)} ${valueOf(p)}`.trim())
                       .filter((x) => toks.some((t) => x.toLowerCase().includes(t))),
                     ep ? str(ep.name) : ""]
      .filter(Boolean).join(" · ").slice(0, 110);
    hits.push({ node: n, excerpt, rank });
  }
  hits.sort((a, b) => a.rank - b.rank ||
    str(a.node.name || a.node.id).localeCompare(str(b.node.name || b.node.id),
                                               undefined, { numeric: true }));
  return hits.slice(0, limit).map(({ node, excerpt }) => ({ node, excerpt }));
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** The text with every query word wrapped in <mark>, escaped. */
export function highlight(text: string, query: string): string {
  let out = esc(text);
  for (const t of query.trim().split(/\s+/).filter(Boolean)) {
    const re = new RegExp(`(${esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    out = out.replace(re, "<mark>$1</mark>");
  }
  return out;
}

export function setupSearch(
  input: HTMLInputElement,
  resultsBox: HTMLElement,
  getDoc: () => EmDocument | null,
  onPick: (nodeId: string) => void,
  noResults = "—",
  /** the node glyph's URL — injected, so this module stays free of the
   *  bundler's asset globbing and runs in node (`check-studio.mjs`) */
  glyphFor: (nodeType: string) => string | null = () => null,
): void {
  const hide = (): void => {
    resultsBox.classList.add("hidden");
    resultsBox.innerHTML = "";
  };

  const run = (): void => {
    const q = input.value.trim();
    if (q.length < 2) {
      hide();
      return;
    }
    const hits = searchGraph(getDoc(), q);
    resultsBox.innerHTML = "";
    if (!hits.length) {
      const p = document.createElement("p");
      p.className = "search-none";
      p.textContent = noResults;
      resultsBox.appendChild(p);
      resultsBox.classList.remove("hidden");
      return;
    }
    for (const { node: n, excerpt } of hits) {
      const b = document.createElement("button");
      b.className = "search-hit";
      b.setAttribute("role", "option");
      const icon = glyphFor(n.node_type);
      b.innerHTML =
        (icon ? `<img class="hit-glyph" src="${esc(icon)}" alt="">`
              : `<span class="hit-glyph"></span>`) +
        `<b class="hit-name">${highlight(String(n.name || n.id), q)}</b>` +
        `<span class="hit-ex">${highlight(excerpt, q)}</span>` +
        `<span class="hit-type">${esc(n.node_type)}</span>`;
      b.addEventListener("click", () => {
        onPick(n.id);
        input.value = "";
        hide();
        input.blur();
      });
      resultsBox.appendChild(b);
    }
    resultsBox.classList.remove("hidden");
  };

  input.addEventListener("input", run);
  input.addEventListener("focus", run);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      input.value = "";
      hide();
      input.blur();
    }
    if (ev.key === "Enter") {
      // Invio seleziona il primo risultato — computed, not read off the list,
      // so a fast typist is never one repaint behind
      const first = searchGraph(getDoc(), input.value)[0];
      if (first) {
        onPick(first.node.id);
        input.value = "";
        hide();
        input.blur();
      }
    }
  });
  document.addEventListener("pointerdown", (ev) => {
    if (!resultsBox.contains(ev.target as Node) && ev.target !== input) hide();
  });
}
