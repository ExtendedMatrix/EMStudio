/**
 * IL VERBALE D'INGESTIONE — niente entra nello store senza che si sappia chi
 * ce l'ha messo.
 *
 * La regola è più forte sia del bloccare sia dell'avvisare, e le due alternative
 * si scartano per la stessa ragione:
 *
 * * **bloccare** chi carica un file non timbrato non impedisce l'atto, lo sposta
 *   fuori dal sistema — si carica dalla console di MinIO o con `mc`, e nello
 *   store finisce un oggetto senza nessuna traccia, che è il caso peggiore;
 * * **avvisare** lascia nello store byte indistinguibili da quelli timbrati.
 *
 * Quindi **niente entra senza almeno un timbro**, e se il file non è timbrato
 * l'ingestione *è* l'atto che si timbra: `from: []`, il genere `ingest` del
 * vocabolario, l'operatore è chi carica, la data è adesso.
 *
 * ## «Nato qui» e «non so come è stato fatto» si scrivono uguali
 *
 * `from: []` **con** un `how` che lo firma vuol dire «nato qui»; **senza** vuol
 * dire «non so come è stato fatto». Un'ingestione è il secondo, e se la si
 * scrivesse come il primo si otterrebbe una provenienza falsa — la sola cosa che
 * tutto questo impianto esiste per impedire.
 *
 * Il protocollo dell'attribuzione ha già il nome di questa situazione:
 * **l'ATTRIBUTORE**, cioè chi dichiara qualcosa senza esserne il creatore
 * (`asset-dtc-protocol.md`, «the two people»). Una catalogatrice dichiara la
 * licenza di una fotografia del 1978 scattata da un collega in pensione: la
 * dichiarazione è vera, è utile, e non è paternità. Chi deposita è esattamente
 * questo. Quindi il verbale d'ingestione dice:
 *
 * * **chi ha compiuto l'atto** — l'atto è il DEPOSITO, e chi deposita l'ha
 *   compiuto davvero, quindi `by.operator` è una frase vera;
 * * **nessun autore del contenuto**, perché nessuno l'ha detto. Un nodo autore
 *   qui asserirebbe che chi carica ha fatto i byte, che è la confusione precisa
 *   contro cui il protocollo è scritto;
 * * **le circostanze del deposito** in `how.acquisition` — dove sono entrati,
 *   con che nome sono stati consegnati, per mano di quale strumento. Sono i
 *   fatti dell'atto di acquisizione, che è ciò per cui quel blocco esiste.
 *
 * ## Come si vede che è povera
 *
 * Non da un'etichetta che diciamo noi, ma dalla FORMA, che chi legge fra
 * trent'anni con un editor di testo vede da sé: nessun genitore, nessuna
 * tecnica, nessun software, nessun parametro — il `how` non dice niente su come
 * i byte siano venuti al mondo, perché nessuno l'ha dichiarato. {@link
 * describeProvenance} è quella lettura, ed è la stessa che l'interfaccia mostra.
 *
 * ## Quello che questo modulo NON fa
 *
 * Non costruisce timbri. Compone la RICHIESTA — i fatti dell'atto, che chi
 * deposita conosce — e il verbale lo emette s3Dgraphy attraverso il bridge,
 * come per `stamp-compose.ts`. La regola di come un grafo diventa un timbro sta
 * in un posto solo.
 */

import type { Stamp } from "./stamp";
import visualRules from "./assets/em_visual_rules.json";

/** Il genere dell'atto, **preso dal vocabolario e non inventato**: in
 *  `em_visual_rules.json` l'asse `acquisition` porta `ingest`, descritto come
 *  «generic ingestion of a digital object into the study», che è alla lettera
 *  quello che succede qui. Una guardia verifica che questa stringa sia ancora
 *  nel vocabolario vendorizzato — se un giorno sparisse, il difetto si vedrebbe
 *  in una prova invece che in un timbro. */
export const INGESTION_KIND = "ingest";

