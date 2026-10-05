/**
 * SPAZIO · the Scena 3D — the representation models of an epoch and the proxies
 * of its units, in one orbitable scene (scrivania v11b).
 *
 * What it draws is decided elsewhere (`space.ts` reads the graph, `main.ts`
 * turns an epoch into items); this module only renders the items it is handed,
 * each as its file state allows:
 *
 *   · `resident` — the glb is fetched and drawn: an RM as it is, a proxy
 *     translucent in the colour of its unit's type (`em_visual_rules`
 *     `material.rgba_color`, linear, as Blender paints it);
 *   · `json` — convex hulls and spheres drawn as they are, from the shape's data;
 *   · `reference` — a file only referenced (somebody's disk), which cannot be
 *     fetched: a dashed CONTOUR with its label. Nothing says how big the file's
 *     content is, so the contour is the room of what is drawn around it (the
 *     scene's extent, or a metre when it is alone) — a place, not a shape;
 *   · `missing` — declared and absent (not in the store, or not found when
 *     fetched): its label only, where it would be.
 *
 * The camera frames the content when it first arrives and on ⤢ (`frame`),
 * never on an epoch change or a toggle: the reader's point of view is theirs
 * (MICRO-RIFINITURE). three.js is the lazy engine of `embed3d-native.ts`.
 */
import { engine, headBytes, lodLevelOf, probeLods, tilesBarTexts } from "./embed3d-native";
import { onFirstVisible } from "./lazy";
import { createTilesLayer, dracoFor, formatBytes, isTilesetUrl, tilesBar, tilesEngine, type TilesLayer } from "./tiles3d";

export interface SceneItem {
  kind: "rm" | "proxy";
  /** the RM, or the UNIT a proxy belongs to (a click selects it) */
  id: string;
  label: string;
  state: "resident" | "reference" | "missing" | "json";
  /** the glb to fetch, for `resident` */
  url?: string;
  resourceId?: string;
  /** linear rgb of the unit's type, for a proxy */
  rgb?: [number, number, number];
  /** the outline's colour (hex), e.g. the RM's placement axis */
  edge?: string;
  convexshapes?: number[][];
  spheres?: number[][];
  selected?: boolean;
  /** MICRO-3DTILES · the tileset of the same model (proposed over the threshold) */
  tileset?: string;
  /** what the graph knows of the file: `size_bytes`, `primitives.points` */
  bytes?: number | null;
  points?: number | null;
}

export interface SceneTexts {
  loading: string;
  noEngine: string;
  referenceOnly: (name: string) => string;
  missing: (name: string) => string;
  /** MICRO-3DTILES · a glb over the threshold, and the two ways on */
  overLimit: (name: string, size: string, limit: string) => string;
  openTileset: string;
  loadAnyway: string;
  lodNote: (n: number) => string;
}

export interface SpaceSceneHandle {
  update(items: SceneItem[]): void;
  frame(): void;
  dispose(): void;
}

export interface SpaceSceneOptions {
  texts: SceneTexts;
  onPickUnit?: (unitId: string) => void;
  onPickRm?: (rmId: string) => void;
  /** a resident file did not answer: the caller marks it missing */
  onNotFound?: (resourceId: string) => void;
  /** MICRO-3DTILES · the threshold and the tiles' memory (the Preferences) */
  limit?: { bytes: number; points: number };
  tilesMemoryMB?: number;
}

interface Drawn {
  item: SceneItem;
  /** what was drawn: a mesh, a contour, or only a label — MICRO-3DTILES: a
   *  tileset, or a glb held back by the threshold */
  as: "mesh" | "contour" | "label" | "pending" | "tiles" | "gated";
  /** the file actually drawn (a LOD set's chosen level, a tileset) */
  url?: string;
}

