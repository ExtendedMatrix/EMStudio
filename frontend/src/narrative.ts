/**
 * N2 — the narrative view: the graph read as a story.
 *
 * A NarrativeNode carries chapters; each chapter carries prose the author wrote
 * and embeds pointing at resources the graph already holds. This module renders
 * that, read-only (authoring is N3).
 *
 * The one rule that shapes everything here: **an embed is a reference**. Every
 * `ref` is resolved against the CURRENT node index at render time — nothing is
 * cached, nothing is copied. Rename a US and the story says the new name; remove
 * a source and the story says, in as many words, that the reference no longer
 * resolves. A viewer that quietly rendered stale text would undo the reason for
 * authoring on a graph in the first place.
 *
 * Colours and labels come from the vendored datamodel (`nodeStyle`,
 * `typeDescription`) — the same functions the canvas renderer uses. There is one
 * palette in this app and this is not a second one.
 */

import { t } from "./i18n";
import { create3dEmbed, isRef3D, resolve3d } from "./embed3d";
import { geoOf, georeferenceScene, reprojectPoint } from "./geo";
import type { GeoRef } from "./geo";
import { onFirstVisible } from "./lazy";
import { blockStatus, bylineOf, narrativeAuthors } from "./narrative-authorship";
import type { AuthorRef, BlockStatus } from "./narrative-authorship";
import { canonicalViewType, VIEW_TYPES } from "./narrative-edit";
import {
  certaintyLadder, documentEmbed, existenceCertainty, isRmDoc, matrixEmbed,
  paradataEmbed, rmDocEmbed, tableEmbed, timelineEmbed, unSceneEmbed,
} from "./narrative-embeds";
import { iiifBase } from "./settings";
import { createOsmMap } from "./osm-map";
import type { OsmView } from "./osm-map";
import { nodeStyle } from "./palette";
import { narrativeViewTypeDescription, typeDescription } from "./rules";
import type { EmDocument, EmNode } from "./types";

/**
 * What may be DRAGGED into a story, and where it may land.
 *
 * Two gestures, and they are different acts:
 *
 * * a **node** dropped on a chapter becomes an embed of that node. This one
 *   already existed (the handler further down, `nv-drop-over`) — measured, not
 *   assumed: NARRWS1's report still listed it as deferred, and re-adding it
 *   inserted the citation TWICE. The MIME is named here so both ends of the
 *   gesture and its check read the same constant;
 * * a **view type** (from the narrative palette) dropped on an existing embed
 *   changes how that embed is shown — the gesture NARRWS1 left open (D1-full).
 *   It cannot create a block: an embed without a reference points at nothing,
 *   and a story does not need a way to write an empty citation.
 *
 * Both go through the `NarrativeEditor` — the same mutators every button uses.
 * A drop that wrote to the document directly would be a second write path, and
 * the first divergence would be an undo that only half works.
 */
export const NODE_MIME = "application/x-em-node-id";
export const VIEW_TYPE_MIME = "application/x-em-view-type";

/**
 * How a 3D MODEL gets shown — injected, never imported here.
 *
 * The measured reason (P5b): pulling three.js into this module put it in the
 * **editor's** single-file build, which grew 1.96 → 2.76 MB (+41%) because
 * `vite-plugin-singlefile` inlines the dynamic chunk too. The editor is a desk
 * tool that already reaches ATON when it is online; the **reader** is served,
 * unconstrained by the single-file rule, and is where a self-contained
 * navigable model belongs.
 *
 * So the decision moved to the CALLER, and this module stayed free of three:
 *
 * * the **editor** injects nothing → a model falls to the ATON iframe (0 kB);
 * * the **reader** injects a three-backed factory → the glTF is orbited in the
 *   card, offline, with no ATON deployed anywhere.
 *
 * Both produce a viewer for the same reference, which is why `check-narrative`
 * can assert one contract against either: **a viewer, aimed at the right
 * asset, never a placeholder**.
 */
export interface ModelSpec {
  /** The locator the graph names, resolved at render time. Never a copy. */
  url: string;
  label: string;
}

export type ViewerFactory = (host: HTMLElement, spec: ModelSpec) => void;

/** A block as it is serialised by s3Dgraphy (`narrative_node.Block`). */
interface NarrativeBlock {
  block_type: "prose" | "embed";
  text?: string;
  ref?: string;
  view_type?: string;
  options?: Record<string, unknown>;
  // N4/N6 — who wrote it, what they were asked, who vouches for it.
  authored_by?: string;
  prompt_ref?: string;
  validated_by?: string;
  ai_generated?: boolean;
}

interface NarrativeChapter {
  title: string;
  anchor?: string;
  canonical?: boolean;
  blocks?: NarrativeBlock[];
  authored_by?: string;
}

export interface Narrative {
  id: string;
  name: string;
  description?: string;
  lang?: string;
  templateId?: string;
  chapters: NarrativeChapter[];
}

/** The view types this build actually draws.
 *
 *  DP-79 P1 closed the gap: all ELEVEN declared types now have a branch in
 *  `renderEmbed`, so this set and `narrativeViewTypes()` finally agree. It stays
 *  as a separate list on purpose — `check-narrative.mjs` compares the two, so a
 *  view type added to the datamodel without a renderer fails a check instead of
 *  silently becoming a placeholder in somebody's story. */
const RENDERED_VIEW_TYPES = new Set([
  "source", "document", "us", "map", "scene3d", "rm",
  "matrix", "timeline", "table", "paradata", "un_scene",
]);

