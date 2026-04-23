# 会场组件功能 HANDOFF

> 最后更新：2026-04-23（PR3 完成）&nbsp;·&nbsp; 作者：交接中
> 对应分支：`main` &nbsp;·&nbsp; PR1 `de8c999`；PR2 `9fc8e30`；拖拽换位 `453f7a7`；ensureRootGroup 已提交；PR3 待提交

面向接手这块功能的下一位开发。读完能在 10 分钟内接住编辑器「会场组件库」
+ 管理后台「会场组件上传」两条链路。

---

## 1. 已完成

### Step 1：左侧面板分 Tab + 组件库 UI 骨架
- `SlotPanel` 顶部加 `会场 / 资源位` tab 切换，资源位 tab 过滤掉 venue slot；
  空态「尚未延展资源位，点击右上角『一键拓展』添加」
- 会场 tab 渲染会场组件卡片（按分组聚合），mock 数据在
  `components/editor/venue-components.ts`
- tab state 放在 `editor-shell`，切会场强制 `activeSlotId="venue"`，切资源
  位 ≠ venue 时挑第一个非 venue slot；一键拓展成功后自动跳资源位 tab

### Step 2：`insertComponent` 全流程 + 服务端导出
- `insert-venue-component.ts::insertComponentIntoLayers` 克隆 payload.layers、
  id / parentId 重映射（`venue_inst_<nonce>_*` 前缀）、y 偏移 = 当前底部 + 24、
  打 `sourceComponentId` / `instanceId` 标记
- editor-shell `handleSelectVenueComponent` 触发插入 + 自动选中新组件根
  group（`setSelected({ moduleId: rootLayerId })`），属性面板立刻亮起
- 切 slot 走掉再切回 venue 时，通过 `venueInsertedLayersRef` 把已插入图层
  拼回 `fetchLayers` 结果末尾，不丢失
- beforeunload：`layers.some(l => l.sourceComponentId != null)` 为真时挂原
  生离开确认（浏览器只显示默认文案，无法自定义）
- 导出：`/api/export/psd` 新增 `body.layers` 入参；前端 venue 含插入组件
  时下发完整 layers 绕过 DB 拉取。非法 layers → console.warn + fallback DB，
  **绝不返回 400 挡住下载**
- 后端 text 渲染：`text` layer 无 `imageUrl` 但有 `textContent` 时新走字体
  渲染分支（mock / 未来运营场景都命中），DB 原生 text layer 行为不变
- `renderTextToPng` 接 `textAlign` 形参支持 center/right

### 3 个追加需求
- **画布自动收缩**（删除组件 → 下方组件自动上移 + 画布缩回）
- **组件宽度固定 702 水平居中**（x=24，mock 数据和 insert 算法都归零再偏
  移；后台上传接口强制 `psd.width===702`）
- **画布背景色可改**（借用 `editState[VENUE_CANVAS_ID].fontColor` 存 hex
  享受 undo / redo；canvas-stage 外壳 + 导出后端 sharp base canvas fill 三
  端联动）

### Bug 修复
- **`computeOriginalContentBottom` 每次动态算**，不缓存；用户隐藏 / 显示
  venue 原 layer 时画布自动跟着收缩 / 扩大
- **`isFullCanvasBackground` 双规则**识别"铺满画布"和"从 header 下延伸到
  画布外的装饰背景"（venue 的「圆角背景」layer_6 从 y=400 高 1246 溢出画
  布到 1646 就是典型），把它们从原始内容底部计算里排除，插入组件不再被
  推到离真内容 700+ 像素的空白区

### PR3：编辑器接入实时会场组件 API
**API**
- `GET /api/venue-components` — 公开路由（不在 /admin 下，无鉴权），复用
  `listVenueComponents`，把 `groupName / thumbnailUrl` 映射为前端 `group /
  thumbnail` 形状返回

**前端数据层**
- `components/editor/venue-components.ts`：`MOCK_VENUE_COMPONENTS` →
  `FALLBACK_VENUE_COMPONENTS`；新增 `fetchVenueComponents()` 默认走实时
  API，`NEXT_PUBLIC_USE_MOCK_VENUE_COMPONENTS=true` 命中时改读 fallback
  数组（dev 阶段 DB 空表 / demo 故障兜底）。`.env.local.example` 有开关
  用法注释
