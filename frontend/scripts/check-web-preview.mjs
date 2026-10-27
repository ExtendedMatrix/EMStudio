// MICRO-ARCHIVIO-1 · executable check of src/web-preview.ts — what a REMOTE
// entry of the Shelf looks like, read from its address with its source said:
// Arachne (iDAI.objects), IIIF image and manifest (v2, v3), the address's own
// form, and the page's self-description through the bridge (`/web-meta`).
// The two reads are stubs here: no network.
//
//   node scripts/check-web-preview.mjs
import * as esbuild from "esbuild";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url).pathname;
const bundle = await esbuild.build({ entryPoints: [`${SRC}web-preview.ts`], bundle: true, format: "esm", write: false });
const W = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

let checks = 0;
const eq = (got, want, what) => { assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`); checks++; };

// a real record of Arachne (1179876, shortened), as its data API answers
const ARACHNE = { title: "Architrav mit Rankenfries", type: "Einzelobjekte", thumbnailId: 413653,
  facet_ort: ["Köln, Deutschland"], facet_material: ["Kalkstein"], dates: [{ label: "claudisch" }],
  images: [{ imageId: 413653 }] };
const asked = [];
const deps = (json = {}, meta = {}) => ({
  fetchJson: async (u) => { asked.push(["json", u]); return json[u] ?? null; },
  webMeta: async (u) => { asked.push(["meta", u]); return u in meta ? meta[u] : null; },
});

{
  const r = await W.resolveRemote("https://arachne.dainst.org/entity/1179876",
    deps({ "https://arachne.dainst.org/data/entity/1179876": ARACHNE }));
  eq([r.kind, r.title, r.source], ["record", "Architrav mit Rankenfries", "iDAI.objects · Arachne (DAI)"], "Arachne: the record, its source said");
  eq(r.image, "https://arachne.dainst.org/data/image/preview/413653", "…its picture from the data API");
  eq(r.fields, [["type", "Einzelobjekte"], ["place", "Köln, Deutschland"], ["date", "claudisch"], ["material", "Kalkstein"]], "…its facts");
  eq(r.link, "https://arachne.dainst.org/entity/1179876", "…and the page to see it at home");
}
{
  // the data API not readable from the page: the bridge's read of the same JSON
  const r = await W.resolveRemote("https://arachne.dainst.org/entity/1179876",
    deps({}, { "https://arachne.dainst.org/data/entity/1179876": { ok: true, kind: "json", json: ARACHNE } }));
  eq(r.title, "Architrav mit Rankenfries", "Arachne through the bridge when CORS says no");
}
{
  const r = await W.resolveRemote("https://iiif.example.org/iiif/2/abc/info.json", deps());
  eq([r.kind, r.image], ["image", "https://iiif.example.org/iiif/2/abc/full/!600,600/0/default.jpg"], "a IIIF image service: its picture");
}
{
  const v3 = { "@context": "http://iiif.io/api/presentation/3/context.json", type: "Manifest",
    label: { it: ["Tempio di Giunone Moneta"] }, summary: { en: ["A temple"] },
    provider: [{ label: { en: ["DAI"] } }],
    items: [{ items: [{ items: [{ body: { id: "https://i.org/full.jpg", service: [{ id: "https://i.org/iiif/x" }] } }] }] }] };
  const r = await W.resolveRemote("https://i.org/manifest.json", deps({ "https://i.org/manifest.json": v3 }));
  eq([r.kind, r.title, r.description, r.source, r.image],
     ["record", "Tempio di Giunone Moneta", "A temple", "IIIF · DAI", "https://i.org/iiif/x/full/!600,600/0/default.jpg"], "a IIIF v3 manifest");
  const v2 = { "@context": "http://iiif.io/api/presentation/2/context.json", "@type": "sc:Manifest", label: "Segni",
    thumbnail: { "@id": "https://i.org/t.jpg" } };
  const r2 = await W.resolveRemote("https://i.org/iiif/m1/manifest", deps({ "https://i.org/iiif/m1/manifest": v2 }));
  eq([r2.title, r2.image], ["Segni", "https://i.org/t.jpg"], "a IIIF v2 manifest");
}
{
  eq((await W.resolveRemote("https://x.org/a.png", deps())).kind, "image", "an image by its address, no read");
  eq((await W.resolveRemote("https://x.org/a.pdf", deps())).kind, "pdf", "a pdf");
  eq((await W.resolveRemote("https://x.org/m.glb", deps())).kind, "model", "a model");
  eq((await W.resolveRemote("https://x.org/t/tileset.json", deps())).kind, "tileset", "a tileset");
}
{
  const page = { ok: true, kind: "page", url: "https://zenodo.org/records/1", title: "Rilievo", description: "Nuvola",
    image: "https://zenodo.org/t.png", site: "Zenodo", type: "Dataset" };
  const r = await W.resolveRemote("https://doi.org/10.5281/zenodo.1", deps({}, { "https://doi.org/10.5281/zenodo.1": page }));
  eq([r.kind, r.title, r.source, r.image, r.url, r.link], ["page", "Rilievo", "Zenodo", "https://zenodo.org/t.png",
     "https://zenodo.org/records/1", "https://doi.org/10.5281/zenodo.1"], "a page: what it says of itself, the final address, the source");
  const none = await W.resolveRemote("https://x.org/p", deps());
  eq([none.kind, none.error, none.source], ["none", "no-bridge", "x.org"], "no bridge: the address, said as unread");
  const bad = await W.resolveRemote("https://x.org/q", deps({}, { "https://x.org/q": { ok: false, error: "HTTP 404" } }));
  eq(bad.error, "HTTP 404", "an address that does not answer says why");
}
eq(W.iiifLabel({ en: ["A"], it: ["B"] }, "it"), "B", "a IIIF label in the reader's language");
console.log(`web-preview: ${checks} checks passed`);
