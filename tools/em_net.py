"""MICRO-BRIDGE-CERTIFICATI · the bridge's door to HTTPS: one context, one reason.

Every request the bridge makes over the network — the globe's tiles, the globe
minimum, «Estrai area», a room's assets on a node, the LLM provider — opens its
connection through ``urlopen`` here, with the context ``ssl_context`` builds.

WHY, measured on E.D.'s installed app (dev.62, 23 Oct 2026): the frozen bridge
is a python.org 3.12 interpreter packed by PyInstaller on a CI runner, and that
interpreter looks for its certificates where ITS installer would have put them
(``/Library/Frameworks/Python.framework/…/etc/openssl/cert.pem``, and the
``Install Certificates.command`` the person never ran). On the person's Mac
there is nothing there: every HTTPS answer is ``CERTIFICATE_VERIFY_FAILED``,
the globe stays white, and the bridge said only ``URLError``. certifi WAS in
the binary (pyproj depends on it); urllib simply does not read it unless told.

So the context is the interpreter's default (its own paths, ``SSL_CERT_FILE``
and ``SSL_CERT_DIR`` when the person set them: nothing that works today stops
working) PLUS certifi's Mozilla bundle, which travels in the binary on macOS
and Windows alike. The system trust store (a company's proxy CA in the
Keychain) is not read: ``truststore`` would do it, but it is one more native
dependency in the sidecar for a case nobody has met yet — the report says so.

``install_default()`` makes the same context the default of every ``urllib``
call in the process, the library's (s3dgraphy's room import) included, so a
request that does not come through ``urlopen`` here is not left without
certificates either. ``frontend/scripts/check-bridge-tls.mjs`` fails when a
``urlopen`` in tools/ bypasses this module.
"""
from __future__ import annotations

import socket
import ssl
import threading
import urllib.error
import urllib.request

_CTX = None
_LOCK = threading.Lock()


def ca_file() -> "str | None":
    """certifi's bundle, if certifi is there (it is in the packaged bridge: the
    build refuses to freeze without it)."""
    try:
        import certifi
        return certifi.where()
    except Exception:  # noqa: BLE001 — a dev interpreter without certifi
        return None


def new_context() -> ssl.SSLContext:
    """A verifying client context: the interpreter's defaults and certifi's CAs."""
    ctx = ssl.create_default_context()
    ca = ca_file()
    if ca:
        try:
            ctx.load_verify_locations(cafile=ca)
        except (OSError, ssl.SSLError):
            pass
    return ctx


def ssl_context() -> ssl.SSLContext:
    """The bridge's context, built once (a context is safe to share between threads)."""
    global _CTX
    if _CTX is None:
        with _LOCK:
            if _CTX is None:
                _CTX = new_context()
    return _CTX


def urlopen(req, timeout=20):
    """``urllib.request.urlopen`` with the bridge's certificates — the only way
    tools/ open a URL."""
    return urllib.request.urlopen(req, timeout=timeout, context=ssl_context())


def install_default() -> None:
    """Every ``urllib``/``http.client`` connection opened without a context in
    this process gets one with certifi's CAs (a fresh one each time: http.client
    sets ALPN on the context it is given)."""
    ssl._create_default_https_context = new_context  # noqa: SLF001 — the documented hook (PEP 476)


def reason(exc: BaseException) -> str:
    """Why a request failed, in words a person can act on (ASCII: it travels in
    an HTTP header). ``URLError`` alone says nothing."""
    inner = exc.reason if isinstance(exc, urllib.error.URLError) and not isinstance(exc, urllib.error.HTTPError) else exc
    if isinstance(exc, urllib.error.HTTPError):
        return f"HTTP {exc.code}"
    if isinstance(inner, ssl.SSLCertVerificationError):
        why = getattr(inner, "verify_message", "") or "CERTIFICATE_VERIFY_FAILED"
        return f"certificate not verifiable ({why})"
    if isinstance(inner, ssl.SSLError):
        return f"TLS error ({getattr(inner, 'reason', None) or inner})"
    if isinstance(inner, socket.gaierror):
        return "host not found (offline, or no DNS)"
    if isinstance(inner, (socket.timeout, TimeoutError)):
        return "timed out"
    if isinstance(inner, ConnectionRefusedError):
        return "connection refused"
    if isinstance(inner, ConnectionResetError):
        return "connection reset"
    text = str(inner) or type(inner).__name__
    return f"{type(exc).__name__}: {text}".encode("ascii", "replace").decode("ascii")[:200]
