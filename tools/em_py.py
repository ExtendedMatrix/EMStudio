"""MICRO-PL15-BRIDGE-PYTHON (W12, E.D. 18 Nov 2026) · the bridge's Python
session: ``/py/*``, the EMStudio host of ``em`` (s3Dgraphy, W11).

The SECRET comes first (REPORT G12). These routes execute Python, so an
``Origin`` check is not enough: the desktop shell generates a secret at start,
hands it to the sidecar in ``EM_BRIDGE_TOKEN`` and to the page; every
``/py/*`` request carries ``Authorization: Bearer <secret>``. The bridge reads
the secret ONCE at start and takes it out of ``os.environ`` (a plugin that
prints the environment does not find it). A bridge started without a secret
keeps the Python routes CLOSED (503) — never open without one. The routes of
before are not touched.

The bridge stays stateless on the graph for everything else (W-13); a Python
session is the one exception, tied to the page's REVISION of the document
(``DocumentStore.rev``):

POST /py/session  {doc, revision, author, lang, declared, selection}
                  → {ok, session, revision, em_api, host, caller, listeners}
POST /py/run      {session, revision, ack?, doc?, code, dry_run?, selection?, lang?}
                  → the run's answer (below)
POST /py/resume   {session, run, answer?}   — the answer to a request that waits
                  (``pick``, ``camera``), or nothing: «how is it going»
POST /py/complete {session, text}            → {ok, matches, items, tail, signature?}
                  (MICRO-SEG02: ``items`` [{text, kind, label, detail?}] — the
                  kind of each name, the domain's values inside a string —, and
                  the open call's ``signature`` {name, text, doc})
POST /py/events   {session, revision, ack?, doc?, event, payload}
                  → the run's answer, or {status: "none"} with no listener
POST /py/close    {session}
POST /py/history  {limit?}                   → {ok, entries: [{code, at, dry_run}], path}
                  (level 82, MICRO-PL16: the console's history of this machine)
POST /py/plugins  {lang?}                    → {ok, plugins: [...], listeners, slots}
                  (level 83, MICRO-PL17 / W14: the plugins active for EMStudio,
                  loaded in this process — state, problems EN + IT, commands with
                  their slots ``in``, ``when``, ``accept``)
POST /py/invoke   {session, revision, ack?, doc?, plugin, command, slots}
                  → the run's answer + ``result: {value?, file?}``: a plugin's
                  command through the contract (the four refusals), its writes
                  AS THE PLUGIN (its declared capabilities), each one step
POST /py/checks   {session, revision, ack?, doc?} → the run's answer + ``issues``
                  (the ``check@1`` commands, read-only)
POST /py/plugins  {lang?, dev?}              (level 84, MICRO-PL18 / W15a: ``dev`` —
                  the page's «Funzioni sperimentali» — makes the plugins of the
                  development folder count, loaded where they are, source ``dev``;
                  the answer carries ``dev: {setting, exists, env, plugins}``.
                  The bridge keeps the last ``dev`` it was told for the calls
                  that do not say it: a session, an invoke, a check)
POST /py/plugins/dev    {dir: str|null, dev: true, lang?} → as /py/plugins, the
                  development folder of this machine set (null clears it); 403
                  without ``dev`` (the switch is the page's), 400 not a folder
POST /py/plugins/reload {plugin, dev: true, lang?} → as /py/plugins, a plugin of
                  the development folder read again (its modules forgotten)
POST /py/compute  {session, revision, ack?, doc?, items: [{key, plugin, command,
                  slot, slots}]} → the run's answer + ``result.values``: the
                  values of phase 2 (level 88, MICRO-PL25 / X5 — an Inspector
                  section, a column of the Tabular, the status bar, a panel's
                  value), each a READ-ONLY command through the contract, in the
                  shape its slot draws (``em.plugins.compute``); a command that
                  writes is refused before it runs. The answers to
                  /py/plugins carry the declarative panels (``panels``) and,
                  per command, ``primitive``, ``icon``, ``buttons``, ``view``
GET  /py/layer-image?plugin=&path=           → the bytes of a picture of a plugin's
                  layer of the Space (level 90, MICRO-GEO11 / row G10 of the
                  geophysics plan — ``space.layer@1``: the ``image`` and
                  ``stamp`` of its planes): ONLY a file under the plugin's own
                  data folder (``plugins-data/<id>/``, the real path checked: a
                  link out of it refused), a PNG, a JPEG, a WebP or a
                  ``.stamp.json`` beside one (served, never made); the secret
                  as for every /py route. ``/py/plugins`` carries a layer's
                  ``layer`` kind

A run's answer: ``{ok, run, status: done|waiting|running|error|refused|cancelled,
output, value?, error?, messages?, steps: [{label, delta, process, dtc, ids,
volatile}], proofs: [{label, message, nodes, edges, ops, volatile}],
app_requests: [...], waiting?, listeners}``. ``proofs`` (level 82) are the
``em.write`` that ended as a proof (``dry_run``, or the console's «try»): what
they would have written, nothing applied. Each step is ONE
``em.write``: the page applies its ``delta`` (the same shape as
/property-source's) in ONE ``store.batch`` = one undo step, writes a Log line
with its label, and next time sends ``ack: {run, revision}`` — the revision its
store has after applying. A request whose revision is not the session's (an
edit, a room's op, an undo) and carries no ``doc`` is answered 409 ``stale``:
the page sends the em.json again and the session reloads it (never a guess).

Every write goes through the contract: ``em.write`` → ``invoke`` →
``guard_write`` → :meth:`EMStudioHost.apply`, which adds the act's DTC process
(``dtc_process``, ``crmdig:D7``) with the code that ran (D-8: up to 4 kB in
the node; beyond, its sha256 and a pointer to the copy kept on this machine)
and applies the delta to the session's graph with ``apply_delta_to_graph``.

``em.app`` here is :class:`EMStudioApp`: its calls are ``app_requests`` the
page executes in order. One that needs an answer (``pick``, ``camera``)
closes the current request with ``status: waiting`` and the script — run in a
thread of its own — waits until ``/py/resume`` brings the answer.

One script at a time per bridge: a second ``/py/run`` while one is running or
waiting is answered 409 ``busy``.
"""
from __future__ import annotations

import ast
import builtins
import hashlib
import hmac
import io
import itertools
import json
import os
import pathlib
import queue
import re
import sys
import threading
import time
import traceback
import uuid
from typing import Any, Callable, Dict, List, Optional, Tuple

#: the bridge's level these routes came with (``BRIDGE_LEVEL`` in em_bridge.py)
LEVEL = 93  # 93: /py/session takes the commands' catalogue, /py/complete answers kinds and signatures, the `app` requests of em.app.space / workspaces / windows (MICRO-SEG02); 92: the level moved with /graph/door taking the survey and the site (MICRO-COR11); 91: the level moved with POST /graph/door-dosco, a DosCo folder through the door (MICRO-COR06); 90: GET /py/layer-image, the pictures of a plugin's layer of the Space (MICRO-GEO11); 89: the level moved with the signature of a repository (MICRO-PL28); 88: /py/compute, the values of phase 2 (MICRO-PL25); 87: the level moved with the list of the reviewed (MICRO-PL24); 86: the level moved with the updates (MICRO-PL23); 85: with the repositories (MICRO-PL22); the /py/* routes unchanged
TOKEN_ENV = "EM_BRIDGE_TOKEN"
#: D-8 · the code of an act kept in its DTC node up to this many bytes
CODE_MAX = 4096
#: how long one HTTP answer waits for the script before saying «running»
ANSWER_S = float(os.environ.get("EM_PY_ANSWER_S") or 20)
#: how long a script waits for the page's answer (a pick) before it is cancelled
WAIT_S = float(os.environ.get("EM_PY_WAIT_S") or 600)
#: sessions kept at once (the oldest goes)
MAX_SESSIONS = 8
#: what a run keeps of its output (a print in a loop must not fill the memory)
OUTPUT_MAX = 256 * 1024

ROUTES = ("/py/session", "/py/run", "/py/resume", "/py/complete", "/py/events", "/py/close",
          "/py/history", "/py/plugins", "/py/invoke", "/py/checks", "/py/plugins/dev", "/py/plugins/reload",
          "/py/compute")
#: MICRO-PL17 · the host name the plugins declare (``hosts = ["emstudio"]``)
HOST = "emstudio"
#: MICRO-PL16 · the console's history kept on this machine (entries; the oldest go)
HISTORY_MAX = 1000
#: what a proof says of its nodes, edges and ops (the counts are always whole)
PROOF_ROWS = 50

#: the views ``em.app.view`` may ask for: EMStudio's window types (``WindowType``,
#: frontend/src/workspace.ts; ``scene`` is the Space)
VIEWS = ("graph", "narrative", "table", "emtree", "outliner", "inspector", "viewer",
         "storage", "shelf", "study", "narrative-index", "chronology", "scene", "sheet",
         # MICRO-SEG02 · the Python console and the Script Editor are windows too
         "console", "script")

# ── the words, EN + IT ──────────────────────────────────────────────────────

