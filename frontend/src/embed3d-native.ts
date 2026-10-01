/**
 * DP-79 P5b — the 3D embed you can actually turn: a glTF, orbited in the card.
 *
 * **Why this exists next to the ATON iframe, and what changed.** `embed3d.ts`
 * argued against pulling a 3D engine into this bundle, and gave three reasons:
 * it would add *megabytes*, it would couple EMStudio to an ATON version, and it
 * would duplicate a viewer whose whole job is to be the viewer. Two of those
 * still hold and one did not survive being measured:
 *
 *   three.js + GLTFLoader + OrbitControls, minified: **381 kB (90 kB gzipped)**
 *
 * on a build that is 1.96 MB — 13% on the wire, and **only for readers who open
 * a 3D embed**, because it is imported dynamically the first time one renders.
 * It does not couple us to ATON (it is not ATON), and it does not duplicate the
 * scene viewer: it shows ONE model, which is precisely what a Shelf asset or a
 * promoted glTF is.
 *
 * So the two paths are now different jobs rather than one job done twice:
 *
 * * **a MODEL** — a `ResourceNode` with a glTF/GLB, the shape DP-76 promotion
 *   produces (reference + url + checksum). Rendered here, self-contained, and
 *   it works with no ATON deployed anywhere. This is the common case in the
 *   field and the only one that works offline on a node;
 * * **a SCENE** — a Heriverse/ATON scene, with epochs, its temporal UI and
 *   everything a published scene carries. That stays an iframe, because that IS
 *   a viewer whose whole job is to be the viewer.
 *
 * The rule the rest of the narrative obeys holds here too: **an embed is a
 * reference.** The URL is resolved at render time, nothing is copied into the
 * document, and an asset that has gone away produces a sentence rather than a
 * black rectangle.
 */

import { t } from "./i18n";
import { onFirstVisible } from "./lazy";
import { createTilesLayer, formatBytes, isTilesetUrl, tilesBar, tilesEngine,
         type RefineMode, type TilesBarTexts, type TilesLayer } from "./tiles3d";

/** Loaded once per session, on the first 3D embed a reader actually looks at. */
let enginePromise: Promise<any> | null = null;

/** The engine, loaded once: also the Scena 3D's (`scene3d.ts`). */
export async function engine(): Promise<any> {
  if (!enginePromise) {
    // RIFINITURE · the web build fetches the engine beside the page, once, on
    // the first model opened. A CONSTANT condition, so the other arm — three
    // inline — is dropped from that build by rollup and esbuild alike.
    enginePromise = __EM_LAZY_3D__
      ? import(/* @vite-ignore */ new URL("./engine3d.js", document.baseURI).href)
      : (async () => {
          const [THREE, loaderMod, controlsMod, convexMod, objMod, mtlMod] = await Promise.all([
            import("three"),
            import("three/examples/jsm/loaders/GLTFLoader.js"),
            import("three/examples/jsm/controls/OrbitControls.js"),
            import("three/examples/jsm/geometries/ConvexGeometry.js"),
            import("three/examples/jsm/loaders/OBJLoader.js"),
            import("three/examples/jsm/loaders/MTLLoader.js"),
          ]);
          return { THREE, GLTFLoader: loaderMod.GLTFLoader,
                   OrbitControls: controlsMod.OrbitControls, ConvexGeometry: convexMod.ConvexGeometry,
                   OBJLoader: objMod.OBJLoader, MTLLoader: mtlMod.MTLLoader };
        })();
  }
  return enginePromise;
}

export interface ViewerHandle {
  dispose(): void;
  /** CATENA · replace the markers (a reading's points) without reloading */
  setMarkers?(markers: Marker3D[]): void;
  /** RIFINITURE · frame the model again — the explicit ⤢, never implied */
  frame?(): void;
  /** LUOGO · the trace being drawn (a line or polyline not closed yet), or null */
  setDraft?(vertices: [number, number, number][] | null, note?: string): void;
}

/** CATENA · a reading's place on the model with its label. LUOGO: its
 *  vertices come from the reading's glb — one for a point. */
export interface Marker3D {
  id: string;
  label: string;
  kind?: "point" | "line" | "polyline";
  vertices: [number, number, number][];
  /** LUOGO · shown after the label: the measure of a line or a polyline */
  note?: string;
  selected?: boolean;
}

