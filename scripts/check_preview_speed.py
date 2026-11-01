#!/usr/bin/env python3
"""Compare Thanaya's local and temporary-tunnel response times.

Read-only: makes unauthenticated GET requests to public storefront pages only.
Does not read customer records or change the database.

Usage:
  python3 scripts/check_preview_speed.py https://your-name.trycloudflare.com
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from statistics import median
import subprocess
from urllib.parse import urlsplit

LOCAL = "http://127.0.0.1:3000"
PATHS = ("/", "/login", "/api/health", "/api/products")
FORMAT = "%{http_code}|%{time_namelookup}|%{time_connect}|%{time_appconnect}|%{time_starttransfer}|%{time_total}|%{size_download}"

@dataclass(frozen=True)
class Sample:
    code: int
    dns: float
    connect: float
    tls: float
    first: float
    total: float
    size: int

def get(base: str, path: str, local: bool) -> Sample:
    args = ["curl", "--silent", "--show-error", "--location",
            "--connect-timeout", "8", "--max-time", "25",
            "--output", "/dev/null", "--write-out", FORMAT]
    if local:
        args += ["--noproxy", "*"]
    args += [base + path]
    done = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.strip() or "curl failed")
    fields = done.stdout.strip().split("|")
    if len(fields) != 7:
        raise RuntimeError("Unexpected timing output: " + done.stdout[:120])
    return Sample(int(fields[0]), *map(float, fields[1:6]), int(float(fields[6])))

def checked_base(raw: str) -> str:
    parsed = urlsplit(raw.strip().rstrip("/"))
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or
            parsed.password or parsed.query or parsed.fragment or parsed.path):
        raise ValueError("Give only the HTTPS root, e.g. https://example.trycloudflare.com")
    if not (parsed.hostname.endswith(".trycloudflare.com")):
        raise ValueError("This checker is restricted to temporary *.trycloudflare.com preview URLs.")
    return f"https://{parsed.netloc}"

def ms(sec: float) -> str:
    return f"{round(sec * 1000):>5}ms"

def show(label: str, values: list[Sample]) -> None:
    values = values[-2:]
    print(f"  {label:7} code={','.join(str(s.code) for s in values):>7}"
          f"   TTFB={ms(median(s.first for s in values))}"
          f"   total={ms(median(s.total for s in values))}"
          f"   bytes={values[-1].size}")

def main() -> int:
    parser = argparse.ArgumentParser(description="Time public Thanaya preview endpoints locally and through Cloudflare.")
    parser.add_argument("remote_url", help="Current https://...trycloudflare.com URL")
    args = parser.parse_args()
    try:
        remote = checked_base(args.remote_url)
    except ValueError as exc:
        parser.error(str(exc))

    print("Thanaya preview diagnostic (GET only, no credentials, no database changes)")
    print("Local: " + LOCAL + " | Remote: " + remote)
    print("Comparing two consecutive requests to each endpoint.")
    print("TTFB = time until first response byte; total = transfer completion.")
    failures = False
    for path in PATHS:
        print("\n" + path)
        for name, base, is_local in (("local", LOCAL, True), ("tunnel", remote, False)):
            measured = []
            for _ in range(2):
                try:
                    measured.append(get(base, path, is_local))
                except Exception as exc:
                    print(f"  {name:7} ERROR: {str(exc)[:180]}")
                    failures = True
                    break
            if measured:
                show(name, measured)
                if any(sample.code >= 400 for sample in measured):
                    failures = True
    print("\nInterpretation:")
    print("- If local is fast but tunnel slow: prioritize tunnel/network latency and bandwidth.")
    print("- If both are slow: inspect the Next.js / Express server, queries, and media sizes.")
    print("- 502/503 indicate an unavailable intermediary/origin during a request.")
    print("- Browser JS/font/image rendering can be slower than these HTML/API timing checks.")
    print("- A production deployment needs independent browser and load testing.")
    return 1 if failures else 0

if __name__ == "__main__":
    raise SystemExit(main())
