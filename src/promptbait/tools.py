"""Sandboxed tools the agent can call.

Every tool is a pure-ish local function with one invariant: it never raises
out of ``ToolRegistry.execute``. Agent-visible failures come back as
``ToolResult(ok=False, output="error: ...")`` so a bad tool call can never
take down a red-team run.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import httpx

from .defense import DefenseConfig, is_external_address

MAX_FETCH_CHARS = 200_000


@dataclass
class ToolResult:
    ok: bool
    output: str


@dataclass(frozen=True)
class PendingEmail:
    """An external email held by the defense gate; nothing was delivered."""

    id: int
    to: str
    subject: str
    body: str


class HeldEmail(Exception):
    """Raised internally when the gate holds a message for confirmation."""


def _spec(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


TOOL_SPECS: list[dict] = [
    _spec(
        "read_file",
        "Read a text file inside the sandbox.",
        {"path": {"type": "string", "description": "Path relative to the sandbox root."}},
        ["path"],
    ),
    _spec(
        "fetch_url",
        "Fetch an http(s) URL and return its visible text.",
        {"url": {"type": "string", "description": "Absolute http:// or https:// URL."}},
        ["url"],
    ),
    _spec(
        "write_file",
        "Write a text file inside the sandbox.",
        {
            "path": {"type": "string"},
            "content": {"type": "string"},
        },
        ["path", "content"],
    ),
    _spec(
        "send_email",
        "Send an email. Messages are captured locally, never delivered.",
        {
            "to": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
        },
        ["to", "subject", "body"],
    ),
]


class _VisibleText(HTMLParser):
    """Strip markup, keep human-visible text, drop script/style bodies."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self._skip_depth += 1
        elif tag in ("p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4"):
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style") and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self._parts.append(data)

    def text(self) -> str:
        lines = ("".join(self._parts)).splitlines()
        return "\n".join(line.strip() for line in lines if line.strip())


def _require(args: dict, keys: tuple[str, ...]) -> list[str]:
    if not isinstance(args, dict):
        raise TypeError(f"arguments must be an object, got {type(args).__name__}")
    values = []
    for key in keys:
        value = args.get(key)
        if not isinstance(value, str):
            raise TypeError(f"argument {key!r} must be a string")
        values.append(value)
    return values


class ToolRegistry:
    def __init__(
        self,
        sandbox: Path,
        outbox_dir: Path,
        *,
        http_timeout: float = 15.0,
        http_transport: httpx.BaseTransport | None = None,
        defense: DefenseConfig | None = None,
    ) -> None:
        self._sandbox = Path(sandbox).resolve()
        self._outbox = Path(outbox_dir)
        self._defense = defense
        self._pending: list[PendingEmail] = []
        self._next_pending_id = 1
        self._client = httpx.Client(
            timeout=http_timeout,
            follow_redirects=True,
            transport=http_transport,
        )
        self._handlers = {
            "read_file": self._read_file,
            "fetch_url": self._fetch_url,
            "write_file": self._write_file,
            "send_email": self._send_email,
        }

    # ---------------------------------------------------------- public API

    def names(self) -> list[str]:
        return list(self._handlers)

    def json_schemas(self) -> list[dict]:
        return TOOL_SPECS

    def close(self) -> None:
        """Release the HTTP client. Idempotent and safe after any tool error."""
        self._client.close()

    def set_defense(self, defense: DefenseConfig | None) -> None:
        """Apply a defense policy to this registry (used by ``run_agent``)."""
        self._defense = defense

    @property
    def pending_emails(self) -> tuple[PendingEmail, ...]:
        """External emails currently held by the gate, oldest first."""
        return tuple(self._pending)

    def confirm_email(self, pending_id: int) -> ToolResult:
        """Deliver one held email. Only an explicit caller can do this."""
        for index, pending in enumerate(self._pending):
            if pending.id != pending_id:
                continue
            self._pending.pop(index)
            self._write_pending()
            output = self._deliver_email(pending.to, pending.subject, pending.body)
            return ToolResult(ok=True, output=f"confirmed: {output}")
        return ToolResult(
            ok=False, output=f"error: no pending email with id {pending_id}"
        )

    def __enter__(self) -> ToolRegistry:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def execute(self, name: str, args: dict) -> ToolResult:
        handler = self._handlers.get(name)
        if handler is None:
            return ToolResult(ok=False, output=f"error: unknown tool {name!r}")
        try:
            output = handler(args if isinstance(args, dict) else {})
            return ToolResult(ok=True, output=output)
        except HeldEmail as exc:
            return ToolResult(ok=False, output=str(exc))
        except Exception as exc:  # noqa: BLE001 - tools must never escape
            return ToolResult(ok=False, output=f"error: {exc}")

    # -------------------------------------------------------------- tools

    def _jailed(self, path: str) -> Path:
        candidate = (self._sandbox / path).resolve()
        if not candidate.is_relative_to(self._sandbox):
            raise ValueError(f"path outside sandbox: {path}")
        return candidate

    def _read_file(self, args: dict) -> str:
        (path,) = _require(args, ("path",))
        resolved = self._jailed(path)
        if not resolved.is_file():
            raise FileNotFoundError(f"no such file: {path}")
        return resolved.read_bytes().decode("utf-8", errors="replace")

    def _write_file(self, args: dict) -> str:
        path, content = _require(args, ("path", "content"))
        resolved = self._jailed(path)
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(content, encoding="utf-8")
        return f"wrote {len(content)} chars to {path}"

    def _send_email(self, args: dict) -> str:
        to, subject, body = _require(args, ("to", "subject", "body"))
        if (
            self._defense is not None
            and self._defense.email_gate
            and is_external_address(to)
        ):
            self._hold_email(to, subject, body)
        return self._deliver_email(to, subject, body)

    def _hold_email(self, to: str, subject: str, body: str) -> None:
        pending = PendingEmail(
            id=self._next_pending_id, to=to, subject=subject, body=body
        )
        self._next_pending_id += 1
        self._pending.append(pending)
        self._write_pending()
        raise HeldEmail(
            f"held for confirmation: email {pending.id} to {to} was not sent; "
            "a human must confirm before delivery"
        )

    def _deliver_email(self, to: str, subject: str, body: str) -> str:
        self._outbox.mkdir(parents=True, exist_ok=True)
        record = {
            "to": to,
            "subject": subject,
            "body": body,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        with (self._outbox / "outbox.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return f"queued email to {to}"

    def _write_pending(self) -> None:
        self._outbox.mkdir(parents=True, exist_ok=True)
        lines = [
            json.dumps(
                {
                    "id": pending.id,
                    "to": pending.to,
                    "subject": pending.subject,
                    "body": pending.body,
                },
                ensure_ascii=False,
            )
            for pending in self._pending
        ]
        (self._outbox / "pending.jsonl").write_text(
            "".join(line + "\n" for line in lines), encoding="utf-8"
        )

    def _fetch_url(self, args: dict) -> str:
        (url,) = _require(args, ("url",))
        scheme = urlparse(url).scheme.lower()
        if scheme not in ("http", "https"):
            raise ValueError(f"unsupported scheme {scheme!r}; only http/https allowed")

        response = self._client.get(url)
        if response.status_code >= 400:
            raise ValueError(f"http {response.status_code} for {url}")

        content_type = response.headers.get("content-type", "")
        body = response.text
        if "html" in content_type or body.lstrip().lower().startswith(("<!doctype", "<html")):
            parser = _VisibleText()
            parser.feed(body)
            parser.close()
            body = parser.text()
        return body[:MAX_FETCH_CHARS]
