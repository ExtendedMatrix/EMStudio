/**
 * N10 — what a resource LOOKS like, in the Shelf.
 *
 * A list of stable ids and filenames is a correct inventory and a poor shelf: a
 * shelf is something you recognise by looking at it. So every row gets a
 * preview, by type — a thumbnail for an image, ATON for a 3D model, a typed mark
 * for everything else — and the row keeps the badges it already had.
 *
 * Three rules shape this module.
 *
 * **Ids, never paths.** The preview is fetched by the resource's stable id
 * through `POST /resource-preview`; the bridge resolves it exactly the way the
 * rest of the resource layer does (the folder manifest, or the graph's resolver)
 * and answers with bytes or a URL. No filesystem path ever reaches the page —
 * which is the whole reason the resource layer exists, and not a detail to relax
 * for a thumbnail.
 *
 * **Nothing loads before it is looked at.** A DosCo with three hundred photos
 * must not fetch three hundred images because a modal opened: each thumbnail
 * waits for `onFirstVisible`, and the 3D waits for a click on top of that.
 *
 * **A resource that does not resolve is a placeholder, not an error.** The Shelf
 * is a working surface: a missing file must read as "not here", quietly, in its
 * own row, and leave the other three hundred alone.
 */

import { t } from "./i18n";
import { create3dEmbed, isRef3D } from "./embed3d";
import { thumbnailUrl } from "./iiif";
import { iiifBase } from "./settings";
import type { EmNode } from "./types";
import type { Ref3D } from "./embed3d";
import { dtcGlyphUrl, iconUrlFor } from "./icons";
import { onFirstVisible } from "./lazy";
import { is3dResourceType, resourceTypeOfLocator } from "./rules";
import { atonPreviewUrl } from "./settings";

/** What the bridge answers. Every field is optional: the shape says which of the
 *  cases happened, and the UI has a branch for each. */
export interface PreviewAnswer {
  ok?: boolean;
  resource_id?: string;
  /** EM resource type, when the answer came from the folder manifest (which
   *  s3Dgraphy computed with the datamodel's own table). */
  resource_type?: string;
  filename?: string;
  media_type?: string;
  bytes?: number;
  /** inline image bytes */
  data_url?: string;
  /** already reachable by the browser (http, or a presigned s3 URL) */
  url?: string;
  /** in the object store but no signature available */
  needs_presign?: boolean;
  /** resolvable, but not an image — draw its type */
  no_inline?: boolean;
  /** an image, but past the byte cap */
  too_large?: boolean;
  /** the id resolves to nothing we can read */
  unresolved?: boolean;
  /** C3 · the file is there and its bytes are zeros (an incomplete copy) */
  zeroed?: boolean;
  hint?: string;
  error?: string;
}

export interface PreviewRequest {
  resourceId: string;
  /** the scanned library / DosCo folder, when the row came from a Shelf scan */
  folder?: string;
  /** the current em.json, when the row is a graph resource */
  doc?: unknown;
}

/** Ask the bridge for one resource's preview. Never throws: a bridge that is
 *  down is a placeholder, like any other unresolved resource. */
export async function fetchPreview(
  bridge: string,
  req: PreviewRequest,
): Promise<PreviewAnswer> {
  try {
    const res = await fetch(`${bridge}/resource-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource_id: req.resourceId,
        folder: req.folder,
        doc: req.doc,
      }),
    });
    if (!res.ok) {
      let msg = `bridge ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = String(j.error);
      } catch {
        /* non-JSON body */
      }
      return { unresolved: true, error: msg };
    }
    return (await res.json()) as PreviewAnswer;
  } catch {
    return { unresolved: true, error: t("bridge.unreachable") };
  }
}

/** A DTC glyph per EM resource type — reusing the icon set the app already
 *  bundles rather than inventing a second one. Types with no glyph fall back to
 *  a text mark, which is honest and costs nothing. */
const GLYPH_FOR: Record<string, string> = {
  image: "09_photos",
  "3d_model": "03_mesh",
  proxy_model: "03_mesh",
  point_cloud: "02_pointcloud",
};

