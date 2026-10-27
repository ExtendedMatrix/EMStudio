// SHELF1 · executable check of src/shelf.ts — the wide list.
//
//   node scripts/check-shelf.mjs
//
// Same harness as check-tiling/check-identity: bundled with the project's own
// esbuild and exercised in node, with a stub localStorage and crypto.randomUUID.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import * as Sorg from "./sorgenti.mjs";
import { randomUUID } from "node:crypto";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) globalThis.crypto.randomUUID = randomUUID;

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({
  entryPoints: [`${SRC}shelf.ts`],
  bundle: true,
  format: "esm",
  write: false,
});
const S = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

let checks = 0;
const ok = (cond, what) => {
  assert.ok(cond, what);
  checks++;
};
const eq = (got, want, what) => {
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
  checks++;
};

const DIGEST_A = "sha256:" + "ab".repeat(32);
const DIGEST_B = "sha256:" + "cd".repeat(32);

// ── adding, and the two axes ────────────────────────────────────────────────
{
  S.clearShelf();
  const local = S.addToShelf({
    locator: "/dati/scavo/foto1.jpg", name: "foto1",
    checksum: DIGEST_A, scope: "own-study", residency: "resident",
  });
  eq(local.kind, "image", "a .jpg is an image");
  eq(local.checksum, DIGEST_A, "the digest is kept");
  eq(S.shelfEntries().length, 1, "one entry");

  const lod = S.addToShelf({
    locator: "https://ecch.example/object/42", name: "comparandum",
    scope: "other-HDT",
  });
  eq(lod.checksum, undefined, "a pure URI has no digest: there are no bytes here to hash");
  eq(S.effectiveResidency(lod), "reference", "…and it reads as a reference");
  eq(S.effectiveScope(lod), "other-HDT", "the fence it was given");
  eq(S.shelfEntries().length, 2, "two entries");
}

// ── the same bytes are one resource ─────────────────────────────────────────
//
// The file is called something else and lives somewhere else: no name-based
// check can see this, which is exactly why the digest exists.
{
  S.clearShelf();
  const first = S.addToShelf({ locator: "/dati/2024/foto.jpg", name: "foto", checksum: DIGEST_A });
  const again = S.addToShelf({ locator: "/backup/copia_di_foto.jpg", name: "copia", checksum: DIGEST_A });
  eq(first.id, again.id, "the same digest lands on the same entry");
  eq(S.shelfEntries().length, 1, "and the shelf does not grow");

  const other = S.addToShelf({ locator: "/dati/altra.jpg", name: "altra", checksum: DIGEST_B });
  ok(other.id !== first.id, "a different digest is a different resource");
  eq(S.shelfEntries().length, 2, "two now");

  // a re-drag may still SAY something new — without creating a place to say it
  S.addToShelf({ locator: "/dati/2024/foto.jpg", checksum: DIGEST_A, scope: "own-HDT" });
  eq(S.shelfEntries().length, 2, "still two");
  eq(S.shelfEntries().find((e) => e.checksum === DIGEST_A).scope, "own-HDT",
     "…and the new scope was recorded on the entry that was already there");
}

// ── absent means UNKNOWN, and the reading stays on the consumer's side ──────
{
  S.clearShelf();
  const bare = S.addToShelf({ locator: "/dati/senza_nulla.png" });
  eq(bare.scope, undefined, "nothing was recorded");
  eq(bare.residency, undefined, "…nothing at all");
  eq(S.effectiveScope(bare), "own-study", "the sane reading of a local file");
  eq(S.effectiveResidency(bare), "resident", "…and it is here");
  const remote = S.addToShelf({ locator: "s3://bucket/key.png" });
  eq(S.effectiveResidency(remote), "reference", "an s3 locator reads as a reference");
}

