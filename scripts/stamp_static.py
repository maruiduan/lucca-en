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
"""
import hashlib, json, os, re, shutil, sys, posixpath

STAMP = {'.js', '.css', '.woff', '.woff2', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'}
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
    content = {f: open(os.path.join(src, f), 'rb').read() for f in allf}
    stampable = [f for f in allf if os.path.splitext(f)[1].lower() in STAMP and not ALREADY.search(f)]
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
