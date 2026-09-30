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
          const [THREE, loaderMod, controlsMod, convexMod] = await Promise.all([
            import("three"),
            import("three/examples/jsm/loaders/GLTFLoader.js"),
            import("three/examples/jsm/controls/OrbitControls.js"),
            import("three/examples/jsm/geometries/ConvexGeometry.js"),
          ]);
          return { THREE, GLTFLoader: loaderMod.GLTFLoader,
                   OrbitControls: controlsMod.OrbitControls, ConvexGeometry: convexMod.ConvexGeometry };
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
}

/**
 * Mount an orbitable view of one glTF into `host`.
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

  const status = document.createElement("div");
  status.className = "nv-embed-note";
  status.textContent = "modello 3D — si carica quando lo guardi";
  host.appendChild(status);

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
      let THREE: any, GLTFLoader: any, OrbitControls: any;
      try {
        ({ THREE, GLTFLoader, OrbitControls } = await engine());
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
      let frame = 0;
      const tick = () => {
        if (disposed) return;
        frame = requestAnimationFrame(tick);
        controls.update();
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
        if (moved || (!opts.onPick && !opts.onMarker)) return;
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        // a line is hit within a marker's radius, not the default metre; and
        // while a trace is being drawn every click is a vertex, never a marker
        ray.params.Line = { threshold: markerRadius };
        const hitM = draft || opts.tracing?.() ? undefined : ray.intersectObjects(markerGroup.children, false)[0];
        if (hitM && opts.onMarker) { opts.onMarker(String(hitM.object.userData.markerId)); return; }
        const targets = scene.children.filter((o: any) => o !== markerGroup && o !== draftGroup);
        const hit = ray.intersectObjects(targets, true)[0];
        if (!hit || !opts.onPick) return;
        const round = (v: number) => Math.round(v * 1000) / 1000;
        opts.onPick([round(hit.point.x), round(hit.point.y), round(hit.point.z)],
          String(hit.object?.name || hit.object?.parent?.name || ""));
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      if (opts.onDoubleClick)
        renderer.domElement.addEventListener("dblclick", (e: MouseEvent) => { e.preventDefault(); opts.onDoubleClick!(); });

      new GLTFLoader().load(
        url,
        (gltf: any) => {
          if (disposed) return;
          scene.add(gltf.scene);
          // Frame whatever arrived: a study model may be a metre or a hillside,
          // and a fixed camera would show an empty screen for one of the two.
          // RIFINITURE · ONLY here (the model opens) and on the explicit ⤢.
          const box = new THREE.Box3().setFromObject(gltf.scene);
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
        },
        undefined,
        () => fail("il modello non è raggiungibile: "
                   + "il riferimento è valido, l'asset non risponde"),
      );

      cleanup = () => {
        cancelAnimationFrame(frame);
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
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

//: The locators this viewer can actually open. A `.glb`/`.gltf` is a model;
//: anything else is somebody else's format and is left to the iframe path.
const GLTF = /\.(gltf|glb)(\?|#|$)/i;

export function isGltf(url: string | null | undefined): boolean {
  return !!url && GLTF.test(String(url));
}
