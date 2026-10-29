"""Small stdlib JSON client with per-host pacing and retries."""
from __future__ import annotations

import json
import logging
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Optional
from urllib.parse import urlparse

log = logging.getLogger(__name__)

# Seconds between requests per host, sized to each API's published free limits.
DEFAULT_PACING = {
    "api.dexscreener.com": 0.25,       # 300 req/min on pair endpoints
    "api.geckoterminal.com": 2.1,      # 30 req/min
    "api.rugcheck.xyz": 0.6,
    "trench.bot": 1.0,
    "api.mainnet-beta.solana.com": 0.15,
}


class HttpError(Exception):
    pass


class Http:
    def __init__(self, pacing: Optional[dict] = None, timeout: float = 15, retries: int = 3,
                 user_agent: str = "memedesk/0.1"):
        self.pacing = dict(DEFAULT_PACING, **(pacing or {}))
        self.timeout = timeout
        self.retries = retries
        self.user_agent = user_agent
        self._last: dict = {}
        self._lock = threading.Lock()

    def _wait(self, host: str) -> None:
        gap = self.pacing.get(host, 0.2)
        with self._lock:
            now = time.monotonic()
            ready = self._last.get(host, 0) + gap
            if ready > now:
                time.sleep(ready - now)
            self._last[host] = time.monotonic()

    def request(self, url: str, body: Any = None, headers: Optional[dict] = None) -> Any:
        host = urlparse(url).hostname or ""
        hdrs = {"User-Agent": self.user_agent, "Accept": "application/json"}
        hdrs.update(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            hdrs["Content-Type"] = "application/json"
        last_err: Optional[Exception] = None
        for attempt in range(self.retries):
            self._wait(host)
            try:
                req = urllib.request.Request(url, data=data, headers=hdrs)
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode() or "null")
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code == 404:
                    return None
                if e.code in (429, 500, 502, 503, 504):
                    time.sleep(2 ** attempt * (3 if e.code == 429 else 1))
                    continue
                raise HttpError(f"{url}: HTTP {e.code}") from e
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
                last_err = e
                time.sleep(2 ** attempt)
        raise HttpError(f"{url}: {last_err}")

    def get_json(self, url: str, headers: Optional[dict] = None) -> Any:
        return self.request(url, headers=headers)

    def post_json(self, url: str, body: Any, headers: Optional[dict] = None) -> Any:
        return self.request(url, body=body, headers=headers)


def num(v, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default
