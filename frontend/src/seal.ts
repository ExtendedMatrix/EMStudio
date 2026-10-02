/**
 * CAMPAGNA · parte 3 · IL SIGILLO.
 *
 * E.D. (1 ott 2026): «codice sì, ma nascosto in maniera elegante sotto una
 * pelle esteticamente bella». A stamp that worked closes with a wax seal that
 * presses itself: its edge is irregular — the wax ran, nobody drew it with a
 * compass — and DETERMINISTIC from the digest, so the same bytes always give
 * the same seal; inside, «EM» and the first six hex digits of the digest.
 * Beside it, in words: what was stamped, where it comes from, who, when and
 * with what. Under a closed triangle, «Dettagli tecnici»: the digest,
 * `digest_covers`, `packaging`, the canonical list of the members and the real
 * `.stamp.json`, with «Copy the JSON».
 *
 * The seal reads the stamp it is given and computes NOTHING of its identity:
 * the digest is the stamp's, the canonical list is the stamp's own members
 * written in dtcstamp's order and form (`role ␀ path ␀ digest`, a thin space each side of the NUL for the eye, by the UTF-8
 * bytes of the path) for a reader — never re-hashed here.
 *
 * Prototype: the desk, artifact «EMStudio alla scrivania» v18
 * (`.claude/wip/materials/scrivania-v12.js`). Here: theme tokens for the
 * card (light and dark), `prefers-reduced-motion` drops the press and keeps
 * the seal, Esc closes, the focus goes to «Done» and comes back.
 */
import { t } from "./i18n";

export interface SealStamp {
  stamp?: number;
  self?: {
    resource_id?: string; digest?: string; digest_covers?: string; packaging?: string; label?: string;
    members?: Array<{ role?: string; path: string; digest?: string; size_bytes?: number }>;
    content_digest?: { digest?: string; files?: number };
    measures?: { size_bytes?: number; files?: number };
  };
  from?: Array<{ resource_id?: string; label?: string }>;
  how?: { dtc_kind?: string; technique?: string; process_id?: string; software?: Array<{ name?: string; version?: string }>;
          acquisition?: { name?: string; retrieved_from?: string } };
  by?: { at?: string; operator?: { id?: string; label?: string } };
}

/** The hex of a digest (`sha256:<hex>` → `<hex>`), lower case. */
export const hexOf = (digest: string | undefined): string =>
  String(digest ?? "").replace(/^sha256:/i, "").toLowerCase().replace(/[^0-9a-f]/g, "");

/** The wax's edge: 28 points around the seal, each radius from one hex digit
 *  of the digest. Pure and deterministic — `check-campagna` pins it. */