WORDS: Dict[str, Dict[str, str]] = {
    "no_secret": {
        "en": "the Python routes are closed: this bridge was started without a secret "
              "(EM_BRIDGE_TOKEN). The desktop app gives its bridge one; by hand, start it "
              "with EM_BRIDGE_TOKEN set",
        "it": "le rotte Python sono chiuse: questo bridge è partito senza un segreto "
              "(EM_BRIDGE_TOKEN). L'applicazione desktop ne dà uno al suo bridge; a mano, "
              "avvialo con EM_BRIDGE_TOKEN",
    },
    "bad_secret": {
        "en": "the Python routes need this bridge's secret (Authorization: Bearer …)",
        "it": "le rotte Python chiedono il segreto di questo bridge (Authorization: Bearer …)",
    },
    "no_em": {
        "en": "this s3Dgraphy has no em (MICRO-PL14): update s3Dgraphy ({why})",
        "it": "questo s3Dgraphy non ha em (MICRO-PL14): aggiorna s3Dgraphy ({why})",
    },
    "no_compute": {
        "en": "this s3Dgraphy computes no plugin values (MICRO-PL25): update s3Dgraphy",
        "it": "questo s3Dgraphy non calcola i valori dei plugin (MICRO-PL25): aggiorna s3Dgraphy",
    },
    "no_session": {
        "en": "no Python session {sid}: open one again",
        "it": "nessuna sessione Python {sid}: aprine un'altra",
    },
    "stale": {
        "en": "the document changed since the session last saw it (revision {theirs}, "
              "here {ours}): send it again",
        "it": "il documento è cambiato da quando la sessione l'ha visto (revisione {theirs}, "
              "qui {ours}): rimandalo",
    },
    "busy": {
        "en": "a script is already running ({run}): wait for it, or answer what it asks",
        "it": "uno script è già in esecuzione ({run}): aspettalo, o rispondi a ciò che chiede",
    },
    "no_run": {
        "en": "no run {run} in this session",
        "it": "nessuna esecuzione {run} in questa sessione",
    },
    "cancelled": {
        "en": "the script was cancelled: {why}",
        "it": "lo script è stato annullato: {why}",
    },
    "no_answer": {
        "en": "no answer from the page in {s} s",
        "it": "nessuna risposta dalla pagina in {s} s",
    },
    "page_said_no": {
        "en": "the page did not do it: {why}",
        "it": "la pagina non l'ha fatto: {why}",
    },
    "bad_doc": {
        "en": "the em.json of the document is needed ({{doc}})",
        "it": "serve l'em.json del documento ({{doc}})",
    },
    "unknown_event": {
        "en": "unknown event «{event}»",
        "it": "evento sconosciuto «{event}»",
    },
    "dev_off": {
        "en": "the plugins' development folder needs «Experimental features» on",
        "it": "la cartella di sviluppo dei plugin chiede «Funzioni sperimentali» accese",
    },
    "dev_not_dev": {
        "en": "«{plugin}» is not a plugin of the development folder: an installed plugin changes by an update",
        "it": "«{plugin}» non è un plugin della cartella di sviluppo: un plugin installato cambia con un aggiornamento",
    },
    "dev_dir_bad": {
        "en": "{why}",
        "it": "{why_it}",
    },
    "layer_plugin": {
        "en": "no plugin «{plugin}» with a data folder on this machine",
        "it": "nessun plugin «{plugin}» con una cartella di dati su questa macchina",
    },
    "layer_path": {
        "en": "«{path}» is not a picture of the plugin's own folder: a layer's pictures are served only from there",
        "it": "«{path}» non è un'immagine della cartella del plugin: le immagini di uno strato si servono solo da lì",
    },
    "layer_missing": {
        "en": "«{path}» is not on this machine (the plugin's cache was made elsewhere, or cleaned)",
        "it": "«{path}» non è su questa macchina (la cache del plugin è stata fatta altrove, o pulita)",
    },
    "unknown_view": {
        "en": "no view «{name}» in EMStudio (the views: {known})",
        "it": "nessuna vista «{name}» in EMStudio (le viste: {known})",
    },
}


def words(key: str, **kw: Any) -> Dict[str, str]:
    return {lang: text.format(**kw) for lang, text in WORDS[key].items()}


def _err(key: str, lang: Optional[str] = None, **kw: Any) -> Dict[str, Any]:
    msgs = words(key, **kw)
    return {"ok": False, "code": key, "error": msgs.get(lang or "en") or msgs["en"], "messages": msgs}


# ── the secret ──────────────────────────────────────────────────────────────

_TOKEN: Optional[str] = None


def take_token(env: Optional[Dict[str, str]] = None) -> bool:
    """Read the secret ONCE and take it out of the environment. True when there is one."""
    global _TOKEN
    env = os.environ if env is None else env
    value = (env.pop(TOKEN_ENV, "") or "").strip()
    _TOKEN = value or None
    return _TOKEN is not None


def has_token() -> bool:
    return _TOKEN is not None


def gate(authorization: Optional[str]) -> Optional[Tuple[int, Dict[str, Any]]]:
    """None when the request may pass; else the answer (503 no secret here,
    401 a wrong or missing one). The comparison takes the same time either way."""
    if _TOKEN is None:
        return 503, _err("no_secret")
    got = (authorization or "").strip()
    if not got.lower().startswith("bearer "):
        return 401, _err("bad_secret")
    if not hmac.compare_digest(got[7:].strip().encode("utf-8"), _TOKEN.encode("utf-8")):
        return 401, _err("bad_secret")
    return None


# ── output by thread ────────────────────────────────────────────────────────

class _ThreadStream(io.TextIOBase):
    """``sys.stdout``/``sys.stderr`` while a script runs: what the SCRIPT's
    thread writes goes to its run; every other thread (the bridge's log lines)
    to the stream of before."""

    def __init__(self, original: Any):
        self.original = original
        self.sinks: Dict[int, Callable[[str], None]] = {}

    def write(self, s: str) -> int:
        sink = self.sinks.get(threading.get_ident())
        if sink is not None:
            sink(s)
            return len(s)
        return self.original.write(s)

    def flush(self) -> None:
        try:
            self.original.flush()
        except Exception:                            # noqa: BLE001 — a closed pipe
            pass

    @property
    def encoding(self) -> str:                       # type: ignore[override]
        return getattr(self.original, "encoding", "utf-8")


_streams: Dict[str, _ThreadStream] = {}


def _capture(sink: Callable[[str], None]) -> None:
    for name in ("stdout", "stderr"):
        cur = getattr(sys, name)
        if not isinstance(cur, _ThreadStream):
            cur = _ThreadStream(cur)
            setattr(sys, name, cur)
        cur.sinks[threading.get_ident()] = sink


def _release() -> None:
    for name in ("stdout", "stderr"):
        cur = getattr(sys, name)
        if isinstance(cur, _ThreadStream):
            cur.sinks.pop(threading.get_ident(), None)


# ── em, when this s3Dgraphy has it ──────────────────────────────────────────

def _em():
    from s3dgraphy import em                         # noqa: WPS433 — imported when asked
    # MICRO-TIL002 · «import em», as the reference writes it (and the Script
    # Editor's templates, taken from it): the console's `em` is already in the
    # namespace, but a script that imports it found no module of that name —
    # «from s3dgraphy import em» was the only spelling that worked here
    sys.modules.setdefault("em", em)
    return em


def console_caller(version: str = "") -> Any:
    """The descriptor of EMStudio's console: it reads, writes and proposes;
    speaks this build's versions (so the 1.1 ops pass)."""
    from s3dgraphy import __version__
    from s3dgraphy.contract import ConnectorDescriptor, current_versions
    return ConnectorDescriptor(
        name="emstudio.console", host="app-side", transport=["direct"],
        capabilities=["read-graph", "write-graph", "ingest-batch"], versions=current_versions(),
        provenance="derivation", service="emstudio",
        description="EMStudio's Python console (em through the bridge)",
        vendor={"s3dgraphy": __version__, "version": version or f"bridge {LEVEL}"})


def _console_dir() -> pathlib.Path:
    env = os.environ.get("S3DGRAPHY_CONSOLE_DIR")
    return pathlib.Path(env).expanduser() if env else pathlib.Path.home() / ".s3dgraphy" / "console"


def code_record(code: Optional[str]) -> Dict[str, Any]:
    """D-8 · the code of an act, as its DTC node keeps it: the text up to
    4 kB; beyond, its sha256 and a pointer to the copy this machine keeps
    (``~/.s3dgraphy/console/scripts/<sha256>.py``)."""
    if not code:
        return {}
    raw = code.encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    out: Dict[str, Any] = {"code_sha256": digest, "code_bytes": len(raw)}
    if len(raw) <= CODE_MAX:
        out["code"] = code
        return out
    ref = f"console/scripts/{digest}.py"
    try:
        folder = _console_dir() / "scripts"
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"{digest}.py"
        if not target.exists():
            target.write_bytes(raw)
        out["code_ref"] = f"~/.s3dgraphy/{ref}" if "S3DGRAPHY_CONSOLE_DIR" not in os.environ else str(target)
    except OSError as exc:
        out["code_ref"] = None
        out["code_ref_error"] = str(exc)
    return out


# ── the console's history (MICRO-PL16, W13) ─────────────────────────────────

_history_lock = threading.Lock()


def history_path() -> pathlib.Path:
    """``~/.s3dgraphy/console_history`` (SPEC-plugin §9); with
    ``S3DGRAPHY_CONSOLE_DIR`` (the checks) inside that folder."""
    env = os.environ.get("S3DGRAPHY_CONSOLE_DIR")
    if env:
        return pathlib.Path(env).expanduser() / "console_history"
    return pathlib.Path.home() / ".s3dgraphy" / "console_history"


