#!/usr/bin/env python3
"""Provider-neutral seam for calling a language model, for em-bridge (N5).

**Why this lives here and not in s3Dgraphy.** s3Dgraphy is pure: no web
framework, no network, no optional heavy SDKs. That is what makes it embeddable
in Blender, in a notebook and in this bridge without dragging anything along.
A model call is network, so it lives in the bridge — which is already the local
access layer and already bundles s3Dgraphy.

**Provider-neutral.** :class:`LLMProvider` is the whole contract: one method.
Claude is the first adapter, not the interface — adding OpenAI, a local
llama.cpp, or a stub for tests means registering another adapter, never editing
a caller.

**The key.** Read from the environment at call time, never persisted, never
logged, never returned in a response, and never sent to the frontend. If it is
missing the provider says so with a clear error instead of failing somewhere
deeper.

**What is sent.** Only the briefing built by
``s3dgraphy.api.build_narrative_generation_context`` — one activity, its units,
their epochs and the evidence already recorded for them. Not the whole graph,
not the file, not the user's paths. Documented in :func:`describe_payload`.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional

DEFAULT_TIMEOUT = 120


class LLMError(RuntimeError):
    """The provider could not produce a completion. Carries an HTTP-ish status
    so the bridge can answer 501 (not configured) apart from 502 (upstream
    failed) — the two mean very different things to whoever pressed the button.
    """

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class LLMProvider:
    """One call: turn a system instruction, a prompt and a context into text.

    Implementations must not mutate the context, must not log the key, and must
    raise :class:`LLMError` rather than leaking a transport exception.
    """

    #: shown in responses and logs so a reader knows what wrote a draft
    name = "abstract"
    model = ""

    def generate(self, system: str, prompt: str,
                 context: Dict[str, Any]) -> str:
        raise NotImplementedError


# ── registry ──────────────────────────────────────────────────────────────────

_PROVIDERS: Dict[str, Callable[..., LLMProvider]] = {}


def register_provider(name: str):
    def _wrap(factory: Callable[..., LLMProvider]):
        _PROVIDERS[name] = factory
        return factory
    return _wrap


def available_providers() -> List[str]:
    return sorted(_PROVIDERS)


def get_provider(name: Optional[str] = None, **opts) -> LLMProvider:
    """Build the requested provider, or the one the environment selects.

    Selection order: the explicit argument, then ``EM_LLM_PROVIDER``, then
    ``claude``. Nothing is hard-wired at a call site.
    """
    key = (name or os.environ.get("EM_LLM_PROVIDER") or "claude").strip()
    factory = _PROVIDERS.get(key)
    if factory is None:
        raise LLMError(
            f"unknown LLM provider '{key}'; available: "
            f"{', '.join(available_providers()) or 'none'}", status=400)
    return factory(**opts)


# ── where the key comes from ──────────────────────────────────────────────────
#
# Two sources, and they exist because the two ways of running EMStudio have
# different places to keep a secret:
#
#   * **desktop** — the OS keychain, injected into this process's environment
#     when the Tauri shell spawns it. Persistent, and this process only ever
#     sees it as `$ANTHROPIC_API_KEY`.
#   * **browser dev** — no keychain to write to, so the user pastes the key and
#     it lives HERE, in a module variable, for as long as this process does.
#     Nothing writes it to disk, to a log, or back down the wire.
#
# The session key wins when both are set: it is the one the user just typed, so
# it is the one they meant. Neither is ever readable from outside — there is no
# endpoint that returns a key, only one that says whether there is one.

_SESSION_KEY: str = ""


def set_session_key(key: str) -> None:
    """Hold a key in memory for this process's lifetime. Not persisted."""
    global _SESSION_KEY
    _SESSION_KEY = (key or "").strip()


def clear_session_key() -> None:
    global _SESSION_KEY
    _SESSION_KEY = ""


def api_key_source() -> str:
    """`session` | `env` | `none` — never the key."""
    if _SESSION_KEY:
        return "session"
    if os.environ.get("ANTHROPIC_API_KEY", "").strip():
        return "env"
    return "none"


def resolve_api_key() -> str:
    """The key to use, session first. Returns "" when there is none.

    Read at CALL time, not at construction: in dev the user can paste a key
    into a bridge that is already running, and a provider built a moment
    earlier must still see it.
    """
    return _SESSION_KEY or os.environ.get("ANTHROPIC_API_KEY", "").strip()


