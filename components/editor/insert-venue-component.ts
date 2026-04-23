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
 * venue 画布极端塌底兜底（px）：所有可见 layer 都被隐藏 / 未加载时画布至少
 * 保持这个高度，避免视觉上塌到 0 / 过小导致空白列无法点击。
 */
const MIN_VENUE_CANVAS_HEIGHT = 200;

/**
 * 判断一个原始图层是不是"铺满画布 / 延伸到画布外的装饰性背景"。
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

/**
 * 计算 venue 原始内容（非插入组件）当前可见的底部 y+height。
 *
 * - 排除：插入组件（instanceId）/ group / hidden（DB 或 editState 标记为
 *   不可见）/ 铺满画布的背景图
 * - 空集兜底：若排除铺底后没有可见 layer，回退到"不排除铺底"的 bottom；
 *   仍空则返回 MIN_VENUE_CANVAS_HEIGHT 给画布一个可视化兜底
 *
 * 该值会被 reflow 和 recomputeVenueHeight 同时消费作为"venue 原内容下边界"，
 * 每次调用都动态算，不缓存 —— 用户隐藏 / 显示 venue 原 layer 时画布能跟着
 * 收缩 / 扩大。
 */
export function computeOriginalContentBottom(
  layers: PsdLayer[],
  editState: Record<string, Partial<PsdLayer>>,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const effBottom = (l: PsdLayer) => {
    const eff = editState[l.id] ?? {};
    const y = typeof eff.y === "number" ? eff.y : l.y;
    const h = typeof eff.height === "number" ? eff.height : l.height;
    return y + h;
  };
  const isVisible = (l: PsdLayer) => {
    const eff = editState[l.id] ?? {};
    const v = eff.visible !== undefined ? eff.visible : l.visible;
    return v === true || String(v) === "true";
  };

  // 先收集被隐藏的 group id；叶子若父 group 隐藏则级联跳过
  // （venue 顶层 group 会通过 editState.visible=false 整组隐藏，子叶子 DB
  // visible 仍是 true，需要在这里手动级联才能正确收缩画布）
  const hiddenGroupIds = new Set<string>();
  for (const l of layers) {
    if (l.layerType !== "group") continue;
    if (!isVisible(l)) hiddenGroupIds.add(l.id);
  }

  const originals = layers.filter(
    (l) =>
      !l.instanceId &&
      l.layerType !== "group" &&
      isVisible(l) &&
      !(l.parentId && hiddenGroupIds.has(l.parentId)),
  );
  const excludingBg = originals.filter(
    (l) => !isFullCanvasBackground(l, canvasWidth, canvasHeight),
  );
  if (excludingBg.length > 0) {
    return excludingBg.reduce(
      (m, l) => (effBottom(l) > m ? effBottom(l) : m),
      0,
    );
  }
  if (originals.length > 0) {
    return originals.reduce(
      (m, l) => (effBottom(l) > m ? effBottom(l) : m),
      0,
    );
  }
  return MIN_VENUE_CANVAS_HEIGHT;
}

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
/**
 * venue 插入组件的垂直自动布局（reflow）：
 * - 按 instanceId 聚合"组件实例"，按 layers 数组中首次出现的下标排序
 *   （= 插入时间顺序）
 * - 跳过隐藏的实例（editState[group.id].visible=false，"删除模块"路径）
 * - 从 originalContentBottom + 24 开始，给每个可见实例依次分配 y；实例内
 *   所有 layer 整体平移同一个 dy，保持相对位置（bg/text/group 都跟着移）
 * - 清除 editState[id].y（用户手动拖动过的覆盖）：reflow 之后以 layer.y
 *   为准。Demo 阶段"自动布局优先"，手动拖动会被下一次 reflow 覆盖
 * - originalContentBottom = venue 原 PSD 可见叶子图层（sourceComponentId
 *   为空）的 max(y + h)，每次 reflow 动态算，确保 venue 原内容也能被
 *   编辑后保持正确衔接
 *
 * 无变化时返回 layers / editState 原引用（===），供调用方短路避免无限循环。
 */