// ── it is a GRAPH: save and reopen ──────────────────────────────────────────
{
  S.clearShelf();
  S.renameShelf("Scavo 2026");
  S.addToShelf({ locator: "/dati/a.jpg", name: "a", checksum: DIGEST_A,
                 scope: "own-study", residency: "resident" });
  S.addToShelf({ locator: "https://ecch.example/o/1", name: "comp", scope: "other-HDT" });

  const doc = S.shelfToDocument();
  eq(doc.graph.data.em_collection, "ShelfGraph", "the marker is the Heriverse/s3Dgraphy one");
  eq(doc.graph.nodes.length, 2, "two resource nodes");
  eq(doc.graph.nodes[0].node_type, "resource", "…of the resource type");
  // written where s3Dgraphy reads them
  const withDigest = doc.graph.nodes.find((n) => n.data.checksum);
  eq(withDigest.data.checksum, DIGEST_A, "the digest is in node.data.checksum");
  eq(withDigest.data.scope, "own-study", "…scope beside it");
  eq(withDigest.data.residency, "resident", "…and residency");
  const lodNode = doc.graph.nodes.find((n) => n.data.url.startsWith("https:"));
  ok(!("checksum" in lodNode.data), "and a URI resource writes NO checksum key at all");
  ok(!("residency" in lodNode.data), "…nor a residency nobody recorded");

  S.clearShelf();
  eq(S.shelfEntries().length, 0, "cleared");
  const loaded = S.loadShelfDocument(doc);
  eq(loaded, { ok: true, count: 2 }, "the shelf reopens");
  eq(S.shelfMeta().name, "Scavo 2026", "…with its name");
  eq(S.shelfEntries().length, 2, "…and its entries");
  eq(S.shelfEntries().find((e) => e.checksum === DIGEST_A).scope, "own-study", "…and their fences");
}

// ── a study graph is NOT a shelf ────────────────────────────────────────────
//
// Reading one "as a shelf" would silently turn its documents into shelf
// entries, and nobody would be able to tell what they were holding.
{
  const study = { header: {}, graph: { graph_id: "s", nodes: [
    { id: "res1", node_type: "resource", name: "x", data: { url: "/a.png" } }] } };
  eq(S.loadShelfDocument(study), { ok: false, reason: "not-a-shelf" },
     "an unmarked graph is refused even though it HAS resources");
  eq(S.loadShelfDocument(null), { ok: false, reason: "not-a-shelf" }, "so is nothing at all");
  eq(S.isShelfDocument(S.shelfToDocument()), true, "…while a shelf identifies itself");
}

// ── what the annotator can work on ──────────────────────────────────────────
{
  S.clearShelf();
  const img = S.addToShelf({ locator: "/a/foto.png" });
  const pdf = S.addToShelf({ locator: "/a/relazione.pdf" });
  const zip = S.addToShelf({ locator: "/a/dati.zip" });
  ok(S.isAnnotatable(img), "an image can be annotated");
  ok(S.isAnnotatable(pdf), "a PDF page can be annotated");
  ok(!S.isAnnotatable(zip), "an archive cannot");
}

// ── MICRO-ARCHIVIO-1 · the shelf is the project's: no copy in the browser ──
{
  mem.clear();
  S.clearShelf();
  S.renameShelf("Del progetto");
  S.addToShelf({ locator: "/dati/x.jpg", checksum: DIGEST_B });
  eq([...mem.keys()].filter((k) => k.startsWith("emstudio.shelf")), [],
     "a change to the shelf writes nothing in the browser: the em.json is the save");
  S.resetShelf();
  eq(S.shelfEntries().length, 0, "resetShelf empties it");
  eq(S.shelfMeta(), { id: "shelf", name: "Shelf" }, "…and gives back the default name");
  eq(S.legacyShelf(), null, "no old key, nothing to offer");
  mem.set("emstudio.shelf", JSON.stringify({ id: "shelf", name: "Vecchio", entries: [
    { id: "o1", name: "a.jpg", locator: "/vecchio/a.jpg", checksum: DIGEST_A },
    { id: "o2", name: "b.jpg", locator: "/vecchio/b.jpg" }, { bad: true }] }));
  const old = S.legacyShelf();
  eq(old?.entries.length, 2, "the old key is READ (the unreadable entry left out)…");
  eq(S.shelfEntries().length, 0, "…and not loaded");
  S.addToShelf({ locator: "/progetto/a-copia.jpg", checksum: DIGEST_A });
  eq(S.adoptLegacyEntries(old.entries), 1, "adopting it puts on the shelf only what was not there (same digest = same entry)");
  eq(S.shelfEntries().length, 2, "two entries in all");
  S.markLegacyShelfAsked();
  eq(S.legacyShelf(), null, "asked once: not offered again");
  ok(mem.has("emstudio.shelf"), "…and the old list is left where it was, not deleted");
  mem.clear();
}