# ── Claude (Anthropic) — the first adapter ────────────────────────────────────

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
#: The default is a **Sonnet**, not an Opus (E.D., 2026-08-02). The task is
#: rule-simple — the template supplies the structure, the model supplies the
#: prose, and a named human is the final gate before anything counts as
#: endorsed. Paying Opus rates for a draft somebody must read anyway is not a
#: quality decision, it is a habit. Opus stays selectable per request via
#: `EM_LLM_MODEL` or the `model` argument, and this is the ONLY place the name
#: is written.
DEFAULT_CLAUDE_MODEL = "claude-sonnet-5"


@register_provider("claude")
class ClaudeProvider(LLMProvider):
    """Anthropic Messages API over plain urllib.

    No SDK on purpose: one POST with a JSON body does not justify a dependency
    in a bridge that has to stay installable next to Blender's Python.
    """

    name = "claude"

    def __init__(self, model: Optional[str] = None,
                 max_tokens: int = 1200, timeout: int = DEFAULT_TIMEOUT,
                 api_key: Optional[str] = None):
        self.model = model or os.environ.get("EM_LLM_MODEL",
                                             DEFAULT_CLAUDE_MODEL)
        self.max_tokens = max_tokens
        self.timeout = timeout
        # An explicit key wins; otherwise resolved at call time, so a key
        # pasted after this provider was built is still picked up.
        self._api_key = api_key or ""

    def generate(self, system: str, prompt: str,
                 context: Dict[str, Any]) -> str:
        api_key = self._api_key or resolve_api_key()
        if not api_key:
            raise LLMError(
                "no API key: paste one in EMStudio's Settings (AI provider), "
                "or export ANTHROPIC_API_KEY before starting em-bridge. "
                "It is read at call time and never written to disk.",
                status=501)
        body = json.dumps({
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": system,
            "messages": [{
                "role": "user",
                "content": f"{prompt}\n\n<context>\n"
                           f"{json.dumps(context, ensure_ascii=False, indent=2)}"
                           f"\n</context>",
            }],
        }).encode("utf-8")
        request = urllib.request.Request(
            ANTHROPIC_URL, data=body, method="POST",
            headers={
                "content-type": "application/json",
                "anthropic-version": ANTHROPIC_VERSION,
                "x-api-key": api_key,
            })
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8")[:400]
            except Exception:  # pragma: no cover - defensive
                pass
            # The key never appears in this message: only the status and the
            # provider's own text, which does not echo credentials.
            raise LLMError(f"Anthropic returned {exc.code}: {detail}",
                           status=502) from None
        except urllib.error.URLError as exc:
            raise LLMError(f"could not reach Anthropic: {exc.reason}",
                           status=502) from None

        parts = [c.get("text", "") for c in payload.get("content", [])
                 if c.get("type") == "text"]
        text = "".join(parts).strip()
        if not text:
            raise LLMError("the model returned no text", status=502)
        return text


