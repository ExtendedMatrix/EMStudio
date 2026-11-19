/**
 * MICRO-PL27-PLUGIN-SUL-NODO (X7, E.D. 18–19 Nov 2026) · the plugins of the
 * StratiGraph node, in the web page's «Estensioni».
 *
 * On the web there is no Python of the person's (SPEC-plugin §10, §14.6): a
 * plugin there is third parties' code the node's ADMINISTRATOR installed, run
 * by the node for a room, one call per process in a cage (s3dgraphy
 * `extensions.node`: no network, no file of the node, no process of its own,
 * CPU, memory, a wall clock, quotas per room). This module is the page's half:
 *
 *  - what the node says (`GET <hub>/v1/rooms/<room>/plugins`): whether the
 *    cage is serious — if not, the plugins are OFF and the reason is said —,
 *    the plugins of the node, whether each is on in THIS room, the room's
 *    quota;
 *  - the room's owner turns one on or off (`POST …/plugins/<id>` `{on}`);
 *    anybody else sees the switch, disabled, with why;
 *  - a command runs on the node (`POST …/plugins/<id>/commands/<cmd>`): the
 *    page sends the slots it can fill (none, or the selection as `id`/`ids`),
 *    never an author — the node takes it from the session —; a command that
 *    writes is disabled in a room this session only reads. What the command
 *    wrote reaches the page as the room's ops, like any other writer's: the
 *    page applies nothing of the answer; it says the value (as TEXT) and the
 *    refusal in the page's language.
 *
 * A node that does not serve these routes (404) is said once: «this node
 * offers no plugins». Every word of a plugin is drawn as text (no innerHTML).
 */

export interface NodeProblem { code: string; level?: string; en: string; it: string }
export interface NodeCommand {
  id: string; name: string; label: Record<string, string>; writes: boolean;
  slots: Array<{ name: string; kind?: string; required?: boolean }>;
  label_text?: string;
}
export interface NodePlugin {
  id: string; version: string; name: string | Record<string, string>; verified: boolean;
  reviewed?: { by?: string; on?: string } | null; eligible: boolean; problems: NodeProblem[];
  capabilities: string[]; commands: NodeCommand[]; on?: boolean; turned_on?: { by?: string; at?: string };
}
export interface NodePluginsDoc {
  host: string;
  isolation: { backend: string; serious: boolean; problems: NodeProblem[]; at?: string };
  plugins: NodePlugin[];
  room?: string;
  quota?: { calls_last_minute: number; cpu_s_last_hour: number; running: number;
            limits: Record<string, number> };
}
export interface NodeRunAnswer {
  ok: boolean; reason?: string; message?: string; messages?: { en: string; it: string };
  value?: unknown; file?: { name: string; mime: string; text?: string; b64?: string };
  applied?: number; wall_s?: number;
}

export interface NodePluginsHost {
  /** the node's base (`<hub>`), null when none is configured */
  nodeBase(): string | null;
  /** the room this page is in, null when it is in none */
  room(): string | null;
  /** the node's signed fetch (the session's token, renewed in one place) */
  fetch(url: string, init?: RequestInit): Promise<Response>;
  lang(): string;
  changed(): void;
}

/** the problem in the page's language */
export function problemIn(p: NodeProblem, lang: string): string {
  return lang.startsWith("it") ? p.it || p.en : p.en || p.it;
}

/** what the page can fill: no required slot, or only the selection's (`id`, `ids`) */
export function fillable(c: NodeCommand): boolean {
  return c.slots.every((s) => s.required === false || s.kind === "id" || s.kind === "ids");
}

/** the slots of a command from the selection (`id` the first, `ids` all) */
export function slotsFor(c: NodeCommand, selection: string[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const s of c.slots) {
    if (s.kind === "id") { if (selection.length) out[s.name] = selection[0]; else if (s.required !== false) return null; }
    else if (s.kind === "ids") { if (selection.length) out[s.name] = [...selection]; else if (s.required !== false) return null; }
    else if (s.required !== false) return null;
  }
  return out;
}

/** a command's value as one line of text (never markup) */
export function valueText(v: unknown, lang: string): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.en === "string" || typeof o.it === "string") return String((lang.startsWith("it") ? o.it : o.en) ?? o.en ?? o.it);
  }
  const s = JSON.stringify(v);
  return s.length > 400 ? `${s.slice(0, 399)}…` : s;
}

/** a room's role that may turn a plugin on: its owner or an admin (the node checks it again) */
export function canTurnOn(role: string | undefined | null): boolean {
  return role === "owner" || role === "admin";
}

