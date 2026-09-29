/**
 * Il TIMBRO, letto da questo lato del filo — e mai scritto.
 *
 * Un timbro (`<asset>.stamp.json`, formato deciso il 14-09-2026, implementazione
 * di riferimento `s3dgraphy.stamp`) è il verbale immutabile di un passo: un
 * agente, con un processo e dei parametri, consuma uno o più ingressi e produce
 * UN artefatto. Questo modulo lo **legge**, risolve i suoi genitori contro il
 * disco, e non scrive niente — l'unica cosa che si scrive stanotte sono le piste
 * (`hints.ts`), che sono mutevoli per disegno.
 *
 * > **Un timbro non si modifica mai.** Se un giorno una riga di questo file
 * > aprisse un `.stamp.json` in scrittura, quella riga sarebbe il difetto.
 * > `scripts/check-stamps.mjs` guarda le scritture di questi moduli e lo
 * > impedisce — con il suo controesempio deliberato, che deve fallire.
 *
 * ## Il legame è l'IMPRONTA, e il nome è solo una scorciatoia
 *
 * Due strade per trovare il timbro di un file, e la seconda è l'unica che
 * accetta:
 *
 * 1. **per nome** — `<nome-completo>.stamp.json` accanto. Trova il candidato.
 * 2. **per impronta** — si calcola lo sha256 del file e lo si confronta con
 *    `self.digest`. **Questa accetta.**
 *
 * E il caso che decide tutto il disegno: **un file riesportato sopra ha
 * un'impronta nuova e accanto un timbro che parla di byte che non ci sono più.**
 * Quel timbro non è rotto — è un'affermazione vera su qualcos'altro — e il file
 * nuovo è **non timbrato**. Riaccoppiarlo per nome attaccherebbe in silenzio la
 * vecchia provenienza ai byte nuovi, che è esattamente la provenienza falsa
 * contro cui tutto questo è costruito. Qui quel caso ha un nome
 * (`digest-mismatch`) e una frase sua.
 *
 * ## Il costo, che decide se lo strumento è usabile
 *
 * Hashare un albero fotogrammetrico da centinaia di GB a ogni sguardo non si può
 * fare. **Tre filtri in cascata, e nessuno dei tre è il legame**:
 *
 * * **il nome ORDINA** — la somiglianza decide in che ordine provare, e non
 *   decide niente altro;
 * * **la dimensione SCARTA** — `measures.size_bytes` del timbro contro `size`
 *   della voce di directory, che `/fs/list` dà già: un candidato di dimensione
 *   diversa è impossibile e si butta **prima di leggere un byte**;
 * * **l'impronta ACCETTA** — e solo lei.
 *
 * Il digest è calcolato dal bridge (`/fs/checksum`), che è l'unico lato che vede
 * il disco, e messo in cache per `(percorso, dimensione, mtime)`: tre cose che
 * cambiano insieme al contenuto e che `/fs/list` consegna gratis.
 */

import { fsList, type FsEntry } from "./storage";

// ── il formato, come DATI ───────────────────────────────────────────────────
//
// Leggere un JSON va benissimo: il formato è dati. Riscrivere le REGOLE — forza
// dell'identità, rilevazione dei disaccordi, riassorbimento — no: quelle stanno
// in s3Dgraphy e si chiedono (vedi `identityOf`).

export interface StampParent {
  resource_id: string;
  digest?: string;
  label?: string;
  /** `"acquisition"` quando l'ingresso è una campagna e non un file: non ha
   *  byte da hashare, e cercarla sul disco non ha senso. */
  kind?: string;
}

export interface Stamp {
  stamp: number;
  self: {
    resource_id: string;
    /** CATENA · the title (dtcstamp 46b3b78): optional, a courtesy, outside
     *  the stamp's substance; the word `from[].label` already uses */
    label?: string;
    /** CATENA · the optional description, a line or two */
    description?: string;
    digest?: string;
    digest_covers?: string;
    media_type?: string;
    format?: string;
    packaging?: string;
    tier?: string;
    measures?: Record<string, number>;
  };
  from: StampParent[];
  how?: {
    process_id?: string;
    technique?: string;
    dtc_kind?: string;
    parameters?: Record<string, unknown>;
    software?: Array<{ name?: string; version?: string; commit?: string }>;
  };
  by?: { operator?: { id?: string; label?: string }; at?: string };
  declared?: { license?: string; embargo_until?: string; as_of?: string };
  registry?: { graph_id?: string; label?: string; revision?: number; room?: string };
}