function humanBytes(n: number | undefined): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The EM resource type for a row, from whatever we know: the bridge's answer
 *  (manifest), else the node's declared `resource_type`, else the extension via
 *  the datamodel. Never a hardcoded list. */
export function resourceTypeFor(a: PreviewAnswer, declared?: string,
                                locator?: string): string {
  if (a.resource_type) return a.resource_type;
  if (declared) return declared;
  const fromName = resourceTypeOfLocator(a.filename || locator || "");
  return fromName;
}

function typedMark(resourceType: string, label: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "rp-typed";
  const glyph = dtcGlyphUrl(GLYPH_FOR[resourceType] ?? null)
    ?? (resourceType === "document" ? iconUrlFor("document") : null);
  if (glyph) {
    const img = new Image();
    img.className = "rp-glyph";
    img.src = glyph;
    img.alt = "";
    wrap.appendChild(img);
  } else {
    const t = document.createElement("span");
    t.className = "rp-typemark";
    t.textContent = (resourceType === "unknown" ? "?" : resourceType.slice(0, 3))
      .toUpperCase();
    wrap.appendChild(t);
  }
  const cap = document.createElement("span");
  cap.className = "rp-typed-label";
  cap.textContent = label;
  wrap.appendChild(cap);
  return wrap;
}

export interface ThumbOptions extends PreviewRequest {
  /** The graph node behind this row, when there is one. Read for exactly one
   *  thing: its checksum, which IS its IIIF identifier. */
  node?: EmNode | null;
  /** bridge base URL — resolved by the caller (it owns `bridgeUrl()`) */
  bridge: () => Promise<string>;
  /** `data.resource_type` off the node, when the row has one */
  declaredType?: string;
  /** the node's locator, for classifying by extension as a last resort */
  locator?: string;
  /** row label, used in the alt text and the typed caption */
  label?: string;
}

/**
 * The preview element for one resource row.
 *
 * Returned immediately as a placeholder box; it fills itself in when it is first
 * scrolled into view. The caller does not await anything and the list stays
 * responsive with any number of rows.
 */
