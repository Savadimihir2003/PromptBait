"""Offline tests for promptbait.tools — sandbox jail, HTML stripping, sinks.

RED phase of Task 3: promptbait.tools does not exist yet.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from promptbait.tools import TOOL_SPECS, ToolRegistry


def make_registry(
    tmp_path: Path,
    transport: httpx.BaseTransport | None = None,
    allowed_hosts: set[str] | None = None,
) -> ToolRegistry:
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir(exist_ok=True)
    return ToolRegistry(
        sandbox=sandbox,
        outbox_dir=tmp_path / ".outbox",
        http_transport=transport,
        allowed_hosts=allowed_hosts,
    )


def html_transport(body: str | bytes, status: int = 200) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if isinstance(body, bytes):
            return httpx.Response(status, content=body, headers={"content-type": "text/html; charset=utf-8"})
        return httpx.Response(status, text=body, headers={"content-type": "text/html; charset=utf-8"})

    return httpx.MockTransport(handler)


# ------------------------------------------------------------- registry shape


def test_tool_specs_expose_exactly_four_tools() -> None:
    assert [spec["function"]["name"] for spec in TOOL_SPECS] == [
        "read_file",
        "fetch_url",
        "write_file",
        "send_email",
    ]
    for spec in TOOL_SPECS:
        assert spec["type"] == "function"
        assert spec["function"]["parameters"]["type"] == "object"


def test_registry_names_match_specs(tmp_path: Path) -> None:
    registry = make_registry(tmp_path)
    assert registry.names() == [spec["function"]["name"] for spec in TOOL_SPECS]
    assert registry.json_schemas() == TOOL_SPECS


# --------------------------------------------------------------- read_file


def test_read_file_within_sandbox(tmp_path: Path) -> None:
    registry = make_registry(tmp_path)
    (tmp_path / "sandbox" / "notes.txt").write_text("hello notes", encoding="utf-8")
    result = registry.execute("read_file", {"path": "notes.txt"})
    assert result.ok is True
    assert result.output == "hello notes"


@pytest.mark.parametrize(
    "path",
    [
        "..\\..\\x.txt",
        "../../x.txt",
        "nested/../../x.txt",
        r"C:\Windows\system.ini",
        "/etc/passwd",
    ],
)
def test_read_file_rejects_escape(tmp_path: Path, path: str) -> None:
    registry = make_registry(tmp_path)
    result = registry.execute("read_file", {"path": path})
    assert result.ok is False
    assert "outside sandbox" in result.output


# -------------------------------------------------------------- write_file


def test_write_file_within_sandbox(tmp_path: Path) -> None:
    registry = make_registry(tmp_path)
    result = registry.execute("write_file", {"path": "sub/out.txt", "content": "content!"})
    assert result.ok is True
    assert (tmp_path / "sandbox" / "sub" / "out.txt").read_text(encoding="utf-8") == "content!"


def test_write_file_jailed_to_sandbox(tmp_path: Path) -> None:
    registry = make_registry(tmp_path)
    result = registry.execute("write_file", {"path": "../escape.txt", "content": "x"})
    assert result.ok is False
    assert "outside sandbox" in result.output
    assert not (tmp_path / "escape.txt").exists()


def test_write_file_preserves_lf_endings_on_windows(tmp_path: Path) -> None:
    """A text-mode write rewrote newlines, making seeded files look modified."""
    registry = make_registry(tmp_path)
    result = registry.execute(
        "write_file", {"path": "line-endings.txt", "content": "a\nb\n"}
    )
    assert result.ok is True
    assert (tmp_path / "sandbox" / "line-endings.txt").read_bytes() == b"a\nb\n"


# -------------------------------------------------------------- send_email


def test_send_email_appends_json_to_outbox(tmp_path: Path) -> None:
    registry = make_registry(tmp_path)
    first = registry.execute(
        "send_email", {"to": "a@b.c", "subject": "s1", "body": "b1"}
    )
    second = registry.execute(
        "send_email", {"to": "d@e.f", "subject": "s2", "body": "b2"}
    )
    assert first.ok is True and second.ok is True

    outbox = tmp_path / ".outbox" / "outbox.jsonl"
    lines = [json.loads(line) for line in outbox.read_text(encoding="utf-8").splitlines()]
    assert len(lines) == 2
    for record, (to, subject, body) in zip(lines, [("a@b.c", "s1", "b1"), ("d@e.f", "s2", "b2")]):
        assert set(record) == {"to", "subject", "body", "ts"}
        assert (record["to"], record["subject"], record["body"]) == (to, subject, body)


def test_send_email_stress_many_appends(tmp_path: Path) -> None:
    registry = make_registry(tmp_path)
    for i in range(50):
        assert registry.execute("send_email", {"to": f"{i}@x.y", "subject": "s", "body": "b"}).ok
    lines = (tmp_path / ".outbox" / "outbox.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 50


# ---------------------------------------------------------------- fetch_url


@pytest.mark.parametrize(
    "url",
    ["file:///C:/secret.txt", "javascript:alert(1)", "ftp://example.com/x", "mailto:a@b.c"],
)
def test_fetch_url_rejects_non_http(tmp_path: Path, url: str) -> None:
    registry = make_registry(tmp_path)
    result = registry.execute("fetch_url", {"url": url})
    assert result.ok is False
    assert "unsupported scheme" in result.output


def test_fetch_url_strips_html(tmp_path: Path) -> None:
    registry = make_registry(
        tmp_path,
        transport=html_transport(
            "<html><head><style>.x{}</style><script>alert('pwn')</script></head>"
            "<body onclick='x()'>SUMMARY MARKER<p>second line</p></body></html>"
        ),
    )
    result = registry.execute("fetch_url", {"url": "http://example.test/page"})
    assert result.ok is True
    assert "SUMMARY MARKER" in result.output
    assert "second line" in result.output
    assert "<" not in result.output
    assert "alert('pwn')" not in result.output


def test_fetch_url_survives_http_error(tmp_path: Path) -> None:
    registry = make_registry(tmp_path, transport=html_transport("boom", status=500))
    result = registry.execute("fetch_url", {"url": "http://example.test/page"})
    assert result.ok is False
    assert "500" in result.output


def test_fetch_url_caps_body_size(tmp_path: Path) -> None:
    huge = "A" * 300_000
    registry = make_registry(tmp_path, transport=html_transport(f"<body>{huge}</body>"))
    result = registry.execute("fetch_url", {"url": "http://example.test/page"})
    assert result.ok is True
    assert len(result.output) <= 200_000


# ------------------------------------------------------- egress allow-list


def test_fetch_url_allow_list_rejects_off_host(tmp_path: Path) -> None:
    registry = make_registry(
        tmp_path,
        transport=html_transport("should never be requested"),
        allowed_hosts={"127.0.0.1"},
    )
    result = registry.execute("fetch_url", {"url": "http://evil.test/exfil"})
    assert result.ok is False
    assert "allow" in result.output.lower() or "host" in result.output.lower()


def test_fetch_url_allow_list_permits_listed_host(tmp_path: Path) -> None:
    registry = make_registry(
        tmp_path,
        transport=html_transport("localhost page"),
        allowed_hosts={"127.0.0.1", "localhost"},
    )
    result = registry.execute("fetch_url", {"url": "http://127.0.0.1:8000/page"})
    assert result.ok is True
    assert "localhost page" in result.output


def test_fetch_url_allow_list_rejects_redirects(tmp_path: Path) -> None:
    """A redirect is an off-host hop even when the first host is allowed."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            302,
            headers={"location": "http://evil.test/exfil"},
        )

    registry = make_registry(
        tmp_path,
        transport=httpx.MockTransport(handler),
        allowed_hosts={"127.0.0.1"},
    )
    result = registry.execute("fetch_url", {"url": "http://127.0.0.1:8000/page"})
    assert result.ok is False
    assert "redirect" in result.output.lower()