@register_provider("echo")
class EchoProvider(LLMProvider):
    """A provider that writes a deterministic paragraph from the context.

    Not a mock hidden in the tests: a real, selectable provider
    (``EM_LLM_PROVIDER=echo``) so the whole endpoint — context building, write
    back, attribution, prompt-as-source, unendorsed state — can be exercised
    end to end with no key, no network and no cost. What it writes is obviously
    machine-made, which is the point.
    """

    name = "echo"
    model = "echo-1"

    def __init__(self, **_opts):
        # Accepts and ignores whatever the caller passes (model, max_tokens…).
        # Without this, echo stops being selectable the moment an endpoint sets
        # an option — which is exactly when being able to select it matters.
        pass

    def _echo_reading(self, reading: Dict[str, Any]) -> str:
        """«Proponi con AI» with no model: the first paragraph that names the
        property (else the first with a number), quoted exactly — obviously
        machine-picked, and a real quote, so the whole path can be exercised."""
        text = str(reading.get("text") or "")
        prop = str(reading.get("property") or "").lower()
        paras = [p.strip() for p in text.split("\n") if p.strip()]
        words = [w for w in prop.replace("_", " ").split() if len(w) > 2]
        pick = next((p for p in paras if any(w in p.lower() for w in words)), None)
        pick = pick or next((p for p in paras if any(c.isdigit() for c in p)), None)
        pick = pick or (paras[0] if paras else "")
        value = ""
        for tok in pick.replace(",", ".").split():
            if any(c.isdigit() for c in tok):
                value = tok.strip(".;:")
                break
        return json.dumps({"quote": pick, "value": value, "why": "echo: first matching paragraph"})

    def generate(self, system: str, prompt: str,
                 context: Dict[str, Any]) -> str:
        # Two shapes of task reach this provider, and the context says which:
        # an extraction context carries the table's own schema (`sheets`), a
        # narrative context carries an activity. Returning prose to the
        # extraction endpoint would fail at the JSON parse and make the whole
        # Path-A wiring untestable without a key — the one thing this provider
        # exists to prevent.
        if context.get("sheets"):
            return self._echo_table(context)
        if context.get("reading"):
            return self._echo_reading(context["reading"])
        activity = (context.get("activity") or {}).get("name", "questa attività")
        actions = [a.get("name", "?") for a in context.get("actions") or []]
        epochs = [e.get("name", "?") for e in context.get("epochs") or []]
        bits = [f"[bozza generata] {activity}"]
        if actions:
            bits.append("comprende " + ", ".join(actions))
        if epochs:
            bits.append("collocata in " + ", ".join(epochs))
        return "; ".join(bits) + "."

    @staticmethod
    def _echo_table(context: Dict[str, Any]) -> str:
        """A minimal but VALID table: one unit, one epoch, and a Documents row
        per file the bridge inventoried.

        Obviously machine-made — ``ECHO_U1``, no claims invented from files it
        did not read — so nobody mistakes an echo run for an extraction, while
        still exercising every downstream step: JSON parse, ``write_em_data``,
        the importer, the graph landing in EMStudio.
        """
        documents = [
            {"ID": f"D.{index:02d}", "FILENAME": entry.get("name", ""),
             "TITLE": entry.get("name", "")}
            for index, entry in enumerate(context.get("files") or [], start=1)
        ]
        return json.dumps({
            "Units": [{"ID": "ECHO_U1", "TYPE": "US",
                       "NAME": "echo placeholder unit"}],
            "Epochs": [{"ID": "ECHO_E1", "NAME": "echo epoch",
                        "START": 0, "END": 1}],
            "Claims": [{"TARGET_ID": "ECHO_U1",
                        "PROPERTY_TYPE": "has_first_epoch",
                        "VALUE": "ECHO_E1"}],
            "Authors": [],
            "Documents": documents,
        }, ensure_ascii=False)


# ── the prompt, and what leaves the machine ───────────────────────────────────

SYSTEM_PROMPT = (
    "You are helping an archaeologist draft one chapter of a site narrative "
    "from an Extended Matrix graph. You are given a briefing: an activity, the "
    "stratigraphic units it comprises in the order they occurred, the epochs "
    "they belong to, and the evidence recorded for each. Write the chapter's "
    "opening prose in the language of the briefing. Obey the constraints "
    "given: say only what the briefing supports, keep uncertainty as "
    "uncertainty, and invent nothing. Your text will be marked as an "
    "unendorsed AI draft until a named human validates it."
)


READING_SYSTEM_PROMPT = (
    "You help an archaeologist READ a source. You are given the text of one "
    "document and the property of a stratigraphic unit they want to document. "
    "Find the ONE passage of the text that states it, copy it EXACTLY (it must "
    "be a substring of the text), and give the value it supports. Answer only "
    "with JSON: {\"quote\": \"...\", \"value\": \"...\", \"why\": \"...\"}. "
    "If the text says nothing about it, answer {\"quote\": \"\", \"value\": \"\", "
    "\"why\": \"not in this text\"}. Never invent a quote.")


def build_reading_prompt(reading: Dict[str, Any]) -> str:
    """The user message of «Proponi con AI»: the property, the unit, the text."""
    return (f"Property: {reading.get('property', '')}\n"
            f"Unit: {reading.get('unit', '')}\n"
            f"Question: {reading.get('question') or 'Which passage states it, and what value?'}\n"
            f"--- TEXT ---\n{reading.get('text', '')}")


