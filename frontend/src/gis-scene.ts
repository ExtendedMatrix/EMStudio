/**
 * MICRO-GIS-BASE (6 Nov 2026) · the GIS layers of the graph in the Space.
 *
 * What the graph says is what is drawn: every `gis_layer` resource (a
 * shapefile, a GeoPackage's layer, a GeoJSON — a GeoTIFF is a raster, drawn as
 * the ground) and every `landscape_surface` node (its DEM as a mesh, its image
 * draped on it). Nothing of it lives in the preferences but what a person
 * hides; a layer enters the graph through the bridge (`/graph/gis-ingest`,
 * s3Dgraphy's readers, no GDAL) as a delta, one undo step.
 *
 *   · the FRAME: the features come back from the bridge in the scene's CRS —
 *     reprojected by PROJ, or the same numbers when the two codes name one
 *     grid (31700 ↔ 3844) — and go into three's axes the way a raster on a
 *     plane does (`globe3d.ts`): minus the GeoPositionNode's shift, turned by
 *     its rotation, x east, y up, z south. Shift Z = 0 by convention: the
 *     heights are the true ones (a vertex without one lies on the ground —
 *     the surface under it when there is one, else the foot of the models);
 *   · the LABELS: the `feature_key` of the layer, one per feature, a DOM label
 *     over the scene (at most `MAX_LABELS`, the nearest to the camera first);
 *   · the GROUND: `/gis/surface` gives a grid of heights in the scene's CRS
 *     and the image's texture coordinates; the image is the bridge's preview
 *     of the GeoTIFF as it is — the reprojection is in the coordinates, never
 *     in a resampled picture;
 *   · the CONTOURS: «Curve di livello» on a DEM layer asks the bridge
 *     (`/graph/gis-contours`): a GeoJSON beside the DEM, a derived layer with
 *     its DTC step (vectorization) and its stamp, drawn like any other layer.
 */
import { dirname, join, normalize } from "./paths";
import type { GeoCtx, GeoDriver } from "./scene3d";

type V3 = [number, number, number];
type Doc = { graph?: { nodes?: Array<Record<string, any>>; edges?: Array<Record<string, any>>; graph_id?: string } } | null;

export const MAX_LABELS = 200;
const PALETTE = [0xff6600, 0x1f9bd1, 0xd13f9b, 0x2fa84f, 0xe0b000, 0x7a5cd6, 0x00a6a6];

export interface GisLayerRef {
  id: string;
  name: string;
  format: string;
  crs: string | null;
  url: string;
  featureKey: string | null;
  zField: string | null;
  layer: string | null;
  raster: string | null;
  derived: boolean;
}
export interface SurfaceRef { id: string; name: string; dem: string | null; image: string | null; step: number | null }
export interface SceneFrame { epsg: number; x: number; y: number; z: number; rotation: number }

const dataOf = (n: Record<string, any> | undefined): Record<string, any> => (n && typeof n.data === "object" && n.data ? n.data : {});

/** The GIS layers of the graph, in the graph's order. */
export function gisLayersOf(doc: Doc): GisLayerRef[] {
  const nodes = doc?.graph?.nodes ?? [];
  const edges = doc?.graph?.edges ?? [];
  const derived = new Set(edges.filter((e) => e.edge_type === "dtc_derived_from").map((e) => String(e.source)));
  return nodes.filter((n) => n.node_type === "resource" && dataOf(n).url_type === "gis_layer").map((n) => {
    const d = dataOf(n);
    let url = String(d.url ?? "");
    if (!url) {
      // a shapefile: its entry point among its files
      for (const e of edges) {
        if (e.edge_type !== "has_file" || e.source !== n.id) continue;
        const f = nodes.find((x) => x.id === e.target);
        const fd = dataOf(f);
        const u = String(fd.url ?? fd.path ?? "");
        if (fd.role === "entry_point" || /\.shp$/i.test(u)) { url = u; if (/\.shp$/i.test(u)) break; }
      }
    }
    return { id: String(n.id), name: String(n.name ?? n.id), format: String(d.gis_format ?? ""), crs: d.crs ? String(d.crs) : null,
      url, featureKey: d.feature_key ? String(d.feature_key) : null, zField: d.z_field ? String(d.z_field) : null,
      layer: d.layer ? String(d.layer) : null, raster: d.raster?.kind ? String(d.raster.kind) : null, derived: derived.has(String(n.id)) };
  });
}

