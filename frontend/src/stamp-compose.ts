/**
 * Comporre un passo, e timbrarlo. **L'emissione non è qui.**
 *
 * Questo modulo tiene la BOZZA — quello che una persona sta componendo — e la
 * consegna al bridge, che la fa diventare un grafo con gli scrittori di
 * s3Dgraphy e chiede alla libreria il verbale (`api.emit_stamp`). La regola di
 * come un grafo diventa un timbro non è riscritta qui e non deve esserlo mai:
 * è la stessa disciplina di `identityOf` in `stamp.ts`.
 *
 * ## La bozza si edita, il timbro no
 *
 * Prima di timbrare si cambia tutto; **dopo, niente**. Un timbro emesso è un
 * verbale immutabile, e se l'autore era sbagliato non lo si può dis-dire nelle
 * copie già uscite: si può solo emettere una **correzione**, che è un atto
 * nuovo. Quindi qui non esiste nessuna funzione che modifichi un timbro, e il
 * bridge rifiuta per nome un `.stamp.json` che esiste già — l'invariante è
 * custodito ai due estremi, come per le piste.
 *
 * ## L'origine non è la via comoda
 *
 * Un file senza genitori è legittimo — metà degli asset di un progetto
 * archeologico sono origini — ma **dichiararne una costa più gesti che nominare
 * un genitore**, e non per attrito fine a sé stesso: perché se dichiarare
 * un'origine fosse il bottone di default, in una settimana sarebbe tutto
 * un'origine finta e il timbro smetterebbe di dire qualcosa.
 *
 * Il conto sta in {@link gestures} ed è misurato da una prova, non promesso da
 * un commento: **1 gesto** per nominare un genitore, **3** per dichiarare
 * un'origine — e i tre non sono finti, il terzo è dare un nome alla campagna,
 * che è lavoro vero e senza il quale l'origine è un'asserzione nuda.
 *
 * ## `"from": []` due volte, e non è la stessa cosa
 *
 * Con un `how` che lo firma vuol dire **«nato qui»**; senza vuol dire **«non so
 * come è stato fatto»**. Sono opposti, e questa bozza non può produrre il
 * secondo: un passo senza ingressi e senza dichiarazione d'origine non è
 * timbrabile, e `readyToStamp` dice perché.
 */

import {
  bundleOutputs, chainIsTemplate, declaredId, instantiateChain, parentLabel, stemOf,
  type DeclaredLevel, type FollowedSet, type Member,
} from "./declared";
import type { FsEntry } from "./storage";
import type { TreeInfo } from "./stamp-tree";

/** Un'uscita della bozza: un file selezionato che non è ancora timbrato. */
export interface DraftOutput {
  path: string;
  name: string;
  size: number;
  mtime: number;
  /** calcolata quando serve; l'impronta la fa il bridge, mai la pagina */
  digest?: string;
  media_type?: string;
  /** RISORSA-FILE · the members of the file set this file is the door of
   *  (dtcstamp `follow_references`), when it calls other files; its `digest`
   *  is then the MEMBERS digest */
  members?: Member[];
  /** the warnings of the walk (an absolute path, a file that is not there) */
  memberWarnings?: string[];
  /** CAMPAGNA · a TREE stamped as one resource: a tileset folder
   *  (`packaging: directory`, its digest the content digest) or a `.3tz`
   *  (`packaging: archive`, its digest the file's, the content digest beside) */
  tree?: TreeInfo;
}

/** Un ingresso: **deve essere timbrato**, perché un figlio timbrato non può
 *  discendere da qualcosa che non ha un'identità dichiarata. */
export interface DraftInput {
  resource_id: string;
  digest: string;
  label: string;
  path?: string;
  size_bytes?: number;
}

export interface Software { name: string; version?: string; commit?: string }