export function narrativesIn(doc: EmDocument | null): Narrative[] {
  if (!doc?.graph?.nodes) return [];
  return doc.graph.nodes
    .filter((n) => n.node_type === "narrative")
    .map((n) => {
      const data = (n.data ?? {}) as Record<string, unknown>;
      return {
        id: n.id,
        name: String(n.name || n.id),
        description: n.description,
        lang: typeof data.lang === "string" ? data.lang : undefined,
        templateId:
          typeof data.template_id === "string" ? data.template_id : undefined,
        chapters: (data.chapters as NarrativeChapter[]) ?? [],
      };
    });
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Minimal markdown: paragraphs, **bold**, *italic*, `code`. Enough for prose
 *  written in a text box, and small enough not to need a dependency or a
 *  sanitiser — the input is escaped first, so no markup can come through. */
/**
 * Prose a scaffolder wrote and nobody has replaced yet.
 *
 * The Italian in this pattern is NOT text this app shows — it is the shape of
 * DATA another tool writes: s3Dgraphy's `site_story` template fills prose with
 * `PLACEHOLDER = "[da scrivere: {what}]"`, and a document scaffolded there arrives
 * carrying it. Recognising somebody else's marker means matching what they
 * actually wrote, in the language they wrote it in.
 *
 * The client scaffolder's own placeholder goes through `t()` and is therefore in
 * the reader's language; both are matched, so a story looks unwritten whichever
 * side laid it out. (Making the Python side language-aware is the declared next
 * step — see the report; when it lands, its localised marker is one alternative
 * in this pattern.)
 */
const UNWRITTEN_PROSE =
  /^\s*(?:\[da scrivere:|«da scrivere»|«to be written»)/;  // ALLOW-IT: foreign data

/** Is this prose still the scaffolder's placeholder? (The Index counts them.) */
export function isUnwrittenProse(text: string | undefined): boolean {
  return UNWRITTEN_PROSE.test(text ?? "");
}

function renderProse(text: string): HTMLElement {
  const wrap = el("div", "nv-prose");
  for (const para of text.split(/\n{2,}/)) {
    if (!para.trim()) continue;
    const p = el("p");
    const escaped = para
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    p.innerHTML = escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    // Placeholder prose from a scaffolder reads as unwritten, and should look
    // it: the author needs to see at a glance what is still to do.
    if (UNWRITTEN_PROSE.test(para)) p.classList.add("nv-todo");
    wrap.appendChild(p);
  }
  return wrap;
}

function unresolved(ref: string): HTMLElement {
  const box = el("div", "nv-embed nv-unresolved");
  box.appendChild(el("div", "nv-embed-kind", "reference"));
  box.appendChild(
    el("div", "nv-embed-title", `unresolved reference: ${ref}`),
  );
  box.appendChild(
    el(
      "div",
      "nv-embed-note",
      "the graph has no node with this id — it may have been removed, or the " +
        "narrative may come from another graph",
    ),
  );
  return box;
}

function sourceCard(node: EmNode, kind: string,
                    doc?: EmDocument | null): HTMLElement {
  const box = el("div", "nv-embed nv-source");
  box.appendChild(el("div", "nv-embed-kind", kind));
  box.appendChild(el("div", "nv-embed-title", String(node.name || node.id)));
  if (node.description)
    box.appendChild(el("div", "nv-embed-note", node.description));
  // DP-79 P1 · the picture, when there is one and a IIIF service to serve it.
  // A size request on the image that is already in the store — no second copy.
  const figure = documentEmbed(node, iiifBase(), doc ?? null);
  if (figure) box.appendChild(figure);
  const data = (node.data ?? {}) as Record<string, unknown>;
  const url = typeof data.url === "string" ? data.url : undefined;
  if (url) {
    const a = document.createElement("a");
    a.className = "nv-embed-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    a.textContent = url;
    box.appendChild(a);
  }
  return box;
}

function usCard(node: EmNode, doc?: EmDocument | null): HTMLElement {
  // Colour and label from the datamodel, via the same helpers the canvas uses.
  const style = nodeStyle(node.node_type);
  const box = el("div", "nv-embed nv-us");
  box.style.borderLeftColor = style.border;
  const head = el("div", "nv-embed-kind");
  const swatch = el("span", "nv-swatch");
  swatch.style.background = style.fill;
  swatch.style.borderColor = style.border;
  head.appendChild(swatch);
  head.appendChild(document.createTextNode(node.node_type));
  box.appendChild(head);
  box.appendChild(el("div", "nv-embed-title", String(node.name || node.id)));
  if (node.description)
    box.appendChild(el("div", "nv-embed-note", node.description));
  // DP-79 P1 · the qualia the design asks for: how sure we are it EXISTED.
  // Drawn as the whole ladder with one rung lit, because "asserted" alone does
  // not tell a reader it is the third of four.
  const certainty = existenceCertainty(node, doc ?? null);
  if (certainty) box.appendChild(certaintyLadder(certainty));
  const description = typeDescription(node.node_type);
  if (description) box.title = description;
  return box;
}

// Where each map embed's camera was left. The narrative view rebuilds its whole
// DOM on every change (that is how N3 gets undo for free), so without this a
// keystroke in the paragraph above would snap the reader's map back to its
// starting frame. Keyed per block, module-level, never persisted: it is where
// you were looking, not part of the document.
const mapViews = new Map<string, OsmView>();

/**
 * The `map` view type: a real OSM map with the position on it.
 *
 * Tiles are only fetched once the block is on screen — a story with ten
 * positions must not open ten map sessions the moment it is opened — and the
 * card underneath keeps stating the numbers, because the exact coordinate and
 * its frame are the data; the map is the reading of it.
 */
function mapCard(node: EmNode, options: Record<string, unknown>,
                 key: string, doc: EmDocument | null): HTMLElement {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const box = el("div", "nv-embed nv-map");
  box.appendChild(el("div", "nv-embed-kind", "map"));

  // NARRWS1 / GEO1 · a map embed pointing at the GRAPH-SELF node shows the SITE
  // POSITION (symbolic lon/lat, graph-scope) — distinct from the shift. This is
  // the site mini-map; if the graph is not positioned yet, say so and point to
  // the picker (Canvas inspector) instead of drawing an empty/0,0 map.
  if (node.node_type === "graph") {
    const sp = (data.site_position ?? null) as
      | { lon?: unknown; lat?: unknown; crs?: unknown }
      | null;
    const lon = sp ? Number(sp.lon) : NaN;
    const lat = sp ? Number(sp.lat) : NaN;
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      drawMap(box, node, options, key,
        { ok: true, lat, lon, epsg: 4326, rotation: 0 }, doc);
    } else {
      box.appendChild(el("div", "nv-embed-title", t("nv.siteUnplaced")));
      box.appendChild(el("div", "nv-embed-note", t("nv.siteUnplacedHow")));
    }
    return box;
  }

  const geo = geoOf(data);

  if (!geo.ok) {
    if (geo.reason === "needs-reprojection") {
      // A projected frame — a UTM zone, a national grid: the normal case on an
      // excavation. PROJ is on the Python side, so the bridge is asked (G1), and
      // only once the block is on screen: a story with ten positions should not
      // fire ten requests on open.
      const { anchor } = geo;
      const pending = el("div", "nv-embed-note",
        `EPSG:${anchor.epsg} — riproiezione in corso…`);
      box.appendChild(
        el("div", "nv-embed-title",
          `${anchor.x.toFixed(3)}, ${anchor.y.toFixed(3)} (EPSG:${anchor.epsg})`),
      );
      box.appendChild(pending);
      onFirstVisible(box, () => {
        void (async () => {
          const out = await reprojectPoint(anchor.x, anchor.y, anchor.epsg);
          if ("error" in out) {
            // Never a guess. The numbers and the frame stay on screen, and the
            // note says exactly what is missing.
            pending.textContent = t("nv.noReprojection",
              { epsg: String(anchor.epsg), why: out.error });
            pending.classList.add("nv-geo-unavailable");
            return;
          }
          // Same widget, same caption, same memory — only the coordinates came
          // from somewhere else.
          box.textContent = "";
          box.appendChild(el("div", "nv-embed-kind", "map"));
          drawMap(box, node, options, key, {
            ok: true, lat: out.lat, lon: out.lon, epsg: anchor.epsg,
            rotation: anchor.rotation,
            note: `riproiettato da EPSG:${anchor.epsg} (pyproj)`,
          }, doc);
        })();
      });
      return box;
    }
    box.appendChild(
      el("div", "nv-embed-title", t("nv.anchorNoCoords")),
    );
    box.appendChild(
      el("div", "nv-embed-note", t("nv.geoNodeHint")),
    );
    return box;
  }

  drawMap(box, node, options, key, geo, doc);
  return box;
}

/** The map widget plus its caption, for a reference that is already in degrees.
 *  Split out of `mapCard` because a reprojected reference arrives later and must
 *  land in exactly the same UI — one place that draws a map, not two. */
function drawMap(box: HTMLElement, node: EmNode,
                 options: Record<string, unknown>, key: string,
                 geo: Extract<GeoRef, { ok: true }>,
                 doc: EmDocument | null): void {
  const remembered = mapViews.get(key);
  const zoom = remembered?.zoom ?? Number(options.zoom ?? 16);
  const map = createOsmMap({
    lat: geo.lat,
    lon: geo.lon,
    zoom,
    // The pan is restored too, not just the zoom: re-centring on the marker
    // after every keystroke would undo the reader's look around.
    center: remembered ? { lat: remembered.lat, lon: remembered.lon } : undefined,
    markerLabel: String(node.name || node.id),
    onViewChange: (v) => mapViews.set(key, v),
  });
  box.appendChild(map.el);
  const caption = el("div", "nv-map-caption");
  onFirstVisible(map.el, () => {
    map.activate();
    // G3 — pose the SCENE, not just the point: the graph's own spatial proxies
    // give a local extent, the anchor gives the azimuth and the origin, and the
    // bridge returns the footprint already in degrees. Asked for only once the
    // map is on screen, and silent when the graph has no geometry: most graphs
    // do not, and a footprint invented for them would be a fabrication drawn at
    // metre precision.
    void (async () => {
      if (!doc) return;
      const placed = await georeferenceScene(doc);
      // `null` = the graph has no geometry to place, which is the common case and
      // says nothing worth saying. An ERROR is different: the graph HAS geometry
      // and something about the anchor prevents placing it — most often an anchor
      // in degrees, which cannot carry a metric footprint. That, the reader
      // should see, because it is fixable.
      if (!placed) return;
      if ("error" in placed) {
        const why = el("span", "nv-embed-note nv-geo-unavailable",
          `impronta non disponibile: ${placed.error}`);
        caption.appendChild(why);
        return;
      }
      map.setFootprint(placed.corners);
      // The marker moves onto the CENTROID: the shift is the anchor, and it may
      // legitimately sit hundreds of metres from the monument.
      map.setMarker(placed.centroid[1], placed.centroid[0]);
      const size = el("span", "nv-embed-note",
        t("nv.footprint", { w: placed.width.toFixed(1),
                             h: placed.height.toFixed(1) })
        + (placed.rotation
            ? t("nv.footprintAzimuth", { deg: String(placed.rotation) })
            : t("nv.footprintNorthUp")));
      size.title = t("nv.footprintTitle");
      caption.appendChild(size);
    })();
  });

  caption.appendChild(
    el("span", "nv-map-coords",
      `${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`),
  );
  caption.appendChild(
    el("span", "nv-embed-note", geo.note ?? `EPSG:${geo.epsg}`),
  );
  const a = document.createElement("a");
  a.className = "nv-embed-link";
  a.href =
    `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}` +
    `#map=${Math.round(zoom)}/${geo.lat}/${geo.lon}`;
  a.target = "_blank";
  a.rel = "noreferrer noopener";
  a.textContent = t("nv.openOsm");
  a.addEventListener("click", (e) => e.stopPropagation());
  caption.appendChild(a);
  // The azimuth is part of the anchor: a scene rotated 27° from north is a
  // different statement about the ground than one that is not, and the reader of
  // a georeferenced narrative should be able to see which they are looking at.
  if (geo.rotation)
    caption.appendChild(
      el("span", "nv-embed-note", `azimut ${geo.rotation}°`));
  box.appendChild(caption);
}

/**
 * The `scene3d` and `rm` view types: the 3D, in the chapter.
 *
 * One card for both, because the difference is what the embed POINTS AT, not how
 * it is shown: a scene is the graph's published scene (or an RM standing for an
 * epoch), an `rm` is one representation model. `resolve3d` walks from either to
 * the Resource that holds the geometry, and the frame is ATON's — Heriverse for a
 * published scene, ATON's preview app for a single model.
 *
 * When there is nothing to show, the card says which of the gaps it is: no
 * reference in the graph, no server configured, or a file no web viewer can read.
 */
/** The glTF this node points at, if it points at one.
 *
 *  Read at RENDER time from whichever field carries it — `url` on a promoted
 *  ResourceNode (DP-76: reference + url + checksum), or the locator a Shelf
 *  asset uses. Nothing is copied into the narrative: the story holds an id, and
 *  what that id resolves to is the graph's business, now. */
const GLTF_LOCATOR = /\.(gltf|glb)(\?|#|$)/i;

function modelLocator(node: EmNode): string | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  for (const key of ["url", "locator", "path", "scene_url"]) {
    const value = data[key];
    if (typeof value === "string" && GLTF_LOCATOR.test(value)) return value;
  }
  return null;
}

function scene3dCard(node: EmNode, doc: EmDocument | null,
                     key: string, kind = "scene3d",
                     viewer?: ViewerFactory): HTMLElement {
  const ref = resolve3d(node, doc);
  const box = el("div", "nv-embed nv-3d");
  box.appendChild(el("div", "nv-embed-kind", kind));
  box.appendChild(el("div", "nv-embed-title", String(node.name || node.id)));
  const what = narrativeViewTypeDescription(kind);
  if (what) box.title = what;
  // P5b · a MODEL is shown here, self-contained; a SCENE stays an iframe.
  // Two different jobs, not one job done twice: a glTF is orbited in the card
  // and needs no ATON deployed anywhere (the field case, and the offline one),
  // while a Heriverse scene carries epochs and a temporal UI that are exactly
  // what a viewer-whose-whole-job-is-to-be-the-viewer is for.
  const locator = modelLocator(node);
  if (locator && viewer) {
    const stage = el("div", "nv-3d-stage");
    box.appendChild(stage);
    viewer(stage, { url: locator, label: String(node.name || node.id) });
    return box;
  }
  if (!isRef3D(ref)) {
    box.classList.add("nv-pending");
    box.appendChild(el("div", "nv-embed-note", ref.hint));
    return box;
  }
  // An RM in a list of chapters is a smaller thing than the site's scene, and a
  // reader scrolling past six of them should not meet six full-height stages.
  box.appendChild(create3dEmbed(ref, {
    key, auto: true, height: kind === "rm" ? 300 : 380,
  }));
  return box;
}

function notYetRendered(viewType: string, node: EmNode | null,
                        ref: string): HTMLElement {
  const box = el("div", "nv-embed nv-pending");
  box.appendChild(el("div", "nv-embed-kind", viewType));
  box.appendChild(
    el("div", "nv-embed-title", node ? String(node.name || node.id) : ref),
  );
  box.appendChild(
    el("div", "nv-embed-note",
      `the “${viewType}” view is not rendered yet — the reference is valid and ` +
      `will show as soon as it is`),
  );
  return box;
}

function renderEmbed(
  block: NarrativeBlock,
  index: Map<string, EmNode>,
  doc: EmDocument | null,
  /** Stable identity of this block — `narrative:chapter:block:ref`. Lets an
   *  embed with live state (a map's camera, a loaded 3D frame) survive the
   *  view's rebuild without being written into the document. */
  key: string,
  onReveal?: (nodeId: string) => void,
  viewer?: ViewerFactory,
): HTMLElement {
  const ref = block.ref ?? "";
  const node = index.get(ref) ?? null;
  // Read-tolerant (G1): a narrative saved with `epoch3d` renders as `scene3d`.
  // Applied here rather than at load so nothing rewrites the document behind the
  // author's back — the file is upgraded when they next save it, not on opening.
  const viewType = canonicalViewType(block.view_type);
  let box: HTMLElement;
  if (!node) {
    box = unresolved(ref);
  } else if (viewType === "source" || viewType === "document") {
    box = sourceCard(node, viewType, doc);
  } else if (viewType === "us") {
    box = usCard(node, doc);
  } else if (viewType === "matrix") {
    box = matrixEmbed(node, doc);
  } else if (viewType === "timeline") {
    box = timelineEmbed(node, doc);
  } else if (viewType === "table") {
    box = tableEmbed(node, doc, block.options ?? {});
  } else if (viewType === "paradata") {
    box = paradataEmbed(node, doc);
  } else if (viewType === "un_scene") {
    box = unSceneEmbed(node, doc);
  } else if (viewType === "map") {
    box = mapCard(node, block.options ?? {}, key, doc);
  } else if (viewType === "rm" && isRmDoc(node)) {
    // DP-79 P3 · the domain correction. RM and RMSF are 3D — one way this app
    // shows 3D, and it is the stage below. An **RMDoc** is the other family: a
    // 2D document that had to be PLACED, so its embed is the document (with its
    // IIIF picture) plus what the placement is worth. Routing both through the
    // 3D stage showed an empty viewer for a photograph, which is the wrong
    // answer twice: nothing to see, and a claim that there was.
    box = rmDocEmbed(node, doc, iiifBase());
  } else if (viewType === "scene3d" || viewType === "rm") {
    // `rm` renders through the same ATON embed (G2): a representation model IS a
    // 3D asset, and there is one way this app shows 3D.
    box = scene3dCard(node, doc, key, viewType, viewer);
  } else {
    box = notYetRendered(viewType || "embed", node, ref);
  }
  if (node && onReveal) {
    const reveal = () => onReveal(node.id);
    // An embed you can DO something in cannot also be one big button: dragging
    // a map or orbiting a scene would jump to the canvas and close the story.
    // Those get an explicit way in instead — same gesture, stated.
    if (viewType === "map" || viewType === "scene3d"
        || viewType === "rm") {
      const go = el("button", "nv-goto", t("nv.goToNode")) as HTMLButtonElement;
      go.title = t("nv.goToNodeTitle", { name: String(node.name || node.id) });
      go.addEventListener("click", (e) => {
        e.stopPropagation();
        reveal();
      });
      box.appendChild(go);
    } else {
      box.classList.add("nv-clickable");
      box.tabIndex = 0;
      box.setAttribute("role", "button");
      box.addEventListener("click", reveal);
      box.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          reveal();
        }
      });
    }
  }
  return box;
}