/** The grounds of the landscape (LandscapeSurfaceNode): their DEM and image layers. */
export function surfacesOf(doc: Doc): SurfaceRef[] {
  const nodes = doc?.graph?.nodes ?? [];
  const edges = doc?.graph?.edges ?? [];
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  return nodes.filter((n) => n.node_type === "landscape_surface").map((n) => {
    let dem: string | null = null;
    let image: string | null = null;
    for (const e of edges) {
      if (e.edge_type !== "has_linked_resource" || e.source !== n.id) continue;
      const kind = dataOf(byId.get(String(e.target))).raster?.kind;
      if (kind === "dem" && !dem) dem = String(e.target);
      else if (kind === "image" && !image) image = String(e.target);
    }
    const st = Number(dataOf(n).step_m);
    return { id: String(n.id), name: String(n.name ?? n.id), dem, image, step: Number.isFinite(st) && st > 0 ? st : null };
  });
}

/** The scene's frame: the GeoPositionNode's EPSG, shift and rotation; null without one. */
export function frameOf(doc: Doc): SceneFrame | null {
  const gp = (doc?.graph?.nodes ?? []).find((n) => n.node_type === "geo_position");
  const d = dataOf(gp);
  const epsg = Number(d.epsg);
  if (!gp || !epsg) return null;
  return { epsg, x: Number(d.shift_x) || 0, y: Number(d.shift_y) || 0, z: Number(d.shift_z) || 0, rotation: Number(d.rotation) || 0 };
}

/** A point of the scene's CRS in three's axes (as a raster on a plane: minus the shift, turned, z = −north). */
export function toThree(f: SceneFrame, X: number, Y: number, Z: number): V3 {
  const th = (f.rotation * Math.PI) / 180;
  const dx = X - f.x, dy = Y - f.y;
  const x = dx * Math.cos(th) - dy * Math.sin(th);
  const y = dx * Math.sin(th) + dy * Math.cos(th);
  return [x, Z - f.z, -y];
}

/** The file of a layer on this disk: its url against the em.json's folder. */
export function fileOf(url: string, docPath: string | null): string {
  if (!url) return "";
  if (/^([a-zA-Z]:[\\/]|\/|~)/.test(url) || !docPath) return url;
  return normalize(join(dirname(docPath), url));
}

/** Features (in the scene's CRS) → the segments, points and labels to draw; `ground(X, Y)` for a vertex without a height. */
export function geometryOf(f: SceneFrame, feats: Array<{ type: string; label: string | null; coords: any }>,
                           ground: (X: number, Y: number) => number): { points: number[]; segments: number[]; labels: Array<{ at: V3; text: string }> } {
  const points: number[] = [];
  const segments: number[] = [];
  const labels: Array<{ at: V3; text: string }> = [];
  const v = (p: Array<number | null>): V3 => toThree(f, p[0] as number, p[1] as number, typeof p[2] === "number" ? p[2] : ground(p[0] as number, p[1] as number));
  for (const ft of feats) {
    const c = ft.coords;
    if (!c) continue;
    if (typeof c[0] === "number") {
      const p = v(c);
      points.push(...p);
      if (ft.label) labels.push({ at: p, text: ft.label });
      continue;
    }
    let first: V3 | null = null;
    for (const part of c as Array<Array<Array<number | null>>>) {
      if (ft.type === "MultiPoint") { for (const q of part) { const p = v(q); points.push(...p); first ??= p; } continue; }
      const pts = part.map(v);
      first ??= pts[0] ?? null;
      for (let i = 0; i + 1 < pts.length; i++) segments.push(...pts[i], ...pts[i + 1]);
    }
    if (ft.label && first) labels.push({ at: first, text: ft.label });
  }
  return { points, segments, labels };
}

export interface GisDriverOptions {
  bridge: string;
  frame: SceneFrame;
  docPath: string | null;
  /** a line in the Log */
  log?: (s: string) => void;
}

export interface GisDriver extends GeoDriver {
  /** what to draw: the layers shown and the surfaces shown */
  set(layers: GisLayerRef[], surfaces: SurfaceRef[], all: GisLayerRef[]): void;
  /** MICRO-RIFINITURE p.6 · a layer's (or a surface's) opacity, 0–1, from the data panel */
  setOpacity(id: string, v: number): void;
  /** the probes' seam */
  state(): Record<string, unknown>;
}

