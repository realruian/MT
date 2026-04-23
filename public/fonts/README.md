# 字体目录

这个目录存放 PSD 导出 / 编辑器字体下拉使用的 TrueType / OpenType 文件。

## 不入库策略

整个 `public/fonts/` 下的 `.ttf` / `.otf` / `.woff` / `.woff2` 文件默认
被 `.gitignore` 排除（见项目根 `.gitignore` 的 `public/fonts/**` 段落），
只 whitelist 了历史入库的 22 个文件。原因：

- 完整字体库 200+ 文件、~1 GB，直接入 git 会导致 clone / push / branch
  切换显著变慢，PR review 也不合理。
- 设计字体的归属本就是设计资产管线，不是代码仓库。

## 新人如何补齐字体

1. 联系字体维护人（见内部 CODEOWNERS 或当前项目 HANDOFF.md）获取最新的
   字体压缩包（`design-studio-fonts-YYYYMMDD.zip`）。
2. 解压到项目的 `public/fonts/`，保留原有子目录结构（如 `molly/`）。
3. `cd` 到项目根 → `npm run dev`（或如果 dev 已在跑：访问
   `POST /api/admin/fonts/rescan` 无需重启）。
4. 验证：访问 `GET /api/admin/fonts/list`，确认 `scannedFileCount` 是
   你预期的数量 / `errors` 为空。

## 运行时加载流程

服务端一次性扫描：`lib/font-scan.ts::getFontScan()` 走 fontkit 读出每张
face，结果缓存在进程内存。上游两个消费：

- `lib/render-psd-to-png.ts::ensureFontsRegistered()` 全量注册到
  `@napi-rs/canvas` 的 `GlobalFonts`。导出 PSD 时文字按 PostScript 名
  命中精确字体。
- `lib/font-aggregation.ts::aggregateFamilies()` 按
  `EXPOSED_FAMILIES` 白名单 + family 归并 + weight 标准化，产出编辑器
  **字体下拉** 的 `FontFamilyDef[]`。走
  `GET /api/fonts/families` 暴露给前端。

「下拉清单 ≠ 可用字体清单」—— 下拉只暴露运营常用的精选子集，全量字体
都能被 resolver 命中，PSD 引用冷门字体时导出不回退。

## 新增字体后想上下拉

在 `lib/font-aggregation.ts::EXPOSED_FAMILIES` 追加你的家族 aggregation
key（见文件内说明），按需在 `lib/font-display-names.ts` 配中文
displayName。不需要改其它地方。