// ── SHELF-B · the role: carried, persisted, never validated on this side ────
{
  S.clearShelf();
  const mine = S.addToShelf({
    locator: "s3://em-assets/aabbcc", name: "tempio (mio)",
    checksum: DIGEST_A, scope: "own-study", residency: "resident",
    // MY OWN asset, held up as a comparandum: the cell that proves the role is
    // not derived from the fence
    role: "comparandum",
  });
  const theirs = S.addToShelf({
    locator: "https://zenodo.org/records/12345", name: "altrove",
    scope: "other-HDT", role: "internal_source",
  });
  const unset = S.addToShelf({ locator: "/scavi/us12.jpg", scope: "own-study" });
  eq(mine.role, "comparandum", "an own-study asset can be a comparandum");
  eq(theirs.role, "internal_source", "…and somebody else's URI an internal source");
  eq(unset.role, undefined, "an unstated role stays unstated (no default)");
  ok(!("effectiveRole" in S), "there is no effectiveRole: neither value is a default");

  const doc = S.shelfToDocument();
  const roles = Object.fromEntries(
    doc.graph.nodes.map((n) => [n.name, n.data.role]));
  eq(roles["tempio (mio)"], "comparandum", "the role goes where s3Dgraphy reads it");
  eq(roles["altrove"], "internal_source", "…for both");
  ok(!("role" in doc.graph.nodes.find((n) => n.name === "us12.jpg").data),
     "…and an unstated one writes nothing");

  S.clearShelf();
  S.loadShelfDocument(doc);
  eq(S.shelfEntries().find((e) => e.checksum === DIGEST_A).role, "comparandum",
     "the role survives a reopen");

  // a value this side has never heard of must NOT be dropped: the vocabulary is
  // the library's, and a reader with its own allow-list would eat the day a
  // third role is declared
  const future = {
    header: {}, graph: {
      graph_id: "s", name: "S", data: { em_collection: "ShelfGraph" },
      nodes: [{ id: "r9", node_type: "resource", name: "domani",
                data: { url: "/a/b.jpg", role: "un_terzo_ruolo" } }],
    },
  };
  S.loadShelfDocument(future);
  eq(S.shelfEntries()[0].role, "un_terzo_ruolo",
     "a role the library accepts is carried even if this side has never seen it");
}

// ── SHELF-B · nothing the library wrote is dropped on the way through ──────
//
// Measured before it was written: a URI entry acquired through s3Dgraphy comes
// back with media_type / access / origin / size, this list models none of them,
// and adopting the library's shelf lost them — the next table read showed blank
// cells for fields that had been correctly filled one call earlier.
{
  const doc = {
    header: {}, graph: {
      graph_id: "shelf", name: "S", data: { em_collection: "ShelfGraph" },
      nodes: [{
        id: "r-uri", node_type: "resource", name: "tempio.glb",
        data: {
          url: "https://zenodo.org/records/12345/files/tempio.glb",
          role: "internal_source",
          media_type: "model/gltf-binary",
          access: { mode: "subscribe", endpoint: "https://zenodo.org/login" },
          origin: { repo: "zenodo.org", capabilities: [], protocol: "https" },
          size: 1234,
          un_campo_di_domani: "che questo file non conosce",
        },
      }],
    },
  };
  S.clearShelf();
  S.loadShelfDocument(doc);
  const entry = S.shelfEntries()[0];
  eq(entry.role, "internal_source", "the modelled field is modelled");
  eq(entry.extra.media_type, "model/gltf-binary", "…and the unmodelled ones are kept");
  eq(entry.extra.access.mode, "subscribe", "…including a nested one");
  eq(entry.extra.un_campo_di_domani, "che questo file non conosce",
     "…including one nobody here has heard of");
  ok(!("role" in entry.extra), "a modelled key is not duplicated into the bag");

  const back = S.shelfToDocument().graph.nodes[0].data;
  eq(back.media_type, "model/gltf-binary", "…and it goes back out");
  eq(back.access.mode, "subscribe", "…nested and all");
  eq(back.origin.repo, "zenodo.org", "…origin too");
  eq(back.role, "internal_source", "…while the modelled field still wins");
  eq(back.un_campo_di_domani, "che questo file non conosce",
     "…and tomorrow's field survives a round trip through today's code");
}

