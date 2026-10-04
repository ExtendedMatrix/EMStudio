// I1 (decided by E.D., 4 Oct 2026) · EMStudio's drawing of the ONE list of the
// states the EM tools show (s3Dgraphy `JSON_config/em_state_symbols.json`,
// vendored by `./em.sh sync`). The SYMBOL and its MEANING are standard — the
// glyph and the sentences come from the list; the drawing is ours: a tone
// (`--st-*` in style.css) per state. Every state of the list has its sign here
// and none is invented outside it (`scripts/check-state-symbols.mjs`).
import symbols from "./assets/em_state_symbols.json";
import { getLocale } from "./i18n";

export type Tone = "ok" | "info" | "warn" | "bad" | "muted";

/** state id → the tone EMStudio draws it in */
export const TONES: Record<string, Tone> = {
  "file.on_disk": "ok",
  "file.on_node": "info",
  "file.both": "ok",
  "file.reference_only": "muted",
  "file.missing": "bad",
  "file.empty_copy": "warn",
  "node.reachable": "ok",
  "node.unreachable": "bad",
  "node.global": "info",
  "node.local_only": "muted",
  "room.inside": "info",
  "room.outside": "muted",
  "room.read_only": "warn",
  "sync.aligned": "ok",
  "sync.pending": "warn",
  "sync.conflict": "bad",
  "role.owner": "info",
  "role.editor": "info",
  "role.viewer": "muted",
  "scene.only_here": "muted",
};

interface Entry { family: string; glyph: string; label: Record<string, string>; meaning: Record<string, string> }
const STATES = (symbols as unknown as { states: Record<string, Entry> }).states;

export function stateIds(): string[] { return Object.keys(STATES); }

/** glyph, label and meaning of a state in the current language (en fallback) */
export function stateSign(id: string): { glyph: string; label: string; meaning: string; tone: Tone } {
  const e = STATES[id];
  const lang = getLocale() === "it" ? "it" : "en";
  if (!e) return { glyph: "?", label: id, meaning: "", tone: "muted" };
  return { glyph: e.glyph, label: e.label[lang] ?? e.label.en, meaning: e.meaning[lang] ?? e.meaning.en,
           tone: TONES[id] ?? "muted" };
}

/** a small badge: «● on the disk», the meaning as its tooltip */
export function stateBadge(id: string, withLabel = true): HTMLElement {
  const s = stateSign(id);
  const b = document.createElement("span");
  b.className = `state-badge st-${s.tone}`;
  b.dataset.state = id;
  b.textContent = withLabel ? `${s.glyph} ${s.label}` : s.glyph;
  b.title = s.meaning;
  return b;
}
