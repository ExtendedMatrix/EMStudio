/**
 * Una catena di timbri LETTA DAL DISCO, adattata alla scena che già esiste.
 *
 * `views/neighbourhood.ts` fa la stessa cosa per la risposta del NODO: adatta e
 * non disegna, perché la macchina delle scene c'è già (`buildDtcScene`) e un
 * risultato in più deve essere una scena in più, non un renderer in più. Questo
 * file è il suo gemello per l'altra sorgente — il disco — e la simmetria è
 * deliberata: la stessa domanda («che cosa si sa di questo file?») ha due
 * risposte, una dal nodo e una dai `.stamp.json` che gli stanno accanto, e
 * devono arrivare sullo schermo per la stessa strada.
 *
 * ## Il nodo col punto interrogativo
 *
 * Un genitore che non si risolve **non è un errore ed è importante che non lo
 * sembri**: è un'**assenza con un nome** — «c'era un genitore con questo id e
 * questo digest, e non ce l'ho» — che per un archivista vale incomparabilmente
 * più del silenzio. Si disegna, e mostra quello che si sa: l'identità, la sua
 * etichetta, e la **forza** di quell'identità.
 *
 * La frase sulla forza **non si compone qui**: arriva da
 * `s3dgraphy.stamp.identity.describe_identity` attraverso il bridge
 * (`stamp.identityOf`). Un'interfaccia che dicesse «verificato» dove la libreria
 * dice `comparable` starebbe mentendo per conto di qualcun altro.
 *
 * ## Il tratteggio, e perché da solo non bastava — MISURATO
 *
 * Il disegno chiedeva «linea tratteggiata» per il legame irrisolto. Misurato su
 * `em_visual_rules.json`: `dtc_had_input`, `dtc_had_output` e `dtc_derived_from`
 * **non hanno nessuno stile dichiarato** e cadono tutti e tre sul ripiego di
 * `palette.edgeStyle`, che è `dash: [4, 3]`. Cioè **nella vista DTC ogni arco
 * della catena è già tratteggiato**, e un tratteggio in più non distingue
 * niente: sarebbe stato un segnale invisibile perché identico allo sfondo.
 *
 * Quindi il legame irrisolto porta `data.unresolved`, e il renderer gli dà un
 * tratteggio PROPRIO (tratti lunghi) più il bordo tratteggiato sul nodo. È una
 * regola di DISEGNO su un costrutto che esiste solo nel disegno — questa catena
 * non sta in nessun grafo — e non un tipo di arco EM inventato: gli archi
 * restano i tre veri del substrato.
 */

import { declaredId, declaredResource, type DeclaredLevel } from "../declared";
import type { Chain, IdentityWord, Stamp, StampParent } from "../stamp";
import type { EmEdge, EmNode } from "../types";

/** I tre archi veri del substrato. Nominati qui perché questo file COSTRUISCE
 *  una catena sintetica, e deve usare gli stessi nomi che la libreria usa — non
 *  perché li stia definendo. */
const EDGE_HAD_INPUT = "dtc_had_input";
const EDGE_HAD_OUTPUT = "dtc_had_output";

export interface StampScene {
  nodes: EmNode[];
  edges: EmEdge[];
  /** quanti genitori sono rimasti irrisolti — il numero che l'interfaccia dice */
  missing: number;
}

function resourceNode(
  id: string, name: string, data: Record<string, unknown>,
): EmNode {
  return {
    id, node_type: "resource", name,
    // `dtc_kind` è il marcatore che tiene un nodo nella proiezione DTC anche
    // quando la sua classe è la ResourceNode generica (views/dtc.ts `isDtcNode`).
    data: { dtc_kind: "mesh", ...data },
  } as unknown as EmNode;
}