// ── SHELF-B · the TABLE is a read-model, and it computes nothing ────────────
{
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}shelf-table.ts`],
    bundle: true, format: "esm", write: false,
  });
  const T = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
  const answer = {
    columns: ["ID", "NAME", "RESIDENCE", "ROLE", "MODE", "SIZE"],
    rows: [
      { ID: "r1", NAME: "tempio", RESIDENCE: "s3", ROLE: "comparandum",
        MODE: "used_in_graph", SIZE: 104857 },
      { ID: "r2", NAME: "foto", RESIDENCE: "uri", ROLE: "", MODE: "only_shelf",
        SIZE: "" },
    ],
    roles: ["comparandum", "internal_source"],
    access_modes: ["open", "subscribe"],
    shelf: { graph_id: "shelf" },
  };
  const table = T.parseShelfTable(answer);
  eq(table.columns, answer.columns, "the column ORDER is the library's, kept");
  eq(table.rows.length, 2, "both rows");
  eq(table.roles, ["comparandum", "internal_source"], "the vocabulary travels with it");
  eq(table.accessModes, ["open", "subscribe"], "…and so do the access modes");
  eq(T.rowId(table.rows[0]), "r1", "a row knows its id");
  eq(T.findRow(table, "r2").NAME, "foto", "…and can be found by it");

  // the three badges, and NOT a fourth: what is a badge is a presentation
  // decision, what a badge MEANS is not ours
  eq([...T.BADGE_COLUMNS], ["RESIDENCE", "ROLE", "MODE"], "three badge columns");
  ok(T.isBadgeColumn("MODE") && !T.isBadgeColumn("LOCATOR"), "…and only those");
  eq(T.badgeClass("MODE", "used_in_graph"), "shelf-badge b-mode v-used_in_graph",
     "the class carries the value verbatim — the COLOUR lives in style.css");
  eq(T.badgeClass("ROLE", ""), "shelf-badge b-role v-unset",
     "…and an unstated value is marked as unstated, not as something");
  eq(T.badgeClass("ROLE", "un terzo ruolo"), "shelf-badge b-role v-un-terzo-ruolo",
     "a value nobody planned for still becomes a usable class");

  eq(T.humanSize(104857), "102 kB", "a size is formatted, never re-parsed");
  eq(T.humanSize(1536), "1.5 kB", "…with one decimal only where it says something");
  eq(T.humanSize(""), "", "…and an absent one stays absent (not 0 B)");
  eq(T.cellText(table.rows[1], "ROLE"), "", "an empty cell is empty");
  eq(T.cellText(table.rows[0], "SIZE"), "104857", "…and a number is still the number");

  // an answer that is NOT a table must not read as an empty shelf: drawing zero
  // rows for a proxy's HTML error page is a lie the user cannot see through
  eq(T.parseShelfTable(null), null, "nothing is not a table");
  eq(T.parseShelfTable({ ok: true }), null, "…nor is a bare ok");
  eq(T.parseShelfTable({ columns: [], rows: [] }), null, "…nor is a table with no columns");
  eq(T.parseShelfTable({ columns: ["ID"], rows: [] }).rows, [],
     "…while a real table with no rows IS an empty shelf");

  // THE constraint: this module answers nothing about a row. No locator, and
  // not one of the badge VALUES written down anywhere in it.
  //
  // Asked of the PROGRAM (`sorgenti.mjs`, the shared reader) and not of the
  // file. The text search this replaced said the module mentions the badge
  // value "subscribe" the moment somebody wrote `const unsubscribe = …`.
  const src = await (await import("node:fs/promises"))
    .readFile(`${SRC}shelf-table.ts`, "utf8");
  ok(Sorg.indirizziNelCodice(src).length === 0,
     "no locator in the code: residence is not computed here");
  ok(!Sorg.stringheLetterali(src).some((v) => /^s3:/.test(v)), "…nor an s3 address");
  for (const value of ["s3", "only_shelf", "used_in_graph", "comparandum",
                       "internal_source", "subscribe"]) {
    ok(!Sorg.nomina(src, value),
       `the value "${value}" is never named: it is the library's`);
  }
}

console.log(`shelf: ${checks} checks passed`);
