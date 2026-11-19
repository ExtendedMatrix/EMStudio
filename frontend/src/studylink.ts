/**
 * WHERE A STUDY IS, out of a URL — read by BOTH pages.
 *
 * The Catalog's «open in…» hands out an address, and two EMStudio pages have to
 * understand it: the READER (`/em/read/`, where somebody handed a link reads a
 * study) and the EDITOR (`/em/studio/`, where somebody works on one). Two doors,
 * two verbs, and until this file existed only one of them could read the link —
 * the editor answered «Drop an .em.json file here» over a perfectly good
 * `?emjson=`, which is a button that worked and a door that did not.
 *
 * **One implementation, not two.** It lived inside `reader.ts::documentUrl()`,
 * and copying it into `main.ts` would have created two grammars for one query
 * string. They would not have diverged on day one; they would have diverged the
 * first time somebody added a parameter to the page they were working on.
 *
 * The forms, in precedence order — the Catalog's own two, and nothing invented
 * here:
 *
 *     ?emjson=<url>              the container itself (what `/open` hands out)
 *     ?study=<id>&catalog=<base> a study id against a catalogue
 *     ?study=<id>                …resolved against THIS origin, which is right
 *                                whenever the page is served by the node that
 *                                also runs the Catalog — the arrangement
 *                                `/em/studio/` exists to create
 *     ?narrative=<id>            which narrative, when a study holds several
 *     ?token=<jwt>               for a restricted study, used and not kept
 *
 * **Relative is allowed and is the good case.** `?emjson=/catalog/study/…` names
 * the container on the origin the page came from, which cannot be wrong: the
 * fetch resolves it against `location`. The Catalog already writes that form for
 * its own reading page, after a mixed-content failure measured in Chrome (an
 * https page told to fetch `http://localhost:8010/…`). Nothing here needs to
 * turn it into an absolute URL, and doing so would reintroduce exactly that bug.
 */

/** What a link says about which study to open, and how to reach it. */
export interface StudyLink {
  /** the container's URL — absolute or root-relative, as it was given */
  url: string;
  /** the study id, when the link named one (for a title before the fetch) */
  study: string | null;
  /** which narrative to open, when the study holds several */
  narrative: string | null;
  /** a bearer token for a restricted study. USED, never stored. */
  token: string | null;
}

/**
 * Read a study link off a query string, or `null` when there is not one.
 *
 * Deliberately total: a page can call this at boot and act on `null` by doing
 * nothing, which is what makes it safe to run on every load of the editor.
 */
export function readStudyLink(search?: string): StudyLink | null {
  const params = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""));
  // `studyDocumentUrl` may THROW (a link naming two studies). Deliberately not
  // caught here: the caller has a canvas to say it on, and swallowing it would
  // put back the silence this whole repair is about.
  const url = studyDocumentUrl(params);
  if (!url) return null;
  return {
    url,
    study: params.get("study") || null,
    narrative: params.get("narrative") || null,
    token: params.get("token") || null,
  };
}

/**
 * The container's address, from the two forms the Catalog documents.
 *
 * `?emjson=` wins because it is what `/open` hands out and it needs no
 * assumption; `?study=` is the friendlier spelling of the same thing and is
 * resolved against `?catalog=` — or, with no catalogue named, against the origin
 * this page came from. That last case is not a guess: it is the arrangement
 * where the node serves both the editor and the Catalog, which is why
 * `/em/studio/` is a route at all.
 */
export function studyDocumentUrl(params: URLSearchParams): string | null {
  const direct = params.get("emjson");
  const study = params.get("study");
  if (direct) {
    // AMBIGUITY IS REFUSED, NOT PREFERRED — and this is the bug of 5 September,
    // reproduced byte for byte before it was repaired.
    //
    // `?emjson=` used to win in silence. So a link whose two halves named
    // DIFFERENT studies loaded one of them and labelled it with the other: the
    // status bar said «Villa di Aiano» over a page opened as Porta Marina, the
    // address bar was cleaned (the success branch had run), and there was no
    // toast and no log line. A failure shaped exactly like a success — and the
    // way you get such a URL is ordinary: you edit `study=` in the address bar
    // and leave `emjson=` pointing where it pointed.
    //
    // The rule is the one `handoff.ts` already applies to a link naming both a
    // room and a study, written three hours earlier in this same tree and not
    // carried across: guessing would make the guess the contract.
    const named = studyIdInContainerUrl(direct);
    if (study && named && named !== study) {
      throw new StudyLinkError(
        `this link names two different studies: \`study=${study}\` and an `
        + `\`emjson=\` that points at ${named}. Refused rather than guessed — `
        + "one of the two would have opened under the other's name. Drop the "
        + "`emjson=` to open " + study + ", or drop `study=` to open " + named
        + ".");
    }
    return direct;
  }
  if (!study) return null;
  const catalog = (params.get("catalog") ?? "").replace(/\/+$/, "");
  return `${catalog}/catalog/study/${encodeURIComponent(study)}/emjson`;
}