function processNode(stamp: Stamp): EmNode {
  const how = stamp.how ?? {};
  const id = how.process_id ?? `${stamp.self.resource_id}::step`;
  const software = (how.software ?? [])
    .map((s) => [s.name, s.version].filter(Boolean).join(" "))
    .filter(Boolean);
  return {
    id,
    node_type: "dtc_process",
    name: how.technique || how.dtc_kind || "step",
    data: {
      dtc_kind: how.dtc_kind ?? "transformation",
      technique: how.technique,
      parameters: how.parameters,
      software: how.software,
      operator: stamp.by?.operator,
      created_at: stamp.by?.at,
      declared: stamp.declared,
      // quello che l'inspector mostra senza dover conoscere il formato
      _stampSummary: [
        how.technique ? `technique: ${how.technique}` : null,
        software.length ? `software: ${software.join(", ")}` : null,
        stamp.by?.at ? `at: ${stamp.by.at}` : null,
        stamp.by?.operator?.label ?? stamp.by?.operator?.id ?? null,
      ].filter(Boolean).join(" · "),
    },
  } as unknown as EmNode;
}

/**
 * Il nodo che dice **che cosa manca**, e non che qualcosa è rotto.
 *
 * Porta l'identità del genitore, la sua etichetta e la frase sulla forza
 * dell'identità presa da s3Dgraphy. Il `?` è nel nome perché il nome è ciò che
 * il renderer disegna dentro la scatola: si legge a colpo d'occhio senza che il
 * renderer debba sapere che cosa sia un genitore irrisolto.
 */
function missingNode(parent: StampParent, word: IdentityWord | undefined): EmNode {
  const label = parent.label || parent.resource_id;
  return {
    id: `missing:${parent.resource_id}`,
    node_type: "resource",
    name: `? ${label}`,
    data: {
      dtc_kind: "mesh",
      /** IL MARCATORE — di disegno, non di lingua EM. Vedi la testa del file. */
      unresolved: true,
      resource_id: parent.resource_id,
      checksum: parent.digest,
      identity_strength: word?.strength ?? null,
      // LA FRASE DELLA LIBRERIA, non una composta qui.
      identity_claim: word?.claim
        ?? "cannot say: the rule lives in s3Dgraphy and the bridge did not answer",
      _stampSummary: [
        `id: ${parent.resource_id}`,
        parent.digest ? `digest: ${parent.digest}` : "no digest recorded",
        word?.strength ? `identity: ${word.strength}` : null,
      ].filter(Boolean).join(" · "),
    },
  } as unknown as EmNode;
}

function edge(source: string, target: string, type: string,
              data?: Record<string, unknown>): EmEdge {
  return {
    id: `${source}|${type}|${target}`, edge_type: type, source, target,
    ...(data ? { data } : {}),
  } as unknown as EmEdge;
}

/**
 * La catena → una scena. Un passo è `ingressi → processo → uscita`, e un
 * genitore irrisolto entra come il nodo col punto interrogativo al posto
 * dell'ingresso che non c'è.
 *
 * `words` è la risposta di `stamp.identityOf` per i digest dei genitori
 * irrisolti: si passa da fuori perché **è una chiamata di rete** e questa
 * funzione resta pura — la si può provare senza un bridge, che è la stessa
 * disciplina per cui `emit_stamp` in s3Dgraphy non chiede l'ora.
 */
export function adaptChain(
  chain: Chain, words: Map<string, IdentityWord> = new Map(),
): StampScene {
  const nodes = new Map<string, EmNode>();
  const edges: EmEdge[] = [];
  const missing = new Set<string>();

  const stamps: Stamp[] = [chain.root, ...[...chain.resolved.values()].map((r) => r.stamp)];
  const paths = new Map<string, string>([[chain.root.self.resource_id, chain.rootPath]]);
  for (const [id, found] of chain.resolved) paths.set(id, found.path);

  for (const stamp of stamps) {
    const id = stamp.self.resource_id;
    nodes.set(id, resourceNode(id, labelOf(stamp, paths.get(id)), {
      checksum: stamp.self.digest,
      media_type: stamp.self.media_type,
      tier: stamp.self.tier,
      packaging: stamp.self.packaging,
      path: paths.get(id),
      _stampSummary: [
        stamp.self.digest ? `digest: ${short(stamp.self.digest)}` : null,
        stamp.self.measures?.size_bytes
          ? `${stamp.self.measures.size_bytes} bytes` : null,
        paths.get(id) ?? null,
      ].filter(Boolean).join(" · "),
    }));
    // un passo SENZA `how` è un artefatto di cui non si sa come è stato fatto —
    // e `"from": []` lì significa «non so», non «nato qui». Non si disegna un
    // processo che nessuno ha compiuto.
    if (!stamp.how && !(stamp.from ?? []).length) continue;
    const step = processNode(stamp);
    nodes.set(step.id, step);
    edges.push(edge(step.id, id, EDGE_HAD_OUTPUT));
    for (const parent of stamp.from ?? []) {
      const found = chain.resolved.get(parent.resource_id);
      if (found) {
        edges.push(edge(step.id, parent.resource_id, EDGE_HAD_INPUT));
        continue;
      }
      const ghost = missingNode(parent, words.get(parent.digest ?? ""));
      nodes.set(ghost.id, ghost);
      missing.add(ghost.id);
      edges.push(edge(step.id, ghost.id, EDGE_HAD_INPUT, { unresolved: true }));
    }
  }
  return { nodes: [...nodes.values()], edges, missing: missing.size };
}