def parse_reading_reply(text: str, source: str) -> Dict[str, Any]:
    """The model's JSON, CHECKED against the source: a quote that is not in the
    text is refused (an invented citation is worse than none). Returns
    {start, end, quote, value, why}; start = -1 when nothing was found."""
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[-1]
    i, j = raw.find("{"), raw.rfind("}")
    data = json.loads(raw[i:j + 1]) if i >= 0 and j > i else {}
    quote = str(data.get("quote") or "").strip()
    start = source.find(quote) if quote else -1
    if quote and start < 0:
        raise LLMError(502, "the model quoted a passage that is not in the text")
    return {"start": start, "end": start + len(quote) if start >= 0 else -1,
            "quote": quote, "value": str(data.get("value") or ""),
            "why": str(data.get("why") or "")}


def build_prompt(context: Dict[str, Any], extra: str = "") -> str:
    """The user-side prompt. Kept as a function so the exact text can be
    recorded as the prompt-source — a reader must be able to see what was
    asked, not merely that something was asked."""
    activity = (context.get("activity") or {}).get("name", "")
    lines = [f"Write the narrative opening for the activity «{activity}»."]
    constraints = context.get("constraints") or []
    if constraints:
        lines.append("Constraints:")
        lines.extend(f"- {c}" for c in constraints)
    if extra.strip():
        lines.append(f"Additional instruction from the author: {extra.strip()}")
    return "\n".join(lines)


def describe_payload(context: Dict[str, Any]) -> Dict[str, Any]:
    """What is about to be sent, in numbers — so it can be shown to the user
    before it leaves, and recorded after. Privacy is not a promise, it is an
    inventory."""
    return {
        "activity": (context.get("activity") or {}).get("id"),
        "actions": len(context.get("actions") or []),
        "epochs": len(context.get("epochs") or []),
        "sources": len(context.get("sources") or []),
        "includes": ["activity", "actions", "epochs", "evidence", "sources"],
        "excludes": ["the rest of the graph", "file paths", "credentials",
                     "anything outside the named activity"],
    }


# ── which model a task deserves ───────────────────────────────────────────────
#
# Not every call wants the same model, and the difference is not a preference:
#
#   * **narrative prose** — the template supplies the structure, the model
#     supplies sentences, and a named human reads it before it counts as
#     endorsed. A Sonnet is the right tool, and paying more for a draft somebody
#     must read anyway is a habit, not a quality decision. (This is the
#     provider's own default; no entry below.)
#   * **StratiMiner extraction** — reading unstructured excavation sources and
#     canonising them into a typed table is the opposite kind of task: long
#     inputs, a strict schema, and mistakes that are expensive to catch because
#     a plausible wrong row looks exactly like a right one. Here the frontier
#     model earns its cost.
#
#: A task with no entry gets the provider's default. Absence is the statement
#: "the default is correct for this", which is why `narrative` is not listed:
#: naming it here would fork the default into two places.
TASK_MODELS: Dict[str, str] = {
    "stratiminer": "claude-opus-5",
}


def model_for_task(task: str) -> str:
    """The model id for *task*, or ``""`` to mean "the provider's default".

    Precedence: ``EM_LLM_MODEL_<TASK>`` (an operator pinning one task), then the
    table above. Deliberately NOT falling back to the global ``EM_LLM_MODEL``:
    that variable is the provider's own default, and returning it here would
    turn "no task-specific opinion" into an explicit argument, silently
    overriding the per-task default a caller just asked for.
    """
    slug = task.strip().upper().replace("-", "_")
    pinned = os.environ.get(f"EM_LLM_MODEL_{slug}", "").strip()
    if pinned:
        return pinned
    return TASK_MODELS.get(task.strip().lower(), "")


# ── StratiMiner: extraction into the canonical table ──────────────────────────

STRATIMINER_SYSTEM_PROMPT = (
    "You are canonising archaeological source material into the Extended "
    "Matrix intermediate table. You do not build a graph and you do not decide "
    "what the stratigraphy means: you transcribe what the sources say into "
    "typed rows, keeping every claim attached to the document it came from. "
    "Invent nothing — no unit that is not described, no date that is not "
    "written, no author who is not named. When a source is unclear, leave the "
    "cell empty rather than guessing: an empty cell is a question the "
    "archaeologist can answer, a guessed one is an error they cannot see."
)