export function sealEdge(hex: string, n = 28, r = 58, c = 66): string {
  const h = hex || "0";
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = parseInt(h[i % h.length], 16) / 15;
    const rr = r + (j - 0.5) * 7;
    pts.push(`${(c + Math.cos(a) * rr).toFixed(1)},${(c + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

let sealSeq = 0;
/** The seal, as SVG markup. `press` = the animated one of the card. */
export function sealSvg(digest: string | undefined, size = 132, press = false): string {
  const hex = hexOf(digest);
  const id = `s${++sealSeq}`;
  const tick = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    return `<line x1="${(66 + Math.cos(a) * 40).toFixed(1)}" y1="${(66 + Math.sin(a) * 40).toFixed(1)}" x2="${(66 + Math.cos(a) * 44).toFixed(1)}" y2="${(66 + Math.sin(a) * 44).toFixed(1)}"/>`;
  }).join("");
  // a small turn of the whole impression, also from the digest: two seals side
  // by side are told apart before their digits are read
  const turn = ((parseInt(hex.slice(6, 8) || "0", 16) / 255) * 24 - 12).toFixed(1);
  return `<svg class="seal-svg${press ? " seal-press" : ""}" viewBox="0 0 132 132" width="${size}" height="${size}" role="img" aria-label="${escapeAttr(t("seal.aria", { d: hex.slice(0, 6) }))}" data-seal="${hex.slice(0, 12)}">
  <defs><radialGradient id="${id}w" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#d4473b"/><stop offset=".55" stop-color="#9c1f1a"/><stop offset="1" stop-color="#5e0f0c"/></radialGradient>
  <radialGradient id="${id}d" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#7d1612"/><stop offset="1" stop-color="#a5271f"/></radialGradient></defs>
  <path d="${sealEdge(hex)}" fill="url(#${id}w)"/>
  <g transform="rotate(${turn} 66 66)">
  <circle cx="66" cy="66" r="46" fill="url(#${id}d)" stroke="#5a0d0a" stroke-width="1.2" opacity=".95"/>
  <g stroke="#e6897c" stroke-width="1" opacity=".55">${tick}</g>
  <circle cx="66" cy="66" r="36" fill="none" stroke="#5a0d0a" stroke-width="1"/>
  <g fill="#f1b3a6" opacity=".92" text-anchor="middle">
   <text x="66" y="62" font-size="20" font-weight="700" letter-spacing="1" font-family="ui-serif, Georgia, serif">EM</text>
   <text x="66" y="80" font-size="10" letter-spacing="1.5" font-family="ui-monospace, monospace">${hex.slice(0, 6)}</text></g></g>
  <path d="M30,40 Q44,26 62,24" stroke="#ffd2c8" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>
 </svg>`;
}

/** The little seal that takes the place of the word «stamped». */
export function sealMini(digest: string | undefined, onOpen?: () => void): HTMLElement {
  const b = document.createElement(onOpen ? "button" : "span");
  b.className = "seal-mini";
  b.dataset.sealMini = hexOf(digest).slice(0, 12);
  b.title = t("seal.miniHint", { d: hexOf(digest).slice(0, 6) });
  b.setAttribute("aria-label", t("seal.miniHint", { d: hexOf(digest).slice(0, 6) }));
  if (onOpen) {
    (b as HTMLButtonElement).type = "button";
    b.addEventListener("click", (e) => { e.stopPropagation(); onOpen(); });
  }
  b.innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="${sealEdge(hexOf(digest), 14, 7.2, 8)}" fill="#9c1f1a"/><circle cx="8" cy="8" r="4.6" fill="#7d1612" stroke="#e6897c" stroke-width=".6"/></svg>`;
  return b;
}

/** dtcstamp's canonical list of the members, for a READER: one line per
 *  member, `role ␀ path ␀ digest`, in the order of the UTF-8 bytes of the NFC
 *  path. Shown, never hashed here. */
export function canonicalMembers(members: NonNullable<NonNullable<SealStamp["self"]>["members"]>): string {
  const enc = new TextEncoder();
  const cmp = (a: string, b: string): number => {
    const x = enc.encode(a), y = enc.encode(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
    return x.length - y.length;
  };
  return members.map((m) => ({ role: m.role || "member", path: m.path.normalize("NFC").replace(/\\/g, "/").replace(/^\/+/, ""),
                               digest: m.digest ?? "" }))
    .sort((a, b) => cmp(a.path, b.path))
    .map((m) => `${m.role} ␀ ${m.path} ␀ ${m.digest}`).join("\n");
}

export interface SealWords {
  /** «Una risorsa, 3 file: …» / the file / the folder */
  what: string;
  /** «Viene da …» or «Origine: …» */
  from: string;
  who: string;
  when: string;
  withWhat: string;
}

/** The words of the card, from the stamp alone (and the label of its kind). */
export function sealWords(st: SealStamp, kindLabel: (k: string) => string = (k) => k): SealWords {
  const self = st.self ?? {};
  const members = self.members ?? [];
  const label = self.label || members.find((m) => m.role === "entry_point")?.path || self.resource_id || "";
  let what: string;
  if (self.packaging === "file_set" && members.length > 1) {
    const others = members.filter((m) => m.role !== "entry_point").map((m) => m.path.split("/").pop());
    what = t("seal.whatSet", { n: String(members.length), door: label, others: others.join(", ") });
  } else if (self.packaging === "directory") {
    what = t("seal.whatFolder", { name: label, n: String(self.content_digest?.files ?? self.measures?.files ?? "") });
  } else if (self.packaging === "archive") {
    what = t("seal.whatArchive", { name: label, n: String(self.content_digest?.files ?? "") });
  } else {
    what = t("seal.whatFile", { name: label });
  }
  const parents = (st.from ?? []).map((p) => p.label || p.resource_id || "").filter(Boolean);
  const kind = st.how?.dtc_kind ? kindLabel(st.how.dtc_kind) : "";
  const from = parents.length
    ? t("seal.from", { parents: parents.join(", "), kind })
    : t("seal.origin", { campaign: st.how?.acquisition?.name || kind || "—" })
      // DEV29 B5 · a retrieval says where the bytes were taken from
      + (st.how?.acquisition?.retrieved_from ? ` · ${t("seal.retrievedFrom", { src: st.how.acquisition.retrieved_from })}` : "");
  const op = st.by?.operator;
  const orcid = op?.id ? op.id.replace(/^https?:\/\/orcid\.org\//, "") : "";
  const who = op?.label ? (orcid ? `${op.label} · ${orcid}` : op.label) : orcid || t("seal.nobody");
  const sw = (st.how?.software ?? []).map((s) => [s.name, s.version].filter(Boolean).join(" ")).filter(Boolean);
  return { what, from, who, when: st.by?.at ?? "", withWhat: sw.join(", ") };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const escapeAttr = escapeHtml;

export interface SealCardOptions {
  /** where the stamp is (its sidecar), said under the technical details */
  stampPath?: string;
  /** the stamps of the same act, when there are several (a folder of tiles) */
  others?: SealStamp[];
  kindLabel?: (k: string) => string;
  /** a copy to the clipboard was tried (for a toast): did it work? */
  onCopied?: (ok: boolean) => void;
}

/**
 * Open the card. One at a time: a second call replaces the first. Returns the
 * veil (the probes read it; nothing else should hold on to it).
 */
export function openSealCard(st: SealStamp, opts: SealCardOptions = {}): HTMLElement {
  document.querySelector(".seal-veil")?.remove();
  const before = document.activeElement as HTMLElement | null;
  const self = st.self ?? {};
  const w = sealWords(st, opts.kindLabel);
  const others = (opts.others ?? []).filter((o) => o.self?.digest !== self.digest);
  const veil = document.createElement("div");
  veil.className = "seal-veil";
  const card = document.createElement("div");
  card.className = "seal-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", t("seal.title"));
  card.tabIndex = -1;
  const json = JSON.stringify(st, null, 1);
  const members = self.members ?? [];
  card.innerHTML = `<div class="seal-paper">${sealSvg(self.digest, 132, true)}<div class="seal-words">
    <h3>${escapeHtml(t("seal.title"))}</h3>
    <div class="seal-what" data-seal-what>${escapeHtml(w.what)}</div>
    <div class="seal-who"><span data-seal-from>${escapeHtml(w.from)}</span><br>
      <b data-seal-by>${escapeHtml(w.who)}</b>${w.when ? ` · <span data-seal-at>${escapeHtml(w.when)}</span>` : ""}${w.withWhat ? ` · <span data-seal-sw>${escapeHtml(w.withWhat)}</span>` : ""}</div>
    ${others.length ? `<div class="seal-what" data-seal-others="${others.length}">${escapeHtml(t("seal.others", { n: String(others.length) }))} ${others.map((o) => escapeHtml(o.self?.label ?? "")).join(", ")}</div>` : ""}
    <div class="seal-note">${escapeHtml(t("seal.note"))}</div></div></div>
   <details class="seal-tech"><summary><span class="tri" aria-hidden="true"></span>${escapeHtml(t("seal.tech"))}</summary><div class="tech">
    <div><span class="k">digest</span> <code data-seal-digest>${escapeHtml(self.digest ?? "")}</code></div>
    <div><span class="k">digest_covers</span> <code>${escapeHtml(self.digest_covers ?? "")}</code> · <span class="k">packaging</span> <code>${escapeHtml(self.packaging ?? "")}</code></div>
    ${self.content_digest?.digest ? `<div><span class="k">content_digest</span> <code>${escapeHtml(self.content_digest.digest)}</code> · ${escapeHtml(String(self.content_digest.files ?? ""))}</div>` : ""}
    ${members.length > 1 ? `<div><span class="k">${escapeHtml(t("seal.canonical"))}</span><pre data-seal-canonical>${escapeHtml(canonicalMembers(members))}</pre></div>` : ""}
    <div><span class="k">.stamp.json</span>${opts.stampPath ? ` <code class="seal-path">${escapeHtml(opts.stampPath)}</code>` : ""}<pre data-seal-json>${escapeHtml(json)}</pre></div></div></details>
   <div class="seal-acts"><button class="ghost" type="button" data-seal-copy>${escapeHtml(t("seal.copy"))}</button><button class="primary" type="button" data-seal-close>${escapeHtml(t("seal.done"))}</button></div>`;
  veil.appendChild(card);
  document.body.appendChild(veil);
  const close = (): void => {
    veil.remove();
    document.removeEventListener("keydown", onKey, true);
    before?.focus?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  };
  document.addEventListener("keydown", onKey, true);
  veil.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    if (el === veil || el.closest("[data-seal-close]")) close();
    else if (el.closest("[data-seal-copy]")) {
      const done = navigator.clipboard?.writeText(json);
      if (done) void done.then(() => opts.onCopied?.(true), () => opts.onCopied?.(false));
      else opts.onCopied?.(false);
    }
  });
  (card.querySelector("[data-seal-close]") as HTMLElement | null)?.focus();
  return veil;
}