export interface Draft {
  outputs: DraftOutput[];
  inputs: DraftInput[];
  /** falso = viene da qualcosa (**il default**); vero = è un'origine */
  origin: boolean;
  /** A2 · la dichiarazione esplicita, che è il gesto in più */
  originDeclared: boolean;
  /** il nome della campagna: senza, un'origine è un'asserzione nuda */
  campaign: string;
  /** i fatti rappresentativi del lotto — macchina, obiettivo, cartella —
   *  che appartengono all'EVENTO e non si ripetono su quattrocento file */
  campaignMetadata: Record<string, string>;
  kind: string;
  /** dev28 · why `kind` was PROPOSED (a LOD folder, a .3tz), shown beside it;
   *  absent when the person chose it or nothing was proposed */
  kindWhy?: { kind: string; because: "lod" | "packing"; level?: number };
  /** AUDIT N3 · why the form opened on this road — said under the question */
  why: string;
  technique: string;
  parameters: Record<string, unknown>;
  software: Software[];
  operator: { id: string; label: string };
  /** la data dell'ATTO, che non è quella di adesso */
  at: string;
  /** CATENA · il TITOLO del timbro (`self.label`, dtcstamp 46b3b78): per un solo
   *  file; vuoto = il nome del file. Una cortesia, fuori dalla sostanza. */
  title: string;
  /** CATENA · la DESCRIZIONE facoltativa (`self.description`), la stessa per
   *  ogni uscita di un timbro di gruppo: breve, una riga o due */
  description: string;
  /** RISORSA-FILE · the files as they were PICKED, before the handle */
  picked: DraftOutput[];
  /** …the file sets their doors open (by path), from the bridge */
  sets: Record<string, FollowedSet>;
  /** «Una risorsa, N file» (true, the default when files call each other) or
   *  «N uscite» (false) */
  bundle: boolean;
  /** the parents DECLARED and not stamped, level 0 first (see declared.ts) */
  declared: DeclaredLevel[];
  /** CAMPAGNA · the tree the picked file belongs to or is (a tileset folder
   *  for its `tileset.json`, the `.3tz` itself), from the bridge */
  tree: TreeInfo | null;
  /** «La cartella, una risorsa» (true, the default) or «solo tileset.json» */
  asTree: boolean;
}

export function newDraft(outputs: DraftOutput[]): Draft {
  return {
    outputs,
    inputs: [],
    // IL DEFAULT È «VIENE DA QUALCOSA», e questa riga è la decisione di A2:
    // la via comoda deve portare a nominare un genitore, non a dichiarare
    // un'origine.
    origin: false,
    originDeclared: false,
    campaign: "",
    campaignMetadata: {},
    kind: "",
    why: "",
    technique: "",
    parameters: {},
    software: [],
    operator: { id: "", label: "" },
    // VUOTA di proposito: la data dell'atto non è `now()` per difetto. Un atto
    // avvenuto a marzo deve poterlo dire, e un default che nessuno vede è una
    // data che nessuno ha scelto. L'interfaccia offre «oggi» come un GESTO.
    at: "",
    title: "",
    description: "",
    picked: outputs.slice(),
    sets: {},
    bundle: true,
    declared: [],
    tree: null,
    asTree: true,
  };
}

/** Do some of the picked files call each other? Then the handle has a
 *  question to ask («Una risorsa, N file» or «N uscite»). */
export const hasFileSets = (draft: Draft): boolean =>
  Object.values(draft.sets).some((s) => !s.error && s.members.length > 1);

/** The outputs, as the handle says: with `bundle`, one per door (its members
 *  and members digest on it) and the files it calls absorbed; without, every
 *  file picked. Called after the sets arrive and on every change of the choice. */
export function applyHandle(draft: Draft): void {
  // CAMPAGNA · a tree is ONE resource: the folder (not its tileset.json), or the
  // .3tz as an archive with its content digest
  if (draft.tree && draft.asTree && draft.picked.length === 1) {
    const tr = draft.tree;
    const name = tr.path.split("/").pop() || tr.path;
    draft.outputs = [{ path: tr.path, name, size: tr.size_bytes, mtime: draft.picked[0].mtime,
                       digest: tr.digest, tree: tr,
                       media_type: tr.packaging === "archive" ? "application/vnd.maxar.archive.3tz+zip" : undefined }];
    return;
  }
  if (!draft.bundle || !hasFileSets(draft)) {
    draft.outputs = draft.picked.map((o) => ({ ...o, members: undefined, memberWarnings: undefined,
      digest: o.members ? undefined : o.digest }));
    return;
  }
  const sets = new Map(Object.entries(draft.sets));
  const { resources } = bundleOutputs(draft.picked, sets);
  draft.outputs = resources.map(({ file, set }) => set
    ? { ...file, members: set.members, digest: set.digest, memberWarnings: set.warnings ?? [],
        size: set.members.reduce((a, m) => a + m.size_bytes, 0) }
    : { ...file, members: undefined });
}

/** The declared chain for each output: `{name}` / `{base}` filled from ITS name. */
export function chainsFor(draft: Draft): DeclaredLevel[][] {
  return draft.outputs.map((o) => instantiateChain(draft.declared, stemOf(o.name)));
}

/** The number of parents a step names, stamped or declared. */
export const parentCount = (draft: Draft): number =>
  draft.inputs.length + (draft.declared[0]?.parents.length ?? 0);