def read_history(limit: int = HISTORY_MAX) -> List[Dict[str, Any]]:
    """The entries, the oldest first. One JSON object per line (a code of
    several lines stays one entry); a line that does not read is skipped."""
    path = history_path()
    try:
        lines = path.read_text("utf-8").splitlines()
    except OSError:
        return []
    out: List[Dict[str, Any]] = []
    for line in lines:
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if isinstance(e, dict) and isinstance(e.get("code"), str) and e["code"].strip():
            out.append({"code": e["code"], "at": e.get("at"), "dry_run": bool(e.get("dry_run"))})
    return out[-max(0, int(limit)):] if limit else out


def add_history(code: str, dry_run: bool = False) -> bool:
    """One run of the console, appended — not when it is the same code as the
    last entry. Past :data:`HISTORY_MAX` the oldest go. Never raises: a
    history that cannot be written loses an entry, not the run."""
    code = (code or "").rstrip()
    if not code.strip():
        return False
    with _history_lock:
        try:
            have = read_history(0)
            if have and have[-1]["code"] == code:
                return False
            path = history_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            entry = json.dumps({"code": code, "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                                "dry_run": bool(dry_run)}, ensure_ascii=False)
            if len(have) + 1 > HISTORY_MAX:
                keep = have[-(HISTORY_MAX - 1):]
                text = "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in keep)
                path.write_text(text + entry + "\n", "utf-8")
            else:
                with path.open("a", encoding="utf-8") as f:
                    f.write(entry + "\n")
            return True
        except OSError:
            return False


# ── the proofs (MICRO-PL16: the console's «try») ────────────────────────────

def proof_of(result: Any) -> Dict[str, Any]:
    """What a proof would have written, for the console: the counts, and the
    first :data:`PROOF_ROWS` nodes (id, type, name), edges and ops."""
    d = result.delta
    nodes = [{"id": str(n.get("id") or ""), "type": str(n.get("node_type") or n.get("type") or ""),
              "name": str(n.get("name") or "")} for n in d.nodes[:PROOF_ROWS]]
    edges = [{"source": str(e.get("source") or ""), "type": str(e.get("edge_type") or ""),
              "target": str(e.get("target") or "")} for e in d.edges[:PROOF_ROWS]]
    return {"label": result.label, "message": result.message, "volatile": bool(d.volatile),
            "counts": {"nodes": len(d.nodes), "edges": len(d.edges), "ops": len(d.ops)},
            "nodes": nodes, "edges": edges, "ops": [dict(o) for o in d.ops[:PROOF_ROWS]]}


_proofs_hooked = False


def _hook_proofs() -> None:
    """``em.write`` hands a proof back to the script and to nobody else
    (``write.submit`` returns before the host). The console wants to show it:
    ``submit`` is wrapped ONCE so that a proof is also given to a host with a
    ``proved`` method — any other host sees nothing new. To bring into
    s3Dgraphy as a hook of its own when the row names it (see the report)."""
    global _proofs_hooked
    if _proofs_hooked:
        return
    import importlib
    # the module, not the function ``em.write`` the package exports by that name
    W = importlib.import_module("s3dgraphy.em.write")
    if getattr(W, "PROVES_TO_HOST", False):
        _proofs_hooked = True                        # MICRO-PL17: s3Dgraphy gives the proof itself
        return
    original = W.submit

    def submit(host: Any, label: str, delta: Any, *, dry_run: bool = False) -> Any:
        out = original(host, label, delta, dry_run=dry_run)
        proved = getattr(host, "proved", None)
        if dry_run and callable(proved):
            try:
                proved(out)
            except Exception:                        # noqa: BLE001 — a proof never breaks the run
                pass
        return out

    submit.__wrapped__ = original                    # type: ignore[attr-defined]
    W.submit = submit
    _proofs_hooked = True


# ── the session ─────────────────────────────────────────────────────────────

class Session:
    """One page's document, held between requests (the one exception to a
    stateless bridge, W-13)."""

    def __init__(self, sid: str, body: Dict[str, Any], maps: Callable, changes: Callable):
        em = _em()
        self.id = sid
        self.maps, self.changes = maps, changes
        self.author = (str(body.get("author") or "").strip() or None)
        self.lang = str(body.get("lang") or "en")
        self.declared = body.get("declared") or []
        self.selection: List[str] = [str(i) for i in body.get("selection") or []]
        #: MICRO-SEG02 · the commands and actions a script reaches, with their
        #: params (the page's ``script-commands.json``): completion reads it
        self.commands: List[Dict[str, Any]] = [c for c in body.get("commands") or [] if isinstance(c, dict)]
        self.listeners: Dict[str, List[Callable]] = {name: [] for name in em.EVENTS}
        self.ns: Dict[str, Any] = {"__name__": "__console__", "__builtins__": builtins, "em": em}
        self.runs: Dict[str, "Run"] = {}
        self.pending: Optional[str] = None
        self.graph: Any = None
        self.revision: int = 0
        self._overlay: Any = None
        self.used = time.time()
        self.load(body)

    def load(self, body: Dict[str, Any]) -> None:
        from s3dgraphy import api
        doc = body.get("doc")
        if not isinstance(doc, dict):
            raise ValueError(words("bad_doc")["en"])
        self.graph, _warnings = api.load_emjson(doc)
        self.revision = int(body.get("revision") or 0)
        self.pending = None
        if "declared" in body:
            self.declared = body.get("declared") or []
            self._overlay = None
        if isinstance(body.get("commands"), list):
            self.commands = [c for c in body["commands"] if isinstance(c, dict)]

    def overlay(self) -> Any:
        if self._overlay is None:
            try:
                import em_extensions
                self._overlay = em_extensions.active_overlay(self.declared, True)[0]
            except Exception:                        # noqa: BLE001 — no packages: the empty overlay
                from s3dgraphy.profiles import EMPTY
                self._overlay = EMPTY
        return self._overlay

    def listener_counts(self) -> Dict[str, int]:
        """The session's listeners + the plugins' (MICRO-PL17: a plugin hears
        every document, so the page forwards an event when one of them waits)."""
        own = {k: len(v) for k, v in self.listeners.items()}
        try:
            for k, n in _em().events.owned_counts().items():
                own[k] = own.get(k, 0) + n
        except Exception:                            # noqa: BLE001 — an older s3Dgraphy: the session's only
            pass
        return own


_sessions: Dict[str, Session] = {}
_lock = threading.Lock()          # the sessions' table
_active: Optional["Run"] = None   # the one run that may be alive
_run_ids = itertools.count(1)


# ── the host ────────────────────────────────────────────────────────────────

class _asks(property):
    """A property whose reading ASKS the page (MICRO-SEG02): completion never
    reads one — it would send a request to the page from a Tab."""


def _ask_app(run: "Run", op: str, **args: Any) -> Any:
    return run.ask("app", op=op, args=args)


class Layer:
    """A layer of the Space (a model or a tileset): ``name``, ``visible``
    (settable), ``epochs``, ``bytes`` (its file's weight), ``kind``."""

    def __init__(self, space: "EMStudioSpace", row: Dict[str, Any]):
        self._space = space
        self._row = dict(row)

    key = property(lambda self: self._row.get("key"))
    id = property(lambda self: self._row.get("id"))
    name = property(lambda self: self._row.get("name"))
    kind = property(lambda self: self._row.get("kind"))
    epochs = property(lambda self: list(self._row.get("epochs") or []))
    bytes = property(lambda self: self._row.get("bytes"))
    file = property(lambda self: self._row.get("file"))

    @property
    def visible(self) -> bool:
        return bool(self._row.get("visible"))

    @visible.setter
    def visible(self, on: bool) -> None:
        self._row["visible"] = bool(_ask_app(self._space._run, "space.set_visible", key=self.key, visible=bool(on)))

    def __repr__(self) -> str:
        mb = f", {self.bytes / 1048576:.1f} MB" if isinstance(self.bytes, (int, float)) else ""
        return (f"<Layer {self.name!r} {self.kind}, {'visible' if self.visible else 'hidden'}"
                f"{', ' + ' · '.join(self.epochs) if self.epochs else ''}{mb}>")


class EMStudioSpace:
    """``em.app.space`` in EMStudio (MICRO-SEG02 p.3): the camera, a point
    picked, and what the Space shows — its layers, its epoch, the hardware
    profile it loads for."""

    def __init__(self, run: "Run"):
        self._run = run

    def camera(self) -> Dict[str, Any]:
        """The camera of the first Space open: ``{pos, target, …}``."""
        return self._run.ask("camera")

    def set_camera(self, camera: Dict[str, Any]) -> None:
        """Move the camera (the shape :meth:`camera` returns)."""
        self._run.request("set_camera", camera=camera)

    def frame(self, ids) -> None:
        """Frame these nodes (their proxies, their models) in the Space."""
        self._run.request("frame", ids=[str(getattr(i, "id", i)) for i in ids])

    def pick(self, prompt: str, primitive: str = "point") -> Any:
        """Ask the person to pick a point in the Space."""
        return self._run.ask("pick", prompt=str(prompt), primitive=str(primitive))

    @_asks
    def layers(self) -> List[Layer]:
        """The models and tilesets of the Space: name, visible, epochs, bytes."""
        return [Layer(self, r) for r in _ask_app(self._run, "space.layers") or []]

    def layer(self, ref: str) -> Optional[Layer]:
        """One layer, by its id or its name (None: not in the Space)."""
        return next((x for x in self.layers if ref in (x.id, x.name, x.key)), None)

    @_asks
    def epochs(self) -> List[Dict[str, Any]]:
        """The epochs the Space can show: ``{id, name, start, end}``."""
        return list(_ask_app(self._run, "space.epochs") or [])

    @_asks
    def epoch(self) -> Optional[Dict[str, Any]]:
        """The epoch shown: ``{id, name}``; set it with an id or a name."""
        return _ask_app(self._run, "space.epoch")

    @epoch.setter
    def epoch(self, ref: Any) -> None:
        _ask_app(self._run, "space.set_epoch", epoch=str(getattr(ref, "id", None) or (ref.get("id") if isinstance(ref, dict) else ref)))

    @_asks
    def profile(self) -> Dict[str, Any]:
        """The hardware profile the Space loads for: ``{profile, chosen, read, why}``;
        set it with ``"desktop"``, ``"web"``, ``"mobile"`` or None (read from the machine)."""
        return _ask_app(self._run, "space.profile")

    @profile.setter
    def profile(self, value: Optional[str]) -> None:
        _ask_app(self._run, "space.set_profile", profile=value)

    def __repr__(self) -> str:
        return "<em.app.space of emstudio>"


class EMStudioWorkspaces:
    """``em.app.workspaces`` (MICRO-SEG02 p.3): the tabs of the bar."""

    def __init__(self, run: "Run"):
        self._run = run

    def list(self) -> List[Dict[str, Any]]:
        """Every workspace: ``{id, label, builtin, active}``."""
        return list(_ask_app(self._run, "workspaces.list") or [])

    @_asks
    def active(self) -> str:
        """The id of the workspace in front; set it (id or label) to switch."""
        return _ask_app(self._run, "workspaces.active")

    @active.setter
    def active(self, ref: str) -> None:
        _ask_app(self._run, "workspaces.activate", id=str(ref))

    def __iter__(self):
        return iter(self.list())

    def __repr__(self) -> str:
        return "<em.app.workspaces of emstudio>"


class EMStudioWindows:
    """``em.app.windows`` (MICRO-SEG02 p.3): the windows of the workspace in
    front (and the detached ones), the types an area can show."""

    def __init__(self, run: "Run"):
        self._run = run

    def list(self) -> List[Dict[str, Any]]:
        """Every window: ``{id, type, label, active, detached}``."""
        return list(_ask_app(self._run, "windows.list") or [])

    @_asks
    def active(self) -> str:
        """The id of the active window; set it to make another active."""
        return _ask_app(self._run, "windows.active")

    @active.setter
    def active(self, win_id: str) -> None:
        _ask_app(self._run, "windows.activate", id=str(win_id))

    @_asks
    def types(self) -> List[str]:
        """The window types (graph, scene, console, script, …)."""
        return list(_ask_app(self._run, "windows.types") or [])

    def open(self, type: str, area: Optional[str] = None, split: str = "row") -> Optional[str]:
        """Open a window of ``type``: in the area ``area`` (a window id, which
        changes type), else beside the active one (``split``: row | col).
        Returns the window's id."""
        return _ask_app(self._run, "windows.open", type=str(type), area=area, split=split)

    def __iter__(self):
        return iter(self.list())

    def __repr__(self) -> str:
        return "<em.app.windows of emstudio>"


class EMStudioApp:
    """``em.app`` in EMStudio: each call is a REQUEST the page executes in order."""

    def __init__(self, run: "Run"):
        self._run = run
        #: MICRO-SEG02 p.3 · the Space, the workspaces, the windows as objects
        self.space = EMStudioSpace(run)
        self.workspaces = EMStudioWorkspaces(run)
        self.windows = EMStudioWindows(run)

    def command_catalog(self) -> List[Dict[str, Any]]:
        """The commands and actions a script reaches, with their params
        (``em.app.commands.list()``)."""
        return [dict(c) for c in self._run.session.commands]

    def selection(self) -> List[str]:
        return list(self._run.session.selection)

    def select(self, ids) -> None:
        ids = [str(getattr(i, "id", i)) for i in ids]
        self._run.session.selection = ids
        self._run.request("select", ids=ids)

    def view(self, name: str) -> None:
        if name not in VIEWS:
            raise ValueError(words("unknown_view", name=name, known=", ".join(VIEWS))[
                self._run.session.lang if self._run.session.lang in ("en", "it") else "en"])
        self._run.request("view", name=name)

    def notify(self, msg: str, level: str = "info") -> None:
        self._run.request("notify", message=str(msg), level=level if level in ("info", "warning", "error") else "info")

    def run_command(self, command_id: str, **slots: Any) -> Any:
        return self._run.ask("command", id=str(command_id), slots=slots)

    def camera(self) -> Dict[str, Any]:
        return self._run.ask("camera")

    def set_camera(self, camera: Dict[str, Any]) -> None:
        self._run.request("set_camera", camera=camera)

    def frame(self, ids) -> None:
        self._run.request("frame", ids=[str(getattr(i, "id", i)) for i in ids])

    def pick(self, prompt: str, primitive: str = "point") -> Any:
        return self._run.ask("pick", prompt=str(prompt), primitive=str(primitive))

    def __bool__(self) -> bool:
        return True

    def __repr__(self) -> str:
        return "<em.app of emstudio>"


class EMStudioHost:
    """The host of ``em`` inside EMStudio's bridge, for one run."""

    name = "emstudio"

    def __init__(self, run: "Run"):
        self.run = run
        self.app = EMStudioApp(run)
        self.force_dry_run = bool(run.dry_run)
        self._caller = console_caller()

    def graph(self) -> Any:
        return self.run.session.graph

    def overlay(self) -> Any:
        return self.run.session.overlay()

    def author(self) -> Optional[str]:
        return self.run.session.author

    def caller(self) -> Any:
        return self._caller

    def language(self) -> Optional[str]:
        return self.run.session.lang

    def commands(self) -> List[str]:
        """The active plugins' commands (W14): «plugin/command — label»."""
        try:
            lang = "it" if str(self.run.session.lang).startswith("it") else "en"
            return [f"{c.name} — {c.label_in(lang)}" for c in _em().plugins.commands()]
        except Exception:                            # noqa: BLE001
            return []

    def proved(self, result: Any) -> None:
        """A proof of this run (MICRO-PL16): said to the console, applied nowhere."""
        self.run.proofs.append(proof_of(result))

    def apply(self, delta: Any, *, descriptor: Any, capability: str, label: str) -> Any:
        """ONE step: the act's DTC process with its code, the delta through
        the seam on the session's graph, the page's delta for one batch."""
        from s3dgraphy.contract import apply_delta_to_graph
        from s3dgraphy.em.host import process_of, touched_ids
        em = _em()
        s = self.run.session
        delta.process = delta.process or process_of(descriptor, label, host=self.name)
        ids = touched_ids(delta)
        dtc_id = None
        if delta.writes:
            dtc_id, node = self.run.dtc_node(label, descriptor, ids)
            delta.nodes.append(node)
        before = s.maps(_api(), s.graph)
        result = apply_delta_to_graph(s.graph, descriptor, capability, delta)
        if result.ok:
            after = s.maps(_api(), s.graph)
            self.run.steps.append({
                "label": label, "delta": diff_maps(before, after, s.changes),
                "process": delta.process, "dtc": dtc_id, "ids": ids,
                "volatile": bool(result.data.get("volatile")),
                "applied": result.data.get("applied"), "refused": result.data.get("refused") or []})
            em.events.emit("graph-changed", {"label": label, "ids": ids,
                                             "volatile": bool(result.data.get("volatile"))})
        return result


def _api():
    from s3dgraphy import api
    return api


def diff_maps(before: Tuple[dict, dict], after: Tuple[dict, dict], changes: Callable) -> Dict[str, Any]:
    """The page's delta between two em.json maps — the shape /property-source
    and /pose/* answer (``applyDelta`` in the page)."""
    nodes0, edges0 = before
    nodes1, edges1 = after
    return {
        "add_nodes": [nodes1[i] for i in nodes1 if i not in nodes0],
        "remove_nodes": [i for i in nodes0 if i not in nodes1],
        "set_fields": [{"node": i, **c} for i in nodes1 if i in nodes0
                       for c in changes(nodes0[i], nodes1[i])],
        "add_edges": [edges1[i] for i in edges1 if i not in edges0],
        "remove_edges": [edges0[i] for i in edges0 if i not in edges1],
        "edge_attributes": [{"edge": edges1[i], "attributes": edges1[i].get("attributes") or {},
                             "before": edges0[i].get("attributes") or {}}
                            for i in edges1 if i in edges0
                            and (edges0[i].get("attributes") or {}) != (edges1[i].get("attributes") or {})],
    }


# ── a run ───────────────────────────────────────────────────────────────────

class _Cancelled(BaseException):
    """Raised inside the script's thread when the run is cancelled (a
    BaseException: a script's ``except Exception`` must not swallow it)."""


class Run:
    """One script (or one event's delivery) in a thread of its own."""

    def __init__(self, session: Session, *, code: Optional[str] = None,
                 event: Optional[Tuple[str, Dict[str, Any]]] = None, dry_run: bool = False,
                 invoke: Optional[Tuple[str, str, Dict[str, Any]]] = None, checks: bool = False,
                 compute: Optional[List[Dict[str, Any]]] = None):
        self.id = f"r{next(_run_ids)}-{uuid.uuid4().hex[:6]}"
        self.session = session
        self.code = code
        self.event = event
        #: MICRO-PL17 · a plugin's command (plugin, command, slots), or the checks
        self.invoke = invoke
        self.checks = checks
        #: MICRO-PL25 · the values of phase 2 (read-only commands)
        self.compute = compute
        self.result: Optional[Dict[str, Any]] = None
        self.dry_run = dry_run
        self.status = "running"
        self.output: List[str] = []
        self._out_len = 0
        self.value: Optional[str] = None
        self.error: Optional[str] = None
        self.messages: Optional[Dict[str, str]] = None
        self.steps: List[Dict[str, Any]] = []
        self._steps_sent = 0
        self.proofs: List[Dict[str, Any]] = []
        self._proofs_sent = 0
        self.requests: List[Dict[str, Any]] = []
        self._sent = 0
        self.waiting: Optional[Dict[str, Any]] = None
        self._answers: "queue.Queue[Any]" = queue.Queue()
        self._cv = threading.Condition()
        self._dtc_n = 0
        self.thread = threading.Thread(target=self._main, name=f"em-py {self.id}", daemon=True)

    # what the page is asked
    def request(self, kind: str, **body: Any) -> None:
        with self._cv:
            self.requests.append({"n": len(self.requests), "kind": kind, **body})
            self._cv.notify_all()

    def ask(self, kind: str, **body: Any) -> Any:
        with self._cv:
            req = {"n": len(self.requests), "kind": kind, "wait": True, **body}
            self.requests.append(req)
            self.waiting, self.status = req, "waiting"
            self._cv.notify_all()
        try:
            answer = self._answers.get(timeout=WAIT_S)
        except queue.Empty:
            raise _Cancelled(words("no_answer", s=int(WAIT_S))["en"])
        with self._cv:
            self.waiting, self.status = None, "running"
        if isinstance(answer, dict) and answer.get("cancelled"):
            raise _Cancelled(str(answer.get("why") or "cancelled"))
        if isinstance(answer, dict) and answer.get("error"):
            from s3dgraphy.em import NotAvailable
            raise NotAvailable(f"{kind}: {answer['error']}", "emstudio")
        return answer.get("value") if isinstance(answer, dict) else answer

    def answer(self, value: Any) -> bool:
        with self._cv:
            if self.waiting is None:
                return False
            self.waiting, self.status = None, "running"
            self._answers.put(value)
        return True

    # the act's DTC process (D-8)
    def dtc_node(self, label: str, descriptor: Any, ids: List[str]) -> Tuple[str, Dict[str, Any]]:
        em = _em()
        self._dtc_n += 1
        gid = getattr(self.session.graph, "graph_id", "") or ""
        nid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"emstudio:py:{gid}:{self.id}:{self._dtc_n}"))
        vendor = descriptor.vendor or {}
        params: Dict[str, Any] = {"label": label, "host": "emstudio", "touched": ids[:200]}
        if vendor.get("plugin"):
            # MICRO-PL17 · the act of a plugin: which one, which command, from where, unverified
            params.update({"plugin": vendor.get("plugin"), "plugin_version": vendor.get("version"),
                           "source": vendor.get("source"), "verified": bool(vendor.get("verified")),
                           **({"package": vendor["package"]} if vendor.get("package") else {}),
                           **({"command": self.invoke[1]} if self.invoke else {})})
        if self.code is not None:
            params.update(code_record(self.code))
        elif self.event is not None:
            params["source"] = f"listener of {self.event[0]}"
        return nid, {
            "id": nid, "node_type": "dtc_process", "name": label,
            "description": "Python (em) · " + descriptor.name,
            "data": {"dtc_kind": "transformation", "technique": "Python (em)",
                     "software": [{"name": descriptor.name, "version": vendor.get("version")},
                                  {"name": "s3dgraphy.em", "version": em.API_VERSION}],
                     "parameters": params}}

    def _write(self, s: str) -> None:
        if self._out_len >= OUTPUT_MAX:
            return
        s = s[: OUTPUT_MAX - self._out_len]
        self._out_len += len(s)
        with self._cv:
            self.output.append(s)

    # the thread
    def _main(self) -> None:
        global _active
        em = _em()
        try:
            _hook_proofs()
        except Exception:                            # noqa: BLE001 — without it a proof is only the script's
            pass
        s = self.session
        previous_listeners = em.events._listeners
        host = EMStudioHost(self)
        _capture(self._write)
        previous_host = em.host._current
        em.host.install(host)
        em.events._listeners = s.listeners
        status = "done"
        try:
            if self.invoke is not None:
                plugin, command, slots = self.invoke
                res = em.plugins.invoke(plugin, command, slots, author=s.author)
                self.result = {k: res.data[k] for k in ("value", "file") if k in res.data}
                if not res.ok:
                    status = "refused" if res.data.get("reason") != "handler-failed" else "error"
                    self.messages = dict(res.data.get("messages") or {"en": res.message})
                    self.error = self.messages.get(s.lang) or self.messages.get("en") or res.message
                    if res.data.get("error"):
                        self._write(f"{res.data['error']}\n")
            elif self.checks:
                self.result = {"issues": em.plugins.run_checks(lang=s.lang)}
            elif self.compute is not None:
                self.result = {"values": em.plugins.compute(self.compute, lang=s.lang, author=s.author)}
            elif self.event is not None:
                failures = em.events.emit(self.event[0], self.event[1])
                for f in failures:
                    self._write(f"{f['listener']}: {f['error']}\n")
                if failures:
                    status = "error"
                    self.error = failures[0]["error"]
            else:
                self.value = execute(self.code or "", s.ns, em)
        except _Cancelled as exc:
            status, self.messages = "cancelled", words("cancelled", why=str(exc))
            self.error = self.messages["en"]
        except em.Refused as exc:
            status, self.messages = "refused", dict(getattr(exc, "messages", None) or {"en": str(exc)})
            self.error = self.messages.get(s.lang) or self.messages.get("en") or str(exc)
        except BaseException as exc:                 # noqa: BLE001 — the script's, said
            status = "error"
            self.error = "".join(traceback.format_exception_only(type(exc), exc)).strip()
            self._write(_user_traceback(exc))
            msgs = getattr(exc, "messages", None)
            if isinstance(msgs, dict):
                self.messages = dict(msgs)
        finally:
            em.events._listeners = previous_listeners
            em.host._current = previous_host
            _release()
            with self._cv:
                self.status = status
                self._cv.notify_all()
            with _lock:
                if _active is self:
                    _active = None

    def start(self) -> None:
        self.thread.start()

    def answer_now(self, wait: float = ANSWER_S) -> Dict[str, Any]:
        """Wait until the run is done or waits for the page (or ``wait`` s
        pass), then say what is new."""
        end = time.time() + wait
        with self._cv:
            while self.status == "running" and time.time() < end:
                self._cv.wait(timeout=max(0.0, min(0.25, end - time.time())))
            return self._payload()

    def _payload(self) -> Dict[str, Any]:
        new_requests = self.requests[self._sent:]
        self._sent = len(self.requests)
        new_steps = self.steps[self._steps_sent:]
        self._steps_sent = len(self.steps)
        new_proofs = self.proofs[self._proofs_sent:]
        self._proofs_sent = len(self.proofs)
        out = "".join(self.output)
        self.output = []
        if new_steps:
            # the page applies them, then says its revision (``ack``)
            self.session.pending = self.id
        payload: Dict[str, Any] = {
            "ok": self.status not in ("error", "refused", "cancelled"),
            "run": self.id, "status": self.status, "output": out, "steps": new_steps,
            "proofs": new_proofs, "app_requests": new_requests, "listeners": self.session.listener_counts(),
            "revision": self.session.revision}
        if self.value is not None and self.status == "done":
            payload["value"] = self.value
        if self.waiting is not None:
            payload["waiting"] = self.waiting
        if self.error:
            payload["error"] = self.error
        if self.messages:
            payload["messages"] = self.messages
        if self.result is not None and self.status not in ("running", "waiting"):
            payload["result"] = self.result
        return payload