export function reflowVenueComponents(
  layers: PsdLayer[],
  editState: Record<string, Partial<PsdLayer>>,
  canvasWidth: number,
  canvasHeight: number,
): {
  nextLayers: PsdLayer[];
  nextEditState: Record<string, Partial<PsdLayer>>;
} {
  // 1. venue 原 PSD 可见内容的底部（排除铺底背景），reflow 起点
  const originalBottom = computeOriginalContentBottom(
    layers,
    editState,
    canvasWidth,
    canvasHeight,
  );

  // 2. 按 instanceId 聚合，记录首次出现下标（= 插入顺序）
  const instanceFirstIdx = new Map<string, number>();
  const byInstance = new Map<string, PsdLayer[]>();
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!l.instanceId) continue;
    if (!byInstance.has(l.instanceId)) {
      byInstance.set(l.instanceId, []);
      instanceFirstIdx.set(l.instanceId, i);
    }
    byInstance.get(l.instanceId)!.push(l);
  }

  // 3. 过滤隐藏的实例（其 root group 被 editState.visible=false 标记）
  const visibleInstances: { instanceId: string; inst: PsdLayer[] }[] = [];
  for (const [instanceId, inst] of byInstance) {
    const root = inst.find((l) => l.layerType === "group" && l.parentId == null);
    if (root) {
      const eff = editState[root.id] ?? {};
      const effVisible = eff.visible !== undefined ? eff.visible : root.visible;
      if (!(effVisible === true || String(effVisible) === "true")) continue;
    }
    visibleInstances.push({ instanceId, inst });
  }
  visibleInstances.sort(
    (a, b) =>
      (instanceFirstIdx.get(a.instanceId) ?? 0) -
      (instanceFirstIdx.get(b.instanceId) ?? 0),
  );

  // 4. 从 originalBottom + 24 开始依次分配实例顶部 y；收集 (layerId → newY)
  let cursor = originalBottom === 0 ? 0 : originalBottom + INSERT_GAP;
  const updates = new Map<string, number>();
  for (const { inst } of visibleInstances) {
    const minY = inst.reduce(
      (m, l) => (l.y < m ? l.y : m),
      Number.POSITIVE_INFINITY,
    );
    const maxBot = inst.reduce(
      (m, l) => (l.y + l.height > m ? l.y + l.height : m),
      0,
    );
    const dy = cursor - minY;
    if (dy !== 0) {
      for (const l of inst) {
        updates.set(l.id, l.y + dy);
      }
    }
    cursor += maxBot - minY + INSERT_GAP;
  }

  // 5. 构造 nextLayers；updates 为空 / 每项 newY === l.y 都短路返回原引用
  let layersChanged = false;
  const nextLayers = layers.map((l) => {
    const newY = updates.get(l.id);
    if (newY === undefined || newY === l.y) return l;
    layersChanged = true;
    return { ...l, y: newY };
  });

  // 6. 清除被 reflow 覆盖的 layer 对应 editState.y（避免 eff y 继续指向
  //    用户之前的手动拖动位置，掩盖 reflow 结果）
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
  };
}

export function recomputeVenueHeight(
  layers: PsdLayer[],
  editState: Record<string, Partial<PsdLayer>>,
  canvasWidth: number,
  canvasHeight: number,
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

  // 插入组件的 bottom（可见叶子 eff y+h 的最大值）
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

  // venue 原始内容可见 bottom（排除铺底背景 + 动态算，不缓存）
  const originalBottom = computeOriginalContentBottom(
    layers,
    editState,
    canvasWidth,
    canvasHeight,
  );

  // 画布高度 = max(原始内容底部, 插入组件底部) + 底部 padding；再和极端
  // 兜底 MIN_VENUE_CANVAS_HEIGHT 取大，防止画布塌到太小
  const contentBottom =
    insertedBottom > originalBottom ? insertedBottom : originalBottom;
  const next = contentBottom + CANVAS_BOTTOM_PADDING;
  return next < MIN_VENUE_CANVAS_HEIGHT ? MIN_VENUE_CANVAS_HEIGHT : next;
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

  // 根：component.payload.layers 里第一个 parentId==null 的 layer（通常就是 group 根）
  const rootOrigId =
    component.payload.layers.find((l) => l.parentId == null)?.id ?? null;
  const rootLayerId = rootOrigId ? (idMap.get(rootOrigId) ?? null) : null;

  return {
    nextLayers: [...layers, ...cloned],
    rootLayerId,
  };
}