/** Il conto dei gesti, dichiarato come dato e non come promessa.
 *
 *  Misurato da `check-stamps.mjs` contro i gestori veri dell'interfaccia: se un
 *  giorno qualcuno accorciasse la strada dell'origine, la prova fallirebbe
 *  prima che il difetto arrivi a un utente. */
/**
 * AUDIT N3 · THE STAMP IN TWO QUESTIONS (scrivania v10, E.D. 8 ott 2026).
 *
 * First «where does it come from?» — an ORIGIN (you produced it: in the field,
 * in the lab, from an archive) or OTHER FILES (a process). Then only the fields
 * of that case. The road is not a default that costs gestures to leave any more
 * (DTCEMS2 counted 1 against 3): it is decided FROM THE DATA — «comes from»
 * only when stamped files that can be its inputs are there — and the form says
 * why under the question. An origin is not the easy road because the form
 * cannot offer another one: with no stamped file there is no input to name.
 *
 * The required fields, per road, in the order the form shows them — the first
 * missing one is where «Timbra» puts the focus.
 */
export type StampField = "kind" | "inputs" | "software" | "operator" | "at";

export function requiredFields(draft: Draft): StampField[] {
  return draft.origin
    ? ["kind", "operator", "at"]
    : ["kind", "inputs", "software", "operator", "at"];
}

/** The fields still missing, in the form's order. */
export function missingFields(draft: Draft): StampField[] {
  return requiredFields(draft).filter((f) => {
    switch (f) {
      case "kind": return !draft.kind;
      // RISORSA-FILE · a DECLARED parent is a parent: an object of a .blend is
      // what the export came from even though nobody stamped it
      case "inputs": return !parentCount(draft);
      case "software": return !draft.software.some((s) => s.name.trim());
      case "operator": return !draft.operator.id.trim() && !draft.operator.label.trim();
      case "at": return !draft.at.trim();
    }
  });
}

export function readyToStamp(draft: Draft): string | null {
  if (!draft.outputs.length) return "no output selected";
  return missingFields(draft)[0] ?? null;
}

/** Which road to open on: «comes from» only when there is something to come from. */
export function roadFor(stampedNearby: number): boolean {
  return stampedNearby === 0;   // true = an origin
}

export function kindAxis(draft: Draft): "acquisition" | "process" {
  return draft.origin ? "acquisition" : "process";
}

// ── l'emissione: si CHIEDE, non si fa ───────────────────────────────────────

let resolveBridge: (() => Promise<string>) | null = null;

export function setComposeBridgeResolver(fn: () => Promise<string>): void {
  resolveBridge = fn;
}

async function bridge(): Promise<string> {
  if (!resolveBridge) throw new Error("no bridge resolver installed");
  return await resolveBridge();
}

/** CATENA · what a shelf keeps for a stamped file — dtcstamp's `receipt()`:
 *  the stamp's identity and the words a person reads, AS A COPY. The truth is
 *  the sidecar; the receipt is compared with it when it is reachable. */
export interface StampReceipt {
  id: string;
  checksum?: string;
  stamp: number;
  parents: Array<{ resource_id: string; digest?: string; kind?: string }>;
  title?: string;
  description?: string;
}

export interface EmitResult {
  ok: boolean;
  process_id?: string;
  stamps: Array<{ path: string; stamp_path: string; stamp: unknown; notes: string[];
                  /** CATENA · `dtcstamp.receipt(stamp)`, as the bridge made it */
                  receipt?: StampReceipt | null }>;
  written: string[];
  refused: Array<{ path: string; why: string }>;
  warnings: string[];
  /** la frase del bridge quando ha rifiutato tutto */
  error?: string;
  /** RISORSA-FILE · the acts, one per output when the chain says {name}/{base} */
  processes?: Array<{ process_id: string; outputs: string[]; chain: DeclaredLevel[] }>;
}

/**
 * Manda la bozza al bridge, che la compone e la timbra **con s3Dgraphy**.
 *
 * Quello che parte è la bozza, non un timbro: questo modulo non ne costruisce
 * mai uno. Il corpo è deliberatamente vicino ai nomi del formato, così chi
 * legge la richiesta e chi legge il `.stamp.json` vedono la stessa cosa e in
 * mezzo non c'è una traduzione da tenere allineata.
 *
 * I fatti rappresentativi della campagna viaggiano **una volta sola**, come
 * `acquisition.metadata` — dove il substrato li tiene, sull'evento.
 *
 * Viaggiavano due volte, e il commento che stava qui diceva perché: «il timbro
 * non ha oggi un posto per *quale macchina fotografica*, e finché non ce l'ha
 * `parameters` è il posto meno sbagliato». Il posto ora c'è — `how.acquisition`,
 * emesso da s3Dgraphy — e la duplicazione è diventata il difetto che quel
 * commento voleva evitare: `parameters` vuol dire «come la tecnica è stata
 * applicata», e un apparecchio scritto lì si traveste da parametro. La
 * specifica lo dice con le stesse parole: *una volta sola, non anche in
 * `parameters`*.
 *
 * Misurato prima di toglierlo, perché la prima misura era falsa: un bridge
 * rimasto acceso dalla notte prima teneva in memoria la versione di `emit.py`
 * precedente al campo, e rispondeva senza `how.acquisition` — cioè confermava
 * il commento vecchio. Su un processo fresco il blocco esce.
 */
