// DTCEMS1 · il timbro si legge, e l'unica cosa che si scrive è una pista.
//
//   node scripts/check-stamps.mjs
//
// Due specie di prova, e la seconda è quella che il disegno pretende.
//
// **Di comportamento**: l'accettazione è per IMPRONTA e mai per nome, il file
// riesportato sopra è NON TIMBRATO, la dimensione scarta prima di leggere un
// byte, una pista `private` non esce.
//
// **Strutturale**: nessun percorso di questo codice scrive dentro un
// `.stamp.json`. E **ogni asserzione strutturale qui ha il suo controesempio
// deliberato**, che deve farla fallire — una prova che può solo passare non è
// una prova, è una decorazione che si porta appresso la fiducia di chi la legge.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chiama, stringheLetterali } from "./sorgenti.mjs";

const SRC = new URL("../src/", import.meta.url).pathname;
const SCRIPTS = new URL("./", import.meta.url).pathname;

async function carica(entry) {
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
  });
  return await import("data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64"));
}

const S = await carica("stamp.ts");
const H = await carica("stamp-hints.ts");
const V = await carica("views/stamps.ts");
const G = await carica("stamp-ingest.ts");

let fatte = 0;
const prova = (nome, fn) => { fn(); fatte++; console.log(`  ok · ${nome}`); };
const provaAsync = async (nome, fn) => { await fn(); fatte++; console.log(`  ok · ${nome}`); };

// ── il finto disco ──────────────────────────────────────────────────────────
//
// Un disco di prova e non un vero filesystem: quello che si sta misurando è la
// REGOLA DI ACCETTAZIONE, e un disco vero la misurerebbe insieme al bridge, al
// permesso e al modo in cui questa macchina scrive i file. Le tre cose che
// contano — i byte, la dimensione, il nome — le decide questo oggetto.

