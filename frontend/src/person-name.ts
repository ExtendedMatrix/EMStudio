// MICRO-K §B5 (E.D., 17 Nov 2026) · a person's name composed from `name` and
// `surname`, never the surname twice: TempluMare v10's author carries
// `name: "Emanuel Demetrescu"` and `surname: "Demetrescu"`, and «name surname»
// read «Emanuel Demetrescu Demetrescu». The data are not touched. The twin of
// s3Dgraphy's `person_name.compose_name`.

const SENTINELS = new Set(["noname", "nosurname"]);
const clean = (v: unknown): string => { const s = String(v ?? "").trim(); return SENTINELS.has(s) ? "" : s; };
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contains = (name: string, surname: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}_])${escape(surname.toLowerCase())}(?![\\p{L}\\p{N}_])`, "u").test(name.toLowerCase());

/** «Name Surname», never the surname twice; one of the two when the other is missing. */
export function composeName(name: unknown, surname: unknown): string {
  const n = clean(name), s = clean(surname);
  if (n && s) return contains(n, s) ? n : `${n} ${s}`;
  return n || s;
}
