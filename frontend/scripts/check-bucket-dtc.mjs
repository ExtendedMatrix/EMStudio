// MICRO-BK1 · every deposit into a room's bucket asks for, and writes, a DTC.
//
//   node scripts/check-bucket-dtc.mjs
//
// Three kinds of case:
//
//   · PURE — `bucket-dtc.ts` and `stamp-ingest.ts` through esbuild: the minimal
//     fields, the one rule that says when they are enough, what reaches the
//     stamp and the register, and the request the bucket's own route will take;
//   · STRUCTURAL — `main.ts` reads the rule and writes through it (a static read,
//     comments blanked first, as check-acquisition does);
//   · THE BRIDGE — a bridge of its own on a free port (as check-campagna), so the
//     stamp `/stamp/emit` returns is measured, not assumed: the kind, the source,
//     a capture's technique, and the declared licence / embargo in `declared`.
//
// Every rule has its counterexample: a technique on a retrieval is dropped, an
// act without options is the poor ingestion it always was.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOLS = new URL("../../tools/", import.meta.url).pathname;

async function load(entry) {
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
    loader: { ".svg": "text" },
  });
  return await import("data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64"));
}

const B = await load("bucket-dtc.ts");
const G = await load("stamp-ingest.ts");
const D = await load("bucket-door.ts");

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };

const ROOM = "em.localhost/aiano";
const dtc = (over = {}) => ({
  formalism: "dtc",
  who: {}, when: {},
  source: { kind: "ingest" },
  transformation: {},
  rights: { license: "CC-BY-4.0" },
  target: { room: ROOM, graphId: "graph:aiano", lotId: "lot-1", lotName: "Foto 2015" },
  ...over,
});

// ── PURE ────────────────────────────────────────────────────────────────────
console.log("· the vocabulary is the datamodel's");
{
  const rules = JSON.parse(await readFile(`${SRC}assets/em_visual_rules.json`, "utf8"));
  const axis = rules.dtc_kinds?.acquisition ?? {};
  const words = Object.keys(axis).filter((k) => !k.startsWith("_"));
  eq(B.sourceKinds().map((k) => k.kind).sort(), [...words].sort(),
     "the kinds offered ARE the acquisition axis, not a hand-written list");
  ok(words.includes(B.DEFAULT_SOURCE_KIND), "the default kind is in the vocabulary");
  eq(axis[B.DEFAULT_SOURCE_KIND]?.family, "retrieval",
     "…and it is a retrieval: «entered here», never «born here»");
  ok(B.isCapture("photo") && !B.isCapture("download"), "capture vs retrieval, from the families");
}

console.log("· the rule");
{
  eq(B.dtcProblem(dtc()), null, "an ingest with a licence is enough");
  eq(B.dtcProblem(dtc({ rights: { license: "" } })), "assets.needsLicense", "no licence, no deposit");
  eq(B.dtcProblem(dtc({ source: { kind: "invented" } })), "bucket.kindUnknown",
     "a kind outside the vocabulary is refused");
  eq(B.dtcProblem(dtc({ source: { kind: "photo" } })), "bucket.captureNeedsDate",
     "a capture without its date is refused: the act's date is not now() by default");
  eq(B.dtcProblem(dtc({ source: { kind: "photo" }, when: { madeAt: "2015-07-03" } })), null,
     "…with it, it is enough");
  eq(B.dtcProblem(dtc({ source: { kind: "photo" }, when: { madeAt: "3/7/2015" } })), "bucket.dateBad");
  eq(B.dtcProblem(dtc({ source: { kind: "download" } })), "bucket.downloadNeedsSource",
     "a download without where from is refused");
  eq(B.dtcProblem(dtc({ source: { kind: "download", retrievedFrom: "the old NAS" } })),
     "bucket.sourceNotUri", "«retrieved from» is a URL or a DOI; prose goes in the note");
  eq(B.dtcProblem(dtc({ source: { kind: "download", retrievedFrom: "10.5281/zenodo.123" } })), null);
  eq(B.dtcProblem(dtc({ source: { kind: "download", retrievedFrom: "https://x.org/a.zip" } })), null);
}

