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
import { canonicalViewType } from "./narrative-edit";
import { notebookCells, printItems, type ProjChapter } from "./narrative-projection";
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

/** COLLEGARE · the four READINGS of one story (the window header's switch). */
export type Reading = "write" | "read" | "print" | "notebook";

/** Which part of the story the Inspector is showing: a chapter (`block: null`)
 *  or one of its blocks. */
export interface NarrativeSelection {
  chapter: number;
  block: number | null;
}

/**
 * COLLEGARE · the page's hooks. «The page is the reader»: in Scrivi the story is
 * drawn exactly as a reader sees it and written INTO — the text in place, the
 * title in place — while every other tool (★, the lane, the order, the author,
 * the signature, the view type, the caption, verify) is in the Inspector, for
 * the part selected here. Absent → the page behaves as it always has (the
 * reader, and the checks that call it with an editor only).
 */
export interface PageHooks {
  reading?: Reading;
  selection?: NarrativeSelection | null;
  /** a click on a chapter's head or on a block: the Inspector shows it */
  onSelectPart?(sel: NarrativeSelection): void;
  /** the «+» between blocks, and «/» on an empty paragraph (`replace`) */
  onInsert?(chapter: number, at: number, anchor: HTMLElement, replace?: boolean): void;
  /** «[[» in a paragraph: pick a node, and the page puts the mention there */
  onMention?(anchor: HTMLElement, pick: (id: string) => void, cancel: () => void): void;
  /** «Verifica», from the print preview's hole */
  onVerify?(chapter: number, block: number): void;
  /** a FILE dropped on a chapter (the node drop is the editor's `addEmbed`) */
  onFileDrop?(chapter: number, file: File, clientX: number, clientY: number): void;
}

/** A mention in the page: the node's NAME, clickable, never editable as text. */
function mentionChip(ref: string, index: Map<string, EmNode>, editable: boolean,
                     onReveal?: (id: string) => void): HTMLElement {
  const node = index.get(ref);
  const chip = el("span", "nv-mention" + (node ? "" : " nv-mention-miss"),
    node ? String(node.name || node.id) : `${ref} ?`);
  chip.dataset.ref = ref;
  chip.title = node ? `${node.node_type} · ${node.description ?? ""}` : t("nv.mentionMissing", { id: ref });
  if (editable) chip.setAttribute("contenteditable", "false");
  if (node && onReveal)
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      onReveal(ref);
    });
  return chip;
}

/** The prose, as the reader sees it: paragraphs, **bold**, *italic*, and each
 *  `[[id]]` as the node's name. Shared by Leggi and Scrivi (where the same DOM
 *  is made editable), so writing happens on the page the reader gets. */
function renderProseWithMentions(text: string, index: Map<string, EmNode>,
                                 editable: boolean, onReveal?: (id: string) => void): HTMLElement {
  const wrap = renderProse(text);
  const MENTION = /\[\[\s*([^[\]\n]+?)\s*\]\]/g;
  const walk = (n: Node): void => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 3) {
        const s = c.textContent ?? "";
        if (!MENTION.test(s)) continue;
        MENTION.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0;
        for (const m of s.matchAll(MENTION)) {
          if (m.index! > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
          frag.appendChild(mentionChip(m[1], index, editable, onReveal));
          last = m.index! + m[0].length;
        }
        if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
        c.parentNode?.replaceChild(frag, c);
      } else walk(c);
    }
  };
  walk(wrap);
  return wrap;
}

/**
 * The text of an edited paragraph, back to the stored form: a paragraph per
 * block element, `<br>` a line break, a mention chip `[[id]]`, the emphasis
 * the renderer drew (`strong`/`em`/`code`) back to its markdown.
 */
export function serializeProse(el: HTMLElement): string {
  const inline = (n: Node): string => {
    if (n.nodeType === 3) return n.textContent ?? "";
    const e = n as HTMLElement;
    if (e.dataset?.ref) return `[[${e.dataset.ref}]]`;
    const tag = e.tagName?.toLowerCase();
    if (tag === "br") return "\n";
    const inner = [...e.childNodes].map(inline).join("");
    if (tag === "strong" || tag === "b") return `**${inner}**`;
    if (tag === "em" || tag === "i") return `*${inner}*`;
    if (tag === "code") return `\`${inner}\``;
    return inner;
  };
  const paras: string[] = [];
  let loose = "";
  for (const c of [...el.childNodes]) {
    const tag = (c as HTMLElement).tagName?.toLowerCase();
    if (tag === "p" || tag === "div") {
      if (loose.trim()) paras.push(loose);
      loose = "";
      paras.push(inline(c));
    } else loose += inline(c);
  }
  if (loose.trim()) paras.push(loose);
  return paras.map((p) => p.replace(/ /g, " ").trim()).filter(Boolean).join("\n\n");
}