/** A link that could not be read, said rather than half-followed. */
export class StudyLinkError extends Error {}

/**
 * The study id a container URL names, when it names one.
 *
 * Only the Catalog's own shape (`…/catalog/study/<id>/emjson`) is recognised, and
 * that narrowness is the point: an `?emjson=` may legitimately be any URL at all
 * — an object-store link, a presigned one, a file on a share — and none of those
 * mentions a study id. Refusing those would break the form the contract exists
 * for. So a disagreement is only reported when it can be SEEN, which is when
 * both halves speak the same language and say different things.
 */
export function studyIdInContainerUrl(url: string): string | null {
  const match = /\/catalog\/study\/([^/]+)\/emjson\/?$/.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Where a file came from when it was opened from a Catalog (MICRO-COR04 E6):
 *  the container's ABSOLUTE address and the study id it names. Kept on the open
 *  file, because the address bar is cleaned right after the opening and the
 *  desktop never had one to read. */
export interface PublishedOrigin {
  url: string;
  study: string | null;
}

/** The origin to keep for a link just opened, `page` being the address the
 *  relative forms are resolved against (`location.href`). */
export function publishedOrigin(link: { url: string; study: string | null }, page: string): PublishedOrigin {
  const url = new URL(link.url, page).href;
  return { url, study: link.study ?? studyIdInContainerUrl(url) };
}

/**
 * The LIVE READER's address for a narrative of a published study — the same on
 * the web and on the desktop (MICRO-COR04 E6).
 *
 * It used to be built from the page's own `location.search`, which is empty on
 * the desktop (`tauri://…`) and is cleaned on the web right after the opening:
 * the link «in practice never came». Now it is built from where the study came
 * from. A Catalog study (`<catalog>/catalog/study/<id>/emjson`) is read at its
 * node's `/em/read/`, the dissemination page on the same origin as the Catalog
 * (Caddy: `/em/read/*` beside `/catalog/*`), with `?study=` — and `?catalog=`
 * only when the Catalog is not at the origin's root, so the reader resolves it
 * exactly as the Catalog's own links do. Any other container is read by the
 * page's own reader (`reader.html` beside the editor) when the page is a web
 * page; on the desktop that page is nobody's address, so: `null`.
 */
export function readerLink(origin: PublishedOrigin, narrative: string, page: string): string | null {
  const container = new URL(origin.url);
  const at = container.pathname.search(/\/catalog\/study\/[^/]+\/emjson\/?$/);
  const study = origin.study ?? studyIdInContainerUrl(origin.url);
  if (at >= 0 && study) {
    const q = new URLSearchParams();
    q.set("study", study);
    const base = container.pathname.slice(0, at);
    if (base) q.set("catalog", `${container.origin}${base}`);
    q.set("narrative", narrative);
    return `${container.origin}/em/read/?${q}`;
  }
  const here = new URL(page);
  if (here.protocol !== "http:" && here.protocol !== "https:") return null;
  const q = new URLSearchParams();
  q.set("emjson", container.origin === here.origin ? container.pathname + container.search : container.href);
  q.set("narrative", narrative);
  return new URL(`reader.html?${q}`, page).href;
}

/** Take the study parameters off the address bar once they have been read.
 *
 *  Same reasoning as the handoff's own cleaner: none of this is secret except
 *  the token, and a URL that still says `?emjson=` reloads the study over
 *  whatever the person has been doing since. The TOKEN is the one that must go
 *  whatever happens — a credential in an address bar outlives the tab it was
 *  useful in, gets copied into a chat, and ends up in a screenshot. */
export function clearStudyLinkFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of ["emjson", "study", "catalog", "narrative", "token"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", url.toString());
}
