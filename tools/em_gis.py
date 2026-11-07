"""MICRO-GIS-BASE (6 Nov 2026) · the GIS layers of the graph, for the Space.

What a scene needs of a GIS layer that s3Dgraphy does not draw for it: the
features in the SCENE's CRS (reprojected, or the same numbers when the two
codes name one grid — 31700 ↔ 3844, never a datum shift between them), and
the ground of the landscape as a grid of heights in the scene's CRS with the
texture coordinates of the image draped on it.

The readers are s3Dgraphy's (``s3dgraphy.gis``: shapefile, GeoPackage,
GeoJSON, GeoTIFF without GDAL); the pixels of a large DEM come through Pillow
(``em_geotiles``), the reprojection through pyproj — both already in the
bridge. GDAL/rasterio/fiona are NOT used: absent in this bridge (measured
6 Nov 2026), and +10.5 MB measured on 23 Oct for rasterio in the frozen
sidecar.
"""

from __future__ import annotations

import math
import os
from typing import Any, Dict, List, Optional, Sequence, Tuple

#: the most a scene asks in one answer
MAX_VERTICES = 400_000
MAX_FEATURES = 50_000
MAX_CELLS = 256          # a surface's grid: at most this many cells a side


def _norm(crs) -> Optional[str]:
    from s3dgraphy.geometry.frame import normalise_crs
    return normalise_crs(crs)


def transformer(src, dst):
    """A function ``(xs, ys) → (xs, ys)`` from ``src`` to ``dst``: the
    identity when the codes name ONE grid (s3Dgraphy's ``same_grid``), else
    pyproj. ``(fn, how)`` with ``how`` «same» | «same grid» | «reprojected»."""
    from s3dgraphy.gis import same_grid
    a, b = _norm(src), _norm(dst)
    if not a or not b:
        raise ValueError("a CRS is missing: the layer or the scene declares none")
    if a == b:
        return (lambda xs, ys: (list(xs), list(ys))), "same"
    if same_grid(a, b):
        return (lambda xs, ys: (list(xs), list(ys))), "same grid"
    from pyproj import Transformer
    t = Transformer.from_crs(a, b, always_xy=True)

    def fn(xs, ys):
        X, Y = t.transform(list(xs), list(ys))
        return list(X), list(Y)
    return fn, "reprojected"


def features_in(path: str, scene_crs, *, layer: Optional[str] = None, z_field: Optional[str] = None,
                feature_key: Optional[str] = None, crs: Optional[str] = None) -> Dict[str, Any]:
    """The features of a vector layer in the scene's CRS: ``{ok, crs, how,
    count, vertices, truncated, features: [{type, label, coords}]}`` —
    ``coords`` ``[X, Y, Z|None]`` for a point, a list of parts otherwise."""
    from s3dgraphy.gis import read_features
    got = read_features(path, layer=layer, z_field=z_field)
    src = _norm(crs) or got["crs"]
    fn, how = transformer(src, scene_crs)
    out: List[Dict[str, Any]] = []
    nv = 0
    truncated = False
    for f in got["features"]:
        if len(out) >= MAX_FEATURES or nv >= MAX_VERTICES:
            truncated = True
            break
        c = f["coords"]
        label = None
        if feature_key:
            v = (f.get("attributes") or {}).get(feature_key)
            label = None if v is None else str(v)
        if c and isinstance(c[0], (int, float)):
            X, Y = fn([c[0]], [c[1]])
            out.append({"type": "Point", "label": label,
                        "coords": [X[0], Y[0], c[2] if len(c) > 2 else None]})
            nv += 1
            continue
        parts = []
        for part in c:
            if not part:
                continue
            X, Y = fn([p[0] for p in part], [p[1] for p in part])
            parts.append([[X[i], Y[i], part[i][2] if len(part[i]) > 2 else None] for i in range(len(part))])
            nv += len(part)
        kind = f.get("type") or got.get("geometry_type") or "LineString"
        out.append({"type": kind.replace("Multi", "") if kind != "MultiPoint" else "MultiPoint",
                    "label": label, "coords": parts})
    return {"ok": True, "crs": _norm(scene_crs), "layer_crs": src, "how": how, "count": len(out),
            "vertices": nv, "truncated": truncated, "features": out}


# ── the ground: a DEM's heights on a grid of the scene ──────────────────────

