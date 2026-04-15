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
- Neon Postgres（`@neondatabase/serverless`）
- Vercel Blob 存储媒体文件
- PSD 解析：`ag-psd`；图片处理：`sharp` / `@napi-rs/canvas`
- 导出渲染：`puppeteer-core` + `@sparticuz/chromium-min`（Serverless）
- 部署：Vercel

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
  db.ts                 — Neon 数据库连接
  templates-db.ts       — 模板数据访问层
  design-tokens.ts      — 设计令牌 + Tailwind 扩展配置
  psd-parser.ts         — PSD 文件解析
  blob-media.ts         — Blob 存储操作
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
- API 路由 `app/api/export/route.ts` 配置了 1024MB 内存 / 30s 超时（见 `vercel.json`）
- 数据库 schema 初始化通过 `app/api/admin/init-db/` API 执行，无 ORM

## 工作流

IMPORTANT: 每次改完代码先跑 `npx tsc --noEmit` 确认类型没问题
IMPORTANT: 修改 Next.js 相关代码前，先读 `node_modules/next/dist/docs/` 下的对应文档，此版本有 breaking changes