// ── provenance of a paragraph (N6) ─────────────────────────────────
//
// The badge is not decoration. A reader of an archaeological narrative has to
// be able to tell, without asking, whether the sentence in front of them was
// written by a person, produced by a model and left unchecked, or produced by a
// model and signed off by somebody who can be asked about it.
//
// Colours come from the vendored visual rules — the AI badge takes the AUTH_AI
// node style, the endorsement badge takes AUTH — so the story and the canvas
// say "author" in the same colour. Nothing here is a second palette.

/** status → the dictionary KEY of its badge. Keys and not words, resolved at
 *  render time: a badge is rendered chrome, so it follows the current language
 *  (a constant of words would freeze the locale the bundle started in). */
const STATUS_LABEL_KEY: Record<BlockStatus, string> = {
  human: "",                     // a person wrote it; nothing to announce
  ai_draft: "nv.statusAiDraft",
  ai_endorsed: "nv.statusEndorsed",
};

/**
 * The strip under a generated paragraph: what wrote it, what it was asked, who
 * (if anyone) has vouched for it, and the gesture to vouch.
 *
 * `onReveal` makes the prompt reachable in ONE click, exactly like any other
 * source embed — "how do I know this" has to hold for "how did the machine come
 * to write it" too, or the transparency is decorative.
 */