/** Where a place's label sits: the middle of its path (a point: the point). */
export function labelAnchor(vs: [number, number, number][]): [number, number, number] {
  if (vs.length < 2) return vs[0];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < vs.length; i++) {
    const d = Math.hypot(vs[i][0] - vs[i - 1][0], vs[i][1] - vs[i - 1][1], vs[i][2] - vs[i - 1][2]);
    seg.push(d);
    total += d;
  }
  let half = total / 2;
  for (let i = 0; i < seg.length; i++) {
    if (half <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, half / seg[i]) : 0;
      const a = vs[i], b = vs[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    half -= seg[i];
  }
  return vs[0];
}

export interface Viewer3DOptions {
  label?: string;
  /** a click on the model (no drag): the point hit, in the model's frame, and
   *  the name of the mesh it is on. Absent = the viewer only orbits. */
  onPick?: (p: [number, number, number], on: string) => void;
  /** a click on a marker */
  onMarker?: (id: string) => void;
  /** LUOGO · a double click on the canvas (closes a polyline being traced) */
  onDoubleClick?: () => void;
  /** LUOGO · true while a reading waits for its place: every click is then a
   *  vertex, and a marker under it (a line is a wide target) does not take it */
  tracing?: () => boolean;
  markers?: Marker3D[];
  /** MICRO-3DTILES · big assets: the threshold, the tileset, the LOD set */
  model?: ModelOptions;
}

/** MICRO-3DTILES · what the viewer is told about a big asset. */
export interface ModelOptions {
  /** what the graph already knows of the file (the resource's `size_bytes`,
   *  `primitives.points`): it saves asking the server */
  known?: { bytes?: number | null; points?: number | null };
  /** over this a glb is not loaded by itself (the preferences) */
  limit?: { bytes: number; points: number };
  /** the tileset of the same model, proposed when the glb is over the limit */
  tileset?: string | null;
  /** the tileset's refinement and memory (the preferences) */
  tiles?: { mode?: RefineMode; memoryMB?: number };
  /** look for the `<base>_LOD0…N` siblings of a glb (default: yes) */
  lods?: boolean;
  /** RISORSA-FILE · the files of a resource of several files: the URL the
   *  loader is handed is VIRTUAL, and this turns every URL it asks (the mtl
   *  the obj calls, the textures the mtl calls, a gltf's bin) into a real
   *  address — offline beside the em.json, online by digest in the store
   *  (`representation.ts addressMap`). three's `LoadingManager.setURLModifier`. */
  urlModifier?: (url: string) => string;
  /** …and what it resolved, for the probes */
  resolved?: () => Array<[string, string]>;
}

/** MICRO-3DTILES · the `_LOD<n>` of a glb's locator — in its path or in the
 *  `path=` of the bridge's `/fs/file?path=…`, where `_` and `.` stay literal. */