def _dem_grid(path: str, max_side: int = 1024) -> Dict[str, Any]:
    """The DEM's pixels (≤ ``max_side`` a side, resampled NEAREST — a height is
    not mixed with a nodata) with the affine of THOSE pixels."""
    from s3dgraphy.gis import read_geotiff_info
    info = read_geotiff_info(path)
    w, h, aff = info["width"], info["height"], info["affine"]
    if not aff:
        raise ValueError("the DEM has no georeference (no GeoTIFF tags, no world file)")
    try:
        import em_geotiles as G
        from PIL import Image
        im = G._dem_float(G._open_band(path))
        k = max(1.0, max(w, h) / float(max_side))
        if k > 1.0:
            im = im.resize((max(2, int(round(w / k))), max(2, int(round(h / k)))), Image.NEAREST)
        W, H = im.size
        data = list(im.getdata())
        rows = [data[r * W:(r + 1) * W] for r in range(H)]
        sx, sy = w / float(W), h / float(H)
        x0, a, b, y0, d, e = aff
        aff2 = (x0, a * sx, b * sy, y0, d * sx, e * sy)
        return {"rows": rows, "affine": aff2, "width": W, "height": H, "nodata": info["nodata"],
                "crs": info["crs"], "reader": "pillow"}
    except ImportError:
        from s3dgraphy.gis import read_band
        band = read_band(path)
        return {"rows": band["rows"], "affine": aff, "width": w, "height": h,
                "nodata": info["nodata"], "crs": info["crs"], "reader": "s3dgraphy"}


def _sample(grid: Dict[str, Any], X: float, Y: float) -> Optional[float]:
    from s3dgraphy.gis.geotiff import crs_to_pixel
    c, r = crs_to_pixel(grid["affine"], X, Y)
    c -= 0.5
    r -= 0.5            # the pixel's value stands at its centre
    W, H = grid["width"], grid["height"]
    if c < -0.5 or r < -0.5 or c > W - 0.5 or r > H - 0.5:
        return None
    c = min(max(c, 0.0), W - 1.0)
    r = min(max(r, 0.0), H - 1.0)
    c0, r0 = int(math.floor(c)), int(math.floor(r))
    c1, r1 = min(c0 + 1, W - 1), min(r0 + 1, H - 1)
    fc, fr = c - c0, r - r0
    rows, nd = grid["rows"], grid["nodata"]
    vals = [rows[r0][c0], rows[r0][c1], rows[r1][c0], rows[r1][c1]]
    if any(v is None or (nd is not None and v == nd) or not math.isfinite(v) for v in vals):
        # a corner on a hole: the nearest valid one, or nothing
        near = rows[int(round(r))][int(round(c))]
        return None if near is None or (nd is not None and near == nd) or not math.isfinite(near) else float(near)
    top = vals[0] * (1 - fc) + vals[1] * fc
    bot = vals[2] * (1 - fc) + vals[3] * fc
    return float(top * (1 - fr) + bot * fr)


