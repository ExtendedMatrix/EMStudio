/**
 * MICRO-BK1 · WHAT A DEPOSIT INTO A ROOM'S BUCKET SAYS ABOUT ITSELF — the
 * minimal fields of a DTC, in one place.
 *
 * E.D., 27 Nov 2026: «la DTC è il sistema di caricamento». Whoever loads bytes
 * into the bucket gives the values a DTC typically holds: WHO, WHEN, FROM WHICH
 * SOURCE, WHICH TRANSFORMATION, LICENCE / EMBARGO, and WHERE IT GOES (room,
 * project, document). Other formalisms are admitted; the DTC is the recommended
 * one because it is ready.
 *
 * Until stratigraph-server 1.6.0-dev.93 no route took these fields with the
 * bytes: a deposit was `PUT /v1/rooms/{room}/asset` (the bytes, nothing else), then the
 * stamp as an object of its own (dtcstamp, via the bridge's `/stamp/emit`), then
 * the acts on the resident register (`POST /v1/corpus/append`: resource,
 * attribution, acquisition). This module is the CLEAN INTERFACE in between:
 *
 *  · {@link BucketDtc} — the record the panel asks for, one per delivery;
 *  · {@link dtcProblem} — the one rule saying when it is complete enough;
 *  · {@link ingestionOptions} / {@link registerAcquisition} — how it is written
 *    through the older routes (the fallback, and the stamp);
 *  · {@link bucketRequest} — the body of the bucket's own door
 *    (`POST /v1/rooms/{room}/objects`, profile {@link BUCKET_DTC_PROFILE}),
 *    which stratigraph-server has since 1.6.0-dev.93 (MICRO-BK2): EMStudio sends
 *    this, as the `dtc` part, and the server writes the three acts itself
 *    (`bucket-door.ts`). The routes above remain the fallback for a node
 *    without the door.
 *
 * What this module never does: invent a kind (the vocabulary is the datamodel's,
 * `dtc_kinds.acquisition`), name the depositor (the server takes it from the
 * token), or preselect a licence.
 */

import { dtcKindFamily, dtcKindsFor } from "./rules";

/** The profile name of the request body, versioned: a server that one day
 *  accepts `em-bucket-dtc/2` can still read `/1`. */
export const BUCKET_DTC_PROFILE = "em-bucket-dtc/1";

/** The default kind of act: `ingest`, «entered here, and nobody said from
 *  where». Not an assertion about the bytes — it is the truthful default, the
 *  one the ingestion record has always used (`stamp-ingest.ts`). */
export const DEFAULT_SOURCE_KIND = "ingest";

/** Formalisms a request may carry. `dtc` is the recommended one (it is ready:
 *  dtcstamp + s3Dgraphy); the others travel as an opaque statement beside the
 *  minimal fields, which stay mandatory whatever the formalism. */
export const FORMALISMS = ["dtc", "prov-o", "other"] as const;
export type Formalism = typeof FORMALISMS[number];

export interface BucketDtc {
  formalism: Formalism;
  /** WHO. The depositor is NOT here: it comes from the token, always.
   *  `responsible` (MICRO-BK2) is who answers for publishing when it is not the
   *  depositor: an ORCID iD the node has accredited, or absent (the depositor
   *  answers). */
  who: { author?: string; authorOrcid?: string; responsible?: string };
  /** WHEN the content was made (a date, `YYYY-MM-DD`). The deposit's instant is
   *  not a field: it is the moment the bytes land. */
  when: { madeAt?: string };
  /** FROM WHICH SOURCE — the kind of act that brought the bytes into being or in
   *  here (`dtc_kinds.acquisition`: a capture or a retrieval), and its facts. */
  source: {
    kind: string;
    /** a URL or a DOI the bytes were retrieved from (a download) */
    retrievedFrom?: string;
    /** a free sentence: the archive, the box, the colleague's disk */
    note?: string;
    /** the campaign that captured them — only for a capture */
    campaign?: string;
  };
  /** WHICH TRANSFORMATION — said only for a capture (a retrieval did not make the
   *  bytes, so a technique there would be a false claim). A step with inputs is
   *  a DERIVATION, declared in its own section of the panel. */
  transformation: { technique?: string; software?: string };
  /** LICENCE / EMBARGO */
  rights: { license: string; embargoUntil?: string; embargoReason?: string };
  /** WHERE IT GOES */
  target: {
    room: string;
    graphId?: string;
    documentId?: string;
    lotId?: string;
    lotName?: string;
  };
}

