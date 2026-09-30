/**
 * MICRO-UN-POSTO · THE SITE POSITION HAS ONE PLACE — the inspector of the
 * graph's own node — and ONE selector, the scrivania's v9b picker
 * (`.claude/wip/design/scrivania/emstudio-alla-scrivania-v9b.html`,
 * `openSitePick`).
 *
 * It was edited in four places (Study, the GraphNode inspector, the story's
 * picker, the map embed's section), three of them with the same inline
 * renderer and one with a popover of its own. Now the Study, the story and the
 * map embed SHOW the position and carry «Imposta la posizione del sito…», which
 * opens this selector on the graph node; the inspector of that node is where the
 * position lives, with the same button.
 *
 * Four ways to a point, and only one writes: search a place (Nominatim — the
 * camera flies there and the point is a candidate), click the map, type the
 * numbers, or take it «from the 3D» (the centroid of the graph's geometry,
 * reprojected by the bridge — never the shift, which is the scene's origin).
 * «Usa questo punto» writes `site_position` on the graph-self node, in one undo
 * step; «Togli la posizione» clears it; Annulla and Esc leave it as it was.
 */
import { t } from "./i18n";
import type { DocumentStore } from "./model";
import { createOsmMap } from "./osm-map";
import { geocode, GeocodeOffline, zoomFor } from "./geocode";
import { georeferenceScene } from "./geo";

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(cls: string, text: string, action?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  if (action) b.dataset.action = action;
  return b;
}

let open: HTMLElement | null = null;
/** what the open selector installed on the document, taken away on close */
let unhook: (() => void) | null = null;

/** Is the selector on screen? */
export function sitePickerOpen(): boolean {
  return !!open?.isConnected;
}

export function closeSitePicker(): void {
  unhook?.();
  unhook = null;
  open?.remove();
  open = null;
}

/**
 * Open the selector for `store`'s graph. `graphName` is said in the header, so
 * a person knows WHICH graph they are placing.
 */