console.log("· what reaches the stamp");
{
  const cap = B.ingestionOptions(dtc({
    source: { kind: "photo", campaign: "Aiano 2015", note: "scatola 4" },
    when: { madeAt: "2015-07-03" },
    transformation: { technique: "close-range photogrammetry", software: "Metashape 2.1.3" },
    rights: { license: "CC-BY-4.0", embargoUntil: "2027-01-01", embargoReason: "tesi" },
    who: { author: "Ada Rossi", authorOrcid: "0000-0002-1825-0097" },
  }));
  eq(cap.kind, "photo");
  eq(cap.at, "2015-07-03T00:00:00Z", "a capture's act is dated by the capture");
  eq(cap.technique, "close-range photogrammetry");
  eq(cap.software, [{ name: "Metashape", version: "2.1.3" }], "«Name 1.2» → name + version");
  eq(cap.facts.campaign, "Aiano 2015");
  eq(cap.facts.source_note, "scatola 4");
  eq(cap.declared, { license: "CC-BY-4.0", embargo: "2027-01-01", reason: "tesi",
                     author: "0000-0002-1825-0097", author_name: "Ada Rossi" });

  // COUNTEREXAMPLE · a retrieval did not make the bytes: no technique, no
  // software, no campaign, and its act is dated by the deposit
  const ret = B.ingestionOptions(dtc({
    source: { kind: "download", retrievedFrom: "https://x.org/a.zip", campaign: "Aiano 2015" },
    when: { madeAt: "2015-07-03" },
    transformation: { technique: "close-range photogrammetry", software: "Metashape" },
  }));
  ok(!("technique" in ret) && !("software" in ret) && !("at" in ret),
     "a technique on a retrieval would be a claim about bytes somebody else made");
  ok(!("campaign" in ret.facts), "…nor a campaign");
  eq(ret.facts.retrieved_from, "https://x.org/a.zip");
  eq(ret.facts.content_date, "2015-07-03", "a retrieval's date is the content's, as a fact");

  const DEPOSIT = {
    resourceId: "res:abc", digest: "sha256:" + "a".repeat(64), name: "scatto-01.jpg",
    mediaType: "image/jpeg", sizeBytes: 9012, room: ROOM,
    operator: { id: "https://orcid.org/0000-0002-1825-0097" },
    at: "2026-11-27T10:00:00Z", tool: "EMStudio 1.6",
  };
  // COUNTEREXAMPLE · without options the act is the poor ingestion it always was
  const poor = G.ingestionAct([DEPOSIT], { room: ROOM });
  eq(poor.act.dtc_kind, "ingest");
  eq(poor.act.acquisition.name, `ingestione · ${ROOM}`, "the event's name is unchanged");
  ok(!("technique" in poor.act) && !("software" in poor.act) && !("declared" in poor),
     "nothing said, nothing written");

  const rich = G.ingestionAct([DEPOSIT], { room: ROOM }, cap);
  eq(rich.act.dtc_kind, "photo");
  eq(rich.act.at, "2015-07-03T00:00:00Z");
  eq(rich.act.technique, "close-range photogrammetry");
  eq(rich.act.acquisition.metadata.campaign, "Aiano 2015");
  eq(rich.act.acquisition.metadata.deposited_into, ROOM, "the deposit's facts stay");
  eq(rich.act.acquisition.name, "photo · Aiano 2015", "another kind is another event");
  eq(rich.declared.license, "CC-BY-4.0");
  eq(G.describeProvenance({ from: [], how: { dtc_kind: "photo", technique: rich.act.technique } }).depth,
     "origin", "a declared capture reads as «born here»");
  const fetched = G.ingestionAct([DEPOSIT], { room: ROOM }, ret);
  eq(G.describeProvenance({ from: [], how: { dtc_kind: fetched.act.dtc_kind,
       acquisition: fetched.act.acquisition.metadata } }).depth,
     "ingestion", "a download stays «entered», however rich its source");
}