export function mountSpaceScene(host: HTMLElement, opts: SpaceSceneOptions): SpaceSceneHandle {
  let items: SceneItem[] = [];
  let disposed = false;
  let rebuild: (() => void) | null = null;
  let frameIt: (() => void) | null = null;
  let cleanup: (() => void) | null = null;
  const drawn = new Map<string, Drawn>();
  // the probes' seam: what the scene holds, and where a unit sits on screen
  const probe = host as unknown as {
    __space?: () => unknown;
    __spaceScreenOf?: (id: string) => { x: number; y: number } | null;
    __spaceCamera?: () => number[];
    __spaceTiles?: () => unknown;
    __spaceTileScreenOf?: (uri: string) => { x: number; y: number } | null;
  };
  probe.__space = () => [...drawn.values()].map((d) => ({ kind: d.item.kind, id: d.item.id, state: d.item.state, as: d.as,
    ...(d.url ? { url: d.url } : {}) }));

  const status = document.createElement("div");
  status.className = "scn-status";
  status.textContent = opts.texts.loading;
  host.appendChild(status);

  onFirstVisible(host, () => {
    if (disposed) return;
    void (async () => {
      let E: any;
      try { E = await engine(); } catch { status.textContent = opts.texts.noEngine; return; }
      if (disposed) return;
      const { THREE, GLTFLoader, OrbitControls, ConvexGeometry } = E;
      const size = () => ({ w: Math.max(200, host.clientWidth || 600), h: Math.max(160, host.clientHeight || 360) });
      let { w, h } = size();
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      renderer.domElement.className = "scn-canvas";
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 2000);
      camera.position.set(6, 5, 9);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(4, 8, 6);
      scene.add(key);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      const content = new THREE.Group();
      scene.add(content);
      const labels = document.createElement("div");
      labels.className = "v3d-labels scn-labels";
      const loader = new GLTFLoader();
      // TEMPLU MARE v2 · a web version of a model is Draco-compressed («Prepare
      // for a use…»): the decoder the tilesets use, set once before the first load
      let dracoSet: Promise<void> | null = null;
      const withDraco = (): Promise<void> => (dracoSet ??= tilesEngine()
        .then((T) => { loader.setDRACOLoader(dracoFor(E, T)); }).catch(() => undefined));
      const cache = new Map<string, Promise<any | null>>();
      const load = (url: string): Promise<any | null> => {
        let p = cache.get(url);
        if (!p) {
          p = withDraco().then(() => new Promise((res) => loader.load(url, (g: any) => res(g.scene), undefined, () => res(null))));
          cache.set(url, p);
        }
        return p;
      };
      let framed = false;
      let generation = 0;
      const anchors: Array<{ el: HTMLElement; p: any }> = [];
      const pickables: any[] = [];
      const unitCentres = new Map<string, any>();

      // MICRO-3DTILES · the tilesets of the scene (one layer per tileset url,
      // kept across rebuilds: a tileset is not re-fetched when a toggle
      // flips), the LOD sets asked for once, and what the reader chose
      type Live = { layer: TilesLayer; bar: ReturnType<typeof tilesBar>; ready: Promise<void>; itemId: string };
      const layers = new Map<string, Live>();
      const lodSets = new Map<string, Promise<Array<{ level: number; url: string; bytes: number | null }>>>();
      const lodChoice = new Map<string, number>();
      const forced = new Set<string>();
      const useTileset = new Set<string>();
      const strips = document.createElement("div");
      strips.className = "scn-strips";
      let T: any = null;
      const liveLayers = () => [...layers.values()].filter((l) => l.layer.object.parent === content);
      const ensureLayer = async (url: string, itemId: string): Promise<Live | null> => {
        let live = layers.get(url);
        if (live) { live.itemId = itemId; return live; }
        try { T = T ?? await tilesEngine(); } catch { return null; }
        const layer = createTilesLayer(E, T, url, camera, renderer, { memoryMB: opts.tilesMemoryMB });
        const bar = tilesBar(layer, tilesBarTexts());
        // ready = the root's first tile, or its failure (the frame waits for it)
        const ready = new Promise<void>((res) => {
          const t0 = setTimeout(res, 8000);
          // the root's volume is enough to frame and to label: the tiles come after
          layer.onChange(() => { const st = layer.status(); if (layer.rootReady() || st.failed) { clearTimeout(t0); res(); } });
        });
        live = { layer, bar, ready, itemId };
        layers.set(url, live);
        return live;
      };
      probe.__spaceTiles = () => liveLayers().map((l) => ({ id: l.itemId, files: l.layer.loadedFiles(), status: l.layer.status() }));
      probe.__spaceTileScreenOf = (uri: string) => {
        for (const l of liveLayers()) {
          const c = l.layer.centreOf(uri);
          if (!c) continue;
          const v = c.clone().project(camera);
          const r = renderer.domElement.getBoundingClientRect();
          return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
        }
        return null;
      };
      const stripOf = (item: SceneItem): HTMLElement => {
        const el = document.createElement("div");
        el.className = "v3d-strip";
        el.dataset.id = item.id;
        const b = document.createElement("b");
        b.textContent = item.label;
        el.appendChild(b);
        strips.appendChild(el);
        return el;
      };

      const extent = (): any => {
        const b = new THREE.Box3();
        for (const c of content.children) if (!c.userData.contour && !c.userData.tiles) b.expandByObject(c);
        for (const l of liveLayers()) { const lb = l.layer.bounds(); if (lb) b.union(lb); }
        return b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)) : b;
      };
      const addLabel = (text: string, at: any, cls: string, id?: string) => {
        const el = document.createElement("span");
        el.className = `v3d-label scn-label ${cls}`;
        el.textContent = text;
        if (id) el.dataset.id = id;
        labels.appendChild(el);
        anchors.push({ el, p: at.clone() });
      };
      const translucent = (item: SceneItem) => {
        const c = new THREE.Color();
        const [r, g, b] = item.rgb ?? [0.328, 0.033, 0.033];
        c.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
        return new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.42, depthWrite: false });
      };
      const outline = (geom: any, item: SceneItem, at?: any) => {
        const col = item.selected ? 0xbf9000 : new THREE.Color(item.edge ?? "#555555");
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: col }));
        if (at) e.position.copy(at);
        return e;
      };
      const tag = (obj: any, item: SceneItem) => {
        obj.traverse((o: any) => {
          if (item.kind === "proxy") o.userData.unitId = item.id; else o.userData.rmId = item.id;
          if (o.isMesh) pickables.push(o);
        });
      };
      const centreOf = (obj: any) => new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
      const topOf = (obj: any) => {
        const b = new THREE.Box3().setFromObject(obj);
        return new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
      };

      frameIt = () => {
        const b = extent();
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        const span = Math.max(s.x, s.y, s.z) || 1;
        controls.target.copy(c);
        camera.position.copy(c).add(new THREE.Vector3(span * 0.9, span * 0.7, span * 1.5));
        camera.near = span / 200;
        camera.far = span * 200;
        camera.updateProjectionMatrix();
        controls.update();
      };

      rebuild = () => {
        const gen = ++generation;
        content.clear();
        labels.textContent = "";
        anchors.length = 0;
        pickables.length = 0;
        unitCentres.clear();
        drawn.clear();
        strips.textContent = "";
        const pending: Promise<void>[] = [];
        const later: SceneItem[] = [];      // contours and labels: after the meshes, around them
        const used = new Set<string>();
        for (const item of items) {
          const key = `${item.kind}:${item.id}`;
          // MICRO-3DTILES · a tileset (the item's own, or the one chosen over
          // a glb past the threshold)
          const tsUrl = item.state === "resident" && item.url
            ? (isTilesetUrl(item.url) ? item.url : useTileset.has(key) && item.tileset ? item.tileset : null) : null;
          if (tsUrl) {
            used.add(tsUrl);
            drawn.set(key, { item, as: "pending", url: tsUrl });
            const el = stripOf(item);
            pending.push(ensureLayer(tsUrl, item.id).then(async (live) => {
              if (gen !== generation || disposed) return;
              if (!live) { drawn.set(key, { item: { ...item, state: "missing" }, as: "label" }); later.push({ ...item, state: "missing" }); return; }
              live.layer.object.userData.tiles = true;
              live.layer.object.traverse((o: any) => { o.userData.rmId = item.id; });
              content.add(live.layer.object);
              el.appendChild(live.bar.el);
              live.bar.refresh();
              await live.ready;
              if (gen !== generation || disposed) return;
              const bb = live.layer.bounds();
              if (bb) addLabel(item.label, new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2), "rm", item.id);
              drawn.set(key, { item, as: "tiles", url: tsUrl });
            }));
            continue;
          }
          if (item.state === "resident" && item.url && item.kind === "rm") {
            // a LOD set: the lightest level, or the one chosen; and the threshold
            const base = item.url;
            if (lodLevelOf(base) != null && !lodSets.has(base)) lodSets.set(base, probeLods(base));
            const el = lodLevelOf(base) != null || opts.limit ? stripOf(item) : null;
            drawn.set(key, { item, as: "pending" });
            pending.push((async () => {
              const set = lodLevelOf(base) != null ? await lodSets.get(base)! : [];
              const lvl = lodChoice.get(key) ?? set[set.length - 1]?.level;
              const chosen = set.find((x) => x.level === lvl);
              const u = chosen?.url ?? base;
              if (gen !== generation || disposed) return;
              if (set.length && el) {
                const sel = document.createElement("select");
                sel.className = "lod-pick";
                for (const v of set) {
                  const o = document.createElement("option");
                  o.value = String(v.level);
                  o.textContent = `LOD ${v.level}${v.bytes != null ? ` · ${formatBytes(v.bytes)}` : ""}`;
                  o.selected = v.level === lvl;
                  sel.appendChild(o);
                }
                sel.addEventListener("change", () => { lodChoice.set(key, Number(sel.value)); rebuild?.(); });
                const note = document.createElement("span");
                note.className = "lod-note";
                note.textContent = opts.texts.lodNote(set.length);
                el.append(sel, note);
              }
              // the threshold: what the graph knows, else a HEAD
              const lim = opts.limit;
              if (lim && !forced.has(u)) {
                const bytes = (u === base ? item.bytes : null) ?? chosen?.bytes ?? await headBytes(u);
                const pts = u === base ? item.points ?? null : null;
                if (gen !== generation || disposed) return;
                if ((bytes != null && bytes > lim.bytes) || (pts != null && pts > lim.points)) {
                  drawn.set(key, { item, as: "gated", url: u });
                  later.push({ ...item, state: "missing", label: opts.texts.overLimit(item.label, formatBytes(bytes ?? 0), formatBytes(lim.bytes)) });
                  if (el) {
                    if (item.tileset) {
                      const b = document.createElement("button");
                      b.type = "button"; b.className = "scn-tg"; b.dataset.gate = "tileset";
                      b.textContent = opts.texts.openTileset;
                      b.addEventListener("click", () => { useTileset.add(key); rebuild?.(); });
                      el.appendChild(b);
                    }
                    const g = document.createElement("button");
                    g.type = "button"; g.className = "scn-tg"; g.dataset.gate = "load";
                    g.textContent = opts.texts.loadAnyway;
                    g.addEventListener("click", () => { forced.add(u); rebuild?.(); });
                    el.appendChild(g);
                  }
                  return;
                }
              }
              if (el && !el.querySelector("select")) el.remove();
              const root = await load(u);
              if (gen !== generation || disposed) return;
              if (!root) {
                drawn.set(key, { item: { ...item, state: "missing" }, as: "label" });
                later.push({ ...item, state: "missing" });
                if (item.resourceId) opts.onNotFound?.(item.resourceId);
                return;
              }
              const obj = root.clone(true);
              if (item.selected) content.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(obj), 0xbf9000));
              tag(obj, item);
              content.add(obj);
              addLabel(item.label, topOf(obj), "rm", item.id);
              drawn.set(key, { item, as: "mesh", url: u });
            })());
            continue;
          }
          if (item.state === "resident" && item.url) {
            drawn.set(`${item.kind}:${item.id}`, { item, as: "pending" });
            pending.push(load(item.url).then((root) => {
              if (gen !== generation || disposed) return;
              if (!root) {
                drawn.set(`${item.kind}:${item.id}`, { item: { ...item, state: "missing" }, as: "label" });
                later.push({ ...item, state: "missing" });
                if (item.resourceId) opts.onNotFound?.(item.resourceId);
                return;
              }
              const obj = root.clone(true);
              if (item.kind === "proxy") {
                obj.traverse((o: any) => { if (o.isMesh) o.material = translucent(item); });
                obj.traverse((o: any) => { if (o.isMesh) o.add(outline(o.geometry, item)); });
              } else if (item.selected) {
                content.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(obj), 0xbf9000));
              }
              tag(obj, item);
              content.add(obj);
              if (item.kind === "proxy") unitCentres.set(item.id, centreOf(obj));
              addLabel(item.label, topOf(obj), item.kind === "proxy" ? `u${item.selected ? " sel" : ""}` : "rm", item.id);
              drawn.set(`${item.kind}:${item.id}`, { item, as: "mesh" });
            }));
          } else if (item.state === "json") {
            const group = new THREE.Group();
            for (const flat of item.convexshapes ?? []) {
              const pts = [];
              for (let i = 0; i + 2 < flat.length; i += 3) pts.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
              if (pts.length < 4) continue;
              const g = new ConvexGeometry(pts);
              const m = new THREE.Mesh(g, translucent(item));
              m.add(outline(g, item));
              group.add(m);
            }
            for (const [x, y, z, r] of item.spheres ?? []) {
              const g = new THREE.SphereGeometry(r, 24, 16);
              const m = new THREE.Mesh(g, translucent(item));
              m.position.set(x, y, z);
              group.add(m);
            }
            if (!group.children.length) continue;
            tag(group, item);
            content.add(group);
            unitCentres.set(item.id, centreOf(group));
            addLabel(item.label, topOf(group), `u${item.selected ? " sel" : ""}`, item.id);
            drawn.set(`${item.kind}:${item.id}`, { item, as: "mesh" });
          } else later.push(item);
        }
        for (const [u, l] of layers) if (!used.has(u)) { l.layer.dispose(); layers.delete(u); }
        void Promise.all(pending).then(() => {
          if (gen !== generation || disposed) return;
          const b = extent();
          let k = 0;
          for (const item of later) {
            const key = `${item.kind}:${item.id}`;
            if (item.state === "reference") {
              // a place, not a shape: the room of what is drawn, a little larger
              const box = b.clone().expandByScalar(0.08 + 0.04 * k++);
              const s = box.getSize(new THREE.Vector3());
              const g = new THREE.BoxGeometry(s.x, s.y, s.z);
              const c = new THREE.LineSegments(new THREE.EdgesGeometry(g),
                new THREE.LineDashedMaterial({ color: new THREE.Color(item.edge ?? "#8a5a00"), dashSize: 0.12, gapSize: 0.08 }));
              c.computeLineDistances();
              c.position.copy(box.getCenter(new THREE.Vector3()));
              c.userData.contour = true;
              tag(c, item);
              content.add(c);
              // at the right-hand top corner: the summary sits top-left
              addLabel(opts.texts.referenceOnly(item.label),
                new THREE.Vector3(box.max.x, box.max.y + 0.15 * k, box.max.z), "ref", item.id);
              drawn.set(key, { item, as: "contour" });
            } else {
              const at = b.getCenter(new THREE.Vector3());
              at.y = b.max.y + 0.2 + 0.25 * k++;
              // MICRO-3DTILES · held back by the threshold: its label says so
              const gated = drawn.get(key)?.as === "gated";
              addLabel(gated ? item.label : opts.texts.missing(item.label), at, gated ? "miss gated" : "miss", item.id);
              if (!gated) drawn.set(key, { item, as: "label" });
            }
          }
          if (!framed && content.children.length) { framed = true; frameIt?.(); }
          host.dataset.ready = "1";
          host.dataset.items = String(drawn.size);
        });
      };

      const place = () => {
        const W = renderer.domElement.clientWidth || w, H = renderer.domElement.clientHeight || h;
        for (const a of anchors) {
          const v = a.p.clone().project(camera);
          a.el.style.left = `${((v.x + 1) / 2) * W}px`;
          a.el.style.top = `${((1 - v.y) / 2) * H}px`;
          a.el.style.display = v.z < 1 ? "" : "none";
        }
      };
      probe.__spaceScreenOf = (id: string) => {
        const c = unitCentres.get(id);
        if (!c) return null;
        const v = c.clone().project(camera);
        const r = renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      };
      probe.__spaceCamera = () => [...camera.position.toArray(), ...controls.target.toArray()].map((x: number) => Math.round(x * 1000) / 1000);
      let raf = 0;
      let frames = 0;
      const tick = () => {
        if (disposed) return;
        raf = requestAnimationFrame(tick);
        controls.update();
        const live = liveLayers();
        for (const l of live) l.layer.update();
        if (live.length && ++frames % 20 === 0) for (const l of live) l.bar.refresh();
        renderer.render(scene, camera);
        place();
      };
      // a CLICK is a press and a release without a drag — a drag orbits
      let down: { x: number; y: number } | null = null;
      const ray = new THREE.Raycaster();
      const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
      const onUp = (e: PointerEvent) => {
        const moved = !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
        down = null;
        if (moved) return;
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        // MICRO-3DTILES · «Più dettaglio qui» armed on a tileset: the click is its
        const armed = liveLayers().find((l) => l.bar.armed());
        if (armed) {
          const th = ray.intersectObject(armed.layer.object, true)[0];
          armed.bar.picked(th ? armed.layer.refineAt(th.object) : "none");
          return;
        }
        const tileHits = liveLayers().flatMap((l) => ray.intersectObject(l.layer.object, true)
          .map((h: any) => ({ ...h, object: { ...h.object, userData: { rmId: l.itemId } } })));
        const hits = [...ray.intersectObjects(pickables, false), ...tileHits].sort((a: any, b: any) => a.distance - b.distance);
        // a proxy wins over the model it sits in: that is what a click means here
        const hit = hits.find((x: any) => x.object.userData.unitId) ?? hits[0];
        if (!hit) return;
        if (hit.object.userData.unitId) opts.onPickUnit?.(String(hit.object.userData.unitId));
        else if (hit.object.userData.rmId) opts.onPickRm?.(String(hit.object.userData.rmId));
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      const ro = new ResizeObserver(() => {
        ({ w, h } = size());
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        for (const l of layers.values()) l.layer.resize();
      });
      ro.observe(host);
      status.remove();
      host.prepend(renderer.domElement);
      host.appendChild(labels);
      host.appendChild(strips);
      cleanup = () => {
        cancelAnimationFrame(raf);
        for (const l of layers.values()) l.layer.dispose();
        layers.clear();
        strips.remove();
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        labels.remove();
      };
      rebuild();
      tick();
    })();
  });

  return {
    update(next) {
      items = next;
      rebuild?.();
    },
    frame() { frameIt?.(); },
    dispose() {
      disposed = true;
      cleanup?.();
    },
  };
}
