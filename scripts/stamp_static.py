#!/usr/bin/env python3
"""stamp_static.py SRC DIST [--base URLPREFIX]

Builds a cache-busted copy of a static site.
  SRC  stays UNSTAMPED (edit / regenerate there as usual).
  DIST is wiped and rebuilt: JS/CSS/font/image files become name.<hash8>.ext,
       every local reference in HTML/CSS/JS is rewritten, HTML names unchanged,
       old '?v=N' query strings removed. Writes DIST/stamp-manifest.json.
Idempotent: always re-hashes from SRC, never stamps a stamped file.
Audio/video (mp3 etc.) are copied unchanged (large, rarely change).
External URLs (http:, https:, //, data:) are never touched.
Lesson data.js keeps sentence word-timings ("w") in SRC; DIST drops them.
"""
import hashlib, json, os, re, shutil, sys, posixpath

# Sentence "w" is [[start, end], ...] and is not read by the site. Vocab "w" is a string.
_WORD_TIME = re.compile(
    r',\s*"w"\s*:\s*\[\s*(?:\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]\s*,?\s*)*\]'
)

def strip_sentence_word_times(rel, data):
    """Remove unread per-word timestamps from published lesson data. SRC is untouched."""
    if posixpath.basename(rel) != 'data.js' or not data.startswith(b'window.LESSON='):
        return data
    text = data.decode('utf-8')
    prefix = 'window.LESSON='
    orig_body = text[len(prefix):]
    if orig_body.endswith(';'):
        orig_body = orig_body[:-1]
    orig = json.loads(orig_body)
    sents = orig.get('sentences') or []
    need = sum(1 for s in sents if 'w' in s)
    new, n = _WORD_TIME.subn('', text)
    if n != need:
        raise SystemExit(f'{rel}: stripped {n} word-time arrays, expected {need}')
    if n == 0:
        return data
    body = new[len(prefix):]
    if body.endswith(';'):
        body = body[:-1]
    obj = json.loads(body)
    out_sents = obj.get('sentences') or []
    if len(out_sents) != len(sents):
        raise SystemExit(f'{rel}: sentence count changed')
    for i, (a, b) in enumerate(zip(sents, out_sents)):
        if 'w' in b:
            raise SystemExit(f'{rel}: sentence {i} still has w')
        for k in ('id', 'p', 'en', 'zh', 's', 'e'):
            if a.get(k) != b.get(k):
                raise SystemExit(f'{rel}: sentence {i} field {k} changed')
    for g in obj.get('segments') or []:
        for v in g.get('vocab') or []:
            if not isinstance(v.get('w'), str):
                raise SystemExit(f'{rel}: vocab w damaged')
    return new.encode('utf-8')

STAMP = {'.js', '.css', '.woff', '.woff2', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'}
# Share image and the well-known favicon stay at fixed URLs (/og.png, /favicon.ico).
STABLE = {'og.png', 'favicon.ico'}
TEXT = {'.html', '.js', '.css'}
EXCLUDE_RE = re.compile(r'(^|/)(\.|site-backup|stamp-manifest)|\.(diff|bak|tgz|md)$|\.pre-[^/]*\.html$|\.live[^/]*\.(html|png)$|-(390|1280)\.png$|(^|/)(tap-test|mq)\.js$')
ALREADY = re.compile(r'\.[0-9a-f]{8}\.[A-Za-z0-9]+$')
REF = re.compile(r'''(?P<q>["'(])(?P<p>(?:\.{1,2}/|/)?[A-Za-z0-9_\-./]+\.(?:js|css|woff2?|ttf|otf|png|jpe?g|gif|webp|svg|ico|mp3))(?P<v>\?v=[0-9A-Za-z]+)?(?P<e>["')])''')

def files(src):
    out = []
    for root, dirs, fs in os.walk(src):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in fs:
            rel = os.path.relpath(os.path.join(root, f), src).replace(os.sep, '/')
            if not EXCLUDE_RE.search(rel):
                out.append(rel)
    return sorted(out)

def main():
    src, dist = sys.argv[1].rstrip('/'), sys.argv[2].rstrip('/')
    allf = files(src)
    fileset = set(allf)
    content = {f: strip_sentence_word_times(f, open(os.path.join(src, f), 'rb').read()) for f in allf}
    stampable = [f for f in allf if os.path.splitext(f)[1].lower() in STAMP and not ALREADY.search(f) and f not in STABLE]
    newname = {f: f for f in allf}

    def resolve(owner, p):
        # relative refs resolve against the owner's dir (also true for JS here:
        # page-relative and script-relative coincide in these sites)
        if p.startswith('/'):
            t = p.lstrip('/')
        else:
            t = posixpath.normpath(posixpath.join(posixpath.dirname(owner), p))
        return t if t in fileset else None

    def rewrite(owner, data):
        txt = data.decode('utf-8')
        def sub(m):
            t = resolve(owner, m.group('p'))
            if not t:
                return m.group(0)
            p, new = m.group('p'), newname[t]
            np = p[:len(p) - len(posixpath.basename(p))] + posixpath.basename(new)
            return m.group('q') + np + m.group('e')
        return REF.sub(sub, txt).encode('utf-8')

    # iterate until names are stable (assets may reference other assets)
    for _ in range(10):
        changed = False
        for f in stampable:
            data = rewrite(f, content[f]) if os.path.splitext(f)[1] in TEXT else content[f]
            h = hashlib.sha256(data).hexdigest()[:8]
            base, ext = os.path.splitext(f)
            n = f'{base}.{h}{ext}'
            if newname[f] != n:
                newname[f] = n; changed = True
        if not changed:
            break
    if os.path.isdir(dist):
        shutil.rmtree(dist)
    for f in allf:
        data = rewrite(f, content[f]) if os.path.splitext(f)[1].lower() in TEXT else content[f]
        out = os.path.join(dist, newname[f])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if data == content[f] and not os.path.splitext(f)[1] in TEXT:
            shutil.copy2(os.path.join(src, f), out)
        else:
            open(out, 'wb').write(data)
    man = {'source': os.path.abspath(src),
           'assets': {f: newname[f] for f in stampable},
           'html': [f for f in allf if f.endswith('.html')],
           'other': [f for f in allf if f not in stampable and not f.endswith('.html')]}
    json.dump(man, open(os.path.join(dist, 'stamp-manifest.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'{src} -> {dist}: {len(stampable)} stamped, {len(man["html"])} html, {len(man["other"])} other')

if __name__ == '__main__':
    main()