def surface_grid(dem_path: str, scene_crs, *, image_path: Optional[str] = None,
                 step: Optional[float] = None, max_cells: int = MAX_CELLS,
                 dem_crs: Optional[str] = None, image_crs: Optional[str] = None) -> Dict[str, Any]:
    """The ground of the landscape for a scene: a regular grid in the SCENE's
    CRS over the DEM's extent, each node's height sampled from the DEM
    (bilinear; None on a hole), and — with an image — each node's texture
    coordinate in the image (u right, v up, as three's TextureLoader flips).

    ``{ok, crs, how, x0, y0, step, nx, ny, heights, uv, z_range, dem_crs,
    image_crs, reader}``; ``heights`` row-major from the NORTH row (y0 is the
    north edge) to the south one, ``nx·ny`` values."""
    from s3dgraphy.gis import read_geotiff_info
    grid = _dem_grid(dem_path)
    dcrs = _norm(dem_crs) or grid["crs"]
    to_scene, how = transformer(dcrs, scene_crs)
    to_dem, _ = transformer(scene_crs, dcrs)
    from s3dgraphy.gis.geotiff import pixel_to_crs
    W, H = grid["width"], grid["height"]
    ring = []
    for i in range(11):
        f = i / 10.0
        ring += [(f * W, 0), (W, f * H), ((1 - f) * W, H), (0, (1 - f) * H)]
    pts = [pixel_to_crs(grid["affine"], c, r) for c, r in ring]
    sx, sy = to_scene([p[0] for p in pts], [p[1] for p in pts])
    minx, maxx, miny, maxy = min(sx), max(sx), min(sy), max(sy)
    px = math.hypot(grid["affine"][1], grid["affine"][4])
    span = max(maxx - minx, maxy - miny)
    st = float(step) if step and step > 0 else max(px, span / float(max_cells))
    st = max(st, span / float(max_cells))
    nx = max(2, int(math.floor((maxx - minx) / st)) + 1)
    ny = max(2, int(math.floor((maxy - miny) / st)) + 1)
    xs, ys = [], []
    for j in range(ny):
        y = maxy - j * st
        for i in range(nx):
            xs.append(minx + i * st)
            ys.append(y)
    dx, dy = to_dem(xs, ys)
    heights = [_sample(grid, dx[k], dy[k]) for k in range(len(xs))]
    hv = [h for h in heights if h is not None]
    uv = None
    icrs = None
    if image_path:
        g = read_geotiff_info(image_path)
        icrs = _norm(image_crs) or g["crs"]
        to_img, _ = transformer(scene_crs, icrs)
        from s3dgraphy.gis.geotiff import crs_to_pixel
        ix, iy = to_img(xs, ys)
        uv = []
        for k in range(len(xs)):
            c, r = crs_to_pixel(g["affine"], ix[k], iy[k])
            uv += [c / float(g["width"]), 1.0 - r / float(g["height"])]
    return {"ok": True, "crs": _norm(scene_crs), "how": how, "x0": minx, "y0": maxy, "step": st,
            "nx": nx, "ny": ny, "heights": heights, "uv": uv,
            "z_range": [min(hv), max(hv)] if hv else None, "dem_crs": dcrs, "image_crs": icrs,
            "reader": grid["reader"]}


def contours_beside(dem_path: str, interval: float) -> str:
    """The contours' file beside the DEM, a name never taken: ``<dem>_contours_
    <interval>m.geojson``, then ``-2``, ``-3``… (never overwritten)."""
    stem = os.path.splitext(dem_path)[0]
    iv = f"{interval:g}".replace(".", "_")
    base = f"{stem}_contours_{iv}m"
    p = base + ".geojson"
    n = 2
    while os.path.exists(p) or os.path.exists(p + ".stamp.json"):
        p = f"{base}-{n}.geojson"
        n += 1
    return p


def dem_rows(dem_path: str, max_side: int = 2048) -> Tuple[List[List[float]], Sequence[float], Optional[float], Optional[str]]:
    """The DEM's pixels for the contours (≤ ``max_side`` a side): rows, the
    affine of those pixels, nodata, CRS."""
    g = _dem_grid(dem_path, max_side=max_side)
    return g["rows"], g["affine"], g["nodata"], g["crs"]


# ── a tileset in TRUE ECEF, in the study's frame (MICRO-RIFINITURE p.7) ──────

#: the geoid the heights of a study are read on when the tileset's are
#: ellipsoidal: EGM2008 (EPSG:3855). Romania's Black Sea heights (Constanța,
#: EPSG:5781) have no grid in PROJ's database — a «ballpark» operation that
#: changes nothing — and the quasi-geoid of Romania stays within decimetres of
#: EGM2008: the difference is said in the answer, never hidden
GEOID_CRS = "EPSG:3855"
#: farther than this from the study's origin, an «Earth» root is not taken for
#: a true ECEF one (a file of shifted coordinates written as ECEF lands on the
#: equator: that is the frame's case, `relocate_transform`, not this one)
NEAR_STUDY_M = 50_000.0


