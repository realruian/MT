import type { PsdLayer } from "@/types/template";
import { extractBlocks } from "./venue-blocks";
import { isFullCanvasBackground, CANVAS_BOTTOM_PADDING } from "./insert-venue-component";

const TOP_PADDING = 24;
const GAP = 24;
const ABSOLUTE_MIN = 200;

/**
 * Level-wise 祖先链可见性检查（D3）：自底向上递归，任一祖先隐藏则整层不可见。
 * venue 嵌套深度 ≤ 2，递归开销可忽略。
 */
function isLayerVisible(
  layer: PsdLayer,
  layerById: Map<string, PsdLayer>,
  editState: Record<string, Partial<PsdLayer>>,
): boolean {
  const eff = editState[layer.id] ?? {};
  const v = eff.visible !== undefined ? eff.visible : layer.visible;
  if (!(v === true || String(v) === "true")) return false;
  if (layer.parentId) {
    const parent = layerById.get(layer.parentId);
    if (parent && !isLayerVisible(parent, layerById, editState)) return false;
  }
  return true;
}

/**
 * venue 画布全量 autolayout reflow（阶段 3 替代 reflowVenueComponents）。
 *
 * 将 originalGroup block 和 instance block 统一放入 autolayout，
 * 从 TOP_PADDING=24 起按 sortKey 顺序自上而下铺排；loose block 不参与。
 *
 * - sortKey = 各 block 首个 layer 在 layers 数组中的下标，即插入时间/原始顺序
 * - 整块隐藏（根 group visible=false）的 block → cursor 不推进（=删除效果）
 * - 只用叶子 layer 的 y/height 计算 minY/maxBottom，group 自身的 y 跟随平移
 * - 清除被 reflow 覆盖的 editState[id].y（D8：reflow 后以 layer.y 为准）
 * - 无变化时返回 layers / editState 原引用，供调用方短路
 *
 * @param cw  画布宽度（用于 isFullCanvasBackground 判断 loose 底部）
 * @param origCh  模板原始画布高度（同上）
 */
export function reflowVenueBlocks(
  layers: PsdLayer[],
  editState: Record<string, Partial<PsdLayer>>,
  cw: number,
  origCh: number,
): {
  nextLayers: PsdLayer[];
  nextEditState: Record<string, Partial<PsdLayer>>;
  nextHeight: number;
} {
  const layerById = new Map<string, PsdLayer>(layers.map((l) => [l.id, l]));
  const blocks = extractBlocks(layers, cw, origCh);

  const reorderable = blocks
    .filter(
      (b): b is Extract<(typeof blocks)[number], { kind: "originalGroup" | "instance" }> =>
        b.kind !== "loose",
    )
    .sort((a, b) => a.sortKey - b.sortKey);

  const looseLayers = blocks
    .filter((b) => b.kind === "loose")
    .flatMap((b) => b.layers);

  let cursor = TOP_PADDING;
  const updates = new Map<string, number>();

  for (const block of reorderable) {
    // 只用叶子 layer 的坐标算 block 的 minY / maxBottom
    const visibleLeaves = block.layers.filter(
      (l) => l.layerType !== "group" && isLayerVisible(l, layerById, editState),
    );
    if (visibleLeaves.length === 0) continue;

    const minY = visibleLeaves.reduce((m, l) => (l.y < m ? l.y : m), Infinity);
    const maxBottom = visibleLeaves.reduce(
      (m, l) => (l.y + l.height > m ? l.y + l.height : m),
      0,
    );
    const dy = cursor - minY;
    // 所有 block 成员（含 group 自身）整体平移同一个 dy，保持内部相对位置
    for (const l of block.layers) {
      updates.set(l.id, l.y + dy);
    }
    cursor += maxBottom - minY + GAP;
  }

  // looseBottom：排除 isFullCanvasBackground 铺底背景，避免延伸背景撑高画布
  const looseBottom = looseLayers
    .filter((l) => l.layerType !== "group" && !isFullCanvasBackground(l, cw, origCh))
    .reduce((m, l) => (l.y + l.height > m ? l.y + l.height : m), 0);

  const nextHeight =
    Math.max(cursor, looseBottom, ABSOLUTE_MIN) + CANVAS_BOTTOM_PADDING;

  // 构造 nextLayers；updates 为空或每项 newY === l.y 时短路返回原引用
  let layersChanged = false;
  const nextLayers = layers.map((l) => {
    const newY = updates.get(l.id);
    if (newY === undefined || newY === l.y) return l;
    layersChanged = true;
    return { ...l, y: newY };
  });

  // 清除被 reflow 覆盖的 editState[id].y（D8）
  let editStateChanged = false;
  let nextEditState = editState;
  for (const id of updates.keys()) {
    const entry = editState[id];
    if (!entry || entry.y === undefined) continue;
    if (!editStateChanged) {
      nextEditState = { ...editState };
      editStateChanged = true;
    }
    const copy: Partial<PsdLayer> = { ...entry };
    delete copy.y;
    if (Object.keys(copy).length === 0) {
      const rest = { ...nextEditState };
      delete rest[id];
      nextEditState = rest;
    } else {
      nextEditState = { ...nextEditState, [id]: copy };
    }
  }

  return {
    nextLayers: layersChanged ? nextLayers : layers,
    nextEditState: editStateChanged ? nextEditState : editState,
    nextHeight,
  };
}
