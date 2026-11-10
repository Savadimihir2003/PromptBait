"""Local attacker-content staging server.

Attack pages are served from ``127.0.0.1`` on an ephemeral port. There is
deliberately no host parameter: the server cannot be pointed at a non-local
interface, so the red-team suite can never touch a third-party target.
"""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote, urlsplit

_LOCALHOST = "127.0.0.1"


class AttackServer:
    """Serve a fixed ``{name: body}`` mapping as ``GET /<name>`` on localhost."""

    def __init__(self, pages: dict[str, str]) -> None:
        self._pages = dict(pages)
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._base_url: str | None = None

    # ------------------------------------------------------------ lifecycle

    def start(self) -> str:
        """Start serving and return ``http://127.0.0.1:<port>``. Idempotent."""
        if self._base_url is not None:
            return self._base_url

        handler = _make_handler(self._pages)
        # Port 0 asks the OS for a free port, which is the port-fallback
        # strategy: two servers (or a stale process) can never collide.
        server = ThreadingHTTPServer((_LOCALHOST, 0), handler)
        server.daemon_threads = True
        thread = threading.Thread(
            target=server.serve_forever,
            name="promptbait-attack-server",
            daemon=True,
        )
        thread.start()

        self._server = server
        self._thread = thread
        self._base_url = f"http://{_LOCALHOST}:{server.server_address[1]}"
        return self._base_url

    def stop(self) -> None:
        """Stop serving and release the port. Safe to call twice."""
        if self._server is None:
            return
        self._server.shutdown()
        self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5.0)
        self._server = None
        self._thread = None
        self._base_url = None

    def url(self, name: str) -> str:
        """Absolute URL for one page; assumes the server is running."""
        if self._base_url is None:
            raise RuntimeError("AttackServer not started; call start() first")
        return f"{self._base_url}/{quote(name, safe='/')}"

    # -------------------------------------------------------- context manager

    def __enter__(self) -> AttackServer:
        self.start()
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.stop()


def _make_handler(pages: dict[str, str]) -> type[BaseHTTPRequestHandler]:
    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - stdlib naming
            name = unquote(urlsplit(self.path).path.lstrip("/"))
            body = pages.get(name)
            if body is None:
                self.send_error(404, "unknown attack page")
                return
            encoded = body.encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *args: object) -> None:
            pass  # keep test and suite output clean

    return _Handler
