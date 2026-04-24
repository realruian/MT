import type { PsdLayer } from "@/types/template";
import type { VenueComponent } from "./venue-components";

/** 插入一个组件时，新 layer 距当前画布最底部的间距（px）。
 *  canvas-stage 拖拽换位逻辑也会复用它作为 dropIndicator 与上边界约束。 */
export const INSERT_GAP = 24;
/** venue 画布底部预留的空白（px）——最底部内容 + 这个数 = 画布高度 */
export const CANVAS_BOTTOM_PADDING = 0;
/** venue 画布固定宽度（px），与 template 原始 canvasWidth 对齐 */
export const VENUE_CANVAS_WIDTH = 750;
/** 插入的会场组件统一 content 宽度（venue 宽 - 左右各 24）= 702 */
export const VENUE_CONTENT_WIDTH = 702;
/** 插入组件 content 左边距（venue 宽 - content 宽）/ 2 = 24 */
export const VENUE_CONTENT_LEFT =
  (VENUE_CANVAS_WIDTH - VENUE_CONTENT_WIDTH) / 2;

/**
 * 判断一个原始图层是不是"铺满画布 / 延伸到画布外的装饰性背景"。
 * reflowVenueBlocks 在计算 looseBottom 时会用它排除背景层，避免撑高画布。
 *
 * 两种常见模式：
 * 1) 铺底：x≤5 y≤5 + 宽≥0.95 + 高≥0.9 + 面积≥0.85（经典铺满）
 * 2) 延伸背景：x≤5 + 宽≥0.95 + y+h 溢出画布 ≥1.2 倍（y 可能大于 5，比如
 *    从 header 底部开始向下延伸的圆角背景色块，高度远超画布本身，设计上
 *    是"视觉底色"不是"真正内容"）
 *
 * 两种 layer 都需要从"原始可见内容底部"计算里排除：否则插入的会场组件会
 * 被推到它们底部 + 24 开始铺排，中间出现大段与真内容不匹配的空白。
 *
 * 阈值留足（0.95 / 0.9 / 0.85 / 1.2）避免误伤主视觉大图——比如 750 宽 422
 * 高的 hero banner，heightRatio=0.46 overflow=0.46，两个规则都不中。
 */
export function isFullCanvasBackground(
  l: PsdLayer,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (!canvasWidth || !canvasHeight) return false;
  const widthRatio = l.width / canvasWidth;
  const heightRatio = l.height / canvasHeight;
  const areaRatio = widthRatio * heightRatio;
  const overflowRatio = (l.y + l.height) / canvasHeight;

  const isFullFill =
    l.y <= 5 &&
    l.x <= 5 &&
    widthRatio >= 0.95 &&
    heightRatio >= 0.9 &&
    areaRatio >= 0.85;

  const isExtendingBg =
    l.x <= 5 && widthRatio >= 0.95 && overflowRatio >= 1.2;

  return isFullFill || isExtendingBg;
}

/** @deprecated 已被 venue-reflow.ts::reflowVenueBlocks 取代，请勿再使用 */
export function computeOriginalContentBottom(
  _layers: PsdLayer[],
  _editState: Record<string, Partial<PsdLayer>>,
  _canvasWidth: number,
  _canvasHeight: number,
): number {
  return 0;
}

/**
 * 把一个会场组件的 payload.layers 克隆一份、全量重新映射 id 后追加到
 * venue 当前 layers 末尾；返回新 layers + 新组件根 id（供 editor 自动选中）。
 *
 * - nonce 前缀保证同一组件重复插入不会 id 冲突；parentId 通过 idMap 正确
 *   重写，保留嵌套 group 关系
 * - 新 layer 全部挂 y=0（D5），插入后 reflow useEffect 立即重排，中间帧不渲染
 * - x 偏移 = 24（venue 750 宽度下组件 702 宽水平居中）；先把组件内所有
 *   layer 的 x 归零（减去最小 x），再统一加 24，适配后台组件任意坐标系
 * - zIndex 整体抬高到当前 max + 1 以上，保证新组件盖在现有内容之上
 * - 所有新 layer 打上 sourceComponentId 标记，editor-shell 依此触发
 *   beforeunload / 导出带 layers 分支
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

  // D5：新 layer 挂 y=0，reflow useEffect 立即重排，不预先估算位置
  const dy = 0;

  const maxZ = layers.reduce((m, l) => (l.zIndex > m ? l.zIndex : m), 0);

  // 组件内最小 x（处理后台组件不从 0 开始的边界）
  const minX = component.payload.layers.reduce(
    (m, l) => (l.x < m ? l.x : m),
    Infinity,
  );
  const xShift = minX === Infinity ? VENUE_CONTENT_LEFT : VENUE_CONTENT_LEFT - minX;

  const nonce = Math.random().toString(36).slice(2, 8);
  const instanceId = `venue_inst_${nonce}`;
  const idMap = new Map<string, string>();
  for (const l of component.payload.layers) {
    idMap.set(l.id, `${instanceId}_${l.id}`);
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
    instanceId,
  }));

  // 根：component.payload.layers 里第一个 parentId==null 的 layer。
  // 经 ensureRootGroup 规范化后，它永远是一个 group（upload / PATCH 流水线
  // 保证每个 venue 组件 payload 都带唯一顶层根 group）。
  const rootOrigId =
    component.payload.layers.find((l) => l.parentId == null)?.id ?? null;
  const rootLayerId = rootOrigId ? (idMap.get(rootOrigId) ?? null) : null;

  return {
    nextLayers: [...layers, ...cloned],
    rootLayerId,
  };
}
