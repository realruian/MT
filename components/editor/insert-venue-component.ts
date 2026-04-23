import type { PsdLayer } from "@/types/template";
import type { VenueComponent } from "./venue-components";

/** 插入一个组件时，新 layer 距当前画布最底部的间距（px） */
const INSERT_GAP = 24;
/** 插入后若 canvas 需要拉长，预留的底部余量（px） */
const CANVAS_BOTTOM_PADDING = 48;

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

/** 组件自身 bbox 的高度：遍历 payload.layers 取 max(y + height)。
 *  兜底用 component.height。 */
function computeComponentHeight(component: VenueComponent): number {
  let h = 0;
  for (const l of component.payload.layers) {
    const b = l.y + l.height;
    if (b > h) h = b;
  }
  return h > 0 ? h : component.height;
}

/**
 * 把一个会场组件的 payload.layers 克隆一份、全量重新映射 id 后追加到
 * venue 当前 layers 末尾，并计算插入后画布应该拉长到的新高度。
 *
 * 处理要点：
 * - nonce 前缀保证同一组件重复插入不会 id 冲突；同时 parentId 通过 idMap
 *   正确重写，保留嵌套 group 关系
 * - y 偏移 = 当前可见叶子的最大 y+height + 24px gap
 * - zIndex 整体抬高到当前 max + 1 以上，保证新组件盖在现有内容之上
 * - 所有新 layer 打上 sourceComponentId 标记，editor-shell 依此触发
 *   beforeunload / 导出带 layers 分支
 * - 画布仅向下拉长；新底部 ≤ 当前高度时 canvasHeight 保持不变
 *
 * @param layers             venue 当前 layers（只读，不会被 mutate）
 * @param component          要插入的会场组件
 * @param currentCanvasHeight  venue slot 当前 height（px）
 * @param venueTemplateId    venue 的 templateId，所有新 layer 归属到这个 id
 * @returns  nextLayers / nextCanvasHeight / rootLayerId（新组件根 group 的 id，供 editor 自动选中）
 */
export function insertComponentIntoLayers(
  layers: PsdLayer[],
  component: VenueComponent,
  currentCanvasHeight: number,
  venueTemplateId: string,
): {
  nextLayers: PsdLayer[];
  nextCanvasHeight: number;
  rootLayerId: string | null;
} {
  if (component.payload.layers.length === 0) {
    return {
      nextLayers: layers,
      nextCanvasHeight: currentCanvasHeight,
      rootLayerId: null,
    };
  }

  const bottom = computeCurrentBottom(layers);
  const dy = bottom === 0 ? 0 : bottom + INSERT_GAP;

  const maxZ = layers.reduce((m, l) => (l.zIndex > m ? l.zIndex : m), 0);

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
    x: l.x,
    y: l.y + dy,
    zIndex: l.zIndex + maxZ + 1,
    sourceComponentId: component.id,
  }));

  const compH = computeComponentHeight(component);
  const newBottom = dy + compH;
  const nextCanvasHeight =
    newBottom + CANVAS_BOTTOM_PADDING > currentCanvasHeight
      ? newBottom + CANVAS_BOTTOM_PADDING
      : currentCanvasHeight;

  // 根：component.payload.layers 里第一个 parentId==null 的 layer（通常就是 group 根）
  const rootOrigId =
    component.payload.layers.find((l) => l.parentId == null)?.id ?? null;
  const rootLayerId = rootOrigId ? (idMap.get(rootOrigId) ?? null) : null;

  return {
    nextLayers: [...layers, ...cloned],
    nextCanvasHeight,
    rootLayerId,
  };
}
