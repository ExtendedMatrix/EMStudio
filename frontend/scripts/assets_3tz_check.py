"""MICRO-ASSETS-3TZ · the bridge's tiles of a DEFLATED .3tz (Metashape's):
read by their heads through one ZipFile, a member inflated only up to its
head, once; the same numbers as the whole read; one measure per tileset at a
time; a sample over the ceiling, said «estimated»; kept on disk; a measure no
page waits for stops. Run by check-assets-3tz.mjs (argv: tools dir, s3dgraphy
src, a scratch dir)."""

import json
import os
import random
import struct
import sys
import threading
import time
import zipfile

TOOLS, S3D, WORK = sys.argv[1:4]
os.environ["EM_BRIDGE_STATE_DIR"] = os.path.join(WORK, "state")
sys.path[:0] = [TOOLS, S3D]

import em_bridge as B  # noqa: E402
from s3dgraphy.resources import detail as D  # noqa: E402
from s3dgraphy.resources import tileset_fit as F  # noqa: E402

checks, fails = 0, []


def ok(cond, what):
    global checks
    checks += 1
    print(f"  {'✓' if cond else '✗'} {what}")
    if not cond:
        fails.append(what)


def png(w, h):
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", w, h) + b"\x08\x02\x00\x00\x00" + b"\0" * 4


def glb(tris, side, rnd):
    geo = rnd.randbytes(6000)            # the geometry: before the image, never read
    img = png(side, side) + b"\0" * 64
    js = {"asset": {"version": "2.0"},
          "accessors": [{"count": tris * 3}, {"count": tris * 3}],
          "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
          "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(geo)},
                          {"buffer": 0, "byteOffset": len(geo), "byteLength": len(img)}],
          "images": [{"bufferView": 1, "mimeType": "image/png"}]}
    jb = json.dumps(js).encode()
    jb += b" " * (-len(jb) % 4)
    tail = rnd.randbytes(4000)           # what follows the image (normals, uv…): never read
    bb = geo + img + tail
    bb += b"\0" * (-len(bb) % 4)
    body = struct.pack("<II", len(jb), 0x4E4F534A) + jb + struct.pack("<II", len(bb), 0x004E4942) + bb
    return b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body


def b3dm(g):
    return b"b3dm" + struct.pack("<IIIIII", 1, 28 + len(g), 0, 0, 0, 0) + g


