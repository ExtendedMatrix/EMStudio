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


def fit_affine(src: Sequence[Sequence[float]], dst: Sequence[Sequence[float]]) -> List[List[float]]:
    """The affine 3×4 (rows) that maps ``src`` onto ``dst`` in least squares:
    s3Dgraphy's ``geometry.frame._fit_affine``, which carries no numpy.

    MICRO-ANTEPRIMA-AGGANCIATA (7 Nov 2026) had a copy here, lent to s3Dgraphy
    (``lend_fit``) while its fit imported numpy — the frozen sidecar has none.
    MICRO-FIT-AFFINE-SENZA-NUMPY (11 Nov 2026) moved the fit into s3Dgraphy,
    through the SVD of S itself (the copy's normal equations let the rounding of
    aligned points pass numpy's cut): both bridges read the branch's s3Dgraphy
    (dev.sh ``--s3dgraphy``, build-bridge.sh ``--paths``), so the copy and the
    loan are gone."""
    from s3dgraphy.geometry.frame import _fit_affine
    return _fit_affine(src, dst)


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


def _geoid_op(at: Optional[Tuple[float, float]] = None):
    """WGS 84 (lon, lat, h ellipsoidal) → the same with the EGM2008 height; the
    grid comes through PROJ's network (its own cache) when it is not on the disk.
    ``(op, how)``; ``(None, why)`` when there is no way.

    MICRO-DATUM-DICHIARATO p.3 · an operation PROJ calls available can still
    answer ±Infinity: the grid absent, only PROJ's network cache (or the network
    unreachable) — measured 8 Nov 2026, z NaN and the tileset drawn at the
    scene's centre. The operation is TRIED at ``at`` (lon, lat): a result that is
    not finite is a grid that is not there — then PROJ's network, else none."""
    import pyproj
    target = f"EPSG:4326+{GEOID_CRS.split(':')[1]}"

    def usable(op):
        if op is None:
            return False
        if at is None:
            return True
        try:
            r = op.transform(float(at[0]), float(at[1]), 0.0)
        except Exception:  # noqa: BLE001 — a grid PROJ cannot open
            return False
        return all(math.isfinite(v) for v in r)

    op = _best_op("EPSG:4979", target)
    if usable(op):
        return op, "grid on disk"
    try:
        if not pyproj.network.is_network_enabled():
            pyproj.network.set_network_enabled(True)
        op = _best_op("EPSG:4979", target)
    except Exception as exc:  # noqa: BLE001
        return None, f"no EGM2008 grid on the disk, and PROJ's network: {exc}"
    if usable(op):
        return op, "grid through PROJ's network (cdn.proj.org, cached)"
    return None, "no EGM2008 grid on the disk, and PROJ's network does not give it (offline?)"


# ── MICRO-DATUM-DICHIARATO (9 Nov 2026) · the datum operation, declared ──────

class DatumOp:
    """One operation WGS 84 (lon, lat) ↔ the study's CRS (E, N), and what the
    answer says of it: ``operation`` (PROJ's words), ``accuracy_m``,
    ``declared`` (the GeoPositionNode's ``datum_operation`` was used), ``code``,
    ``why``."""

    def __init__(self, fwd, inv, operation: str, accuracy, *, declared: bool, code: Optional[str], why: str):
        self._fwd, self._inv = fwd, inv
        self.description = operation
        self.accuracy = accuracy
        self.declared, self.code, self.why = declared, code, why

    def transform(self, lon, lat):
        return self._fwd(lon, lat)

    def inverse(self, e, n):
        return self._inv(e, n)

    def words(self) -> Dict[str, Any]:
        acc = self.accuracy if self.accuracy is not None and self.accuracy > 0 else None
        return {"operation": self.description, "accuracy_m": acc, "declared": self.declared,
                "code": self.code, "why": self.why}


def normalise_datum_operation(value) -> Optional[str]:
    """``"EPSG:<code>"`` | None (not declared); ``ValueError`` for another form
    (the same rule as s3Dgraphy's ``api.normalise_datum_operation``, here so
    the frozen bridge does not need that s3Dgraphy)."""
    import re
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        raise ValueError(f"datum_operation {value!r} is not «EPSG:<code>»")
    if isinstance(value, int):
        code = value
    else:
        m = re.fullmatch(r"\s*(?:EPSG\s*:{1,2}\s*)?(\d+)\s*", str(value), re.IGNORECASE)
        if not m:
            raise ValueError(f"datum_operation {value!r} is not «EPSG:<code>»")
        code = int(m.group(1))
    if code <= 0:
        raise ValueError(f"datum_operation {value!r} is not «EPSG:<code>»")
    return f"EPSG:{code}"


def normalise_datum_operation_or_none(value) -> Optional[str]:
    """``normalise_datum_operation``, a malformed value read as declared
    (``"?"``): something was written, and it is not to be ignored"""
    try:
        return normalise_datum_operation(value)
    except ValueError:
        return "?"