/** La versione che questo lettore sa leggere. Un timbro che ne dichiara
 *  un'altra non è «rotto»: è di un'altra epoca, e va detto così. */
export const STAMP_VERSION = 1;

export const STAMP_SUFFIX = ".stamp.json";

/** Il nome del timbro di un file: **il nome completo** più il suffisso.
 *  `nuvola.ply` → `nuvola.ply.stamp.json`, non `nuvola.stamp.json`: due file che
 *  differiscono solo per estensione sono due artefatti diversi. */
export function stampPathFor(filePath: string): string {
  return `${filePath}${STAMP_SUFFIX}`;
}

export function isStampPath(path: string): boolean {
  return path.endsWith(STAMP_SUFFIX);
}

/** Il file che questo timbro dice di descrivere, per nome. **Una scorciatoia
 *  per cercare, mai un'accettazione** — vedi `resolveFile`. */
export function fileNamedBy(stampPath: string): string {
  return stampPath.slice(0, -STAMP_SUFFIX.length);
}

/** Quello che un timbro dichiara di pesare, o null. È il secondo dei tre filtri
 *  e l'unico che costa zero: `/fs/list` ha già la dimensione di ogni voce. */
export function declaredSize(stamp: Stamp): number | null {
  const size = stamp.self?.measures?.size_bytes;
  return typeof size === "number" && size >= 0 ? size : null;
}

export function normaliseDigest(value: string | null | undefined): string {
  if (!value) return "";
  const text = String(value).trim();
  return (text.includes(":") ? text.slice(text.lastIndexOf(":") + 1) : text)
    .toLowerCase();
}

export function sameDigest(a?: string | null, b?: string | null): boolean {
  const left = normaliseDigest(a);
  return !!left && left === normaliseDigest(b);
}

// ── il bridge: leggere un file, hashare un file ─────────────────────────────

let resolveBridge: (() => Promise<string>) | null = null;

/** `main.ts` possiede la precedenza dell'endpoint e la passa qui, esattamente
 *  come fa per `storage.ts` e `geo.ts`. Un posto solo decide dov'è il bridge. */
export function setStampBridgeResolver(fn: () => Promise<string>): void {
  resolveBridge = fn;
}

async function bridge(): Promise<string> {
  if (!resolveBridge) throw new Error("no bridge resolver installed");
  return await resolveBridge();
}

/** Legge e valida un `.stamp.json`. `null` quando non c'è.
 *
 *  **Solo lettura, e non è un commento**: `/fs/file` è un GET e non esiste
 *  nessun `/fs/write`. Il bridge non ha una rotta per scrivere un file
 *  arbitrario — il che rende l'invariante «un timbro non si modifica mai» una
 *  proprietà dell'architettura e non della disciplina di chi scrive codice.
 */
export async function readStamp(path: string): Promise<Stamp | null> {
  const url = `${await bridge()}/fs/file?path=${encodeURIComponent(path)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;                    // bridge assente: nessun timbro, non un errore
  }
  if (!res.ok) return null;         // 404 = non c'è; 403 = fuori dalle radici
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    // Un file che si chiama `.stamp.json` e non è JSON NON è un timbro. Detto
    // come tale invece che come «nessun timbro»: sono due fatti diversi.
    throw new BadStamp(`${path}: not JSON`);
  }
  return validateStamp(parsed, path);
}

export class BadStamp extends Error {}

/** Il minimo perché sia un timbro. Si controlla la **versione** e l'**identità
 *  dell'uscita**, e nient'altro: un validatore che pretendesse `how`
 *  rifiuterebbe il passo vuoto, che è metà del mondo reale. */
export function validateStamp(parsed: unknown, where = "stamp"): Stamp {
  const obj = parsed as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object" || Array.isArray(obj))
    throw new BadStamp(`${where}: a stamp is a JSON object`);
  if (obj.stamp === undefined)
    throw new BadStamp(
      `${where}: no \`stamp\` version key — this may be an em.json fragment, ` +
      `which is a different species`);
  if (obj.stamp !== STAMP_VERSION)
    throw new BadStamp(`${where}: stamp version ${String(obj.stamp)}, this build reads ${STAMP_VERSION}`);
  const self = obj.self as Record<string, unknown> | undefined;
  if (!self || typeof self !== "object" || !String(self.resource_id ?? "").trim())
    throw new BadStamp(`${where}: no \`self.resource_id\` — the stamp names no artifact`);
  const out = obj as unknown as Stamp;
  if (!Array.isArray(out.from)) out.from = [];
  return out;
}