export async function emitDraft(
  draft: Draft, registry: { graph_id?: string; revision?: number; room?: string } = {},
): Promise<EmitResult> {
  // RISORSA-FILE · a declared chain that says {name}/{base} names a DIFFERENT parent
  // for every output (OB_PODIO_LOD1, OB_PRATO_LOD1…): one act per output, each
  // with its own parents. Without it the outputs share the act, as before.
  const chains = chainsFor(draft);
  const perOutput = draft.outputs.length > 1 && chainIsTemplate(draft.declared);
  if (perOutput) {
    const all: EmitResult = { ok: true, stamps: [], written: [], refused: [], warnings: [], processes: [] };
    for (const [i, out] of draft.outputs.entries()) {
      const one = await emitOne({ ...draft, outputs: [out] }, chains[i], registry);
      all.ok = all.ok && one.ok;
      all.stamps.push(...one.stamps); all.written.push(...one.written);
      all.refused.push(...one.refused); all.warnings.push(...one.warnings);
      all.processes!.push({ process_id: one.process_id ?? "", outputs: [out.path], chain: chains[i] });
      if (one.error) all.error = one.error;
    }
    return all;
  }
  const one = await emitOne(draft, chains[0] ?? [], registry);
  return { ...one, processes: [{ process_id: one.process_id ?? "", outputs: draft.outputs.map((o) => o.path),
                                 chain: chains[0] ?? [] }] };
}

async function emitOne(
  draft: Draft, chain: DeclaredLevel[], registry: { graph_id?: string; revision?: number; room?: string },
): Promise<EmitResult> {
  // …e NON si rovesciano più qui dentro i fatti della campagna: hanno la loro
  // casa in `how.acquisition`, e questo blocco vuol dire un'altra cosa.
  const parameters: Record<string, unknown> = { ...draft.parameters };
  const body = {
    outputs: draft.outputs.map((o) => ({
      path: o.path,
      resource_id: `res:${(o.digest ?? "").slice(7, 19) || o.name}`,
      digest: o.digest,
      // the title names ONE file; a group keeps each file's own name
      name: (draft.outputs.length === 1 && draft.title.trim()) || o.name,
      description: draft.description.trim() || undefined,
      media_type: o.members ? undefined : o.media_type,
      // RISORSA-FILE · a door with members is a FILE SET: its digest is the
      // members digest (dtcstamp), its files travel with it. CAMPAGNA · a tree
      // is a `directory` or an `archive`: dtcstamp writes its content digest
      packaging: o.tree ? o.tree.packaging : o.members ? "file_set" : "file",
      tier: draft.origin ? "master" : "distribution",
      size_bytes: o.size,
      ...(o.members ? { files: o.members.map((m) => ({ path: m.path, digest: m.digest,
        size_bytes: m.size_bytes, role: m.role })) } : {}),
    })),
    inputs: [
      ...draft.inputs.map((i) => ({
        resource_id: i.resource_id, digest: i.digest, label: i.label,
        size_bytes: i.size_bytes,
      })),
      // the DECLARED parents: named by id and label, the rest for the graph
      // (the stamp's `from` carries no path — the bridge sees to it)
      ...(chain[0]?.parents ?? []).map((p) => ({
        resource_id: declaredId(p), label: parentLabel(p), declared: p,
        ...(p.size_bytes ? { size_bytes: p.size_bytes } : {}),
      })),
    ],
    act: {
      dtc_kind: draft.kind,
      technique: draft.technique || undefined,
      parameters: Object.keys(parameters).length ? parameters : undefined,
      software: draft.software.length ? draft.software : undefined,
      at: draft.at,
      origin: draft.origin,
      acquisition: draft.origin
        ? { name: draft.campaign.trim(), metadata: draft.campaignMetadata }
        : undefined,
    },
    operator: draft.operator.id || draft.operator.label ? draft.operator : undefined,
    registry,
    write: true,
  };
  const res = await fetch(`${await bridge()}/stamp/emit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await res.json()) as EmitResult & { error?: string };
  return {
    ok: !!answer.ok,
    process_id: answer.process_id,
    stamps: answer.stamps ?? [],
    written: answer.written ?? [],
    refused: answer.refused ?? [],
    warnings: answer.warnings ?? [],
    error: answer.error,
  };
}

/**
 * RIFINITURE · the TITLE and DESCRIPTION of a stamp already emitted, rewritten
 * in its sidecar — the one change a stamp admits, because both are a courtesy
 * and not its substance (dtcstamp). The bridge proves it (`stamps_agree`) before
 * it writes, and answers with the new stamp and its receipt, so the shelf's copy
 * is refreshed in the one form it has.
 */
export async function retitleStamp(path: string, label: string, description: string):
  Promise<{ ok: boolean; stamp?: unknown; receipt?: StampReceipt | null; changed?: boolean; error?: string }> {
  const res = await fetch(`${await bridge()}/stamp/retitle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, label, description }),
  });
  const answer = (await res.json().catch(() => ({}))) as {
    ok?: boolean; stamp?: unknown; receipt?: StampReceipt | null; changed?: boolean; error?: string };
  return { ok: res.ok && !!answer.ok, stamp: answer.stamp, receipt: answer.receipt ?? null,
           changed: answer.changed, error: answer.error ?? (res.ok ? undefined : `bridge ${res.status}`) };
}

