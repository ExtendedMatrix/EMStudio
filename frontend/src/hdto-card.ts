/**
 * THE CHAIN CARD — the study in its cultural context, drawn once and read in
 * two places: the inspector, when the study, its place, its heritage, the twin
 * or the project is selected, and the narrative, where an embed of the study
 * (or of the HC1) is that same card projected from the graph at render time.
 * Nothing is copied: the card reads `hdtoChain(doc)` every time it is drawn.
 *
 * What it says, in the order somebody reads a provenance: from which study
 * (name, code, kind), in which place (and the places that place is in), of
 * which heritage (with its authority link), part of what, with which twin (and
 * in which state), in which project.
 *
 * What it does NOT do is fill a gap. A study with no HC1 says «not yet
 * attributed to a heritage asset» — D3.2's «not yet known», the ordinary state
 * of a trench whose excavator does not yet know what it pertains to — and a
 * study with no place says that. A graph with no chain gets no card at all.
 */

import { t } from "./i18n";
import { hasChain, hdtoChain, withCode } from "./hdto";
import type { HdtoChain } from "./hdto";
import type { EmDocument } from "./types";

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** The label of a `study_kind` value, in the active language; the value itself,
 *  readable, for a value the datamodel added after these strings. */
export function studyKindLabel(kind: string): string {
  return t(`study.kind.${kind}`, undefined, kind.replace(/_/g, " "));
}

export interface ChainCardOptions {
  /** the node the card is shown FOR (its row is marked) */
  focusId?: string;
  /** go to a node of the chain (the inspector's jump); absent → plain text */
  onJump?: (id: string) => void;
}

/** The ids of the nodes a chain card is about: the chain's own. */
export function isChainNode(doc: EmDocument | null | undefined, id: string): boolean {
  return hdtoChain(doc).ids.has(id);
}

/** The card, or null when the graph has no chain (nothing is invented). */
export function chainCard(doc: EmDocument | null | undefined,
                          opts: ChainCardOptions = {}): HTMLElement | null {
  const c: HdtoChain = hdtoChain(doc);
  if (!hasChain(c)) return null;
  const card = el("div", "hdto-card");
  card.dataset.hdtoCard = "1";
  const row = (key: string, label: string, id: string | null,
               value: string, note?: string): HTMLElement => {
    const r = el("div", "hdto-row");
    r.dataset.hdtoRow = key;
    if (id && id === opts.focusId) r.classList.add("hdto-focus");
    r.appendChild(el("span", "hdto-k", label));
    const v = el(id && opts.onJump ? "button" : "span", "hdto-v", value);
    if (id && opts.onJump) {
      v.addEventListener("click", (e) => {
        e.stopPropagation();
        opts.onJump!(id);
      });
    }
    r.appendChild(v);
    if (note) r.appendChild(el("span", "hdto-note", note));
    card.appendChild(r);
    return r;
  };

  if (c.study) {
    const bits = [c.study.studyKind ? studyKindLabel(c.study.studyKind) : "",
                  [c.study.authors, c.study.date].filter(Boolean).join(", ")]
      .filter(Boolean).join(" · ");
    row("study", t("hdto.study"), c.study.id,
        withCode(c.study.name || t("hdto.untitledStudy"), c.study.code), bits || undefined);
  } else {
    row("study", t("hdto.study"), null, t("hdto.noStudy"));
  }

  if (c.place) {
    const within = c.place.within.map((w) => w.name).filter(Boolean);
    row("place", t("hdto.place"), c.place.id, c.place.name,
        within.length ? t("hdto.within", { places: within.join(" › ") }) : undefined);
  } else if (c.study) {
    row("place", t("hdto.place"), null, t("hdto.noPlace")).classList.add("hdto-missing");
  }

  if (c.about) {
    const r = row("about", t("hdto.heritage"), c.about.id, c.about.name || "—");
    if (c.about.uri) {
      const a = document.createElement("a");
      a.className = "hdto-link";
      a.href = c.about.uri;
      a.target = "_blank";
      a.rel = "noreferrer noopener";
      a.textContent = c.about.authority
        ? `${c.about.label ?? c.about.uri} — ${c.about.authority}`
        : c.about.uri;
      a.addEventListener("click", (e) => e.stopPropagation());
      r.appendChild(a);
    }
    if (c.parent)
      row("parent", t("hdto.partOf"), c.parent.id, c.parent.name || c.parent.uri || "—");
    if (c.twin) {
      row("twin", t("hdto.twin"), c.twin.id, c.twin.name || "—",
          t(c.twin.state === "registered" ? "insp.twinStateRegistered"
                                          : "insp.twinStateProvisional"));
    } else {
      row("twin", t("hdto.twin"), null, t("insp.twinStateNone")).classList.add("hdto-missing");
    }
  } else {
    // D3.2 · «not yet known»: said, and nothing made up in its place
    row("about", t("hdto.heritage"), null, t("hdto.notAttributed"))
      .classList.add("hdto-missing");
  }

  if (c.project) row("project", t("hdto.project"), c.project.id, c.project.name);
  return card;
}