function fintoDisco(files) {
  const scritture = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (init?.method === "POST" && u.endsWith("/stamp/hints")) {
      const body = JSON.parse(init.body);
      // IL BRIDGE VERO RIFIUTA PER NOME, e questo doppio rifiuta uguale: se il
      // doppio accettasse tutto, la prova sulla riservatezza passerebbe contro
      // un server che in produzione dice di no.
      if (!String(body.path).endsWith(".hints.json"))
        return { ok: false, status: 400, json: async () => ({}) };
      scritture.push(body);
      files.set(body.path, JSON.stringify(body.hints));
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (init?.method === "POST" && u.endsWith("/stamp/identity")) {
      const values = JSON.parse(init.body).values;
      const identities = {};
      for (const v of values) {
        // la RISPOSTA DELLA LIBRERIA, riprodotta qui alla lettera (s3Dgraphy
        // `describe_identity`): il doppio non inventa una quarta parola
        const scheme = v.includes(":") ? v.split(":")[0].toLowerCase() : null;
        const strength = scheme === "sha256" ? "verifiable"
          : scheme === "emstruct1" ? "comparable" : "unknown";
        identities[v] = { scheme, value: v, strength,
                          verifiable: strength === "verifiable",
                          claim: `«${strength}»` };
      }
      return { ok: true, status: 200, json: async () => ({ identities }) };
    }
    const m = u.match(/\/fs\/(file|checksum|list)\?path=([^&]*)/);
    if (!m) return { ok: false, status: 404, json: async () => ({}) };
    const path = decodeURIComponent(m[2]);
    if (m[1] === "file") {
      const body = files.get(path);
      return body === undefined
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => JSON.parse(body) };
    }
    if (m[1] === "checksum") {
      const body = files.get(path);
      return body === undefined
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200,
            json: async () => ({ checksum: `sha256:${digestOf(body)}` }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return scritture;
}

/** Un'"impronta" di prova: deterministica sui byte e su nient'altro. Non è
 *  sha256 e non deve esserlo — quello che si misura è che l'accettazione guardi
 *  IL CONTENUTO e non il nome, e per quello basta una funzione del contenuto. */
function digestOf(text) {
  let h = 0n;
  for (const c of text) h = (h * 131n + BigInt(c.codePointAt(0))) % (2n ** 64n);
  return h.toString(16).padStart(64, "0");
}

function timbro(id, digest, extra = {}) {
  return { stamp: 1, self: { resource_id: id, digest, ...extra }, from: [] };
}

// ── E3 · per nome si cerca, per IMPRONTA si accetta ─────────────────────────

console.log("\n· E3 — l'accettazione è l'impronta, mai il nome");

const listaVuota = { roots: false, path: "/p", parent: null, entries: [] };
S.setStampBridgeResolver(async () => "http://bridge");
H.setHintsBridgeResolver(async () => "http://bridge");

await provaAsync("un file col suo timbro si accetta per impronta", async () => {
  const files = new Map();
  files.set("/p/mesh.glb", "BYTES-A");
  fintoDisco(files);
  files.set("/p/mesh.glb.stamp.json",
            JSON.stringify(timbro("res:mesh", `sha256:${digestOf("BYTES-A")}`)));
  const r = await S.resolveFile({ name: "mesh.glb", path: "/p/mesh.glb",
                                  type: "file", size: 7, mtime: 1, ext: "glb" });
  assert.equal(r.why, "by-digest");
  assert.equal(r.stamp.self.resource_id, "res:mesh");
});

await provaAsync(
  "IL FILE RIESPORTATO SOPRA è NON TIMBRATO — non riaccoppiato per nome",
  async () => {
    const files = new Map();
    files.set("/p/mesh.glb", "BYTES-NUOVI");          // riesportato sopra
    fintoDisco(files);
    // il timbro accanto parla dei byte VECCHI: è vero, e parla di altro
    files.set("/p/mesh.glb.stamp.json",
              JSON.stringify(timbro("res:mesh", `sha256:${digestOf("BYTES-A")}`)));
    const r = await S.resolveFile({ name: "mesh.glb", path: "/p/mesh.glb",
                                    type: "file", size: 11, mtime: 2, ext: "glb" });
    assert.equal(r.why, "digest-mismatch",
      "il nome combaciava: se questo dicesse `by-digest`, la vecchia " +
      "provenienza sarebbe appena stata attaccata a byte nuovi");
    assert.equal(r.stamp, null, "nessun timbro accettato");
    assert.ok(r.rejected, "…ma il timbro rifiutato si TIENE: «c'era e non è di " +
      "questi byte» è un fatto che vale mostrare");
  });

await provaAsync("LA DIMENSIONE SCARTA prima di leggere un byte", async () => {
  const files = new Map();
  files.set("/p/mesh.glb", "BYTES-A");
  fintoDisco(files);
  files.set("/p/mesh.glb.stamp.json", JSON.stringify(
    timbro("res:mesh", `sha256:${digestOf("BYTES-A")}`,
           { measures: { size_bytes: 999999 } })));
  S.resetHashedCount();
  const r = await S.resolveFile({ name: "mesh.glb", path: "/p/mesh.glb",
                                  type: "file", size: 7, mtime: 1, ext: "glb" });
  assert.equal(r.why, "digest-mismatch");
  assert.equal(S.hashedCount(), 0,
    "la dimensione dichiarata non combaciava: nessuna impronta doveva essere " +
    "calcolata, ed è tutto il punto di E4");
});

prova("IL NOME ORDINA e non decide", () => {
  assert.ok(S.nameSimilarity("nuvola.ply", "nuvola.ply") === 1);
  assert.ok(S.nameSimilarity("GT16_nuvola_2015.ply", "GT16_nuvola_2015.e57") > 0.9,
    "stesso nome, altra estensione: quasi uguale — per ORDINARE");
  assert.ok(S.nameSimilarity("nuvola.ply", "tileset.zip") < 0.3);
  // …e la somiglianza NON è un'accettazione: due file identici di nome e
  // diversi di contenuto restano due file diversi, cosa che solo l'impronta sa
  assert.notEqual(digestOf("A"), digestOf("B"));
});

prova("un .stamp.json che non è un timbro NON è «nessun timbro»", () => {
  assert.throws(() => S.validateStamp({ graphs: {} }), /different species/);
  assert.throws(() => S.validateStamp({ stamp: 99, self: { resource_id: "x" } }),
                /version/);
  assert.throws(() => S.validateStamp({ stamp: 1, self: {} }), /resource_id/);
});

// ── E5 · il nodo col punto interrogativo ────────────────────────────────────

console.log("\n· E5 — l'assenza con un nome");

await provaAsync("un genitore che non si risolve diventa un nodo col ?", async () => {
  const files = new Map();
  files.set("/p/mesh.glb", "BYTES-A");
  fintoDisco(files);
  const root = {
    stamp: 1,
    self: { resource_id: "res:mesh", digest: `sha256:${digestOf("BYTES-A")}` },
    from: [{ resource_id: "res:nuvola", digest: "sha256:" + "a1".repeat(32),
             label: "GT16 · nuvola 2015" }],
    how: { process_id: "proc:1", technique: "decimation" },
  };
  const chain = await S.walkChain(root, "/p/mesh.glb", "/p");
  assert.equal(chain.missing.length, 1);
  const words = await S.identityOf(S.missingDigests
    ? S.missingDigests(chain) : V.missingDigests(chain));
  const scene = V.adaptChain(chain, words);
  assert.equal(scene.missing, 1);
  const ghost = scene.nodes.find((n) => n.id === "missing:res:nuvola");
  assert.ok(ghost, "il genitore mancante si DISEGNA");
  assert.ok(ghost.name.startsWith("? "), "e porta il punto interrogativo");
  // MOSTRA QUELLO CHE SI SA: identità, etichetta, forza dell'identità
  assert.equal(ghost.data.resource_id, "res:nuvola");
  assert.equal(ghost.data.checksum, "sha256:" + "a1".repeat(32));
  assert.ok(ghost.name.includes("GT16 · nuvola 2015"));
  assert.equal(ghost.data.identity_strength, "verifiable");
  // …e la FRASE viene dalla libreria, non composta qui
  assert.equal(ghost.data.identity_claim, "«verifiable»");
  const link = scene.edges.find((e) => e.target === "missing:res:nuvola");
  assert.ok(link?.data?.unresolved, "il legame porta il marcatore del tratteggio");
});

prova("un'identità `comparable` NON diventa «verificata»", () => {
  const chain = { root: { stamp: 1, self: { resource_id: "a" }, from: [] },
                  rootPath: "/p/a", resolved: new Map(),
                  missing: [{ resource_id: "b", digest: "emstruct1:0f1e" }],
                  links: [], hashed: 0 };
  chain.root.from = chain.missing;
  chain.root.how = { process_id: "p" };
  const words = new Map([["emstruct1:0f1e", {
    scheme: "emstruct1", value: "0f1e", strength: "comparable",
    verifiable: false, claim: "this tells you if it changed, not that it is the same one",
  }]]);
  const scene = V.adaptChain(chain, words);
  const ghost = scene.nodes.find((n) => n.id === "missing:b");
  assert.equal(ghost.data.identity_strength, "comparable");
  assert.ok(!/verified|verificato/i.test(ghost.data.identity_claim));
});

prova("senza il bridge non si INDOVINA la forza dell'identità", () => {
  const chain = { root: { stamp: 1, self: { resource_id: "a" },
                          from: [{ resource_id: "b", digest: "sha256:ff" }],
                          how: { process_id: "p" } },
                  rootPath: "/p/a", resolved: new Map(),
                  missing: [{ resource_id: "b", digest: "sha256:ff" }],
                  links: [], hashed: 0 };
  const scene = V.adaptChain(chain, new Map());   // nessuna risposta
  const ghost = scene.nodes.find((n) => n.id === "missing:b");
  assert.equal(ghost.data.identity_strength, null,
    "`sha256:` in testa NON basta: la regola sta in s3Dgraphy e va chiesta");
  assert.match(ghost.data.identity_claim, /cannot say/);
});

// ── E6 · la riservatezza ────────────────────────────────────────────────────

console.log("\n· E6 — una pista private non esce");

const PERSONA = "mrossi";
const ENTE = "Fondazione Ansaldo";
const PERCORSO = `/Users/${PERSONA}/lavori/${ENTE}/2015/nuvola.ply`;

prova("nessuna delle TRE stringhe compare in ciò che esce", () => {
  const h = H.newHints("sha256:aa");
  H.noteSeen(h, "s3://em-assets/res_91c2/nuvola.ply", { when: "2026-09-14T09:12:00Z" });
  H.noteSeen(h, PERCORSO, { machine: "mbp-ed", when: "2026-09-14T18:40:11Z" });
  // SUL TESTO INTERO e non sulle chiavi: un percorso può nascondersi in un campo
  // che nessuno ha pensato di filtrare, e un'asserzione sulle chiavi non lo vede
  const testo = JSON.stringify(H.forExport(h));
  assert.ok(!testo.includes(PERCORSO), "il percorso");
  assert.ok(!testo.includes(PERSONA), "il nome della persona");
  assert.ok(!testo.includes(ENTE), "il nome dell'ente");
  assert.ok(!testo.includes("mbp-ed"), "e nemmeno il nome della macchina");
  assert.ok(testo.includes("s3://em-assets/res_91c2/nuvola.ply"),
            "…mentre la pista pubblica viaggia");
  assert.deepEqual(H.privateLocators(h), [PERCORSO],
    "e il registro DI CASA le tiene tutte: esce una copia");
});

prova("la porta verso l'esterno NON ha un interruttore", () => {
  assert.equal(H.forExport.length, 1,
    "`forExport(hints)` prende un argomento solo: nessun `{keepPrivate}` da " +
    "passare, perché una porta che si può aprire a metà un giorno si apre a metà");
  const src = codice("stamp-hints.ts");
  assert.ok(!/forExport\s*\([^)]*,/.test(src),
    "nessuna chiamata a forExport con un secondo argomento");
});

prova("il dubbio va sempre verso `private`", () => {
  assert.equal(H.scopeFor("s3://b/x"), "public");
  assert.equal(H.scopeFor("https://h/x"), "public");
  assert.equal(H.scopeFor("/Users/x/y"), "private");
  assert.equal(H.scopeFor("blend://Scene/US01"), "private");
  assert.equal(H.scopeFor("qualcosa-che-non-riconosco"), "private",
    "sconosciuto ⇒ privato: sbagliare di là costa il nome utente di qualcuno");
});

prova("le piste non si cancellano, invecchiano", () => {
  const modulo = Object.keys(H);
  for (const proibito of ["forget", "prune", "fix", "repair", "removeHint",
                          "cleanup", "validateLocators"]) {
    assert.ok(!modulo.includes(proibito),
      `\`${proibito}\` non deve esistere: un file spostato non è un errore da ` +
      `correggere, è un fatto da riosservare`);
  }
  const h = H.newHints("sha256:aa");
  H.noteSeen(h, PERCORSO, { machine: "m", when: "2026-09-14T09:00:00Z" });
  H.noteSeen(h, PERCORSO, { machine: "m", when: "2026-09-20T09:00:00Z" });
  assert.equal(h.seen.length, 1, "riosservare AGGIORNA");
  assert.equal(h.seen[0].when, "2026-09-20T09:00:00Z");
  H.noteSeen(h, PERCORSO, { machine: "fisso", when: "2026-09-20T10:00:00Z" });
  assert.equal(h.seen.length, 2, "…ma un'altra macchina è un'altra pista");
});

// ── E5/E8 · nessun percorso scrive dentro un .stamp.json ────────────────────

console.log("\n· la guardia strutturale, e il suo controesempio");

function codice(file) {
  return readFileSync(`${SRC}${file}`);
}
import { readFileSync as _rfs } from "node:fs";
function readFileSync(p) { return _rfs(p, "utf8"); }

/**
 * LA REGOLA, resa una proprietà che una macchina può vedere.
 *
 * Scrivere, da questo programma, vuol dire una cosa sola: una `fetch` con un
 * metodo che non è GET. Il bridge non ha nessun'altra porta verso il disco — non
 * esiste un `/fs/write` — quindi l'insieme delle scritture possibili è
 * l'insieme delle fetch non-GET, ed è finito e ispezionabile.
 *
 * La guardia chiede che ognuna di quelle vada a una rotta dell'elenco bianco, e
 * che l'elenco non contenga niente che possa comporre un percorso di timbro.
 * `stampPathFor` — l'unica funzione che sa scrivere `.stamp.json` — non deve
 * comparire in nessuna di quelle chiamate.
 */
function scrittureDi(src) {
  const out = [];
  // `fetch(` seguito, entro la stessa chiamata, da un `method:` che non è GET.
  for (const m of src.matchAll(/fetch\(([\s\S]{0,600}?)\n\s*\}\);/g)) {
    const blocco = m[1];
    const metodo = blocco.match(/method:\s*"([A-Z]+)"/);
    if (!metodo || metodo[1] === "GET") continue;
    const rotta = blocco.match(/\$\{await bridge\(\)\}(\/[\w/-]+)/);
    out.push({ rotta: rotta ? rotta[1] : "(rotta non letterale)", blocco });
  }
  return out;
}

// RIFINITURE (E.D., 29 set 2026: «la descrizione si scrive nel timbro») ·
// `/stamp/retitle` riscrive SOLO `self.label` / `self.description` — una cortesia,
// fuori dalla `substance` di dtcstamp — e il bridge rifiuta (409) un timbro
// riscritto che non dica la stessa cosa (`stamps_agree`). Il client manda il
// percorso del FILE, mai quello del timbro: la seconda metà della guardia resta.
// RISORSA-FILE · `/stamp/members` is a READ in POST (a list of paths in the
// body; the bridge follows the references with dtcstamp and writes nothing), the
// same kind of entry as `/stamp/identity`
const ROTTE_DI_SCRITTURA = new Set(["/stamp/hints", "/stamp/identity",
                                    "/stamp/emit", "/stamp/retitle", "/stamp/members"]);

function nessunaScritturaDiTimbri(src, dove) {
  const errori = [];
  for (const w of scrittureDi(src)) {
    if (!ROTTE_DI_SCRITTURA.has(w.rotta))
      errori.push(`${dove}: scrittura verso una rotta non consentita (${w.rotta})`);
    if (/stampPathFor|STAMP_SUFFIX|\.stamp\.json/.test(w.blocco))
      errori.push(`${dove}: una scrittura compone un percorso di TIMBRO`);
  }
  return errori;
}

prova("nessun modulo del timbro scrive verso un .stamp.json", () => {
  const errori = [];
  for (const f of ["stamp.ts", "stamp-hints.ts", "views/stamps.ts"])
    errori.push(...nessunaScritturaDiTimbri(codice(f), f));
  assert.deepEqual(errori, [], errori.join("\n"));
});

prova("IL CONTROESEMPIO: la stessa guardia FALLISCE su codice che lo farebbe", () => {
  // Deliberato, e scritto come lo scriverebbe qualcuno in buona fede fra sei
  // mesi: «tanto il timbro ce l'ho, gli aggiungo il percorso che ho appena
  // trovato». È la riga che tutta la notte esiste per rendere impossibile.
  const cattivo = `
    async function patchStamp(path, stamp) {
      const res = await fetch(\`\${await bridge()}/stamp/hints\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: stampPathFor(path), hints: stamp }),
      });
      return res.ok;
    }`;
  const errori = nessunaScritturaDiTimbri(cattivo, "controesempio");
  assert.ok(errori.length > 0,
    "una guardia che non vede QUESTO non sta guardando niente");
  assert.match(errori[0], /percorso di TIMBRO/);
});

prova("IL CONTROESEMPIO 2: una rotta di scrittura nuova non passa in silenzio", () => {
  const cattivo = `
    async function salva(path, body) {
      const res = await fetch(\`\${await bridge()}/fs/write\`, {
        method: "POST",
        body: JSON.stringify({ path, body }),
      });
      return res.ok;
    }`;
  const errori = nessunaScritturaDiTimbri(cattivo, "controesempio");
  assert.ok(errori.some((e) => /rotta non consentita/.test(e)),
    "una porta nuova verso il disco deve essere una decisione, non una riga");
});

await provaAsync("e in esecuzione: scrivere una pista su un percorso di timbro SOLLEVA",
  async () => {
    const files = new Map();
    fintoDisco(files);
    await assert.rejects(
      () => H.writeHints("/p/mesh.glb.stamp.json", H.newHints("sha256:aa")),
      /immutable record/);
  });

await provaAsync("una ricerca riuscita scrive una PISTA, e solo quella", async () => {
  const files = new Map();
  files.set("/p/mesh.glb", "BYTES-A");
  fintoDisco(files);
  const scritture = fintoDisco(files);
  const esito = await H.recordFound(`sha256:${digestOf("BYTES-A")}`,
                                    "/altrove/nuvola.ply",
                                    { anchor: "/p/mesh.glb" });
  assert.ok(esito.written);
  assert.equal(scritture.length, 1);
  assert.equal(scritture[0].path, "/p/mesh.glb.hints.json");
  assert.ok(!scritture.some((w) => w.path.endsWith(".stamp.json")));
  assert.equal(scritture[0].hints.seen[0].scope, "private",
    "un percorso su disco è privato, e ci resta");
});

// ── E7 · le tre classi ──────────────────────────────────────────────────────

console.log("\n· E7 — le tre classi, e la terza è la normalità");

prova("il referto ha una classe per ognuna delle tre", () => {
  const src = codice("main.ts");
  for (const chiave of ["stamp.classPaired", "stamp.classStampNoBytes",
                        "stamp.classNoStamp"])
    assert.ok(src.includes(chiave), `manca la classe ${chiave}`);
  const css = readFileSync(`${SRC}style.css`);
  // …e la terza NON è rossa: il colore È la specifica
  assert.match(css, /\.stamp-report-row\.plain b \{ color: inherit; \}/,
    "«byte senza timbro» è lo stato normale e non deve avere un colore d'allarme");
  assert.match(css, /\.stamp-report-row\.broken b \{ color: #b3261e; \}/,
    "l'unico rosso è per un .stamp.json che non è un timbro");
});

prova("un timbro senza byte NON indovina la causa", () => {
  const i18n = codice("i18n.ts");
  assert.match(i18n,
    /moved, renamed out of this tree, deleted or modified/,
    "le quattro possibilità sono elencate COME possibilità");
  assert.ok(!/stamp\.classStampNoBytesNote[^\n]*\b(was moved|is missing|deleted\.)/.test(i18n),
    "…e nessuna delle quattro è affermata");
});

// ── DTCEMS2 · comporre un passo ─────────────────────────────────────────────

const C = await carica("stamp-compose.ts");

console.log("\n· N3 — il timbro in due domande (sostituisce A2, E.D. 8 ott 2026)");

/**
 * DTCEMS2 contava i GESTI: «viene da» acceso all'apertura (1 gesto), l'origine a
 * tre (clic, spunta, campagna), perché la via comoda non fosse l'origine finta.
 * La scrivania v10 (AUDIT N3) cambia il disegno e questa sezione lo misura: la
 * strada si decide DAI DATI — «viene da altri file» solo se ci sono file timbrati
 * che possono esserne l'ingresso — e ogni strada chiede i suoi campi. L'argine
 * contro l'origine finta non è più un costo in clic: è che, dove un ingresso
 * esiste, il modulo apre su «viene da», e un processo senza ingresso non timbra.
 */
prova("la strada si decide dai dati: origine solo se non c'è niente da cui venire", () => {
  assert.equal(C.roadFor(0), true, "nessun file timbrato accanto → origine");
  assert.equal(C.roadFor(3), false, "file timbrati accanto → viene da altri file");
});

prova("ogni strada chiede i suoi campi, nell'ordine del modulo", () => {
  const d = C.newDraft([{ path: "/p/x.glb", name: "x.glb", size: 1, mtime: 1 }]);
  d.origin = true;
  assert.deepEqual(C.requiredFields(d), ["kind", "operator", "at"]);
  d.origin = false;
  assert.deepEqual(C.requiredFields(d), ["kind", "inputs", "software", "operator", "at"]);
});

prova("un processo senza ingresso non timbra, e dice quale campo manca per primo", () => {
  const d = C.newDraft([{ path: "/p/x.glb", name: "x.glb", size: 1, mtime: 1 }]);
  d.kind = "k"; d.at = "2026-03-14"; d.operator = { id: "", label: "M. Rossi" };
  d.software = [{ name: "Metashape" }];
  assert.equal(C.readyToStamp(d), "inputs");
  d.inputs.push({ resource_id: "res:a", digest: "sha256:aa", label: "a" });
  assert.equal(C.readyToStamp(d), null);
  const o = C.newDraft([{ path: "/p/y.jpg", name: "y.jpg", size: 1, mtime: 1 }]);
  o.origin = true;
  assert.equal(C.readyToStamp(o), "kind", "un'origine senza tipo non timbra");
  o.kind = "k"; o.at = "2026-03-14";
  assert.equal(C.readyToStamp(o), "operator", "…né senza operatore");
});

prova("il modulo puro nasce «viene da»: la strada la sceglie chi lo apre, dai dati", () => {
  assert.equal(C.newDraft([]).origin, false);
  assert.ok(codice("main.ts").includes("stampDraft.origin = roadFor(stamped)"),
    "openDraft decide la strada da quanti file timbrati ci sono accanto");
});

console.log("\n· A6 — quello che non deve succedere");

prova("la data dell'atto NON è now() per difetto", () => {
  assert.equal(C.newDraft([]).at, "",
    "una data che il programma mette da sé è una data che nessuno ha visto");
  const src = codice("main.ts");
  // …e «oggi» esiste come GESTO, con la sua spiegazione
  assert.ok(src.includes('dataset.field = "today"'));
  assert.ok(codice("i18n.ts").includes("stamp2.today"));
});

prova("il vocabolario dtc_kind non si allarga dall'interfaccia", () => {
  const rules = codice("rules.ts");
  assert.ok(/export function dtcKindsFor/.test(rules),
    "i generi si leggono dal datamodel, per asse");
  const src = codice("stamp-compose.ts") + codice("main.ts");
  // nessun genere scritto a mano da nessuna parte nel percorso di composizione
  for (const kind of ["photogrammetry", "transformation", "local_import",
                      "uri_reference", "download", "ingest"]) {
    const hits = [...src.matchAll(new RegExp(`["'\`]${kind}["'\`]`, "g"))];
    assert.equal(hits.length, 0,
      `«${kind}» è scritto a mano nel percorso di composizione: i generi si ` +
      `leggono da em_visual_rules.json, e si allargano lì`);
  }
});

prova("le PISTE non sono state toccate", () => {
  // A6: mescolare l'emissione con la localizzazione è il modo di farsi entrare
  // un campo mutevole dentro un record immutabile.
  const src = codice("stamp-compose.ts");
  assert.ok(!/hints|noteSeen|recordFound|forExport/.test(src),
    "il modulo che compone non deve sapere niente delle piste");
});

console.log("\n· A3 — Stamp, mai Sign");

/** Le chiavi che una persona LEGGE mentre compone. Elencate perché la prova
 *  guarda i valori risolti e non il file: un valore lo si può chiedere solo se
 *  si sa quale chiedere. */
const CHIAVI_COMPORRE = [
  "compose.head", "stamp2.question", "stamp2.origin", "stamp2.originSub",
  "stamp2.derived", "stamp2.derivedSub", "stamp2.whyOrigin", "stamp2.whyDerived",
  "stamp2.kind", "stamp2.processes",
  "stamp2.instrument", "stamp2.inputs", "stamp2.noInputs", "compose.software",
  "compose.parameters", "compose.commit", "stamp2.operator", "stamp2.date",
  "stamp2.today", "stamp2.description", "stamp2.stamp", "stamp2.where",
  "stamp2.errNeeded", "stamp2.errInputs",
  "compose.stamping", "compose.cancel", "compose.open", "compose.openFolder",
  "compose.erratum", "compose.fromThis", "compose.fromThisHint",
];

await provaAsync("nessuna parola dell'interfaccia suggerisce una firma", async () => {
  // SI GUARDANO LE STRINGHE, NON IL FILE. La prima versione di questa prova
  // cercava «sign» nel testo sorgente e falliva su un COMMENTO — «STAMP, MAI
  // SIGN» — cioè su una riga che dice esattamente la cosa giusta. È il difetto
  // che `sorgenti.mjs` documenta in testa: una guardia che cerca una parola nel
  // testo sta misurando il file, non il programma. Qui si importa il modulo e si
  // leggono i VALORI che un utente vede.
  const I = await carica("i18n.ts");
  const visibili = [];
  for (const key of CHIAVI_COMPORRE) {
    const value = I.t(key);
    assert.ok(value && value !== key, `manca la stringa ${key}`);
    visibili.push(value);
  }
  const testo = visibili.join("\n");
  for (const parola of ["sign", "signature", "signed", "firma", "firmato",
                        "firmare", "certificat"]) {
    const hit = new RegExp(`\\b\\w*${parola}\\w*`, "i").exec(testo);
    assert.equal(hit, null,
      `«${hit?.[0]}» compare in una stringa VISIBILE del comporre: non c'è una ` +
      `chiave, non c'è non ripudiabilità, e in ambito patrimoniale «firmato» ` +
      `promette cose che questo sistema non mantiene`);
  }
  assert.equal(I.t("compose.stamp", { n: "3" }), "Stamp 3");
});

prova("IL CONTROESEMPIO: una stringa che promette una firma viene vista", () => {
  const finte = ["Sign 3 files", "Firma questo passo", "Digitally signed"];
  for (const value of finte) {
    const visto = ["sign", "firma", "signed"].some(
      (w) => new RegExp(`\\b\\w*${w}\\w*`, "i").test(value));
    assert.ok(visto, `«${value}» doveva essere vista dalla guardia`);
  }
  // …e una stringa onesta non deve far scattare nulla
  assert.ok(!["sign", "firma", "signed"].some(
    (w) => new RegExp(`\\b\\w*${w}\\w*`, "i").test("Stamp 3")));
});

prova("l'emissione NON è riscritta: si chiede al bridge", () => {
  const src = codice("stamp-compose.ts");
  assert.ok(/\/stamp\/emit/.test(src), "passa dalla rotta del bridge");
  // niente che somigli a comporre un timbro qui dentro
  assert.ok(!/"stamp":\s*1|stamp:\s*1\b/.test(src),
    "questo modulo non costruisce mai un timbro: lo chiede");
  assert.ok(!/digest_covers|"self"\s*:/.test(src),
    "…e non conosce nemmeno la forma interna del verbale");
});

console.log("\n· A5 — dopo il timbro si congela");

prova("un asset già timbrato mostra il TIMBRO e non un modulo", () => {
  const src = codice("main.ts");
  assert.ok(/function stampedBox/.test(src));
  const corpo = src.split("function stampedBox")[1].split("\nfunction ")[0];
  assert.ok(/dataset\.readonly = "stamp"/.test(corpo),
    "il verbale si mostra in sola lettura");
  assert.ok(!/<input|createElement\("input"\)/.test(corpo),
    "nessun campo modificabile su un asset già timbrato");
  assert.ok(/compose\.erratum/.test(corpo),
    "…e la strada verso l'errata è detta");
});

prova("la nuova rotta di scrittura è dichiarata, e non ne passano altre", () => {
  // la guardia di DTCEMS1, estesa: `/stamp/emit` entra nell'elenco bianco, e
  // tutto il resto resta fuori
  assert.ok(ROTTE_DI_SCRITTURA.has("/stamp/emit"));
  const errori = [];
  for (const f of ["stamp.ts", "stamp-hints.ts", "views/stamps.ts",
                   "stamp-compose.ts"])
    errori.push(...nessunaScritturaDiTimbri(codice(f), f));
  assert.deepEqual(errori, [], errori.join("\n"));
});

prova("IL CONTROESEMPIO: comporre un percorso di timbro in una scrittura FALLISCE", () => {
  const cattivo = `
    async function patch(path, stamp) {
      const res = await fetch(\`\${await bridge()}/stamp/emit\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path + STAMP_SUFFIX, stamp }),
      });
      return res.ok;
    }`;
  const errori = nessunaScritturaDiTimbri(cattivo, "controesempio");
  assert.ok(errori.some((e) => /percorso di TIMBRO/.test(e)));
});



// ═══ DTCEMS3 · niente entra nello store senza un verbale ═════════════════════

console.log("\n· I2 — l'ingestione è un atto, e si timbra");

const DEPOSITO = {
  resourceId: "res:abc", digest: "sha256:" + "a".repeat(64),
  name: "scatto-01.jpg", mediaType: "image/jpeg", sizeBytes: 9012,
  room: "em.localhost/aiano", operator: { id: "https://orcid.org/0000-0002-1825-0097" },
  at: "2026-09-15T10:00:00Z", tool: "EMStudio 1.6",
};

prova("un file non timbrato produce un atto SENZA genitori e senza come", () => {
  const atto = G.ingestionAct([DEPOSITO], { room: DEPOSITO.room });
  assert.deepEqual(atto.inputs, [], "nessun genitore, perché nessuno ne ha dichiarato uno");
  assert.equal(atto.act.dtc_kind, "ingest");
  // …e NIENTE che affermi come i byte siano stati fatti
  for (const campo of ["technique", "software", "parameters"])
    assert.ok(!(campo in atto.act),
      `«${campo}» sarebbe un'affermazione su come i byte sono stati fatti, e nessuno l'ha fatta`);
  // l'operatore ha compiuto il DEPOSITO ed è vero; non è dichiarato autore
  assert.deepEqual(Object.keys(atto.operator), ["id"],
    "nessuna label: senza un nome vero il bridge non crea il nodo autore, e " +
    "nessun has_author asserisce che chi carica abbia fatto il contenuto");
  assert.equal(atto.outputs[0].tier, "distribution",
    "non «master»: un master è l'originale autoriale di qualcosa, e di questi " +
    "byte non sappiamo nemmeno chi li ha fatti");
});

prova("il genere viene dal VOCABOLARIO VENDORIZZATO, non da questa riga", async () => {
  // misurato sul datamodel, non asserito: se un giorno `ingest` sparisse
  // dall'asse acquisition, il difetto si vedrebbe qui e non in un timbro
  const rules = JSON.parse(
    await readFile(`${SRC}assets/em_visual_rules.json`, "utf8"));
  const asse = rules.dtc_kinds?.acquisition ?? {};
  assert.ok(Object.hasOwn(asse, G.INGESTION_KIND),
    `«${G.INGESTION_KIND}» non è nell'asse acquisition del vocabolario`);
  for (const k of G.TRANSFER_KINDS)
    assert.ok(Object.hasOwn(asse, k), `«${k}» non è nel vocabolario`);
  // …e l'interfaccia non ne aggiunge: l'elenco letto è quello del datamodel.
  // Da em_visual_rules 1.6.22 l'asse ha due famiglie; un trasferimento è la
  // famiglia `retrieval`, e una cattura (`capture`) NON lo è: è «nato qui».
  const recuperi = Object.keys(asse).filter((k) => asse[k]?.family === "retrieval");
  assert.deepEqual([...G.TRANSFER_KINDS].sort(), recuperi.sort(),
    "l'elenco dei generi di trasferimento È la famiglia retrieval dell'asse " +
    "acquisition, non un sottoinsieme scelto a mano che invecchierebbe in silenzio");
  for (const k of Object.keys(asse).filter((k) => asse[k]?.family === "capture"))
    assert.ok(!G.TRANSFER_KINDS.includes(k), `la cattura «${k}» non è un trasferimento`);
});

console.log("\n· I2 — e si VEDE che è povera");

prova("le tre risposte sono tre, e vengono dalla forma", () => {
  const ingestione = {
    from: [], how: { dtc_kind: "ingest",
                     acquisition: { deposited_into: "em.localhost/aiano" } } };
  assert.deepEqual(G.describeProvenance(ingestione),
                   { depth: "ingestion", into: "em.localhost/aiano" });
  assert.ok(G.isIngestionRecord(ingestione));
});

prova("IL CONTROESEMPIO: una CATENA VERA non deve mai leggersi come povera", () => {
  // È la confusione che renderebbe inutile tutto il resto: se una catena vera
  // passasse per un verbale d'ingestione, l'etichetta smetterebbe di dire
  // qualcosa e chi legge imparerebbe a non fidarsene.
  const catena = {
    from: [{ resource_id: "res:pad", digest: "sha256:" + "b".repeat(64) }],
    how: { dtc_kind: "transformation", technique: "decimation" },
  };
  assert.equal(G.describeProvenance(catena).depth, "chain");
  assert.ok(!G.isIngestionRecord(catena), "una catena NON è un'ingestione");
});

prova("IL CONTROESEMPIO: un'ORIGINE dichiarata da una persona non è un'ingestione", () => {
  // Un'origine ha `from: []` esattamente come un'ingestione — è il caso che il
  // formato avverte di non confondere — e quello che la distingue è che
  // qualcuno ha DICHIARATO qualcosa: una campagna con un nome, o una tecnica.
  const conCampagna = {
    from: [], how: { dtc_kind: "local_import",
                     acquisition: { campaign: "Aiano 2015", device: "Nikon D850" } } };
  assert.equal(G.describeProvenance(conCampagna).depth, "origin");
  assert.ok(!G.isIngestionRecord(conCampagna));

  const conTecnica = {
    from: [], how: { dtc_kind: "ingest", technique: "scansione da microfilm" } };
  assert.equal(G.describeProvenance(conTecnica).depth, "origin",
    "una tecnica dichiarata è qualcuno che ha detto come: non è più povera");
  assert.ok(!G.isIngestionRecord(conTecnica));
});

prova("…e «non lo so» resta una risposta, invece di diventare «ingestione»", () => {
  // Senza genitori, senza dichiarazioni e senza un genere che spieghi, non c'è
  // abbastanza per dire di che specie sia. Inventarlo sarebbe peggio del tacere.
  assert.equal(G.describeProvenance({ from: [], how: {} }).depth, "unknown");
  assert.equal(G.describeProvenance(null).depth, "unknown");
  assert.equal(G.describeProvenance({ from: [], how: { dtc_kind: "photogrammetry" } }).depth,
               "unknown", "un genere che non è un trasferimento non dice «entrato»");
});

console.log("\n· I6 — quello che parte non porta niente di privato");

prova("nessun percorso locale entra nei fatti che finiranno nel timbro", () => {
  const conPercorso = { ...DEPOSITO, path: PERCORSO };
  const atto = G.ingestionAct([conPercorso], { room: DEPOSITO.room });
  // SUL TESTO INTERO dei fatti dell'atto — è la parte che il timbro incorpora —
  // e non sulle chiavi: un percorso può nascondersi in un campo che nessuno ha
  // pensato di filtrare, e un'asserzione sulle chiavi non lo vedrebbe.
  const testo = JSON.stringify(atto.act);
  assert.ok(!testo.includes(PERCORSO), "il percorso");
  assert.ok(!testo.includes(PERSONA), "il nome della persona");
  assert.ok(!testo.includes(ENTE), "il nome dell'ente");
  // il nome del file invece SÌ: è un fatto della consegna, ed è ciò che permette
  // a una persona di riconoscere l'oggetto
  assert.ok(testo.includes("scatto-01.jpg"));
  // …e il percorso vive solo dove serve al bridge per scrivere la copia di
  // cortesia, che è un gesto locale e non parte per nessun posto
  assert.equal(atto.outputs[0].path, PERCORSO);
});

prova("IL CONTROESEMPIO: un percorso nei fatti dell'atto viene visto", () => {
  // scritto come lo scriverebbe qualcuno in buona fede: «annoto da dove veniva,
  // così poi lo ritrovo» — che è esattamente ciò che le PISTE fanno, in un file
  // che non viaggia.
  const cattivo = { act: { acquisition: { metadata: { came_from: PERCORSO } } } };
  const testo = JSON.stringify(cattivo.act);
  assert.ok(testo.includes(PERCORSO) && testo.includes(PERSONA),
    "la guardia deve vedere un percorso annidato dove nessuno lo cercherebbe");
});

console.log("\n· I3/I4 — il verbale viaggia, la posizione è una pista");

prova("l'indirizzo dello store è quello dell'oggetto, e la chiave è l'impronta", () => {
  const uri = G.storeLocator("http://em.localhost:8000/", "aiano",
                             "sha256:" + "a".repeat(64));
  assert.equal(uri, "http://em.localhost:8000/v1/rooms/aiano/asset/"
    + encodeURIComponent("sha256:" + "a".repeat(64)));
  // …e una posizione è `public` da sé: è l'unico genere di percorso utile a chi
  // riceve, e `scopeFor` lo classifica senza che nessuno glielo dica
  assert.equal(H.scopeFor(uri), "public");
});

prova("nessun modulo dell'ingestione scrive dentro un .stamp.json", () => {
  // la guardia di DTCEMS1, estesa una terza volta: il modulo nuovo entra
  // nell'elenco dei sorvegliati invece di essere un'eccezione
  const errori = [];
  for (const f of ["stamp.ts", "stamp-hints.ts", "views/stamps.ts",
                   "stamp-compose.ts", "stamp-ingest.ts"])
    errori.push(...nessunaScritturaDiTimbri(codice(f), f));
  assert.deepEqual(errori, [], errori.join("\n"));
});

prova("IL CONTROESEMPIO: aggiornare il timbro con l'URI dello store FALLISCE", () => {
  // La riga che I4 esiste per rendere impossibile, e la tentazione è concreta:
  // «ho appena caricato, so l'indirizzo, lo scrivo nel verbale». Scriverlo
  // cambierebbe i byte del timbro e quindi la sua identità, che è il digest di
  // ciò che descrive.
  const cattivo = `
    async function noteTheUri(path, stamp, ref) {
      stamp.self.locator = storeLocator(base, room, ref);
      const res = await fetch(\`\${await bridge()}/stamp/emit\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: stampPathFor(path), stamp }),
      });
      return res.ok;
    }`;
  const errori = nessunaScritturaDiTimbri(cattivo, "controesempio");
  assert.ok(errori.some((e) => /percorso di TIMBRO/.test(e)),
    "la guardia deve vedere la scrittura verso un percorso di timbro");
});

prova("il verbale si scrive PER FILE, dentro il ciclo, non alla fine del lotto", () => {
  // IL DIFETTO CHE QUESTA PROVA RICORDA, ed era mio: timbravo l'intera consegna
  // alla fine, cioè ripetevo l'errore che il commento del ciclo racconta di aver
  // già corretto una volta per il registro. Una consegna di quattrocento
  // fotografie interrotta alla duecentesima lasciava duecento oggetti nello
  // store senza niente che dicesse chi ce li aveva messi.
  const src = codice("main.ts");
  const ciclo = src.split("async function publishQueue")[1]
    .split("\n/** One object into the room's store")[0];
  assert.ok(/await stampOne\(/.test(ciclo),
    "il verbale si scrive dentro il ciclo per file");
  // …e la chiamata sta DOPO quella che deposita i byte: un verbale scritto prima
  // parlerebbe di byte che potrebbero non arrivare
  assert.ok(ciclo.indexOf("await landRow(doc, item);\n      // …E IL SUO VERBALE")
            > ciclo.indexOf("method: \"PUT\""),
    "…dopo il deposito dei byte, non prima");
  // nessun residuo della versione per lotto
  assert.ok(!/stampTheDelivery|noteWhereTheyLanded/.test(src),
    "nessun residuo della versione che timbrava a fine lotto");
});

prova("una sola annotazione per file, e non dentro un ramo che può saltarla", () => {
  // la prima versione annotava dentro una funzione con un'uscita anticipata, e
  // una consegna di soli file GIÀ TIMBRATI — il caso migliore — restava senza
  // nessuna pista. Ora ogni strada che finisce con un verbale nello store passa
  // di lì.
  const src = codice("main.ts");
  const corpo = src.split("async function stampOne")[1]
    .split("\n/** Il verbale nello store")[0];
  const annota = [...corpo.matchAll(/await noteWhereItLanded\(/g)];
  assert.equal(annota.length, 2,
    "le due strade che finiscono con un verbale nello store — quello proprio " +
    "del file e quello d'ingestione — annotano ENTRAMBE. Una sola chiamata " +
    "vorrebbe dire che una delle due strade è tornata a non annotare, che è " +
    "esattamente il difetto trovato sul disco.");
  // …e le uscite anticipate sono solo quelle in cui NON c'è niente da annotare
  // perché non c'è niente nello store: nessuna identità, o l'emissione fallita
  const primaAnnotazione = corpo.indexOf("await noteWhereItLanded(");
  assert.ok(corpo.slice(0, primaAnnotazione).includes("assets.stampNeedsIdentity"),
    "la prima uscita è quella senza identità, dove non si è depositato nulla");
});

prova("il caricamento scrive una PISTA e non tocca il verbale", () => {
  const src = codice("main.ts");
  assert.ok(/function noteWhereItLanded/.test(src));
  const corpo = src.split("async function noteWhereItLanded")[1]
    .split("\n// ──")[0];
  assert.ok(/recordFound\(/.test(corpo), "passa dal registro delle piste");
  assert.ok(!/stampPathFor|STAMP_SUFFIX|\.stamp\.json/.test(corpo),
    "…e non nomina mai un percorso di timbro");
});

console.log(`\n✔ ${fatte} prove\n`);