const LOD_RE = /_LOD(\d+)(\.(?:glb|gltf))(?=$|[?#&])/i;
/** EMtools' range (`rm_manager/operators.py`: LOD_MIN_LEVEL 0, LOD_MAX_LEVEL 4) */
export const LOD_LEVELS = [0, 1, 2, 3, 4];

export function lodLevelOf(url: string): number | null {
  const m = LOD_RE.exec(url);
  return m ? Number(m[1]) : null;
}

export function withLod(url: string, level: number): string {
  return url.replace(LOD_RE, (_m, _n, ext) => `_LOD${level}${ext}`);
}

/** The bytes of a file, asked with a HEAD; null when the server does not say. */
export async function headBytes(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    if (!r.ok) return null;
    const n = Number(r.headers.get("content-length"));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * The LOD set a glb belongs to, as `rm_manager.detect_lod_variants` of EMtools
 * reads it: `<base>_LOD<n>`, sorted by n. EMtools has the objects in the scene;
 * here the siblings are ASKED for (a HEAD each, 0…4), so a set works from the
 * bridge, the dev server or any web store alike. `[]` when the name has no
 * `_LOD<n>` or only one level answers.
 */
export async function probeLods(url: string): Promise<Array<{ level: number; url: string; bytes: number | null }>> {
  if (lodLevelOf(url) == null) return [];
  const found = await Promise.all(LOD_LEVELS.map(async (level) => {
    const u = withLod(url, level);
    try {
      const r = await fetch(u, { method: "HEAD" });
      // a page is not a model: a dev server (Vite) or an SPA host answers 200
      // with its index.html for a file that is not there — measured on :5211
      if (!r.ok || /^text\/html/i.test(r.headers.get("content-type") ?? "")) return null;
      const n = Number(r.headers.get("content-length"));
      return { level, url: u, bytes: Number.isFinite(n) && n > 0 ? n : null };
    } catch {
      return null;
    }
  }));
  const ok = found.filter((x): x is { level: number; url: string; bytes: number | null } => !!x);
  return ok.length > 1 ? ok : [];
}

/**
 * Mount an orbitable view of one glTF — or, MICRO-3DTILES, of a 3D Tiles
 * tileset, or of a `_LOD` set — into `host`.
 *
 * Nothing loads until the reader is looking at it (`lazy.ts`), for the same
 * reason the iframe does not: a chapter with six models must not fetch six
 * models because somebody scrolled past the title.
 */
export function mount3dViewer(host: HTMLElement, url: string,
                              opts: Viewer3DOptions = {}): ViewerHandle {
  let disposed = false;
  let cleanup: (() => void) | null = null;
  let markers: Marker3D[] = opts.markers ?? [];
  let applyMarkers: (() => void) | null = null;
  let frameModel: (() => void) | null = null;
  let draft: { vertices: [number, number, number][]; note: string } | null = null;
  let applyDraft: (() => void) | null = null;
  const mo = opts.model ?? {};

  const status = document.createElement("div");
  status.className = "nv-embed-note";
  status.textContent = "modello 3D — si carica quando lo guardi";
  host.appendChild(status);
  // MICRO-3DTILES · the strip of a big asset: the tileset's controls, or the
  // LOD selector — above the canvas, in the stage's own header
  const strip = document.createElement("div");
  strip.className = "v3d-strip hidden";

  const fail = (why: string) => {
    // An asset that has gone away says so. A black box would let a reader
    // believe the model is loading, for ever.
    status.className = "nv-embed-note nv-implied";
    status.textContent = why;
  };

  onFirstVisible(host, () => {
    if (disposed) return;
    status.textContent = "carico il modello…";
    void (async () => {
      let E: any, THREE: any, GLTFLoader: any, OrbitControls: any, OBJLoader: any, MTLLoader: any;
      try {
        E = await engine();
        ({ THREE, GLTFLoader, OrbitControls, OBJLoader, MTLLoader } = E);
      } catch {
        fail(t("em3d.noEngine"));
        return;
      }
      if (disposed) return;

      const width = Math.max(240, host.clientWidth || 480);
      const height = Math.round(width * 0.62);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.domElement.className = "nv-3d-canvas";
      renderer.domElement.setAttribute(
        "aria-label", opts.label ? `modello 3D: ${opts.label}` : "modello 3D");

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
      // Two lights and no environment map: a study model is looked at, not
      // rendered for a magazine, and an HDRI would be another asset to ship.
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(2, 3, 2);
      scene.add(key);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      // what is seen: a glb, or a tileset's group — one at a time
      const content = new THREE.Group();
      scene.add(content);

      // CATENA · the readings' points: a sphere each, and a label that follows
      // it on screen (HTML, so it reads at any zoom and takes the theme)
      const markerGroup = new THREE.Group();
      scene.add(markerGroup);
      const labels = document.createElement("div");
      labels.className = "v3d-labels";
      let markerRadius = 0.05;
      // LUOGO · the trace being drawn: its vertices, the path so far, the
      // running measure beside the last vertex — a colour of its own
      const draftGroup = new THREE.Group();
      scene.add(draftGroup);
      const draftLabel = document.createElement("span");
      draftLabel.className = "v3d-label draft";
      draftLabel.style.display = "none";
      labels.appendChild(draftLabel);
      applyDraft = () => {
        draftGroup.clear();
        if (!labels.contains(draftLabel)) labels.appendChild(draftLabel);
        const vs = draft?.vertices ?? [];
        for (const p of vs) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(markerRadius * 0.7, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0x3a8fe3 }));
          s.position.set(p[0], p[1], p[2]);
          draftGroup.add(s);
        }
        if (vs.length > 1) {
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(vs.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
            new THREE.LineBasicMaterial({ color: 0x3a8fe3, depthTest: false }));
          line.renderOrder = 3;
          draftGroup.add(line);
        }
        draftLabel.textContent = draft?.note ?? "";
      };
      applyMarkers = () => {
        markerGroup.clear();
        labels.textContent = "";
        labels.appendChild(draftLabel);
        for (const m of markers) {
          const color = m.selected ? 0xbf9000 : 0xe3b43a;
          for (const p of m.vertices) {
            const s = new THREE.Mesh(new THREE.SphereGeometry(markerRadius * (m.vertices.length > 1 ? 0.7 : 1), 16, 12),
              new THREE.MeshBasicMaterial({ color }));
            s.position.set(p[0], p[1], p[2]);
            s.userData.markerId = m.id;
            markerGroup.add(s);
          }
          // a line and a polyline are drawn as what they are: an open path
          if (m.vertices.length > 1) {
            const line = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(m.vertices.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
              new THREE.LineBasicMaterial({ color, depthTest: false }));
            line.renderOrder = 2;
            line.userData.markerId = m.id;
            markerGroup.add(line);
          }
          const l = document.createElement("span");
          l.className = "v3d-label" + (m.selected ? " sel" : "");
          l.textContent = m.note ? `${m.label} · ${m.note}` : m.label;
          l.dataset.marker = m.id;
          labels.appendChild(l);
        }
      };
      const placeLabels = () => {
        const w = renderer.domElement.clientWidth || width;
        const h = renderer.domElement.clientHeight || height;
        markers.forEach((m, i) => {
          const el = labels.children[i + 1] as HTMLElement | undefined;   // [0] is the draft's
          if (!el) return;
          const p = labelAnchor(m.vertices);
          const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
          el.style.left = `${((v.x + 1) / 2) * w}px`;
          el.style.top = `${((1 - v.y) / 2) * h}px`;
          el.style.display = v.z < 1 ? "" : "none";
        });
        if (draft?.vertices.length) {
          const p = draft.vertices[draft.vertices.length - 1];
          const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
          draftLabel.style.left = `${((v.x + 1) / 2) * w}px`;
          draftLabel.style.top = `${((1 - v.y) / 2) * h}px`;
          draftLabel.style.display = v.z < 1 && draft.note ? "" : "none";
        } else draftLabel.style.display = "none";
      };

      // MICRO-3DTILES · a tileset in the scene, and its bar
      let layer: TilesLayer | null = null;
      let bar: ReturnType<typeof tilesBar> | null = null;
      let frames = 0;
      let frame = 0;
      const tick = () => {
        if (disposed) return;
        frame = requestAnimationFrame(tick);
        controls.update();
        if (layer) {
          layer.update();
          // the status line reads the bytes, which change without an event
          if (++frames % 20 === 0) bar?.refresh();
        }
        renderer.render(scene, camera);
        placeLabels();
      };
      // a CLICK is a press and a release without a drag — a drag orbits
      let down: { x: number; y: number } | null = null;
      const ray = new THREE.Raycaster();
      const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
      const onUp = (e: PointerEvent) => {
        const moved = !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
        down = null;
        const armed = !!bar?.armed();
        if (moved || (!opts.onPick && !opts.onMarker && !armed)) return;
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        // «Più dettaglio qui»: the click is for the tile under it, nothing else
        if (armed && layer) {
          const hit = ray.intersectObject(layer.object, true)[0];
          bar!.picked(hit ? layer.refineAt(hit.object) : "none");
          return;
        }
        // a line is hit within a marker's radius, not the default metre; and
        // while a trace is being drawn every click is a vertex, never a marker
        ray.params.Line = { threshold: markerRadius };
        const hitM = draft || opts.tracing?.() ? undefined : ray.intersectObjects(markerGroup.children, false)[0];
        if (hitM && opts.onMarker) { opts.onMarker(String(hitM.object.userData.markerId)); return; }
        const hit = ray.intersectObject(content, true)[0];
        if (!hit || !opts.onPick) return;
        const round = (v: number) => Math.round(v * 1000) / 1000;
        opts.onPick([round(hit.point.x), round(hit.point.y), round(hit.point.z)],
          String(hit.object?.name || hit.object?.parent?.name || ""));
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      if (opts.onDoubleClick)
        renderer.domElement.addEventListener("dblclick", (e: MouseEvent) => { e.preventDefault(); opts.onDoubleClick!(); });

      // Frame whatever arrived: a study model may be a metre or a hillside,
      // and a fixed camera would show an empty screen for one of the two.
      // RIFINITURE · ONLY when the model opens and on the explicit ⤢.
      const frameBox = (box: any) => {
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const span = Math.max(size.x, size.y, size.z) || 1;
        frameModel = () => {
          controls.target.copy(centre);
          camera.position.copy(centre).add(
            new THREE.Vector3(span * 1.4, span * 0.9, span * 1.6));
          camera.near = span / 100;
          camera.far = span * 100;
          camera.updateProjectionMatrix();
          controls.update();
        };
        frameModel();
        markerRadius = span / 80;
        applyMarkers?.();
        applyDraft?.();
      };
      let shown = false;
      const show = () => {
        if (shown) return;
        shown = true;
        status.remove();
        host.appendChild(renderer.domElement);
        host.appendChild(labels);
        host.dataset.ready = "1";
        // the probes' seam: where the camera is (position, then target)
        (host as unknown as { __v3dCamera?: () => number[] }).__v3dCamera =
          () => [...camera.position.toArray(), ...controls.target.toArray()];
        const hint = document.createElement("div");
        hint.className = "nv-embed-note";
        hint.textContent = t("em3d.dragHint");
        host.appendChild(hint);
        tick();
      };
      // CAMPAGNA (1 ott, difetto 6) · the sentence NAMES the file that did not
      // come: measured, the obj arrived (44,8 MB) and its mtl did not, and the
      // old words said «the asset does not answer» — in Italian, in an English
      // interface. Every loader goes through `manager`, which hears each miss.
      const missed: string[] = [];
      const fileOf = (u: string): string => {
        try {
          const url = new URL(u, location.href);
          const p = url.searchParams.get("path") ?? decodeURIComponent(url.pathname);
          return p.split("/").filter(Boolean).pop() ?? u;
        } catch { return u.split("/").pop() ?? u; }
      };
      const unreachable = () => {
        const which = [...new Set(missed.map(fileOf))];
        fail(which.length
          ? t("em3d.missing", { files: which.join(", "), n: String(which.length) })
          : t("em3d.unreachable"));
      };

      const clearContent = () => {
        layer?.dispose();
        layer = null;
        bar = null;
        content.clear();
      };

      // RISORSA-FILE · every loader asks through ONE manager: the files of a
      // resource of several files are resolved from its `has_file` edges
      const manager = new THREE.LoadingManager();
      if (mo.urlModifier) manager.setURLModifier(mo.urlModifier);
      manager.onError = (u: string) => { missed.push(u); host.dataset.missing = missed.map(fileOf).join("|"); };
      (host as unknown as { __v3dResolved?: () => Array<[string, string]> }).__v3dResolved =
        () => mo.resolved?.() ?? [];

      // ── an OBJ, with the mtl it calls and the textures the mtl calls ──────
      const openObj = async (u: string) => {
        try {
          const text = String(await new THREE.FileLoader(manager).loadAsync(u));
          const base = u.slice(0, u.lastIndexOf("/") + 1);
          const libs = [...text.matchAll(/^mtllib\s+(.+?)\s*$/gm)].map((m) => m[1]);
          const loader = new OBJLoader(manager);
          if (libs.length) {
            const mtl = new MTLLoader(manager);
            mtl.setPath(base);
            const materials = await mtl.loadAsync(libs[0]);
            materials.preload();
            loader.setMaterials(materials);
          }
          const group = loader.parse(text);
          if (disposed) return;
          clearContent();
          content.add(group);
          host.dataset.model = u;
          host.dataset.modelKind = "obj";
          let meshes = 0, textured = 0;
          group.traverse((o: any) => {
            if (!o.isMesh) return;
            meshes++;
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            if (ms.some((m: any) => m?.map)) textured++;
          });
          host.dataset.meshes = String(meshes);
          host.dataset.textured = String(textured);
          if (!framed) { framed = true; frameBox(new THREE.Box3().setFromObject(group)); }
          show();
        } catch {
          unreachable();
        }
      };

      // ── a glb (or one level of a LOD set) ──────────────────────────────────
      let framed = false;
      let glbGen = 0;
      const openGlb = (u: string, onDone?: () => void) => {
        const gen = ++glbGen;
        new GLTFLoader(manager).load(
          u,
          (gltf: any) => {
            if (disposed || gen !== glbGen) return;
            clearContent();
            content.add(gltf.scene);
            host.dataset.model = u;
            if (!framed) { framed = true; frameBox(new THREE.Box3().setFromObject(gltf.scene)); }
            show();
            onDone?.();
          },
          undefined,
          () => { if (gen === glbGen) { if (shown) strip.dataset.error = u; else unreachable(); } },
        );
      };

      // ── a tileset ──────────────────────────────────────────────────────────
      const openTiles = async (u: string) => {
        let T: any;
        try { T = await tilesEngine(); } catch { fail(t("tl.noEngine")); return; }
        if (disposed) return;
        clearContent();
        strip.textContent = "";
        strip.classList.remove("hidden");
        if (!strip.isConnected) host.prepend(strip);
        const l = createTilesLayer(E, T, u, camera, renderer, mo.tiles ?? {});
        layer = l;
        content.add(l.object);
        host.dataset.model = u;
        host.dataset.tileset = "1";
        bar = tilesBar(l, tilesBarTexts());
        strip.appendChild(bar.el);
        // the probes' seam: the tile files loaded now, and the status
        (host as unknown as Record<string, unknown>).__tiles = () => {
          const box = l.contentBox();
          return { files: l.loadedFiles(), status: l.status(),
                   boxOf: (u: string) => { const b = l.boxOf(u); return b ? [...b.min.toArray(), ...b.max.toArray()] : null; },
                   box: box ? [...box.min.toArray(), ...box.max.toArray()] : null,
                   points: (() => { let n = 0; l.object.traverse((o: any) => { if (o.isPoints) n++; }); return n; })() };
        };
        (host as unknown as Record<string, unknown>).__tilesScreenOf = (uri: string) => {
          const c = l.centreOf(uri);
          if (!c) return null;
          const v = c.clone().project(camera);
          const r = renderer.domElement.getBoundingClientRect();
          return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
        };
        let waiting = true;
        l.onChange(() => {
          const st = l.status();
          if (st.failed && !shown) { fail(t("tl.failed", { x: st.failed })); return; }
          // framed on the ROOT'S VOLUME as soon as it is known, before a tile:
          // what the camera does not see, the renderer never asks for
          if (!waiting || !l.rootReady()) return;
          const b = l.bounds();
          if (!b) return;
          waiting = false;
          if (!framed) { framed = true; frameBox(b); }
          show();
        });
        show();         // the canvas at once: the root arrives into it
      };

      // ── the threshold: a big glb is asked about, not loaded ────────────────
      const gate = (u: string, bytes: number | null, points: number | null) => {
        status.className = "nv-embed-note v3d-gate";
        status.textContent = "";
        const lim = mo.limit!;
        const p = document.createElement("p");
        p.textContent = bytes != null && bytes > lim.bytes
          ? t("lod.tooBig", { x: formatBytes(bytes), lim: formatBytes(lim.bytes) })
          : t("lod.tooManyPoints", { x: fmtCount(points ?? 0), lim: fmtCount(lim.points) });
        status.appendChild(p);
        const row = document.createElement("div");
        row.className = "v3d-gate-row";
        if (mo.tileset) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "insp-btn primary";
          b.dataset.gate = "tileset";
          b.textContent = t("lod.openTileset");
          b.addEventListener("click", () => { status.textContent = t("tl.loading"); void openTiles(mo.tileset!); });
          row.appendChild(b);
        }
        const go = document.createElement("button");
        go.type = "button";
        go.className = "insp-btn";
        go.dataset.gate = "load";
        go.textContent = t("lod.loadAnyway");
        go.addEventListener("click", () => { status.className = "nv-embed-note"; status.textContent = "carico il modello…"; openGlb(u); });
        row.appendChild(go);
        status.appendChild(row);
        host.dataset.gated = "1";
      };
      const guardedGlb = async (u: string) => {
        const lim = mo.limit;
        if (!lim) { openGlb(u); return; }
        const known = mo.known ?? {};
        const bytes = known.bytes ?? await headBytes(u);
        const points = known.points ?? null;
        if (disposed) return;
        if ((bytes != null && bytes > lim.bytes) || (points != null && points > lim.points)) gate(u, bytes, points);
        else openGlb(u);
      };

      // ── a LOD set: the highest (the lightest) first, a selector for the rest
      const lodPicker = (set: Array<{ level: number; url: string; bytes: number | null }>, current: number) => {
        strip.textContent = "";
        strip.classList.remove("hidden");
        if (!strip.isConnected) host.prepend(strip);
        const lab = document.createElement("label");
        lab.className = "lod-lbl";
        const sel = document.createElement("select");
        sel.className = "lod-pick";
        sel.title = t("lod.pickTitle");
        for (const v of set) {
          const o = document.createElement("option");
          o.value = String(v.level);
          o.textContent = `LOD ${v.level}${v.bytes != null ? ` · ${formatBytes(v.bytes)}` : ""}`;
          o.selected = v.level === current;
          sel.appendChild(o);
        }
        const note = document.createElement("span");
        note.className = "lod-note";
        note.textContent = t("lod.note", { n: String(set.length) });
        sel.addEventListener("change", () => {
          const v = set.find((x) => String(x.level) === sel.value);
          if (!v) return;
          note.textContent = t("tl.loading");
          host.dataset.lod = sel.value;
          openGlb(v.url, () => { note.textContent = t("lod.note", { n: String(set.length) }); });
        });
        lab.append(sel);
        strip.append(lab, note);
        host.dataset.lod = String(current);
      };

      cleanup = () => {
        cancelAnimationFrame(frame);
        layer?.dispose();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };

      if (isTilesetUrl(url)) { await openTiles(url); return; }
      // RISORSA-FILE · an obj (a file set: obj → mtl → textures)
      if (/\.obj(\?|#|$)/i.test(url)) { await openObj(url); return; }
      const set = mo.lods === false || mo.urlModifier ? [] : await probeLods(url);
      if (disposed) return;
      if (set.length) {
        const top = set[set.length - 1];
        lodPicker(set, top.level);
        // the lightest is never over the threshold by being the lightest: it is
        // guarded all the same, a LOD4 of a hillside can still be huge
        await guardedGlb(top.url);
      } else await guardedGlb(url);
    })();
  });

  return {
    dispose() {
      disposed = true;
      cleanup?.();
    },
    setMarkers(next: Marker3D[]) {
      markers = next;
      applyMarkers?.();
    },
    frame() {
      frameModel?.();
    },
    setDraft(vertices, note) {
      draft = vertices?.length ? { vertices, note: note ?? "" } : null;
      applyDraft?.();
    },
  };
}

const fmtCount = (n: number): string => n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n);

/** The tileset bar's words (i18n), one place for the Doc and the Scena 3D. */
export function tilesBarTexts(): TilesBarTexts {
  return {
    manual: t("tl.manual"), auto: t("tl.auto"), modeTitle: t("tl.modeTitle"),
    more: t("tl.more"), moreTitle: t("tl.moreTitle"), less: t("tl.less"), lessTitle: t("tl.lessTitle"),
    leaf: t("tl.leaf"), noTile: t("tl.noTile"),
    status: (s) => {
      const lv = !s.level ? t("tl.noLevel") : s.level[0] === s.level[1]
        ? t("tl.level", { n: String(s.level[0]) }) : t("tl.levels", { a: String(s.level[0]), b: String(s.level[1]) });
      const parts = [lv, t("tl.loaded", { n: String(s.loaded) }), formatBytes(s.bytes)];
      if (s.busy) parts.push(t("tl.busy"));
      if (s.failed) parts.push(t("tl.failed", { x: s.failed }));
      if (s.missing.length) parts.push(t("tl.missing", { n: String(s.missing.length), x: s.missing.slice(0, 2).join(", ") }));
      return parts.join(" · ");
    },
  };
}

//: The locators this viewer can actually open. A `.glb`/`.gltf` is a model;
//: anything else is somebody else's format and is left to the iframe path.
const GLTF = /\.(gltf|glb)(\?|#|$)/i;

export function isGltf(url: string | null | undefined): boolean {
  return !!url && GLTF.test(String(url));
}