console.log("· the register and the bucket's own route");
{
  const acq = B.registerAcquisition(dtc({ source: { kind: "download", retrievedFrom: "https://x.org" } }),
                                    "sha256:" + "b".repeat(64), "2026-11-27T10:00:00Z");
  eq(acq.dtc_kind, "download", "CorpusAct already takes dtc_kind: it is sent");
  eq(acq.acquisition_id, "lot-1", "the delivery's own id: a series is one event");
  eq(acq.metadata.retrieved_from, "https://x.org");

  const body = B.bucketRequest(dtc({
    source: { kind: "photo" }, when: { madeAt: "2015-07-03" },
    target: { room: ROOM, graphId: "graph:aiano", documentId: "doc-1" },
  }), { sha256: "sha256:" + "c".repeat(64), name: "a.jpg", mediaType: "image/jpeg", sizeBytes: 3 });
  eq(body.profile, B.BUCKET_DTC_PROFILE);
  eq(Object.keys(body).sort(),
     ["formalism", "object", "profile", "rights", "source", "target", "transformation", "when", "who"],
     "the minimal fields, named once");
  eq(body.target.document_id, "doc-1");
  eq(body.source.family, "capture");
  const text = JSON.stringify(body);
  ok(!/depositor|operator|attributor/.test(text),
     "the depositor is never in the body: the server takes it from the token");
  eq(B.bucketRequest(dtc({ source: { kind: "ingest" },
       transformation: { technique: "x" } }), { name: "a", mediaType: "x/y" }).transformation, {},
     "no transformation for a retrieval, in the request either");
}