def execute(code: str, ns: Dict[str, Any], em: Any) -> Optional[str]:
    """Run ``code`` as a console does: the statements, and the value of a
    last expression (its repr) when it is not None. ``g`` and ``sel`` are
    the session's graph and selection at the start of the run."""
    try:
        ns["g"] = em.graph
    except AttributeError:
        ns["g"] = None
    try:
        ns["sel"] = em.app.selection()
    except Exception:                                # noqa: BLE001
        ns["sel"] = []
    tree = ast.parse(code, filename="<console>", mode="exec")
    last = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        last = ast.Expression(tree.body.pop().value)
    exec(compile(tree, "<console>", "exec"), ns)    # noqa: S102 — the console's purpose
    if last is not None:
        value = eval(compile(last, "<console>", "eval"), ns)  # noqa: S307
        if _prints_itself(last.body):
            return None                              # its text is already in the output
        if value is not None:
            ns["_"] = value
            return repr(value)
    return None


def _prints_itself(expr: ast.AST) -> bool:
    """``em.help()`` prints its text and returns it: the console shows it
    once (MICRO-PL16), as Python's prompt shows ``help()``."""
    return (isinstance(expr, ast.Call) and isinstance(expr.func, ast.Attribute)
            and expr.func.attr == "help" and isinstance(expr.func.value, ast.Name)
            and expr.func.value.id == "em")