function provenanceStrip(
  block: NarrativeBlock,
  index: Map<string, EmNode>,
  onReveal?: (nodeId: string) => void,
  endorse?: () => void,
  retract?: () => void,
  signer?: AuthorRef | null,
): HTMLElement | null {
  const status = blockStatus(block);
  if (status === "human") return null;
  const ai = nodeStyle("author_ai");
  const human = nodeStyle("author");
  const strip = el("div", "nv-prov");

  const key = STATUS_LABEL_KEY[status];
  const badge = el("span", "nv-prov-badge", key ? t(key) : "");
  const style = status === "ai_endorsed" ? human : ai;
  badge.style.background = style.fill;
  badge.style.borderColor = style.border;
  badge.style.color = style.textColor;
  strip.appendChild(badge);

  const model = index.get(block.authored_by ?? "");
  if (block.authored_by) {
    const who = el("span", "nv-prov-who",
      model ? String(model.name || model.id) : block.authored_by);
    who.title = t("nv.modelWrote");
    strip.appendChild(who);
  }
  const opts = block.options ?? {};
  for (const key of ["model_version", "generated_at"]) {
    const v = opts[key];
    if (typeof v === "string" && v) {
      const chip = el("span", "nv-prov-dim", v);
      chip.title = key === "generated_at"
        ? t("nv.whenGenerated")
        : t("nv.modelVersion");
      strip.appendChild(chip);
    }
  }

  if (block.prompt_ref) {
    const prompt = index.get(block.prompt_ref);
    const link = el("button", "nv-prov-link", "prompt") as HTMLButtonElement;
    link.title = prompt?.description
      ? t("nv.whatWasAsked", { text: prompt.description })
      : t("nv.promptNotInGraph", { id: String(block.prompt_ref) });
    if (!prompt) link.classList.add("nv-prov-missing");
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      if (prompt && onReveal) onReveal(prompt.id);
    });
    link.disabled = !prompt || !onReveal;
    strip.appendChild(link);
  } else {
    const none = el("span", "nv-prov-dim nv-prov-missing", t("nv.noPrompt"));
    none.title = t("nv.noPromptTitle");
    strip.appendChild(none);
  }

  if (status === "ai_endorsed") {
    const by = index.get(block.validated_by ?? "");
    const sig = el("span", "nv-prov-signed",
      `✓ ${by ? String(by.name || by.id) : block.validated_by}`);
    sig.title = t("nv.whoSigned");
    strip.appendChild(sig);
    if (retract) {
      const b = el("button", "nv-mini", t("nv.retract")) as HTMLButtonElement;
      b.title = t("nv.retractTitle");
      b.addEventListener("click", (e) => { e.stopPropagation(); retract(); });
      strip.appendChild(b);
    }
  } else if (endorse) {
    // Never disabled for lack of a signer. A disabled button with an
    // explanation of where the missing control lives makes the user hunt; this
    // one always acts — it signs, or it brings the picker to them.
    const b = el("button", "nv-endorse", t("nv.endorse")) as HTMLButtonElement;
    b.title = signer
      ? t("nv.endorseTitle", { who: signer.label })
      : t("nv.pickSigner");
    b.classList.toggle("nv-endorse-unsigned", !signer);
    b.addEventListener("click", (e) => { e.stopPropagation(); endorse(); });
    strip.appendChild(b);
  }
  return strip;
}

