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
POST /py/complete {session, text}            → {ok, matches}
POST /py/events   {session, revision, ack?, doc?, event, payload}
                  → the run's answer, or {status: "none"} with no listener
POST /py/close    {session}

A run's answer: ``{ok, run, status: done|waiting|running|error|refused|cancelled,
output, value?, error?, messages?, steps: [{label, delta, process, dtc, ids,
volatile}], app_requests: [...], waiting?, listeners}``. Each step is ONE
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
LEVEL = 81
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

ROUTES = ("/py/session", "/py/run", "/py/resume", "/py/complete", "/py/events", "/py/close")

#: the views ``em.app.view`` may ask for: EMStudio's window types (``WindowType``,
#: frontend/src/workspace.ts; ``scene`` is the Space)
VIEWS = ("graph", "narrative", "table", "emtree", "outliner", "inspector", "viewer",
         "storage", "shelf", "study", "narrative-index", "chronology", "scene", "sheet")

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
        return {k: len(v) for k, v in self.listeners.items()}


_sessions: Dict[str, Session] = {}
_lock = threading.Lock()          # the sessions' table
_active: Optional["Run"] = None   # the one run that may be alive
_run_ids = itertools.count(1)


# ── the host ────────────────────────────────────────────────────────────────

class EMStudioApp:
    """``em.app`` in EMStudio: each call is a REQUEST the page executes in order."""

    def __init__(self, run: "Run"):
        self._run = run

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
        return []                                    # the plugins' commands: W14

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
                 event: Optional[Tuple[str, Dict[str, Any]]] = None, dry_run: bool = False):
        self.id = f"r{next(_run_ids)}-{uuid.uuid4().hex[:6]}"
        self.session = session
        self.code = code
        self.event = event
        self.dry_run = dry_run
        self.status = "running"
        self.output: List[str] = []
        self._out_len = 0
        self.value: Optional[str] = None
        self.error: Optional[str] = None
        self.messages: Optional[Dict[str, str]] = None
        self.steps: List[Dict[str, Any]] = []
        self._steps_sent = 0
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
        s = self.session
        previous_listeners = em.events._listeners
        host = EMStudioHost(self)
        _capture(self._write)
        previous_host = em.host._current
        em.host.install(host)
        em.events._listeners = s.listeners
        status = "done"
        try:
            if self.event is not None:
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
        out = "".join(self.output)
        self.output = []
        if new_steps:
            # the page applies them, then says its revision (``ack``)
            self.session.pending = self.id
        payload: Dict[str, Any] = {
            "ok": self.status not in ("error", "refused", "cancelled"),
            "run": self.id, "status": self.status, "output": out, "steps": new_steps,
            "app_requests": new_requests, "listeners": self.session.listener_counts(),
            "revision": self.session.revision}
        if self.value is not None and self.status == "done":
            payload["value"] = self.value
        if self.waiting is not None:
            payload["waiting"] = self.waiting
        if self.error:
            payload["error"] = self.error
        if self.messages:
            payload["messages"] = self.messages
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
        if value is not None:
            ns["_"] = value
            return repr(value)
    return None


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


def open_session(body: Dict[str, Any], maps: Callable, changes: Callable) -> Tuple[int, Dict[str, Any]]:
    em = _em()
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
            return 200, {"ok": True, "matches": complete(s, str(body.get("text") or ""))}
        if route == "/py/resume":
            with _lock:
                s = _sessions.get(str(body.get("session") or ""))
            run = s.runs.get(str(body.get("run") or "")) if s else None
            if s is None or run is None:
                return 404, _err("no_run", (s.lang if s else None), run=body.get("run") or "—")
            if "answer" in body:
                run.answer(body.get("answer"))
            return 200, run.answer_now()
        if route in ("/py/run", "/py/events"):
            s, refused = _session(body)
            if refused:
                return refused
            busy = _busy(s)
            if busy:
                return busy
            if route == "/py/run":
                return _start(s, Run(s, code=str(body.get("code") or ""), dry_run=bool(body.get("dry_run"))))
            event = str(body.get("event") or "")
            if event not in s.listeners:
                return 400, _err("unknown_event", s.lang, event=event)
            if not s.listeners[event]:
                return 200, {"ok": True, "status": "none", "listeners": s.listener_counts(),
                             "revision": s.revision}
            payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
            return _start(s, Run(s, event=(event, payload)))
    except ValueError as exc:
        return 400, {"ok": False, "error": str(exc)}
    return 404, {"ok": False, "error": "unknown /py route"}


# ── completion ──────────────────────────────────────────────────────────────

_NAME_TAIL = re.compile(r"[A-Za-z_][\w\.]*$|$")
_STRING_TAIL = re.compile(r"""(["'])([^"']*)$""")


def complete(s: Session, text: str, limit: int = 100) -> List[str]:
    """What may follow ``text``: inside an open string, the ids and names of
    the nodes and the package's qualia; else the names of the session
    (``rlcompleter``: em, g, what the console defined, their attributes)."""
    m = _STRING_TAIL.search(text)
    if m and text.count(m.group(1)) % 2 == 1:
        part = m.group(2)
        out: List[str] = []
        seen = set()
        for n in getattr(s.graph, "nodes", []) or []:
            for v in (str(n.node_id), str(getattr(n, "name", "") or "")):
                if v and v.startswith(part) and v not in seen:
                    seen.add(v)
                    out.append(v)
        try:
            ov = s.overlay()
            for q in (getattr(ov, "qualia", None) or {}):
                q = str(q)
                if q.startswith(part) and q not in seen:
                    seen.add(q)
                    out.append(q)
        except Exception:                            # noqa: BLE001 — no packages
            pass
        return sorted(out)[:limit]
    import rlcompleter
    word = _NAME_TAIL.search(text).group(0)
    ns = dict(s.ns)
    em = _em()
    ns.setdefault("em", em)
    completer = rlcompleter.Completer(ns)
    out = []
    for i in itertools.count():
        try:
            c = completer.complete(word, i)
        except Exception:                            # noqa: BLE001 — an attribute that raises
            break
        if c is None or len(out) >= limit:
            break
        if c not in out:
            out.append(c)
    return out


__all__ = ["LEVEL", "ROUTES", "TOKEN_ENV", "take_token", "has_token", "gate", "post",
           "complete", "code_record", "console_caller", "Session", "Run", "EMStudioHost",
           "EMStudioApp", "WORDS"]