/** Where a mention being picked will go: a private-use character in the text,
 *  so the place survives the page being redrawn while the menu is open. */
export const MENTION_SLOT = "\ue010";

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
  page: PageHooks = {},
): void {
  container.textContent = "";
  const narratives = narrativesIn(doc);
  const reading: Reading = page.reading ?? (editor ? "write" : "read");
  // writing needs an editor; without one, «Scrivi» is the reading
  const writing = reading === "write" && !!editor;
  container.dataset.reading = writing ? "write" : reading === "write" ? "read" : reading;

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
  const index = new Map((doc?.graph?.nodes ?? []).map((n) => [n.id, n]));

  // ── STAMPA · NOTEBOOK — the page as the exporters will write it ──────────
  if (reading === "print") {
    renderPrintPreview(container, current, index, page);
    return;
  }
  if (reading === "notebook") {
    renderNotebookPreview(container, current, index);
    return;
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
  // COLLEGARE · names only, in both readings: who signs is the IDENTITY of the
  // header («Firmo io» in the chapter's Inspector), not a select on the page.
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
    byline.appendChild(chip);
  }
  head.appendChild(byline);
  if (assisted.length) {
    const help = el("div", "nv-authors nv-assist");
    help.appendChild(el("span", "nv-authors-label", t("nv.assistedBy")));
    for (const a of assisted) {
      const chip = authorChip(a, true);
      chip.title = t("nv.assistingModelTitle");
      help.appendChild(chip);
    }
    head.appendChild(help);
  }
  container.appendChild(head);

  const sel = page.selection ?? null;
  const pick = (s: NarrativeSelection): void => page.onSelectPart?.(s);
  /** the insertion gutter: zero height, so writing never re-paginates */
  const gutter = (ci: number, at: number, last = false): HTMLElement => {
    const g = el("div", "nv-ins" + (last ? " nv-ins-end" : ""));
    const b = el("button", "nv-ins-btn", "+") as HTMLButtonElement;
    b.type = "button";
    b.title = t("nv.insertHere");
    b.setAttribute("aria-label", t("nv.insertHere"));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      page.onInsert?.(ci, at, b);
    });
    g.appendChild(b);
    return g;
  };

  current.chapters.forEach((chapter, ci) => {
    const section = el("section", "nv-chapter");
    section.dataset.chapter = String(ci);
    if (currentChapter?.index() === ci) section.classList.add("nv-current");
    if (currentChapter)
      section.addEventListener("mousedown", () => currentChapter.set(ci));

    const h = el("div", "nv-chapter-head");
    const title = el("h2", "nv-chapter-title", chapter.title || "(untitled)");
    h.appendChild(title);
    if (chapter.canonical) {
      const badge = el("span", "nv-badge", "★");
      badge.title = t("nidx.canonical");
      h.appendChild(badge);
    }
    if (chapter.anchor) {
      // The chapter usually takes its title FROM the lane, so echoing the lane's
      // name beside it just says the same word twice. Show the id in that case:
      // it is the part the reader cannot already see.
      const anchorNode = index.get(chapter.anchor);
      const laneName = anchorNode ? String(anchorNode.name || "") : "";
      const label = laneName && laneName !== chapter.title ? laneName : chapter.anchor;
      const chip = el("span", "nv-anchor", label);
      chip.title = laneName
        ? `This chapter narrates the lane “${laneName}” (${chapter.anchor})`
        : `This chapter narrates the lane “${chapter.anchor}”, which is not in this graph`;
      if (!anchorNode) chip.classList.add("nv-anchor-missing");
      h.appendChild(chip);
    }
    if (chapter.authored_by) {
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
    if (writing) {
      h.classList.add("nv-selectable");
      if (sel && sel.chapter === ci && sel.block == null) h.classList.add("nv-sel");
      h.addEventListener("click", () => pick({ chapter: ci, block: null }));
      title.setAttribute("contenteditable", "true");
      title.spellcheck = false;
      title.classList.add("nv-editable");
      title.addEventListener("blur", () => {
        const next = (title.textContent || "").trim();
        if (next && next !== chapter.title) editor!.renameChapter(ci, next);
      });
      title.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          title.blur();
        }
      });
    }
    section.appendChild(h);

    const blocks = chapter.blocks ?? [];
    blocks.forEach((block, bi) => {
      if (writing && page.onInsert) section.appendChild(gutter(ci, bi));
      let body: HTMLElement;
      if (block.block_type === "prose") {
        body = writing
          ? editableInPlace(block.text ?? "", index, ci, bi, editor!, page)
          : renderProseWithMentions(block.text ?? "", index, false, onReveal);
      } else {
        body = renderEmbed(block, index, doc,
          `${current.id}:${ci}:${bi}:${block.ref ?? ""}`,
          // writing: a click on an embed SELECTS it (the Inspector has «vai al
          // nodo»); reading: it goes to the node, as it always has
          writing ? undefined : onReveal, viewer);
      }
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
      // Provenance rides with the paragraph in BOTH readings: knowing a machine
      // wrote this is not an authoring convenience, it is what the reader needs.
      // Its buttons (Valida, Ritira) are in the Inspector now.
      const strip = block.block_type === "prose"
        ? provenanceStrip(block, index, onReveal) : null;
      if (strip) {
        const wrap = el("div", `nv-prose-wrap nv-${blockStatus(block)}`);
        wrap.appendChild(body);
        wrap.appendChild(strip);
        body = wrap;
      }
      const row = el("div", "nv-block-row");
      row.dataset.block = `${ci}:${bi}`;
      body.classList.add("nv-block-body");
      row.appendChild(body);
      if (writing) {
        row.classList.add("nv-selectable");
        if (sel && sel.chapter === ci && sel.block === bi) row.classList.add("nv-sel");
        row.addEventListener("click", () => pick({ chapter: ci, block: bi }));
      }
      section.appendChild(row);
    });
    if (writing && page.onInsert) section.appendChild(gutter(ci, blocks.length, true));

    if (editor) {
      // Drag-to-embed. The drop target is the whole chapter, so the gesture is
      // "put this in that chapter" rather than a hunt for a 4-pixel line. A
      // FILE (fase 4) goes to the page's hook: a document first, then the block.
      section.addEventListener("dragover", (e) => {
        const types = e.dataTransfer?.types ?? [];
        const file = types.includes("Files") && !!page.onFileDrop;
        if (!types.includes(NODE_MIME) && !file) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        section.classList.add("nv-drop-over");
      });
      section.addEventListener("dragleave", () =>
        section.classList.remove("nv-drop-over"));
      section.addEventListener("drop", (e) => {
        section.classList.remove("nv-drop-over");
        const ref = e.dataTransfer?.getData(NODE_MIME);
        if (ref) {
          e.preventDefault();
          editor.addEmbed(ci, ref);
          return;
        }
        const f = e.dataTransfer?.files?.[0];
        if (f && page.onFileDrop) {
          e.preventDefault();
          page.onFileDrop(ci, f, (e as DragEvent).clientX, (e as DragEvent).clientY);
        }
      });
    }
    container.appendChild(section);
  });
}