/**
 * Render the narratives of `doc` into `container`.
 *
 * `onReveal` — when given, an embed that resolves becomes a way into the graph:
 * the same select-and-centre gesture the Log tab uses.
 */
/** The authoring hooks (N3). Absent → the view is read-only, which is what N2
 *  was and what a published render should stay. */
export interface NarrativeEditor {
  narrativeId: string;
  addChapter(): void;
  renameChapter(index: number, title: string): void;
  moveChapter(index: number, delta: number): void;
  deleteChapter(index: number): void;
  toggleCanonical(index: number): void;
  setAnchor(index: number, anchor: string | null): void;
  addProse(chapter: number): void;
  setProse(chapter: number, block: number, text: string): void;
  addEmbed(chapter: number, ref: string, at?: number): void;
  setViewType(chapter: number, block: number, viewType: string): void;
  moveBlock(chapter: number, block: number, delta: number): void;
  deleteBlock(chapter: number, block: number): void;
  /** Lanes a chapter may be anchored to: epochs and activities. */
  lanes(): { id: string; label: string }[];
  // — NARR1 · scaffold-from-graph affordances (all optional: the editor works
  //   without them, they only add the "reintroduce epoch" + regenerate seam) —
  /** Top-level epochs not yet described by a chapter (the reintroduce chips). */
  undescribedEpochs?(): { id: string; name: string }[];
  /** Append a chapter anchored to `epochId` (default embed) — reintroduce. */
  addEpochChapter?(epochId: string): void;
  /** Seam: rebuild the draft from s3Dgraphy site_story via the bridge. */
  regenerateViaBridge?(): void;
  /** Whether the bridge regenerate is available (else the button is disabled). */
  canRegenerate?(): boolean;

  // — authorship, generation, endorsement (N6) —
  /** Everyone the graph knows as an author, models included. */
  authors(): AuthorRef[];
  /** Only people. A model may not sign — see `endorse`. */
  humanAuthors(): AuthorRef[];
  addAuthor(authorId: string): void;
  removeAuthor(authorId: string): void;
  setChapterAuthor(index: number, authorId: string | null): void;
  /** Who is signing, right now. One place says it; every Valida uses it. */
  signer(): AuthorRef | null;
  setSigner(authorId: string | null): void;
  endorse(chapter: number, block: number): void;
  /** Vouch for every unendorsed AI paragraph in one chapter, one act each. */
  endorseChapter(chapter: number): void;
  /** How many paragraphs `endorseChapter` would sign right now. */
  pendingIn(chapter: number): number;
  retract(chapter: number, block: number): void;
  /** True where a draft can be generated: the chapter narrates an ACTIVITY,
   *  which is where the actions — and so the story — are. */
  canGenerate(index: number): boolean;
  generate(index: number): void;
  /** A request is in flight for this chapter. */
  generating(index: number): boolean;
}

/**
 * CURRENT-ELEMENT · which chapter this window is working on.
 *
 * A separate parameter from the editor on purpose: choosing the chapter you are
 * looking at is NAVIGATION, not editing — it has to work while merely reading,
 * which is exactly when someone reaches for "insert a map here".
 */
export interface CurrentChapter {
  index(): number | null;
  set(index: number): void;
}

function authorChip(a: AuthorRef, ai: boolean): HTMLElement {
  const style = nodeStyle(ai ? "author_ai" : "author");
  const chip = el("span", "nv-author-chip", a.label);
  chip.style.background = style.fill;
  chip.style.borderColor = style.border;
  chip.style.color = style.textColor;
  return chip;
}

function chipRemove(a: AuthorRef, onClick: () => void): HTMLButtonElement {
  const x = el("button", "nv-chip-x", "✕") as HTMLButtonElement;
  x.title = t("nv.removeAuthor", { who: a.label });
  x.addEventListener("click", onClick);
  return x;
}

/** A `<select>` over authors. Resets to its placeholder after a pick when the
 *  chosen value is an action rather than a state ("+ autore"). */
function authorSelect(options: AuthorRef[], selected: string | null,
                      placeholder: string, title: string,
                      onPick: (id: string | null) => void): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.className = "nv-author-select";
  sel.title = title;
  const none = document.createElement("option");
  none.value = "";
  none.textContent = placeholder;
  none.selected = !selected;
  sel.appendChild(none);
  for (const a of options) {
    const o = document.createElement("option");
    o.value = a.id;
    o.textContent = a.ai ? `${a.label} (AI)` : a.label;
    o.selected = a.id === selected;
    sel.appendChild(o);
  }
  sel.disabled = options.length === 0;
  sel.addEventListener("change", () => onPick(sel.value || null));
  return sel;
}