// ── MICRO-BK2 · THE DOOR (pure) ─────────────────────────────────────────────
console.log("· the bucket's door: the record first, refusals in words");
{
  // who answers for publishing travels in `who`, and only when said
  const withResp = B.bucketRequest(dtc({ who: { responsible: "0000-0003-1111-1112" } }),
    { name: "a", mediaType: "x/y" });
  eq(withResp.who, { responsible: "0000-0003-1111-1112" }, "who.responsible is in the record");
  eq(B.bucketRequest(dtc(), { name: "a", mediaType: "x/y" }).who, {},
     "…and absent when nobody but the depositor answers (the server takes the token's)");
  // a lot is ONE act: the same declaration keeps its lot, another one does not
  const sig = (over) => B.lotSignature(dtc(over));
  eq(sig({}), sig({ target: { room: ROOM, graphId: "graph:aiano", lotId: "lot-2", lotName: "Foto 2015" } }),
     "the lot's own id is not part of what it declares");
  ok(sig({}) !== sig({ source: { kind: "download", retrievedFrom: "https://x.org/a" } }), "another kind, another lot");
  ok(sig({}) !== sig({ who: { responsible: "0000-0003-1111-1112" } }), "another responsible, another lot");
  ok(sig({}) !== sig({ rights: { license: "CC0-1.0" } }), "another licence, another lot");
  ok(!/"object"/.test(sig({})), "the file is not part of it");
  const main = await readFile(`${SRC}main.ts`, "utf8");
  ok(/ingestDraft\.lotKey !== lotKey\) ingestDraft\.lotId = null/.test(main),
     "publishQueue mints a new lot when the declaration changed");
  // the multipart: `dtc` FIRST, `file` after — the server refuses the other order
  const form = D.depositForm({ profile: "em-bucket-dtc/1" }, new Uint8Array([1, 2, 3]), "n.png", "image/png");
  const parts = [...form.entries()];
  eq(parts.map(([k]) => k), ["dtc", "file"], "the record first, then the bytes");
  eq(JSON.parse(parts[0][1]), { profile: "em-bucket-dtc/1" }, "the record is the request, as JSON");
  ok(parts[1][1].size === 3 && parts[1][1].type === "image/png" && parts[1][1].name === "n.png",
     "the file part carries the bytes, their type and their name");
  // the probe: only a clean 404/405 means «no door»; a non-answer is not a no
  eq([200, 404, 405, 401, 500, null].map(D.doorFromProbe), [true, false, false, null, null, null],
     "200 = the door, 404/405 = an older node, anything else = cannot tell");
  eq(D.doorUrl("https://n/em/", "aiano 2"), "https://n/em/v1/rooms/aiano%202/objects", "the door's URL");
  // every refusal the server words becomes the form's own key — measured
  // sentences of stratigraph-server app/objects.py (1e746f0)
  const R = (status, detail) => D.refusalOf(status, detail).key;
  eq(R(403, "depositing in x takes editor or above"), "assets.door.notEditor", "role");
  eq(R(413, "over 64 MiB this door does not take…"), "assets.door.tooBig", "size");
  const na = D.refusalOf(422, "0000-0002-9079-593X is not accredited on this node, so it cannot be …");
  eq([na.key, na.vars.orcid], ["assets.door.notAccredited", "0000-0002-9079-593X"],
     "an iD not accredited, named back");
  eq(R(422, "`rights.license` is missing: bytes nobody may use are bytes nobody will"), "assets.needsLicense", "licence");
  eq(R(422, "`source.dtc_kind` 'x' is not in the vocabulary's acquisition axis: …"), "bucket.kindUnknown", "kind");
  eq(R(422, "a download says where from: `source.retrieved_from` (a URL or a DOI)"), "bucket.downloadNeedsSource", "download");
  eq(R(422, "`source.retrieved_from` is read as a locator: 'x' is neither…"), "bucket.sourceNotUri", "locator");
  eq(R(422, "a capture IS the act that made the bytes, so it says when: `when.made_at`"), "bucket.captureNeedsDate", "capture date");
  eq(R(422, "a technique and a software say how the bytes were MADE: on a retrieval…"), "assets.door.noTechniqueOnRetrieval", "technique on retrieval");
  eq(R(422, "the bytes that arrived are sha256:a, not the sha256:b the record declares"), "assets.door.bytesChanged", "digest");
  eq(R(422, "`target.room` says 'a' and the call was made on 'b'"), "assets.door.otherRoom", "room");
  const other = D.refusalOf(400, "something new");
  eq([other.key, other.vars.detail], ["assets.door.refused", "something new"],
     "a sentence not known yet: the node's own words, never a number");
  eq(D.detailOf('{"detail":"x y"}'), "x y", "detail read from FastAPI's JSON");
  eq(D.detailOf("plain"), "plain", "…or the text itself");
  const I18N = await readFile(`${SRC}i18n.ts`, "utf8");
  const keys = ["assets.door.notEditor", "assets.door.tooBig", "assets.door.signIn",
    "assets.door.notAccredited", "assets.door.noTechniqueOnRetrieval", "assets.door.bytesChanged",
    "assets.door.otherRoom", "assets.door.refused", "assets.door.refusedFile",
    "assets.door.deposited", "assets.door.absent", "assets.door.tooBigOldWay", "assets.door.byDigest",
    "assets.responsibleNeedsOrcid", "assets.responsibleOrcidBad",
    "assets.responsibleNotForReference", "assets.responsibleNeedsDoor",
    "assets.responsibleHint", "assets.responsibleOrcid"];
  for (const k of keys) {
    ok((I18N.match(new RegExp(`"${k.replace(/\./g, "\\.")}":`, "g")) ?? []).length === 2,
       `${k} in EN and IT`);
  }
}

