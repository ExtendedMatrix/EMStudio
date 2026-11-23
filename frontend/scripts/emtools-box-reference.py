"""MICRO-PX2 · the reference values of EM Tools' «Proxy Box Creator» for
check-box-seven-points.mjs, computed by EM Tools' OWN code without Blender.

`calculate_box_geometry` (EM-blender-tools/proxy_box_creator/utils.py) is read
from its source with `ast` and run with a minimal stand-in of mathutils.Vector
(+, −, × scalar, /, x y z, normalized, project, length — the operations it
uses, with mathutils' semantics: a zero vector normalises to zero). The pivot
is create_box_mesh's rule (centre x y; z at quota_min, the centre or quota_max).

    python3 scripts/emtools-box-reference.py [path/to/EM-blender-tools] > /tmp/ref.json

The output is the JSON block pasted in check-box-seven-points.mjs (EMTOOLS_REF).
"""
import ast
import json
import math
import os
import sys


class Vector:
    def __init__(self, t):
        self.v = [float(c) for c in t]

    x = property(lambda s: s.v[0])
    y = property(lambda s: s.v[1])
    z = property(lambda s: s.v[2])

    def __add__(self, o): return Vector([a + b for a, b in zip(self.v, o.v)])
    __radd__ = lambda s, o: s if o == 0 else s.__add__(o)
    def __sub__(self, o): return Vector([a - b for a, b in zip(self.v, o.v)])
    def __mul__(self, k): return Vector([a * k for a in self.v])
    __rmul__ = __mul__
    def __truediv__(self, k): return Vector([a / k for a in self.v])
    def dot(self, o): return sum(a * b for a, b in zip(self.v, o.v))

    @property
    def length(self): return math.sqrt(self.dot(self))

    def normalized(self):
        n = self.length
        return Vector([0, 0, 0]) if n == 0 else self / n

    def project(self, o):
        d = o.dot(o)
        return Vector([0, 0, 0]) if d == 0 else o * (self.dot(o) / d)

    def __repr__(self): return f"Vector({self.v})"


def load_emtools(root):
    src = open(os.path.join(root, "proxy_box_creator", "utils.py"), encoding="utf-8").read()
    tree = ast.parse(src)
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "calculate_box_geometry")
    mod = ast.Module(body=[fn], type_ignores=[])
    ns = {"Vector": Vector, "List": list, "Dict": dict, "print": lambda *a, **k: None}
    exec(compile(mod, "utils.py:calculate_box_geometry", "exec"), ns)
    return ns["calculate_box_geometry"]


# the seven points of each case, Blender's frame (Z up), in EM Tools' order:
# alignment start, alignment end, thickness, quota min, quota max, length start, length end
CASES = {
    "axis": [(0, 0, 0), (5, 0, 0), (2, 0.6, 0), (1, 0.3, -0.2), (1, 0.3, 1.8), (0.5, 0, 0.5), (4.5, 0.1, 0.7)],
    "rotated_sloped": [(1, 2, 10.0), (1 + 4 * math.cos(0.5236), 2 + 4 * math.sin(0.5236), 10.3), (2.2, 1.1, 10.1),
                       (2, 3, 9.4), (2.5, 3.1, 11.65), (0.7, 1.9, 10.2), (4.6, 3.9, 10.4)],
    "thickness_other_side": [(0, 0, 0), (0, 6, 0), (-0.8, 3, 0), (0, 1, 0), (0, 1, 2.5), (0, 0.4, 0), (0, 5.2, 0)],
    "utm": [(291234.512, 4643110.204, 492.130), (291238.900, 4643112.817, 492.150), (291237.400, 4643111.400, 492.140),
            (291236.000, 4643111.000, 491.820), (291236.000, 4643111.000, 493.410), (291235.000, 4643110.600, 492.100),
            (291238.300, 4643112.500, 492.200)],
    "thickness_high": [(0, 0, 0), (4, 0, 0), (2, 0.6, 1.0), (1, 0.3, 0), (1, 0.3, 1.5), (0, 0, 0), (4, 0, 0)],
    "length_reversed": [(0, 0, 0), (5, 0, 0), (2, 0.6, 0), (1, 0.3, 0), (1, 0.3, 1.5), (4.0, 0, 0), (1.0, 0, 0)],
    "quota_inverted": [(0, 0, 0), (5, 0, 0), (2, 0.6, 0), (1, 0.3, 1.5), (1, 0.3, 0), (0.5, 0, 0), (4.5, 0, 0)],
}


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "..", "EM-blender-tools")
    calc = load_emtools(root)
    out = {}
    for name, pts in CASES.items():
        g = calc([Vector(p) for p in pts])
        c = g["center"]
        out[name] = {
            "points": [list(p) for p in pts],
            "vertices": [[round(x, 9) for x in v.v] for v in g["vertices"]],
            "dimensions": [round(x, 9) for x in g["dimensions"]],
            "pivot": {"bottom": [c.x, c.y, g["quota_min"]], "center": c.v, "top": [c.x, c.y, g["quota_max"]]},
        }
        out[name]["pivot"] = {k: [round(x, 9) for x in v] for k, v in out[name]["pivot"].items()}
    json.dump(out, sys.stdout, indent=1)


if __name__ == "__main__":
    main()