- fetch 使用 `cache: "no-store"`，保证「刷新组件库」能拿到最新数据

**UI**
- SlotPanel 托管 `components / error / refreshing` 状态；TabHeader 右侧在
  venue tab 激活时显示 RefreshCw icon，点击触发 `load()`，期间 `animate-spin`
- 四种渲染态：`components === null && !error` → 按 7 分组 × 2 张灰卡骨架屏；
  `error` → 文案 + 重试按钮；`components === []` → 「暂无组件，请到后台上传」；
  有数据 → 按 `VENUE_COMPONENT_GROUPS` 常量顺序固定渲染 7 分组（不依赖 DB
  返回顺序），**空分组也保留标题 + 虚线边框「暂无组件」占位**
- `onSelectVenueComponent` 签名改为传完整 `VenueComponent` 对象（之前传 id
  由 shell 自查 mock 常量找回对象，现在 shell 不再持有组件列表）
- editor-shell 删掉 `MOCK_VENUE_COMPONENTS` 的 import 和查找逻辑

### ensureRootGroup：venue 组件 payload 规范化
**问题**：运营 PSD 不一定把组件包进 Group，parser 解析出一堆扁平 leaf
（`parentId == null`），导致编辑器一系列"模块级"交互全失效（选中 / 拖拽
换位 / 删除模块 / 属性面板总尺寸）。诊断日志指向一个根因：没有根 group。

**修复**：`lib/venue-component-psd.ts::ensureRootGroup` 在
`buildVenueComponentFromPsd` 末尾自动补一个 `root_<nonce>` 虚拟 group：
- 仅在没有顶层 group 时合成（mock 组件、规范 PSD 不受影响）
- width **固定 702**（不从子 layer union 算，避免右边缘 hit testing 死角）
- height = 所有子 leaf 的 `max(y + h)`
- 所有原顶层 leaf 的 `parentId` 重写指向它

**历史数据**：PR2 之前入库的 venue 组件 payload 是扁平的，需要走一次
后台编辑 → 重传原 PSD（PATCH 流水线自动规范化）才能生效。

### PR2：编辑 / 排序 / 重新生成缩略图
**API**
- `PATCH /api/admin/venue-components/[id]` — multipart：可选 name / group /
  psd / thumbnail。至少传一个字段；重传 PSD 后若未同时传缩略图会自动基于
  新 layers 重新合成，避免缩略图与实际内容错位
- `POST  /api/admin/venue-components/[id]/regenerate-thumbnail` — 从 DB
  payload 直接重合成缩略图（不重解析 PSD 源文件，迁移友好）
- `POST  /api/admin/venue-components/reorder` — body `{ groupName, ids[] }`，
  按下标批量刷 sort_order；跨组写入会被静默丢弃（防御拖拽 state 滞后）

**DB 层**
- `updateVenueComponent(id, partial)` — 逐字段 UPDATE（与 templates-db
  同风格），每次调用刷新 updated_at
- `reorderVenueComponents(groupName, ids[])` — better-sqlite3 事务，失败整
  体回滚

**helper 抽取**
- `lib/venue-component-psd.ts` — upload + PATCH 共享的 PSD → PsdLayer 流水
  线（坐标归零 / raster 存 blob / 缩略图自动合成 / 旧文件清理）。常量
  `VENUE_COMPONENT_WIDTH` / `MAX_PSD_SIZE` / `MAX_THUMB_SIZE` /
  `AUTO_THUMB_WIDTH` 全挪到这里做单一事实来源
- `PsdWidthMismatchError` 把宽度校验失败变成专属错误类型，调用方用
  `instanceof` 判断再返回 400

**UI**
- 卡片 hover 新增 3 个图标按钮：编辑（Pencil） / 重新生成缩略图
  （Image，生成中灰遮罩 + loader） / 删除（Trash2，保留原行为）
- `ComponentFormModal`：`mode: "create" | "edit"`。edit 态下 PSD / 缩略
  图 / name / group 全部可选；「取消替换」按钮可重置已选文件；「尚未修
  改任何字段」禁用提交
