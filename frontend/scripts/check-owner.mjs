// OWNER · il proprietario del repository si LEGGE, non si scrive.
//
//   node scripts/check-owner.mjs
//
// ═══════════════════════════════════════════════════════════════════════════
// PERCHÉ ESISTE
//
// Il 22 settembre 2026 EMStudio, EMStudio-doc e s3Dgraphy sono passati in
// `github.com/ExtendedMatrix`. GitHub lascia un redirect, quindi TUTTO
// continuava a funzionare — e per questo nessuno se ne accorgeva. Nove
// letterali col vecchio proprietario sono sopravvissuti al trasloco, e uno
// aveva già fatto danno:
//
//     nightly.yml   if: github.repository == '<vecchio>/EMStudio'
//
// dopo il trasferimento è FALSA. Il job veniva saltato, il job che lo seguiva
// pure, e il workflow finiva VERDE avendo fatto niente. Un redirect è una
// cortesia: smette il giorno in cui qualcuno riusa il nome vecchio, e allora
// un `checkout` prende il repository di un altro senza che nulla diventi rosso.
//
// Il posto peggiore era `check-workflows.mjs`: lo script che VALIDA i workflow
// teneva esso stesso il nome sbagliato. È la terza volta in questo progetto —
// dopo `x-sibling-repos` e `.env.dev.example` — che il file il cui mestiere è
// custodire il fatto giusto custodisce quello vecchio.
//
// ═══════════════════════════════════════════════════════════════════════════
// LA TRAPPOLA DI QUESTO RECINTO, E COME L'HO PRESA IN FACCIA SCRIVENDOLO
//
// `sorgenti.mjs` la enuncia: un recinto che cerca una PAROLA dentro un sorgente
// letto come testo misura il file, non il programma. Qui la parola cercata è
// proprio il punto, quindi il recinto è legittimo — ma la trappola resta, ed è
// la stessa di `check-members`: il commento che SPIEGA la regola conterrebbe
// l'esempio che la regola vieta.
//
// È successo mentre toglievo la guardia da `nightly.yml`: il commento che
// raccontava la riga rimossa la citava per intero, e sarebbe stato
// indistinguibile da una dimenticanza. Per questo in tutto l'albero il vecchio
// proprietario si scrive `<vecchio-proprietario>` — la storia resta leggibile
// e il recinto resta stretto. Nessuna esenzione «i commenti non contano»: un
// letterale in un commento è esattamente ciò che qualcuno copia.
//
// ═══════════════════════════════════════════════════════════════════════════
// COSA NON È VIETATO, e sta scritto perché è una misura e non una concessione
//
// `zalmoxes-laran` è anche il profilo di una PERSONA, e due repository che NON
// si sono spostati. Misurato con `curl` il 22 settembre 2026:
//
//     <vecchio-proprietario>/EMStudio        301 → ExtendedMatrix/EMStudio
//     <vecchio-proprietario>/EMStudio-doc    301 → ExtendedMatrix/EMStudio-doc
//     <vecchio-proprietario>/s3Dgraphy       301 → ExtendedMatrix/s3Dgraphy
//     zalmoxes-laran/EM-blender-tools  200   ← non si è spostato
//     zalmoxes-laran/ExtendedMatrix    200   ← nemmeno (è la specifica del
//                                              linguaggio, non l'organizzazione)
//
// (MICRO-UN-POSTO, 30 set 2026: le tre righe dei traslocati qui sopra erano
// scritte col proprietario vero, e il recinto — che gira anche su sé stesso —
// era rosso dal 22 settembre per il SUO commento. Il recinto aveva ragione e la
// regola è la sua: «nessuna esenzione, i commenti non contano». Corretto il
// commento, non il recinto.)
//
// Quindi il divieto è su `<vecchio>/<repo-traslocato>`, non sulla stringa nuda:
// vietarla tutta renderebbe rossa una firma d'autore corretta, e un recinto che
// ha torto una volta viene disattivato per sempre.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;