/**
 * A paragraph written IN the page: the reader's DOM, `contentEditable`.
 *
 * Committed on blur (one edit = one undo step, like every mutator). The keys
 * that belong to the desk (Shift+A, `/` for search, Delete) stop here: typing a
 * capital A must not open the Add menu. Two keys are the page's own:
 *   · `/` in an EMPTY paragraph opens the Blocks menu, which replaces it;
 *   · `[[` opens the link menu, and the pick becomes a mention chip.
 */
function editableInPlace(text: string, index: Map<string, EmNode>, ci: number, bi: number,
                         editor: NarrativeEditor, page: PageHooks): HTMLElement {
  const box = renderProseWithMentions(text, index, true);
  box.classList.add("nv-editable", "nv-prose-edit");
  box.setAttribute("contenteditable", "true");
  box.spellcheck = true;
  box.dataset.block = `${ci}:${bi}`;
  if (!text.trim()) {
    box.classList.add("nv-empty-prose");
    box.dataset.placeholder = t("nv.emptyParagraph");
  }
  let settled = text;
  box.addEventListener("blur", () => {
    const next = serializeProse(box);
    if (next !== settled) {
      settled = next;
      editor.setProse(ci, bi, next);
    }
  });
  // …a picked mention lands in the TEXT, at the slot, not in a DOM range: the
  // blur that the menu causes commits and redraws the page before the pick
  const land = (withSlot: string, id: string | null): void => {
    const next = withSlot.replace(MENTION_SLOT, id ? `[[${id}]] ` : "").replace(/ {2,}/g, " ");
    editor.setProse(ci, bi, next.trim());
  };
  box.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      box.blur();
      return;
    }
    if (e.key === "/" && !serializeProse(box).trim() && page.onInsert) {
      e.preventDefault();
      page.onInsert(ci, bi, box, true);
      return;
    }
    if (e.key === "[" && page.onMention) {
      const s = window.getSelection?.();
      const r = s && s.rangeCount ? s.getRangeAt(0) : null;
      const node = r?.startContainer;
      const before = node && node.nodeType === 3 && r ? (node.textContent ?? "").slice(Math.max(0, r.startOffset - 1), r.startOffset) : "";
      if (before !== "[" || !r) return;
      e.preventDefault();
      r.setStart(node!, r.startOffset - 1);
      r.deleteContents();
      r.insertNode(document.createTextNode(MENTION_SLOT));
      const withSlot = serializeProse(box);
      settled = withSlot; // the blur the menu causes must not commit the slot
      page.onMention(box, (id) => land(withSlot, id), () => land(withSlot, null));
    }
  });
  return box;
}

