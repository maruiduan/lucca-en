#!/usr/bin/env python3
"""Upload stamped dist/ to Aliyun OSS. Credentials: OSS_ACCESS_KEY_ID/SECRET env.
HTML/robots/sitemap → no-cache; name.<8hex>.ext and mp3 → immutable year.
Never deletes old objects.

PutObject replaces object metadata. Security headers already stored on HTML,
robots.txt, and sitemap.xml are sent again via x-oss-persistent-headers.
JS, CSS, and media stay cache-only, matching the live objects.
"""
from __future__ import annotations
import base64, mimetypes, os, re, sys
from pathlib import Path

HASHED = re.compile(r"\.[0-9a-f]{8}\.[A-Za-z0-9]+$")
NOCACHE = {"index.html", "robots.txt", "sitemap.xml", "stamp-manifest.json", "favicon.ico", "favicon.svg"}

def ctype(path: Path) -> str:
    types = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
             ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
             ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
             ".mp3": "audio/mpeg", ".ico": "image/x-icon"}
    return types.get(path.suffix.lower()) or (mimetypes.guess_type(path.name)[0] or "application/octet-stream")

def cache_for(rel: str) -> str:
    name = Path(rel).name
    if HASHED.search(name) or Path(name).suffix.lower() in {".mp3", ".woff2", ".woff"}:
        return "public, max-age=31536000, immutable"
    if name in NOCACHE or rel.endswith(".html"):
        return "no-cache, must-revalidate"
    return "no-cache, must-revalidate"

# Live headers from 2026-10-24, with two recording exceptions:
# microphone=(self) so lesson.js can call getUserMedia({audio});
# media-src includes blob: so new Audio(blob:) can play the take back.
# Camera and geolocation stay off. hm.baidu.com stays out (no Tongji site id).
CSP = (
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; "
    "img-src 'self' data: https:; font-src 'self' data:; "
    "media-src 'self' blob:; "
    "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; "
    "connect-src 'self'; form-action 'self'"
)
PERMISSIONS = "geolocation=(), microphone=(self), camera=()"
COMMON_SECURITY = (
    ("Permissions-Policy", PERMISSIONS),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ("Strict-Transport-Security", "max-age=31536000; includeSubDomains"),
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "SAMEORIGIN"),
)

def security_pairs(rel: str) -> list[tuple[str, str]] | None:
    name = Path(rel).name
    if not (rel.endswith(".html") or name in {"robots.txt", "sitemap.xml"}):
        return None
    pairs = list(COMMON_SECURITY)
    if rel.endswith(".html"):
        pairs.insert(0, ("Content-Security-Policy", CSP))
    return pairs

def persistent_header(pairs: list[tuple[str, str]]) -> str:
    parts = []
    for key, value in pairs:
        if (not key or key.lower().startswith("x-oss-") or ":" in key or "," in key
                or "\n" in value or "\r" in value):
            raise ValueError(f"bad persistent header: {key}")
        enc = base64.b64encode(value.encode("utf-8")).decode("ascii")
        parts.append(f"{key}:{enc}")
    return ",".join(parts)

def object_headers(rel: str, path: Path | None = None) -> dict[str, str]:
    headers = {"Content-Type": ctype(path or Path(rel)), "Cache-Control": cache_for(rel)}
    pairs = security_pairs(rel)
    if pairs:
        headers["x-oss-persistent-headers"] = persistent_header(pairs)
    return headers

def _decode_persistent(raw: str) -> dict[str, str]:
    out = {}
    for part in raw.split(","):
        key, enc = part.split(":", 1)
        out[key] = base64.b64decode(enc).decode("utf-8")
    return out

def _self_check() -> None:
    html = _decode_persistent(object_headers("jobs/index.html")["x-oss-persistent-headers"])
    plain = _decode_persistent(object_headers("robots.txt")["x-oss-persistent-headers"])
    site = _decode_persistent(object_headers("sitemap.xml")["x-oss-persistent-headers"])
    assert html["Content-Security-Policy"] == CSP
    assert "media-src 'self' blob:" in html["Content-Security-Policy"]
    assert "hm.baidu.com" not in html["Content-Security-Policy"]
    assert "'unsafe-inline'" in html["Content-Security-Policy"]
    assert html["Permissions-Policy"] == PERMISSIONS
    assert "microphone=(self)" in html["Permissions-Policy"]
    assert "microphone=()" not in html["Permissions-Policy"]
    assert "camera=()" in html["Permissions-Policy"]
    assert "geolocation=()" in html["Permissions-Policy"]
    for key, value in COMMON_SECURITY:
        assert html[key] == value and plain[key] == value and site[key] == value
    assert "Content-Security-Policy" not in plain and "Content-Security-Policy" not in site
    js = object_headers("assets/core.deadbeef.js")
    mp3 = object_headers("media/jobs-2005.mp3")
    assert "x-oss-persistent-headers" not in js and "x-oss-persistent-headers" not in mp3
    assert js["Cache-Control"].endswith("immutable") and mp3["Cache-Control"].endswith("immutable")
    assert object_headers("index.html")["Cache-Control"] == "no-cache, must-revalidate"
    print("upload header self-check ok")

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: upload_oss.py DIST bucket-name")
    dist, bucket_name = Path(sys.argv[1]), sys.argv[2]
    ak = os.environ.get("OSS_ACCESS_KEY_ID") or ""
    sk = os.environ.get("OSS_ACCESS_KEY_SECRET") or ""
    if not ak or not sk:
        raise SystemExit("OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET required")
    endpoint = os.environ.get("OSS_ENDPOINT", "https://oss-cn-hongkong.aliyuncs.com")
    import oss2
    b = oss2.Bucket(oss2.Auth(ak, sk), endpoint, bucket_name)
    files = sorted(p for p in dist.rglob("*") if p.is_file() and p.name != "stamp-manifest.json")
    assets, entries = [], []
    for p in files:
        rel = p.relative_to(dist).as_posix()
        (entries if rel.endswith(".html") or Path(rel).name in {"robots.txt", "sitemap.xml"} else assets).append((rel, p))
    for rel, p in assets + entries:
        headers = object_headers(rel, p)
        b.put_object_from_file(rel, str(p), headers=headers)
        print("put", rel, headers["Cache-Control"], "security" if "x-oss-persistent-headers" in headers else "cache-only")
    print(f"Published {len(files)} objects to {bucket_name}")

if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--check":
        _self_check()
    else:
        main()