def _user_traceback(exc: BaseException) -> str:
    """The traceback from the script's own frames (the bridge's are noise)."""
    frames = traceback.extract_tb(exc.__traceback__)
    mine = [f for f in frames if f.filename == "<console>"]
    lines = ["Traceback (most recent call last):\n"] if mine else []
    lines += traceback.format_list(mine)
    lines += traceback.format_exception_only(type(exc), exc)
    return "".join(lines)


# ── the routes ──────────────────────────────────────────────────────────────

def _session(body: Dict[str, Any]) -> Tuple[Optional[Session], Optional[Tuple[int, Dict[str, Any]]]]:
    sid = str(body.get("session") or "")
    with _lock:
        s = _sessions.get(sid)
    if s is None:
        return None, (404, _err("no_session", body.get("lang"), sid=sid or "—"))
    s.used = time.time()
    if body.get("lang"):
        s.lang = str(body["lang"])
    if "selection" in body:
        s.selection = [str(i) for i in body.get("selection") or []]
    ack = body.get("ack")
    if isinstance(ack, dict) and ack.get("run") and ack.get("run") == s.pending:
        s.revision = int(ack.get("revision") or 0)
        s.pending = None
    if isinstance(body.get("doc"), dict):
        s.load(body)
    elif "revision" in body and int(body.get("revision") or 0) != s.revision:
        return s, (409, {**_err("stale", s.lang, theirs=body.get("revision"), ours=s.revision),
                         "stale": True})
    return s, None