/**
 * RISORSA-FILE · a parent the stamp names and the disk cannot find is not
 * always MISSING: it may be DECLARED — an object of a .blend, the photographs
 * of a model — and then the documentation (the corpus) knows it, with the chain
 * above it. Such a `?` is replaced by the corpus's node (drawn with the dashed
 * frame of «declared, not stamped») and the chain is walked up from there: the
 * act that made it (`dtc_had_output` into it), what that act consumed, and so
 * on. Pure; the corpus is passed in.
 */
export function withDeclaredAncestors(scene: StampScene, corpusNodes: EmNode[], corpusEdges: EmEdge[]): StampScene {
  const byId = new Map(corpusNodes.map((n) => [n.id, n]));
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const edges = [...scene.edges];
  let missing = scene.missing;
  const queue: string[] = [];
  for (const n of scene.nodes) {
    const rid = (n.data as { unresolved?: boolean; resource_id?: string } | undefined);
    if (!rid?.unresolved || !rid.resource_id) continue;
    const known = byId.get(rid.resource_id);
    if (!(known?.data as { declared_only?: boolean } | undefined)?.declared_only) continue;
    nodes.delete(n.id);
    nodes.set(known!.id, known!);
    missing--;
    for (const e of edges) if (e.target === n.id) e.target = known!.id;
    queue.push(known!.id);
  }
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of corpusEdges) {
      if (e.edge_type !== EDGE_HAD_OUTPUT || e.target !== id) continue;
      const proc = byId.get(e.source);
      if (!proc) continue;
      nodes.set(proc.id, proc);
      edges.push(edge(proc.id, id, EDGE_HAD_OUTPUT));
      for (const i of corpusEdges) {
        if (i.edge_type !== EDGE_HAD_INPUT || i.source !== proc.id) continue;
        const up = byId.get(i.target);
        if (!up) continue;
        nodes.set(up.id, up);
        edges.push(edge(proc.id, up.id, EDGE_HAD_INPUT));
        if (!seen.has(up.id)) { seen.add(up.id); queue.push(up.id); }
      }
    }
  }
  return { nodes: [...nodes.values()], edges, missing };
}

/** The stamp's own title first (`self.label`, dtcstamp 46b3b78 — dtcstamp's
 *  `stamp_title` rule: not when it merely repeats the id), then the file's name,
 *  then the id. */
function labelOf(stamp: Stamp, path?: string): string {
  const rid = stamp.self.resource_id;
  const own = String(stamp.self.label ?? "").trim();
  const tail = rid.split(":").pop()?.split("/").pop() ?? rid;
  if (own && own !== rid && own !== tail) return own;
  if (path) return path.split("/").pop() ?? rid;
  return rid;
}

function short(digest: string): string {
  return digest.length > 22 ? `${digest.slice(0, 22)}…` : digest;
}

/** I digest dei genitori irrisolti di una catena — quello che va chiesto al
 *  bridge per poter scrivere la frase giusta sotto il punto interrogativo. */
export function missingDigests(chain: Chain): string[] {
  const out: string[] = [];
  for (const parent of chain.missing) {
    if (parent.digest && !out.includes(parent.digest)) out.push(parent.digest);
  }
  return out;
}

// ── DTCEMS2 · la BOZZA, mentre la si compone ────────────────────────────────