/** RISORSA-FILE · the file sets the picked doors open, asked of the bridge
 *  (dtcstamp `follow_references`). Only a file that can CALL others is asked
 *  (obj, gltf): an image or an mtl picked on its own is a set of one. */
export const DOOR_EXT = /\.(obj|gltf)$/i;
export async function fetchSets(paths: string[]): Promise<Record<string, FollowedSet>> {
  const doors = paths.filter((p) => DOOR_EXT.test(p));
  if (!doors.length) return {};
  const res = await fetch(`${await bridge()}/stamp/members`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: doors }),
  });
  if (!res.ok) return {};
  const answer = (await res.json().catch(() => ({}))) as { sets?: Record<string, FollowedSet> };
  return answer.sets ?? {};
}

/** Una voce di directory → un'uscita della bozza. */
export function outputFrom(entry: FsEntry): DraftOutput {
  return { path: entry.path, name: entry.name, size: entry.size,
           mtime: entry.mtime, media_type: mediaTypeOf(entry.ext) };
}

/** Il media type dall'estensione — una LETTURA, e dichiarata come tale.
 *
 *  Debole di proposito e per questo scritta sul nodo solo quando l'estensione
 *  la conosce: un file servito senza estensione non deve far scrivere al timbro
 *  un tipo che nessuno ha dichiarato. Non è un vocabolario controllato, è una
 *  comodità — e infatti l'assenza è una risposta legittima. */
export function mediaTypeOf(ext: string): string | undefined {
  const e = ext.toLowerCase().replace(/^\./, "");
  return ({
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", tif: "image/tiff",
    tiff: "image/tiff", glb: "model/gltf-binary", gltf: "model/gltf+json",
    obj: "model/obj", ply: "application/octet-stream", laz: "application/octet-stream",
    las: "application/octet-stream", e57: "application/octet-stream",
    pdf: "application/pdf", zip: "application/zip",
  } as Record<string, string>)[e];
}

/**
 * dev28 (E.D., 1 Oct 2026) · the kind the compositor PROPOSES for what was
 * picked, from what the files say about themselves — never chosen in silence:
 * the proposal is shown with its reason and stays a choice. A file in a
 * `LOD<n>` folder (or named `…_LOD<n>`) with n ≥ 1 is a level baked from the
 * master — `lod_generation`, not the «format conversion» people had to pick
 * when the vocabulary lacked it; a `.3tz` is a tree packed into an archive —
 * `packing`. Only kinds the vocabulary has (`known`) are proposed: the list is
 * the datamodel's. LOD 0 is the master's own export, proposed nothing.
 */
export function suggestedKind(paths: string[], known: string[]):
    { kind: string; because: "lod" | "packing"; level?: number } | null {
  const has = (k: string) => known.includes(k);
  for (const p of paths) {
    const m = /(?:^|[\/_])LOD(\d+)(?=[\/_.]|$)/i.exec(p ?? "");
    if (m && Number(m[1]) >= 1 && has("lod_generation"))
      return { kind: "lod_generation", because: "lod", level: Number(m[1]) };
  }
  if (paths.length && paths.every((p) => /\.3tz$/i.test(p ?? "")) && has("packing"))
    return { kind: "packing", because: "packing" };
  return null;
}