// ── STAMPA · the page as DOCX and LaTeX will print it ──────────────────────
function renderPrintPreview(container: HTMLElement, nr: Narrative, index: Map<string, EmNode>,
                            page: PageHooks): void {
  const sheet = el("div", "nv-print");
  sheet.appendChild(el("h1", "nv-title", nr.name));
  if (nr.description) sheet.appendChild(el("p", "nv-lede", nr.description));
  const { items, bibliography } = printItems(nr.chapters as ProjChapter[], index);
  let n = 0;
  for (const it of items) {
    if (it.kind === "chapter") {
      sheet.appendChild(el("h2", "nv-chapter-title", `${++n}. ${it.title}`));
    } else if (it.kind === "prose") {
      const p = el("p", "nv-print-prose");
      for (const sgm of it.segments)
        p.appendChild("text" in sgm ? document.createTextNode(sgm.text) : el("em", undefined, sgm.mention));
      sheet.appendChild(p);
    } else if (it.kind === "withheld") {
      // WHAT A PERSON HAS NOT VALIDATED IS NOT PRINTED (E.D., 29 set 2026): the
      // hole is shown, with the gesture that fills it
      const hole = el("div", "nv-withheld");
      hole.appendChild(el("span", undefined, t("nv.withheld")));
      if (page.onVerify) {
        const b = el("button", "nv-mini", t("nv.verify")) as HTMLButtonElement;
        b.addEventListener("click", () => page.onVerify!(it.chapter, it.block));
        hole.appendChild(b);
      }
      sheet.appendChild(hole);
    } else if (it.kind === "citation") {
      const p = el("p", "nv-print-cite");
      p.appendChild(el("span", undefined, `${it.name} `));
      p.appendChild(el("b", undefined, `[${it.key}]`));
      sheet.appendChild(p);
    } else if (it.kind === "figure") {
      const f = el("figure", "nv-print-fig");
      f.appendChild(el("div", "nv-print-ph", it.baked ? t("nv.bakedAtExport") : it.viewType));
      const cap = el("figcaption");
      cap.appendChild(el("b", undefined, `${t("nv.figure")} ${it.number}`));
      cap.appendChild(document.createTextNode(` — ${it.name}${it.caption ? ` — ${it.caption}` : ""}`));
      f.appendChild(cap);
      sheet.appendChild(f);
    } else {
      sheet.appendChild(el("p", "nv-print-miss", t("nv.unresolvedRef", { id: it.ref })));
    }
  }
  if (bibliography.length) {
    sheet.appendChild(el("h2", "nv-chapter-title", t("nv.references")));
    const ol = el("ol", "nv-print-bib");
    for (const b of bibliography) ol.appendChild(el("li", undefined, `${b.name}${b.description ? ` — ${b.description}` : ""}`));
    sheet.appendChild(ol);
    sheet.appendChild(el("p", "nv-print-note", t("nv.bibNote")));
  }
  container.appendChild(sheet);
}

// ── NOTEBOOK · the page as Jupyter will write it ───────────────────────────
function renderNotebookPreview(container: HTMLElement, nr: Narrative, index: Map<string, EmNode>): void {
  const nb = el("div", "nv-nb");
  let i = 1;
  for (const c of notebookCells(nr.name, nr.chapters as ProjChapter[], index)) {
    const cell = el("div", `nv-nb-cell nv-nb-${c.cell_type}`);
    if (c.cell_type === "code") {
      cell.appendChild(el("span", "nv-nb-n", `[${i++}]`));
      cell.appendChild(el("pre", undefined, c.source));
    } else {
      const src = c.source;
      if (src.startsWith("## ")) cell.appendChild(el("h2", "nv-chapter-title", src.slice(3)));
      else if (src.startsWith("# ")) cell.appendChild(el("h1", "nv-title", src.slice(2)));
      else cell.appendChild(el("p", undefined, src.replace(/^> ?/gm, "")));
      if (src.startsWith(">")) cell.classList.add("nv-nb-quote");
    }
    nb.appendChild(cell);
  }
  container.appendChild(nb);
}

/** Which view types this build actually draws — used by the tests and worth
 *  stating out loud so the gap between the enum and the implementation stays
 *  visible. */
export function renderedViewTypes(): string[] {
  return [...RENDERED_VIEW_TYPES];
}
