/**
 * THE STUDY PANEL — what the canvas is, as opposed to what a node is.
 *
 * This is the panel that describes the WHOLE graph: its name and id, the
 * graph-scope propagative metadata (author / licence / embargo, DP-65), the
 * site position, and the HDT-O fields that say which heritage thing this study
 * is about and who is working on it.
 *
 * ── WHY IT IS ITS OWN MODULE ────────────────────────────────────────────────
 * It used to live inside `renderInspector`, in the branch taken when NO node is
 * selected. That put a per-GRAPH panel inside a per-NODE inspector, and the
 * code confessed it: three lines under the HDT-O fields the panel appended
 * "Select a node to inspect it" — the place where you describe the whole study
 * ended with the sentence you show when there is nothing to describe.
 *
 * ── WHAT IT NEEDS, MEASURED ─────────────────────────────────────────────────
 * `root` and `store`, and `cb` for exactly TWO of its members —
 * `resolveAuthority` and `searchTwins`, both optional, both suggestion-only.
 * The whole `InspectorCallbacks` is passed rather than a narrower interface
 * because narrowing it would be a second change hiding inside an extraction;
 * the type import is erased at compile time, so it costs no runtime cycle.
 *
 * `renderSitePosition` lives here and is EXPORTED because it has two callers on
 * purpose: this panel, and the inspector when the selected node is the
 * graph-self node of a multigraph — selecting the graph must offer the site
 * position rather than sending the reader back here to look for it.
 *
 * `el` is a private copy, as it is in `inspector.ts`, `narrative.ts`,
 * `logpanel.ts`, `osm-map.ts`, `reader.ts` and `narrative-embeds.ts`: six
 * copies of four lines is this codebase's settled convention, and importing it
 * from `inspector.ts` would be the one thing that makes this module cyclic.
 */

import { t } from "./i18n";
import type {
  DocumentStore,
  HdtoFields,
  TwinAttribution,
  TwinState,
} from "./model";
import type { AuthorityCandidate, AuthorityRef } from "./types";
import { createOsmMap } from "./osm-map";
import { geocode, GeocodeOffline, zoomFor } from "./geocode";
import type { TwinSearchResult } from "./twins";
import { describeSources } from "./twins";
import type { InspectorCallbacks } from "./inspector";

/** What this panel actually asks of its caller — measured, not assumed: two
 *  optional, suggestion-only callbacks out of the inspector's twenty-four.
 *  Derived from `InspectorCallbacks` rather than restated, so the two cannot
 *  drift; the inspector keeps passing its whole object and still type-checks.
 *  This is a TYPE narrowing: the bindings that arrive are the same ones. */
export type StudyPanelCallbacks = Pick<
  InspectorCallbacks,
  "resolveAuthority" | "searchTwins"
>;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Authority facets (the P1-D resolver enum WHEN/WHAT/WHERE/WHO). Not EM node/
// edge types — a small resolver-side vocabulary, so it's fine to list here.
const AUTHORITY_FACETS = ["WHAT", "WHERE", "WHEN", "WHO"] as const;

/** An "Authority" sub-field: a facet selector + a URI/search input backed by
 *  em-bridge /resolve-authority (via cb.resolveAuthority). Typing a term shows
 *  ranked candidates; picking one stores the full P1-D ref. Fully offline and
 *  graceful: no resolver / any failure → plain free-text URI entry.
 *
 *  §5 · Used for BOTH heritage entities — the study's subject and its optional
 *  whole. They are the same kind of thing (a place), so they get the same
 *  treatment and the same default facet; giving the parent free text only would
 *  make «Roma» unresolvable in a document whose subject is resolved.
 *
 *  `field` is the HdtoFields key the input writes to, so the two instances do
 *  not share a slot in `inputs` — the bug that a single hardcoded
 *  `inputs["heritageUri"]` would have caused the moment the second one existed. */
