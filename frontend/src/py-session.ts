/**
 * MICRO-PL15-BRIDGE-PYTHON (W12) · the page's side of the bridge's Python
 * session (`/py/*`, tools/em_py.py, bridge level 81).
 *
 * The bridge runs Python (s3Dgraphy's `em`); the DOCUMENT stays the page's.
 * What comes back from a run is:
 *
 *   · STEPS — one per `em.write`: a delta (the shape /property-source answers)
 *     the page applies in ONE `store.batch` (one undo step; in a room, the
 *     ops of a local edit), with a Log line carrying the act's label. The
 *     delta already holds the act's DTC process with the code that ran (the
 *     bridge writes it, D-8). After applying, the page tells the bridge its
 *     revision (`ack`) so the session stays aligned; when the revisions do not
 *     match (an edit, a room's op, an undo) the bridge says `stale` and the
 *     page sends the em.json again — never a guess;
 *   · APP REQUESTS — what `em.app` asked (select, view, notify, a command,
 *     the camera, frame, pick), executed here in order. The ones that wait
 *     for an answer (`pick`, `camera`, `command`) are answered with
 *     `/py/resume`; the script, in a thread of the bridge, goes on.
 *
 * Every request carries the bridge's SECRET (`Authorization: Bearer`): the
 * desktop shell's (`bridge_token`), else the one a dev stack gives the page
 * (`window.EM_BRIDGE_TOKEN`, `VITE_EM_BRIDGE_TOKEN`). Without one there is no
 * Python here (the web has none: SPEC-plugin §10).
 *
 * Pure of the page: everything it needs comes through {@link PyPage}, so
 * `scripts/check-py-bridge.mjs` drives it against a real bridge.
 */
import type { LibraryDelta } from "./property-source";

export const PY_LEVEL = 81;
/** MICRO-PL17 (W14) · /py/plugins, /py/invoke, /py/checks */
export const PY_PLUGINS_LEVEL = 83;
/** MICRO-PL18 (W15a) · /py/plugins {dev}, /py/plugins/dev, /py/plugins/reload — the development folder */
export const PY_DEV_LEVEL = 84;
/** MICRO-PL25 (X5) · /py/compute, the values of the slots of phase 2 */
export const PY_COMPUTE_LEVEL = 88;

export type PyEvent = "selection-changed" | "graph-changed" | "document-opened" | "document-saved" | "document-closed" | "locale-changed";

export interface PyStep {
  label: string;
  delta: LibraryDelta;
  process: Record<string, unknown> | null;
  /** the id of the act's DTC process (dtc_process) in the delta */
  dtc: string | null;
  ids: string[];
  volatile: boolean;
  refused: unknown[];
}

export interface PyRequest {
  n: number;
  kind: "select" | "view" | "app" | "notify" | "command" | "camera" | "set_camera" | "frame" | "pick";
  wait?: boolean;
  [k: string]: unknown;
}

export interface PyAnswer {
  ok: boolean;
  run?: string;
  status?: "done" | "waiting" | "running" | "error" | "refused" | "cancelled" | "none";
  output?: string;
  value?: string;
  error?: string;
  code?: string;
  messages?: Record<string, string>;
  steps?: PyStep[];
  /** level 82 (MICRO-PL16): the em.write that ended as a proof — what they would write */
  proofs?: PyProofWire[];
  app_requests?: PyRequest[];
  waiting?: PyRequest;
  listeners?: Record<string, number>;
  revision?: number;
  stale?: boolean;
  /** level 83 (MICRO-PL17): what a plugin's command gave back, or the checks' warnings */
  result?: PyResult;
}

/** What a plugin's command returned: a value, a file (an exporter), warnings (the checks). */
export interface PyResult {
  value?: unknown;
  file?: { name: string; mime: string; text?: string; b64?: string };
  issues?: PyIssueWire[];
  /** level 88 (MICRO-PL25): the values of phase 2, one per item asked */
  values?: PyValueWire[];
}
/** One value of phase 2 (`em.plugins.compute`): rows of a section or a panel,
 *  `{id: text}` of a column, one line of the status bar — or why not. */
export interface PyValueWire {
  key: string;
  ok: boolean;
  value?: unknown;
  messages?: Record<string, string>;
  reason?: string;
}
export interface PyIssueWire {
  plugin: string; command: string; verified: boolean;
  rule: string; sev: "error" | "warning" | "info"; node: string | null; txt: string;
}

/** A proof as the bridge says it (`em_py.proof_of`); the console draws it. */
export interface PyProofWire {
  label: string;
  message: string;
  volatile: boolean;
  counts: { nodes: number; edges: number; ops: number };
  nodes: Array<{ id: string; type: string; name: string }>;
  edges: Array<{ source: string; type: string; target: string }>;
  ops: Array<Record<string, unknown>>;
}