export class NodePluginsState {
  doc: NodePluginsDoc | null = null;
  /** null: asked and answered; a word: why there is nothing to show */
  why: "noNode" | "noRoom" | "notOffered" | "error" | null = null;
  error = "";
  /** the last answer of a command, by `<id>/<cmd>` */
  answers: Record<string, NodeRunAnswer> = {};
  running = new Set<string>();
  rev = 0;
  constructor(private host: NodePluginsHost) {}

  private base(room: string): string | null {
    const b = this.host.nodeBase();
    return b ? `${b.replace(/\/$/, "")}/v1/rooms/${encodeURIComponent(room)}/plugins` : null;
  }

  async refresh(): Promise<void> {
    const room = this.host.room();
    const base = room ? this.base(room) : null;
    if (!this.host.nodeBase()) { this.doc = null; this.why = "noNode"; }
    else if (!room || !base) { this.doc = null; this.why = "noRoom"; }
    else {
      try {
        const r = await this.host.fetch(`${base}?lang=${encodeURIComponent(this.host.lang())}`, { cache: "no-store" });
        if (r.status === 404) { this.doc = null; this.why = "notOffered"; }
        else if (!r.ok) { this.doc = null; this.why = "error"; this.error = `HTTP ${r.status}`; }
        else { this.doc = await r.json() as NodePluginsDoc; this.why = null; }
      } catch (e) { this.doc = null; this.why = "error"; this.error = String((e as Error)?.message ?? e); }
    }
    this.rev++;
    this.host.changed();
  }