// ── le impronte, e la loro cache ────────────────────────────────────────────

/** Chiave di cache: **percorso, dimensione, mtime**. Le tre cose che cambiano
 *  insieme al contenuto, e che `/fs/list` consegna senza costo. Un file
 *  riscritto con la stessa dimensione allo stesso secondo sfugge — è il limite
 *  noto di ogni cache di questo tipo, e si dichiara invece di fingere che non
 *  esista: la cura, quando servirà, è invalidare a mano, non un TTL (un TTL
 *  renderebbe la risposta funzione dell'orologio invece che del file). */
const digestCache = new Map<string, string>();

function cacheKey(path: string, size: number, mtime: number): string {
  return `${path} ${size} ${mtime}`;
}

export interface DigestCost {
  /** ms, misurati da qui: comprende il giro sul bridge, che è dove avviene */
  ms: number;
  bytes: number;
  cached: boolean;
}

let lastCost: DigestCost | null = null;
export function lastDigestCost(): DigestCost | null { return lastCost; }

/** Quante impronte questa sessione ha davvero calcolato (cache esclusa). È il
 *  numero che risponde a «quanti file si hashano su una cartella vera». */
let hashed = 0;
export function hashedCount(): number { return hashed; }
export function resetHashedCount(): void { hashed = 0; }

/** Lo sha256 di un file, dal bridge. `null` quando non si può.
 *
 *  Il calcolo sta dall'altra parte del filo **perché è l'unico lato che vede il
 *  disco** — non per prestazioni — e l'effetto collaterale è quello che serve a
 *  E4: l'interfaccia resta viva perché l'hashing avviene in un altro processo e
 *  qui c'è solo un `await` su una fetch.
 */