def _wrap(t, **kw) -> DatumOp:
    from pyproj.enums import TransformDirection
    return DatumOp(lambda x, y: t.transform(x, y),
                   lambda x, y: t.transform(x, y, direction=TransformDirection.INVERSE),
                   t.description, t.accuracy, **kw)


def _step_codes(t) -> List[str]:
    """the EPSG codes of the steps of a PROJ operation (an «Inverse of» step
    counts as its operation)"""
    out = []
    try:
        j = t.to_json_dict()
    except Exception:  # noqa: BLE001
        return out
    for st in (j.get("steps") or [j]):
        i = st.get("id") or {}
        if str(i.get("authority", "")).upper() in ("EPSG", "INVERSE(EPSG)") and i.get("code") is not None:
            out.append(f"EPSG:{int(i['code'])}")
    return out


def datum_op(crs, declared=None) -> Tuple[Optional[DatumOp], Optional[str]]:
    """The operation WGS 84 ↔ ``crs``: the DECLARED one (the GeoPositionNode's
    ``datum_operation``) when it is given and PROJ knows it; otherwise PROJ's
    first non-«ballpark» one, as before. ``(op, None)`` or ``(None, why)``.

    A declared operation is never replaced in silence: unknown to PROJ, or not
    joining the study's datum to WGS 84, it is a refusal said in words. It is
    taken from PROJ's own list of candidates when it is there (PROJ's whole
    pipeline); else built from the EPSG operation (``CoordinateOperation``):
    the inverse of the operation (the study's datum → WGS 84) and the
    projection of the study's CRS, a conversion with no datum in it.
    """
    from pyproj import CRS, Transformer
    from pyproj.enums import TransformDirection
    from pyproj.transformer import TransformerGroup
    crs = _norm(crs)
    try:
        code = normalise_datum_operation(declared)
    except ValueError as exc:
        return None, str(exc)
    if code is None:
        t = _best_op("EPSG:4326", crs)
        if t is None:
            return None, f"PROJ has no operation WGS 84 → {crs} but a ballpark one"
        return _wrap(t, declared=False, code=None, why="none declared: PROJ's first operation that is not a ballpark"), None
    from pyproj.crs import CoordinateOperation
    try:
        op = CoordinateOperation.from_authority("EPSG", code.split(":", 1)[1])
    except Exception:  # noqa: BLE001
        return None, f"the declared datum operation {code} is unknown to PROJ: refused, never replaced by another"
    if op.type_name not in ("Transformation", "Concatenated Operation"):
        return None, f"the declared datum operation {code} ({op.name}) is a {op.type_name.lower()}, not a datum transformation: refused"
    for t in TransformerGroup("EPSG:4326", crs, always_xy=True).transformers:
        if code in _step_codes(t):
            return _wrap(t, declared=True, code=code, why=f"declared on the GeoPositionNode ({code}), in PROJ's own list"), None
    # not among PROJ's candidates for this CRS: built from the EPSG operation
    study = CRS.from_user_input(crs)
    geod = study.geodetic_crs
    wgs = CRS.from_epsg(4326)
    j = op.to_json_dict()
    try:
        src, dst = CRS.from_json_dict(j["source_crs"]), CRS.from_json_dict(j["target_crs"])
    except Exception:  # noqa: BLE001 — a conversion, a concatenation without its ends
        return None, f"the declared datum operation {code} ({op.name}) is not a transformation between two datums: refused"
    if geod is None or geod.equals(wgs, ignore_axis_order=True):
        return None, f"the study's CRS {crs} is on WGS 84 itself: a datum operation ({code}) has nothing to do — refused"
    if src.equals(geod, ignore_axis_order=True) and dst.equals(wgs, ignore_axis_order=True):
        to_wgs = TransformDirection.FORWARD
    elif src.equals(wgs, ignore_axis_order=True) and dst.equals(geod, ignore_axis_order=True):
        to_wgs = TransformDirection.INVERSE
    else:
        return None, (f"the declared datum operation {code} ({op.name}) joins {src.name} to {dst.name}, "
                      f"not {geod.name} (the datum of {crs}) to WGS 84: refused")
    from_wgs = TransformDirection.INVERSE if to_wgs == TransformDirection.FORWARD else TransformDirection.FORWARD
    try:
        p = Transformer.from_pipeline(op.to_proj4())
    except Exception as exc:  # noqa: BLE001
        return None, f"PROJ cannot run the declared datum operation {code}: {exc}"
    # the pipeline takes its source CRS's axes as EPSG orders them
    lat_first = {"src": not src.is_projected and src.axis_info and src.axis_info[0].direction == "north",
                 "dst": not dst.is_projected and dst.axis_info and dst.axis_info[0].direction == "north"}
    geod_first = lat_first["src"] if to_wgs == TransformDirection.FORWARD else lat_first["dst"]
    wgs_first = lat_first["dst"] if to_wgs == TransformDirection.FORWARD else lat_first["src"]
    conv = Transformer.from_crs(geod, study, always_xy=True)

    def fwd(lon, lat):
        a, b = p.transform(*((lat, lon) if wgs_first else (lon, lat)), direction=from_wgs)
        glon, glat = (b, a) if geod_first else (a, b)
        return conv.transform(glon, glat)

    def inv(e, n):
        glon, glat = conv.transform(e, n, direction=TransformDirection.INVERSE)
        a, b = p.transform(*((glat, glon) if geod_first else (glon, glat)), direction=to_wgs)
        return (b, a) if wgs_first else (a, b)

    name = f"Inverse of {op.name} + {conv.description}" if to_wgs == TransformDirection.FORWARD else f"{op.name} + {conv.description}"
    return DatumOp(fwd, inv, name, op.accuracy, declared=True, code=code,
                   why=f"declared on the GeoPositionNode ({code}), built from the EPSG operation (not among PROJ's candidates for {crs})"), None