/** What a whole run did, once it is over. */
export interface PyOutcome {
  ok: boolean;
  status: string;
  output: string;
  value?: string;
  /** the bridge's words in the page's language */
  error?: string;
  steps: PyStep[];
  /** the proofs of the run (a «try», or `em.write(dry_run=True)`) */
  proofs: PyProofWire[];
  requests: PyRequest[];
  /** level 83: a plugin's command, the checks */
  result?: PyResult;
}

/** `em.app` as EMStudio does it. */
export interface PyAppHost {
  select(ids: string[]): void;
  /** false: the page has no such view */
  view(name: string): boolean;
  notify(message: string, level: "info" | "warning" | "error"): void;
  /** MICRO-SEG02 · the command's answer (any value, `false` included); an
   *  unknown id or a refusal is THROWN, its message said to the script */
  command(id: string, slots: Record<string, unknown>): unknown | Promise<unknown>;
  /** MICRO-SEG02 p.3 · `em.app.space` / `workspaces` / `windows`: an operation
   *  by name (`space.layers`, `windows.open`…), its answer */
  app?(op: string, args: Record<string, unknown>): unknown | Promise<unknown>;
  camera(): unknown;
  setCamera(camera: unknown): void;
  frame(ids: string[]): void;
  /** null: nothing placed (cancelled, or not possible here) */
  pick(prompt: string, primitive: string): Promise<unknown | null>;
}

export interface PyPage {
  base(): Promise<string>;
  token(): Promise<string | null>;
  /** the em.json of the document (parsed) */
  doc(): unknown;
  /** `DocumentStore.rev` */
  revision(): number;
  author(): string | null;
  lang(): string;
  declared(): unknown;
  selection(): string[];
  /** MICRO-SEG02 · the commands and actions a script reaches, with their
   *  params (`script-commands.ts` `scriptCatalog`): the console completes from it */
  commands?(): unknown;
  /** apply ONE step in ONE batch (one undo); the revision after it */
  applyStep(step: PyStep): number;
  host: PyAppHost;
  log(level: "info" | "warn" | "error", message: string, ids?: string[]): void;
  /** the page's words (i18n `t`) */
  t(key: string, vars?: Record<string, string>): string;
}

/** The bridge's words in a language (its `messages`), else its `error`. */
export function wordsOf(a: { error?: string; messages?: Record<string, string> } | null | undefined, lang: string): string {
  return a?.messages?.[lang] ?? a?.messages?.en ?? a?.error ?? "";
}

/** The secret, in the order of trust: the desktop shell's, then a dev stack's. */
export async function pyToken(fromShell: () => Promise<string | null>): Promise<string | null> {
  const shell = await fromShell().catch(() => null);
  if (shell) return shell;
  const w = (globalThis as { EM_BRIDGE_TOKEN?: unknown }).EM_BRIDGE_TOKEN;
  if (typeof w === "string" && w) return w;
  const env = (import.meta as { env?: Record<string, unknown> }).env?.VITE_EM_BRIDGE_TOKEN;
  return typeof env === "string" && env ? env : null;
}

export class PyError extends Error {
  constructor(message: string, readonly status: number, readonly answer: PyAnswer | null) {
    super(message);
  }
}

export class PySession {
  id: string | null = null;
  listeners: Record<string, number> = {};
  /** true while the page applies a Python step: its own `graph-changed` is
   *  not forwarded (the bridge already told its listeners) */
  applying = false;
  private ack: { run: string; revision: number } | null = null;
  private busy = false;

  constructor(readonly page: PyPage) {}