def _busy(s: Session) -> Optional[Tuple[int, Dict[str, Any]]]:
    with _lock:
        run = _active
    if run is not None and run.status in ("running", "waiting"):
        return 409, {**_err("busy", s.lang, run=run.id), "run": run.id, "status": run.status}
    return None


def _start(s: Session, run: Run) -> Tuple[int, Dict[str, Any]]:
    global _active
    with _lock:
        if _active is not None and _active.status in ("running", "waiting"):
            return 409, {**_err("busy", s.lang, run=_active.id), "run": _active.id}
        _active = run
    s.runs[run.id] = run
    for old in list(s.runs)[:-16]:
        s.runs.pop(old, None)
    run.start()
    return 200, run.answer_now()


#: MICRO-PL18 (W15a) · the page's «Funzioni sperimentali» as it last said it:
#: the development folder counts only then (the switch is the page's, this
#: machine's; a call that does not say it keeps the last answer)
_dev = {"on": False}


def _dev_supported(em: Any) -> bool:
    import inspect
    try:
        return "dev" in inspect.signature(em.plugins.sync).parameters
    except (TypeError, ValueError):
        return False


def plugins_now(lang: Optional[str] = None, dev: Optional[bool] = None) -> Dict[str, Any]:
    """MICRO-PL17 · the plugins active for EMStudio, loaded (or refused, said)
    in this process. Cheap: one read of enabled.json; a plugin is imported once.
    MICRO-PL18 · ``dev``: the development folder too (kept for the next calls)."""
    em = _em()
    if not hasattr(em, "plugins"):
        return {"plugins": [], "listeners": {}, "slots": {}, "supported": False}
    if dev is not None:
        _dev["on"] = bool(dev)
    can_dev = _dev_supported(em)
    with _lock:
        if can_dev:
            em.plugins.sync(HOST, dev=_dev["on"])
        else:
            em.plugins.sync(HOST)
    out = em.plugins.describe(lang or "en")
    out["supported"] = True
    out["dev_supported"] = can_dev
    if can_dev and _dev["on"]:
        from s3dgraphy import extensions as X
        out["dev"] = X.describe_dev(HOST)
    return out


def dev_route(route: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """MICRO-PL18 · /py/plugins/dev and /py/plugins/reload."""
    em = _em()
    lang = body.get("lang")
    if not body.get("dev") or not hasattr(em, "plugins") or not _dev_supported(em):
        return 403, _err("dev_off", lang)
    if route == "/py/plugins/dev":
        from s3dgraphy import extensions as X
        try:
            X.set_dev_dir(body.get("dir") or None)
        except X.ExtensionError as exc:
            pr = exc.report.problems[0]
            return 400, {**_err("dev_dir_bad", lang, why=pr.text("en"), why_it=pr.text("it")), "code": pr.code}
        return 200, {"ok": True, "level": LEVEL, **plugins_now(lang, True)}
    pid = str(body.get("plugin") or "")
    _dev["on"] = True
    with _lock:
        p = em.plugins.reload(pid, HOST)
    if p is None:
        return 404, _err("dev_not_dev", lang, plugin=pid or "—")
    return 200, {"ok": True, "level": LEVEL, "reloaded": pid, **plugins_now(lang, True)}


def open_session(body: Dict[str, Any], maps: Callable, changes: Callable) -> Tuple[int, Dict[str, Any]]:
    em = _em()
    try:
        plugins_now()                                # their listeners hear this document too
    except Exception:                                # noqa: BLE001 — a plugin never stops a session
        pass
    sid = f"s-{uuid.uuid4().hex[:12]}"
    s = Session(sid, body, maps, changes)
    with _lock:
        _sessions[sid] = s
        while len(_sessions) > MAX_SESSIONS:
            oldest = min(_sessions.values(), key=lambda x: x.used)
            _sessions.pop(oldest.id, None)
    caller = console_caller()
    return 200, {"ok": True, "session": sid, "revision": s.revision, "em_api": em.API_VERSION,
                 "host": "emstudio", "level": LEVEL,
                 "caller": {"name": caller.name, "capabilities": list(caller.capabilities)},
                 "author": s.author, "listeners": s.listener_counts()}


def post(route: str, body: Dict[str, Any], maps: Callable, changes: Callable) -> Tuple[int, Dict[str, Any]]:
    """The routes, behind the gate (the bridge checks the secret first)."""
    try:
        _em()
    except Exception as exc:                         # noqa: BLE001 — an older s3Dgraphy
        return 501, _err("no_em", body.get("lang"), why=str(exc))
    try:
        if route == "/py/session":
            return open_session(body, maps, changes)
        if route == "/py/plugins":
            dev = body.get("dev")
            return 200, {"ok": True, "level": LEVEL, **plugins_now(body.get("lang"), None if dev is None else bool(dev))}
        if route in ("/py/plugins/dev", "/py/plugins/reload"):
            return dev_route(route, body)
        if route == "/py/history":
            limit = int(body.get("limit") or HISTORY_MAX)
            return 200, {"ok": True, "entries": read_history(limit), "path": str(history_path())}
        if route == "/py/close":
            with _lock:
                s = _sessions.pop(str(body.get("session") or ""), None)
            if s is not None:
                for fns in s.listeners.values():
                    fns.clear()
            return 200, {"ok": True, "closed": s is not None}
        if route == "/py/complete":
            with _lock:
                s = _sessions.get(str(body.get("session") or ""))
            if s is None:
                return 404, _err("no_session", body.get("lang"), sid=body.get("session") or "—")
            rich = complete_rich(s, str(body.get("text") or ""))
            return 200, {"ok": True, "matches": [i["text"] for i in rich["items"]][:100], **rich}
        if route == "/py/resume":
            with _lock:
                s = _sessions.get(str(body.get("session") or ""))
            run = s.runs.get(str(body.get("run") or "")) if s else None
            if s is None or run is None:
                return 404, _err("no_run", (s.lang if s else None), run=body.get("run") or "—")
            if "answer" in body:
                run.answer(body.get("answer"))
            return 200, run.answer_now()
        if route in ("/py/invoke", "/py/checks", "/py/compute"):
            s, refused = _session(body)
            if refused:
                return refused
            busy = _busy(s)
            if busy:
                return busy
            plugins_now(s.lang)
            if route == "/py/checks":
                return _start(s, Run(s, checks=True))
            if route == "/py/compute":
                em = _em()
                if not hasattr(em.plugins, "compute"):
                    return 501, _err("no_compute", s.lang)
                items = [i for i in (body.get("items") or []) if isinstance(i, dict)]
                return _start(s, Run(s, compute=items))
            slots = body.get("slots") if isinstance(body.get("slots"), dict) else {}
            return _start(s, Run(s, invoke=(str(body.get("plugin") or ""), str(body.get("command") or ""), slots)))
        if route in ("/py/run", "/py/events"):
            s, refused = _session(body)
            if refused:
                return refused
            busy = _busy(s)
            if busy:
                return busy
            if route == "/py/run":
                code = str(body.get("code") or "")
                if body.get("history", True):
                    add_history(code, bool(body.get("dry_run")))
                return _start(s, Run(s, code=code, dry_run=bool(body.get("dry_run"))))
            event = str(body.get("event") or "")
            if event not in s.listeners:
                return 400, _err("unknown_event", s.lang, event=event)
            if not s.listener_counts().get(event):
                return 200, {"ok": True, "status": "none", "listeners": s.listener_counts(),
                             "revision": s.revision}
            payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
            return _start(s, Run(s, event=(event, payload)))
    except ValueError as exc:
        return 400, {"ok": False, "error": str(exc)}
    return 404, {"ok": False, "error": "unknown /py route"}


# ── the pictures of a layer of the Space (MICRO-GEO11) ──────────────────────

#: what /py/layer-image serves: a picture, or the stamp beside one (never made here)
LAYER_MEDIA = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
               ".stamp.json": "application/json"}
#: the largest picture served (a slice of 1000 × 1000 RGBA is ~4 MB uncompressed)
LAYER_IMAGE_MAX = 64 * 1024 * 1024
_PLUGIN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-]{0,63}$")


def _plugins_data() -> pathlib.Path:
    em = _em()
    return pathlib.Path(em.plugins.plugins_data_dir())