- 组内拖拽排序：HTML5 native DnD（draggable + dragover + drop），按鼠标
  在目标卡片内的 clientX 对比 `rect.left + width/2` 判定 before/after，
  drop 指示线是卡片侧边 2px 宽竖条；乐观更新 + 失败回滚 snapshot

### PR1：会场组件管理后台
**数据层**
- `venue_components` 表（id/name/group_name/thumbnail_url/payload_json/width/height/source_psd_url/sort_order/created_at/updated_at）
- `types/venue-component.ts::VenueComponentRecord`（UI 侧安全 import）
- `lib/venue-components-db.ts`（list / get / create / delete；delete 同步
  清理 PSD + 缩略图 + layer 子目录）
- `lib/blob-media.ts` 白名单加 `venue-components/`

**渲染核心抽取**
- `lib/render-psd-to-png.ts::renderPsdToPng`（字体注册 / 文字渲染 /
  sharp composite），给「会场导出」和「组件缩略图自动生成」两处共用；字
  体注册同进程幂等

**API**
- `POST /api/admin/venue-components/upload` — PSD ≤5MB / name ≤6 字 /
  group 7 选 1 / 可选 thumbnail ≤1MB；width 校验失败返回指定文案；坐标
  归零；layer raster 存 blob；缩略图走上传文件或自动合成（宽 200）
- `GET  /api/admin/venue-components`
- `DELETE /api/admin/venue-components/[id]`

**UI**
- `app/admin/venue-components/page.tsx`：顶栏返回管理后台 / 右上「+ 上传
  组件」；7 分组纵向布局，空分组仍显示标题 + 计数 + 「暂无组件」；卡片
  4 列网格 hover 显示 trash；成功 / 失败 3s 自动消失 toast；原生 confirm
  二次确认
- `app/admin/page.tsx` 顶栏加 `Boxes` 图标「会场组件」跳转入口

---

## 2. 关键决策（不要回退）

以下是经过踩坑 / 讨论 / 对齐后的设计，后续若要改动请先理由充分：

1. **venue 不从 `slots` 数组剥离** — 它一直是 `slots[0]`，`Slot` 类型已
   加 `bgColor?: string` 字段。曾提议过"剥离为独立 state"，demo 前一天
   动数据结构风险太大被否。`activeSlotId` / `editState` 键 / 导出入口 /
   undo 栈全部按"venue 是普通 slot"假设工作。

2. **导出走 `/api/export/psd` 服务端合成，禁用 html2canvas** — 项目已有的
   PSD 字体注册体系（fontkit + FAMILY_WEIGHT_TO_PS 双向映射）只在服务端
   生效，html2canvas 完全脱钩会场中文字重会回退。新增 `body.layers` 分
   支支持前端下发完整 layers，绕过 DB 拉取。

3. **命名**：`VenueComponent` (数据) / `VenueComponentCard` (UI 卡片) /
   `VenueComponentLibrary` (整个 venue tab 内容区) / `VenueComponentGroup`
   (分组容器)。不要用 `Card` / `ComponentCard` 避免与通用 Card 或「优惠
   券卡片」「商品卡片」混淆。写注释、PR 描述、跟 reviewer 对话都用这套
   中英文术语。

4. **reflow 排序用数组下标**，不加 `insertOrder` 字段 — `layers` 数组里
   `instanceId` 首次出现的下标 = 插入时间顺序。因为插入走 `push` 追加、
   删除走 `editState.visible=false`（不动数组）、undo/redo 还原 editState、
   reflow 只改 y — 数组相对顺序始终稳定。省一个字段 + 一个 state。

5. **`recomputeVenueHeight` 算法** — `height = max(originalBottom,
   insertedBottom) + 48 padding`；`min` 硬编码 `MIN_VENUE_CANVAS_HEIGHT = 200`
   做极端塌底兜底。**不用 917（模板 canvasHeight）兜底**，否则会挡住
   "venue 原内容实际到 600，画布应收缩到 600" 的自然行为。

6. **`isFullCanvasBackground` 阈值 0.85 / 0.9 / 0.95 + overflow 1.2** —
   双规则（经典铺满 + 溢出延伸）。改阈值前先在 venue 实际 PSD layer 数
   据上跑 `[...layers].map(l => ({...metrics, matched: isFullCanvasBackground(l)}))`
   确认不误伤主视觉 layer 再改。