/** I generi dell'asse `acquisition` che dichiarano un TRASFERIMENTO e non una
 *  creazione: la famiglia `retrieval` del vocabolario (em_visual_rules 1.6.22).
 *  L'altra famiglia, `capture`, è proprio la parola per «nato qui» che prima
 *  l'asse non aveva. Letto dal datamodel, non elencato a mano; esiste per la
 *  lettura, non per la scrittura: dice quali generi, trovati su un timbro senza
 *  genitori, NON sono la dichiarazione di chi ha fatto i byte. */
export const TRANSFER_KINDS: readonly string[] = Object.entries(
  ((visualRules as unknown as { dtc_kinds?: Record<string, Record<string, unknown>> })
    .dtc_kinds?.acquisition ?? {}) as Record<string, { family?: string }>,
).filter(([k, e]) => !k.startsWith("_") && e?.family === "retrieval").map(([k]) => k);

/** Quanto dice davvero un timbro sulla nascita di ciò che descrive. */
export type Provenance =
  /** ha dei genitori: è un anello di una catena */
  | { depth: "chain"; parents: number }
  /** nessun genitore, ma un atto dichiarato da una persona (una campagna con
   *  un nome, o una tecnica): «nato qui» */
  | { depth: "origin"; campaign?: string }
  /** nessun genitore e nessuna dichiarazione su come i byte siano stati fatti:
   *  «è entrato qui, per mano di questa persona, e nessuno ha detto da dove
   *  venisse». Povera, e lo si vede. */
  | { depth: "ingestion"; into?: string }
  /** non abbastanza per dire nemmeno questo */
  | { depth: "unknown" };

/**
 * La lettura, e **una sola** — la usa l'interfaccia per mostrarlo e la prova
 * per verificarlo, così non esistono due idee di «povera» che possano divergere.
 *
 * Nota su cosa NON è il criterio: **non il genere da solo**. `ingest` può
 * comparire anche su un atto che una persona ha composto e dichiarato, e in quel
 * caso non è un verbale d'ingestione ma una scelta. Quello che distingue è
 * l'assenza di qualunque affermazione su come i byte siano stati fatti: niente
 * tecnica, niente software, niente parametri, nessuna campagna nominata.
 */
export function describeProvenance(stamp: Stamp | null | undefined): Provenance {
  if (!stamp || typeof stamp !== "object") return { depth: "unknown" };
  const parents = Array.isArray(stamp.from) ? stamp.from.length : 0;
  if (parents > 0) return { depth: "chain", parents };

  const how = (stamp.how ?? {}) as Record<string, unknown>;
  const acquisition = (how.acquisition ?? {}) as Record<string, unknown>;
  const said =
    !!how.technique
    || (Array.isArray(how.software) && how.software.length > 0)
    || (!!how.parameters && Object.keys(how.parameters as object).length > 0);
  const campaign = typeof acquisition.campaign === "string"
    ? acquisition.campaign : undefined;
  if (said || campaign) return { depth: "origin", campaign };

  // …e se il genere è uno di quelli che dichiarano un trasferimento, la risposta
  // onesta è «entrato», non «nato».
  const kind = typeof how.dtc_kind === "string" ? how.dtc_kind : "";
  if (TRANSFER_KINDS.includes(kind)) {
    const into = typeof acquisition.deposited_into === "string"
      ? acquisition.deposited_into : undefined;
    return { depth: "ingestion", into };
  }
  // Nessun genitore, nessuna dichiarazione, nessun genere che spieghi: non c'è
  // abbastanza per dire di che specie sia, e inventarlo sarebbe peggio.
  return { depth: "unknown" };
}

/** Vero per un verbale d'ingestione — la stessa lettura, con un nome comodo. */
export function isIngestionRecord(stamp: Stamp | null | undefined): boolean {
  return describeProvenance(stamp).depth === "ingestion";
}

// ── comporre l'atto ─────────────────────────────────────────────────────────

