import type { PsdLayer } from "@/types/template";
import type { VenueComponent } from "./venue-components";

/** 插入一个组件时，新 layer 距当前画布最底部的间距（px） */
const INSERT_GAP = 24;
/** venue 画布底部预留的空白（px）——最底部内容 + 这个数 = 画布高度 */
export const CANVAS_BOTTOM_PADDING = 48;
/** venue 画布固定宽度（px），与 template 原始 canvasWidth 对齐 */
export const VENUE_CANVAS_WIDTH = 750;
/** 插入的会场组件统一 content 宽度（venue 宽 - 左右各 24）= 702 */
export const VENUE_CONTENT_WIDTH = 702;
/** 插入组件 content 左边距（venue 宽 - content 宽）/ 2 = 24 */
export const VENUE_CONTENT_LEFT =
  (VENUE_CANVAS_WIDTH - VENUE_CONTENT_WIDTH) / 2;

/**
 * 按当前 venue layers + editState 重算画布应占高度。
 *
 * 只遍历"来自组件库"（sourceComponentId 非空）的可见叶子图层，取 eff (y+h)
 * 的最大值作为 insertedBottom：
 * - 未插入任何组件或全删完 → 画布保持 minHeight（= venue slot 初始 height，
 *   即 PSD 模板原始 canvasHeight），避免拉长或塌陷
 * - 插入组件后 → 画布 = max(insertedBottom + 48 padding, minHeight)
 *
 * 不读取 venue 原 PSD 图层（它们可能按设计意图底部超出 canvas 被裁切，不应
 * 被重算挟持），保证 Step 2 只影响"插入组件 + 画布拉长"这条单向新增路径。
 *
 * 这是 venue.height 的唯一数据源；insertComponent 不再自己算 nextCanvasHeight，
 * 全部交给 editor-shell 的 useEffect 统一处理。
 */
export function recomputeVenueHeight(
  layers: PsdLayer[],
  editState: Record<string, Partial<PsdLayer>>,
  minHeight: number,
): number {
  // 先收集"被 editState 标记为 visible=false 的 group id"
  // （属性面板"删除模块"路径就是打这个标），下方叶子级联跳过
  const hiddenGroupIds = new Set<string>();
  for (const l of layers) {
    if (l.layerType !== "group") continue;
    const eff = editState[l.id] ?? {};
    const effVisible = eff.visible !== undefined ? eff.visible : l.visible;
    if (!(effVisible === true || String(effVisible) === "true")) {
      hiddenGroupIds.add(l.id);
    }
  }

  let insertedBottom = 0;
  for (const l of layers) {
    if (!l.sourceComponentId) continue;
    if (l.layerType === "group") continue;
    if (l.parentId && hiddenGroupIds.has(l.parentId)) continue;
    const eff = editState[l.id] ?? {};
    const effVisible = eff.visible !== undefined ? eff.visible : l.visible;
    const isVisible = effVisible === true || String(effVisible) === "true";
    if (!isVisible) continue;
    const y = typeof eff.y === "number" ? eff.y : l.y;
    const h = typeof eff.height === "number" ? eff.height : l.height;
    const b = y + h;
    if (b > insertedBottom) insertedBottom = b;
  }
  if (insertedBottom === 0) return minHeight;
  const next = insertedBottom + CANVAS_BOTTOM_PADDING;
  return next < minHeight ? minHeight : next;
}

/** 返回 venue 当前 layers 中最底部内容的 y + height（遍历可见叶子）。
 *  全部为空或所有叶子不可见时返回 0。 */
function computeCurrentBottom(layers: PsdLayer[]): number {
  let bottom = 0;
  for (const l of layers) {
    if (l.layerType === "group") continue;
    if (l.visible !== true && String(l.visible) !== "true") continue;
    const b = l.y + l.height;
    if (b > bottom) bottom = b;
  }
  return bottom;
}

/**
 * 把一个会场组件的 payload.layers 克隆一份、全量重新映射 id 后追加到
 * venue 当前 layers 末尾；返回新 layers + 新组件根 id（供 editor 自动选中）。
 * 不再负责计算 canvas height —— editor-shell 的 useEffect 订阅 layers/editState
 * 变化统一走 recomputeVenueHeight，保证"画布增减都自动收缩"的单一数据源。
 *
 * 处理要点：
 * - nonce 前缀保证同一组件重复插入不会 id 冲突；parentId 通过 idMap 正确
 *   重写，保留嵌套 group 关系
 * - y 偏移 = 当前可见叶子的最大 y+height + 24px gap
 * - x 偏移 = 24（venue 750 宽度下组件 702 宽水平居中）；先把组件内所有
 *   layer 的 x 归零（减去最小 x），再统一加 24，适配后台组件任意坐标系
 * - zIndex 整体抬高到当前 max + 1 以上，保证新组件盖在现有内容之上
 * - 所有新 layer 打上 sourceComponentId 标记，editor-shell 依此触发
 *   beforeunload / 导出带 layers 分支
 *
 * 后台约束（TODO）：未来上传会场组件时需强制组件 width === 702，不符合
 * 直接 reject；这里 insert 逻辑假定该约束已在上传层执行。
 *
 * @param layers           venue 当前 layers（只读）
 * @param component        要插入的会场组件
 * @param venueTemplateId  venue 的 templateId，所有新 layer 归属到这个 id
 */
export function insertComponentIntoLayers(
  layers: PsdLayer[],
  component: VenueComponent,
  venueTemplateId: string,
): {
  nextLayers: PsdLayer[];
  rootLayerId: string | null;
} {
  if (component.payload.layers.length === 0) {
    return { nextLayers: layers, rootLayerId: null };
  }

  const bottom = computeCurrentBottom(layers);
  const dy = bottom === 0 ? 0 : bottom + INSERT_GAP;

  const maxZ = layers.reduce((m, l) => (l.zIndex > m ? l.zIndex : m), 0);

  // 组件内最小 x（处理后台组件不从 0 开始的边界）
  const minX = component.payload.layers.reduce(
    (m, l) => (l.x < m ? l.x : m),
    Infinity,
  );
  const xShift = minX === Infinity ? VENUE_CONTENT_LEFT : VENUE_CONTENT_LEFT - minX;

  const nonce = Math.random().toString(36).slice(2, 8);
  const idMap = new Map<string, string>();
  for (const l of component.payload.layers) {
    idMap.set(l.id, `venue_inst_${nonce}_${l.id}`);
  }

  const cloned: PsdLayer[] = component.payload.layers.map((l) => ({
    ...l,
    id: idMap.get(l.id)!,
    parentId: l.parentId ? (idMap.get(l.parentId) ?? null) : null,
    templateId: venueTemplateId,
    x: l.x + xShift,
    y: l.y + dy,
    zIndex: l.zIndex + maxZ + 1,
    sourceComponentId: component.id,
  }));

  // 根：component.payload.layers 里第一个 parentId==null 的 layer（通常就是 group 根）
  const rootOrigId =
    component.payload.layers.find((l) => l.parentId == null)?.id ?? null;
  const rootLayerId = rootOrigId ? (idMap.get(rootOrigId) ?? null) : null;

  return {
    nextLayers: [...layers, ...cloned],
    rootLayerId,
  };
}