def layer_image(plugin: str, path: str, lang: Optional[str] = None) -> Tuple[int, Any, Optional[str]]:
    """``(status, bytes | error dict, media)``: a file of ``plugins-data/<plugin>/``
    named by ``path`` (relative, ``/``-separated, no ``..``), its real path
    inside the plugin's real folder, of a kind in :data:`LAYER_MEDIA`."""
    pid = str(plugin or "")
    if not _PLUGIN_ID.match(pid) or pid in (".", ".."):
        return 404, _err("layer_plugin", lang, plugin=pid or "—"), None
    base = _plugins_data() / pid
    if not base.is_dir():
        return 404, _err("layer_plugin", lang, plugin=pid), None
    rel = str(path or "").strip()
    parts = rel.split("/")
    low = rel.lower()
    media = next((m for ext, m in sorted(LAYER_MEDIA.items(), key=lambda kv: -len(kv[0])) if low.endswith(ext)), None)
    if (not rel or "\\" in rel or "\x00" in rel or ":" in rel or rel.startswith("/")
            or any(p in ("", ".", "..") for p in parts) or media is None
            or (low.endswith(".json") and not low.endswith(".stamp.json"))):
        return 403, _err("layer_path", lang, path=rel or "—"), None
    real_base = os.path.realpath(base)
    full = os.path.realpath(os.path.join(real_base, *parts))
    if os.path.commonpath([real_base, full]) != real_base:
        return 403, _err("layer_path", lang, path=rel), None
    if not os.path.isfile(full):
        return 404, _err("layer_missing", lang, path=rel), None
    if os.path.getsize(full) > LAYER_IMAGE_MAX:
        return 413, _err("layer_path", lang, path=rel), None
    with open(full, "rb") as fh:
        return 200, fh.read(), media


# ── completion ──────────────────────────────────────────────────────────────
#
# MICRO-SEG02 p.4 (E.D., 20 Nov 2026: «voglio la console in cui con Tab carico
# le sottofunzioni o metodi, come in Blender») · ONE source for the console's
# Tab and the Script Editor's list: the live session (``dir``,
# ``inspect.signature``, the docstrings) and the params the page declared
# (``script-commands.json``, sent with the session). What a Tab answers:
#
# * after a dotted name, the names that may follow, each with its KIND
#   (module, class, function, method, property, value) — never by reading a
#   property that asks the page (``_asks``): a Tab sends no request;
# * after a callable and its «(», its SIGNATURE and the first line of its
#   docstring; inside ``commands.run("open", …`` the command's own params
#   (``path=``, ``replace=``) and its signature;
# * inside a string, the values of the domain: the command ids in
#   ``commands.run("…``, the ids and names of the nodes (``g.node("…``), the
#   node types (``g.nodes("…``, ``type="…``), the edge types, the epochs'
#   names (``epoch="…``), an enum param's choices, the package's qualia.

_NAME_TAIL = re.compile(r"[A-Za-z_][\w\.]*$|$")
_STRING_TAIL = re.compile(r"""(["'])([^"']*)$""")
_CALL_HEAD = re.compile(r"([A-Za-z_][\w\.]*)\s*\($")


class _NoAsk(Exception):
    """Raised by the completion's stand-in for a run: nothing is asked."""


class _CompletionRun:
    """A run that never reaches the page: what EMStudio's ``em.app`` objects
    are bound to while a Tab looks at them."""

    def __init__(self, session: "Session"):
        self.session = session

    def request(self, *a: Any, **k: Any) -> None:
        raise _NoAsk()

    def ask(self, *a: Any, **k: Any) -> Any:
        raise _NoAsk()


class _AppView:
    """``em.app`` as a Tab sees it inside EMStudio: s3Dgraphy's ``_App`` and
    what EMStudio's application adds (space, workspaces, windows)."""

    def __init__(self, app: Any, own: "EMStudioApp"):
        self._app, self._own = app, own

    def names(self) -> List[str]:
        base = {n for n in dir(type(self._app)) if not n.startswith("_")}
        base |= {"selection", "select", "view", "notify", "space", "commands", "available", "on",
                 "workspaces", "windows"}
        return sorted(base)

    def get(self, name: str) -> Any:
        if name in ("space", "workspaces", "windows"):
            return getattr(self._own, name)
        return getattr(self._app, name)

    def static(self, name: str) -> Any:
        if name in ("space", "workspaces", "windows"):
            return property(lambda _self: None, doc=getattr(type(getattr(self._own, name)), "__doc__", None))
        try:
            import inspect
            return inspect.getattr_static(self._app, name)
        except AttributeError:
            return None


def _kind_of(static: Any, value: Any = None) -> str:
    import inspect
    if isinstance(static, (staticmethod, classmethod)):
        return "function"
    if isinstance(static, property):
        return "property"
    obj = static if value is None else value
    if inspect.ismodule(obj):
        return "module"
    if inspect.isclass(obj):
        return "class"
    if inspect.isfunction(static) or inspect.isbuiltin(static):
        return "method" if value is not None and inspect.ismethod(value) else "function"
    if inspect.ismethod(obj) or inspect.ismethoddescriptor(static):
        return "method"
    if callable(obj):
        return "function"
    return "value"


def _first_line(doc: Optional[str], cap: int = 200) -> str:
    """The docstring's first paragraph, on one line (cut at ``cap``)."""
    para: List[str] = []
    for line in (doc or "").strip().splitlines():
        if not line.strip():
            if para:
                break
            continue
        para.append(line.strip())
    text = " ".join(para)
    return text if len(text) <= cap else text[: cap - 1].rstrip() + "…"


class _Resolver:
    """Walks a dotted name in the session WITHOUT reading what asks the page."""

    def __init__(self, s: "Session"):
        self.s = s
        self.em = _em()
        self.own = EMStudioApp(_CompletionRun(s))
        self.ns: Dict[str, Any] = dict(s.ns)
        self.ns.setdefault("em", self.em)

    def wrap(self, obj: Any) -> Any:
        return _AppView(obj, self.own) if obj is getattr(self.em, "app", None) else obj

    def root(self, name: str) -> Any:
        if name == "g" and self.ns.get("g") is None:
            from s3dgraphy.em.graph import GraphView
            return GraphView(self.s.graph)
        if name == "sel" and "sel" not in self.ns:
            return list(self.s.selection)
        if name in self.ns:
            return self.wrap(self.ns[name])
        if hasattr(builtins, name):
            return getattr(builtins, name)
        raise KeyError(name)

    def static(self, obj: Any, name: str) -> Any:
        import inspect
        if isinstance(obj, _AppView):
            return obj.static(name)
        try:
            return inspect.getattr_static(obj, name)
        except AttributeError:
            return None

    def step(self, obj: Any, name: str) -> Any:
        if isinstance(obj, _AppView):
            return self.wrap(obj.get(name))
        st = self.static(obj, name)
        if isinstance(st, _asks):
            raise _NoAsk()
        if obj is self.em and name == "graph":
            # ``em.graph`` is the host's graph: the session's, as ``g``
            g = self.ns.get("g")
            if g is None:
                from s3dgraphy.em.graph import GraphView
                g = GraphView(self.s.graph)
            return g
        return self.wrap(getattr(obj, name))

    def resolve(self, dotted: str) -> Any:
        parts = dotted.split(".")
        obj = self.root(parts[0])
        for p in parts[1:]:
            obj = self.step(obj, p)
        return obj

    def names(self, obj: Any) -> List[str]:
        if isinstance(obj, _AppView):
            return obj.names()
        try:
            names = dir(obj)
        except Exception:                            # noqa: BLE001
            return []
        if obj is self.em and "graph" not in names:
            names = [*names, "graph"]                # PEP 562: ``em.graph`` is the host's
        return [n for n in names if not (n.startswith("__") and n.endswith("__"))]

    def item(self, obj: Any, name: str, text: str) -> Dict[str, Any]:
        st = self.static(obj, name)
        kind = _kind_of(st)
        value = None
        if kind not in ("property",) and not isinstance(st, _asks):
            try:
                value = self.step(obj, name)
                kind = _kind_of(st if st is not None else value, value)
            except BaseException:                    # noqa: BLE001 — an attribute that raises, or asks
                pass
        callable_ = kind in ("function", "method", "class")
        src = st if isinstance(st, property) else value if value is not None else st
        doc = _first_line(getattr(src, "__doc__", None)) if src is not None else ""
        if kind in ("value",) and value is not None and type(value).__doc__ == getattr(value, "__doc__", None):
            doc = type(value).__name__
        return {"text": text + ("(" if callable_ else ""), "kind": kind, "label": name, **({"detail": doc} if doc else {})}


def _signature(obj: Any, name: str) -> Optional[Dict[str, Any]]:
    import inspect
    target = obj._app if isinstance(obj, _AppView) else obj
    try:
        sg = inspect.signature(target)
        ann = lambda a: a if isinstance(a, str) else getattr(a, "__name__", None) or str(a)  # noqa: E731
        parts, star = [], False
        for p in sg.parameters.values():
            if p.kind is p.KEYWORD_ONLY and not star:
                parts.append("*")
                star = True
            if p.kind is p.VAR_POSITIONAL:
                star = True
            pre = "*" if p.kind is p.VAR_POSITIONAL else "**" if p.kind is p.VAR_KEYWORD else ""
            txt = pre + p.name + (f": {ann(p.annotation)}" if p.annotation is not p.empty else "")
            if p.default is not p.empty:
                txt += f" = {p.default!r}"
            parts.append(txt)
        sig = f"({', '.join(parts)})" + (f" -> {ann(sg.return_annotation)}" if sg.return_annotation is not sg.empty else "")
    except (TypeError, ValueError):
        sig = "(…)"
    doc = _first_line(getattr(target, "__doc__", None))
    if inspect.isclass(target) and not doc:
        doc = _first_line(getattr(target.__init__, "__doc__", None))
    return {"name": name, "text": f"{name.rsplit('.', 1)[-1]}{sig}", "doc": doc}