export interface IngestionActInput {
  /** l'oggetto appena depositato */
  resourceId: string;
  digest: string;
  /** il nome con cui è stato consegnato: **non** identità, ma un fatto del
   *  deposito, ed è ciò che permette a una persona di riconoscerlo */
  name: string;
  mediaType?: string;
  sizeBytes?: number;
  /** dove è stato depositato — la stanza, non un percorso locale */
  room: string;
  /** chi deposita: ha compiuto l'atto, e **non** è dichiarato autore */
  operator: { id: string; label?: string };
  /** l'istante del deposito */
  at: string;
  /** lo strumento che l'ha fatto entrare */
  tool?: string;
  /** il percorso su disco, quando esiste: solo allora ha senso scrivere la
   *  copia di cortesia accanto al file */
  path?: string;
}

/**
 * Il corpo per `POST /stamp/emit`, per **un lotto**: N file, un atto solo.
 *
 * Un solo evento di ingestione per la consegna, quindi N timbri che citano lo
 * stesso `process_id` — che è ciò che `bucket_acquisition` fa già derivando
 * l'id dal nome dell'atto, e la ragione per cui quattrocento file non gemmano
 * quattrocento eventi.
 *
 * `write` è vero solo per i file che un percorso ce l'hanno: la copia accanto al
 * file è una **cortesia** per chi riordinerà nel Finder, e un file arrivato dal
 * browser non ha un accanto.
 */
export function ingestionAct(
  items: IngestionActInput[],
  registry: { graph_id?: string; revision?: number; room?: string } = {},
): Record<string, unknown> | null {
  if (!items.length) return null;
  const first = items[0];
  return {
    outputs: items.map((item) => ({
      // il percorso c'è solo per chi ce l'ha: senza, il bridge emette e non
      // scrive, che è esattamente ciò che serve per dei byte arrivati dal browser
      ...(item.path ? { path: item.path } : {}),
      resource_id: item.resourceId,
      digest: item.digest,
      name: item.name,
      media_type: item.mediaType,
      packaging: "file",
      // NON `master`: un master è l'originale autoriale di qualcosa, e di questi
      // byte non sappiamo nemmeno chi li ha fatti. `distribution` dice ciò che
      // è vero — una copia che circola.
      tier: "distribution",
      size_bytes: item.sizeBytes,
    })),
    // IL PUNTO: nessun genitore, e nessuno che ne dichiari uno.
    inputs: [],
    act: {
      dtc_kind: INGESTION_KIND,
      at: first.at,
      origin: true,
      acquisition: {
        // il nome dell'evento: dice l'atto, non una campagna che nessuno ha
        // condotto. Derivato dalla stanza e dall'istante, così una seconda
        // consegna nello stesso momento si aggiunge invece di gemmare.
        name: `ingestione · ${first.room}`,
        metadata: {
          deposited_into: first.room,
          delivered_as: items.map((i) => i.name).join(", ").slice(0, 400),
          ...(first.tool ? { deposited_by_tool: first.tool } : {}),
        },
      },
      // …e NIENTE `technique`, NIENTE `software`, NIENTE `parameters`: sarebbero
      // affermazioni su come i byte sono stati fatti, e nessuno le ha fatte.
    },
    // chi ha compiuto il DEPOSITO. Il bridge crea il nodo autore solo se c'è un
    // nome vero, e qui non ne passiamo uno: l'operatore esce col solo id, e
    // nessun `has_author` asserisce che abbia fatto il contenuto.
    operator: { id: first.operator.id },
    registry,
    write: items.some((i) => i.path),
  };
}

// ── dopo il caricamento: una PISTA, mai il timbro ───────────────────────────

/**
 * L'indirizzo pubblico dei byte nello store.
 *
 * È una **posizione**, e le posizioni stanno fuori dal record immutabile: dopo
 * un caricamento riuscito si scrive una pista `public` con questo URI, e il
 * timbro non si tocca. Un URI di store è utile a chi riceve — è l'unico genere
 * di percorso che lo sia — ed è per questo che `scopeFor` lo classifica
 * `public` da sé.
 */
export function storeLocator(base: string, room: string, ref: string): string {
  const root = String(base || "").replace(/\/+$/, "");
  return `${root}/v1/rooms/${encodeURIComponent(room)}`
    + `/asset/${encodeURIComponent(ref)}`;
}