def make_3tz(path, n_tiles, seed=7):
    """A 3tz of ``n_tiles`` tiles in three levels (1, ~1 %, the rest), every
    member DEFLATED (as Metashape writes), an external tileset for level 2."""
    rnd = random.Random(seed)
    truth = {}
    mid = max(1, n_tiles // 100)
    leaves = n_tiles - 1 - mid
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        def tile(name, depth):
            tris, side = rnd.randint(100, 5000) * (3 - depth), rnd.choice([128, 256, 512])
            data = glb(tris, side, rnd)
            if rnd.random() < 0.3:
                data, name = b3dm(data), name.replace(".glb", ".b3dm")
            zf.writestr(name, data)
            truth[name] = [tris, side]
            return {"boundingVolume": {"box": [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]}, "geometricError": 1,
                    "content": {"uri": name}}
        kids = []
        per = leaves // mid
        for m in range(mid):
            t = tile(f"Data/m{m}.glb", 1)
            sub = [tile(f"Data/m{m}/l{j}.glb", 2) for j in range(per + (leaves % mid if m == mid - 1 else 0))]
            zf.writestr(f"Data/m{m}/tileset.json", json.dumps(
                {"asset": {"version": "1.0"}, "geometricError": 1,
                 "root": {"boundingVolume": t["boundingVolume"], "geometricError": 1, "children": sub}}))
            t["children"] = [{"boundingVolume": t["boundingVolume"], "geometricError": 1,
                              "content": {"uri": f"Data/m{m}/tileset.json"}}]
            kids.append(t)
        root = tile("Data/root.glb", 0)
        root["children"] = kids
        # the paths inside the external tilesets are relative to them
        zf.writestr("tileset.json", json.dumps({"asset": {"version": "1.0"}, "geometricError": 1, "root": root}))
    return truth


def fix_uris(path):
    """make_3tz writes the leaves' uris as archive paths; an external
    tileset's uris are relative to it: rewrite them so."""
    tmp = path + ".tmp"
    with zipfile.ZipFile(path) as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as dst:
        for i in src.infolist():
            data = src.read(i)
            if i.filename.startswith("Data/m") and i.filename.endswith("tileset.json"):
                js = json.loads(data)
                base = os.path.dirname(i.filename) + "/"
                for c in js["root"]["children"]:
                    c["content"]["uri"] = c["content"]["uri"][len(base):]
                data = json.dumps(js).encode()
            dst.writestr(i.filename, data)
    os.replace(tmp, path)


def whole_reader(path):
    zf = zipfile.ZipFile(path)

    def read_at(p, off, n):
        return zf.read(p)[off:off + n]
    return read_at, zf


os.makedirs(WORK, exist_ok=True)
tz = os.path.join(WORK, "deflated.3tz")
truth = make_3tz(tz, 5000)
fix_uris(tz)
with zipfile.ZipFile(tz) as z:
    infos = z.infolist()
ok(len(infos) > 5000 and all(i.compress_type == zipfile.ZIP_DEFLATED for i in infos),
   f"a synthetic 3tz: {len(infos)} members, every one DEFLATED")

# ── the heads through one ZipFile, each member inflated once, up to its head ─
opened = []
real_open = zipfile.ZipFile.open
real_read = zipfile.ZipFile.read


def counting_open(self, name, *a, **k):
    opened.append(name.filename if hasattr(name, "filename") else name)
    return real_open(self, name, *a, **k)


read_whole = []


def counting_read(self, name, *a, **k):
    n = name.filename if hasattr(name, "filename") else name
    if not n.endswith(".json"):
        read_whole.append(n)
    return real_read(self, name, *a, **k)


zipfile.ZipFile.open = counting_open
zipfile.ZipFile.read = counting_read
t0 = time.time()
r = B._TileReader(tz)
tree = D.read_tileset(r.load_json, "tileset.json", size_of=r.size_of)
got = B._tiles_measure(tree, r, full=True)
r.close()
dt = time.time() - t0
zipfile.ZipFile.open = real_open
zipfile.ZipFile.read = real_read
names = F.tiles_of(tree)
tile_opens = [x for x in opened if not x.endswith(".json")]
ok(len(names) == 5000 and got["tiles"] == 5000 and got["read"] == 5000, f"5000 tiles, all read ({got['read']})")
ok(dt < 5, f"in {dt:.2f} s (< 5 s)")
ok(len(tile_opens) == 5000 and len(set(tile_opens)) == 5000 and r.opens == 5000,
   f"one reading per head: {len(tile_opens)} members opened for 5000 tiles, none twice")
ok(not read_whole, f"no member read whole for a head (zf.read of a tile: {len(read_whole)})")
size_all = sum(i.file_size for i in infos if not i.filename.endswith(".json"))
ok(r.inflated < size_all, f"inflated {r.inflated / 1e6:.1f} MB of {size_all / 1e6:.1f} MB (only up to each head)")

# the same numbers as the whole read
ra, zf = whole_reader(tz)
want = F.measure_tiles(tree, ra)
zf.close()
ok(got["per_tile"] == want["per_tile"] and got["max_triangles"] == want["max_triangles"]
   and got["max_texture_side"] == want["max_texture_side"],
   f"the same measures as reading each member whole (≤ {got['max_triangles']} tri, ≤ {got['max_texture_side']} px)")
by_name = dict(zip([n for n in names], got["per_tile"]))
ok(all(by_name[n] == truth[n] for n in names), "each tile's triangles and side as written")

# ── the ceiling: over it a sample, «estimated» ──────────────────────────────
B.TILES_SAMPLE_OVER, B.TILES_SAMPLE_N = 1000, 400
r = B._TileReader(tz)
tree = D.read_tileset(r.load_json, "tileset.json", size_of=r.size_of)
est = B._tiles_measure(tree, r)
r.close()
ok(est.get("estimated") and est["sampled"] < 5000 and est["tiles"] == 5000 and abs(est["read"] - 5000) <= 60,
   f"over the ceiling: estimated on {est.get('sampled')} tiles, {est['read']} counted of 5000")
ok(est["max_triangles"] == want["max_triangles"],
   f"the largest files in the sample: the most triangles of one tile kept ({est['max_triangles']})")
out = {"assets": [{"versions": [{"id": "v1", "tiles": {"tiles": 5000, "read": est["read"]}}],
                   "targets": {"web": {"loads": "v1", "why": "le tile rispettano la fascia", "tiles": {"ok": True}}}}]}
B._tiles_estimated_on(out, {"v1": est})
ok(out["assets"][0]["versions"][0]["tiles"].get("estimated") and "stimato" in out["assets"][0]["targets"]["web"]["why"],
   "the row says «stimato», the target's reason too")

# ── one measure per tileset at a time; kept on disk; abandoned stops ────────
B.TILES_SAMPLE_OVER = 100000
calls = []
real_measure = B._tiles_measure


def slow_measure(*a, **k):
    calls.append(1)
    time.sleep(0.5)
    return real_measure(*a, **k)


B._tiles_measure = slow_measure
res = {"id": "v1", "path": tz}
answers = []
th = [threading.Thread(target=lambda: answers.append(B._tiles_by_path([res], token="")({"id": "v1"}))) for _ in range(2)]
for x in th:
    x.start()
for x in th:
    x.join()
ok(len(calls) == 1 and len(answers) == 2 and answers[0] == answers[1] and answers[0]["read"] == 5000,
   f"two askings at once: one measure ({len(calls)}), the second takes the first's")
B._TILES_MEMO.clear()
calls.clear()
again = B._tiles_by_path([res])({"id": "v1"})
ok(not calls and again == answers[0], "the memory lost (a restart): the measure read from the bridge's disk, not again")
ok(any(f.endswith(".json") for f in os.listdir(os.path.join(WORK, "state", "cache", "tiles"))), "kept in the bridge's cache")

# a page that stopped asking: the measure stops, nothing kept
B._TILES_MEMO.clear()
for f in os.listdir(os.path.join(WORK, "state", "cache", "tiles")):
    os.remove(os.path.join(WORK, "state", "cache", "tiles", f))
B._tiles_measure = real_measure
B.TILES_ABANDON_S = 0.2
B._ASSET_SEEN["gone"] = time.time() - 60
t0 = time.time()
gone = B._tiles_by_path([res], token="gone")({"id": "v1"})
ok(gone is None and not B._TILES_MEMO and time.time() - t0 < 2, "a page that no longer asks: its measure stops, nothing kept")
B.TILES_ABANDON_S = 30
B._ASSET_SEEN["here"] = time.time()
here = B._tiles_by_path([res], token="here")({"id": "v1"})
ok(here and here["read"] == 5000, "a page that asks: measured")

# «Misura tutto»: a sample in the memo does not answer a full asking
B.TILES_SAMPLE_OVER = 1000
B._TILES_MEMO.clear()
for f in os.listdir(os.path.join(WORK, "state", "cache", "tiles")):
    os.remove(os.path.join(WORK, "state", "cache", "tiles", f))
s1 = B._tiles_by_path([res])({"id": "v1"})
s2 = B._tiles_by_path([res], full=True)({"id": "v1"})
s3 = B._tiles_by_path([res])({"id": "v1"})
ok(s1.get("estimated") and not s2.get("estimated") and s2["read"] == 5000 and not s3.get("estimated"),
   "«Misura tutto» reads all; then the full measure answers the next asking")

print(f"\n{checks - len(fails)}/{checks} checks")
sys.exit(1 if fails else 0)