function buildAuthorityField(
  panel: HTMLElement,
  inputs: Record<string, HTMLInputElement>,
  value: string,
  cb: StudyPanelCallbacks,
  ref: {
    get: () => AuthorityRef | undefined;
    set: (r: AuthorityRef | undefined) => void;
    commit: () => void;
  },
  opts: { field: string; facet: string } = {
    field: "heritageUri",
    facet: "WHERE",
  },
): void {
  panel.appendChild(el("label", "insp-field-label", t("insp.authority")));

  const facetSel = document.createElement("select");
  facetSel.className = "insp-name-input insp-facet-select";
  for (const f of AUTHORITY_FACETS) {
    const o = document.createElement("option");
    o.value = f;
    o.textContent = f;
    facetSel.appendChild(o);
  }
  // Default facet inferred from the node type this field annotates: a HC1
  // Heritage Entity — subject or whole — is a place → WHERE. (Epoch→WHEN,
  // qualia→WHAT elsewhere.) User-overridable via the selector.
  facetSel.value = opts.facet;
  panel.appendChild(facetSel);

  const inp = document.createElement("input");
  inp.className = "insp-name-input";
  inp.value = value;
  inp.placeholder = t("insp.authorityPlaceholder");
  panel.appendChild(inp);
  inputs[opts.field] = inp;

  const badge = el("div", "insp-hint");
  const paintBadge = (): void => {
    const r = ref.get();
    if (r?.authority)
      badge.textContent = `✓ ${r.label ?? r.uri} — ${r.authority}${r.match ? ` (${r.match})` : ""}`;
    else if (inp.value.trim())
      // free text that reached no authority: NAMED as unresolved rather than
      // left looking the same as a resolved pick (§5 — what is already written
      // keeps working, degrades, and lets itself be called not resolved)
      badge.textContent = t("insp.authorityUnresolved");
    else if (cb.resolveAuthority) badge.textContent = t("insp.authorityOffline");
    else badge.textContent = t("insp.authorityNoResolver");
  };
  paintBadge();
  panel.appendChild(badge);

  const menu = el("div", "insp-auth-menu") as HTMLElement;
  menu.style.display = "none";
  panel.appendChild(menu);
  const closeMenu = (): void => {
    menu.innerHTML = "";
    menu.style.display = "none";
  };

  const renderCandidates = (cands: AuthorityCandidate[]): void => {
    menu.innerHTML = "";
    if (!cands.length) {
      menu.style.display = "none";
      return;
    }
    for (const c of cands) {
      const row = el("button", "insp-auth-item") as HTMLButtonElement;
      row.textContent = `${c.label ?? c.uri} — ${c.authority}${c.match ? ` (${c.match})` : ""}`;
      row.title = String(c.uri);
      row.addEventListener("click", () => {
        const picked: AuthorityRef = {
          uri: c.uri,
          authority: c.authority,
          label: c.label,
          rank: c.rank,
          match: c.match,
        };
        if (c.broader) picked.broader = c.broader;
        ref.set(picked);
        inp.value = c.uri;
        closeMenu();
        paintBadge();
        ref.commit();
      });
      menu.appendChild(row);
    }
    menu.style.display = "";
  };

  let timer: number | undefined;
  const queryNow = (): void => {
    const term = inp.value.trim();
    // a pasted URL is used verbatim (no search); empty / no resolver → nothing
    if (!cb.resolveAuthority || !term || /^https?:\/\//i.test(term)) {
      closeMenu();
      return;
    }
    void cb
      .resolveAuthority(term, facetSel.value)
      .then(renderCandidates)
      .catch(closeMenu);
  };

  inp.addEventListener("input", () => {
    ref.set(undefined); // manual edit → no longer a resolved pick
    paintBadge();
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(queryNow, 250);
  });
  inp.addEventListener("change", ref.commit); // blur/Enter → persist
  facetSel.addEventListener("change", queryNow);
}

/**
 * THE ATTRIBUTION FIELD — the twin, its state, and the search that suggests.
 *
 * Three states are drawn and named (`TwinState`), and the one that matters most
 * is the first: **no twin yet**. It gets a badge, a sentence, and no red
 * anything, because it is the ordinary state of an excavation in progress and
 * not a missing value.
 *
 * The search asks a REGISTER of twins — a different question from the authority
 * field above it, which asks which thing in the world this is. It is offered,
 * pre-filled from what the entity field already says, and it can be ignored
 * entirely: the «create a provisional twin» button sits beside it and does not
 * wait for a search to have run. **If a future version of this field ever
 * refuses to let somebody carry on until they pick, it has gone wrong.**
 *
 * A result carries the three facts that make attaching safe — which register,
 * who is already working on it, how many studies hang on it — and a provisional
 * one says so, because somebody else's working record is precisely the twin not
 * to attach yourself to.
 */