def _sym_eigen(m: List[List[float]]) -> Tuple[List[float], List[List[float]]]:
    """Eigenvalues and eigenvectors (as COLUMNS of ``V``) of a symmetric 3×3,
    by Jacobi's rotations: a handful of sweeps to the last digit."""
    a = [row[:] for row in m]
    v = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    for _ in range(64):
        off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2
        if off <= 1e-300 or off <= (1e-32 * sum(a[i][i] ** 2 for i in range(3))):
            break
        for p, q in ((0, 1), (0, 2), (1, 2)):
            if a[p][q] == 0.0:
                continue
            th = (a[q][q] - a[p][p]) / (2.0 * a[p][q])
            t = (1.0 if th >= 0 else -1.0) / (abs(th) + math.sqrt(th * th + 1.0))
            c = 1.0 / math.sqrt(t * t + 1.0)
            s = t * c
            for k in range(3):                      # A ← A·J
                akp, akq = a[k][p], a[k][q]
                a[k][p], a[k][q] = c * akp - s * akq, s * akp + c * akq
            for k in range(3):                      # A ← Jᵀ·A
                apk, aqk = a[p][k], a[q][k]
                a[p][k], a[q][k] = c * apk - s * aqk, s * apk + c * aqk
            for k in range(3):                      # V ← V·J
                vkp, vkq = v[k][p], v[k][q]
                v[k][p], v[k][q] = c * vkp - s * vkq, s * vkp + c * vkq
    return [a[0][0], a[1][1], a[2][2]], v