function iconButton(label: string, title: string,
                    onClick: () => void): HTMLButtonElement {
  const b = el("button", "nv-mini", label) as HTMLButtonElement;
  b.title = title;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function renderNarrativeView(
  container: HTMLElement,
  doc: EmDocument | null,
  selectedId: string | null,
  onSelect: (id: string) => void,
  onReveal?: (nodeId: string) => void,
  editor?: NarrativeEditor,
  currentChapter?: CurrentChapter,
  /** How a 3D MODEL is shown. Absent → the ATON iframe (the editor's case, and
   *  0 kB); a three-backed factory → navigable in the card (the reader's). */
  viewer?: ViewerFactory,
): void {
  container.textContent = "";
  const narratives = narrativesIn(doc);

  if (!narratives.length) {
    const empty = el("div", "nv-empty");
    empty.appendChild(
      el("p", undefined,
        doc ? "This document contains no narrative."
            : "No document loaded."),
    );
    if (doc)
      empty.appendChild(
        el("p", "nv-empty-hint",
          "A narrative is a NarrativeNode in the em.json: chapters over the " +
          "graph's lanes, with prose and embeds. The s3Dgraphy `site_story` " +
          "template generates a first draft from an existing graph."),
      );
    container.appendChild(empty);
    return;
  }

  const current =
    narratives.find((n) => n.id === selectedId) ?? narratives[0];

  if (narratives.length > 1) {
    const bar = el("div", "nv-picker");
    for (const n of narratives) {
      const b = el("button", "nv-picker-btn", n.name) as HTMLButtonElement;
      b.classList.toggle("active", n.id === current.id);
      b.addEventListener("click", () => onSelect(n.id));
      bar.appendChild(b);
    }
    container.appendChild(bar);
  }

  const head = el("header", "nv-head");
  head.appendChild(el("h1", "nv-title", current.name));
  const meta: string[] = [];
  if (current.lang) meta.push(current.lang);
  if (current.templateId) meta.push(`template: ${current.templateId}`);
  meta.push(`${current.chapters.length} chapters`);
  head.appendChild(el("div", "nv-meta", meta.join(" · ")));
  if (current.description)
    head.appendChild(el("p", "nv-lede", current.description));

  // The byline is TWO lines, and the split is the point (N8). People who can be
  // asked about a claim go first, as responsible; models follow as assistance.
  // One line listing them as equal co-authors would state something false.
  const { responsible, assisted } = bylineOf(doc, current.id, current.chapters);
  const declared = narrativeAuthors(doc, current.id);

  const byline = el("div", "nv-authors");
  byline.appendChild(el("span", "nv-authors-label", t("nv.curatedBy")));
  if (!responsible.length)
    byline.appendChild(el("span", "nv-prov-dim nv-prov-missing",
      t("nv.noResponsible")));
  for (const a of responsible) {
    const chip = authorChip(a, false);
    chip.title = declared.some((d) => d.id === a.id)
      ? t("nv.humanAuthor")
      : t("nv.endorsedGenerated");
    if (editor && declared.some((d) => d.id === a.id))
      chip.appendChild(chipRemove(a, () => editor.removeAuthor(a.id)));
    byline.appendChild(chip);
  }
  // SURFACE-STABLE · the byline's own chrome gets its own LINE, reserved in both
  // modes. It used to sit beside the names and wrap when it did not fit — 28 px
  // of row became 55, so the whole story moved down 27 px on entering edit (and
  // back up when the window lost the focus, since a secondary area is
  // read-only). Same rule as the block lane: the affordance's space is spoken
  // for, and turning on edit fills it instead of making room.
  const bylineTools = el("div", "nv-authors-tools");
  byline.appendChild(bylineTools);
  if (editor) {
    const add = authorSelect(
      editor.authors().filter(
        (a) => !a.ai && !responsible.some((x) => x.id === a.id)),
      null, t("nv.addAuthor"), t("nv.addAuthorTitle"),
      (id) => { if (id) editor.addAuthor(id); });
    bylineTools.appendChild(add);

    // "Signing as" lives once, at the top: an endorsement is the same act
    // whichever paragraph it lands on, and asking who you are on every click
    // would turn a signature into a form.
    const signing = el("span", "nv-signing");
    signing.appendChild(el("span", "nv-authors-label", t("nv.signingAs")));
    const humans = editor.humanAuthors();
    signing.appendChild(authorSelect(
      humans, editor.signer()?.id ?? null,
      humans.length ? t("nv.nobody") : t("nv.noHumanAuthor"),
      "Chi mette il proprio nome quando premi Valida. Solo persone: " +
      "un modello non può avallare.",
      (id) => editor.setSigner(id)));
    bylineTools.appendChild(signing);
  }
  head.appendChild(byline);

  // «con l'assistenza di …» — declared, attributed, and subordinate. A model is
  // never a co-author here: nothing it wrote counts until a person endorses it.
  if (assisted.length) {
    const help = el("div", "nv-authors nv-assist");
    help.appendChild(el("span", "nv-authors-label", t("nv.assistedBy")));
    for (const a of assisted) {
      const chip = authorChip(a, true);
      chip.title = t("nv.assistingModelTitle");
      if (editor && declared.some((d) => d.id === a.id))
        chip.appendChild(chipRemove(a, () => editor.removeAuthor(a.id)));
      help.appendChild(chip);
    }
    head.appendChild(help);
  }
  container.appendChild(head);

  const index = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));

  current.chapters.forEach((chapter, ci) => {
    const section = el("section", "nv-chapter");
    // CURRENT-ELEMENT · clicking anywhere in a chapter makes it the window's
    // current one (the marker is a left accent rule, see `.nv-chapter.nv-current`).
    // Menus that say "the current chapter" then have something true to mean.
    if (currentChapter?.index() === ci) section.classList.add("nv-current");
    if (currentChapter)
      section.addEventListener("mousedown", () => currentChapter.set(ci));

    const h = el("div", "nv-chapter-head");
    h.appendChild(el("h2", "nv-chapter-title", chapter.title || "(untitled)"));
    if (chapter.canonical) {
      const badge = el("span", "nv-badge", "canonical");
      badge.title =
        "Settled by the author: regenerating the template leaves this chapter " +
        "untouched.";
      h.appendChild(badge);
    }
    if (chapter.authored_by && !editor) {
      const node = index.get(chapter.authored_by);
      const who = node ? String(node.name || node.id) : chapter.authored_by;
      const chip = el("span", "nv-author-chip nv-author-inline", who);
      const style = nodeStyle(node?.node_type ?? "author");
      chip.style.background = style.fill;
      chip.style.borderColor = style.border;
      chip.style.color = style.textColor;
      chip.title = t("nv.whoSignsChapter");
      h.appendChild(chip);
    }
    if (chapter.anchor) {
      // The chapter usually takes its title FROM the lane, so echoing the lane's
      // name beside it just says the same word twice. Show the id in that case:
      // it is the part the reader cannot already see.
      const anchorNode = index.get(chapter.anchor);
      const laneName = anchorNode ? String(anchorNode.name || "") : "";
      const label = laneName && laneName !== chapter.title
        ? laneName
        : chapter.anchor;
      const chip = el("span", "nv-anchor", label);
      chip.title = laneName
        ? `This chapter narrates the lane “${laneName}” (${chapter.anchor})`
        : `This chapter narrates the lane “${chapter.anchor}”, which is not in this graph`;
      if (!anchorNode) chip.classList.add("nv-anchor-missing");
      h.appendChild(chip);
    }
    // SURFACE-STABLE · the chapter's toolbar lane exists in both modes, and its
    // reserved height is what keeps the head the same height either way. Without
    // it the head was 29 px reading and 31 px writing — three pixels per chapter,
    // so the fourth chapter sat a line lower than where you left it.
    const tools = el("div", "nv-chapter-tools");
    h.appendChild(tools);
    if (editor) {
      // The chapter toolbar already carries an author select; without a label
      // the two read as one, and the user looks for the signer here.
      tools.appendChild(el("span", "nv-tool-label", t("nv.chapterAuthor")));
      const canon = iconButton(
        chapter.canonical ? "★" : "☆",
        chapter.canonical
          ? "Settled: the template regeneration leaves this chapter alone. Click to un-settle."
          : "Mark as settled, so regenerating the template does not touch it.",
        () => editor.toggleCanonical(ci));
      tools.appendChild(canon);
      const laneSel = document.createElement("select");
      laneSel.className = "nv-lane-select";
      laneSel.title = "The lane this chapter narrates";
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "(no lane)";
      none.selected = !chapter.anchor;
      laneSel.appendChild(none);
      for (const lane of editor.lanes()) {
        const o = document.createElement("option");
        o.value = lane.id;
        o.textContent = lane.label;
        o.selected = lane.id === chapter.anchor;
        laneSel.appendChild(o);
      }
      laneSel.addEventListener("change", () =>
        editor.setAnchor(ci, laneSel.value || null));
      tools.appendChild(laneSel);
      tools.appendChild(iconButton("▲", "Move chapter up",
        () => editor.moveChapter(ci, -1)));
      tools.appendChild(iconButton("▼", "Move chapter down",
        () => editor.moveChapter(ci, 1)));
      tools.appendChild(iconButton("✕", "Delete this chapter",
        () => editor.deleteChapter(ci)));
      tools.appendChild(authorSelect(
        editor.authors(), chapter.authored_by ?? null, t("nv.noAuthor"),
        t("nv.whoSignsChapter"),
        (id) => editor.setChapterAuthor(ci, id)));
      // Generation is anchored to an ACTIVITY: that is where the actions are,
      // and a briefing built from anything else would be empty. The button is
      // simply absent elsewhere rather than present and disabled — a control
      // that can never apply is noise.
      if (editor.canGenerate(ci)) {
        const busy = editor.generating(ci);
        const gen = el("button", "nv-generate",
          busy ? t("nv.generating") : t("nv.generateDraft")) as HTMLButtonElement;
        gen.disabled = busy;
        gen.title = t("nv.generateTitle");
        gen.addEventListener("click", (e) => {
          e.stopPropagation();
          editor.generate(ci);
        });
        tools.appendChild(gen);
      }
      // "Valida capitolo" states the count in its own label: an endorsement is
      // a signature, and a button that doesn't say how much it is signing
      // invites an absent-minded stamp.
      const pending = editor.pendingIn(ci);
      if (pending > 0) {
        const signer = editor.signer();
        const all = el("button", "nv-endorse nv-endorse-all",
          t("nv.endorseChapter", { n: String(pending) })) as HTMLButtonElement;
        all.classList.toggle("nv-endorse-unsigned", !signer);
        all.title = signer
          ? t(pending === 1 ? "nv.endorseChapterTitleOne"
                            : "nv.endorseChapterTitle",
              { who: signer.label, n: String(pending) })
          : t("nv.pickSigner");
        all.addEventListener("click", (e) => {
          e.stopPropagation();
          editor.endorseChapter(ci);
        });
        tools.appendChild(all);
      }

      const titleEl = h.querySelector(".nv-chapter-title") as HTMLElement;
      titleEl.contentEditable = "true";
      titleEl.spellcheck = false;
      titleEl.classList.add("nv-editable");
      titleEl.title = "Click to rename";
      titleEl.addEventListener("blur", () => {
        const next = (titleEl.textContent || "").trim();
        if (next && next !== chapter.title) editor.renameChapter(ci, next);
      });
      titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          titleEl.blur();
        }
      });
    }
    section.appendChild(h);

    const blocks = chapter.blocks ?? [];
    blocks.forEach((block, bi) => {
      let body = block.block_type === "prose"
        ? (editor ? editableProse(block.text ?? "", (t) =>
            editor.setProse(ci, bi, t))
          : renderProse(block.text ?? ""))
        : renderEmbed(block, index, doc,
            `${current.id}:${ci}:${bi}:${block.ref ?? ""}`, onReveal, viewer);
      // D1-full · drop a VIEW TYPE on an embed and it changes how that embed is
      // shown. Only on an embed, and only to change one: a view type cannot
      // create a block, because a block without a reference points at nothing.
      if (editor && block.block_type === "embed") {
        body.addEventListener("dragover", (e) => {
          const dt = (e as DragEvent).dataTransfer;
          if (!dt || !dt.types.includes(VIEW_TYPE_MIME)) return;
          e.preventDefault();
          dt.dropEffect = "copy";
          body.classList.add("nv-drop-target");
        });
        body.addEventListener("dragleave", () =>
          body.classList.remove("nv-drop-target"));
        body.addEventListener("drop", (e) => {
          const dt = (e as DragEvent).dataTransfer;
          body.classList.remove("nv-drop-target");
          const viewType = dt?.getData(VIEW_TYPE_MIME);
          if (!viewType) return;
          e.preventDefault();
          e.stopPropagation();
          editor.setViewType(ci, bi, viewType);
        });
      }
      // Provenance rides with the paragraph in BOTH modes: knowing a machine
      // wrote this is not an authoring convenience, it is what the reader needs.
      const strip = block.block_type === "prose"
        ? provenanceStrip(block, index, onReveal,
            editor ? () => editor.endorse(ci, bi) : undefined,
            editor ? () => editor.retract(ci, bi) : undefined,
            editor ? editor.signer() : null)
        : null;
      if (strip) {
        const wrap = el("div", `nv-prose-wrap nv-${blockStatus(block)}`);
        wrap.appendChild(body);
        wrap.appendChild(strip);
        body = wrap;
      }
      // SURFACE-STABLE · the row and its TOOLS LANE exist in both modes, and the
      // lane is RESERVED whether or not anything is in it.
      //
      // Measured on 21 Aug 2026, at equal area widths: entering edit narrowed the
      // prose from 576 to 482 px and the matrix embed from 576 to 403 — because
      // the lane was in flow and was a DIFFERENT width per block type (three
      // buttons for a paragraph, a select plus three for an embed). So the story
      // re-paginated on entering edit, the embeds did not even agree with the
      // prose inside edit mode, and — since a secondary area is read-only — a
      // window in edit mode re-paginated again the moment it lost the focus.
      // That last one is what read as "the layout changes with the focus".
      //
      // One lane, one width (`--nv-tools-w`, defined once in the stylesheet),
      // always there: the prose and the embeds keep their column in all four
      // states, and edit mode only fills a space that was already spoken for.
      const row = el("div", "nv-block-row");
      body.classList.add("nv-block-body");
      row.appendChild(body);
      const tools = el("div", "nv-block-tools");
      row.appendChild(tools);
      section.appendChild(row);
      if (!editor) return;                  // read-only: the lane stays empty
      if (block.block_type === "embed") {
        const current = canonicalViewType(block.view_type);
        const sel = document.createElement("select");
        sel.className = "nv-viewtype";
        sel.title = "How this reference is shown";
        for (const vt of VIEW_TYPES) {
          const o = document.createElement("option");
          o.value = vt;
          o.textContent = vt;
          // The datamodel's own definition, so the author reads what a view type
          // means instead of inferring it from eleven one-word labels.
          const what = narrativeViewTypeDescription(vt);
          if (what) o.title = what;
          // Compared against the CANONICAL name: a block still holding the
          // retired `epoch3d` must show `scene3d` as its current selection, not
          // fall through and silently look like `matrix` (the first option).
          o.selected = vt === current;
          sel.appendChild(o);
        }
        sel.addEventListener("change", () =>
          editor.setViewType(ci, bi, sel.value));
        tools.appendChild(sel);
      }
      tools.appendChild(iconButton("▲", "Move up",
        () => editor.moveBlock(ci, bi, -1)));
      tools.appendChild(iconButton("▼", "Move down",
        () => editor.moveBlock(ci, bi, 1)));
      tools.appendChild(iconButton("✕", "Remove this block",
        () => editor.deleteBlock(ci, bi)));
    });

    // SURFACE-STABLE · and the "+ prose" row too: it is one per chapter, so
    // without a reserved band every chapter after the first sat 27 px lower in
    // edit mode than in read mode. Present in both, filled in one.
    const add = el("div", "nv-add-row");
    section.appendChild(add);
    if (editor) {
      // `+ prose` adds to THIS chapter (the one the button sits under — `ci` is
      // this iteration's index, not the window's current chapter), makes that
      // chapter current, and asks the next render to put the cursor in the new
      // paragraph.
      //
      // The last part is what was missing, and it is the whole of "+ prose does
      // nothing": the block WAS created (measured: 1 → 2 in the right chapter),
      // as a faint "(paragrafo vuoto — clicca per scrivere)" that could be
      // below the fold. A creation nobody can see is indistinguishable from a
      // dead button.
      add.appendChild(iconButton("+ prose", "Aggiungi un paragrafo qui",
        () => {
          currentChapter?.set(ci);          // you write where you clicked
          focusProseAfterRender = ci;
          editor.addProse(ci);
        }));
      const hint = el("span", "nv-drop-hint",
        "…or drag a node from the Nodes tab into this chapter");
      add.appendChild(hint);

      // Drag-to-embed. The drop target is the whole chapter, so the gesture is
      // "put this in that chapter" rather than a hunt for a 4-pixel line.
      section.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types.includes("application/x-em-node-id")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        section.classList.add("nv-drop-over");
      });
      section.addEventListener("dragleave", () =>
        section.classList.remove("nv-drop-over"));
      section.addEventListener("drop", (e) => {
        section.classList.remove("nv-drop-over");
        const ref = e.dataTransfer?.getData("application/x-em-node-id");
        if (!ref) return;
        e.preventDefault();
        editor.addEmbed(ci, ref);
      });
    }
    container.appendChild(section);
  });

  if (editor) {
    const foot = el("div", "nv-chapter");
    foot.appendChild(iconButton(t("nv.addChapter"), t("nv.addChapterTitle"),
      () => editor.addChapter()));
    // NARR1 · reintroduce an epoch you deleted (or never described): one chip per
    // top-level epoch without a chapter. Deleting a chapter (the ✕ above) is the
    // "togli"; these chips are the "reintroduci".
    const undescribed = editor.undescribedEpochs?.() ?? [];
    if (undescribed.length) {
      const bar = el("div", "nv-undescribed");
      bar.appendChild(el("span", "nv-tool-label", t("nv.undescribedEpochs")));
      for (const ep of undescribed)
        bar.appendChild(iconButton(`+ ${ep.name}`,
          `Add a chapter for the epoch “${ep.name}”`,
          () => editor.addEpochChapter?.(ep.id)));
      foot.appendChild(bar);
    }
    // Seam · "regenerate the full draft" via the rich s3Dgraphy site_story
    // (build_narrative) over the bridge — a follow-up when the endpoint exists.
    if (editor.regenerateViaBridge) {
      const regen = iconButton(t("nv.regenerate"),
        editor.canRegenerate?.()
          ? "Rebuild the draft from s3Dgraphy site_story via the bridge"
          : "Needs the bridge and an s3Dgraphy build_narrative endpoint (follow-up)",
        () => editor.regenerateViaBridge?.());
      if (!editor.canRegenerate?.()) (regen as HTMLButtonElement).disabled = true;
      foot.appendChild(regen);
    }
    container.appendChild(foot);
  }
  // …and if a paragraph was just added, the cursor goes there (see
  // `focusProseAfterRender`). Last, so the DOM it looks for is complete.
  focusNewProse(container);
}