function buildTwinField(
  panel: HTMLElement,
  cb: StudyPanelCallbacks,
  ctl: {
    get: () => TwinAttribution;
    set: (a: TwinAttribution) => void;
    commit: () => void;
    entityName: () => string;
    entityUri: () => string;
  },
): void {
  // everything this field draws lives in one box, so a change of state redraws
  // itself without the whole inspector being rebuilt (which would take the
  // focus out of whatever the user was typing in the fields above)
  const box = el("div", "insp-twin");
  panel.appendChild(box);

  const STATE_LABEL: Record<TwinState, string> = {
    none: "insp.twinStateNone",
    provisional: "insp.twinStateProvisional",
    registered: "insp.twinStateRegistered",
  };
  const STATE_HINT: Record<TwinState, string> = {
    none: "insp.twinStateNoneHint",
    provisional: "insp.twinStateProvisionalHint",
    registered: "insp.twinStateRegisteredHint",
  };

  const apply = (next: TwinAttribution): void => {
    ctl.set(next);
    ctl.commit();
    render();
  };

  const renderResults = (
    into: HTMLElement,
    term: string,
    result: TwinSearchResult,
  ): void => {
    into.innerHTML = "";
    if (result.unreachable) {
      // NOT «none found» — a different sentence, in the tone the authority
      // badge already uses about itself
      into.appendChild(el("div", "insp-hint", t("insp.twinNoRegister")));
      return;
    }
    const { answering, absent } = describeSources(result);
    if (!result.twins.length) {
      into.appendChild(
        el(
          "div",
          "insp-hint",
          t("insp.twinNoneFound")
            .replace("{term}", term)
            .replace(
              "{sources}",
              answering.map((s) => s.label ?? s.id).join(", ") || "—",
            ),
        ),
      );
    }
    for (const rec of result.twins) {
      const row = el("button", "insp-auth-item") as HTMLButtonElement;
      const who = rec.custodians
        .map((c) => c.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      // the three facts, in the order somebody chooses on: which register, who
      // holds it, how many studies
      const where =
        result.sources.find((s) => s.id === rec.source)?.label ?? rec.source;
      row.textContent =
        `${rec.label} — ${where} · ${who || t("insp.twinNoCustodian")} · ` +
        t("insp.twinStudies").replace("{n}", String(rec.studies)) +
        (rec.provisional ? ` · ${t("insp.twinProvisionalWarning")}` : "");
      row.title = rec.key;
      row.addEventListener("click", () =>
        apply({
          state: "registered",
          name: rec.label,
          key: rec.key,
          registry: { source: rec.source, label: where },
        }),
      );
      into.appendChild(row);
    }
    // asked and absent is INFORMATION: one register answering must not look
    // like all of them answering
    for (const s of absent)
      into.appendChild(
        el(
          "div",
          "insp-hint",
          t("insp.twinAbsentSource").replace("{label}", s.label ?? s.id),
        ),
      );
    if (typeof result.untwinned === "number" && result.untwinned > 0)
      into.appendChild(
        el(
          "div",
          "insp-hint",
          t("insp.twinUntwinned").replace("{n}", String(result.untwinned)),
        ),
      );
  };

  function render(): void {
    box.innerHTML = "";
    const twin = ctl.get();

    const badge = el("div", `insp-twin-state insp-twin-${twin.state}`);
    badge.appendChild(el("span", "insp-twin-dot", "●"));
    badge.appendChild(el("span", undefined, t(STATE_LABEL[twin.state])));
    box.appendChild(badge);
    box.appendChild(
      el(
        "div",
        "insp-hint",
        t(STATE_HINT[twin.state]).replace(
          "{registry}",
          twin.registry?.label ?? twin.registry?.source ?? "—",
        ),
      ),
    );

    if (twin.state !== "none") {
      const nameIn = document.createElement("input");
      nameIn.className = "insp-name-input";
      nameIn.value = twin.name;
      nameIn.placeholder = t("insp.twinNamePh");
      nameIn.addEventListener("change", () => {
        ctl.set({ ...ctl.get(), name: nameIn.value });
        ctl.commit();
      });
      box.appendChild(el("label", "insp-field-label", t("insp.twinName")));
      box.appendChild(nameIn);
      if (twin.key) {
        box.appendChild(el("label", "insp-field-label", t("insp.twinKey")));
        const key = el("div", "insp-id", twin.key);
        box.appendChild(key);
      }
      const detach = el("button", "insp-btn", t("insp.twinDetach")) as
        HTMLButtonElement;
      // detaching NEVER deletes the study, the entity or anything drawn: it
      // says «this is not the one», which somebody must be able to say
      detach.title = t("insp.twinDetachTitle");
      detach.addEventListener("click", () =>
        apply({ state: "none", name: "", key: "" }),
      );
      box.appendChild(detach);
    }

    // ── the search: offered, pre-filled, ignorable ─────────────────────────
    if (cb.searchTwins) {
      box.appendChild(el("label", "insp-field-label", t("insp.twinSearch")));
      const q = document.createElement("input");
      q.className = "insp-name-input";
      q.value = ctl.entityUri().trim() || ctl.entityName().trim();
      q.placeholder = t("insp.twinSearchPh");
      box.appendChild(q);
      const results = el("div", "insp-auth-menu");
      results.style.display = "";
      box.appendChild(results);
      const go = (): void => {
        const term = q.value.trim();
        results.innerHTML = "";
        results.appendChild(el("div", "insp-hint", t("insp.twinSearching")));
        void cb
          .searchTwins!(term)
          .then((r) => renderResults(results, term, r))
          .catch(() => {
            results.innerHTML = "";
            results.appendChild(
              el("div", "insp-hint", t("insp.twinNoRegister")),
            );
          });
      };
      const look = el("button", "insp-btn", t("insp.twinLook")) as
        HTMLButtonElement;
      look.addEventListener("click", go);
      box.appendChild(look);
      box.appendChild(el("div", "insp-hint", t("insp.twinSearchHint")));
    }

    // …and the act that needs no search at all.
    //
    // MEASURED IN THE BROWSER, 30 September 2026: this button was drawn before
    // the thing had a name, and pressing it did NOTHING — `applyHdto` writes
    // the twin inside the branch that needs a heritage entity, because in
    // HDT-O a twin is the twin OF something. An action offered and then
    // silently refused is worse than one that is not offered, so where the
    // button would be there is now the sentence that says what to do first.
    if (twin.state === "none") {
      const named = !!(ctl.entityName().trim() || ctl.entityUri().trim());
      if (!named) {
        box.appendChild(el("div", "insp-hint", t("insp.twinNeedsEntity")));
      } else {
        const make = el("button", "insp-btn", t("insp.twinCreate")) as
          HTMLButtonElement;
        make.title = t("insp.twinCreateTitle");
        make.addEventListener("click", () =>
          apply({
            state: "provisional",
            name: `${ctl.entityName().trim() || t("insp.twinFallbackName")} HDT`,
            key: "",
          }),
        );
        box.appendChild(make);
      }
    }
  }

  render();
}

/**
 * GEO2 · the place-name search that sits on top of the picker map.
 *
 * Two acts, kept apart: SEARCHING moves the camera and drops a *candidate*
 * marker, and only a confirmation writes `site_position`. A geocoder returns a
 * guess about a name — good enough to fly there, never good enough to record as
 * the site's position without someone saying so.
 *
 * Confirmation is either gesture: click the map where the site actually is (the
 * pre-existing `onPick`, untouched), or accept the candidate as-is.
 */
function buildPlaceSearch(
  map: { setView: (lat: number, lon: number, z?: number) => void;
         setMarker: (lat: number, lon: number) => void },
  store: DocumentStore,
): HTMLElement {
  const wrap = el("div", "insp-geo-search");
  const row = el("div", "insp-geo-row");
  const input = document.createElement("input");
  input.type = "search";
  input.className = "insp-name-input";
  input.placeholder = "Search a place…";
  input.title =
    "Place-name search (Nominatim / OpenStreetMap). Online only: without a " +
    "network the map and the manual pick still work.";
  row.appendChild(input);
  wrap.appendChild(row);
  const results = el("div", "insp-geo-hits");
  wrap.appendChild(results);

  let timer = 0;
  let inflight: AbortController | null = null;
  let candidate: { lat: number; lon: number; label: string } | null = null;

  const say = (msg: string, cls = "insp-hint"): void => {
    results.textContent = "";
    results.appendChild(el("div", cls, msg));
  };

  const run = async (q: string): Promise<void> => {
    inflight?.abort();
    const ctrl = new AbortController();
    inflight = ctrl;
    say("Searching…");
    try {
      const hits = await geocode(q, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      results.textContent = "";
      if (!hits.length) {
        say(`No place found for “${q}”.`);
        return;
      }
      for (const h of hits) {
        const b = el("button", "insp-geo-hit");
        const name = el("span", "insp-geo-hit-name", h.label);
        b.appendChild(name);
        if (h.kind) b.appendChild(el("small", undefined, ` ${h.kind}`));
        b.addEventListener("click", () => {
          // fly there + show the candidate; nothing is written yet
          map.setView(h.lat, h.lon, zoomFor(h));
          map.setMarker(h.lat, h.lon);
          candidate = { lat: h.lat, lon: h.lon, label: h.label };
          for (const other of results.querySelectorAll(".insp-geo-hit"))
            other.classList.remove("on");
          b.classList.add("on");
          confirm.classList.remove("hidden");
          confirm.textContent = `Use this point (${h.lat.toFixed(5)}, ${h.lon.toFixed(5)})`;
        });
        results.appendChild(b);
      }
      results.appendChild(
        el("div", "insp-hint", "results © OpenStreetMap contributors · Nominatim"),
      );
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      say(
        e instanceof GeocodeOffline
          ? "Place search is available online. Offline you can still pick on the map or type coordinates."
          : `Search failed: ${(e as Error)?.message ?? "unknown error"}. The map and manual pick still work.`,
      );
    }
  };

  const confirm = document.createElement("button");
  confirm.className = "insp-btn hidden";
  confirm.type = "button";
  confirm.addEventListener("click", () => {
    if (candidate) store.setSitePosition(candidate.lon, candidate.lat);
  });
  row.appendChild(confirm);

  // Debounce: a request per keystroke would be both useless and a breach of the
  // service's usage policy. The rate gate in geocode.ts is the backstop.
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    const q = input.value.trim();
    inflight?.abort();
    if (q.length < 2) {
      results.textContent = "";
      return;
    }
    timer = window.setTimeout(() => void run(q), 500);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    window.clearTimeout(timer);
    const q = input.value.trim();
    if (q.length >= 2) void run(q);
  });
  return wrap;
}