def test_fetch_url_without_allow_list_still_follows_redirects(tmp_path: Path) -> None:
    """The allow-list is opt-in; the baseline tools keep their old behaviour."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "example.test":
            return httpx.Response(302, headers={"location": "http://other.test/final"})
        return httpx.Response(
            200, text="final page", headers={"content-type": "text/plain"}
        )

    registry = make_registry(tmp_path, transport=httpx.MockTransport(handler))
    result = registry.execute("fetch_url", {"url": "http://example.test/start"})
    assert result.ok is True
    assert "final page" in result.output


# ------------------------------------------------------ failure / edge paths


def test_unknown_tool_is_error(tmp_path: Path) -> None:
    result = make_registry(tmp_path).execute("launch_missiles", {})
    assert result.ok is False
    assert "unknown tool" in result.output


def test_registry_close_makes_network_tools_fail_gracefully(tmp_path: Path) -> None:
    registry = make_registry(tmp_path)
    registry.close()
    result = registry.execute("fetch_url", {"url": "http://example.test/page"})
    assert result.ok is False
    assert "closed" in result.output.lower()


def test_registry_is_a_context_manager(tmp_path: Path) -> None:
    with make_registry(tmp_path) as registry:
        assert registry.names()
        registry.close()  # must be idempotent inside the block too


@pytest.mark.parametrize(
    ("name", "args"),
    [
        ("read_file", {}),
        ("read_file", {"path": 123}),
        ("write_file", {"path": "a.txt"}),
        ("send_email", {"to": "a@b.c"}),
    ],
)
def test_execute_never_raises_on_bad_args(tmp_path: Path, name: str, args: dict) -> None:
    result = make_registry(tmp_path).execute(name, args)
    assert result.ok is False
    assert result.output.startswith("error:")


def test_file_tools_windows_edges(tmp_path: Path) -> None:
    registry = make_registry(tmp_path)
    weird = tmp_path / "sandbox" / "notes with spaces.txt"
    weird.write_bytes(b"line1\r\nline2")

    roundtrip = registry.execute("read_file", {"path": "notes with spaces.txt"})
    assert roundtrip.ok is True
    assert roundtrip.output == "line1\r\nline2"

    binary = tmp_path / "sandbox" / "broken.bin"
    binary.write_bytes(b"\xff\xfe\x00 broken")
    result = registry.execute("read_file", {"path": "broken.bin"})
    assert result.ok is True  # replacement chars are the graceful path
    assert "\ufffd" in result.output


def test_read_file_stress_one_megabyte(tmp_path: Path) -> None:
    registry = make_registry(tmp_path)
    blob = "x" * 1_000_000
    (tmp_path / "sandbox" / "big.txt").write_text(blob, encoding="utf-8")
    result = registry.execute("read_file", {"path": "big.txt"})
    assert result.ok is True
    assert len(result.output) == 1_000_000
