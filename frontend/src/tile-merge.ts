/**
 * MICRO-ERRORE-GEOMETRICO p.3 · the primitives of ONE tile drawn as one.
 *
 * Metashape writes a tile as a mesh of one primitive per texture page (2.2 on
 * average at Templu Mare's levels 4–5, measured from the 3tz), so a tile costs
 * two or three draw calls where Blender's cost one. The pages of those exports
 * are all alike — KTX2 (Basis), 256 × 256, one level — and a compressed
 * texture is rows of 4×4 blocks written top to bottom: N pages of the same
 * width and format laid one UNDER the other are their data put end to end,
 * no decoding, no canvas, no GPU work. The tile's primitives become one
 * geometry whose `v` is moved into its page's band, `(k + v) / N` (glTF's v
 * runs down the image, as the rows do: `flipY` is false), and one material.
 *
 * Only when nothing changes but the draw calls (else the tile stays as it
 * came): siblings under one parent with the same local matrix; materials alike
 * but for their map (type, colour, side, transparency, alpha test…); maps
 * compressed, the same format, size and number of levels, no transform of
 * their own, sampled on `uv`; heights a multiple of the block's (4) at every
 * level; PVRTC never (its blocks are not in rows); geometries with the same
 * attributes; every `uv` inside [0, 1] (a page that repeats cannot be stacked).
 * What it costs and saves, measured: the MICRO's report.
 */

export interface MergeStats {
  /** tiles that had pages merged */
  tiles: number;
  /** primitives before, and after, in those tiles */
  before: number;
  after: number;
  /** ms spent merging, all tiles */
  ms: number;
}

/** PVRTC (WebGL's IMG formats): its blocks are not in rows */
const PVRTC = new Set([35840, 35841, 35842, 35843]);
const UV_EPS = 1e-4;

const sameMatrix = (a: any, b: any): boolean => {
  const x = a.matrix.elements, y = b.matrix.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(x[i] - y[i]) > 1e-9) return false;
  return true;
};

/** the material's fingerprint, without its map */
const materialKey = (m: any): string => JSON.stringify([m.type, m.side, m.transparent, m.opacity, m.alphaTest, m.vertexColors,
  m.color?.getHex?.() ?? null, m.depthWrite, m.depthTest, m.blending, m.premultipliedAlpha, m.flatShading, m.wireframe,
  m.emissive?.getHex?.() ?? null, m.roughness ?? null, m.metalness ?? null, m.normalMap ? 1 : 0, m.roughnessMap ? 1 : 0,
  m.metalnessMap ? 1 : 0, m.emissiveMap ? 1 : 0, m.aoMap ? 1 : 0, m.alphaMap ? 1 : 0, m.lightMap ? 1 : 0]);

const textureKey = (t: any): string | null => {
  if (!t?.isCompressedTexture || t.isCompressedArrayTexture || t.isCompressedCubeTexture) return null;
  if (PVRTC.has(t.format) || t.channel !== 0) return null;
  if (t.offset.x !== 0 || t.offset.y !== 0 || t.repeat.x !== 1 || t.repeat.y !== 1 || t.rotation !== 0) return null;
  const mips = t.mipmaps as Array<{ data: ArrayBufferView; width: number; height: number }> | undefined;
  if (!mips?.length) return null;
  // block rows: 4 texels for every compressed format the Basis transcoder writes, 1 for RGBA
  const rows = t.format === 1023 /* RGBAFormat */ ? 1 : 4;
  if (mips.some((m) => !m?.data || m.height % rows !== 0)) return null;
  return JSON.stringify([t.format, t.type, t.colorSpace, t.premultiplyAlpha, t.wrapS, t.wrapT, t.magFilter, t.minFilter,
    mips.map((m) => [m.width, m.height, m.data.byteLength, m.data.constructor.name])]);
};

const geometryKey = (g: any): string | null => {
  if (!g?.isBufferGeometry || Object.keys(g.morphAttributes ?? {}).length || g.groups?.length > 1) return null;
  const a = g.attributes;
  if (!a.position || !a.uv) return null;
  return JSON.stringify([!!g.index, Object.keys(a).sort().map((k) => {
    const x = a[k];
    if (x.isInterleavedBufferAttribute) return null;
    return [k, x.itemSize, x.normalized, k === "uv" ? "uv" : x.array.constructor.name];
  })]);
};

/** the uv of `g` as floats in [0, 1] (dequantised when normalised), or null when outside */
const uvFloats = (g: any): Float32Array | null => {
  const a = g.attributes.uv;
  const out = new Float32Array(a.count * 2);
  for (let i = 0; i < a.count; i++) {
    const u = a.getX(i), v = a.getY(i);
    if (!(u >= -UV_EPS && u <= 1 + UV_EPS && v >= -UV_EPS && v <= 1 + UV_EPS)) return null;
    out[2 * i] = u; out[2 * i + 1] = v;
  }
  return out;
};