def relocate_true_ecef(transform: Sequence[float], bounding_volume: Dict[str, Any],
                       target: Dict[str, Any], *, check: int = 5, datum_operation=None) -> Dict[str, Any]:
    """The transform that puts a tileset whose ``root.transform`` is a TRUE ECEF
    one (WGS 84, ellipsoidal heights: RealityScan, Metashape's Cesium export)
    into the study's frame: its CRS minus its shift, ORTHOMETRIC heights.

    For each point of the root's volume: ECEF → (lon, lat, h) on WGS 84 → the
    study's CRS by PROJ's best operation with a DATUM SHIFT (for Stereo70:
    Pulkovo 1942(58) → WGS 84, a Helmert of 7 parameters, never «the same
    numbers») → the height minus the geoid's undulation (EGM2008) → minus the
    shift. The affine fit and its residual as `relocate_transform`'s.

    MICRO-DATUM-DICHIARATO · the datum operation is the GeoPositionNode's
    ``datum_operation`` when declared (``datum_op``: Metashape writes Stereo70
    in ECEF with EPSG:1645, PROJ would take EPSG:15995 — 0.8 m at Templu Mare),
    else PROJ's best; the answer's ``datum`` says which and why. No EGM2008
    grid (or a grid that answers ±Infinity) is a refusal, never ellipsoidal
    heights drawn as orthometric ones nor a NaN.
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
    hz, why = datum_op(crs, datum_operation)
    if hz is None:
        return {"ok": False, "error": why, "datum": {"declared": datum_operation not in (None, ""),
                                                     "code": datum_operation or None}}
    # the study's origin, back on the Earth: the guard against a fake ECEF
    olon, olat = hz.inverse(tsh[0], tsh[1])
    geoid, geoid_how = _geoid_op(at=(olon, olat))
    if geoid is None:
        return {"ok": False, "error": f"no EGM2008 geoid: {geoid_how} — the heights cannot be made orthometric",
                "datum": hz.words(), "geoid": {"crs": GEOID_CRS, "how": geoid_how}}

    def true_of(p):
        x, y, z = _apply(M, p)
        lon, lat, h = to_geo.transform(x, y, z)
        e, n = hz.transform(lon, lat)
        H = geoid.transform(lon, lat, h)[2]
        if not all(math.isfinite(v) for v in (e, n, H)):
            raise ArithmeticError(f"PROJ answered a number that is not finite at lon {lon:.6f}, lat {lat:.6f} (E {e}, N {n}, H {H})")
        return (e - tsh[0], n - tsh[1], H - tsh[2]), (lon, lat, h, h - H)

    centre = [sum(p[k] for p in pts) / len(pts) for k in range(3)]
    try:
        q, (clon, clat, ch, und) = true_of(centre)
    except ArithmeticError as exc:
        return {"ok": False, "error": str(exc), "datum": hz.words(), "geoid": {"crs": GEOID_CRS, "how": geoid_how}}
    far = _haversine(olon, olat, clon, clat)
    if far > NEAR_STUDY_M:
        return {"ok": False, "error": "far", "why": f"the root is {far / 1000:.1f} km from the study's origin: not taken for a true ECEF frame",
                "written": {"lat": clat, "lon": clon, "h": ch}}
    try:
        dst = [true_of(p)[0] for p in pts]
        fit = fit_affine(pts, dst)
        errs = [math.dist(true_of(p)[0], _apply([*fit, [0, 0, 0, 1]], p)) for p in (chk or pts)]
    except ArithmeticError as exc:
        return {"ok": False, "error": str(exc), "datum": hz.words(), "geoid": {"crs": GEOID_CRS, "how": geoid_how}}
    return {"ok": True, "transform": _column_major(fit), "target": {"crs": crs, "shift": tsh},
            "residual_rms_m": math.sqrt(sum(e * e for e in errs) / len(errs)), "residual_max_m": max(errs),
            "points": len(chk or pts), "written": {"lat": clat, "lon": clon, "h": ch}, "true": {"x": q[0], "y": q[1], "z": q[2]},
            "datum": hz.words(),
            "geoid": {"crs": GEOID_CRS, "undulation_m": und, "how": geoid_how},
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