  async setOn(id: string, on: boolean): Promise<string | null> {
    const room = this.host.room();
    const base = room ? this.base(room) : null;
    if (!base) return null;
    try {
      const r = await this.host.fetch(`${base}/${encodeURIComponent(id)}`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
      const j = await r.json().catch(() => ({})) as { messages?: { en: string; it: string }; error?: string };
      if (!r.ok) return j.messages ? problemIn({ code: "", ...j.messages }, this.host.lang()) : (j.error ?? `HTTP ${r.status}`);
    } catch (e) { return String((e as Error)?.message ?? e); }
    await this.refresh();
    return null;
  }

  async run(id: string, cmd: string, slots: Record<string, unknown>): Promise<NodeRunAnswer> {
    const room = this.host.room();
    const base = room ? this.base(room) : null;
    const key = `${id}/${cmd}`;
    if (!base) return { ok: false, message: "" };
    this.running.add(key);
    this.rev++;
    this.host.changed();
    let a: NodeRunAnswer;
    try {
      const r = await this.host.fetch(`${base}/${encodeURIComponent(id)}/commands/${encodeURIComponent(cmd)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // never an author: the node takes it from the session's token
        body: JSON.stringify({ slots, lang: this.host.lang() }) });
      a = await r.json().catch(() => ({ ok: false, message: `HTTP ${r.status}` })) as NodeRunAnswer;
      if (!r.ok && a.ok !== false) a = { ok: false, message: `HTTP ${r.status}` };
    } catch (e) { a = { ok: false, message: String((e as Error)?.message ?? e) }; }
    this.running.delete(key);
    this.answers[key] = a;
    this.rev++;
    this.host.changed();
    return a;
  }
}

// ── the section ─────────────────────────────────────────────────────────────

export interface NodeSectionHost {
  t(key: string, vars?: Record<string, string>): string;
  lang(): string;
  /** this session's role in the room (`owner`, `editor`, `viewer`…) */
  role(): string | null;
  /** the room lets this session write */
  canWrite(): boolean;
  selection(): string[];
  log(msg: string): void;
}

/** «Plugin del nodo» — drawn under the node's packages in «Estensioni». */
export function nodePluginsSection(doc: Document, host: NodeSectionHost, state: NodePluginsState, repaint: () => void): HTMLElement {
  const t = host.t, lang = host.lang();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const sec = el("div", "ext-node-plugins");
  sec.dataset.extNodePlugins = "1";
  sec.appendChild(el("h3", "ext-sect-h", t("npl.head")));
  sec.appendChild(el("p", "cw-hint", t("npl.hint")));
  if (state.why || !state.doc) {
    const p = el("p", state.why === "error" ? "cw-warn" : "cw-hint",
      state.why ? t(`npl.why.${state.why}`, { e: state.error }) : t("ext.loading"));
    p.dataset.nplWhy = state.why ?? "loading";
    sec.appendChild(p);
    return sec;
  }
  const d = state.doc;
  // the cage, first: not serious = the plugins are off, and why
  const iso = el("p", d.isolation.serious ? "cw-hint npl-iso" : "cw-warn npl-iso",
    d.isolation.serious ? t("npl.isoOn", { b: d.isolation.backend }) : t("npl.isoOff", { b: d.isolation.backend }));
  iso.dataset.nplSerious = String(d.isolation.serious);
  sec.appendChild(iso);
  for (const p of d.isolation.problems ?? []) {
    const w = el("div", p.level === "warning" ? "cw-hint" : "cw-warn", problemIn(p, lang));
    w.dataset.nplIsoProblem = p.code;
    sec.appendChild(w);
  }
  if (d.quota) {
    const q = el("p", "cw-hint npl-quota", t("npl.quota", {
      c: String(d.quota.calls_last_minute), cm: String(d.quota.limits.calls_per_minute ?? ""),
      s: String(d.quota.cpu_s_last_hour), sm: String(d.quota.limits.cpu_s_per_hour ?? ""),
      w: String(d.quota.limits.wall_s ?? "") }));
    q.dataset.nplQuota = "1";
    sec.appendChild(q);
  }
  if (!d.plugins.length) { sec.appendChild(el("p", "cw-hint", t("npl.none"))); return sec; }
  const owner = canTurnOn(host.role());
  for (const p of d.plugins) {
    const row = el("div", "ext-row npl-row");
    row.dataset.nplId = p.id;
    const head = el("div", "ext-row-h");
    const name = typeof p.name === "string" ? p.name : (p.name[lang.slice(0, 2)] ?? p.name.en ?? p.id);
    head.append(el("b", "ext-name", name), " ", el("span", "ext-kind ext-kind-plugin", t("npl.kind")));
    row.appendChild(head);
    const facts = [p.id, `v${p.version}`, p.reviewed?.by ? t("npl.reviewed", { by: p.reviewed.by, on: p.reviewed.on ?? "" }) : t("npl.unreviewed")];
    row.appendChild(el("div", "ext-facts", facts.join(" · ")));
    for (const pr of p.problems) {
      const w = el("div", "cw-warn", problemIn(pr, lang));
      w.dataset.nplProblem = pr.code;
      row.appendChild(w);
    }
    // the switch of the room
    const sw = el("label", "npl-switch");
    const box = el("input");
    box.type = "checkbox";
    box.checked = !!p.on;
    box.dataset.nplOn = p.id;
    const off = !d.isolation.serious ? t("npl.offIso") : !p.eligible ? t("npl.offEligible") : !owner ? t("npl.offOwner") : "";
    box.disabled = !!off;
    if (off) sw.title = off;
    box.onchange = async () => {
      const why = await state.setOn(p.id, box.checked);
      if (why) { host.log(why); box.checked = !box.checked; }
      repaint();
    };
    sw.append(box, " ", t("npl.onHere"));
    row.appendChild(sw);
    // the commands, when on
    if (p.on && d.isolation.serious) {
      const cmds = el("div", "npl-cmds");
      for (const c of p.commands) {
        const key = `${p.id}/${c.id}`;
        const label = c.label[lang.slice(0, 2)] ?? c.label.en ?? c.label_text ?? c.id;
        const b = el("button", "cw-mini", state.running.has(key) ? `${label} …` : label);
        b.type = "button";
        b.dataset.nplCmd = key;
        const why = !fillable(c) ? t("npl.cmdSlots") : c.writes && !host.canWrite() ? t("npl.cmdReadOnly") : state.running.has(key) ? t("npl.cmdRunning") : "";
        b.disabled = !!why;
        b.title = why || (c.writes ? t("npl.cmdWrites") : t("npl.cmdReads"));
        b.onclick = async () => {
          const slots = slotsFor(c, host.selection());
          if (!slots) { host.log(t("npl.cmdNeedsSelection", { c: label })); return; }
          const a = await state.run(p.id, c.id, slots);
          const said = a.messages ? problemIn({ code: "", ...a.messages }, lang) : (a.message ?? "");
          host.log(a.ok ? t("npl.ran", { c: label, v: valueText(a.value, lang) || said }) : t("npl.refused", { c: label, why: said }));
          repaint();
        };
        cmds.appendChild(b);
        const a = state.answers[key];
        if (a) {
          const said = a.messages ? problemIn({ code: "", ...a.messages }, lang) : (a.message ?? "");
          const out = el("span", a.ok ? "npl-value" : "npl-refused cw-warn", a.ok ? valueText(a.value, lang) || said : said);
          out.dataset.nplAnswer = key;
          cmds.append(" ", out);
        }
        cmds.appendChild(el("br"));
      }
      row.appendChild(cmds);
    }
    sec.appendChild(row);
  }
  return sec;
}