/** The kinds offered in the form: the `acquisition` axis of the vocabulary,
 *  with its family. Never a hand-written list. */
export function sourceKinds(): Array<{ kind: string; label: string; family: string }> {
  return dtcKindsFor("acquisition").map((k) => ({
    ...k, family: dtcKindFamily(k.kind) ?? "",
  }));
}

/** A capture («born here»: photo, laser scan, survey…) — the only kind of act
 *  for which a technique, a software and a campaign are statements about how the
 *  bytes were made. */
export function isCapture(kind: string): boolean {
  return dtcKindFamily(kind) === "capture";
}

/** A URL or a DOI: what `retrieved_from` may hold. */
export function isUriOrDoi(value: string): boolean {
  const v = value.trim();
  return /^https?:\/\/\S+$/i.test(v) || /^(doi:)?10\.\d{4,9}\/\S+$/i.test(v);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Why this record cannot be written yet — an i18n key, or null when it can.
 * The licence's own refusal stays where it was (`assets.needsLicense`): this
 * adds the rules about the act.
 */
export function dtcProblem(dtc: BucketDtc): string | null {
  if (!dtc.rights.license.trim()) return "assets.needsLicense";
  const kinds = sourceKinds().map((k) => k.kind);
  if (!kinds.includes(dtc.source.kind)) return "bucket.kindUnknown";
  if (dtc.when.madeAt && !DATE.test(dtc.when.madeAt)) return "bucket.dateBad";
  // a capture IS the act that made the bytes: its date must be said, because the
  // act's date is not now() by default (the bridge refuses an act without `at`,
  // and «now» would be the deposit, not the photograph)
  if (isCapture(dtc.source.kind) && !dtc.when.madeAt) return "bucket.captureNeedsDate";
  if (dtc.source.kind === "download") {
    if (!dtc.source.retrievedFrom?.trim()) return "bucket.downloadNeedsSource";
  }
  if (dtc.source.retrievedFrom?.trim() && !isUriOrDoi(dtc.source.retrievedFrom)) {
    return "bucket.sourceNotUri";
  }
  if (dtc.rights.embargoUntil && !DATE.test(dtc.rights.embargoUntil)) return "bucket.dateBad";
  return null;
}

/** The facts of the act that are not claims about how the bytes were made:
 *  they go in the acquisition's metadata, which is where the stamp's
 *  `how.acquisition` block reads them (`_acquisition_block`). */
function actFacts(dtc: BucketDtc): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  const from = dtc.source.retrievedFrom?.trim();
  if (from) facts.retrieved_from = from;
  const note = dtc.source.note?.trim();
  if (note) facts.source_note = note;
  // the date the content was made, for a retrieval: a fact of the content, not
  // the date of THIS act (which is the deposit)
  if (dtc.when.madeAt && !isCapture(dtc.source.kind)) facts.content_date = dtc.when.madeAt;
  if (isCapture(dtc.source.kind) && dtc.source.campaign?.trim()) {
    facts.campaign = dtc.source.campaign.trim();
  }
  if (dtc.target.documentId) facts.documents = dtc.target.documentId;
  return facts;
}

/** What `ingestionAct` needs on top of the files: the kind, the act's date, the
 *  facts, the technique / software of a capture, and the declared rights. */
export interface IngestionOptions {
  kind: string;
  /** the act's instant: the capture's date for a capture, else the deposit */
  at?: string;
  facts: Record<string, unknown>;
  technique?: string;
  software?: Array<{ name: string; version?: string }>;
  declared?: { license?: string; embargo?: string; reason?: string;
               author?: string; author_name?: string };
}

/** «Name 1.2» → `{name, version}`; a bare name stays a name. */
export function softwareOf(text: string | undefined): Array<{ name: string; version?: string }> {
  const s = (text ?? "").trim();
  if (!s) return [];
  const m = /^(.*?)[\s]+v?(\d[\w.\-+]*)$/.exec(s);
  return m ? [{ name: m[1].trim(), version: m[2] }] : [{ name: s }];
}