/** Chapter index whose LAST prose block should take the cursor after the next
 *  render, or null. Set by `+ prose`, consumed by `focusNewProse` — the mutation
 *  re-renders the whole view, so "focus the thing I just made" cannot be done in
 *  the click handler that made it. */
let focusProseAfterRender: number | null = null;

/**
 * Put the cursor in the paragraph that was just added, and bring it into view.
 *
 * `editableProse` opens its textarea on click, so this clicks it: one behaviour
 * for "start writing here", whether a person or a button asks for it.
 */
function focusNewProse(container: HTMLElement): void {
  const ci = focusProseAfterRender;
  focusProseAfterRender = null;
  if (ci == null) return;
  const section = container.querySelectorAll(".nv-chapter")[ci];
  if (!section) return;
  const blocks = section.querySelectorAll(".nv-prose-edit");
  const last = blocks[blocks.length - 1] as HTMLElement | undefined;
  if (!last) return;
  last.scrollIntoView({ behavior: "smooth", block: "center" });
  last.classList.add("nv-just-added");
  window.setTimeout(() => last.classList.remove("nv-just-added"), 1600);
  (last as HTMLElement).click();                       // → its textarea
  const ta = last.querySelector("textarea") as HTMLTextAreaElement | null;
  ta?.focus();
}