7. **`editState[VENUE_CANVAS_ID].fontColor` 借位存画布背景色** — 用虚拟
   layerId + 借 `fontColor` 字段，走 editState undo 栈。导出时 `exportOneSlot`
   显式过滤掉这条虚拟条目不发给后端 edits。别试图用 `Partial<PsdLayer>`
   之外的新字段——会污染 editState type 传遍全项目。

8. **reflow 不读 `editState.y` / 不动手动拖动结果** — reflow useEffect
   依赖 `[layers, editState, activeSlot.id]`，但内部只读 `layer.y`
   (ground truth) 计算 dy。用户手动拖 = `editState.y` 写入 → layers 不
   变 → reflow 不触发。下次增删组件时 reflow 才基于 `layer.y` 重排并清
   除 `editState[id].y`。Demo 阶段"自动布局优先"。

---

## 3. 命名约定速查

### 文件
```
components/editor/
  slot-panel.tsx                  # 左侧 tab 容器 + VenueComponentLibrary/Group/Card 子组件
  venue-components.ts             # fetchVenueComponents + FALLBACK（降级用）
  insert-venue-component.ts       # insertComponentIntoLayers / reflowVenueComponents
                                  #   / recomputeVenueHeight / computeOriginalContentBottom
                                  #   / isFullCanvasBackground + 尺寸常量
  editor-shell.tsx                # 顶层 state + useEffect 编排（reflow / height 同步）

app/admin/venue-components/page.tsx   # 后台管理页
app/api/admin/venue-components/
  route.ts                        # GET 列表
  [id]/route.ts                   # DELETE + PATCH
  [id]/regenerate-thumbnail/route.ts  # POST 重生缩略图
  upload/route.ts                 # POST 上传
  reorder/route.ts                # POST 组内批量改 sort_order

app/api/venue-components/
  route.ts                        # GET 公开列表（编辑器消费，映射 group/thumbnail 形状）

lib/
  venue-component-groups.ts       # VENUE_COMPONENT_GROUPS 7 分组常量 + guard
  venue-components-db.ts          # DAL（list/get/create/update/delete/reorder，server-only）
  venue-component-psd.ts          # PSD 处理 helper（build/auto-thumbnail/清理），upload+PATCH 共享
  render-psd-to-png.ts            # renderPsdToPng 共享渲染核心
  blob-media.ts                   # 白名单含 venue-components/

types/
  template.ts                     # PsdLayer.sourceComponentId? / instanceId? 新增字段
  venue-component.ts              # VenueComponentRecord（UI 可 import）
```

### 类型
| 名称 | 位置 | 用途 |
|---|---|---|
| `VenueComponent` | `venue-components.ts` | 编辑器端消费的组件数据结构 |
| `VenueComponentRecord` | `types/venue-component.ts` | DB 行 → API → UI 的映射结构 |
| `VenueComponentGroup` | `venue-component-groups.ts` | 7 分组 union type |
| `VenueComponentCardProps` / `LibraryProps` / `GroupProps` | `slot-panel.tsx` | 各子组件 props |
| `PsdLayer.sourceComponentId?` | `types/template.ts` | 运行时标记：来自组件库的图层 |
| `PsdLayer.instanceId?` | `types/template.ts` | 运行时标记：同次插入共享 |

### 常量
| 名称 | 值 | 文件 |
|---|---|---|
| `VENUE_CANVAS_ID` | `"__venue_canvas__"` | `editor-shell.tsx` |
| `VENUE_CANVAS_WIDTH` | `750` | `insert-venue-component.ts` |
| `VENUE_CONTENT_WIDTH` | `702` | `insert-venue-component.ts` |
| `VENUE_CONTENT_LEFT` | `24` | `insert-venue-component.ts` |
| `CANVAS_BOTTOM_PADDING` | `48` | `insert-venue-component.ts` |
| `MIN_VENUE_CANVAS_HEIGHT` | `200` | `insert-venue-component.ts` (private) |
| `VENUE_COMPONENT_GROUPS` | `readonly string[7]` | `venue-component-groups.ts` |
| `MOCK_VENUE_COMPONENTS` | `VenueComponent[14]` | `venue-components.ts` |