/**
 * MULTIGRAPH · the site-position section, mounted in TWO places by the same
 * function: the canvas panel (no selection) and the graph-self node's own
 * inspector. The multigraph mode exists so graph-scope things can be found by
 * looking at the graph — selecting the GraphNode and not finding where the site
 * lives would defeat it. One renderer, so the two can never drift.
 */
export function renderSitePosition(host: HTMLElement, store: DocumentStore): void {
    // WIN7 · the anchor the narrative window's ⌖ button scrolls to. The site
    // position is what a "site map" block in a chapter reads, so getting to it
    // has to be one click from where the map is being written.
    const heading = el("h3", "insp-sect", "Site position (map)");
    heading.dataset.section = "site-position";   // AUDIT C · no id: two panels, two headings
    host.appendChild(heading);
    const sp0 = store.readSitePosition();
    const spStatus = el(
      "div",
      "insp-hint",
      sp0
        ? `Positioned · ${sp0.lat.toFixed(5)}, ${sp0.lon.toFixed(5)} (${sp0.crs})`
        : "Not positioned — pick a point on the map or type coordinates. Distinct from the 3D shift (GeoPositionNode).",
    );
    host.appendChild(spStatus);

    const coordRow = el("div", "insp-geo-row");
    const latIn = document.createElement("input");
    latIn.className = "insp-name-input insp-geo-coord";
    latIn.placeholder = "lat";
    latIn.value = sp0 ? String(sp0.lat) : "";
    const lonIn = document.createElement("input");
    lonIn.className = "insp-name-input insp-geo-coord";
    lonIn.placeholder = "lon";
    lonIn.value = sp0 ? String(sp0.lon) : "";
    const commitCoords = (): void => {
      const lat = Number(latIn.value.trim());
      const lon = Number(lonIn.value.trim());
      if (latIn.value.trim() === "" && lonIn.value.trim() === "") {
        store.clearSitePosition();
        return;
      }
      // BOTH numbers, or nothing: `Number("")` is 0, and a latitude typed first
      // used to write a site on the Greenwich meridian (COLLEGARE, measured)
      if (latIn.value.trim() === "" || lonIn.value.trim() === "") return;
      if (Number.isFinite(lat) && Number.isFinite(lon))
        store.setSitePosition(lon, lat);
    };
    latIn.addEventListener("change", commitCoords);
    lonIn.addEventListener("change", commitCoords);
    coordRow.appendChild(latIn);
    coordRow.appendChild(lonIn);
    host.appendChild(coordRow);

    const geoBtns = el("div", "insp-geo-row");
    const pickBtn = document.createElement("button");
    pickBtn.className = "insp-btn";
    pickBtn.type = "button";
    pickBtn.textContent = sp0 ? "Pick again on map" : "Pick on map";
    geoBtns.appendChild(pickBtn);
    if (sp0) {
      const clearBtn = document.createElement("button");
      clearBtn.className = "insp-btn";
      clearBtn.type = "button";
      clearBtn.textContent = "Clear";
      clearBtn.addEventListener("click", () => store.clearSitePosition());
      geoBtns.appendChild(clearBtn);
    }
    host.appendChild(geoBtns);

    // The picker mounts inline on demand — a click on the map drops the point
    // (setSitePosition), which re-renders this panel showing the coordinates.
    const mapHost = el("div", "insp-geo-map");
    host.appendChild(mapHost);
    pickBtn.addEventListener("click", () => {
      if (mapHost.firstChild) {
        mapHost.textContent = "";
        return;
      }
      const map = createOsmMap({
        lat: sp0?.lat ?? 41.9,
        lon: sp0?.lon ?? 12.5,
        zoom: sp0 ? 15 : 4,
        markerLabel: "site",
        onPick: (lat, lon) => store.setSitePosition(lon, lat),
      });
      mapHost.appendChild(buildPlaceSearch(map, store));
      mapHost.appendChild(map.el);
      map.activate();
    });
}