/**
 * Il minigrafo di un passo **che non è ancora un timbro**.
 *
 * Stessa scena, stesso renderer, stessa lingua del resto: comporre e leggere
 * devono somigliarsi, perché è la stessa cosa vista prima e dopo. Quello che
 * cambia è **che nessuno di questi nodi esiste ancora da nessuna parte** — non
 * nel documento, non sul disco — e l'interfaccia lo dice con il marcatore
 * `draft`, che il renderer disegna attenuato.
 *
 * L'uscita è quello che si sta timbrando, il processo è l'atto, gli ingressi
 * sono i genitori nominati. Un'ORIGINE non ha ingressi e ha comunque il
 * processo: `"from": []` **con** un `how` che lo firma vuol dire «nato qui», e
 * si deve vedere che l'atto c'è.
 */
export function adaptDraft(draft: {
  outputs: Array<{ path: string; name: string; size: number; digest?: string;
                   members?: Array<{ path: string }> }>;
  inputs: Array<{ resource_id: string; digest: string; label: string }>;
  /** RISORSA-FILE · the declared chain, already filled for the first output */
  declaredChain?: DeclaredLevel[];
  origin: boolean;
  kind: string;
  technique: string;
  at: string;
  operator: { id: string; label: string };
  campaign: string;
}): StampScene {
  const nodes: EmNode[] = [];
  const edges: EmEdge[] = [];
  const stepId = "draft:step";
  const label = draft.origin
    ? (draft.campaign.trim() || draft.kind || "origin")
    : (draft.technique.trim() || draft.kind || "step");
  nodes.push({
    id: stepId, node_type: "dtc_process", name: label,
    data: {
      dtc_kind: draft.kind || "transformation",
      draft: true,
      technique: draft.technique || undefined,
      created_at: draft.at || undefined,
      operator: draft.operator.id ? draft.operator : undefined,
      _stampSummary: [
        draft.origin ? "origin · born here" : "derived",
        draft.kind ? `kind: ${draft.kind}` : null,
        draft.technique ? `technique: ${draft.technique}` : null,
        draft.at ? `at: ${draft.at}` : "no date yet",
      ].filter(Boolean).join(" · "),
    },
  } as unknown as EmNode);

  for (const out of draft.outputs) {
    // a door with members is ONE resource of N files, and says so
    const label = out.members && out.members.length > 1
      ? `${out.name} · ${out.members.length} file` : out.name;
    nodes.push(resourceNode(out.path, label, {
      draft: true,
      checksum: out.digest,
      ...(out.members && out.members.length > 1 ? { packaging: "file_set" } : {}),
      _stampSummary: [`${out.size} bytes`,
                      out.digest ? short(out.digest) : "digest not computed yet"]
        .join(" · "),
    }));
    edges.push(edge(stepId, out.path, EDGE_HAD_OUTPUT, { draft: true }));
  }
  for (const inp of draft.inputs) {
    nodes.push(resourceNode(inp.resource_id, inp.label, {
      checksum: inp.digest,
      _stampSummary: `${inp.resource_id} · ${short(inp.digest)}`,
    }));
    edges.push(edge(stepId, inp.resource_id, EDGE_HAD_INPUT, { draft: true }));
  }
  // RISORSA-FILE · the DECLARED parents, level by level going up: drawn with
  // their own border (declared_only), each level above made by its own act
  let below = [stepId];
  (draft.declaredChain ?? []).forEach((lv, i) => {
    const ids = lv.parents.map((p) => {
      const id = declaredId(p);
      if (!nodes.some((n) => n.id === id))
        nodes.push({ ...declaredResource(null, p), id } as EmNode);
      return id;
    });
    if (i === 0) {
      for (const id of ids) edges.push(edge(stepId, id, EDGE_HAD_INPUT, { draft: true }));
    } else {
      const pid = `draft:declared-step:${i}`;
      nodes.push({ id: pid, node_type: "dtc_process", name: lv.technique || lv.dtc_kind || "step",
                   data: { dtc_kind: lv.dtc_kind || "transformation", declared_only: true } } as unknown as EmNode);
      for (const b of below) edges.push(edge(pid, b, EDGE_HAD_OUTPUT, { draft: true }));
      for (const id of ids) edges.push(edge(pid, id, EDGE_HAD_INPUT, { draft: true }));
    }
    below = ids;
  });
  return { nodes, edges, missing: 0 };
}