export function createResourceThumb(opts: ThumbOptions): HTMLElement {
  const box = document.createElement("div");
  box.className = "rp-thumb rp-loading";
  box.title = opts.label ?? "";

  onFirstVisible(box, () => {
    // IIIF · a PUBLISHED image needs neither the bridge nor a download: its
    // thumbnail is a size request to the image server, and the identifier is
    // the asset's own checksum. This is the cheap half of the image layer — a
    // shelf of three hundred photographs stops fetching three hundred
    // photographs — and it costs one branch.
    //
    // No service, no checksum, not an image: fall through to exactly what this
    // row did before. A missing image service must read as "as before", never
    // as a broken frame.
    const iiif = thumbnailUrl(opts.node ?? null, iiifBase(), 240);
    if (iiif) {
      box.classList.remove("rp-loading");
      // `resource_type: "image"` is not a guess: the URL exists only because the
      // node passed `isImageResource`. Without it `fill` would classify the row
      // by the locator's extension — and an asset URL ends in a digest, so it
      // would draw a typed mark next to a perfectly good picture.
      fill(box, { url: iiif, media_type: "image/jpeg", resource_type: "image",
                  filename: opts.label ?? undefined }, opts);
      return;
    }
    void (async () => {
      // A resource that is ALREADY a web URL needs no bridge: the browser can
      // fetch it itself, and asking the bridge would mean posting the whole
      // em.json per row to be told what we can read off the locator.
      const direct = /^https?:\/\//i.test(opts.locator ?? "");
      const answer = direct
        ? {
            url: opts.locator,
            filename: (opts.locator ?? "").split(/[?#]/)[0]
              .split("/").filter(Boolean).pop(),
          }
        : await fetchPreview(await opts.bridge(), opts);
      box.classList.remove("rp-loading");
      fill(box, answer, opts);
    })();
  });
  return box;
}

function fill(box: HTMLElement, a: PreviewAnswer, opts: ThumbOptions): void {
  const type = resourceTypeFor(a, opts.declaredType, opts.locator);
  const label = opts.label ?? a.filename ?? "";
  box.textContent = "";

  // ── 3D: ATON, on demand ────────────────────────────────────────────────────
  // A 3D preview is a whole viewer, so in a LIST it stays a chip until asked
  // for: a row that opened a 220-pixel WebGL stage by itself would turn a
  // hundred-file Shelf into a hundred viewers. And it needs the model reachable
  // by URL, which a local file is not — that limit is stated in the row rather
  // than hidden behind an empty frame.
  if (is3dResourceType(type) && !a.unresolved) {
    const url = a.url ? atonPreviewUrl(a.url) : null;
    if (url) {
      const ref: Ref3D = {
        url, via: "aton-preview", label: a.filename ?? label,
      };
      const chip = typedMark(type, "3D");
      const open = document.createElement("button");
      open.type = "button";
      open.className = "rp-open3d";
      // Two characters, because the chip is 52 px wide: the sentence goes in the
      // tooltip, where there is room for it.
      open.textContent = "▶";
      open.title = t("rp.open3dTitle", { name: ref.label });
      open.setAttribute("aria-label", t("rp.open3dLabel", { name: ref.label }));
      open.addEventListener("click", (e) => {
        e.stopPropagation();
        box.textContent = "";
        box.classList.add("rp-3d");
        box.appendChild(create3dEmbed(ref, {
          key: `shelf:${opts.resourceId}`,
          height: 220,
          immediate: true,
        }));
      });
      chip.appendChild(open);
      box.appendChild(chip);
      if (isRef3D(ref)) box.title = ref.label;
      return;
    }
    box.appendChild(typedMark(type,
      a.needs_presign ? "3D · MinIO" : t("rp.localThreeD")));
    box.title = a.needs_presign ? t("rp.cannotSign") : t("rp.notAddressable");
    return;
  }

  if (a.zeroed) {
    box.classList.add("rp-missing");
    box.appendChild(typedMark(type, t("rp.zeroed")));
    box.title = `${label} — ${t("rp.zeroedHint")}`;
    return;
  }

  // ── image: inline bytes, or a URL the browser can fetch itself ─────────────
  const src = a.data_url ?? (type === "image" ? a.url : undefined);
  if (src) {
    const img = new Image();
    img.className = "rp-img";
    img.alt = label;
    img.decoding = "async";
    // Deliberately NOT loading="lazy": `onFirstVisible` is already the gate, and
    // this element only exists because the row is on screen. Worse, the browser's
    // own lazy heuristic needs a painted viewport — on a page that is not being
    // painted (background tab, print, headless screenshot) a lazy image can stay
    // `complete: false` forever, which is how two of these thumbnails first
    // failed to appear.
    // Some formats in the datamodel's `image` list are not browser formats
    // (TIFF, most notably): we try, and a decode failure becomes the typed mark
    // instead of a broken-image icon.
    img.addEventListener("error", () => {
      box.textContent = "";
      box.appendChild(typedMark(type,
        a.media_type?.split("/")[1] ?? t("rp.image")));
      box.title = t("rp.undecodable",
                    { label, type: a.media_type ?? "?" });
    });
    img.src = src;
    box.appendChild(img);
    if (a.bytes) box.title = `${label} · ${humanBytes(a.bytes)}`;
    return;
  }

  // ── everything else: say what it is ───────────────────────────────────────
  if (a.too_large) {
    box.appendChild(typedMark(type, humanBytes(a.bytes)));
    box.title = t("rp.tooLarge", { label, size: humanBytes(a.bytes) });
    return;
  }
  if (a.unresolved) {
    box.classList.add("rp-missing");
    box.appendChild(typedMark(type, t("rp.absent")));
    box.title = a.hint ?? a.error ?? t("rp.unresolved");
    return;
  }
  box.appendChild(typedMark(type, a.media_type?.split("/")[1] ?? type));
  if (a.bytes) box.title = `${label} · ${humanBytes(a.bytes)}`;
}