function concat(arrays: ArrayBufferView[]): ArrayBufferView {
  const C = arrays[0]!.constructor as any;
  const n = arrays.reduce((s, a) => s + (a as any).length, 0);
  const out = new C(n);
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += (a as any).length; }
  return out;
}

/** One stack: the meshes (≥ 2) of one parent, compatible. Returns the mesh that replaces them, or null. */
function stack(THREE: any, meshes: any[]): any | null {
  const n = meshes.length;
  const uvs: Float32Array[] = [];
  for (const m of meshes) {
    const uv = uvFloats(m.geometry);
    if (!uv) return null;
    uvs.push(uv);
  }
  const maps = meshes.map((m) => m.material.map);
  const t0 = maps[0];
  // the texture: each level, the pages one under the other
  const mipmaps = (t0.mipmaps as any[]).map((lv, i) => ({
    data: concat(maps.map((t: any) => t.mipmaps[i].data)), width: lv.width, height: lv.height * n,
  }));
  const tex = new THREE.CompressedTexture(mipmaps, t0.image.width, t0.image.height * n, t0.format, t0.type);
  for (const k of ["wrapS", "wrapT", "magFilter", "minFilter", "anisotropy", "colorSpace", "premultiplyAlpha", "flipY", "generateMipmaps", "name"])
    tex[k] = t0[k];
  tex.needsUpdate = true;
  // the geometry: attributes end to end, v into its page's band
  const g = new THREE.BufferGeometry();
  const geos = meshes.map((m) => m.geometry);
  for (const k of Object.keys(geos[0].attributes)) {
    if (k === "uv") {
      const out = new Float32Array(uvs.reduce((s, u) => s + u.length, 0));
      let o = 0;
      uvs.forEach((u, page) => {
        for (let i = 0; i < u.length; i += 2) { out[o + i] = u[i]!; out[o + i + 1] = (page + u[i + 1]!) / n; }
        o += u.length;
      });
      g.setAttribute("uv", new THREE.BufferAttribute(out, 2));
    } else {
      const a0 = geos[0].attributes[k];
      g.setAttribute(k, new THREE.BufferAttribute(concat(geos.map((x: any) => x.attributes[k].array)), a0.itemSize, a0.normalized));
    }
  }
  if (geos[0].index) {
    const total = geos.reduce((s: number, x: any) => s + x.attributes.position.count, 0);
    const idx = new (total > 65535 ? Uint32Array : Uint16Array)(geos.reduce((s: number, x: any) => s + x.index.count, 0));
    let o = 0, base = 0;
    for (const x of geos) {
      const a = x.index.array;
      for (let i = 0; i < a.length; i++) idx[o + i] = a[i] + base;
      o += a.length; base += x.attributes.position.count;
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const mat = meshes[0].material.clone();
  mat.map = tex;
  const out = new THREE.Mesh(g, mat);
  const m0 = meshes[0];
  out.name = m0.name;
  out.matrix.copy(m0.matrix);
  out.matrix.decompose(out.position, out.quaternion, out.scale);
  out.matrixAutoUpdate = m0.matrixAutoUpdate;
  out.castShadow = m0.castShadow; out.receiveShadow = m0.receiveShadow;
  out.renderOrder = m0.renderOrder;
  out.userData = { ...m0.userData, emMergedPages: n };
  return out;
}

/** The tile's scene, its pages merged where they can be (in place). */
export function mergeTilePages(THREE: any, scene: any, stats: MergeStats): void {
  const t0 = performance.now();
  const parents = new Set<any>();
  scene.traverse((o: any) => { if (o.isMesh && o.parent) parents.add(o.parent); });
  let touched = false;
  for (const parent of parents) {
    const groups = new Map<string, any[]>();
    for (const c of parent.children) {
      if (!c.isMesh || c.isSkinnedMesh || c.isInstancedMesh || c.isBatchedMesh || Array.isArray(c.material) || c.children.length) continue;
      const tk = textureKey(c.material?.map), gk = geometryKey(c.geometry);
      if (!tk || !gk) continue;
      const key = `${materialKey(c.material)}|${tk}|${gk}`;
      const list = groups.get(key);
      if (!list) groups.set(key, [c]);
      else if (sameMatrix(list[0], c)) list.push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const merged = stack(THREE, list);
      if (!merged) continue;
      const at = parent.children.indexOf(list[0]);
      for (const m of list) {
        parent.remove(m);
        m.geometry.dispose();
        m.material.map?.dispose();
        m.material.dispose();
      }
      parent.add(merged);
      // the first one's place among the siblings (the drawing order)
      parent.children.splice(parent.children.indexOf(merged), 1);
      parent.children.splice(Math.max(0, at), 0, merged);
      stats.before += list.length;
      stats.after += 1;
      touched = true;
    }
  }
  if (touched) stats.tiles++;
  stats.ms += performance.now() - t0;
}