export async function digestOf(
  path: string, size: number, mtime: number,
): Promise<string | null> {
  const key = cacheKey(path, size, mtime);
  const hit = digestCache.get(key);
  if (hit !== undefined) {
    lastCost = { ms: 0, bytes: size, cached: true };
    return hit;
  }
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(
      `${await bridge()}/fs/checksum?path=${encodeURIComponent(path)}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json()) as { checksum?: string };
  const digest = body.checksum ?? null;
  lastCost = { ms: performance.now() - started, bytes: size, cached: false };
  if (digest) {
    hashed++;
    digestCache.set(key, digest);
  }
  return digest;
}

// ── il nome ORDINA ──────────────────────────────────────────────────────────

/**
 * Quanto due nomi si somigliano, in [0, 1]. **Ordina i tentativi e non decide
 * niente**: è il primo dei tre filtri e il più debole dei tre di proposito.
 *
 * Bigrammi sul nome senza estensione, più un premio per l'uguaglianza esatta e
 * per il prefisso. Non una distanza di edit: su nomi come
 * `GT16_mesh_decimata_v3.glb` una Levenshtein spende tempo per dire una cosa che
 * i bigrammi dicono abbastanza bene per ORDINARE — e ordinare è tutto ciò che
 * questo numero ha il diritto di fare.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = stem(a), right = stem(b);
  if (left === right) return 1;
  if (!left || !right) return 0;
  const grams = (s: string): Map<string, number> => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const A = grams(left), B = grams(right);
  let shared = 0;
  for (const [g, n] of A) shared += Math.min(n, B.get(g) ?? 0);
  const total = (left.length - 1) + (right.length - 1);
  const dice = total > 0 ? (2 * shared) / total : 0;
  const prefix = left.startsWith(right) || right.startsWith(left) ? 0.1 : 0;
  return Math.min(1, dice + prefix);
}

function stem(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

// ── risolvere: un file → il suo timbro ──────────────────────────────────────

export type ResolutionWhy =
  /** l'impronta del file è quella che il timbro dichiara. L'unica accettazione. */
  | "by-digest"
  /** accanto c'è un timbro, e parla di ALTRI BYTE. Il file è NON TIMBRATO. */
  | "digest-mismatch"
  /** non c'è nessun timbro per questi byte */
  | "none"
  /** il bridge non ha potuto hashare: non si può né accettare né rifiutare */
  | "no-digest"
  /** c'è un file `.stamp.json` accanto e non è un timbro leggibile */
  | "unreadable";

export interface Resolution {
  path: string;
  name: string;
  size: number;
  mtime: number;
  digest: string | null;
  stamp: Stamp | null;
  why: ResolutionWhy;
  /** il timbro che il NOME indicava e che l'impronta ha rifiutato — tenuto
   *  perché «c'era un timbro e non è di questi byte» è un fatto che vale essere
   *  mostrato, e tacerlo lascerebbe credere che non ci fosse niente. */
  rejected?: Stamp;
  /** quante impronte è costato risolvere questo file */
  hashed: number;
  note?: string;
}

/**
 * Il timbro di UN file: per nome si cerca, per impronta si accetta.
 *
 * L'ordine dei tre filtri è visibile nel corpo, e deliberatamente:
 * il candidato lo trova il NOME, la DIMENSIONE lo butta senza leggere un byte,
 * e solo quello che sopravvive a tutti e due costa un'impronta.
 */
export async function resolveFile(entry: FsEntry): Promise<Resolution> {
  const before = hashed;
  const base: Resolution = {
    path: entry.path, name: entry.name, size: entry.size, mtime: entry.mtime,
    digest: null, stamp: null, why: "none", hashed: 0,
  };
  let candidate: Stamp | null = null;
  try {
    candidate = await readStamp(stampPathFor(entry.path));
  } catch (err) {
    if (err instanceof BadStamp)
      return { ...base, why: "unreadable", note: err.message,
               hashed: hashed - before };
    throw err;                      // non è un fatto sul dato: è un difetto
  }
  if (!candidate) return { ...base, hashed: hashed - before };

  // FILTRO 2 · la dimensione scarta, PRIMA di leggere un byte.
  const declared = declaredSize(candidate);
  if (declared !== null && declared !== entry.size) {
    return {
      ...base, why: "digest-mismatch", rejected: candidate,
      hashed: hashed - before,
      note: `the stamp declares ${declared} bytes, this file is ${entry.size}`,
    };
  }

  // FILTRO 3 · l'impronta accetta, e solo lei.
  const digest = await digestOf(entry.path, entry.size, entry.mtime);
  if (!digest)
    return { ...base, why: "no-digest", rejected: candidate,
             hashed: hashed - before };
  if (sameDigest(digest, candidate.self?.digest))
    return { ...base, digest, stamp: candidate, why: "by-digest",
             hashed: hashed - before };
  return {
    ...base, digest, why: "digest-mismatch", rejected: candidate,
    hashed: hashed - before,
  };
}

// ── risalire la catena ──────────────────────────────────────────────────────

export interface ResolvedParent {
  parent: StampParent;
  /** il timbro del genitore, quando si è trovato */
  stamp: Stamp | null;
  /** dove è stato trovato, quando lo è stato */
  path: string | null;
  resolved: boolean;
}

export interface Chain {
  /** il timbro di partenza */
  root: Stamp;
  rootPath: string;
  /** ogni anello risolto: `id → {stamp, path}` */
  resolved: Map<string, { stamp: Stamp; path: string }>;
  /** i genitori che NON si sono risolti — **un'assenza con un nome** */
  missing: StampParent[];
  /** gli archi della catena, come coppie (figlio, genitore) */
  links: Array<{ child: string; parent: string; resolved: boolean }>;
  hashed: number;
}

/**
 * Risale la catena a partire da un timbro, **cercando solo dove è ragionevole**:
 * nella cartella del file di partenza.
 *
 * Non è una scansione del disco: un genitore che non sta lì resta irrisolto, e
 * l'irrisolto è un esito legittimo con una sua forma sullo schermo (il nodo col
 * punto interrogativo). Cercare più lontano è un gesto che una persona chiede
 * (`searchForParent`), non qualcosa che succede mentre si guarda.
 *
 * `maxDepth` esiste perché una catena può essere lunga e questa è una vista, non
 * un archivio: si dichiara quanto si è guardato invece di guardare tutto.
 */
export async function walkChain(
  root: Stamp, rootPath: string, folder: string, maxDepth = 6,
  hintedLocators: string[] = [],
): Promise<Chain> {
  const before = hashed;
  const chain: Chain = {
    root, rootPath, resolved: new Map(), missing: [], links: [], hashed: 0,
  };
  let listing: FsEntry[] = [];
  try {
    listing = (await fsList(folder)).entries.filter((e) => e.type === "file");
  } catch {
    /* niente cartella leggibile: ogni genitore resta irrisolto, ed è un esito */
  }
  const seen = new Set<string>([root.self.resource_id]);
  let frontier: Array<{ stamp: Stamp }> = [{ stamp: root }];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: Array<{ stamp: Stamp }> = [];
    for (const { stamp } of frontier) {
      for (const parent of stamp.from ?? []) {
        chain.links.push({
          child: stamp.self.resource_id, parent: parent.resource_id,
          resolved: false,
        });
        if (seen.has(parent.resource_id)) continue;
        seen.add(parent.resource_id);
        const found = parent.kind === "acquisition"
          ? null                    // una campagna non è un file: non si cerca
          // LE PISTE SI SEGUONO, altrimenti scriverle è mezzo gesto. Prima i
          // posti in cui qualcuno ha già visto qualcosa, poi la cartella.
          // Seguire una pista è sicuro **proprio perché non ci si fida**: si va
          // lì, si ricalcola l'impronta, e o è la cosa giusta o ci si accorge
          // subito — che è tutto il guadagno del puntare per contenuto invece
          // che per nome.
          : (await followHints(parent, hintedLocators))
            ?? await findByDigest(parent, listing);
        if (found) {
          chain.resolved.set(parent.resource_id, found);
          chain.links[chain.links.length - 1].resolved = true;
          next.push({ stamp: found.stamp });
        } else {
          chain.missing.push(parent);
        }
      }
    }
    frontier = next;
  }
  chain.hashed = hashed - before;
  return chain;
}

/**
 * Prova i posti che una pista ricorda. **Accetta comunque per impronta.**
 *
 * Una pista è un'osservazione vecchia e non autorevole: il file può essersi
 * spostato di nuovo, o essere un altro file con lo stesso nome. Quindi qui non
 * si crede a niente — si va a guardare, si ricalcola, e si accetta solo se
 * l'impronta torna. **Una pista sbagliata è innocua**, ed è la ragione per cui
 * si possono tenere tutte senza mai curarle.
 */
async function followHints(
  parent: StampParent, locators: string[],
): Promise<{ stamp: Stamp; path: string } | null> {
  const wanted = normaliseDigest(parent.digest);
  if (!wanted || !locators.length) return null;
  for (const locator of locators) {
    const folder = locator.slice(0, locator.lastIndexOf("/")) || "/";
    let entry: FsEntry | undefined;
    try {
      entry = (await fsList(folder)).entries.find((e) => e.path === locator);
    } catch {
      continue;                     // la pista porta a una cartella che non c'è
    }
    if (!entry || entry.type !== "file") continue;
    const digest = await digestOf(entry.path, entry.size, entry.mtime);
    if (!sameDigest(digest, wanted)) continue;
    let stamp: Stamp | null = null;
    try {
      stamp = await readStamp(stampPathFor(entry.path));
    } catch { /* il genitore c'è anche senza il suo verbale */ }
    return {
      path: entry.path,
      stamp: stamp ?? {
        stamp: STAMP_VERSION,
        self: { resource_id: parent.resource_id, digest: parent.digest },
        from: [],
      },
    };
  }
  return null;
}

/**
 * Cerca fra queste voci il file i cui byte hanno l'impronta che il genitore
 * dichiara. **I tre filtri, nell'ordine.**
 *
 * IL LIMITE, dichiarato: la voce `from` di un timbro porta `resource_id`,
 * `digest` e `label` — e **non la dimensione**. Quindi qui il secondo filtro non
 * può scartare per dimensione: non c'è un numero da confrontare. Quello che si
 * può fare, e si fa, è **leggere il timbro accanto al candidato** — che è
 * gratis, è un JSON piccolo — e usare il suo `self.digest` per decidere se vale
 * la pena hashare. Un timbro che dichiara altri byte non prova niente sul file
 * che gli sta accanto, quindi l'impronta si calcola lo stesso: serve a ORDINARE,
 * non ad accettare.
 */
async function findByDigest(
  parent: StampParent, entries: FsEntry[],
): Promise<{ stamp: Stamp; path: string } | null> {
  const wanted = normaliseDigest(parent.digest);
  if (!wanted) return null;         // senza impronta non c'è accettazione possibile
  const label = parent.label ?? parent.resource_id;
  const ordered = entries
    .filter((e) => !isStampPath(e.path))
    .map((e) => ({ e, score: nameSimilarity(e.name, label) }))
    .sort((a, b) => b.score - a.score);

  for (const { e } of ordered) {
    const digest = await digestOf(e.path, e.size, e.mtime);
    if (!sameDigest(digest, wanted)) continue;
    let stamp: Stamp | null = null;
    try {
      stamp = await readStamp(stampPathFor(e.path));
    } catch { /* il genitore c'è anche senza il suo verbale */ }
    return {
      path: e.path,
      stamp: stamp ?? {
        stamp: STAMP_VERSION,
        self: { resource_id: parent.resource_id, digest: parent.digest },
        from: [],
      },
    };
  }
  return null;
}

/**
 * La ricerca che una persona CHIEDE: lo stesso genitore, in un altro albero.
 *
 * Ordina per somiglianza del nome, accetta per impronta, e **si ferma al primo
 * che corrisponde** — perché due file con la stessa impronta sono lo stesso file
 * e non c'è una scelta da fare.
 *
 * `onProgress` esiste perché una cartella grande costa: chi guarda deve vedere
 * che sta succedendo qualcosa, e poter smettere.
 */
export async function searchForParent(
  parent: StampParent, folder: string, opts: {
    recursive?: boolean;
    maxFiles?: number;
    onProgress?: (looked: number, path: string) => void;
    cancelled?: () => boolean;
  } = {},
): Promise<{ path: string; digest: string } | null> {
  const wanted = normaliseDigest(parent.digest);
  if (!wanted) return null;
  const label = parent.label ?? parent.resource_id;
  const maxFiles = opts.maxFiles ?? 500;
  const files: FsEntry[] = [];
  const folders = [folder];
  while (folders.length && files.length < maxFiles) {
    const here = folders.shift() as string;
    let listing;
    try {
      listing = await fsList(here);
    } catch {
      continue;                     // una cartella illeggibile non ferma le altre
    }
    for (const e of listing.entries) {
      if (e.type === "dir") { if (opts.recursive) folders.push(e.path); continue; }
      if (!isStampPath(e.path)) files.push(e);
    }
  }
  files.sort((a, b) => nameSimilarity(b.name, label) - nameSimilarity(a.name, label));
  let looked = 0;
  for (const e of files.slice(0, maxFiles)) {
    if (opts.cancelled?.()) return null;
    opts.onProgress?.(++looked, e.path);
    const digest = await digestOf(e.path, e.size, e.mtime);
    if (sameDigest(digest, wanted)) return { path: e.path, digest: digest as string };
  }
  return null;
}

// ── la forza dell'identità: SI CHIEDE, non si riscrive ──────────────────────

export interface IdentityWord {
  scheme: string | null;
  value: string | null;
  strength: "verifiable" | "comparable" | "unknown" | null;
  verifiable: boolean;
  /** la frase che un'interfaccia ha il diritto di dire — **presa da s3Dgraphy**,
   *  non composta qui */
  claim: string;
}

const identityCache = new Map<string, IdentityWord>();

/**
 * Quanto è forte un'identità — `verifiable` / `comparable` / `unknown`.
 *
 * **Non riscritta in TypeScript.** La regola sta in `s3dgraphy.stamp.identity` e
 * si chiede al bridge (`POST /stamp/identity`), che ha s3Dgraphy in-process e la
 * chiama attraverso la superficie `api.stamp_identity`. Una seconda
 * implementazione sarebbe due fonti per un fatto solo — e su QUESTO fatto in
 * particolare, perché un'interfaccia che dice «verificato» dove il codice dice
 * `comparable` sta mentendo per conto di qualcun altro.
 *
 * Quando il bridge non risponde **non si indovina**: `strength: null` e una frase
 * che dice di non poterlo dire. Un ripiego che rispondesse «verifiable» perché
 * la stringa comincia per `sha256:` sarebbe esattamente il porting che questa
 * funzione esiste per non fare.
 */
export async function identityOf(values: string[]): Promise<Map<string, IdentityWord>> {
  const out = new Map<string, IdentityWord>();
  const ask: string[] = [];
  for (const v of values) {
    const hit = identityCache.get(v);
    if (hit) out.set(v, hit); else if (!ask.includes(v)) ask.push(v);
  }
  if (!ask.length) return out;
  let answers: Record<string, IdentityWord> | null = null;
  try {
    const res = await fetch(`${await bridge()}/stamp/identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: ask }),
    });
    if (res.ok) answers = (await res.json() as { identities?: Record<string, IdentityWord> })
      .identities ?? null;
  } catch { /* il bridge non c'è: si dice, non si indovina */ }
  for (const v of ask) {
    const word = answers?.[v] ?? {
      scheme: null, value: v, strength: null, verifiable: false,
      claim: "cannot say: the rule lives in s3Dgraphy and the bridge did not answer",
    };
    if (answers?.[v]) identityCache.set(v, word);
    out.set(v, word);
  }
  return out;
}

