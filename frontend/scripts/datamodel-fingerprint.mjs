// The DATAMODEL FINGERPRINT, in JavaScript — the same digest s3Dgraphy computes.
//
//   node scripts/datamodel-fingerprint.mjs <dir>                 # print it
//   node scripts/datamodel-fingerprint.mjs --write <dir> <file>  # sync-datamodels.sh
//
// s3Dgraphy (`s3dgraphy.datamodel`, `api.datamodel_fingerprint()`) defines ONE
// digest for the datamodel JSONs a consumer copies: sha256 over their RFC 8785
// canonical forms, concatenated in order of file name, written `sha256:<hex>`.
// EMStudio vendors exactly those six files into `src/assets`, so it can ask the
// same question s3Dgraphy's `consumer_drift` asks — *are my copies still what
// s3Dgraphy declares?* — without Python.
//
// RFC 8785 is what `JSON.stringify` over sorted keys already writes: numbers as
// ECMAScript writes them (`1.0` is `1`: em_visual_rules.json has 139 of them),
// keys sorted by UTF-16 code unit (the default `sort()`), strings escaped as
// `JSON.stringify` escapes them. So the canonical form below is five lines, and
// `check-datamodel.mjs` cross-checks it against s3Dgraphy's Python whenever a
// python with s3dgraphy is on this machine.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

//: name -> [file, path of its version key]. The NAMES are s3Dgraphy's
//: (`DATAMODEL_FILES`): a difference is reported under them everywhere.
export const DATAMODEL_FILES = {
  nodes: ["s3Dgraphy_node_datamodel.json", ["s3Dgraphy_data_model_version"]],
  node_registry: ["node_registry.generated.json", ["s3Dgraphy_data_model_version"]],
  connections: ["s3Dgraphy_connections_datamodel.json", ["s3Dgraphy_connections_model_version"]],
  visual_rules: ["em_visual_rules.json", ["version"]],
  qualia: ["em_qualia_types.json", ["metadata", "version"]],
  translations: ["datamodel_translations.json", ["version"]],
};

/** RFC 8785 (JSON Canonicalization Scheme). */
export const canonical = (v) =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? "[" + v.map(canonical).join(",") + "]"
      : "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";

const sha = (bytes) => "sha256:" + createHash("sha256").update(bytes).digest("hex");

const versionOf = (doc, path) => {
  let at = doc;
  for (const key of path) {
    if (!at || typeof at !== "object") return null;
    at = at[key];
  }
  return at === undefined || at === null ? null : String(at);
};

/** `{digest, versions, digests, files}` of the six files in `dir` — the shape
 *  of s3Dgraphy's `datamodel_fingerprint()`. A missing file throws: a partial
 *  set has no fingerprint. */
export function fingerprint(dir) {
  const versions = {}, digests = {}, files = {}, byFile = {};
  for (const [name, [file, path]] of Object.entries(DATAMODEL_FILES)) {
    const doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const canon = Buffer.from(canonical(doc), "utf8");
    versions[name] = versionOf(doc, path);
    digests[name] = sha(canon);
    files[name] = file;
    byFile[file] = canon;
  }
  const whole = createHash("sha256");
  for (const file of Object.keys(byFile).sort()) whole.update(byFile[file]);
  return { digest: "sha256:" + whole.digest("hex"), versions, digests, files };
}

/** What `found` (the copy) holds differently from `expected`, one named line
 *  each, copy first — the wording of s3Dgraphy's `fingerprint_differences`. */
export function differences(expected, found) {
  const lines = [];
  const wantV = expected.versions || {}, haveV = found.versions || {};
  const wantD = expected.digests || {}, haveD = found.digests || {};
  for (const [name, want] of Object.entries(wantV)) {
    if (!(name in haveV)) lines.push(`${name}: absent in the copy (${want} in the source)`);
    else if (haveV[name] !== want) lines.push(`${name} ${haveV[name]} vs ${want}`);
    else if (name in wantD && name in haveD && wantD[name] !== haveD[name])
      lines.push(`${name} ${want}: same version, different content`);
  }
  if (!lines.length && expected.digest && found.digest && expected.digest !== found.digest)
    lines.push(`digest ${found.digest} vs ${expected.digest}`);
  return lines;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === "--write") {
    const [, dir, out, s3dgraphy] = args;
    const fp = fingerprint(dir);
    // no timestamp on purpose: a sync that changed nothing leaves no diff
    const doc = { ...fp, s3dgraphy: s3dgraphy || null,
                  _note: "written by scripts/sync-datamodels.sh; checked by scripts/check-datamodel.mjs. Never edit by hand." };
    writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
    console.log(`  fingerprint      ${fp.digest}`);
  } else {
    console.log(JSON.stringify(fingerprint(args[0] || "src/assets"), null, 2));
  }
}
