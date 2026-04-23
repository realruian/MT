import type { PsdLayer } from "@/types/template";

/**
 * venue 画布的可拖拽"块"抽象：
 * - originalGroup：来自原始 PSD 的顶层 Group（parentId==null、非 instance）
 * - instance：由"会场组件库"插入的组件实例（按 instanceId 聚合）
 * - loose：其余图层（如全铺底背景），不参与 autolayout 排序
 *
 * sortKey = 该 block 首个 layer 在 layers 数组中的下标，维持稳定插入顺序。
 */
export type Block =
  | { kind: "originalGroup"; groupId: string; layers: PsdLayer[]; sortKey: number }
  | { kind: "instance"; instanceId: string; layers: PsdLayer[]; sortKey: number }
  | { kind: "loose"; layers: PsdLayer[] };

/**
 * 从 venue layers 数组中抽取 Block 列表。
 *
 * 分类规则（互斥、完备）：
 * 1. layerType==="group" && parentId==null && !instanceId  → originalGroup block
 *    其所有后代（递归 parentId 链）也归入该 block
 * 2. instanceId 非空  → instance block（同 instanceId 共享一个 block）
 * 3. 其余（顶层散叶 / isFullCanvasBackground 背景等）→ loose（合并为单个 block）
 *
 * canvasWidth / canvasHeight 保留为接口参数以供未来过滤逻辑扩展。
 */
export function extractBlocks(
  layers: PsdLayer[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _canvasWidth: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _canvasHeight: number,
): Block[] {
  // 建立 parentId → 直接子 id 的映射（含所有层级）
  const childrenOf = new Map<string, string[]>();
  for (const l of layers) {
    if (l.parentId) {
      if (!childrenOf.has(l.parentId)) childrenOf.set(l.parentId, []);
      childrenOf.get(l.parentId)!.push(l.id);
    }
  }

  // 递归收集 groupId 下所有后代 id（深度优先，写入已有 Set）
  function collectDescendants(groupId: string, out: Set<string>) {
    for (const cid of childrenOf.get(groupId) ?? []) {
      out.add(cid);
      collectDescendants(cid, out);
    }
  }

  // 顶层原始 group：不属于任何 instance，parentId 为空的 group
  const topGroupIds = new Set<string>();
  for (const l of layers) {
    if (l.layerType === "group" && l.parentId == null && !l.instanceId) {
      topGroupIds.add(l.id);
    }
  }

  // 每个顶层 group 拥有的所有 layer id（含 group 自身）
  const ownedByGroup = new Map<string, Set<string>>();
  const ownedIds = new Set<string>();
  for (const gid of topGroupIds) {
    const ids = new Set<string>([gid]);
    collectDescendants(gid, ids);
    ownedByGroup.set(gid, ids);
    for (const id of ids) ownedIds.add(id);
  }

  const blocks: Block[] = [];

  // 1. originalGroup blocks — 按 group 在 layers 数组中的下标排入
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!topGroupIds.has(l.id)) continue;
    const ids = ownedByGroup.get(l.id)!;
    const blockLayers = layers.filter((bl) => ids.has(bl.id));
    blocks.push({ kind: "originalGroup", groupId: l.id, layers: blockLayers, sortKey: i });
  }

  // 2. instance blocks — 按 instanceId 聚合，sortKey = 首次出现下标
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
  for (const [instanceId, instLayers] of byInstance) {
    blocks.push({
      kind: "instance",
      instanceId,
      layers: instLayers,
      sortKey: instanceFirstIdx.get(instanceId)!,
    });
  }

  // 3. loose layers：既不属于任何 originalGroup，也没有 instanceId
  const looseLayers = layers.filter((l) => !ownedIds.has(l.id) && !l.instanceId);
  if (looseLayers.length > 0) {
    blocks.push({ kind: "loose", layers: looseLayers });
  }

  return blocks;
}

/**
 * 把 blockKey 对应的 block 在"可拖拽 block 列表"里移到 newIndex 位置。
 *
 * 输出 layers 数组结构：
 * - loose layers 保持原相对顺序在前
 * - reorderable blocks（originalGroup + instance）按新顺序在后，
 *   各 block 内部 layer 相对顺序不变
 *
 * @param newIndex 值域 [0, others.length]；0=排最前，others.length=排最后
 * @returns 新 layers 数组（总是返回新引用，调用方可直接 setLayers）
 */
export function reorderBlockInLayers(
  layers: PsdLayer[],
  blockKey: { kind: "originalGroup" | "instance"; id: string },
  newIndex: number,
): PsdLayer[] {
  const blocks = extractBlocks(layers, 0, 0);

  const looseLayers = blocks
    .filter((b): b is Extract<Block, { kind: "loose" }> => b.kind === "loose")
    .flatMap((b) => b.layers);

  const reorderable = blocks
    .filter(
      (b): b is Extract<Block, { kind: "originalGroup" | "instance" }> =>
        b.kind !== "loose",
    )
    .sort((a, b) => a.sortKey - b.sortKey);

  const dragIdx = reorderable.findIndex((b) =>
    b.kind === blockKey.kind &&
    (b.kind === "originalGroup" ? b.groupId === blockKey.id : b.instanceId === blockKey.id),
  );
  if (dragIdx === -1) return [...layers];

  const dragged = reorderable[dragIdx];
  const others = reorderable.filter((_, i) => i !== dragIdx);
  const clamped = Math.max(0, Math.min(newIndex, others.length));

  const newOrder = [
    ...others.slice(0, clamped),
    dragged,
    ...others.slice(clamped),
  ];

  // 各 block 内部保持 layers 数组中的原始相对顺序
  const reorderedBlockLayers = newOrder.flatMap((b) => {
    const blockIds = new Set(b.layers.map((l) => l.id));
    return layers.filter((l) => blockIds.has(l.id));
  });

  return [...looseLayers, ...reorderedBlockLayers];
}