// ── il referto delle tre classi ─────────────────────────────────────────────

export interface FolderReport {
  folder: string;
  /** byte e timbro, accordati per impronta */
  paired: Resolution[];
  /** timbri che non hanno trovato i loro byte in questa cartella */
  stampsWithoutBytes: Array<{ path: string; stamp: Stamp }>;
  /** file senza timbro — **lo stato NORMALE**, non un guasto */
  bytesWithoutStamp: FsEntry[];
  /** un `.stamp.json` che non si è potuto leggere */
  unreadable: Array<{ path: string; why: string }>;
  hashed: number;
  files: number;
}

/**
 * Le tre classi su una cartella. **La terza è la maggioranza e non è un guasto.**
 *
 * In un progetto vero quasi nessun file è timbrato: «byte senza timbro» è lo
 * stato normale di un albero di lavoro, e un referto che lo presentasse come un
 * problema sarebbe illeggibile al primo uso. Qui è una classe con lo stesso peso
 * delle altre due, e la presentazione (`views/stamps.ts`) la tratta come tale.
 *
 * E un timbro senza byte **non dice da solo** se il file è stato spostato,
 * rinominato fuori dall'albero, cancellato o modificato: sono quattro cose
 * diverse, questo referto **non indovina quale**, e l'unica cosa che afferma è
 * quella che ha misurato — «in questa cartella non ci sono byte con questa
 * impronta».
 */