//: Il vecchio proprietario è l'unica stringa che questo file deve contenere:
//: è il soggetto della ricerca. Scritta spezzata perché il recinto gira anche
//: su SÉ STESSO — `git ls-files` lo include — e una regola che deve esentarsi
//: da sé è una regola che ha un buco della propria forma.
const VECCHIO = ["zalmoxes", "laran"].join("-");

//: I repository TRASLOCATI, misurati. Un nome qui dentro è un nome che il
//: vecchio proprietario non ha più.
const TRASLOCATI = ["EMStudio-doc", "EMStudio", "s3Dgraphy", "s3dgraphy"];

//: …e quelli che NON si sono spostati: nominarli col vecchio proprietario è
//: corretto, e il giorno in cui si spostano questa lista è dove si guarda.
const RIMASTI = ["EM-blender-tools", "ExtendedMatrix"];

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

const git = (...args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });

/** Chi siamo, in forma `owner/name`. Dal CONTESTO dentro Actions, dal remote
 *  fuori — e se non risponde nessuno dei due, ci si ferma invece di tirare a
 *  indovinare: un ripiego renderebbe vera per costruzione metà di questo file. */
function self() {
  const fromCi = (process.env.GITHUB_REPOSITORY || "").trim();
  if (fromCi) return fromCi;
  let remote = "";
  try { remote = git("remote", "get-url", "origin").trim(); } catch { remote = ""; }
  const m = remote.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/);
  assert.ok(m, "non so quale repository sia questo: niente GITHUB_REPOSITORY e " +
               "nessun `git remote get-url origin` utilizzabile. Mi fermo " +
               "invece di indovinare.");
  return `${m[1]}/${m[2]}`;
}

const SELF = self();
const [OWNER] = SELF.split("/");

// ── 1 · nessun letterale di un repository traslocato, nei file COMMITTATI ───
//
// `git ls-files`, non una camminata del filesystem: ciò che non è committato
// non viaggia, e `target/`, `node_modules/` e `.claude/` non sono cose che
// consegniamo. I binari si saltano leggendo il file come testo e scartandolo
// se contiene un byte nullo — più onesto di un elenco di estensioni.
const tracciati = git("ls-files", "-z").split("\0").filter(Boolean);
ok(tracciati.length > 100,
   `git ls-files ha elencato ${tracciati.length} file: troppo pochi, la ` +
   `ricerca non sta guardando l'albero che crede`);

const colpevoli = [];
let letti = 0;
for (const f of tracciati) {
  if (f.startsWith(".claude/")) continue;
  let testo;
  try { testo = readFileSync(ROOT + f, "utf8"); } catch { continue; }
  if (testo.includes("\0")) continue;          // binario
  letti++;
  testo.split("\n").forEach((riga, i) => {
    for (const repo of TRASLOCATI) {
      //: `<vecchio>/<repo>` e non la stringa nuda, e il confine a destra
      //: serve: senza, `EMStudio` prenderebbe anche `EMStudio-doc` e il
      //: messaggio nominerebbe il repository sbagliato.
      const re = new RegExp(`${VECCHIO}/${repo}(?![A-Za-z0-9_-])`);
      if (re.test(riga)) colpevoli.push(`${f}:${i + 1}  →  …/${repo}`);
    }
  });
}
ok(letti > 50, `ho letto solo ${letti} file di testo: la ricerca è troppo stretta`);
ok(colpevoli.length === 0,
   `questi nominano un repository col proprietario che non ce l'ha più:\n  ` +
   colpevoli.join("\n  ") +
   `\n\nIl proprietario si legge: \`github.repository_owner\` dentro Actions, ` +
   `\`git remote\` negli script. Se davvero serve un letterale, ne esiste UNO ` +
   `(Cargo.toml) e gli altri lo leggono da lì. Per citare la riga vecchia in ` +
   `un commento si scrive <vecchio-proprietario>.`);

