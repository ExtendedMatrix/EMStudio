// «Funzioni sperimentali» in the browser checks (src/experimental.ts).
//
//   EMSTUDIO_EXPERIMENTAL=1 node scripts/check-….mjs
//
// turns the switch on in every page of the check's browser: before the page's
// own scripts run, `window.__EM_EXPERIMENTAL__` is set (a check that clears
// localStorage keeps it) and the stored key with it. Without the variable the
// browser is left alone: the switch is off, as for everyone.
export const EXPERIMENTAL_ON = process.env.EMSTUDIO_EXPERIMENTAL === "1";

const turnOn = () => {
  try { window.__EM_EXPERIMENTAL__ = true; } catch { /* no window */ }
  try { localStorage.setItem("emstudio.experimental", "1"); } catch { /* storage refused */ }
};

/** every context (and page) this browser makes starts with the switch on */
export function withExperimental(browser, on = EXPERIMENTAL_ON) {
  if (!on) return browser;
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => {
    const ctx = await newContext(...a);
    await ctx.addInitScript(turnOn);
    return ctx;
  };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const p = await newPage(...a);
    await p.addInitScript(turnOn);
    return p;
  };
  return browser;
}