  private async post(route: string, body: Record<string, unknown>): Promise<{ status: number; answer: PyAnswer }> {
    const token = await this.page.token();
    if (!token) throw new PyError(this.page.t("py.noToken"), 0, null);
    const r = await fetch(`${await this.page.base()}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const answer = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` })) as PyAnswer;
    return { status: r.status, answer };
  }

  /** Open (or open again) the session on the current document. */
  async open(): Promise<PyAnswer> {
    const { status, answer } = await this.post("/py/session", {
      doc: this.page.doc(), revision: this.page.revision(), author: this.page.author(),
      lang: this.page.lang(), declared: this.page.declared(), selection: this.page.selection(),
      ...(this.page.commands ? { commands: this.page.commands() } : {}) });
    if (status !== 200 || !answer.ok) throw new PyError(wordsOf(answer, this.page.lang()) || `HTTP ${status}`, status, answer);
    this.id = (answer as { session?: string }).session ?? null;
    this.listeners = answer.listeners ?? {};
    this.ack = null;
    return answer;
  }

  /** A request on the session's document: the revision (and the ack of the
   *  last steps); stale → the em.json again; a session gone → a new one. */
  private async onDocument(route: string, body: Record<string, unknown>): Promise<PyAnswer> {
    if (!this.id) await this.open();
    let withDoc = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { status, answer } = await this.post(route, {
        ...body, session: this.id, revision: this.page.revision(), lang: this.page.lang(),
        selection: this.page.selection(), ...(this.ack ? { ack: this.ack } : {}),
        ...(withDoc ? { doc: this.page.doc(), declared: this.page.declared() } : {}) });
      if (status === 409 && answer.stale) { withDoc = true; this.ack = null; continue; }
      if (status === 404 && answer.code === "no_session") { await this.open(); continue; }
      this.ack = null;
      if (status !== 200) throw new PyError(wordsOf(answer, this.page.lang()) || `HTTP ${status}`, status, answer);
      return answer;
    }
    throw new PyError(this.page.t("py.stale"), 409, null);
  }

  /** Run code (the console's; `dryRun`: every em.write a proof; `history`
   *  false: not kept in this machine's history — the console's «Aiuto»). */
  async run(code: string, opts: { dryRun?: boolean; history?: boolean } = {}): Promise<PyOutcome> {
    return this.drive(() => this.onDocument("/py/run", { code, dry_run: !!opts.dryRun,
      ...(opts.history === false ? { history: false } : {}) }));
  }

  /** This machine's console history, the oldest first (bridge level 82; an
   *  older bridge: none). Needs no session. */
  async history(limit = 1000): Promise<Array<{ code: string; at?: string | null; dry_run?: boolean }>> {
    const { status, answer } = await this.post("/py/history", { limit });
    return status === 200 ? ((answer as { entries?: Array<{ code: string }> }).entries ?? []) : [];
  }

  /** MICRO-PL17 · a plugin's command on this document (its steps applied as
   *  every other: one undo step each, a Log line). */
  async invoke(plugin: string, command: string, slots: Record<string, unknown>): Promise<PyOutcome> {
    return this.drive(() => this.onDocument("/py/invoke", { plugin, command, slots }));
  }

  /** MICRO-PL17 · the plugins' checks (check@1) on this document: warnings only. */
  async checks(): Promise<PyIssueWire[]> {
    const out = await this.drive(() => this.onDocument("/py/checks", {}));
    return out.result?.issues ?? [];
  }

  /** MICRO-PL25 · many read-only commands at once (sections, columns, the
   *  status bar, panels' values): no step, never a write. */
  async compute(items: Array<{ key: string; plugin: string; command: string; slot: string; slots: Record<string, unknown> }>): Promise<PyValueWire[]> {
    const out = await this.drive(() => this.onDocument("/py/compute", { items }));
    return out.result?.values ?? [];
  }

  /** MICRO-PL17 · the plugins active for EMStudio, as the bridge loaded them (no session needed). */
  async plugins(): Promise<unknown> {
    const { status, answer } = await this.post("/py/plugins", { lang: this.page.lang() });
    if (status !== 200) throw new PyError(wordsOf(answer, this.page.lang()) || `HTTP ${status}`, status, answer);
    const a = answer as { listeners?: Record<string, number> };
    // the plugins' listeners hear every document: an event is forwarded when one waits
    if (a.listeners) for (const [k, n] of Object.entries(a.listeners)) if (n > 0) this.listeners[k] = Math.max(this.listeners[k] ?? 0, n);
    return answer;
  }

  /** An event of the page, forwarded only when a Python listener waits for it. */
  async event(name: PyEvent, payload: Record<string, unknown> = {}): Promise<PyOutcome | null> {
    if (!(this.listeners[name] > 0) || this.busy) return null;
    if (!this.id) await this.open();
    if (name === "graph-changed" && this.applying) return null;
    return this.drive(() => this.onDocument("/py/events", { event: name, payload }));
  }

  async complete(text: string): Promise<string[]> {
    if (!this.id) await this.open();
    const { status, answer } = await this.post("/py/complete", { session: this.id, text });
    return status === 200 ? ((answer as { matches?: string[] }).matches ?? []) : [];
  }

  /** MICRO-SEG02 · the whole answer: each name with its kind, the open call's
   *  signature, the tail the names replace (an older bridge: its strings). */
  async completeRich(text: string): Promise<string[] | { items: Array<{ text: string; kind: string; label?: string; detail?: string }>;
                                                          tail?: string; signature?: { name: string; text: string; doc?: string };
                                                          callable?: { name: string; kind: string } }> {
    if (!this.id) await this.open();
    let { status, answer } = await this.post("/py/complete", { session: this.id, text });
    // a session the bridge forgot (restarted): a new one, asked again
    if (status === 404) { await this.open(); ({ status, answer } = await this.post("/py/complete", { session: this.id, text })); }
    if (status !== 200) return [];
    const a = answer as { matches?: string[]; items?: Array<{ text: string; kind: string }>; tail?: string; signature?: { name: string; text: string; doc?: string };
                          callable?: { name: string; kind: string } };
    // MICRO-SEG12 · `callable`: a function followed by «.» (nothing to reach)
    return a.items ? { items: a.items, ...(a.tail !== undefined ? { tail: a.tail } : {}), ...(a.signature ? { signature: a.signature } : {}),
                       ...(a.callable ? { callable: a.callable } : {}) } : (a.matches ?? []);
  }

  async close(): Promise<void> {
    if (!this.id) return;
    const id = this.id;
    this.id = null;
    await this.post("/py/close", { session: id }).catch(() => null);
  }

  /** Follow a run to its end: steps applied, requests executed, waits answered. */
  private async drive(first: () => Promise<PyAnswer>): Promise<PyOutcome> {
    if (this.busy) throw new PyError(this.page.t("py.busy"), 409, null);
    this.busy = true;
    const out: PyOutcome = { ok: true, status: "running", output: "", steps: [], proofs: [], requests: [] };
    try {
      let a = await first();
      for (;;) {
        out.output += a.output ?? "";
        if (a.listeners) this.listeners = a.listeners;
        for (const step of a.steps ?? []) this.applyStep(a.run!, step, out);
        out.proofs.push(...(a.proofs ?? []));
        let answer: unknown = undefined;
        let hasAnswer = false;
        for (const req of a.app_requests ?? []) {
          out.requests.push(req);
          const r = await this.execute(req);
          if (req.wait && a.waiting && req.n === a.waiting.n) { answer = r; hasAnswer = true; }
        }
        if (a.status === "waiting" && a.waiting && !hasAnswer) { answer = await this.execute(a.waiting); hasAnswer = true; }
        if (a.status !== "waiting" && a.status !== "running") {
          out.status = a.status ?? "done";
          out.ok = !!a.ok;
          if (a.value !== undefined) out.value = a.value;
          if (a.result !== undefined) out.result = a.result;
          if (!a.ok) out.error = wordsOf(a, this.page.lang());
          return out;
        }
        const { status, answer: next } = await this.post("/py/resume", {
          session: this.id, run: a.run, ...(hasAnswer ? { answer } : {}) });
        if (status !== 200) throw new PyError(wordsOf(next, this.page.lang()) || `HTTP ${status}`, status, next);
        a = next;
      }
    } finally {
      this.busy = false;
    }
  }

  private applyStep(run: string, step: PyStep, out: PyOutcome): void {
    this.applying = true;
    try {
      const revision = this.page.applyStep(step);
      this.ack = { run, revision };
    } finally {
      this.applying = false;
    }
    out.steps.push(step);
    const refused = step.refused?.length ? ` · ${this.page.t("py.partial", { n: String(step.refused.length) })}` : "";
    this.page.log(refused ? "warn" : "info",
      this.page.t(step.volatile ? "py.stepProposal" : "py.step", { label: step.label }) + refused, step.ids);
  }

  /** One request of `em.app`; for the waiting ones, the answer to resume with. */
  private async execute(req: PyRequest): Promise<unknown> {
    const h = this.page.host;
    try {
      switch (req.kind) {
        case "select": h.select((req.ids as string[]) ?? []); return null;
        case "view": return h.view(String(req.name)) ? null : { error: this.page.t("py.noView", { name: String(req.name) }) };
        case "notify": h.notify(String(req.message ?? ""), (req.level as "info") ?? "info"); return null;
        case "frame": h.frame((req.ids as string[]) ?? []); return null;
        case "set_camera": h.setCamera(req.camera); return null;
        case "camera": { const c = h.camera(); return c == null ? { error: this.page.t("py.noSpace") } : { value: c }; }
        case "command": {
          // MICRO-SEG02 · a refusal is thrown (caught below, said in the page's
          // words); `false` is a value a command may answer
          const v = await h.command(String(req.id), (req.slots as Record<string, unknown>) ?? {});
          return { value: v ?? null };
        }
        case "app": {
          if (!h.app) return { error: this.page.t("py.noApp", { op: String(req.op) }) };
          return { value: (await h.app(String(req.op), (req.args as Record<string, unknown>) ?? {})) ?? null };
        }
        case "pick": {
          const v = await h.pick(String(req.prompt ?? ""), String(req.primitive ?? "point"));
          return v == null ? { cancelled: true, why: this.page.t("py.pickNone") } : { value: v };
        }
      }
    } catch (e) {
      return { error: String((e as Error)?.message ?? e) };
    }
    return { error: `unknown request ${req.kind}` };
  }
}