// ── 2 · e il recinto ha qualcosa su cui mordere ─────────────────────────────
//
// Un controllo che passa perché non ha trovato niente passerebbe anche il
// giorno in cui la cosa che sorveglia scompare. Qui: i repository traslocati
// devono essere nominati DA QUALCHE PARTE, col proprietario giusto.
const tuttoIlTesto = tracciati
  .filter((f) => !f.startsWith(".claude/"))
  .map((f) => { try { return readFileSync(ROOT + f, "utf8"); } catch { return ""; } })
  .join("\n");
for (const repo of ["EMStudio-doc", "s3Dgraphy"]) {
  ok(tuttoIlTesto.includes(`${OWNER}/${repo}`) ||
     tuttoIlTesto.includes(`${OWNER}}/${repo}`),   // `${{ … }}/EMStudio-doc`
     `nessuno nomina ${OWNER}/${repo}: o è stato tolto, o la ricerca del ` +
     `punto 1 sta guardando nel posto sbagliato e passerebbe comunque`);
}

// ── 3 · dentro i workflow l'identità viene dal CONTESTO ─────────────────────
//
// Non basta che il nome sia giusto: un letterale GIUSTO oggi è il letterale
// sbagliato del prossimo trasloco. Due forme vietate, entrambe già viste qui:
//
//   repository: <qualcuno>/EMStudio-doc      ← deve essere ${{ … }}
//   if: github.repository == '<qualcuno>/…'  ← deve confrontare col contesto
const workflows = tracciati.filter((f) => /^\.github\/workflows\/.*\.ya?ml$/.test(f));
ok(workflows.length > 0, "ci sono workflow da controllare");

const cablati = [];
for (const f of workflows) {
  readFileSync(ROOT + f, "utf8").split("\n").forEach((riga, i) => {
    const senzaCommento = riga.replace(/#.*$/, "");
    const rep = senzaCommento.match(/^\s*repository:\s*["']?([^"'\s]+)/);
    if (rep && !rep[1].includes("${{") && rep[1].startsWith(`${OWNER}/`)) {
      cablati.push(`${f}:${i + 1}  repository: ${rep[1]}`);
    }
    const cmp = senzaCommento.match(
      /github\.repository(_owner)?\s*==\s*['"]([^'"]+)['"]/);
    if (cmp) cablati.push(`${f}:${i + 1}  confronto con il letterale '${cmp[2]}'`);
  });
}
ok(cablati.length === 0,
   `l'identità del repository è cablata invece che letta dal contesto:\n  ` +
   cablati.join("\n  ") +
   `\n\nDentro Actions si scrive \${{ github.repository_owner }} — che il ` +
   `giorno di un trasloco vale già il nome nuovo.`);

// ── 4 · l'UNICO letterale dichiarato concorda con la realtà ─────────────────
//
// `Cargo.toml` porta un URL perché `repository` è un campo del formato, non un
// appunto (cargo lo pubblica), e `em.sh` lo usa come ripiego quando non c'è un
// `.git`. `CITATION.cff` ne porta un altro perché è ciò che si cita. Due
// dichiarazioni sono due cose che possono divergere: qui si guarda che non lo
// facciano, e che concordino con il remote.
const atteso = `https://github.com/${SELF}`;
const cargo = (readFileSync(ROOT + "Cargo.toml", "utf8")
  .match(/^repository\s*=\s*"([^"]+)"/m) || [])[1];
ok(cargo === atteso,
   `Cargo.toml dice repository = ${cargo}, ma questo repository è ${atteso}`);

const cff = (readFileSync(ROOT + "CITATION.cff", "utf8")
  .match(/^repository-code:\s*"?([^"\s]+)"?/m) || [])[1];
ok(cff === atteso,
   `CITATION.cff dice repository-code: ${cff}, ma questo repository è ${atteso}`);

// ── 5 · e i due che NON si sono spostati restano nominabili ─────────────────
//
// Non un permesso: una misura. Se un giorno anche loro traslocano, questa riga
// è dove si scopre che la lista del punto 1 va allargata.
ok(RIMASTI.length === 2,
   "la lista dei repository rimasti è cambiata: aggiorna anche TRASLOCATI");

console.log(`owner: ${checks} controlli passati ` +
            `(${SELF} · ${letti} file di testo · ${workflows.length} workflow)`);