export async function reportFolder(folder: string): Promise<FolderReport> {
  const before = hashed;
  const listing = await fsList(folder);
  const files = listing.entries.filter((e) => e.type === "file");
  const stamps = files.filter((e) => isStampPath(e.path));
  const plain = files.filter((e) => !isStampPath(e.path));

  const report: FolderReport = {
    folder, paired: [], stampsWithoutBytes: [], bytesWithoutStamp: [],
    unreadable: [], hashed: 0, files: plain.length,
  };
  // OGNI timbro è classificato UNA VOLTA SOLA, e questo insieme è il perché.
  // Misurato a video: senza, un `.stamp.json` illeggibile veniva contato due
  // volte — una dal giro sui file (che lo incontra accanto ai suoi byte) e una
  // dal giro sui timbri — e il referto diceva «2 illeggibili» dove ce n'era uno.
  // Un conteggio che sbaglia di uno su un referto è un referto di cui non ci si
  // fida più su niente.
  const settled = new Set<string>();
  for (const entry of plain) {
    const resolution = await resolveFile(entry);
    const beside = stampPathFor(entry.path);
    if (resolution.why === "by-digest") {
      report.paired.push(resolution);
      settled.add(beside);
    } else if (resolution.why === "unreadable") {
      report.unreadable.push({ path: beside,
                               why: resolution.note ?? "unreadable" });
      settled.add(beside);
    } else {
      report.bytesWithoutStamp.push(entry);
      if (resolution.rejected) {
        // IL RIESPORTATO SOPRA, visto dai due lati: i byte sono senza timbro, e
        // il timbro è senza i suoi byte. Due classi, una volta ciascuna.
        report.stampsWithoutBytes.push({ path: beside, stamp: resolution.rejected });
        settled.add(beside);
      }
    }
  }
  for (const entry of stamps) {
    if (settled.has(entry.path)) continue;
    let stamp: Stamp | null = null;
    try {
      stamp = await readStamp(entry.path);
    } catch (err) {
      report.unreadable.push({ path: entry.path, why: (err as Error).message });
      continue;
    }
    if (!stamp) continue;
    const digest = normaliseDigest(stamp.self?.digest);
    const found = report.paired.some((p) => sameDigest(p.digest, digest));
    if (!found) report.stampsWithoutBytes.push({ path: entry.path, stamp });
  }
  report.hashed = hashed - before;
  return report;
}