export function createGisDriver(o: GisDriverOptions): GisDriver {
  let ctx: GeoCtx | null = null;
  let group: any = null;
  let labelsEl: HTMLDivElement | null = null;
  const drawn = new Map<string, { obj: any; labels: Array<{ at: V3; text: string; el: HTMLElement }>; sig: string; info: Record<string, unknown> }>();
  const grids = new Map<string, { x0: number; y0: number; step: number; nx: number; ny: number; heights: Array<number | null> }>();
  let want: { layers: GisLayerRef[]; surfaces: SurfaceRef[]; all: GisLayerRef[] } = { layers: [], surfaces: [], all: [] };
  let frames = 0;
  const opacities = new Map<string, number>();
  const applyOpacity = (id: string) => {
    const d = drawn.get(id);
    const v = opacities.get(id);
    if (!d?.obj || v === undefined) return;
    d.obj.traverse((x: any) => {
      const m = x.material;
      if (!m) return;
      if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity ?? 1;
      m.transparent = true;
      m.opacity = m.userData.baseOpacity * v;
      m.needsUpdate = true;
    });
    for (const l of d.labels) l.el.style.opacity = String(v);
  };
  const sceneCrs = `EPSG:${o.frame.epsg}`;
  const post = async (route: string, body: Record<string, unknown>) => {
    const r = await fetch(`${o.bridge}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ...j, status: r.status };
  };

  /** the ground under a point of the scene's CRS: a surface drawn, else the foot of the models, else 0 */
  const ground = (X: number, Y: number): number => {
    for (const g of grids.values()) {
      const i = (X - g.x0) / g.step, j = (g.y0 - Y) / g.step;
      if (i < 0 || j < 0 || i > g.nx - 1 || j > g.ny - 1) continue;
      const h = g.heights[Math.round(j) * g.nx + Math.round(i)];
      if (typeof h === "number") return h;
    }
    const box = ctx?.contentBox?.();
    return box ? box[0][1] + o.frame.z : o.frame.z;
  };

  const dispose = (obj: any) => {
    obj?.removeFromParent?.();
    obj?.traverse?.((x: any) => { x.geometry?.dispose?.(); const m = x.material; if (m) { m.map?.dispose?.(); m.dispose?.(); } });
  };
  const drop = (id: string) => {
    const d = drawn.get(id);
    if (!d) return;
    dispose(d.obj);
    for (const l of d.labels) l.el.remove();
    drawn.delete(id);
    grids.delete(id);
  };

  const label = (text: string, color: number) => {
    const el = document.createElement("div");
    el.className = "gis-label";
    el.textContent = text;
    el.style.borderColor = `#${color.toString(16).padStart(6, "0")}`;
    labelsEl?.appendChild(el);
    return el;
  };

  const drawLayer = async (l: GisLayerRef, color: number) => {
    const sig = `${l.id}|${l.url}|${o.frame.epsg}|${o.frame.x}|${o.frame.y}|${o.frame.rotation}`;
    if (drawn.get(l.id)?.sig === sig || !ctx) return;
    const path = fileOf(l.url, o.docPath);
    const j = await post("/gis/features", { path, scene_crs: sceneCrs, layer: l.layer, z_field: l.zField, feature_key: l.featureKey, crs: l.crs });
    if (!ctx || !group) return;
    if (!j.ok) { o.log?.(`GIS: ${l.name} — ${j.error ?? j.status}`); drawn.set(l.id, { obj: null, labels: [], sig, info: { error: j.error ?? j.status } }); return; }
    drop(l.id);
    const { THREE } = ctx;
    const geo = geometryOf(o.frame, j.features, ground);
    const holder = new THREE.Group();
    holder.userData.gisLayer = l.id;
    holder.userData.helper = true;
    if (geo.segments.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(geo.segments, 3));
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: true });
      const ls = new THREE.LineSegments(g, m);
      ls.renderOrder = 5;
      holder.add(ls);
    }
    if (geo.points.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(geo.points, 3));
      const m = new THREE.PointsMaterial({ color, size: 7, sizeAttenuation: false, depthTest: false, transparent: true });
      const ps = new THREE.Points(g, m);
      ps.renderOrder = 6;
      holder.add(ps);
    }
    group.add(holder);
    queueMicrotask(() => applyOpacity(l.id));
    const labels = geo.labels.slice(0, 5000).map((x) => ({ ...x, el: label(x.text, color) }));
    drawn.set(l.id, { obj: holder, labels, sig, info: { features: j.count, vertices: j.vertices, how: j.how, layer_crs: j.layer_crs,
      truncated: j.truncated, points: geo.points.length / 3, segments: geo.segments.length / 6 } });
  };

  const drawSurface = async (s: SurfaceRef) => {
    const dem = want.all.find((x) => x.id === s.dem);
    if (!dem || !ctx) return;
    const img = s.image ? want.all.find((x) => x.id === s.image) : undefined;
    const sig = `${s.id}|${dem.url}|${img?.url ?? ""}|${s.step ?? ""}|${o.frame.epsg}|${o.frame.x}|${o.frame.y}|${o.frame.rotation}`;
    if (drawn.get(s.id)?.sig === sig) return;
    const demPath = fileOf(dem.url, o.docPath);
    const imgPath = img ? fileOf(img.url, o.docPath) : null;
    const j = await post("/gis/surface", { dem: demPath, image: imgPath, scene_crs: sceneCrs, step: s.step, dem_crs: dem.crs, image_crs: img?.crs ?? null });
    if (!ctx || !group) return;
    if (!j.ok) { o.log?.(`GIS: ${s.name} — ${j.error ?? j.status}`); drawn.set(s.id, { obj: null, labels: [], sig, info: { error: j.error ?? j.status } }); return; }
    drop(s.id);
    const { THREE } = ctx;
    const { nx, ny, x0, y0, step, heights } = j;
    const pos = new Float32Array(nx * ny * 3);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const k = r * nx + c;
      const h = heights[k];
      const p = toThree(o.frame, x0 + c * step, y0 - r * step, typeof h === "number" ? h : o.frame.z);
      pos.set(p, k * 3);
    }
    const idx: number[] = [];
    const ok = (k: number) => typeof heights[k] === "number";
    for (let r = 0; r + 1 < ny; r++) for (let c = 0; c + 1 < nx; c++) {
      const a = r * nx + c, b = a + 1, d = a + nx, e = d + 1;
      if (ok(a) && ok(b) && ok(d) && ok(e)) idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if (j.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(j.uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    let map = null;
    if (imgPath) {
      try {
        map = await new THREE.TextureLoader().loadAsync(`${o.bridge}/geo/raster-preview?path=${encodeURIComponent(imgPath)}&max=4096`);
        map.colorSpace = THREE.SRGBColorSpace;
      } catch { map = null; o.log?.(`GIS: ${s.name} — the image did not come`); }
    }
    const m = new THREE.MeshLambertMaterial({ color: map ? 0xffffff : 0xb9a98a, map, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const mesh = new THREE.Mesh(g, m);
    mesh.userData.gisSurface = s.id;
    mesh.userData.helper = true;
    group.add(mesh);
    queueMicrotask(() => applyOpacity(s.id));
    grids.set(s.id, { x0, y0, step, nx, ny, heights });
    drawn.set(s.id, { obj: mesh, labels: [], sig, info: { nx, ny, step, how: j.how, z_range: j.z_range, triangles: idx.length / 3, textured: !!map } });
  };

  const sync = async () => {
    if (!ctx) return;
    const ids = new Set([...want.layers.map((l) => l.id), ...want.surfaces.map((s) => s.id)]);
    for (const id of [...drawn.keys()]) if (!ids.has(id)) drop(id);
    // the ground first: a 2D layer lies on it
    for (const s of want.surfaces) await drawSurface(s);
    let i = 0;
    for (const l of want.layers) await drawLayer(l, PALETTE[i++ % PALETTE.length]);
  };

  return {
    attach(c: GeoCtx) {
      ctx = c;
      group = new c.THREE.Group();
      group.userData.helper = true;
      group.name = "gis";
      c.scene.add(group);
      labelsEl = document.createElement("div");
      labelsEl.className = "gis-labels";
      c.host.appendChild(labelsEl);
      (c.host as unknown as { __gis?: () => unknown }).__gis = () => this.state();
      void sync();
    },
    detach() {
      for (const id of [...drawn.keys()]) drop(id);
      group?.removeFromParent();
      labelsEl?.remove();
      group = null;
      labelsEl = null;
      ctx = null;
    },
    update() {
      if (!ctx || !labelsEl || ++frames % 2) return;
      const cam = ctx.camera();
      const r = ctx.renderer.domElement.getBoundingClientRect();
      const W = r.width, H = r.height;
      const v = new ctx.THREE.Vector3();
      const all: Array<{ el: HTMLElement; x: number; y: number; d: number }> = [];
      for (const d of drawn.values()) for (const l of d.labels) {
        v.set(l.at[0], l.at[1], l.at[2]);
        const dist = v.distanceTo(cam.position);
        v.project(cam);
        if (!(v.z < 1) || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) { l.el.style.display = "none"; continue; }
        all.push({ el: l.el, x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, d: dist });
      }
      all.sort((a, b) => a.d - b.d);
      all.forEach((a, i) => {
        if (i >= MAX_LABELS) { a.el.style.display = "none"; return; }
        a.el.style.display = "";
        a.el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`;
      });
    },
    ownsPointer: () => false,
    far: () => null,
    setCamera() { /* the labels read the camera each frame */ },
    set(layers, surfaces, all) {
      want = { layers, surfaces, all };
      void sync();
    },
    setOpacity(id, v) {
      const x = Math.min(1, Math.max(0, Number(v)));
      if (!Number.isFinite(x)) return;
      opacities.set(id, x);
      applyOpacity(id);
    },
    state() {
      return { epsg: o.frame.epsg, drawn: [...drawn.entries()].map(([id, d]) => ({ id, ...d.info, labels: d.labels.length,
        shownLabels: d.labels.filter((l) => l.el.style.display !== "none").length })) };
    },
  };
}
