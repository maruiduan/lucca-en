#!/usr/bin/env python3
"""Upload stamped dist/ to Aliyun OSS. Credentials: OSS_ACCESS_KEY_ID/SECRET env.
HTML/robots/sitemap → no-cache; name.<8hex>.ext and mp3 → immutable year.
Never deletes old objects.
"""
from __future__ import annotations
import mimetypes, os, re, sys
from pathlib import Path
import oss2

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

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: upload_oss.py DIST bucket-name")
    dist, bucket_name = Path(sys.argv[1]), sys.argv[2]
    ak = os.environ.get("OSS_ACCESS_KEY_ID") or ""
    sk = os.environ.get("OSS_ACCESS_KEY_SECRET") or ""
    if not ak or not sk:
        raise SystemExit("OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET required")
    endpoint = os.environ.get("OSS_ENDPOINT", "https://oss-cn-hongkong.aliyuncs.com")
    b = oss2.Bucket(oss2.Auth(ak, sk), endpoint, bucket_name)
    files = sorted(p for p in dist.rglob("*") if p.is_file() and p.name != "stamp-manifest.json")
    assets, entries = [], []
    for p in files:
        rel = p.relative_to(dist).as_posix()
        (entries if rel.endswith(".html") or Path(rel).name in {"robots.txt", "sitemap.xml"} else assets).append((rel, p))
    for rel, p in assets + entries:
        b.put_object_from_file(rel, str(p), headers={"Content-Type": ctype(p), "Cache-Control": cache_for(rel)})
        print("put", rel, cache_for(rel))
    print(f"Published {len(files)} objects to {bucket_name}")

if __name__ == "__main__":
    main()
