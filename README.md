# lucca-en — en.lucca.top

English speech shadowing lessons (Jobs, TED talks). Live site: https://en.lucca.top/

## Layout
- `site/` — editable source (unstamped)
- `scripts/stamp_static.py` — builds hashed `dist/`
- `scripts/upload_oss.py` — uploads `dist/` to OSS bucket `lucca-en` (Hong Kong)
- CI on `master` stamps and deploys

## Local
```bash
python3 scripts/stamp_static.py site dist
OSS_ACCESS_KEY_ID=… OSS_ACCESS_KEY_SECRET=… python3 scripts/upload_oss.py dist lucca-en
```

## Secrets
Repo secrets `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` must be able to **write** `lucca-en` (oss-cn-hongkong). Until the RAM policy grants write, deploy will fail with AccessDenied — that is expected.

## Credits
See lesson pages; TED talks are CC BY-NC-ND; Jobs audio from archive.org (timing-aligned). Non-commercial site.