/** A paragraph that becomes a textarea when you click it. Editing prose should
 *  not need a mode switch or a dialog — the text is the interface. */
function editableProse(text: string,
                       onCommit: (text: string) => void): HTMLElement {
  const wrap = el("div", "nv-prose-edit");
  const view = renderProse(text || "");
  if (!text.trim())
    view.appendChild(el("p", "nv-todo", t("nv.emptyParagraph")));
  wrap.appendChild(view);
  wrap.title = "Click to edit";
  wrap.addEventListener("click", () => {
    if (wrap.querySelector("textarea")) return;
    const ta = document.createElement("textarea");
    ta.className = "nv-textarea";
    ta.value = text;
    ta.rows = Math.max(3, text.split("\n").length + 1);
    wrap.textContent = "";
    wrap.appendChild(ta);
    ta.focus();
    const commit = () => {
      if (ta.value !== text) onCommit(ta.value);
      else wrap.replaceChildren(renderProse(text));
    };
    ta.addEventListener("blur", commit);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        wrap.replaceChildren(renderProse(text));
      }
    });
  });
  return wrap;
}

/** Which view types this build actually draws — used by the tests and worth
 *  stating out loud so the gap between the enum and the implementation stays
 *  visible. */
export function renderedViewTypes(): string[] {
  return [...RENDERED_VIEW_TYPES];
}
