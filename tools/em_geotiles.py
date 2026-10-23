"""MICRO-GEOGLOBO · the bridge's side of the globe: tiles, packages, rasters.

Everything the Space's globe asks of the disk and of the network goes through
here, so that ONE place decides what is read from a project's package, what
from the cache, and what from a source online:

  · PMTILES v3, read and written in plain Python (gzip from the standard
    library; no dependency). The format of a project's packages, of the globe
    minimum, and — the proposal for stratigraph-server — of the server's cache:
    a PMTiles on S3 is read by range with a presigned URL, no tile server;
  · ``/tiles/xyz/<source>/<z>/<x>/<y>``: a tile of a source, from the
    project's packages (``?pkg=<folder>``), then the globe minimum, then the
    disk cache, then the source online (stored in the cache). The cache is a
    tree of files, LRU by access time, with a ceiling the person sets
    (``/tiles/cache``). A tree and not a PMTiles because a cache is WRITTEN
    tile by tile and a PMTiles is written once; what travels (a project's
    package, the server's) is always PMTiles, and «Estrai area» reads the
    cache first;
  · ``/tiles/pm/<z>/<x>/<y>?path=<file.pmtiles>``: a tile of a package
    (a raster made at import); ``/tiles/archive/<path>``: the package's bytes,
    by range, for a reader that wants the file itself;
  · «Estrai area» (``/tiles/extract``): a box and a zoom → a PMTiles in the
    project's folder; a job with its progress, which can be cancelled. A
    source whose terms forbid offline copies (OpenStreetMap's tile servers)
    is refused here, not only greyed out in the page;
  · the GLOBE MINIMUM (``/tiles/globe-min``): the same job on the whole world,
    a few levels, into the app's folder — downloaded at first use, never in
    the installer;
  · the SITE FRAME (``/geo/frame``): the GeoPositionNode's anchor measured by
    PROJ — where the scene's origin is, which way its +y points, the CRS's
    scale there;
  · RASTERS (``/geo/raster-info``, ``/geo/raster-import``,
    ``/geo/raster-preview``): a GeoTIFF read with Pillow, its georeference from
    its own tags (or a world file), reprojected to Web Mercator by a mesh of
    PROJ-computed control points (Pillow's MESH transform: piecewise affine,
    under a tenth of a pixel on a site), tiled into a PMTiles BESIDE the
    original. The original is never touched: it stays the document. GDAL is
    not in the packaged bridge (the report measures what it would weigh);
    this path covers the GeoTIFFs Pillow decodes (strips or tiles, none, LZW,
    deflate, packbits; 8-bit images, 16/32-bit DEMs).

The routes are wired in ``em_bridge.py``; the functions here are pure enough to
be called from a test (``frontend/scripts/check-geotiles.mjs``).
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
import os
import pathlib
import struct
import threading
import time
import urllib.error
import urllib.request
import uuid

import em_net

# ── PMTiles v3 ───────────────────────────────────────────────────────────────

HEADER_LEN = 127
ROOT_MAX = 16384 - HEADER_LEN
TILE_TYPES = {"mvt": 1, "png": 2, "jpg": 3, "jpeg": 3, "webp": 4, "avif": 5}
TYPE_EXT = {1: "mvt", 2: "png", 3: "jpg", 4: "webp", 5: "avif"}
TYPE_MEDIA = {2: "image/png", 3: "image/jpeg", 4: "image/webp", 5: "image/avif", 1: "application/vnd.mapbox-vector-tile"}
COMP_NONE, COMP_GZIP = 1, 2


def _rotate(n, x, y, rx, ry):
    if ry == 0:
        if rx != 0:
            x = n - 1 - x
            y = n - 1 - y
        return y, x
    return x, y


def zxy_to_tileid(z: int, x: int, y: int) -> int:
    """The Hilbert tile id of the PMTiles v3 spec."""
    if z > 31:
        raise ValueError("zoom over 31")
    n = 1 << z
    if x >= n or y >= n or x < 0 or y < 0:
        raise ValueError("tile outside its zoom")
    acc = ((1 << (2 * z)) - 1) // 3
    s = n >> 1
    while s > 0:
        rx = 1 if (x & s) else 0
        ry = 1 if (y & s) else 0
        acc += s * s * ((3 * rx) ^ ry)
        x, y = _rotate(n, x, y, rx, ry)
        s >>= 1
    return acc


def _varint(n: int, out: bytearray) -> None:
    while n >= 0x80:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    out.append(n)


def _read_varint(b: bytes, pos: int):
    shift = n = 0
    while True:
        c = b[pos]
        pos += 1
        n |= (c & 0x7F) << shift
        if c < 0x80:
            return n, pos
        shift += 7


def _encode_dir(entries) -> bytes:
    """entries: [(tile_id, offset, length, run_length)] sorted by tile_id."""
    out = bytearray()
    _varint(len(entries), out)
    last = 0
    for e in entries:
        _varint(e[0] - last, out)
        last = e[0]
    for e in entries:
        _varint(e[3], out)
    for e in entries:
        _varint(e[2], out)
    for i, e in enumerate(entries):
        if i > 0 and e[1] == entries[i - 1][1] + entries[i - 1][2]:
            _varint(0, out)
        else:
            _varint(e[1] + 1, out)
    return gzip.compress(bytes(out), mtime=0)


def _decode_dir(raw: bytes, compression: int):
    b = gzip.decompress(raw) if compression == COMP_GZIP else raw
    n, p = _read_varint(b, 0)
    ids, runs, lens, offs = [], [], [], []
    last = 0
    for _ in range(n):
        d, p = _read_varint(b, p)
        last += d
        ids.append(last)
    for _ in range(n):
        v, p = _read_varint(b, p)
        runs.append(v)
    for _ in range(n):
        v, p = _read_varint(b, p)
        lens.append(v)
    for i in range(n):
        v, p = _read_varint(b, p)
        offs.append(offs[i - 1] + lens[i - 1] if v == 0 and i > 0 else v - 1)
    return list(zip(ids, offs, lens, runs))


def write_pmtiles(path, tiles, *, tile_type: str, metadata: dict, bounds=None, center_zoom=None) -> dict:
    """Write a PMTiles v3 archive. ``tiles``: iterable of ((z, x, y), bytes).

    Identical tiles are stored once (an ocean, a raster's empty corner); a run
    of identical neighbours along the Hilbert curve is one entry. The root
    directory stays within the first 16 KiB, the rest go to leaf directories,
    as the spec asks. Returns what was written."""
    by_id = {}
    zs = []
    for (z, x, y), data in tiles:
        if not data:
            continue
        by_id[zxy_to_tileid(z, x, y)] = data
        zs.append(z)
    if not by_id:
        raise ValueError("no tile to write")
    ids = sorted(by_id)
    blobs = bytearray()
    seen = {}
    entries = []
    for tid in ids:
        data = by_id[tid]
        h = hashlib.sha1(data).digest()
        if h in seen:
            off, ln = seen[h]
        else:
            off, ln = len(blobs), len(data)
            blobs += data
            seen[h] = (off, ln)
        last = entries[-1] if entries else None
        if last and last[0] + last[3] == tid and last[1] == off and last[2] == ln:
            entries[-1] = (last[0], last[1], last[2], last[3] + 1)
        else:
            entries.append((tid, off, ln, 1))
    # the root, or the root of leaves
    root = _encode_dir(entries)
    leaves = b""
    if len(root) > ROOT_MAX:
        size = 4096
        while True:
            leaf_bytes = bytearray()
            root_entries = []
            for i in range(0, len(entries), size):
                chunk = entries[i:i + size]
                enc = _encode_dir(chunk)
                root_entries.append((chunk[0][0], len(leaf_bytes), len(enc), 0))
                leaf_bytes += enc
            root = _encode_dir(root_entries)
            if len(root) <= ROOT_MAX:
                leaves = bytes(leaf_bytes)
                break
            size *= 2
    meta = gzip.compress(json.dumps(metadata, ensure_ascii=False).encode("utf-8"), mtime=0)
    root_off = HEADER_LEN
    meta_off = root_off + len(root)
    leaf_off = meta_off + len(meta)
    data_off = leaf_off + len(leaves)
    if bounds is None:
        bounds = (-180.0, -85.0511287798066, 180.0, 85.0511287798066)
    minz, maxz = min(zs), max(zs)
    cz = center_zoom if center_zoom is not None else minz
    cx, cy = (bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2
    e7 = lambda v: int(round(v * 1e7))
    header = b"PMTiles" + struct.pack(
        "<BQQQQQQQQQQQBBBBBBiiiiBii",
        3, root_off, len(root), meta_off, len(meta), leaf_off, len(leaves), data_off, len(blobs),
        len(ids), len(entries), len(seen), 1, COMP_GZIP, COMP_NONE, TILE_TYPES[tile_type], minz, maxz,
        e7(bounds[0]), e7(bounds[1]), e7(bounds[2]), e7(bounds[3]), cz, e7(cx), e7(cy))
    assert len(header) == HEADER_LEN, len(header)
    tmp = str(path) + ".part"
    with open(tmp, "wb") as fh:
        fh.write(header)
        fh.write(root)
        fh.write(meta)
        fh.write(leaves)
        fh.write(blobs)
    os.replace(tmp, path)
    return {"tiles": len(ids), "contents": len(seen), "entries": len(entries), "bytes": data_off + len(blobs),
            "min_zoom": minz, "max_zoom": maxz, "leaves": bool(leaves)}


class PMTiles:
    """A PMTiles v3 archive on disk, read by offsets (no full read)."""

    def __init__(self, path):
        self.path = str(path)
        self.lock = threading.Lock()
        self.fh = open(self.path, "rb")
        h = self.fh.read(HEADER_LEN)
        if len(h) < HEADER_LEN or h[:7] != b"PMTiles" or h[7] != 3:
            self.fh.close()
            raise ValueError("not a PMTiles v3 archive")
        f = struct.unpack("<BQQQQQQQQQQQBBBBBBiiiiBii", h[7:])
        (_, self.root_off, self.root_len, self.meta_off, self.meta_len, self.leaf_off, self.leaf_len,
         self.data_off, self.data_len, self.n_addressed, self.n_entries, self.n_contents, self.clustered,
         self.internal_comp, self.tile_comp, self.tile_type, self.min_zoom, self.max_zoom,
         a, b, c, d, self.center_zoom, _cx, _cy) = f
        self.bounds = (a / 1e7, b / 1e7, c / 1e7, d / 1e7)
        self._dirs = {}
        self.mtime = os.path.getmtime(self.path)

    def close(self):
        try:
            self.fh.close()
        except Exception:
            pass

    def _read(self, off, ln):
        with self.lock:
            self.fh.seek(off)
            return self.fh.read(ln)

    def _dir(self, off, ln):
        key = (off, ln)
        d = self._dirs.get(key)
        if d is None:
            d = _decode_dir(self._read(off, ln), self.internal_comp)
            if len(self._dirs) > 64:
                self._dirs.clear()
            self._dirs[key] = d
        return d

    def metadata(self) -> dict:
        raw = self._read(self.meta_off, self.meta_len)
        if self.internal_comp == COMP_GZIP:
            raw = gzip.decompress(raw)
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return {}

    def get(self, z, x, y):
        if z < self.min_zoom or z > self.max_zoom:
            return None
        try:
            tid = zxy_to_tileid(z, x, y)
        except ValueError:
            return None
        off, ln = self.root_off, self.root_len
        for _depth in range(4):
            entries = self._dir(off, ln)
            lo, hi = 0, len(entries) - 1
            hit = None
            while lo <= hi:
                mid = (lo + hi) // 2
                if entries[mid][0] <= tid:
                    hit = entries[mid]
                    lo = mid + 1
                else:
                    hi = mid - 1
            if hit is None:
                return None
            e_id, e_off, e_len, e_run = hit
            if e_run == 0:
                off, ln = self.leaf_off + e_off, e_len
                continue
            if tid < e_id + e_run:
                data = self._read(self.data_off + e_off, e_len)
                if self.tile_comp == COMP_GZIP:
                    data = gzip.decompress(data)
                return data
            return None
        return None


_OPEN = {}
_OPEN_LOCK = threading.Lock()


def open_pmtiles(path) -> "PMTiles | None":
    """An archive kept open (by path and mtime): a tile is two reads at most."""
    p = str(path)
    try:
        m = os.path.getmtime(p)
    except OSError:
        return None
    with _OPEN_LOCK:
        a = _OPEN.get(p)
        if a and a.mtime == m:
            return a
        if a:
            a.close()
        try:
            a = PMTiles(p)
        except (OSError, ValueError):
            _OPEN.pop(p, None)
            return None
        _OPEN[p] = a
        return a


# ── the sources (the page's list, `geoglobe.ts SOURCES`: the same ids) ──────

SOURCES = {
    "s2cloudless-2016": {"url": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
                         "max_zoom": 15, "type": "jpg", "offline": True,
                         "attribution": "Sentinel-2 cloudless 2016 © EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0"},
    "osm": {"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png", "max_zoom": 19, "type": "png", "offline": False,
            "attribution": "© OpenStreetMap contributors (ODbL)"},
    "mapterhorn": {"url": "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp", "max_zoom": 16, "type": "webp", "offline": True,
                   "encoding": "terrarium",
                   "attribution": "Terrain © Mapterhorn — Copernicus GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the EU and ESA, and national open DEMs (mapterhorn.com/attribution)"},
    "aws-terrarium": {"url": "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", "max_zoom": 15, "type": "png",
                      "offline": True, "encoding": "terrarium",
                      "attribution": "Terrain Tiles (AWS Open Data): SRTM, GMTED2010, 3DEP courtesy of the USGS; EU-DEM produced using Copernicus data; ETOPO1 NOAA; and others"},
}

#: the OSMF policy asks a distinct, stable User-Agent naming the app and a contact
USER_AGENT = "EMStudio-em-bridge/1.6 (+https://github.com/ExtendedMatrix/EMStudio)"


def _state_dir() -> pathlib.Path:
    return pathlib.Path(os.environ.get("EM_BRIDGE_STATE_DIR") or (pathlib.Path.home() / ".config" / "emstudio"))


def geo_dir() -> pathlib.Path:
    """The app's folder of geo data: the cache and the globe minimum."""
    return pathlib.Path(os.environ.get("EM_GEO_DIR") or (_state_dir() / "geo"))


# ── the disk cache (LRU) ─────────────────────────────────────────────────────

class TileCache:
    """Tiles fetched online, one file each, LRU by access time under a ceiling."""

    DEFAULT_MB = 512

    def __init__(self, root: pathlib.Path):
        self.root = root
        self.lock = threading.Lock()
        self.size = None   # bytes, counted lazily
        self.writes = 0
        self.hits = 0
        self.misses = 0
        self.evicted = 0

    def _conf_path(self):
        return self.root / "config.json"

    def limit_bytes(self) -> int:
        env = os.environ.get("EM_GEO_CACHE_MB")
        if env:
            try:
                return int(float(env) * 1024 * 1024)
            except ValueError:
                pass
        try:
            mb = json.loads(self._conf_path().read_text("utf-8")).get("limit_mb")
            if isinstance(mb, (int, float)) and mb >= 0:
                return int(mb * 1024 * 1024)
        except Exception:
            pass
        return self.DEFAULT_MB * 1024 * 1024

    def set_limit_mb(self, mb: float) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self._conf_path().write_text(json.dumps({"limit_mb": mb}), "utf-8")
        self.evict()

    def _file(self, source, z, x, y, ext):
        return self.root / "tiles" / source / str(z) / str(x) / f"{y}.{ext}"

    def get(self, source, z, x, y, ext):
        f = self._file(source, z, x, y, ext)
        try:
            data = f.read_bytes()
        except OSError:
            self.misses += 1
            return None
        try:
            os.utime(f)   # the access is the LRU's clock
        except OSError:
            pass
        self.hits += 1
        return data

    def put(self, source, z, x, y, ext, data: bytes) -> None:
        f = self._file(source, z, x, y, ext)
        f.parent.mkdir(parents=True, exist_ok=True)
        tmp = f.with_name(f.name + f".{uuid.uuid4().hex[:6]}.part")
        tmp.write_bytes(data)
        os.replace(tmp, f)
        with self.lock:
            if self.size is not None:
                self.size += len(data)
            self.writes += 1
            due = self.writes % 64 == 0
        if due:
            self.evict()

    def _scan(self):
        out = []
        base = self.root / "tiles"
        if not base.is_dir():
            return out
        for dirpath, _dirs, files in os.walk(base):
            for n in files:
                if n.endswith(".part"):
                    continue
                p = os.path.join(dirpath, n)
                try:
                    st = os.stat(p)
                except OSError:
                    continue
                out.append((st.st_mtime, st.st_size, p))
        return out

    def evict(self) -> int:
        """The least recently used tiles go until the cache is under 90 % of its ceiling."""
        with self.lock:
            files = self._scan()
            total = sum(f[1] for f in files)
            limit = self.limit_bytes()
            gone = 0
            if total > limit:
                files.sort()
                target = int(limit * 0.9)
                for _m, sz, p in files:
                    if total <= target:
                        break
                    try:
                        os.remove(p)
                        total -= sz
                        gone += 1
                    except OSError:
                        pass
            self.size = total
            self.evicted += gone
            return gone

    def stats(self) -> dict:
        with self.lock:
            files = self._scan()
            self.size = sum(f[1] for f in files)
            per = {}
            for _m, sz, p in files:
                src = pathlib.Path(p).relative_to(self.root / "tiles").parts[0]
                n, b = per.get(src, (0, 0))
                per[src] = (n + 1, b + sz)
        return {"dir": str(self.root), "bytes": self.size, "tiles": len(files), "limit_bytes": self.limit_bytes(),
                "hits": self.hits, "misses": self.misses, "evicted": self.evicted,
                "sources": {k: {"tiles": v[0], "bytes": v[1]} for k, v in per.items()}}

    def clear(self) -> int:
        n = 0
        for _m, _sz, p in self._scan():
            try:
                os.remove(p)
                n += 1
            except OSError:
                pass
        with self.lock:
            self.size = 0
        return n


_CACHE = None


def cache() -> TileCache:
    global _CACHE
    if _CACHE is None:
        _CACHE = TileCache(geo_dir() / "cache")
    return _CACHE


# ── a tile, wherever it is ───────────────────────────────────────────────────

#: a transparent 1×1 PNG: «nothing here» that an image overlay draws as nothing
EMPTY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360606060000000050001a5f645400000000049454e44ae426082")

#: online fetches at the same time (a polite client of a public server)
_NET = threading.BoundedSemaphore(6)


class FetchFailed(Exception):
    """A source online did not answer a tile: ``str()`` is the reason in words
    (``em_net.reason``), what the tile's ``X-EM-Tile`` header and the panel say."""


#: MICRO-BRIDGE-CERTIFICATI · the last failure of each source online, until a
#: tile of it comes again: {source: {reason, count, at, said}} (``/tiles/failures``)
_FAILURES = {}
_FAIL_LOCK = threading.Lock()


def _note_failure(source_id: str, why: str) -> None:
    with _FAIL_LOCK:
        f = _FAILURES.get(source_id)
        if f is None or f["reason"] != why:
            f = _FAILURES[source_id] = {"reason": why, "count": 0, "since": time.time()}
            # once per source and reason in the bridge's own log, not per tile
            print(f"  [bridge] tiles: {source_id} online failed: {why}", flush=True)
        f["count"] += 1
        f["at"] = time.time()


def _note_success(source_id: str) -> None:
    if source_id in _FAILURES:
        with _FAIL_LOCK:
            _FAILURES.pop(source_id, None)


def failures() -> dict:
    """GET /tiles/failures: the sources online that are failing now, and why."""
    with _FAIL_LOCK:
        return {"ok": True, "sources": {k: {**v, "since": round(v["since"], 1), "at": round(v["at"], 1)}
                                        for k, v in _FAILURES.items()}}


def fetch_online(source_id: str, z: int, x: int, y: int, timeout=20):
    src = SOURCES[source_id]
    url = src["url"].replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with _NET:
        try:
            with em_net.urlopen(req, timeout=timeout) as r:
                data = r.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                _note_success(source_id)
                return b""     # outside the source's coverage: an answer, not a failure
            why = em_net.reason(exc)
            _note_failure(source_id, why)
            raise FetchFailed(why) from None
        except Exception as exc:  # noqa: BLE001 — refused, offline, a certificate, a timeout, a cut answer
            why = em_net.reason(exc)
            _note_failure(source_id, why)
            raise FetchFailed(why) from None
    _note_success(source_id)
    return data


def packages_in(folder) -> list:
    """The PMTiles of a folder (a project's `geo/`, the app's globe minimum),
    with the source each one says it copies (its metadata `source`)."""
    out = []
    try:
        names = sorted(os.listdir(folder))
    except OSError:
        return out
    for n in names:
        if not n.endswith(".pmtiles"):
            continue
        a = open_pmtiles(os.path.join(folder, n))
        if a is None:
            continue
        out.append((a, a.metadata().get("source")))
    return out


def tile_for(source_id: str, z: int, x: int, y: int, pkg_dirs=(), online=True):
    """(bytes, where) — the project's packages, the globe minimum, the cache,
    the source. `where` says which: the report and the tests read it."""
    src = SOURCES.get(source_id)
    if src is None:
        raise KeyError(source_id)
    for d in [*pkg_dirs, geo_dir() / "globe"]:
        for a, sid in packages_in(d):
            if sid != source_id:
                continue
            data = a.get(z, x, y)
            if data:
                return data, "package:" + os.path.basename(a.path)
    ext = src["type"]
    data = cache().get(source_id, z, x, y, ext)
    if data is not None:
        return data, "cache"
    if not online:
        return None, "offline"
    if z > src["max_zoom"]:
        data = b""
        where = "beyond"
    else:
        data = fetch_online(source_id, z, x, y)
        if data:
            cache().put(source_id, z, x, y, ext, data)
        where = "online"
    if not data and src.get("encoding") == "terrarium" and z > 0:
        # a terrain tile the source does not have (Mapterhorn: z13+ only where a
        # national DEM is): its parent's quarter, NEAREST (an encoded height must
        # not be blended channel by channel). A hole in the terrain is worse
        return overzoom(source_id, z, x, y, pkg_dirs, online), "overzoom"
    return data, where


def overzoom(source_id, z, x, y, pkg_dirs=(), online=True, depth=0):
    """A Terrarium tile cut from its nearest ancestor that exists."""
    from PIL import Image
    if depth > 8 or z <= 0:
        return b""
    data, _w = tile_for(source_id, z - 1, x >> 1, y >> 1, pkg_dirs, online) if depth == 0 else (None, "")
    if not data:
        data = overzoom(source_id, z - 1, x >> 1, y >> 1, pkg_dirs, online, depth + 1)
    if not data:
        return b""
    im = Image.open(io.BytesIO(data)).convert("RGB")
    n = im.width // 2
    q = im.crop(((x & 1) * n, (y & 1) * n, (x & 1) * n + n, (y & 1) * n + n)).resize((im.width, im.height), Image.NEAREST)
    buf = io.BytesIO()
    q.save(buf, "WEBP", lossless=True) if SOURCES[source_id]["type"] == "webp" else q.save(buf, "PNG")
    return buf.getvalue()


def tile_range(bbox, z):
    """The x, y ranges of a lon/lat box at a zoom (inclusive)."""
    w, s, e, n = bbox
    def tx(lon):
        return min((1 << z) - 1, max(0, int(math.floor((lon + 180) / 360 * (1 << z)))))
    def ty(lat):
        lat = max(-85.0511287798066, min(85.0511287798066, lat))
        r = math.radians(lat)
        return min((1 << z) - 1, max(0, int(math.floor((1 - math.asinh(math.tan(r)) / math.pi) / 2 * (1 << z)))))
    return tx(w), tx(e), ty(n), ty(s)


# ── jobs: «Estrai area», the globe minimum ───────────────────────────────────

MAX_EXTRACT_TILES = 40000
#: this many tiles failing one after the other stop a job (four workers: four
#: rounds of the same refusal are a cause, not bad luck)
FAIL_BLOCK = 16
_JOBS = {}
_JOBS_LOCK = threading.Lock()


class Job:
    def __init__(self, kind, total):
        self.id = uuid.uuid4().hex[:12]
        self.kind = kind
        self.total = total
        self.done = 0
        self.bytes = 0
        self.failed = 0
        self.state = "running"
        self.error = None
        self.result = None
        self.cancel = threading.Event()
        self.started = time.time()
        self.where = {}

    def view(self):
        return {"ok": True, "job": self.id, "kind": self.kind, "state": self.state, "total": self.total,
                "done": self.done, "bytes": self.bytes, "failed": self.failed, "error": self.error,
                "result": self.result, "where": self.where, "seconds": round(time.time() - self.started, 1)}


def _run_extract(job: Job, plan, out_path, source_id, meta, bounds, pkg_dirs, center_zoom):
    """plan: [(z, x0, x1, y0, y1)]. Tiles fetched four at a time."""
    from concurrent.futures import ThreadPoolExecutor
    src = SOURCES[source_id]
    tiles = {}
    try:
        coords = [(z, x, y) for (z, x0, x1, y0, y1) in plan for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]

        def one(c):
            if job.cancel.is_set() or stop.is_set():
                return c, None, "cancelled"
            try:
                d, where = tile_for(source_id, *c, pkg_dirs=pkg_dirs)
                return c, d, where
            except Exception as exc:  # noqa: BLE001 — one tile is not the job
                return c, None, f"error: {exc}"

        # MICRO-BRIDGE-CERTIFICATI p.2 · a tile that failed is not DONE (E.D.'s
        # «globe-min: failed · 5461/5461 · 0.0 MB»: every tile a certificate
        # error, every one counted), and a first block of failures with nothing
        # come is the job failing, said with its reason, not 5461 more tries
        stop = threading.Event()
        run_of_errors, last_error = 0, ""
        with ThreadPoolExecutor(max_workers=4) as ex:
            for c, d, where in ex.map(one, coords):
                if job.cancel.is_set() or stop.is_set():
                    break
                key = where.split(":")[0]
                job.where[key] = job.where.get(key, 0) + 1
                if where.startswith("error"):
                    job.failed += 1
                    run_of_errors += 1
                    last_error = where[len("error: "):]
                    if run_of_errors >= FAIL_BLOCK:
                        stop.set()
                    continue
                run_of_errors = 0
                if d:
                    tiles[c] = d
                    job.bytes += len(d)
                job.done += 1
        if job.cancel.is_set():
            job.state = "cancelled"
            return
        if stop.is_set():
            raise ValueError(f"{FAIL_BLOCK} tiles in a row failed: {last_error}")
        if not tiles:
            raise ValueError(f"no tile came: {last_error}" if last_error else "no tile came: outside the source")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        meta = {**meta, "source": source_id, "attribution": src["attribution"],
                **({"encoding": src["encoding"]} if src.get("encoding") else {})}
        info = write_pmtiles(out_path, sorted(tiles.items()), tile_type=src["type"], metadata=meta,
                             bounds=bounds, center_zoom=center_zoom)
        job.result = {"path": out_path, **info}
        job.state = "done"
    except Exception as exc:  # noqa: BLE001
        job.state = "failed"
        job.error = str(exc)


def start_extract(body: dict, inside_roots) -> "tuple[int, dict]":
    """POST /tiles/extract {source, bbox: [w,s,e,n], zmin?, zmax, dest (a folder
    this bridge serves), name?, pkg?}."""
    source_id = str(body.get("source") or "")
    src = SOURCES.get(source_id)
    if src is None:
        return 400, {"ok": False, "error": f"unknown source {source_id!r}"}
    if not src["offline"]:
        return 403, {"ok": False, "code": "offline-forbidden",
                     "error": f"{source_id}: its terms forbid copies for offline use (online only)"}
    try:
        bbox = [float(v) for v in body.get("bbox")]
        assert len(bbox) == 4 and bbox[0] < bbox[2] and bbox[1] < bbox[3]
    except Exception:
        return 400, {"ok": False, "error": "bbox: [west, south, east, north] in degrees"}
    zmax = int(body.get("zmax", 14))
    zmin = int(body.get("zmin", 0))
    zmax = min(zmax, src["max_zoom"])
    if not (0 <= zmin <= zmax <= 22):
        return 400, {"ok": False, "error": "zoom out of range"}
    dest = str(body.get("dest") or "")
    if not dest or not inside_roots(dest):
        return 403, {"ok": False, "error": "the destination is not a folder this bridge serves"}
    plan, total = [], 0
    for z in range(zmin, zmax + 1):
        x0, x1, y0, y1 = tile_range(bbox, z)
        plan.append((z, x0, x1, y0, y1))
        total += (x1 - x0 + 1) * (y1 - y0 + 1)
    if total > MAX_EXTRACT_TILES:
        return 413, {"ok": False, "code": "too-many-tiles", "tiles": total, "max": MAX_EXTRACT_TILES,
                     "error": f"{total} tiles: a smaller box or a lower zoom (max {MAX_EXTRACT_TILES})"}
    name = os.path.basename(str(body.get("name") or f"{source_id}-z{zmax}")).replace(".pmtiles", "")
    out = os.path.join(dest, name + ".pmtiles")
    job = Job("extract", total)
    with _JOBS_LOCK:
        _JOBS[job.id] = job
    pkg = [str(body["pkg"])] if body.get("pkg") and inside_roots(str(body["pkg"])) else []
    meta = {"name": name, "description": f"EMStudio «Estrai area» of {source_id}", "bbox": bbox,
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    threading.Thread(target=_run_extract, args=(job, plan, out, source_id, meta, bbox, pkg, zmin),
                     daemon=True).start()
    return 202, job.view()


#: the globe minimum (MICRO-GEOGLOBO p.3): the images z0–z6 (measured 23 Oct:
#: z0–z5 8.4 MB, z6 ≈ 18 MB from a sample of 120 tiles). The coarse terrain
#: (z0–z3, 7.0 MB measured) can be asked (`what: terrain`) but is not part of the
#: minimum: the budget keeps the terrain flat below z10, and at the globe's scale
#: the relief is not visible (8.8 km on 6371)
GLOBE_MIN = {"imagery": ("s2cloudless-2016", 6), "terrain": ("mapterhorn", 3)}


def start_globe_min(body: dict) -> "tuple[int, dict]":
    """POST /tiles/globe-min {what: imagery|terrain, zmax?} → a job writing
    `<geo>/globe/<source>-z0-<z>.pmtiles`."""
    what = str(body.get("what") or "imagery")
    if what not in GLOBE_MIN:
        return 400, {"ok": False, "error": "what: imagery or terrain"}
    source_id, zmax = GLOBE_MIN[what]
    zmax = int(body.get("zmax", zmax))
    if zmax > 7:
        return 400, {"ok": False, "error": "the globe minimum stops at z7"}
    plan, total = [], 0
    for z in range(0, zmax + 1):
        n = (1 << z) - 1
        plan.append((z, 0, n, 0, n))
        total += (n + 1) ** 2
    out = str(geo_dir() / "globe" / f"{source_id}-z0-{zmax}.pmtiles")
    job = Job("globe-min", total)
    with _JOBS_LOCK:
        _JOBS[job.id] = job
    meta = {"name": f"globe minimum {source_id}", "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    threading.Thread(target=_run_extract, args=(job, plan, out, source_id, meta,
                                                (-180.0, -85.0511287798066, 180.0, 85.0511287798066), [], 0),
                     daemon=True).start()
    return 202, job.view()


def globe_min_state() -> dict:
    d = geo_dir() / "globe"
    have = []
    for a, sid in packages_in(d):
        have.append({"source": sid, "path": a.path, "bytes": os.path.getsize(a.path), "max_zoom": a.max_zoom})
    return {"ok": True, "dir": str(d), "packages": have, "plan": {k: {"source": v[0], "zmax": v[1]} for k, v in GLOBE_MIN.items()}}


def job_get(job_id: str) -> "tuple[int, dict]":
    job = _JOBS.get(job_id)
    if job is None:
        return 404, {"ok": False, "error": "no such job"}
    return 200, job.view()


def job_cancel(job_id: str) -> "tuple[int, dict]":
    job = _JOBS.get(job_id)
    if job is None:
        return 404, {"ok": False, "error": "no such job"}
    job.cancel.set()
    return 200, job.view()


# ── the site frame ───────────────────────────────────────────────────────────

def site_frame(epsg: int, x: float, y: float, z: float = 0.0, rotation: float = 0.0) -> dict:
    """The scene's origin (the GeoPositionNode's shift) on the ellipsoid, and
    the true azimuth of the scene's +y: the CRS's grid north at the origin
    (measured: the origin and a point 100 m up the grid, through PROJ, then
    the geodesic between them) turned by the node's `rotation` (clockwise,
    s3Dgraphy `georeference_scene`'s convention)."""
    from pyproj import Geod, Transformer
    t = Transformer.from_crs(int(epsg), 4326, always_xy=True)
    lon, lat = t.transform(x, y)
    lon1, lat1 = t.transform(x, y + 100.0)
    lon2, lat2 = t.transform(x + 100.0, y)
    g = Geod(ellps="WGS84")
    az, _b, dist = g.inv(lon, lat, lon1, lat1)
    _az2, _b2, dist_e = g.inv(lon, lat, lon2, lat2)
    return {"ok": True, "lon": lon, "lat": lat, "h": float(z), "grid_north": az, "azimuth": az + float(rotation),
            "rotation": float(rotation), "scale": dist / 100.0, "scale_east": dist_e / 100.0, "epsg": int(epsg)}


# ── rasters ──────────────────────────────────────────────────────────────────

MAX_PIXELS = 300_000_000
WEB_RES0 = 2 * math.pi * 6378137 / 256      # Web Mercator metres a pixel at z0
MERC_HALF = math.pi * 6378137


def _geokeys(tags) -> dict:
    keys = tags.get(34735)
    out = {}
    if not keys:
        return out
    keys = list(keys)
    n = keys[3]
    for i in range(n):
        k, loc, _cnt, val = keys[4 + 4 * i: 8 + 4 * i]
        if loc == 0:
            out[k] = val
    return out


def read_georef(path, epsg_override=None) -> dict:
    """A GeoTIFF's georeference, from its tags (or a world file beside it)."""
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    with Image.open(path) as im:
        tags = dict(im.tag_v2) if hasattr(im, "tag_v2") else {}
        w, h = im.size
        mode = im.mode
        bands = len(im.getbands())
    gk = _geokeys(tags)
    epsg = epsg_override or gk.get(3072) or gk.get(2048)
    if epsg in (32767, None) and not epsg_override:
        epsg = None
    pixel_is_point = gk.get(1025) == 2
    affine = None
    if 34264 in tags:
        m = list(tags[34264])
        affine = (m[3], m[0], m[1], m[7], m[4], m[5])    # x0, a, b, y0, d, e
    elif 33922 in tags and 33550 in tags:
        tp = list(tags[33922])
        sc = list(tags[33550])
        i, j, X, Y = tp[0], tp[1], tp[3], tp[4]
        affine = (X - i * sc[0], sc[0], 0.0, Y + j * sc[1], 0.0, -sc[1])
    else:
        stem = os.path.splitext(path)[0]
        for ext in (".tfw", ".tifw", ".wld"):
            if os.path.exists(stem + ext):
                v = [float(s) for s in open(stem + ext).read().split()[:6]]
                # world file: centre of the top-left pixel
                affine = (v[4] - v[0] / 2 - v[2] / 2, v[0], v[2], v[5] - v[1] / 2 - v[3] / 2, v[1], v[3])
                break
    if affine and pixel_is_point:
        x0, a, b, y0, d, e = affine
        affine = (x0 - a / 2 - b / 2, a, b, y0 - d / 2 - e / 2, d, e)
    nodata = None
    if 42113 in tags:
        try:
            nodata = float(str(tags[42113]).strip("\x00 "))
        except ValueError:
            nodata = None
    kind = "image" if mode in ("RGB", "RGBA", "L", "LA", "P", "1") else "dem"
    return {"width": w, "height": h, "mode": mode, "bands": bands, "epsg": int(epsg) if epsg else None,
            "affine": affine, "nodata": nodata, "kind": kind}


def _px_to_crs(aff, c, r):
    x0, a, b, y0, d, e = aff
    return x0 + a * c + b * r, y0 + d * c + e * r


def _crs_to_px(aff, X, Y):
    x0, a, b, y0, d, e = aff
    det = a * e - b * d
    dx, dy = X - x0, Y - y0
    return (e * dx - b * dy) / det, (-d * dx + a * dy) / det


def raster_info(path, epsg_override=None, epsg_target=None) -> dict:
    """What the Viewer and the panel show: size, CRS, corners (in the CRS, in
    lon/lat, and in a target CRS — the project's — for a plane on the site)."""
    from pyproj import Transformer
    g = read_georef(path, epsg_override)
    if not g["affine"]:
        return {"ok": False, "code": "no-georef", "error": "the file has no georeference (no GeoTIFF tags, no world file)", **g}
    if not g["epsg"]:
        return {"ok": False, "code": "no-epsg", "error": "the file names no EPSG: say which", **g}
    w, h, aff = g["width"], g["height"], g["affine"]
    corners = [_px_to_crs(aff, c, r) for c, r in ((0, h), (w, h), (w, 0), (0, 0))]   # SW SE NE NW
    t = Transformer.from_crs(g["epsg"], 4326, always_xy=True)
    ll = [t.transform(*p) for p in corners]
    out = {"ok": True, **g, "corners": corners, "corners_wgs84": ll,
           "bounds_wgs84": [min(p[0] for p in ll), min(p[1] for p in ll), max(p[0] for p in ll), max(p[1] for p in ll)],
           "pixel_size": math.hypot(aff[1], aff[4])}
    if epsg_target:
        tt = Transformer.from_crs(g["epsg"], int(epsg_target), always_xy=True)
        out["corners_target"] = [tt.transform(*p) for p in corners]
        out["epsg_target"] = int(epsg_target)
    if g["kind"] == "dem":
        lo, hi = _dem_range(path, g["nodata"])
        out["elevation"] = [lo, hi]
    return out


def _open_band(path):
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    im = Image.open(path)
    im.load()
    return im


def _dem_float(im):
    if im.mode == "F":
        return im
    if im.mode in ("I", "I;16", "I;16B", "I;16L", "I;16S"):
        return im.convert("I").convert("F") if im.mode != "I" else im.convert("F")
    return im.convert("F")


def _image_math(expr, **kw):
    from PIL import ImageMath
    if hasattr(ImageMath, "lambda_eval"):
        return ImageMath.unsafe_eval(expr, **kw)
    return ImageMath.eval(expr, **kw)


def _dem_range(path, nodata):
    im = _dem_float(_open_band(path))
    if nodata is not None:
        mask = _image_math("convert((a != nd) * 255, 'L')", a=im, nd=nodata)
        ext = im.getextrema() if mask.getextrema() == (255, 255) else _masked_extrema(im, mask)
    else:
        ext = im.getextrema()
    return float(ext[0]), float(ext[1])


def _masked_extrema(im, mask):
    # the extrema of the valid pixels: the invalid ones moved to the valid minimum's side
    lo = hi = None
    small = im.resize((min(im.width, 1024), min(im.height, 1024)))
    m = mask.resize(small.size)
    data, md = small.getdata(), m.getdata()
    for v, k in zip(data, md):
        if k:
            lo = v if lo is None or v < lo else lo
            hi = v if hi is None or v > hi else hi
    return (lo or 0.0, hi or 0.0)


def _dem_rgba(im, nodata, lo, hi):
    """A DEM drawn as an image: a hypsometric ramp, hill-shaded, transparent on nodata."""
    from PIL import Image, ImageChops, ImageFilter
    f = _dem_float(im)
    span = (hi - lo) or 1.0
    norm = f.point(lambda v: (v - lo) * (254.0 / span) + 1).convert("L")
    ramp = []
    stops = [(0, (40, 110, 60)), (64, (120, 160, 80)), (128, (215, 200, 130)), (192, (170, 120, 80)), (255, (245, 245, 245))]
    for i in range(256):
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= i <= b:
                k = (i - a) / (b - a)
                ramp.extend(int(ca[j] + (cb[j] - ca[j]) * k) for j in range(3))
                break
    col = norm.copy()
    col.putpalette(ramp)
    col = col.convert("RGB")
    # the light from the north-west: a 3×3 kernel on the normalised heights
    shade = norm.filter(ImageFilter.Kernel((3, 3), [-2, -1, 0, -1, 1, 1, 0, 1, 2], scale=1, offset=128))
    shade = shade.point(lambda v: min(255, int(v * 1.0)))
    rgb = ImageChops.multiply(col, Image.merge("RGB", (shade, shade, shade)))
    rgb = ImageChops.add(rgb, ImageChops.multiply(col, Image.new("RGB", col.size, (110, 110, 110))))
    alpha = Image.new("L", f.size, 255)
    if nodata is not None:
        alpha = _image_math("convert((a != nd) * 255, 'L')", a=f, nd=nodata)
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def _as_rgba(path, g, elev=None):
    im = _open_band(path)
    if g["kind"] == "dem":
        lo, hi = elev or _dem_range(path, g["nodata"])
        return _dem_rgba(im, g["nodata"], lo, hi)
    return im.convert("RGBA")


def raster_preview(path, max_px=2048, epsg_override=None) -> bytes:
    """The raster as it is, in its own CRS, at most `max_px` a side: a PNG
    (the Viewer's plane, the site's plane)."""
    from PIL import Image
    g = read_georef(path, epsg_override)
    rgba = _as_rgba(path, g)
    rgba.thumbnail((max_px, max_px), Image.BILINEAR)
    buf = io.BytesIO()
    rgba.save(buf, "PNG", optimize=False)
    return buf.getvalue()


def _merc_zoom_for(px_m):
    """The zoom whose Web Mercator pixel is just finer than `px_m` (Mercator metres)."""
    return max(0, min(22, int(math.ceil(math.log2(WEB_RES0 / max(px_m, 1e-6))))))


def import_raster(path, out_path=None, epsg_override=None, cells=8, max_tiles=MAX_EXTRACT_TILES,
                  progress=None, cancel=None) -> dict:
    """The raster reprojected to Web Mercator and tiled into a PMTiles beside
    it (`<stem>.em3857.pmtiles`): the deepest level at the raster's own
    resolution, every level above it down to z0. The original is not touched."""
    from PIL import Image
    from pyproj import Transformer
    g = read_georef(path, epsg_override)
    if not g["affine"]:
        raise ValueError("the file has no georeference (no GeoTIFF tags, no world file)")
    if not g["epsg"]:
        raise ValueError("the file names no EPSG: say which")
    if g["width"] * g["height"] > MAX_PIXELS:
        raise ValueError(f"over {MAX_PIXELS // 1_000_000} Mpx: too large for the bridge without GDAL")
    elev = _dem_range(path, g["nodata"]) if g["kind"] == "dem" else None
    src = _as_rgba(path, g, elev)
    aff = g["affine"]
    to_merc = Transformer.from_crs(g["epsg"], 3857, always_xy=True)
    to_src = Transformer.from_crs(3857, g["epsg"], always_xy=True)
    to_ll = Transformer.from_crs(g["epsg"], 4326, always_xy=True)
    w, h = g["width"], g["height"]
    # the footprint in Mercator, from a dense border (a reprojected edge bends)
    border = []
    for i in range(33):
        k = i / 32
        border += [(k * w, 0), (k * w, h), (0, k * h), (w, k * h)]
    mxy = [to_merc.transform(*_px_to_crs(aff, c, r)) for c, r in border]
    mx0, mx1 = min(p[0] for p in mxy), max(p[0] for p in mxy)
    my0, my1 = min(p[1] for p in mxy), max(p[1] for p in mxy)
    # the source pixel in Mercator metres, at the centre
    cx, cy = w / 2, h / 2
    pa = to_merc.transform(*_px_to_crs(aff, cx, cy))
    pb = to_merc.transform(*_px_to_crs(aff, cx + 1, cy))
    pc = to_merc.transform(*_px_to_crs(aff, cx, cy + 1))
    px_m = min(math.dist(pa, pb), math.dist(pa, pc))
    zmax = _merc_zoom_for(px_m)

    def merc_tile_range(z):
        n = 1 << z
        size = 2 * MERC_HALF / n
        x0 = int(math.floor((mx0 + MERC_HALF) / size))
        x1 = int(math.floor((mx1 + MERC_HALF) / size))
        y0 = int(math.floor((MERC_HALF - my1) / size))
        y1 = int(math.floor((MERC_HALF - my0) / size))
        return max(0, x0), min(n - 1, x1), max(0, y0), min(n - 1, y1)

    while zmax > 0:
        x0, x1, y0, y1 = merc_tile_range(zmax)
        if (x1 - x0 + 1) * (y1 - y0 + 1) <= max_tiles * 0.75:
            break
        zmax -= 1
    tiles = {}
    T = 256
    x0, x1, y0, y1 = merc_tile_range(zmax)
    total = (x1 - x0 + 1) * (y1 - y0 + 1)
    n = 1 << zmax
    size = 2 * MERC_HALF / n
    step = T // cells
    done = 0
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            if cancel is not None and cancel.is_set():
                raise InterruptedError("cancelled")
            left = -MERC_HALF + tx * size
            top = MERC_HALF - ty * size
            # the control points of the tile, through PROJ
            grid = {}
            pts = [(i, j) for j in range(cells + 1) for i in range(cells + 1)]
            mx = [left + (i * step) * size / T for i, j in pts]
            my = [top - (j * step) * size / T for i, j in pts]
            sx, sy = to_src.transform(mx, my)
            for k, (i, j) in enumerate(pts):
                grid[(i, j)] = _crs_to_px(aff, sx[k], sy[k])
            # a tile wholly outside the raster is not written
            us = [p[0] for p in grid.values()]
            vs = [p[1] for p in grid.values()]
            if max(us) < 0 or min(us) > w or max(vs) < 0 or min(vs) > h:
                done += 1
                continue
            mesh = []
            for j in range(cells):
                for i in range(cells):
                    ul, ll_, lr, ur = grid[(i, j)], grid[(i, j + 1)], grid[(i + 1, j + 1)], grid[(i + 1, j)]
                    mesh.append(((i * step, j * step, (i + 1) * step, (j + 1) * step),
                                 (ul[0], ul[1], ll_[0], ll_[1], lr[0], lr[1], ur[0], ur[1])))
            tile = src.transform((T, T), Image.MESH, mesh, resample=Image.BILINEAR, fillcolor=(0, 0, 0, 0))
            if tile.getextrema()[3][1] == 0:
                done += 1
                continue
            buf = io.BytesIO()
            tile.save(buf, "PNG")
            tiles[(zmax, tx, ty)] = tile
            done += 1
            if progress:
                progress(done, total)
    if not tiles:
        raise ValueError("the raster falls on no tile (its georeference is outside Web Mercator?)")
    # the levels above: four children → their parent, down to z0
    level = dict(tiles)
    allt = dict(tiles)
    for z in range(zmax - 1, -1, -1):
        parents = {}
        for (cz, cx_, cy_), im in level.items():
            px_, py_ = cx_ >> 1, cy_ >> 1
            canvas = parents.get((z, px_, py_))
            if canvas is None:
                canvas = Image.new("RGBA", (2 * T, 2 * T), (0, 0, 0, 0))
                parents[(z, px_, py_)] = canvas
            canvas.paste(im, ((cx_ & 1) * T, (cy_ & 1) * T))
        level = {k: v.resize((T, T), Image.BILINEAR) for k, v in parents.items()}
        allt.update(level)
    enc = []
    for k in sorted(allt):
        buf = io.BytesIO()
        allt[k].save(buf, "PNG")
        enc.append((k, buf.getvalue()))
    if out_path is None:
        out_path = os.path.splitext(path)[0] + ".em3857.pmtiles"
    ll = [to_ll.transform(*_px_to_crs(aff, c, r)) for c, r in border]
    bounds = (min(p[0] for p in ll), min(p[1] for p in ll), max(p[0] for p in ll), max(p[1] for p in ll))
    meta = {"name": os.path.basename(path), "source": "raster", "original": os.path.abspath(path),
            "epsg_source": g["epsg"], "kind": g["kind"], "pixel_size": math.hypot(aff[1], aff[4]),
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "method": f"Pillow MESH, {cells}x{cells} PROJ control cells a tile, bilinear"}
    if elev:
        meta["elevation"] = list(elev)
    info = write_pmtiles(out_path, enc, tile_type="png", metadata=meta, bounds=bounds, center_zoom=max(0, zmax - 4))
    return {"ok": True, "path": out_path, "bounds": list(bounds), "min_zoom": 0, "max_zoom": zmax, "kind": g["kind"],
            "epsg_source": g["epsg"], "pixel_size_merc": px_m, "elevation": list(elev) if elev else None, **info}