def fit_affine(src: Sequence[Sequence[float]], dst: Sequence[Sequence[float]]) -> List[List[float]]:
    """The affine 3×4 (rows) that maps ``src`` onto ``dst`` in least squares —
    s3Dgraphy's ``geometry.frame._fit_affine`` WITHOUT numpy.

    MICRO-ANTEPRIMA-AGGANCIATA (7 Nov 2026) · the frozen sidecar is built with
    ``--exclude-module numpy`` (build-bridge.sh), and that fit was the ONLY numpy
    of the bridge: every ``/geo/tileset-frame`` of the app answered 501, and every
    tileset in true ECEF stayed centred on its own volume. The same solution as
    ``numpy.linalg.lstsq``: centred on the means (the ECEF millions do not eat the
    digits), the normal equations ``SᵀS·A = SᵀD`` solved through the
    pseudo-inverse of ``SᵀS`` — so a flat volume (an axis of zero length) gets the
    minimum-norm answer numpy gives, not a division by zero."""
    n = len(src)
    if n == 0 or n != len(dst):
        raise ValueError("fit_affine: as many points on both sides, at least one")
    cs = [sum(float(p[k]) for p in src) / n for k in range(3)]
    cd = [sum(float(p[k]) for p in dst) / n for k in range(3)]
    S = [[float(p[k]) - cs[k] for k in range(3)] for p in src]
    D = [[float(p[k]) - cd[k] for k in range(3)] for p in dst]
    M = [[sum(r[i] * r[j] for r in S) for j in range(3)] for i in range(3)]
    B = [[sum(S[r][i] * D[r][j] for r in range(n)) for j in range(3)] for i in range(3)]
    w, V = _sym_eigen(M)
    # numpy's rcond: singular values of S under eps·max(n, 3)·σmax are zero
    cut = (2.220446049250313e-16 * max(n, 3)) ** 2 * max(max(w), 0.0)
    inv = [1.0 / x if x > cut and x > 0 else 0.0 for x in w]
    P = [[sum(V[i][k] * inv[k] * V[j][k] for k in range(3)) for j in range(3)] for i in range(3)]
    A = [[sum(P[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]   # (S)·A ≈ D
    L = [[A[c][r] for c in range(3)] for r in range(3)]                                     # Aᵀ
    t = [cd[r] - sum(L[r][k] * cs[k] for k in range(3)) for r in range(3)]
    return [[L[r][0], L[r][1], L[r][2], t[r]] for r in range(3)]


def lend_fit() -> None:
    """s3Dgraphy's ``relocate_transform`` (a file of shifted coordinates) calls
    ``frame._fit_affine``, which imports numpy: the frozen bridge has none. Until
    s3Dgraphy carries a fit of its own without numpy, the bridge lends it this one
    — in the dev bridge too, so the two compute the same numbers."""
    from s3dgraphy.geometry import frame as F
    if getattr(F, "_fit_affine", None) is not fit_affine:
        F._fit_affine = fit_affine


def _best_op(src, dst):
    """The first operation of PROJ's list that is AVAILABLE and not a
    «ballpark» (PROJ falls back on one without a word when a grid is missing:
    measured 6 Nov 2026, WGS 84 → Stereo70 + EGM2008 without the grid moved
    the point 123 m and kept the ellipsoidal height). ``None`` if there is none."""
    from pyproj.transformer import TransformerGroup
    tg = TransformerGroup(src, dst, always_xy=True)
    for t in tg.transformers:
        if "ballpark" not in (t.description or "").lower():
            return t
    return None


def _geoid_op():
    """WGS 84 (lon, lat, h ellipsoidal) → the same with the EGM2008 height; the
    grid comes through PROJ's network (its own cache) when it is not on the disk.
    ``(op, how)``; ``(None, why)`` when there is no way."""
    import pyproj
    op = _best_op("EPSG:4979", f"EPSG:4326+{GEOID_CRS.split(':')[1]}")
    if op is not None:
        return op, "grid on disk"
    try:
        if not pyproj.network.is_network_enabled():
            pyproj.network.set_network_enabled(True)
        op = _best_op("EPSG:4979", f"EPSG:4326+{GEOID_CRS.split(':')[1]}")
    except Exception as exc:  # noqa: BLE001
        return None, f"PROJ network: {exc}"
    return (op, "grid through PROJ's network (cdn.proj.org, cached)") if op is not None else (None, "no EGM2008 grid, offline")


def relocate_true_ecef(transform: Sequence[float], bounding_volume: Dict[str, Any],
                       target: Dict[str, Any], *, check: int = 5) -> Dict[str, Any]:
    """The transform that puts a tileset whose ``root.transform`` is a TRUE ECEF
    one (WGS 84, ellipsoidal heights: RealityScan, Metashape's Cesium export)
    into the study's frame: its CRS minus its shift, ORTHOMETRIC heights.

    For each point of the root's volume: ECEF → (lon, lat, h) on WGS 84 → the
    study's CRS by PROJ's best operation with a DATUM SHIFT (for Stereo70:
    Pulkovo 1942(58) → WGS 84, a Helmert of 7 parameters, never «the same
    numbers») → the height minus the geoid's undulation (EGM2008) → minus the
    shift. The affine fit and its residual as `relocate_transform`'s.
    """
    from pyproj import Transformer
    from s3dgraphy.geometry.frame import _apply, _column_major, _mat, volume_points
    if not transform or len(transform) != 16:
        return {"ok": False, "error": "no-transform"}
    if math.dist((0, 0, 0), transform[12:15]) < 1e6:
        return {"ok": False, "error": "local", "why": "the root is not on the Earth: drawn as written"}
    crs = _norm((target or {}).get("crs"))
    if not crs:
        return {"ok": False, "error": "the study declares no CRS"}
    tsh = [float(v) for v in (list((target or {}).get("shift") or []) + [0, 0, 0])[:3]]
    pts = volume_points(bounding_volume, 3)
    chk = volume_points(bounding_volume, check) if check > 1 else []
    if not pts:
        return {"ok": False, "error": "no points to fit on (a region volume is already geographic)"}
    M = _mat(transform)
    to_geo = Transformer.from_crs("EPSG:4978", "EPSG:4979", always_xy=True)
    hz = _best_op("EPSG:4326", crs)
    if hz is None:
        return {"ok": False, "error": f"PROJ has no operation WGS 84 → {crs} but a ballpark one"}
    geoid, geoid_how = _geoid_op()
    # the study's origin, back on the Earth: the guard against a fake ECEF
    back = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    olon, olat = back.transform(tsh[0], tsh[1])

    def true_of(p):
        x, y, z = _apply(M, p)
        lon, lat, h = to_geo.transform(x, y, z)
        e, n = hz.transform(lon, lat)
        H = geoid.transform(lon, lat, h)[2] if geoid is not None else h
        return (e - tsh[0], n - tsh[1], H - tsh[2]), (lon, lat, h, h - H)

    centre = [sum(p[k] for p in pts) / len(pts) for k in range(3)]
    q, (clon, clat, ch, und) = true_of(centre)
    far = _haversine(olon, olat, clon, clat)
    if far > NEAR_STUDY_M:
        return {"ok": False, "error": "far", "why": f"the root is {far / 1000:.1f} km from the study's origin: not taken for a true ECEF frame",
                "written": {"lat": clat, "lon": clon, "h": ch}}
    dst = [true_of(p)[0] for p in pts]
    fit = fit_affine(pts, dst)
    errs = [math.dist(true_of(p)[0], _apply([*fit, [0, 0, 0, 1]], p)) for p in (chk or pts)]
    return {"ok": True, "transform": _column_major(fit), "target": {"crs": crs, "shift": tsh},
            "residual_rms_m": math.sqrt(sum(e * e for e in errs) / len(errs)), "residual_max_m": max(errs),
            "points": len(chk or pts), "written": {"lat": clat, "lon": clon, "h": ch}, "true": {"x": q[0], "y": q[1], "z": q[2]},
            "datum": {"operation": hz.description, "accuracy_m": hz.accuracy if hz.accuracy and hz.accuracy > 0 else None},
            "geoid": {"crs": GEOID_CRS, "undulation_m": und if geoid is not None else None, "how": geoid_how},
            "from_study_m": far}


def _haversine(lon1, lat1, lon2, lat2) -> float:
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


# ── (experimental) the site's footprint ──────────────────────────────────────

def _proxy_paths(graph, unit_ids: List[str], doc_dir: str, inside) -> Tuple[List[str], List[str]]:
    """The .glb of each unit's proxy (unit → has_property geometry →
    has_semantic_shape → has_linked_resource) on this disk, and the geometry
    property ids (the sources of the footprint)."""
    paths: List[str] = []
    props: List[str] = []
    out_edges: Dict[str, List[Any]] = {}
    for e in graph.edges:
        out_edges.setdefault(e.edge_source, []).append(e)
    for uid in unit_ids:
        for e in out_edges.get(uid, []):
            if e.edge_type != "has_property":
                continue
            p = graph.find_node_by_id(e.edge_target)
            d = getattr(p, "data", {}) or {}
            if (d.get("property_type") or getattr(p, "name", "")) != "geometry":
                continue
            for e2 in out_edges.get(p.node_id, []):
                if e2.edge_type != "has_semantic_shape":
                    continue
                for e3 in out_edges.get(e2.edge_target, []):
                    if e3.edge_type != "has_linked_resource":
                        continue
                    r = graph.find_node_by_id(e3.edge_target)
                    url = (getattr(r, "data", {}) or {}).get("url") or getattr(r, "url", "")
                    if not url:
                        continue
                    full = inside(url if os.path.isabs(url) else os.path.join(doc_dir, url))
                    if full and os.path.exists(full):
                        paths.append(full)
                        if p.node_id not in props:
                            props.append(p.node_id)
    return paths, props


def site_footprint(graph, site_id: str, units: Sequence[str], doc_dir: str, *, inside=lambda p: p,
                   extractor_name: str = "D.footprint") -> Dict[str, Any]:
    """The footprint of the site from the proxies of ``units`` (names or ids):
    the convex hull in plan of their vertices, each vertex at the lowest height
    measured there (s3Dgraphy ``footprint_from_glbs``), written by
    ``set_footprint`` with its chain to the geometry properties."""
    from s3dgraphy.gis import footprint_from_glbs, set_footprint
    names = [str(u) for u in units]
    by_name = {n.name: n.node_id for n in graph.nodes}
    unit_ids = [by_name.get(u, u) for u in names]
    paths, props = _proxy_paths(graph, unit_ids, doc_dir, inside)
    if not paths:
        raise ValueError("no proxy file found for these units beside the em.json")
    geo = next((n for n in graph.nodes if n.node_type == "geo_position"), None)
    gd = (getattr(geo, "data", {}) or {}) if geo is not None else {}
    crs = f"EPSG:{gd.get('epsg')}" if gd.get("epsg") else "local"
    shift = (float(gd.get("shift_x") or 0), float(gd.get("shift_y") or 0), float(gd.get("shift_z") or 0))
    fp = footprint_from_glbs(paths, shift=shift if crs != "local" else (0, 0, 0),
                             rotation=float(gd.get("rotation") or 0) if crs != "local" else 0)
    note = ("Convex hull in plan of the proxies of " + ", ".join(names)
            + f" ({len(fp['ring'])} vertices; each keeps the lowest height measured at it)")
    out = set_footprint(graph, site_id, [[fp["ring"]]], crs, sources=props,
                        extractor_name=extractor_name, note=note)
    out.update({"bbox": fp["bbox"], "z_range": fp["z_range"], "sources": fp["sources"], "crs": crs,
                "vertices": len(fp["ring"])})
    return out