### 关键函数
| 名称 | 签名 | 文件 |
|---|---|---|
| `insertComponentIntoLayers` | `(layers, component, venueTemplateId) → { nextLayers, rootLayerId }` | `insert-venue-component.ts` |
| `reflowVenueComponents` | `(layers, editState, cw, ch) → { nextLayers, nextEditState }` | `insert-venue-component.ts` |
| `recomputeVenueHeight` | `(layers, editState, cw, ch) → number` | `insert-venue-component.ts` |
| `computeOriginalContentBottom` | `(layers, editState, cw, ch) → number` | `insert-venue-component.ts` |
| `isFullCanvasBackground` | `(layer, cw, ch) → boolean` | `insert-venue-component.ts` |
| `renderPsdToPng` | `(RenderPsdOptions) → Promise<Buffer>` | `render-psd-to-png.ts` |
| `buildVenueComponentFromPsd` | `({ componentId, psdBuffer, psdFileName }) → { layers, height, sourcePsdUrl, ... }` | `venue-component-psd.ts` |
| `generateAutoThumbnail` | `({ componentId, layers, height }) → { url, pathname }` | `venue-component-psd.ts` |
| `cleanupStaleLayerFiles` | `(componentId, keepFilenames) → void` | `venue-component-psd.ts` |
| `listVenueComponents` / `create` / `update` / `delete` / `reorder` / `get` | DB CRUD | `venue-components-db.ts` |

