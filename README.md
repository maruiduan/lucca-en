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

## 逻辑回归检查

提交前执行（Node.js 20+，无额外 npm 依赖；部署工作流也会在打包、上传前执行）：

```bash
node --check site/assets/lesson.js
node --test tests/logic-regression.cjs
```

覆盖数字词听写判分、麦克风权限等待取消/去重、录音停止异步状态隔离、切换页面抑制旧录音播放，以及录音失败释放麦克风。测试直接加载生产函数，以模拟媒体接口运行，不使用真实麦克风。

可选完整浏览器回归：环境需安装 Playwright 并有 Chromium；设置 `CHROMIUM_PATH`（默认 `/usr/bin/chromium`），然后运行 `node tests/lesson-regression.cjs`。它检查听写编辑后重新核对、步骤/章节导航、进度恢复和全部课程的步骤渲染。此脚本不使用真实麦克风；云端受限环境如禁止 Chromium socket，应在可用的测试环境运行，不能将逻辑测试等同于浏览器测试通过。