def _param_text(p: Dict[str, Any]) -> str:
    def py(v: Any) -> str:
        return "None" if v is None else "True" if v is True else "False" if v is False else json.dumps(v) if isinstance(v, str) else str(v)
    t = f"Literal[{', '.join(json.dumps(c) for c in p.get('choices') or [])}]" if p.get("type") == "enum" else str(p.get("type") or "")
    return f"{p.get('name')}: {t}" if p.get("required") else f"{p.get('name')}: {t} = {py(p.get('default'))}"


def _command_signature(c: Dict[str, Any]) -> Dict[str, Any]:
    params = [_param_text(p) for p in c.get("params") or []]
    return {"name": f"commands.run({c.get('id')!r})",
            "text": f"run({', '.join([json.dumps(c.get('id'))] + params)})",
            "doc": _first_line(c.get("doc"))}


def _open_call(text: str) -> Optional[Tuple[str, str]]:
    """The callee of the innermost call still open at the end of ``text`` and
    the text of its arguments so far (strings and brackets respected)."""
    depth_stack: List[int] = []
    quote: Optional[str] = None
    i = 0
    while i < len(text):
        c = text[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'":
            quote = c
        elif c in "([{":
            depth_stack.append(i)
        elif c in ")]}":
            if depth_stack:
                depth_stack.pop()
        i += 1
    while depth_stack:
        at = depth_stack.pop()
        if text[at] != "(":
            continue
        m = re.search(r"([A-Za-z_][\w\.]*)\s*$", text[:at])
        if m:
            return m.group(1), text[at + 1:]
        return None
    return None


def _call_args(args: str) -> Tuple[List[str], Optional[str]]:
    """The positional string literals given so far, and the keyword being
    typed (``epoch="…`` → ``epoch``)."""
    positional = re.findall(r"""^\s*(["'])([^"']*)\1\s*,""", args)
    kw = re.search(r"""(\w+)\s*=\s*["'][^"']*$""", args)
    return [p[1] for p in positional], (kw.group(1) if kw else None)


def _domain(s: "Session", what: str) -> List[Tuple[str, str]]:
    """The values of a domain, each with what it is (shown beside it)."""
    nodes = [n for n in getattr(s.graph, "nodes", []) or []]
    if what == "nodes":
        out = []
        for n in nodes:
            out.append((str(n.node_id), str(getattr(n, "node_type", "") or "")))
            name = str(getattr(n, "name", "") or "")
            if name and name != str(n.node_id):
                out.append((name, str(getattr(n, "node_type", "") or "")))
        return out
    if what == "types":
        return sorted({(str(getattr(n, "node_type", "") or ""), "type") for n in nodes if getattr(n, "node_type", None)})
    if what == "edge_types":
        return sorted({(str(getattr(e, "edge_type", "") or ""), "edge") for e in getattr(s.graph, "edges", []) or []
                       if getattr(e, "edge_type", None)})
    if what == "epochs":
        out = []
        for n in nodes:
            if getattr(n, "node_type", "") == "EpochNode":
                out.append((str(getattr(n, "name", "") or n.node_id), "epoch"))
        return out
    return []


def complete_rich(s: Session, text: str, limit: int = 200) -> Dict[str, Any]:
    """What may follow ``text`` (the console's line up to the cursor, or the
    editor's text up to it): ``items`` [{text, kind, label, detail?}],
    ``signature`` {name, text, doc} when a call is open, ``tail`` — the part
    of ``text`` the items replace."""
    commands = {str(c.get("id")): c for c in s.commands}
    call = _open_call(text)
    m = _STRING_TAIL.search(text)
    in_string = bool(m and text.count(m.group(1)) % 2 == 1)
    out: Dict[str, Any] = {"items": [], "tail": ""}
    sig_of_call: Optional[Dict[str, Any]] = None
    res = _Resolver(s)
    if call:
        callee, args = call
        given, _kw = _call_args(args)
        if callee.endswith("commands.run") and given and given[0] in commands:
            sig_of_call = _command_signature(commands[given[0]])
        else:
            try:
                sig_of_call = _signature(res.resolve(callee), callee)
            except BaseException:                    # noqa: BLE001 — nothing to say
                sig_of_call = None
    if in_string:
        part = m.group(2)
        out["tail"] = part
        domain: List[Tuple[str, str]] = []
        if call:
            callee, args = call
            given, kw = _call_args(args)
            head = args[: len(args) - len(part) - 1].strip()
            first_arg = head == "" and kw is None
            if callee.endswith("commands.run") and first_arg:
                domain = [(cid, str(c.get("label") or _first_line(c.get("doc")) or c.get("kind") or ""))
                          for cid, c in commands.items()]
            elif callee.endswith("commands.run") and kw and given and given[0] in commands:
                p = next((p for p in commands[given[0]].get("params") or [] if p.get("name") == kw), None)
                if p and p.get("choices"):
                    domain = [(str(c), "choice") for c in p["choices"]]
                elif kw in ("epoch",):
                    domain = _domain(s, "epochs")
                elif kw in ("type",):
                    domain = _domain(s, "types")
                elif kw in ("edge_type",):
                    domain = _domain(s, "edge_types")
                else:
                    domain = _domain(s, "nodes")
            elif kw == "type" or (first_arg and callee.split(".")[-1] == "nodes"):
                domain = _domain(s, "types")
            elif kw in ("edge_type",) or (callee.split(".")[-1] == "edges" and kw == "type"):
                domain = _domain(s, "edge_types")
            elif kw in ("epoch",) or callee.split(".")[-1] in ("set_epoch",):
                domain = _domain(s, "epochs")
            elif callee.split(".")[-1] == "view":
                domain = [(v, "view") for v in VIEWS]
            elif callee.split(".")[-1] == "open" and callee.endswith("windows.open"):
                domain = [(v, "window") for v in VIEWS]
            else:
                domain = _domain(s, "nodes")
        else:
            domain = _domain(s, "nodes")
            try:
                for q in (getattr(s.overlay(), "qualia", None) or {}):
                    domain.append((str(q), "quale"))
            except Exception:                        # noqa: BLE001 — no packages
                pass
        seen = set()
        for v, what in domain:
            if v and v.startswith(part) and v not in seen:
                seen.add(v)
                out["items"].append({"text": v, "kind": "string", "label": v, **({"detail": what} if what else {})})
        out["items"].sort(key=lambda x: x["text"])
        out["items"] = out["items"][:limit]
        if sig_of_call:
            out["signature"] = sig_of_call
        return out
    word = _NAME_TAIL.search(text).group(0)
    out["tail"] = word
    # inside commands.run("open", |  → the command's own params
    if call and not word:
        callee, args = call
        given, _kw = _call_args(args)
        if callee.endswith("commands.run") and given and given[0] in commands:
            used = set(re.findall(r"(\w+)\s*=", args))
            for p in commands[given[0]].get("params") or []:
                if p.get("name") not in used:
                    out["items"].append({"text": f"{p['name']}=", "kind": "param", "label": _param_text(p),
                                         **({"detail": _first_line(p.get("doc"))} if p.get("doc") else {})})
        if sig_of_call:
            out["signature"] = sig_of_call
        return out
    if "." in word:
        base, _, prefix = word.rpartition(".")
        try:
            obj = res.resolve(base)
        except BaseException:                        # noqa: BLE001 — not a name the session has, or it asks
            obj = None
        if obj is not None:
            names = [n for n in res.names(obj) if n.startswith(prefix) and (prefix.startswith("_") or not n.startswith("_"))]
            for n in sorted(names)[:limit]:
                out["items"].append(res.item(obj, n, f"{base}.{n}"))
    else:
        import keyword
        pool = set(res.ns) | {"g", "sel"} | set(dir(builtins)) | set(keyword.kwlist)
        for n in sorted(x for x in pool if x.startswith(word) and (word.startswith("_") or not x.startswith("_")))[:limit]:
            if n in keyword.kwlist:
                out["items"].append({"text": n, "kind": "keyword", "label": n})
            elif n in res.ns or n in ("g", "sel"):
                v = res.root(n)
                k = "value" if isinstance(v, _AppView) else _kind_of(v, v)
                out["items"].append({"text": n + ("(" if k in ("function", "class", "method") else ""), "kind": k, "label": n})
            else:
                v = getattr(builtins, n)
                k = _kind_of(v, v)
                out["items"].append({"text": n + ("(" if k in ("function", "class", "method") else ""), "kind": k, "label": n})
    if sig_of_call and not out["items"]:
        out["signature"] = sig_of_call
    elif sig_of_call and text.rstrip().endswith("("):
        out["signature"] = sig_of_call
    return out


def complete(s: Session, text: str, limit: int = 100) -> List[str]:
    """The texts of :func:`complete_rich` (the answer of before, kept for an
    older page)."""
    return [i["text"] for i in complete_rich(s, text, limit)["items"]][:limit]


__all__ = ["LEVEL", "ROUTES", "HOST", "plugins_now", "history_path", "read_history", "add_history", "proof_of", "TOKEN_ENV", "take_token", "has_token", "gate", "post",
           "complete", "complete_rich", "code_record", "console_caller", "Session", "Run", "EMStudioHost",
           "EMStudioApp", "WORDS"]