/**
 * The study panel, rendered into `root`.
 *
 * Extracted verbatim from `renderInspector`'s no-node branch: same DOM, same
 * order, same strings. Anything that reads differently from before is a bug in
 * the extraction, not an improvement.
 */
export function renderStudyPanel(
  root: HTMLElement,
  store: DocumentStore,
  cb: StudyPanelCallbacks,
): void {
  // The clear used to live in `renderInspector`, one line ABOVE the branch this
  // came from, so the panel always drew into an empty root without saying so.
  // Now that it has its own caller it has to carry that itself — without this
  // line a second render stacks a second panel underneath the first.
  root.innerHTML = "";
  // No node selected → show the canvas header metadata (name + id),
  // editable. These are what the GraphML/em.json header carries; the
  // richer base paradata (authors, license, …) become real nodes later.
  const g = store.doc.graph as Record<string, unknown> & {
    graph_id: string;
  };
  const panel = el("div", "insp-canvas");
  panel.appendChild(el("div", "insp-section-title", "Graph · dataset info"));

  panel.appendChild(el("label", "insp-field-label", "Name"));
  const nameIn = document.createElement("input");
  nameIn.className = "insp-name-input";
  nameIn.value = String((g["name"] as string | undefined) ?? "");
  nameIn.placeholder = "untitled graph";
  nameIn.addEventListener("change", () =>
    store.updateGraphMeta({ name: nameIn.value }),
  );
  panel.appendChild(nameIn);

  panel.appendChild(el("label", "insp-field-label", "ID"));
  const idIn = document.createElement("input");
  idIn.className = "insp-name-input insp-id-input";
  idIn.value = g.graph_id ?? "";
  idIn.addEventListener("change", () => {
    const v = idIn.value.trim();
    if (v) store.updateGraphMeta({ graph_id: v });
    else idIn.value = g.graph_id ?? "";
  });
  panel.appendChild(idIn);

  // ── CANVAS1 · graph-scope metadata (Data Funnel · DP-65) ───────────────
  // MIG1-A: author / licence / embargo are now first-class MEMBER nodes of a
  // graph-scope ParadataNodeGroup owned by the graph-self node — the GLOBAL
  // default of the funnel pyramid. A node with no more-specific value (its
  // own, its activity's, its epoch's) INHERITS these; the badge shows it
  // attenuated ("da Canvas") and the "Propagative metadata" row names the
  // source. DISTINCT from HDT-O "Author(s)" below (the Study's documentary
  // authorship) — this is the propagative default. The EM-ID is the graph's
  // human-readable site id, stored on the graph-self node (import-key detail
  // in IMP1). Editing writes REAL nodes via store.setGraphScope.
  panel.appendChild(
    el("h3", "insp-sect", "Graph metadata (global default)"),
  );
  const gscope = store.readGraphScope();
  const gfield = (
    key: "author" | "license" | "embargo" | "em_id",
    label: string,
    placeholder: string,
    hint: string,
  ): void => {
    panel.appendChild(el("label", "insp-field-label", label));
    const inp = document.createElement("input");
    inp.className = "insp-name-input";
    inp.value = gscope[key];
    inp.placeholder = placeholder;
    inp.addEventListener("change", () =>
      store.setGraphScope({ [key]: inp.value }),
    );
    panel.appendChild(inp);
    panel.appendChild(el("div", "insp-hint", hint));
  };
  gfield(
    "em_id",
    "EM-ID (site id)",
    "e.g. TM (Templu Mare)",
    "Human-readable identifier of this graph / site — the key used across the EM ecosystem (EMtools). Stored on the graph-self node.",
  );
  gfield(
    "author",
    "Author (default)",
    "e.g. M. Rossi",
    "Propagative default (graph-scope AuthorNode): nodes with no author of their own / their epoch / their activity inherit this. Distinct from the Study Author(s) below.",
  );
  gfield(
    "license",
    "Licence (default)",
    "e.g. CC-BY-NC",
    "Graph-scope LicenseNode. Inherited by nodes with no more-specific licence.",
  );
  gfield(
    "embargo",
    "Embargo (default)",
    "e.g. 24 (months)",
    "Graph-scope EmbargoNode. Inherited by nodes with no more-specific embargo.",
  );

  // ── GEO1 · site position (symbolic lon/lat) — DISTINCT from the shift ────
  // "Where the site is on the map": a graph-scope point (GraphNode.data.
  // site_position), separate from the GeoPositionNode SHIFT (the 3D anchor,
  // edited elsewhere). Pick on a mini-map or type lon/lat; empty = not
  // positioned (no fabricated 0/0). Read by the narrative mini-map / overview.
  renderSitePosition(panel, store);

  // ── HDT-O (ECHOES D7.1) per-graph panel ────────────────────────────────
  // This graph = a Study (HC9) whose proposition set (HC16) is about a
  // Heritage Entity (HC1, OPTIONALLY with its digital twin HC2), optionally
  // under a Project (HC13). Editing a field writes/updates REAL gated HDT-O
  // nodes + edges in the em.json (via store.applyHdto) — they are not in the
  // stratigrapher palette; this panel is their authoring surface.
  //
  // THE ONE RULE OF THIS SECTION: nothing here is a gate. An excavator who
  // does not yet know what they are digging fills in what they know, leaves
  // the twin alone, and the state they are in is drawn and named rather than
  // shown as an empty field. See `TwinState` in model.ts.
  const hdto = store.readHdto();
  // text-valued fields only (the authority refs and the twin are objects,
  // handled below)
  type HdtoTextKey = Exclude<
    keyof HdtoFields,
    "heritageAuthorityRef" | "parentAuthorityRef" | "twin"
  >;
  const inputs = {} as Record<HdtoTextKey, HTMLInputElement>;
  // the authority candidates the user picked (verbatim uri/authority/label/
  // rank/match); cleared to free-text when a URI field is edited by hand.
  let pickedRef: AuthorityRef | undefined = hdto.heritageAuthorityRef;
  let pickedParentRef: AuthorityRef | undefined = hdto.parentAuthorityRef;
  // the attribution, held here while the panel is open and written on commit
  let twin: TwinAttribution = { ...hdto.twin };
  function commit(): void {
    store.applyHdto({
      studyTitle: inputs.studyTitle.value,
      studyAuthors: inputs.studyAuthors.value,
      studyDate: inputs.studyDate.value,
      heritageName: inputs.heritageName.value,
      heritageUri: inputs.heritageUri.value,
      heritageAuthorityRef: pickedRef,
      parentName: inputs.parentName.value,
      parentUri: inputs.parentUri.value,
      parentAuthorityRef: pickedParentRef,
      projectName: inputs.projectName.value,
      twin,
    });
  }
  const hfield = (
    key: HdtoTextKey,
    label: string,
    placeholder: string,
    hint?: string,
  ): void => {
    panel.appendChild(el("label", "insp-field-label", label));
    const inp = document.createElement("input");
    inp.className = "insp-name-input";
    inp.value = hdto[key];
    inp.placeholder = placeholder;
    inp.addEventListener("change", commit);
    panel.appendChild(inp);
    if (hint) panel.appendChild(el("div", "insp-hint", hint));
    inputs[key] = inp;
  };
  // §6 · the CODE goes in the tooltip, the WORD on the label. «Study (HC9)»
  // says nothing to a director of excavations; the code still has to be
  // reachable, because it is what the ontology and the papers use.
  const groupTitle = (label: string, glossary: string): void => {
    const row = el("div", "insp-group-title", label);
    row.title = glossary;
    panel.appendChild(row);
  };

  panel.appendChild(el("h3", "insp-sect", t("insp.hdt")));
  panel.appendChild(el("div", "insp-hint", t("insp.hdtHint")));

  groupTitle(t("insp.hdtStudy"), t("insp.hdtStudyGloss"));
  hfield("studyTitle", t("insp.hdtStudyTitle"), t("insp.hdtStudyTitlePh"));
  hfield("studyAuthors", t("insp.hdtStudyAuthors"), t("insp.hdtStudyAuthorsPh"));
  hfield("studyDate", t("insp.hdtStudyDate"), t("insp.hdtStudyDatePh"));

  groupTitle(t("insp.hdtEntity"), t("insp.hdtEntityGloss"));
  hfield("heritageName", t("insp.hdtEntityName"), t("insp.hdtEntityNamePh"));
  buildAuthorityField(
    panel,
    inputs,
    hdto.heritageUri,
    cb,
    {
      get: () => pickedRef,
      set: (r) => (pickedRef = r),
      commit,
    },
    { field: "heritageUri", facet: "WHERE" },
  );
  hfield("parentName", t("insp.hdtParent"), t("insp.hdtParentPh"));
  buildAuthorityField(
    panel,
    inputs,
    hdto.parentUri,
    cb,
    {
      get: () => pickedParentRef,
      set: (r) => (pickedParentRef = r),
      commit,
    },
    { field: "parentUri", facet: "WHERE" },
  );

  groupTitle(t("insp.hdtTwin"), t("insp.hdtTwinGloss"));
  buildTwinField(panel, cb, {
    get: () => twin,
    set: (a) => {
      twin = a;
    },
    commit,
    entityName: () => inputs.heritageName.value,
    entityUri: () => inputs.heritageUri.value,
  });

  groupTitle(t("insp.hdtProject"), t("insp.hdtProjectGloss"));
  hfield(
    "projectName",
    t("insp.hdtProjectName"),
    t("insp.hdtProjectNamePh"),
    // §5 · NO authority field here, and the refusal is the finding.
    // `em.authority_facets()` offers WHEN / WHAT / WHERE / WHO, and a
    // research project is none of them: not a place, not a period, not a
    // type of object, and not a person (WHO consults ULAN/VIAF/GND, which
    // are people and corporate bodies). A project hung on the wrong facet
    // LOOKS resolved, which is worse than free text — so it stays free text
    // and says why. The registers that would serve (CORDIS, ROR, a grant
    // DOI) need a facet of their own in s3Dgraphy first.
    t("insp.hdtProjectHint"),
  );

  // The sentence that used to sit here — "Select a node to inspect it" — is
  // GONE, and this is where it was. It existed because this panel had no window
  // of its own and had to leave a way back to the node inspector. Now it has
  // one, the inspector is once again the place that talks about nodes, and it
  // says that itself when nothing is selected. A study window that ended by
  // telling you to select a node would be describing the wrong thing.
  root.appendChild(panel);
}
