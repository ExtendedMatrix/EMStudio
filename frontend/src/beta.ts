/**
 * MICRO-COR11 (20 Nov 2026) · «beta»: the mark of a young function.
 *
 * What left «Funzioni sperimentali» is there for everyone; where the function
 * is young it says so with this mark (its tooltip: it works, it may change).
 * One look everywhere (`.beta-mark`, style.css), one word (`ui.beta`).
 */
import { t } from "./i18n";

export function betaMark(doc: Document = document): HTMLElement {
  const s = doc.createElement("span");
  s.className = "beta-mark";
  s.dataset.beta = "1";
  s.textContent = t("ui.beta");
  s.title = t("ui.betaTip");
  return s;
}