export function openSitePicker(store: DocumentStore, graphName: string,
                               onWritten?: () => void): void {
  closeSitePicker();
  const cur = store.readSitePosition();
  let pin: { lat: number; lon: number } | null = cur ? { lat: cur.lat, lon: cur.lon } : null;

  const modal = el("div", "modal site-picker");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", t("site.title"));
  const card = el("div", "modal-card sitepick-card");
  modal.appendChild(card);
  open = modal;

  const head = el("div", "modal-head");
  head.appendChild(el("b", undefined, t("site.title")));
  head.appendChild(el("span", "sitepick-sub", `${graphName} · site_position`));
  const x = button("sitepick-x", "×", "close");
  x.title = t("l.closeEsc");
  head.appendChild(x);
  card.appendChild(head);

  const body = el("div", "sitepick-grid");
  card.appendChild(body);
  const left = el("div", "sitepick-l");
  const right = el("div", "sitepick-r");
  body.append(left, right);

  // ── right: the map and the numbers ─────────────────────────────────────────
  const map = createOsmMap({
    lat: pin?.lat ?? 41.9,
    lon: pin?.lon ?? 12.5,
    zoom: pin ? 15 : 5,
    markerLabel: graphName,
    onPick: (lat, lon) => setPin(lat, lon, false),
  });
  right.appendChild(map.el);
  right.appendChild(el("p", "insp-hint", t("site.clickMap")));
  const nums = el("div", "sitepick-nums");
  const coord = (label: string, field: string): HTMLInputElement => {
    const l = el("label");
    l.appendChild(el("span", undefined, label));
    const i = document.createElement("input");
    i.className = "insp-name-input";
    i.inputMode = "decimal";
    i.dataset.field = field;
    l.appendChild(i);
    nums.appendChild(l);
    return i;
  };
  const latIn = coord("Lat", "lat");
  const lonIn = coord("Lon", "lon");
  right.appendChild(nums);
  right.appendChild(el("p", "insp-hint", "WGS84 · EPSG:4326"));

  // ── left: search a place, or take it from the 3D ───────────────────────────
  const q = document.createElement("input");
  q.type = "search";
  q.className = "insp-name-input";
  q.dataset.field = "place";
  q.placeholder = t("site.searchHint");
  const ql = el("label", "sitepick-q");
  ql.appendChild(el("span", undefined, t("site.search")));
  ql.appendChild(q);
  left.appendChild(ql);
  const hits = el("div", "sitepick-hits");
  left.appendChild(hits);
  left.appendChild(el("div", "sitepick-eyebrow", t("site.from3d")));
  const from3d = button("insp-btn sitepick-3d", t("site.from3dAct"), "from3d");
  left.appendChild(from3d);
  const note3d = el("p", "insp-hint", t("site.from3dNote"));
  left.appendChild(note3d);

  // ── foot ───────────────────────────────────────────────────────────────────
  const foot = el("div", "modal-foot");
  if (cur) {
    const clear = button("insp-btn", t("site.clear"), "clear");
    clear.addEventListener("click", () => { store.clearSitePosition(); closeSitePicker(); onWritten?.(); });
    foot.appendChild(clear);
  }
  foot.appendChild(el("span", "sitepick-grow"));
  const cancel = button("insp-btn", t("site.cancel"), "cancel");
  const ok = button("insp-btn primary", t("site.use"), "use");
  foot.append(cancel, ok);
  card.appendChild(foot);

  function setPin(lat: number, lon: number, fly: boolean): void {
    pin = { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
    latIn.value = String(pin.lat);
    lonIn.value = String(pin.lon);
    map.setMarker(pin.lat, pin.lon);
    if (fly) map.setView(pin.lat, pin.lon, 15);
    ok.disabled = false;
  }
  if (pin) { latIn.value = String(pin.lat); lonIn.value = String(pin.lon); }
  ok.disabled = !pin;

  const typed = (): void => {
    const la = Number(latIn.value.trim());
    const lo = Number(lonIn.value.trim());
    // BOTH numbers, or nothing: `Number("")` is 0, and a latitude typed first
    // used to put a site on the Greenwich meridian (COLLEGARE, measured)
    if (latIn.value.trim() === "" || lonIn.value.trim() === "") return;
    if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180)
      setPin(la, lo, true);
  };
  latIn.addEventListener("change", typed);
  lonIn.addEventListener("change", typed);

  let timer = 0;
  let inflight: AbortController | null = null;
  const say = (msg: string): void => {
    hits.textContent = "";
    hits.appendChild(el("p", "insp-hint", msg));
  };
  const run = async (text: string): Promise<void> => {
    inflight?.abort();
    const ctrl = new AbortController();
    inflight = ctrl;
    say(t("site.searching"));
    try {
      const found = await geocode(text, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      hits.textContent = "";
      if (!found.length) { say(t("site.noPlace", { q: text })); return; }
      for (const h of found) {
        const b = button("sitepick-hit", "");
        b.appendChild(el("b", undefined, h.label));
        b.appendChild(el("span", "insp-hint", ` ${h.lat.toFixed(4)}, ${h.lon.toFixed(4)}`));
        b.addEventListener("click", () => {
          setPin(h.lat, h.lon, false);
          map.setView(h.lat, h.lon, zoomFor(h));
        });
        hits.appendChild(b);
      }
      hits.appendChild(el("p", "insp-hint", "© OpenStreetMap · Nominatim"));
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      say(e instanceof GeocodeOffline ? t("site.offline")
        : t("site.searchFailed", { why: (e as Error)?.message ?? "?" }));
    }
  };
  // debounced: a request per keystroke is useless and breaches the service's
  // usage policy (the rate gate in geocode.ts is the backstop)
  q.addEventListener("input", () => {
    window.clearTimeout(timer);
    inflight?.abort();
    const text = q.value.trim();
    if (text.length < 2) { hits.textContent = ""; return; }
    timer = window.setTimeout(() => void run(text), 500);
  });
  q.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    window.clearTimeout(timer);
    if (q.value.trim().length >= 2) void run(q.value.trim());
  });

  from3d.addEventListener("click", () => {
    from3d.disabled = true;
    void georeferenceScene(JSON.parse(store.toJSON())).then((placed) => {
      from3d.disabled = false;
      if (!placed) { note3d.textContent = t("site.no3d"); return; }
      if ("error" in placed) { note3d.textContent = t("site.3dError", { why: placed.error }); return; }
      setPin(placed.centroid[1], placed.centroid[0], true);
      note3d.textContent = t("site.from3dNote");
    });
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && open === modal) { e.stopPropagation(); closeSitePicker(); }
  };
  x.addEventListener("click", closeSitePicker);
  cancel.addEventListener("click", closeSitePicker);
  ok.addEventListener("click", () => {
    if (!pin) return;
    store.setSitePosition(pin.lon, pin.lat);
    closeSitePicker();
    onWritten?.();
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) closeSitePicker(); });
  document.addEventListener("keydown", onKey, true);
  unhook = () => document.removeEventListener("keydown", onKey, true);
  document.body.appendChild(modal);
  map.activate();
  q.focus();
}

/**
 * The position, SHOWN, with the one button — what the Study, the story and the
 * map embed carry, and the head of the graph node's inspector section.
 * `onSet` opens the selector on the graph node (the caller knows how to get
 * there).
 */
export function renderSitePositionLine(host: HTMLElement, store: DocumentStore,
                                       onSet: () => void): void {
  const sp = store.readSitePosition();
  const row = el("div", "site-line");
  row.dataset.site = sp ? `${sp.lat},${sp.lon}` : "";
  row.appendChild(el("span", "site-line-v",
    sp ? `${sp.lat.toFixed(5)}, ${sp.lon.toFixed(5)} (${sp.crs})` : t("site.notPlaced")));
  const b = button("insp-btn site-set", t("site.set"), "site-set");
  b.addEventListener("click", (e) => { e.stopPropagation(); onSet(); });
  row.appendChild(b);
  host.appendChild(row);
}