export function ingestionOptions(dtc: BucketDtc): IngestionOptions {
  const capture = isCapture(dtc.source.kind);
  const declared: IngestionOptions["declared"] = {};
  if (dtc.rights.license.trim()) declared.license = dtc.rights.license.trim();
  if (dtc.rights.embargoUntil) declared.embargo = dtc.rights.embargoUntil;
  if (dtc.rights.embargoUntil && dtc.rights.embargoReason?.trim()) {
    declared.reason = dtc.rights.embargoReason.trim();
  }
  const author = dtc.who.authorOrcid?.trim() || dtc.who.author?.trim();
  if (author) declared.author = author;
  if (dtc.who.author?.trim()) declared.author_name = dtc.who.author.trim();
  return {
    kind: dtc.source.kind,
    ...(capture && dtc.when.madeAt ? { at: `${dtc.when.madeAt}T00:00:00Z` } : {}),
    facts: actFacts(dtc),
    ...(capture && dtc.transformation.technique?.trim()
      ? { technique: dtc.transformation.technique.trim() } : {}),
    ...(capture && softwareOf(dtc.transformation.software).length
      ? { software: softwareOf(dtc.transformation.software) } : {}),
    ...(Object.keys(declared).length ? { declared } : {}),
  };
}

/** The `acquisition` act of the resident register (`POST /v1/corpus/append`),
 *  which already takes `dtc_kind` and `metadata` (stratigraph-server
 *  `CorpusAct`). The lot id is the delivery's own, so a series is one event. */
export function registerAcquisition(
  dtc: BucketDtc, digest: string, at: string,
): Record<string, unknown> {
  return {
    acquisition_id: dtc.target.lotId || undefined,
    resources: [digest],
    name: dtc.target.lotName || undefined,
    dtc_kind: dtc.source.kind,
    metadata: { ingested_at: at, source: "EMStudio", ...actFacts(dtc) },
  };
}

/** One file, as the bucket sees it. */
export interface BucketObject {
  sha256?: string;
  name: string;
  mediaType: string;
  sizeBytes?: number;
}

/**
 * THE BODY OF THE BUCKET'S DOOR — `POST /v1/rooms/{room}/objects`
 * (profile {@link BUCKET_DTC_PROFILE}): the minimal fields of a DTC, named the
 * same way for every tool of the ecosystem, with the depositor left to the token.
 *
 * Built here so the panel can SHOW what it is about to write (the preview), and
 * the preview is the call: `publishQueue` sends this object and nothing else. Keys are
 * snake_case, as the register's acts are.
 */
export function bucketRequest(dtc: BucketDtc, object: BucketObject): Record<string, unknown> {
  const capture = isCapture(dtc.source.kind);
  const drop = (o: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));
  return {
    profile: BUCKET_DTC_PROFILE,
    formalism: dtc.formalism,
    object: drop({
      sha256: object.sha256, name: object.name,
      media_type: object.mediaType, size_bytes: object.sizeBytes,
    }),
    who: drop({ author: dtc.who.author?.trim(), author_orcid: dtc.who.authorOrcid?.trim(),
                responsible: dtc.who.responsible?.trim() }),
    when: drop({ made_at: dtc.when.madeAt }),
    source: drop({
      dtc_kind: dtc.source.kind,
      family: dtcKindFamily(dtc.source.kind),
      retrieved_from: dtc.source.retrievedFrom?.trim(),
      note: dtc.source.note?.trim(),
      campaign: capture ? dtc.source.campaign?.trim() : undefined,
    }),
    transformation: capture ? drop({
      technique: dtc.transformation.technique?.trim(),
      software: dtc.transformation.software?.trim(),
    }) : {},
    rights: drop({
      license: dtc.rights.license.trim(),
      embargo_until: dtc.rights.embargoUntil,
      embargo_reason: dtc.rights.embargoUntil ? dtc.rights.embargoReason?.trim() : undefined,
    }),
    target: drop({
      room: dtc.target.room, graph_id: dtc.target.graphId,
      document_id: dtc.target.documentId,
      lot_id: dtc.target.lotId, lot_name: dtc.target.lotName,
    }),
  };
}

/**
 * MICRO-BK2 · WHAT A LOT DECLARES, as one string: the record without the file
 * and without the lot's own id. Two deliveries with the same signature are the
 * same act and share a lot; a different kind, source, date, responsible, licence
 * or document is a different act, and must not join the first one's lot.
 *
 * Measured on the dev node: a survey and then a download dropped in the same
 * panel went into ONE acquisition (the lot id lived as long as the panel), and
 * the register merged their facts — the survey's lot came out with the
 * download's responsible. The lot id is now minted again when this changes.
 */
export function lotSignature(dtc: BucketDtc): string {
  const request = bucketRequest(
    { ...dtc, target: { ...dtc.target, lotId: undefined } },
    { name: "", mediaType: "" });
  delete request.object;
  return JSON.stringify(request);
}
