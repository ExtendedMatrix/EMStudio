"""MICRO-TIL03 (row T2 of the tileset plan) · the graph's heavy reads in a
process of their own, so the bridge's GIL stays free for the tiles.

Why: the bridge is ONE Python process (ThreadingHTTPServer). While a thread
loads a whole em.json (`api.load_emjson`, ~1.1 s on TempluMare v11) and asks
`api.geometry_summary`, it holds the GIL; the threads serving `/fs/at` ranges
of a .3tz get it back only at each switch interval, once per system call, and
a range that needs ~30 of them waits ~120–150 ms. Measured: 2000–3000 tiles/s
before, **9–42 tiles/s during** a `POST /geometry-summary` (MICRO-TIL01/02).

What: one worker process (spawn, `max_workers=1`), started when the bridge
starts and warmed (s3dgraphy imported there) in the background. The handler
sends the raw body, the worker parses, loads and computes, and gives back the
answer; the handler's thread waits on a pipe without the GIL.

Never worse than before: no worker (EM_BRIDGE_GRAPH_WORKER=0, a platform that
cannot spawn, a worker that died twice) → the same call in the bridge's own
process, as before this module.
"""
from __future__ import annotations

import json
import os
import sys
import threading

_LOCK = threading.Lock()
_POOL = None          # concurrent.futures.ProcessPoolExecutor | None
_BROKEN = 0           # times the worker died; after 2 the bridge computes inline
_PATHS: list = []     # sys.path entries the worker needs first (s3dgraphy's src)


class BadRequest(ValueError):
    """The body is not JSON: the handler answers 400, as before."""


# ── the worker's side ────────────────────────────────────────────────────────

def _watch_parent(parent: int) -> None:
    """The bridge killed hard (Tauri at exit, kill -9) leaves no one to close
    the pool: the worker goes away by itself when its parent is gone."""
    import time
    while True:
        time.sleep(1.0)
        if os.getppid() != parent:
            os._exit(0)


def _init(paths, parent=None):
    if parent:
        threading.Thread(target=_watch_parent, args=(parent,), daemon=True,
                         name="em-graphwork-parent").start()
    for p in reversed(paths or []):
        if p and p not in sys.path:
            sys.path.insert(0, p)
    from s3dgraphy import api  # noqa: F401 — warm: the first request pays nothing


def _warm():
    return os.getpid()


def geometry_summary_of(raw: bytes):
    """{doc} bytes → (summary, warnings). Runs in the worker, or inline."""
    try:
        doc = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise BadRequest(f"invalid JSON body: {exc}") from None
    from s3dgraphy import api
    graph, warnings = api.load_emjson(doc)
    return api.geometry_summary(graph), [str(w) for w in (warnings or [])]


# ── the bridge's side ────────────────────────────────────────────────────────

def enabled() -> bool:
    return os.environ.get("EM_BRIDGE_GRAPH_WORKER", "1").strip() not in ("0", "no", "off", "false")


def start(paths=None) -> None:
    """Start the worker and warm it, without waiting. Idempotent."""
    global _POOL, _PATHS
    if paths is not None:
        _PATHS = [str(p) for p in paths if p]
    if not enabled() or _BROKEN >= 2:
        return
    with _LOCK:
        if _POOL is not None:
            return
        try:
            import multiprocessing as mp
            from concurrent.futures import ProcessPoolExecutor
            _POOL = ProcessPoolExecutor(max_workers=1, mp_context=mp.get_context("spawn"),
                                        initializer=_init, initargs=(_PATHS, os.getpid()))
            _POOL.submit(_warm)
        except Exception as exc:  # pragma: no cover — a platform without spawn
            sys.stderr.write(f"  [bridge] graph worker unavailable ({exc}): inline\n")
            _POOL = None


def worker_pid():
    """The worker's pid, or None (for /health and the checks)."""
    pool = _POOL
    if pool is None:
        return None
    procs = getattr(pool, "_processes", None) or {}
    return next(iter(procs), None)


def stop() -> None:
    global _POOL
    with _LOCK:
        pool, _POOL = _POOL, None
    if pool is not None:
        pool.shutdown(wait=False, cancel_futures=True) if sys.version_info >= (3, 9) \
            else pool.shutdown(wait=False)


def run(fn, *args):
    """fn(*args) in the worker; inline when there is none. A worker that died
    is started again once; the second death leaves the bridge inline."""
    global _POOL, _BROKEN
    if _POOL is None:
        start()
    pool = _POOL
    if pool is None:
        return fn(*args)
    from concurrent.futures.process import BrokenProcessPool
    try:
        return pool.submit(fn, *args).result()
    except BrokenProcessPool:
        with _LOCK:
            if _POOL is pool:
                _POOL = None
            _BROKEN += 1
        sys.stderr.write(f"  [bridge] graph worker died ({_BROKEN}): "
                         + ("started again\n" if _BROKEN < 2 else "inline from now on\n"))
        return run(fn, *args) if _BROKEN < 2 else fn(*args)
