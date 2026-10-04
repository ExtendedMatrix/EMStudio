// N1/N2 (E.D., 4 Oct 2026) · «Choose the node»: the same panel as EM Tools,
// asked of the same finder (s3Dgraphy `tools/node_finder.py`, through the
// bridge): (a) this computer, (b) the nodes of the local network found by
// themselves, (c) the saved ones, (d) one typed by hand — each with whether it
// answers, its version, the ways in, and ONE sentence saying what to do.
// When this computer has no node: «Turn on a node on this computer» (the
// personal node: this computer only, the files stay in the folders). «Open to
// the local network» is an explicit choice, with the sentence of who can come in.
import { t, getLocale } from "./i18n";
import { stateBadge } from "./state-symbols";

export interface NodeRow {
  url: string; reachable: boolean; version?: string; profile?: string; ways_in?: string[];
  name?: string; rooms?: number | null;
}
export interface Found {
  local: NodeRow[]; lan: NodeRow[]; saved: NodeRow[]; typed: NodeRow[];
  lan_how: string; lan_note: string; suggestion: string; suggestion_key: string; real_node: string;
}
export interface PersonalState { running: boolean; lan?: boolean; url?: string; lan_url?: string | null; who?: string }

export interface ChooserHooks {
  bridge: string;
  saved: string[];
  current(): string;
  projectRoot: string;
  use(url: string): void;
  log(line: string): void;
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function post(bridge: string, route: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${bridge}${route}`, { method: "POST", headers: { "Content-Type": "application/json" },
                                             body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(String(j.error ?? `bridge ${r.status}`));
  return j;
}

export const findNodes = (h: ChooserHooks, typed = "") =>
  post(h.bridge, "/nodes", { saved: h.saved, typed, lang: getLocale() === "it" ? "it" : "en" }) as unknown as Promise<Found>;
export const personal = (h: ChooserHooks, action: "start" | "stop" | "status", lan = false) =>
  post(h.bridge, "/node/personal", { action, lan, root: h.projectRoot }) as unknown as Promise<PersonalState & { ok: boolean; error?: string }>;

function row(n: NodeRow, h: ChooserHooks, host: HTMLElement): HTMLElement {
  const r = el("div", "nc-row");
  r.dataset.url = n.url;
  r.appendChild(stateBadge(n.reachable ? "node.reachable" : "node.unreachable", false));
  r.appendChild(el("b", "", n.name || n.url.replace(/^https?:\/\//, "")));
  if (n.reachable) {
    const facts = [n.version ? `v${n.version}` : "", n.profile === "personal" ? t("nodes.personal") : "",
                   (n.ways_in ?? []).map((w) => t(`nodes.way.${w}`)).join(" · ")].filter(Boolean).join(" · ");
    r.appendChild(el("span", "insp-hint", facts));
    const use = el("button", "ghost", n.url === h.current() ? t("nodes.inUse") : t("nodes.use")) as HTMLButtonElement;
    use.disabled = n.url === h.current();
    use.dataset.act = "use";
    use.addEventListener("click", () => { h.use(n.url); void paintChooser(host, h); });
    r.appendChild(use);
  } else {
    r.appendChild(el("span", "insp-hint", t("nodes.silent")));
  }
  return r;
}

export async function paintChooser(host: HTMLElement, h: ChooserHooks, typed = ""): Promise<void> {
  host.replaceChildren(el("h3", "insp-sect", t("nodes.title")), el("div", "insp-hint", t("nodes.looking")));
  let found: Found;
  let mine: PersonalState = { running: false };
  try {
    [found, mine] = await Promise.all([findNodes(h, typed), personal(h, "status").catch(() => ({ running: false }))]);
  } catch (e) {
    host.replaceChildren(el("h3", "insp-sect", t("nodes.title")), el("div", "insp-hint", (e as Error).message));
    return;
  }
  host.replaceChildren(el("h3", "insp-sect", t("nodes.title")));
  const say = el("div", "nc-say", found.suggestion);
  say.dataset.key = found.suggestion_key;
  host.appendChild(say);
  const group = (key: string, rows: NodeRow[], note = ""): void => {
    const g = el("div", "nc-group");
    g.dataset.group = key;
    g.appendChild(el("div", "nc-head", t(`nodes.g.${key}`)));
    for (const n of rows) g.appendChild(row(n, h, host));
    if (!rows.length) g.appendChild(el("div", "insp-hint", note || t("nodes.none")));
    host.appendChild(g);
  };
  group("local", found.local);
  // N2 · this computer: turn on, open to the network, turn off
  const acts = el("div", "nc-acts");
  if (!mine.running) {
    const on = el("button", "", t("nodes.turnOn")) as HTMLButtonElement;
    on.dataset.act = "turn-on";
    on.title = t("nodes.turnOnHint");
    on.addEventListener("click", async () => {
      on.disabled = true;
      try { const s = await personal(h, "start"); h.log(`${t("nodes.turnOn")}: ${s.url} · ${s.who}`); h.use(String(s.url)); }
      catch (e) { h.log(`${t("nodes.turnOn")}: ${(e as Error).message}`); }
      void paintChooser(host, h);
    });
    acts.appendChild(on);
  } else {
    acts.appendChild(el("div", "insp-hint", `${t("nodes.personalOn")} · ${mine.url}${mine.lan ? ` · ${mine.lan_url}` : ""}`));
    acts.appendChild(el("div", "nc-custody", t("fs.personalNode")));
    const lan = el("button", "ghost", mine.lan ? t("nodes.closeLan") : t("nodes.openLan")) as HTMLButtonElement;
    lan.dataset.act = mine.lan ? "close-lan" : "open-lan";
    lan.addEventListener("click", async () => {
      if (!mine.lan && !window.confirm(t("nodes.openLanAsk"))) return;   // an explicit choice
      try { const s = await personal(h, "start", !mine.lan); h.log(`${lan.textContent}: ${s.who}`); }
      catch (e) { h.log((e as Error).message); }
      void paintChooser(host, h);
    });
    const off = el("button", "ghost", t("nodes.turnOff")) as HTMLButtonElement;
    off.dataset.act = "turn-off";
    off.addEventListener("click", async () => { await personal(h, "stop").catch(() => null); void paintChooser(host, h); });
    acts.append(lan, off);
  }
  host.appendChild(acts);
  group("lan", found.lan, found.lan_how === "none" ? found.lan_note : t("nodes.noneLan"));
  group("saved", found.saved);
  // (d) by hand
  const hand = el("div", "nc-group");
  hand.dataset.group = "typed";
  hand.appendChild(el("div", "nc-head", t("nodes.g.typed")));
  const input = document.createElement("input");
  input.placeholder = "https://…";
  input.value = typed;
  const go = el("button", "ghost", t("nodes.try")) as HTMLButtonElement;
  go.addEventListener("click", () => { void paintChooser(host, h, input.value.trim()); });
  hand.append(input, go);
  for (const n of found.typed) hand.appendChild(row(n, h, host));
  host.appendChild(hand);
  // a real node, and the move that does not exist yet
  host.appendChild(el("div", "insp-hint nc-real", found.real_node));
  const travaso = el("button", "ghost", t("nodes.travaso")) as HTMLButtonElement;
  travaso.disabled = true;
  travaso.dataset.act = "travaso";
  travaso.title = t("nodes.travasoHint");
  host.appendChild(travaso);
}
