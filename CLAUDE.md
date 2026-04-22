# AI 设计自助生产平台 (Design Studio)

面向美团外卖创意营销场景的设计素材自助生产工具，支持 HTML 模板编辑和 PSD 图层编辑两种模式。

@AGENTS.md

## 常用命令

- 开发：`npm run dev`
- 构建：`npm run build`
- Lint：`npm run lint`
- 类型检查：`npx tsc --noEmit`

## 技术栈

- Next.js 16 (App Router) + React 19 + TypeScript 5
- Tailwind CSS 4（通过 `@tailwindcss/postcss` 集成）
- SQLite（`better-sqlite3`）— 本地文件 `data/local.db`
- 本地文件存储 `data/blob/`（`lib/local-storage.ts`），同源 `/api/blob/media` 代理读取
- PSD 解析：`ag-psd`；图片处理：`sharp` / `@napi-rs/canvas`
- 导出渲染：`puppeteer-core` + 系统 Chrome（`channel: "chrome"`）
- 部署：本地运行（`npm run dev`），不绑定任何云平台

## 项目结构

```
app/
  page.tsx              — 首页（模板列表，SSR + ISR 60s）
  editor/[id]/          — 编辑器页（根据 templateType 切换 HTML/PSD 编辑器）
  admin/                — 后台管理
  api/
    admin/              — 管理接口（模板 CRUD、PSD 上传/图层、数据库初始化/种子）
    blob/media/         — Blob 媒体上传
    export/             — HTML 模板导出（puppeteer 截图）
    export/psd/         — PSD 模板导出
    fonts/[...path]/    — 字体代理
components/
  home/                 — 首页组件（模板网格、创作面板）
  editor/               — 编辑器组件（HTML 编辑面板、PSD 编辑器、模板预览）
  layout/               — 布局（侧边栏导航）
  admin/                — 后台组件
  ui/                   — 通用 UI 组件
lib/
  db.ts                 — SQLite 连接（better-sqlite3，tagged-template shim）
  db-init.ts            — 幂等建表脚本
  templates-db.ts       — 模板数据访问层
  local-storage.ts      — 本地文件存储（data/blob/）
  blob-media.ts         — blob 路径白名单与代理 URL 帮助函数
  design-tokens.ts      — 设计令牌 + Tailwind 扩展配置
  psd-parser.ts         — PSD 文件解析
  template-html.ts      — HTML 模板生成
types/
  template.ts           — Template / PsdLayer 类型定义
```

## 代码风格

- ES modules（import/export），路径别名 `@/*` 映射项目根目录
- 函数式组件 + Hooks，不用 class 组件
- 服务端组件优先；客户端组件文件顶部加 `"use client"`
- 设计令牌统一在 `lib/design-tokens.ts`，通过 Tailwind 扩展消费
- 自定义颜色用 `brand-*` / `ink-*` / `surface-*` 语义命名

## 架构要点

- 两种模板类型：`html`（puppeteer 截图导出）和 `psd`（图层编辑器）
- 首页 ISR（`revalidate = 60`），编辑器页 ISR（`revalidate = 300`）
- 数据库 schema 初始化通过 `app/api/admin/init-db/` API 执行，无 ORM
- 纯本地运行：SQLite 落 `data/local.db`，上传文件落 `data/blob/`，Chrome 走 `channel: "chrome"`

## 工作流

IMPORTANT: 每次改完代码先跑 `npx tsc --noEmit` 确认类型没问题
IMPORTANT: 修改 Next.js 相关代码前，先读 `node_modules/next/dist/docs/` 下的对应文档，此版本有 breaking changes

## 项目特定坑位

IMPORTANT: **PSD 字体注册双向映射** — 字体文件放 `public/fonts/`，`app/api/export/psd/route.ts` 用 fontkit 自动扫描 PostScript 名注册；前端 `lib/fonts.ts` 的 `FONT_FAMILIES` 定义「family + weight → PS name」映射，服务端 `FAMILY_WEIGHT_TO_PS` map 把前端 family 名解析成 PS 名以命中注册表。PSD 里存的是 PS 名，前端下拉用自定义 family 名，改字体相关代码时两边必须同步。调试字体丢失先 `console.log(GlobalFonts.families)` 和 `GlobalFonts.has(name)` 确认注册表，不要盲猜。

IMPORTANT: **Canvas 长文本布局必须在元素自身裁剪** — 画布 `transform: scale()` + 宽 `position:absolute` 子孙的组合下，祖先 `overflow:hidden` / `contain:strict` 都可能失效。文字元素自身必须加 `maxWidth: cw - x` 和 `overflow: hidden`，不能只靠祖先裁剪。见 `components/editor/canvas-stage.tsx` 的 baseStyle。

IMPORTANT: **editState overlay 模型** — 所有用户编辑写入 `editState: Record<layerId, Partial<PsdLayer>>`，渲染时 `getVal(layer, key)` 优先读 overlay 再 fallback 原值。Undo/redo 基于 editState 快照 + 500ms 防抖自动入栈（见 `components/editor/editor-shell.tsx`），所有 `updateLayer` 调用点无需显式埋点就享受撤销能力。

IMPORTANT: **PSD 改源文件必须重新上传** — `lib/psd-parser.ts` 的解析结果（图层坐标、文字内容、字体名）固化在 `data/local.db`。改 PSD 源文件后必须走 `/admin/psd/upload` 重新入库，只改源文件不生效。

IMPORTANT: **反复修不好先诊断** — 同一 bug 修复 ≥ 2 次仍未解决时，停止改修复逻辑，先加 introspection log（如 `GlobalFonts.families`、`getBoundingClientRect`、`scrollWidth`），拿运行时数据再决定下一步。这次 T7 字体修 4 轮 / T8h 画布修 5 轮都是因为盲猜才拖长。