// ── STRUCTURAL ──────────────────────────────────────────────────────────────
console.log("· main.ts writes through the rule");
{
  const MAIN = (await readFile(`${SRC}main.ts`, "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
  const body = (sig) => {
    const at = MAIN.indexOf(sig);
    assert.ok(at > 0, `${sig} is in main.ts`);
    let depth = 0, i = MAIN.indexOf("{", at);
    const from = i;
    for (; i < MAIN.length; i++) {
      if (MAIN[i] === "{") depth++;
      else if (MAIN[i] === "}" && --depth === 0) return MAIN.slice(from, i + 1);
    }
    throw new Error(sig);
  };
  ok(/dtcProblem\(deliveryDtc\(\)\)/.test(body("function deliveryProblem()")),
     "the delivery is not signed until the DTC is enough");
  ok(/ingestionOptions\(deliveryDtc\(\)\)/.test(body("async function stampOne(")),
     "the stamp carries the act the person declared");
  ok(/registerAcquisition\(deliveryDtc\(\)/.test(body("async function landRow(")),
     "the register's acquisition carries the kind and the source");
  ok(/has_linked_resource/.test(body("async function landRow(")),
     "the chosen document is linked to each file");
  // MICRO-BK2 · the door
  const publish = body("async function publishQueue(");
  ok(/depositThroughDoor\(base, room, item, bytes\)/.test(publish),
     "publishQueue sends each file through the door");
  ok(publish.indexOf("depositThroughDoor(") < publish.indexOf('method: "PUT"'),
     "…and the older PUT is only the fallback branch, after it");
  ok(/door\.has !== false && bytes\.byteLength <= door\.limit/.test(publish),
     "…taken for a node without the door, or a file over the single piece");
  ok(/through\?\.refused/.test(publish) && /continue;/.test(publish.slice(publish.indexOf("through?.refused"))),
     "a refusal of the door stops that file: nothing goes the older way instead");
  const at = MAIN.indexOf("async function depositThroughDoor(");
  const door = MAIN.slice(at, MAIN.indexOf("\n}\n", at));
  ok(/bucketRequest\(deliveryDtc\(\), object\)/.test(door) && /depositForm\(/.test(door),
     "the door's first shape: multipart, the preview's record");
  ok(/answer\.status < 500\) return await refused/.test(door),
     "…a refusal (4xx) is final, only a broken door (5xx / no answer) tries the other shape");
  ok(door.indexOf('"Content-Type": "application/json"') > 0
       && door.indexOf("let answer = await ask()") < door.indexOf('method: "PUT"')
       && door.indexOf('method: "PUT"') < door.lastIndexOf("answer = await ask()"),
     "the second shape: the record by digest FIRST, then the bytes, then the record again");
  ok(/holds no/.test(door) && /expected_sha256=\$\{hex\}/.test(door),
     "…the bytes go only on «holds no», and the PUT checks their digest");
  ok(/refusalOf\(answer\.status/.test(door) && !/answer\.status\} \$\{await answer\.text/.test(door),
     "a refusal of the door is shown in words, never as «422 …»");
  const land = body("async function landRow(");
  ok(land.indexOf("item.byDoor") > 0 && land.indexOf("item.byDoor") < land.indexOf('registerAppend("resource"'),
     "through the door landRow does not write the three acts a second time");
  ok(/async function objectsDoor\([\s\S]{0,900}DOOR_PROFILE_PATH/.test(MAIN),
     "the door is detected at the profile's route");
  const draft = body("const ingestDraft: IngestDraft =");
  ok(/sourceKind:\s*DEFAULT_SOURCE_KIND/.test(draft), "the kind starts at the truthful default");
  ok(/license:\s*""/.test(draft), "and still no licence is chosen for anybody");
  ok(/documentId:\s*null/.test(draft), "the document starts undecided, pre-filled from the selection");
  const form = body("function ingestSource(");
  ok(/sourceKinds\(\)/.test(form), "the form's kinds come from the vocabulary");
  ok(!/"(depositor|operator)"/.test(form), "no box for the depositor");
}

// ── THE BRIDGE ──────────────────────────────────────────────────────────────
const S3D = new URL("../../../s3Dgraphy/", import.meta.url).pathname;
const PY = `${S3D}.venv/bin/python`;
const DTC = new URL("../../../dtcstamp/", import.meta.url).pathname;
let proc = null;
try {
  if (!existsSync(PY)) console.log("  (s3Dgraphy venv not found: the bridge cases are skipped)");
  else {
    console.log("· the stamp, measured on a bridge of this check");
    const dir = realpathSync(mkdtempSync(`${tmpdir()}/bucket-dtc-`));
    const port = await new Promise((res) => { const srv = createServer(); srv.listen(0, () => {
      const pt = srv.address().port; srv.close(() => res(pt)); }); });
    proc = spawn(PY, [`${TOOLS}em_bridge.py`, "--port", String(port), "--s3dgraphy", `${S3D}src`, "--fs-root", dir],
      { stdio: "ignore", env: { ...process.env, PYTHONPATH: `${S3D}src:${DTC}`, EM_BRIDGE_STATE_DIR: `${dir}/.state` } });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not yet */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    const emit = async (body) => (await fetch(`${base}/stamp/emit`, {
      method: "POST", body: JSON.stringify(body),
      headers: { Origin: "http://localhost:5173", "content-type": "application/json" },
    })).json();
    const item = (n) => ({
      resourceId: `res:${n}`, digest: "sha256:" + String(n).repeat(64).slice(0, 64),
      name: `f${n}.jpg`, mediaType: "image/jpeg", sizeBytes: 10, room: ROOM,
      operator: { id: "https://orcid.org/0000-0002-1825-0097" },
      at: "2026-11-27T10:00:00Z", tool: "EMStudio check",
    });

    const capture = await emit(G.ingestionAct([item(1)], { room: ROOM }, B.ingestionOptions(dtc({
      source: { kind: "photo", campaign: "Aiano 2015" }, when: { madeAt: "2015-07-03" },
      transformation: { technique: "close-range photogrammetry", software: "Metashape 2.1.3" },
      rights: { license: "CC-BY-4.0", embargoUntil: "2027-01-01", embargoReason: "tesi" },
    }))));
    const s1 = capture.stamps?.[0]?.stamp;
    ok(capture.ok && s1, `the bridge stamps a capture (${JSON.stringify(capture).slice(0, 200)})`);
    eq(s1.how.dtc_kind, "photo");
    eq(s1.how.technique, "close-range photogrammetry");
    eq(s1.how.software?.[0]?.name, "Metashape");
    eq(s1.how.acquisition?.campaign, "Aiano 2015");
    eq(s1.by.at, "2015-07-03T00:00:00Z", "the act is dated by the capture");
    eq(s1.declared?.license, "CC-BY-4.0", "the licence is IN the stamp now");
    eq(s1.declared?.embargo_until, "2027-01-01", "…and the embargo");
    ok(s1.declared?.as_of && s1.declared.as_of !== s1.by.at,
       `…as of the day it was SAID, not the day of the photograph (${s1.declared?.as_of})`);
    ok(String(s1.declared?.by?.id ?? JSON.stringify(s1.declared?.by ?? "")).includes("0000-0002-1825-0097"),
       `…signed by whoever deposited (${JSON.stringify(s1.declared)})`);

    const fetched = await emit(G.ingestionAct([item(2)], { room: ROOM }, B.ingestionOptions(dtc({
      source: { kind: "download", retrievedFrom: "https://x.org/a.zip", note: "Zenodo dump" },
    }))));
    const s2 = fetched.stamps?.[0]?.stamp;
    ok(fetched.ok && s2, "the bridge stamps a download");
    eq(s2.how.dtc_kind, "download");
    eq(s2.how.acquisition?.retrieved_from, "https://x.org/a.zip", "where from, in the stamp");
    eq(s2.how.acquisition?.source_note, "Zenodo dump");
    ok(!s2.how.technique, "no technique on a retrieval");
    eq(G.describeProvenance(s2).depth, "ingestion", "and it reads as entered, not born");

    // COUNTEREXAMPLE · the act without options: no declared block, as before
    const poor = await emit(G.ingestionAct([item(3)], { room: ROOM }));
    const s3 = poor.stamps?.[0]?.stamp;
    ok(poor.ok && s3 && !s3.declared, "nothing declared, nothing in `declared`");
    eq(s3.how.dtc_kind, "ingest");
  }
} finally {
  if (proc) proc.kill();
}

console.log(`\nbucket-dtc: ${checks} checks passed`);
