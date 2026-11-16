// MICRO-F-BUCKET-E-TILESET p.1 · executable check of src/bucket-view.ts (the
// rows of Archive ▸ Files ▸ Bucket, the steps of its path, what it says when
// there is no bucket) and of the bridge's GET /bucket/list on a FAKE local S3
// (moto's server, from s3Dgraphy's venv): folders, pages, a search, «not
// configured» and «does not answer» said, never a 500.
//
//   node scripts/check-bucket-view.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const b = await esbuild.build({ entryPoints: [`${SRC}bucket-view.ts`], bundle: true, format: "esm", write: false, logLevel: "silent" });
const B = await import("data:text/javascript;base64," + Buffer.from(b.outputFiles[0].text).toString("base64"));
let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };
const t = (k, v = {}) => `${k}${Object.keys(v).length ? " " + JSON.stringify(v) : ""}`;

const page = { ok: true, bucket: "em-assets", base: "heriverse/", prefix: "heriverse/rilievi/",
  folders: ["heriverse/rilievi/2015/"],
  objects: [{ key: "heriverse/rilievi/Survey_2015.3tz", name: "Survey_2015.3tz", size: 2048, modified: "2026-11-16T10:00:00+00:00", address: "s3://em-assets/heriverse/rilievi/Survey_2015.3tz" },
    { key: "heriverse/rilievi/pianta.dxf", name: "pianta.dxf", size: 10, modified: null, address: "s3://em-assets/heriverse/rilievi/pianta.dxf" }],
  next_token: "tok1", ms: 12.4 };
const rows = B.bucketEntries([page, { ...page, folders: [], objects: [page.objects[0]], next_token: null, ms: 3 }]);
eq(rows.map((r) => [r.type, r.name, r.ext]), [["dir", "2015", ""], ["file", "Survey_2015.3tz", "3tz"], ["file", "pianta.dxf", "dxf"]], "rows: folders, files, no repeats across pages");
eq(rows[0].address, "s3://em-assets/heriverse/rilievi/2015/", "a folder has its address too");
eq(rows[1].mtime, Date.parse("2026-11-16T10:00:00+00:00"), "the date as a time to sort by");
eq(B.bucketCrumbs("heriverse/rilievi/2015/", "heriverse/", "em-assets"),
  [{ label: "em-assets", prefix: "heriverse/" }, { label: "rilievi", prefix: "heriverse/rilievi/" }, { label: "2015", prefix: "heriverse/rilievi/2015/" }], "the steps of the path, from the base");
eq(B.bucketUp("heriverse/rilievi/2015/", "heriverse/"), "heriverse/rilievi/", "up one level");
eq(B.bucketUp("heriverse/", "heriverse/"), "heriverse/", "never above the base");
eq(B.bucketUp("a/", ""), "", "to the top");
eq(B.bucketRefusal({ ok: false, configured: false, where: "W" }, t), 'bucket.none {"where":"bucket.where"}', "not configured: one line, with where (in the page's language)");
eq(B.bucketRefusal({ ok: false, configured: true, reachable: false, bucket: "b", endpoint: "e", error: "x", where: "W" }, t),
  'bucket.unreachable {"bucket":"b","endpoint":"e","why":"x","where":"bucket.where"}', "does not answer: said");
eq(B.bucketRefusal(null, t), "bucket.bridgeDown", "no bridge: said");
eq(B.bucketRefusal(page, t), null, "a list: nothing to say");
eq(B.bucketStatus([page], 3, t), 'bucket.status {"folders":1,"objects":2,"shown":3,"pages":1,"ms":12} · bucket.more', "the foot says the pages and that there is more");
eq(B.bucketBytes(2048), "2.0 KB", "sizes");

// the bridge's route on a fake S3 (moto), when s3Dgraphy's venv has it
const S3D = path.resolve(new URL("../../../s3Dgraphy", import.meta.url).pathname);
const PY = path.join(S3D, ".venv/bin/python");
const TOOLS = path.resolve(new URL("../../tools", import.meta.url).pathname);
let live = "skipped (no s3Dgraphy venv with moto)";
if (fs.existsSync(PY)) {
  let out = null;
  try {
    out = execFileSync(PY, ["-c", `import json,os,sys,time
sys.path.insert(0, ${JSON.stringify(path.join(S3D, "src"))}); sys.path.insert(0, ${JSON.stringify(TOOLS)})
from moto.server import ThreadedMotoServer
import boto3
srv = ThreadedMotoServer(port=0, verbose=False); srv.start(); host, port = srv.get_host_and_port()
os.environ.update(S3_ENDPOINT=f"http://{host}:{port}", S3_BUCKET="em-assets", S3_PREFIX="", S3_ACCESS_KEY_ID="test", S3_SECRET_ACCESS_KEY="test")
c = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1")
c.create_bucket(Bucket="em-assets")
for i in range(300): c.put_object(Bucket="em-assets", Key=f"foto/IMG_{i:04d}.jpg", Body=b"x")
c.put_object(Bucket="em-assets", Key="rilievi/Survey_2015.3tz", Body=b"tz")
import em_bridge as EB
top = EB._bucket_list({})
p1 = EB._bucket_list({"prefix": ["foto/"], "limit": ["200"]})
p2 = EB._bucket_list({"prefix": ["foto/"], "limit": ["200"], "token": [p1["next_token"]]})
s = EB._bucket_list({"q": ["survey"]})
os.environ["S3_BUCKET"] = "nessuno"; gone = EB._bucket_list({})
srv.stop()
os.environ.pop("S3_ENDPOINT"); none = EB._bucket_list({})
print(json.dumps({"top": [top["folders"], [o["name"] for o in top["objects"]]], "p1": [len(p1["objects"]), bool(p1["next_token"])],
  "p2": [len(p2["objects"]), p2["next_token"]], "addr": p1["objects"][0]["address"], "s": [o["key"] for o in s["objects"]],
  "gone": [gone["ok"], gone.get("configured"), gone.get("reachable")], "none": [none["ok"], none["configured"], "S3_ENDPOINT" in none["where"]],
  "secret": "test" in json.dumps([top, p1, gone, none])}))`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { live = `skipped (${String(e.stderr || e.message).trim().split("\n").pop()})`; }
  if (out) {
    const r = JSON.parse(out.trim().split("\n").pop());
    eq(r.top, [["foto/", "rilievi/"], []], "the bridge: the top level, folders only");
    eq(r.p1, [200, true], "the bridge: a page of 200, a token for the next");
    eq(r.p2, [100, null], "the bridge: the last page, no token");
    eq(r.addr, "s3://em-assets/foto/IMG_0000.jpg", "the bridge: each object with its address");
    eq(r.s, ["rilievi/Survey_2015.3tz"], "the bridge: a search by name in the whole bucket");
    eq(r.gone, [false, true, false], "the bridge: a bucket that does not answer is said, not a 500");
    eq(r.none, [false, false, true], "the bridge: no bucket configured is said, with where");
    eq(r.secret, false, "no secret in any answer");
    live = "moto";
  }
}
console.log(`check-bucket-view: ${checks} checks passed (bridge on a fake S3: ${live})`);