def build_stratiminer_prompt(spec: str, catalog: Dict[str, Any],
                             extra: str = "") -> str:
    """The user-side prompt for Path A: the bundled StratiMiner spec, plus the
    folder inventory, plus a JSON output contract.

    **Why the output contract is overridden here.** The spec bundled in
    s3Dgraphy (``StratiMiner_Extraction_Prompt.md``) tells the model to *save an
    em_data.xlsx*, which is right for the Cowork path — an agent with a
    filesystem writes the file itself. Over a messages API nothing can hand back
    a binary, so the same domain rules are asked for as JSON rows and em-bridge
    materialises the workbook via ``api.write_em_data``.

    The invariant is untouched by this: the model still produces only the
    **table**, never the graph. What changes is the transport of the table, not
    who is allowed to write what.
    """
    sheets = ", ".join(catalog.get("sheets") or [])
    lines = [
        "Read the sources listed below and produce the Extended Matrix "
        "intermediate table for them.",
        "",
        "OUTPUT CONTRACT — read this before the specification:",
        "Reply with a SINGLE JSON object and nothing else: no prose, no "
        "explanation, no markdown fence. Its keys are the sheet names "
        f"({sheets}); each value is an array of row objects whose keys are that "
        "sheet's column names, exactly as spelled in the specification. Use "
        "empty strings for unknown cells. Do NOT return a spreadsheet, a "
        "GraphML, or an em.json — the table is your only output; converting it "
        "into a graph is a separate, deterministic step you are not part of.",
        "",
        "COLUMN LAYOUT (authoritative — any other key is dropped):",
    ]
    for sheet, columns in (catalog.get("columns") or {}).items():
        lines.append(f"  {sheet}: {', '.join(columns)}")
    lines += [
        "",
        "SOURCES AVAILABLE:",
        f"  folder: {catalog.get('folder', '')}",
    ]
    for entry in catalog.get("files") or []:
        if entry.get("text"):
            state = " (text included below)"
        elif entry.get("note"):
            # The REASON, per file. "Not read" and "read but says nothing" lead a
            # model to opposite behaviour, and only the first justifies a
            # Documents row with no claims attached.
            state = f" (NOT read: {entry['note']})"
        else:
            state = " (not read)"
        lines.append(
            f"  - {entry.get('name', '')} "
            f"[{entry.get('kind', '?')}, {entry.get('bytes', 0)} bytes]"
            f"{state}")
    unread = [e.get("name", "") for e in (catalog.get("files") or [])
              if not e.get("text")]
    if unread:
        lines += [
            "",
            "NOTE — the following files were NOT read, so you are seeing only "
            f"their names: {', '.join(unread)}. Do not invent their contents. "
            "Record what the filenames legitimately support (a Documents row "
            "each) and leave the claims that would need their text to the "
            "archaeologist.",
        ]
    if catalog.get("pdf_text") is False:
        lines += [
            "",
            "NOTE — this build has no PDF text extractor, so no PDF in the "
            "folder has been read at all. If the folder is mostly PDFs, say so "
            "in your reply rather than producing a table built from filenames: "
            "a thin table that looks complete is worse than an explicit "
            "'the sources were not readable here'.",
        ]
    for entry in catalog.get("files") or []:
        if entry.get("text"):
            lines += ["", f"--- {entry['name']} ---", entry["text"]]
    if extra.strip():
        lines += ["", f"Additional instruction from the author: {extra.strip()}"]
    lines += ["", "SPECIFICATION:", spec]
    return "\n".join(lines)


def parse_stratiminer_reply(text: str) -> Dict[str, Any]:
    """Pull the sheets object out of a model reply.

    Tolerates the two things models do to JSON even when told not to: wrapping
    it in a ``` fence, and prefacing it with a sentence. Anything else raises
    :class:`LLMError` with the reply's opening characters attached — a parse
    failure the user cannot see the cause of is worse than no feature.
    """
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        if raw.rstrip().endswith("```"):
            raw = raw.rstrip()[:-3]
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        raise LLMError(
            f"the model did not return a JSON object; reply began: "
            f"{raw[:200]!r}", status=502)
    try:
        parsed = json.loads(raw[start:end + 1])
    except json.JSONDecodeError as exc:
        raise LLMError(
            f"the model's JSON did not parse ({exc}); reply began: "
            f"{raw[:200]!r}", status=502) from None
    if not isinstance(parsed, dict):
        raise LLMError("the model returned JSON that is not an object",
                       status=502)
    return parsed