### API 路径
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/venue-components` | **编辑器公开接口**，编辑器「会场」tab 消费 |
| GET | `/api/admin/venue-components` | 按 group+sort_order 排序列表（后台管理） |
| POST | `/api/admin/venue-components/upload` | multipart：psd / name / group / thumbnail? |
| PATCH | `/api/admin/venue-components/[id]` | multipart：psd? / name? / group? / thumbnail?（至少 1 个） |
| POST | `/api/admin/venue-components/[id]/regenerate-thumbnail` | 从 DB payload 重合成缩略图 |
| POST | `/api/admin/venue-components/reorder` | body `{ groupName, ids[] }`，按下标刷 sort_order |
| DELETE | `/api/admin/venue-components/[id]` | 删 DB + blob |
| POST | `/api/export/psd` | 新增 `body.layers` / `body.bgColor` 入参 |

---

## 4. 当前状态

- **PR1**（后台组件上传）已提交（`de8c999`）
- **PR2**（编辑 / 排序 / 重生缩略图）已提交（`9fc8e30`）
- **venue 拖拽换位**（Figma autolayout 语义）已提交（`453f7a7`）
- **ensureRootGroup**（venue 组件 payload 规范化）已提交
- **PR3**（编辑器接入实时 API）已完成，待自测提交

编辑器侧默认走 `/api/venue-components` 实时数据；无数据时 SlotPanel
展示「暂无组件，请到后台上传」空态。降级走 `NEXT_PUBLIC_USE_MOCK_VENUE_COMPONENTS=true`
环境变量。

### 自测 checklist（全链路 demo 前过一遍）

```bash
# 0. DB schema OK
curl -s -X POST http://localhost:3000/api/admin/init-db
# 1. 公开列表接口
curl -s http://localhost:3000/api/venue-components | python3 -m json.tool
```

#### 后台管理（`/admin/venue-components`）
1. 上传一个组件（PR1 原流程，确认未回归）
2. hover 卡片 → 3 个图标按钮（编辑 / 重新生成缩略图 / 删除）
3. 点编辑 → 改名保存 → 卡片名更新
4. 点编辑 → 换一个分组保存 → 卡片移到新分组
5. 点编辑 → 重传 PSD 不传缩略图 → 缩略图自动重生
6. 点重新生成缩略图 → 生成中遮罩 → toast
7. 同组内拖拽 → drop 指示线 → 松开后顺序改变 → 刷新页面顺序保持

#### 编辑器（进入任意 psd 模板编辑器）
8. 「会场」tab 打开 → 骨架屏 → 真实组件 / 空态
9. 点刷新 icon → 旋转动画 → 列表更新
10. 后台删除一个组件 → 编辑器点刷新 → 消失
11. 点一个组件 → 插入到 venue 画布底部 → **整个 702 宽组件被蓝框选中**
    （ensureRootGroup 保证）→ 文字 / 图片可编辑
12. 画布上两个真实组件互拖换位（PR2 的 autolayout 语义同样生效）
13. 下载 PNG → 字体 / 图层位置 / 背景色都正确
14. `NEXT_PUBLIC_USE_MOCK_VENUE_COMPONENTS=true npm run dev` → 命中降级
    通道，7 分组 × 2 张 SVG mock 直出，插入 / 导出全链路不报错

---

## 5. 待办

### 可选增强
- 后台批量上传（一次多个 PSD）
- 组件标签 / 搜索 / 筛选（表目前只按 group_name + sort_order 排，没全文检索）
- "锁定位置"开关：reflow 跳过锁定实例，允许用户保留手动拖动

---

## 6. 已知坑位

### Turbopack HMR 残影
改 `className` 里的 Tailwind arbitrary（尤其是 `[...]`）和 service code
（editor-shell / insert helper）时，dev server 的 SSR cache 偶尔抓不到
最新模块。现象：浏览器 DOM 看到的 className 和源码不一致，Next Dev Tools
右下角弹「1 Issue」hydration mismatch。

**排查顺序**：
1. 硬刷浏览器（`cmd+shift+R`）
2. 不行就重启 dev server（`lsof -i :3000 -sTCP:LISTEN -t | xargs kill`
   后 `npm run dev`）
3. 确认是残影后再判断要不要改代码

> 不要在看到 HMR 残影时直接改代码——会引入真 bug 却让自己以为"修好了"。

### PSD 字体注册双向映射
已在 `CLAUDE.md` 记录，不重复。新增的 `render-psd-to-png.ts` 复用同一套
`FAMILY_WEIGHT_TO_PS` 映射 + `ensureFontsRegistered` 幂等注册。改字体相
关代码时同步 `lib/fonts.ts` 和 `render-psd-to-png.ts` 两处。

### Mock 测试 PSD 中文字体回退
我给 PR1 生成测试 PSD 用的 Node 脚本调 `@napi-rs/canvas` 画中文 text layer
会回退到默认字体（中文显示为方块），导出/缩略图里看到方块是 mock 数据本
身的问题，不是导出流程 bug。**运营用 Photoshop 导出的 PSD 里 text layer
的 raster 是 PS 字体渲染好的**，不会有这个问题。

### beforeunload 只显示浏览器默认文案
现代浏览器安全限制，`e.returnValue = "..."` 的自定义文案不生效。只能弹
浏览器原生「要离开吗？所做更改可能不会保存」。如果产品要求自定义文案，
只能用自己的 modal 在路由跳转前 `prompt`，`beforeunload` 那层保留兜底。

### `/admin/venue-components` 入口仅 admin 顶栏
全站 `sidebar-nav.tsx`（左侧 4 个图标导航）尚未加「会场组件」入口。需要
一个 SVG icon（设计师或 lucide-react 的 `Boxes`），加到 `navItems` 数组。
目前只在管理后台首页的顶栏有文字链接。

---

## 7. demo 前 checklist

按顺序跑一遍确保环境 OK：

```bash
# 1. 确认 DB 有 venue_components 表
curl -s -X POST http://localhost:3000/api/admin/init-db
# → { "ok": true }

# 2. 看一下组件数
curl -s http://localhost:3000/api/admin/venue-components | python3 -m json.tool

# 3. 编辑器页打开不报错
# 浏览器访问 http://localhost:3000/editor/psd_mo9hkl9y_wd8n

# 4. tsc / lint 干净
npx tsc --noEmit && npm run lint
```

如果 editor 页空白 / 报错，90% 是 HMR 残影——重启 dev server 再试一次。

---

## 8. 联系人

交接中。本 PR 的决策讨论记录散在几个 Cursor 会话，主要可追溯到 commit
range `b375973..de8c999`（`git log --oneline b375973..de8c999 -- components/editor/ lib/render-psd-to-png.ts lib/venue-* app/api/admin/venue-components`）。
