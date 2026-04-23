"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Redo2, Undo2 } from "lucide-react";
import type { Template, PsdLayer } from "@/types/template";
import { VENUE_CANVAS_ID, type Slot } from "./editor-shell";
import { extractBlocks } from "./venue-blocks";

/** venue block 拖拽中目标 block 的位置信息 */
interface BlockTarget {
  blockKey: { kind: "originalGroup" | "instance"; id: string };
  top: number;
  bottom: number;
  centerY: number;
  height: number;
}

interface CanvasStageProps {
  template: Template;
  slot: Slot;
  layers: PsdLayer[];
  loading: boolean;
  editState: Record<string, Partial<PsdLayer>>;
  selection: { moduleId?: string; layerId?: string } | null;
  onSelect: (sel: { moduleId?: string; layerId?: string } | null) => void;
  onUpdate: (id: string, updates: Partial<PsdLayer>) => void;
  /** venue block 换位回调：把 blockKey 对应的 block 移到 others 数组中 newIndex 位置 */
  onReorderBlock?: (
    blockKey: { kind: "originalGroup" | "instance"; id: string },
    newIndex: number,
  ) => void;
  /** editor-shell 持有：绑定 venue 滚动容器，供插入组件后自动定位 */
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>;
  /** editor-shell 持有：实时同步当前 scale，供坐标转换 */
  scaleRef?: React.MutableRefObject<number>;
  /** 是否可撤销（historyPast 非空） */
  canUndo: boolean;
  /** 是否可重做（historyFuture 非空） */
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function CanvasStage({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  template,
  slot,
  layers,
  loading,
  editState,
  selection,
  onSelect,
  onUpdate,
  onReorderBlock,
  scrollRef,
  scaleRef,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: CanvasStageProps) {
  // Mac 平台判断，用于 tooltip 快捷键显示
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
  // 画布尺寸来自当前 slot —— 一键拓展生成的新 slot 会有不同的 width/height，
  // 图层仍按 PSD 原始坐标渲染，超出画布的部分会被 overflow: hidden 裁掉。
  const cw = slot.width;
  const ch = slot.height;
  // 画布背景色：venue 走 editState 虚拟 id（享受 undo）覆盖 slot.bgColor 默认；
  // 其他 slot（延展）直接用 slot.bgColor 或默认白
  const effBgColor =
    slot.id === "venue"
      ? (editState[VENUE_CANVAS_ID]?.fontColor ?? slot.bgColor ?? "#FFFFFF")
      : (slot.bgColor ?? "#FFFFFF");

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  // venue：仅按宽度适配（高度超出垂直滚动）；其他 slot：按宽高都适配（完整显示）。
  // MAX_SCALE = 1 防止小画布被放大模糊；FIT_PADDING 两侧各留 40px 呼吸空间。
  const FIT_PADDING = 40;
  const MAX_SCALE = 1.0;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !cw) return;
    const isVenue = slot.id === "venue";
    const observer = new ResizeObserver(([entry]) => {
      const availW = entry.contentRect.width - FIT_PADDING * 2;
      const availH = entry.contentRect.height - FIT_PADDING * 2;
      const fitWidth = availW / cw;
      const fitHeight = availH / ch;
      const s = isVenue
        ? Math.min(fitWidth, MAX_SCALE)              // venue：宽度适配，高度不参与
        : Math.min(fitWidth, fitHeight, MAX_SCALE);  // 其他：宽高都约束，完整适配
      setScale(Math.max(0.1, s));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [cw, ch, slot.id]);

  // 切换 slot 时滚动回顶部，不保留上一个 slot 的滚动位置
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [slot.id]);

  // 把当前 scale 同步给 scaleRef（editor-shell 插入组件后坐标换算用）
  useEffect(() => {
    if (scaleRef) scaleRef.current = scale;
  }, [scale, scaleRef]);

  // 读取图层字段的"有效值"：优先 editState 覆盖，否则回落到 DB 原值
  function getVal<K extends keyof PsdLayer>(layer: PsdLayer, key: K): PsdLayer[K] {
    const o = editState[layer.id];
    if (o && o[key] !== undefined) return o[key] as PsdLayer[K];
    return layer[key];
  }

  // 顶层 Group 隐藏时，其子层级联隐藏
  const groupVisibility = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const l of layers) {
      if (l.layerType === "group") {
        const v = editState[l.id]?.visible ?? l.visible;
        map.set(l.id, v === true || String(v) === "true");
      }
    }
    return map;
  }, [layers, editState]);

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => a.zIndex - b.zIndex),
    [layers],
  );

  const selectedGroup = useMemo(() => {
    if (!selection?.moduleId) return null;
    return layers.find((l) => l.id === selection.moduleId) ?? null;
  }, [layers, selection]);

  const selectedLayer = useMemo(() => {
    if (!selection?.layerId) return null;
    return layers.find((l) => l.id === selection.layerId) ?? null;
  }, [layers, selection]);

  // 画布内原地编辑文字：editingId 为当前处于编辑态的 layerId；draftText 为未提交的输入
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);
  const [draftText, setDraftText] = useState("");
  const initialTextRef = useRef<string>("");
  const draftTextRef = useRef<string>("");
  useEffect(() => {
    draftTextRef.current = draftText;
  }, [draftText]);

  const commitEdit = useCallback(() => {
    const id = editingIdRef.current;
    if (!id) return;
    const next = draftTextRef.current;
    if (next !== initialTextRef.current) {
      onUpdate(id, { textContent: next });
    }
    setEditingId(null);
  }, [onUpdate]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  // 编辑中切到其他图层 / 取消选择 → 自动提交
  useEffect(() => {
    if (editingId && selection?.layerId !== editingId) {
      commitEdit();
    }
  }, [selection, editingId, commitEdit]);

  // 拖拽状态：
  // - element：元素级（单个 layer，自由移动）
  // - module：模块级（group + 所有子图层，自由移动 + 吸附对齐）
  // - venue-block：venue block 换位模式（originalGroup 或 instance，只允许 y
  //   方向，松手触发 layers 数组 splice；拖拽期间只写 transient state，不写
  //   editState，这样 reflow useEffect 不会被中间帧触发）
  type DragState =
    | {
        mode: "element";
        layerId: string;
        startMouseX: number;
        startMouseY: number;
        startLayerX: number;
        startLayerY: number;
      }
    | {
        mode: "module";
        moduleId: string;
        startMouseX: number;
        startMouseY: number;
        /** key: layerId（含 group 自身和所有子层），value: 起始 x/y */
        startPositions: Map<string, { x: number; y: number }>;
      }
    | {
        mode: "venue-block";
        blockKey: { kind: "originalGroup" | "instance"; id: string };
        startMouseY: number;
        /** 被拖 block 起始最小 y（顶部） */
        startMinY: number;
        /** 被拖 block bbox 高度 = max(y+h) - min(y) */
        blockHeight: number;
        /** 其他 block 在 dragstart 时的位置信息（排除被拖 block） */
        others: BlockTarget[];
        /** 被拖 block 顶部最小允许值（TOP_PADDING = 24） */
        minTop: number;
      };
  const [dragging, setDragging] = useState<DragState | null>(null);
  // 吸附参考线：拖拽时命中的对齐目标（画布 4 边 / 中线 + 兄弟元素 4 边 / 中线）
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  /**
   * venue block 换位的 transient 状态：只在 mode="venue-block" 拖拽期间有值。
   * - dy：被拖 block 相对起始位置的垂直偏移，用于渲染时叠加平移
   * - dropIndex：松手后 block 将插入到 others 数组中的下标
   * 不写到 editState 是刻意的：写了会触发 reflow useEffect 立刻把 block 弹回 y，
   * 同时污染 undo 栈。换位结束由 onReorderBlock 重排 layers 数组完成。
   */
  const [blockDrag, setBlockDrag] = useState<{
    blockKey: { kind: "originalGroup" | "instance"; id: string };
    dy: number;
    dropIndex: number;
    dropIndicatorY: number;
  } | null>(null);
  const blockDragRef = useRef(blockDrag);
  useEffect(() => {
    blockDragRef.current = blockDrag;
  }, [blockDrag]);

  useEffect(() => {
    if (!dragging) return;
    const threshold = 6 / scale; // 6 显示像素对应的画布像素阈值

    // 可对齐的目标坐标集合：画布 4 边 + 中线 2 条始终全局有效；
    // 兄弟图层按轴分别只在与源投影重叠时参与，避免顶部 logo 被底部按钮误吸附。
    const buildTargets = (
      src: { x: number; y: number; w: number; h: number },
      excludeIds: Set<string>,
    ) => {
      const xs: number[] = [0, cw, cw / 2];
      const ys: number[] = [0, ch, ch / 2];

      const srcLeft = src.x;
      const srcRight = src.x + src.w;
      const srcTop = src.y;
      const srcBottom = src.y + src.h;

      for (const l of layers) {
        if (excludeIds.has(l.id)) continue;
        if (l.layerType === "group") continue;
        if (l.parentId && groupVisibility.get(l.parentId) === false) continue;
        const vis = l.visible === true || String(l.visible) === "true";
        if (!vis) continue;
        const lx = getVal(l, "x") as number;
        const ly = getVal(l, "y") as number;
        const lw = getVal(l, "width") as number;
        const lh = getVal(l, "height") as number;

        // X 轴目标（竖参考线）：要求目标 Y 范围与源 Y 范围重叠
        if (ly <= srcBottom && ly + lh >= srcTop) {
          xs.push(lx, lx + lw, lx + lw / 2);
        }
        // Y 轴目标（横参考线）：要求目标 X 范围与源 X 范围重叠
        if (lx <= srcRight && lx + lw >= srcLeft) {
          ys.push(ly, ly + lh, ly + lh / 2);
        }
      }
      return { xs, ys };
    };

    const onMove = (e: MouseEvent) => {
      if (dragging.mode === "venue-block") {
        // y 方向平移；x 锁定 —— block 位置由 reflow 决定
        const rawDy = (e.clientY - dragging.startMouseY) / scale;
        const minDy = dragging.minTop - dragging.startMinY;
        const dy = rawDy < minDy ? minDy : rawDy;

        const draggedCenterY =
          dragging.startMinY + dy + dragging.blockHeight / 2;
        const draggedOriginCenterY =
          dragging.startMinY + dragging.blockHeight / 2;
        const movingDown = draggedCenterY > draggedOriginCenterY;

        // 带 hysteresis 的 dropIndex：向下拖越过目标 75%，向上拖越过目标 25%
        let dropIndex = dragging.others.length;
        for (let i = 0; i < dragging.others.length; i++) {
          const o = dragging.others[i];
          const threshold = movingDown
            ? o.centerY + o.height * 0.25
            : o.centerY - o.height * 0.25;
          if (draggedCenterY < threshold) {
            dropIndex = i;
            break;
          }
        }

        // drop indicator y：缝隙中心；端点情况贴边
        let dropIndicatorY: number;
        if (dragging.others.length === 0) {
          dropIndicatorY = dragging.minTop - 12;
        } else if (dropIndex === 0) {
          dropIndicatorY = (dragging.minTop + dragging.others[0].top) / 2;
        } else if (dropIndex === dragging.others.length) {
          dropIndicatorY = dragging.others[dropIndex - 1].bottom + 12;
        } else {
          dropIndicatorY =
            (dragging.others[dropIndex - 1].bottom +
              dragging.others[dropIndex].top) /
            2;
        }

        setBlockDrag({
          blockKey: dragging.blockKey,
          dy,
          dropIndex,
          dropIndicatorY,
        });

        // 拖拽边缘自动滚动：仅 venue（有滚动条）时触发；cursor 距 viewport 顶/底 < 80px 时滚动
        if (slot.id === "venue") {
          const scrollEl = scrollContainerRef.current;
          if (scrollEl) {
            const rect = scrollEl.getBoundingClientRect();
            const distFromTop = e.clientY - rect.top;
            const distFromBottom = rect.bottom - e.clientY;
            if (distFromTop < 80) scrollEl.scrollBy({ top: -10 });
            else if (distFromBottom < 80) scrollEl.scrollBy({ top: 10 });
          }
        }
        return;
      }
      if (dragging.mode === "element") {
        const dx = (e.clientX - dragging.startMouseX) / scale;
        const dy = (e.clientY - dragging.startMouseY) / scale;
        const layer = layers.find((l) => l.id === dragging.layerId);
        if (!layer) return;
        const lw = getVal(layer, "width") as number;
        const lh = getVal(layer, "height") as number;
        const tentativeX = dragging.startLayerX + dx;
        const tentativeY = dragging.startLayerY + dy;
        const excludeIds = new Set<string>([layer.id]);
        const targets = buildTargets(
          { x: tentativeX, y: tentativeY, w: lw, h: lh },
          excludeIds,
        );
        const snap = computeSnap(
          { x: tentativeX, y: tentativeY, w: lw, h: lh },
          targets.xs,
          targets.ys,
          threshold,
        );
        setSnapGuides(snap.guides);
        onUpdate(dragging.layerId, {
          x: Math.round(tentativeX + snap.dx),
          y: Math.round(tentativeY + snap.dy),
        });
        return;
      }

      // module 模式：按 delta 平移 group 自身 + 所有已记录子图层
      const dx = (e.clientX - dragging.startMouseX) / scale;
      const dy = (e.clientY - dragging.startMouseY) / scale;
      const group = layers.find((l) => l.id === dragging.moduleId);
      if (!group) return;
      const groupStart = dragging.startPositions.get(group.id);
      if (!groupStart) return;
      const gw = getVal(group, "width") as number;
      const gh = getVal(group, "height") as number;
      const tentativeX = groupStart.x + dx;
      const tentativeY = groupStart.y + dy;
      // 排除 group 自身 + 所有被拖动的子层，避免自己对齐自己
      const excludeIds = new Set<string>([group.id]);
      for (const id of dragging.startPositions.keys()) excludeIds.add(id);
      const targets = buildTargets(
        { x: tentativeX, y: tentativeY, w: gw, h: gh },
        excludeIds,
      );
      const snap = computeSnap(
        { x: tentativeX, y: tentativeY, w: gw, h: gh },
        targets.xs,
        targets.ys,
        threshold,
      );
      setSnapGuides(snap.guides);
      const finalDx = dx + snap.dx;
      const finalDy = dy + snap.dy;
      for (const [id, start] of dragging.startPositions) {
        onUpdate(id, {
          x: Math.round(start.x + finalDx),
          y: Math.round(start.y + finalDy),
        });
      }
    };
    const onUp = () => {
      if (dragging.mode === "venue-block") {
        const preview = blockDragRef.current;
        setDragging(null);
        setSnapGuides([]);
        setBlockDrag(null);
        if (!preview) return;
        // 微小幅度视为无操作，transient state 已清空 → 视觉弹回
        if (Math.abs(preview.dy) < 10) return;

        // 判断换位后顺序是否真的变化：先按 layers 首次出现顺序取出所有 block，
        // splice 后对比；没变化就不通知 shell，避免空转一圈
        const blocks = extractBlocks(layers, cw, ch);
        const reorderable = blocks
          .filter(
            (b): b is Extract<(typeof blocks)[number], { kind: "originalGroup" | "instance" }> =>
              b.kind !== "loose",
          )
          .sort((a, b) => a.sortKey - b.sortKey);

        const bk = dragging.blockKey;
        const draggedIdx = reorderable.findIndex(
          (b) =>
            b.kind === bk.kind &&
            (b.kind === "originalGroup" ? b.groupId === bk.id : b.instanceId === bk.id),
        );
        if (draggedIdx === -1) return;

        const otherOrder = reorderable.filter((_, i) => i !== draggedIdx);
        const newOrder = [
          ...otherOrder.slice(0, preview.dropIndex),
          reorderable[draggedIdx],
          ...otherOrder.slice(preview.dropIndex),
        ];
        const allOrder = reorderable;
        const unchanged =
          newOrder.length === allOrder.length &&
          newOrder.every((b, i) => {
            const a = allOrder[i];
            if (b.kind !== a.kind) return false;
            return b.kind === "originalGroup"
              ? b.groupId === (a as typeof b).groupId
              : b.instanceId === (a as Extract<typeof b, { kind: "instance" }>).instanceId;
          });
        if (unchanged) return;
        onReorderBlock?.(dragging.blockKey, preview.dropIndex);
        return;
      }
      setDragging(null);
      setSnapGuides([]);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, scale, onUpdate, layers, cw, ch, groupVisibility, onReorderBlock]);

  const handleMouseDown = (e: React.MouseEvent, layer: PsdLayer) => {
    // 编辑态下不触发拖拽（让 textarea 自己处理鼠标）
    if (editingId === layer.id) return;

    // 元素级拖拽：该元素已二级选中
    if (selection?.layerId === layer.id) {
      e.stopPropagation();
      e.preventDefault();
      setDragging({
        mode: "element",
        layerId: layer.id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startLayerX: getVal(layer, "x") as number,
        startLayerY: getVal(layer, "y") as number,
      });
      return;
    }

    // 模块级拖拽：父模块已一级选中但未二级选中到具体元素
    if (
      layer.parentId &&
      selection?.moduleId === layer.parentId &&
      !selection?.layerId
    ) {
      e.stopPropagation();
      e.preventDefault();
      const group = layers.find((l) => l.id === layer.parentId);
      if (!group) return;

      // venue block 换位模式：在 venue slot 下、该 group 是 originalGroup 或 instance 时启用。
      // 不走 editState.y 自由平移，而是缓存 "others" 的 y 信息，松手后调
      // onReorderBlock 重排 layers 数组
      if (slot.id === "venue" && onReorderBlock) {
        const isInstance = !!group.instanceId;
        const isOriginalGroup =
          group.layerType === "group" &&
          group.parentId == null &&
          !group.instanceId;

        if (isInstance || isOriginalGroup) {
          const blockKey: { kind: "originalGroup" | "instance"; id: string } =
            isInstance
              ? { kind: "instance", id: group.instanceId! }
              : { kind: "originalGroup", id: group.id };

          // 收集被拖 block 的 y 范围（仅叶子，eff 值）
          const allBlocks = extractBlocks(layers, cw, ch);
          const draggedBlock = allBlocks.find(
            (b) =>
              b.kind === blockKey.kind &&
              (b.kind === "originalGroup"
                ? b.groupId === blockKey.id
                : b.instanceId === blockKey.id),
          );
          if (!draggedBlock) {
            // fallback to module drag
          } else {
            const draggedLeaves = draggedBlock.layers.filter(
              (l) => l.layerType !== "group",
            );
            if (draggedLeaves.length === 0) {
              // empty block, skip
            } else {
              let minY = Infinity;
              let maxBottom = -Infinity;
              for (const l of draggedLeaves) {
                const ly = getVal(l, "y") as number;
                const lh = getVal(l, "height") as number;
                if (ly < minY) minY = ly;
                if (ly + lh > maxBottom) maxBottom = ly + lh;
              }

              // 其他可拖拽 block 按 sortKey 排序，计算各自的 top/bottom/centerY
              const reorderable = allBlocks
                .filter(
                  (b): b is Extract<
                    (typeof allBlocks)[number],
                    { kind: "originalGroup" | "instance" }
                  > => b.kind !== "loose",
                )
                .sort((a, b) => a.sortKey - b.sortKey);

              const others: BlockTarget[] = reorderable
                .filter(
                  (b) =>
                    !(
                      b.kind === blockKey.kind &&
                      (b.kind === "originalGroup"
                        ? b.groupId === blockKey.id
                        : b.instanceId === blockKey.id)
                    ),
                )
                .map((b) => {
                  const leaves = b.layers.filter(
                    (l) => l.layerType !== "group",
                  );
                  const top = leaves.reduce(
                    (m, l) => Math.min(m, getVal(l, "y") as number),
                    Infinity,
                  );
                  const bottom = leaves.reduce(
                    (m, l) =>
                      Math.max(
                        m,
                        (getVal(l, "y") as number) +
                          (getVal(l, "height") as number),
                      ),
                    0,
                  );
                  const bk: { kind: "originalGroup" | "instance"; id: string } =
                    b.kind === "originalGroup"
                      ? { kind: "originalGroup", id: b.groupId }
                      : { kind: "instance", id: b.instanceId };
                  return {
                    blockKey: bk,
                    top: isFinite(top) ? top : 0,
                    bottom,
                    centerY: isFinite(top) ? (top + bottom) / 2 : 0,
                    height: isFinite(top) ? bottom - top : 0,
                  };
                });

              setDragging({
                mode: "venue-block",
                blockKey,
                startMouseY: e.clientY,
                startMinY: minY,
                blockHeight: maxBottom - minY,
                others,
                minTop: 24, // TOP_PADDING (D4)
              });
              return;
            }
          }
        }
      }

      const startPositions = new Map<string, { x: number; y: number }>();
      startPositions.set(group.id, {
        x: getVal(group, "x") as number,
        y: getVal(group, "y") as number,
      });
      for (const c of layers.filter((l) => l.parentId === group.id)) {
        startPositions.set(c.id, {
          x: getVal(c, "x") as number,
          y: getVal(c, "y") as number,
        });
      }
      setDragging({
        mode: "module",
        moduleId: group.id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startPositions,
      });
    }
  };

  return (
    <div className="relative flex-1 min-w-0 min-h-0">
      {/* Loading overlay — absolute，覆盖滚动容器 */}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-[#999]">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-xs">尺寸延展中，请稍后...</span>
          </div>
        </div>
      )}

      {/* venue：垂直滚动容器；其他 slot：overflow-hidden + flex 完整居中 */}
      <div
        ref={(el) => {
          (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          if (scrollRef) scrollRef.current = el;
        }}
        onClick={() => onSelect(null)}
        className={[
          "absolute inset-0",
          slot.id === "venue"
            ? "overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
            : "overflow-hidden flex items-center justify-center",
        ].join(" ")}
      >
      {/* venue：flex 居中 + 上下呼吸空间；其他 slot：display:contents 透传给外层 flex */}
      <div className={slot.id === "venue" ? "flex justify-center py-10 min-h-full" : "contents"}>
        {/* 画布块：不再绝对定位，由 flexbox 居中 */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: cw * scale,
            height: ch * scale,
            flexShrink: 0,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            background: effBgColor,
            overflow: "clip",
            contain: "strict",
          }}
        >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: cw,
                height: ch,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                overflow: "hidden",
                background: effBgColor,
              }}
            >
              {sortedLayers.map((layer) => {
                if (layer.layerType === "group") return null;
                if (layer.parentId && groupVisibility.get(layer.parentId) === false) return null;
                const visible = layer.visible === true || String(layer.visible) === "true";
                if (!visible) return null;

                const x = getVal(layer, "x");
                // venue block 换位拖拽：被拖 block 的 layer 渲染时叠加 transient dy
                // 并把 opacity 打 0.7 折——属于 transient 视觉态，不写 editState
                const isBlockBeingDragged =
                  blockDrag != null &&
                  blockDrag.blockKey.kind === "instance" &&
                  layer.instanceId === blockDrag.blockKey.id
                    ? true
                    : blockDrag != null &&
                      blockDrag.blockKey.kind === "originalGroup" &&
                      (layer.parentId === blockDrag.blockKey.id ||
                        layer.id === blockDrag.blockKey.id);
                const baseY = getVal(layer, "y") as number;
                const y = isBlockBeingDragged
                  ? baseY + blockDrag!.dy
                  : baseY;
                const w = getVal(layer, "width");
                const h = getVal(layer, "height");
                const baseOpacity = getVal(layer, "opacity") as number;
                const opacity = isBlockBeingDragged
                  ? baseOpacity * 0.7
                  : baseOpacity;
                const rot = getVal(layer, "rotation") ?? 0;

                const handleLeafClick = layer.parentId
                  ? (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (selection?.moduleId === layer.parentId) {
                        // 模块已选中 → 二级选中到元素
                        onSelect({ moduleId: layer.parentId!, layerId: layer.id });
                      } else {
                        // 未选或选中其他模块 → 切到本模块
                        onSelect({ moduleId: layer.parentId! });
                      }
                    }
                  : (e: React.MouseEvent) => {
                      // 顶层叶子 layer（无 parentId / 扁平 PSD）：直接二级选中
                      e.stopPropagation();
                      onSelect({ layerId: layer.id });
                    };

                if (layer.layerType === "text") {
                  const text = getVal(layer, "textContent") ?? "";
                  const isMultiLine = text.includes("\n");
                  const fs = getVal(layer, "fontSize") ?? 16;
                  const lh = getVal(layer, "lineHeight");
                  // 防御异常 lineHeight：脏数据里 leading 可能远大于 fontSize，导致文字视觉下移。
                  // 超过 fontSize × 2 时视为异常，退回默认行高。
                  const safeLh =
                    lh && lh > fs && lh <= fs * 2 ? `${lh}px` : 1.3;
                  const ls = getVal(layer, "letterSpacing");
                  const isEditing = editingId === layer.id;

                  // 共享定位 + 文字样式：保证 textarea 编辑态和 div 展示态位置 / 字体 / 行高完全一致
                  const baseStyle: React.CSSProperties = {
                    position: "absolute",
                    left: x,
                    top: y,
                    width: isMultiLine || isEditing ? w : undefined,
                    minWidth: w,
                    opacity,
                    fontSize: fs,
                    fontFamily: `"${getVal(layer, "fontFamily") ?? "sans-serif"}", sans-serif`,
                    color: getVal(layer, "fontColor") ?? "#000",
                    fontWeight: getVal(layer, "fontWeight") ?? "normal",
                    fontStyle: (getVal(layer, "fontStyle") as React.CSSProperties["fontStyle"]) ?? "normal",
                    lineHeight: safeLh,
                    letterSpacing: typeof ls === "number" ? `${ls}px` : undefined,
                    textAlign: (getVal(layer, "textAlign") as React.CSSProperties["textAlign"]) ?? "left",
                    whiteSpace: isMultiLine || isEditing ? "pre-wrap" : "nowrap",
                    zIndex: layer.zIndex,
                    transform: rot ? `rotate(${rot}deg)` : undefined,
                    transformOrigin: "left top",
                    // 限制横向最大宽度不超过画布剩余空间，元素自身 overflow:hidden 兜底裁剪
                    maxWidth: Math.max(0, cw - (x as number)),
                    overflow: "hidden",
                  };

                  // 编辑态：只渲染 textarea 一个节点，原 div 不再渲染（避免重影）
                  if (isEditing) {
                    return (
                      <InlineTextEditor
                        key={layer.id}
                        baseStyle={baseStyle}
                        value={draftText}
                        onChange={setDraftText}
                        onCommit={commitEdit}
                        onCancel={cancelEdit}
                      />
                    );
                  }

                  return (
                    <div
                      key={layer.id}
                      onClick={handleLeafClick}
                      onMouseDown={(e) => handleMouseDown(e, layer)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        initialTextRef.current = text;
                        draftTextRef.current = text;
                        setDraftText(text);
                        setEditingId(layer.id);
                        if (layer.parentId) {
                          onSelect({ moduleId: layer.parentId, layerId: layer.id });
                        } else {
                          onSelect({ layerId: layer.id });
                        }
                      }}
                      style={{
                        ...baseStyle,
                        userSelect: "none",
                        cursor:
                          selection?.layerId === layer.id ||
                          (!!layer.parentId &&
                            selection?.moduleId === layer.parentId &&
                            !selection?.layerId)
                            ? "move"
                            : layer.parentId
                              ? "pointer"
                              : "default",
                      }}
                    >
                      {text}
                    </div>
                  );
                }

                if (
                  (layer.layerType === "image" || layer.layerType === "background") &&
                  getVal(layer, "imageUrl")
                ) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={layer.id}
                      src={getVal(layer, "imageUrl")!}
                      alt={layer.name}
                      draggable={false}
                      onClick={handleLeafClick}
                      onMouseDown={(e) => handleMouseDown(e, layer)}
                      style={{
                        position: "absolute",
                        left: x,
                        top: y,
                        width: w,
                        height: h,
                        opacity,
                        objectFit: "fill",
                        zIndex: layer.zIndex,
                        transform: rot ? `rotate(${rot}deg)` : undefined,
                        transformOrigin: "left top",
                        userSelect: "none",
                        cursor:
                          selection?.layerId === layer.id ||
                          (!!layer.parentId &&
                            selection?.moduleId === layer.parentId &&
                            !selection?.layerId)
                            ? "move"
                            : layer.parentId
                              ? "pointer"
                              : "default",
                      }}
                    />
                  );
                }
                return null;
              })}

              {/* venue block 拖拽换位：drop indicator 2px 蓝色横线，贴 venue
                  组件水平区间（24 ~ cw-24），提示松手后插入位置 */}
              {blockDrag && (
                <div
                  style={{
                    position: "absolute",
                    left: 24,
                    right: 24,
                    top: blockDrag.dropIndicatorY - 1,
                    height: 2,
                    background: "#3B82F6",
                    borderRadius: 1,
                    pointerEvents: "none",
                    zIndex: 9995,
                  }}
                />
              )}

              {/* 吸附参考线（和图层同一坐标空间，随 scale 一起缩放） */}
              {dragging &&
                snapGuides.map((g, i) =>
                  g.orient === "v" ? (
                    <div
                      key={`v-${i}-${g.pos}`}
                      style={{
                        position: "absolute",
                        left: g.pos - 0.5,
                        top: 0,
                        width: 1,
                        height: ch,
                        background: "#ff2d92",
                        pointerEvents: "none",
                        zIndex: 9996,
                      }}
                    />
                  ) : (
                    <div
                      key={`h-${i}-${g.pos}`}
                      style={{
                        position: "absolute",
                        left: 0,
                        top: g.pos - 0.5,
                        width: cw,
                        height: 1,
                        background: "#ff2d92",
                        pointerEvents: "none",
                        zIndex: 9996,
                      }}
                    />
                  ),
                )}
            </div>

            {/* Group 选中：蓝色描边 bbox（z=9997） */}
            {selectedGroup && (
              <div
                style={{
                  position: "absolute",
                  left: (getVal(selectedGroup, "x") as number) * scale - 2,
                  top: (getVal(selectedGroup, "y") as number) * scale - 2,
                  width: (getVal(selectedGroup, "width") as number) * scale + 4,
                  height: (getVal(selectedGroup, "height") as number) * scale + 4,
                  border: "2px solid #3b82f6",
                  borderRadius: 4,
                  pointerEvents: "none",
                  zIndex: 9997,
                }}
              />
            )}

            {/* 元素选中：紫色描边（z=9998，比 Group 蓝框高） */}
            {selectedLayer && (
              <div
                style={{
                  position: "absolute",
                  left: (getVal(selectedLayer, "x") as number) * scale - 2,
                  top: (getVal(selectedLayer, "y") as number) * scale - 2,
                  width: (getVal(selectedLayer, "width") as number) * scale + 4,
                  height: (getVal(selectedLayer, "height") as number) * scale + 4,
                  border: "2px solid #8b5cf6",
                  borderRadius: 4,
                  pointerEvents: "none",
                  zIndex: 9998,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* 撤销/重做 + 尺寸信息：合并进同一个圆角胶囊，顶部居中固定 */}
      {!loading && (
        <div className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 z-40">
          <div className="pointer-events-auto flex items-center gap-0 rounded-full border border-[#7C889C]/10 bg-white px-1 py-1" style={{ boxShadow: "0 0 10px rgba(0,0,0,0.05)" }}>
            {/* 撤销 */}
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title={isMac ? "撤销 (⌘Z)" : "撤销 (Ctrl+Z)"}
              className="flex size-7 items-center justify-center rounded-full text-[#11192D] transition-colors hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Undo2 className="size-3.5" />
            </button>
            {/* 重做 */}
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title={isMac ? "重做 (⌘⇧Z)" : "重做 (Ctrl+Shift+Z)"}
              className="flex size-7 items-center justify-center rounded-full text-[#11192D] transition-colors hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Redo2 className="size-3.5" />
            </button>
            {/* 分隔线 */}
            <div className="mx-1.5 h-4 w-px bg-[#e5e5e5]" />
            {/* 尺寸 + 缩放 */}
            <span className="pr-2 text-[11px] text-[#999]">
              {cw} × {ch} · {Math.round(scale * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 画布内原地文字编辑：返回一个绝对定位的 textarea，直接替换原文字 div。
 * baseStyle 由父级传入（和展示态 div 共享一组定位/字体样式），保证替换前后零位移。
 * 提交时机仅两个：onBlur → onCommit；Esc → onCancel。Enter 不拦截，走 textarea 默认插入 \n。 */
function InlineTextEditor({
  baseStyle,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  baseStyle: React.CSSProperties;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.select();
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
    ta.style.width = "auto";
    ta.style.width = `${ta.scrollWidth}px`;
  }, []);

  return (
    <textarea
      ref={taRef}
      value={value}
      wrap="off"
      onChange={(e) => onChange(e.target.value)}
      onInput={(e) => {
        const ta = e.currentTarget;
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight}px`;
        ta.style.width = "auto";
        ta.style.width = `${ta.scrollWidth}px`;
      }}
      onBlur={onCommit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      style={{
        ...baseStyle,
        // 不自动折行：只在显式 \n 处换行；宽度跟随内容自增（见 onInput / mount effect）
        width: "auto",
        whiteSpace: "pre",
        overflowX: "hidden",
        overflowY: "hidden",
        padding: 0,
        margin: 0,
        border: "none",
        outline: "none",
        background: "transparent",
        resize: "none",
        userSelect: "text",
        cursor: "text",
        display: "block",
      }}
    />
  );
}

/** 吸附参考线：v=垂直（竖线，位于 x=pos），h=水平（横线，位于 y=pos） */
type SnapGuide = { orient: "v" | "h"; pos: number };

/** 在目标坐标集合中挑最近的一条 x / y 对齐线，返回所需 dx/dy 和所有与最终吸附后完全重合的参考线。
 * 源矩形的 3 条 x 线：left / right / centerX；3 条 y 线：top / bottom / centerY。 */
function computeSnap(
  src: { x: number; y: number; w: number; h: number },
  xTargets: number[],
  yTargets: number[],
  threshold: number,
): { dx: number; dy: number; guides: SnapGuide[] } {
  const sxs = [src.x, src.x + src.w, src.x + src.w / 2];
  const sys = [src.y, src.y + src.h, src.y + src.h / 2];

  let bestDx = 0;
  let bestDxDiff = Infinity;
  for (const sx of sxs) {
    for (const tx of xTargets) {
      const diff = Math.abs(tx - sx);
      if (diff < threshold && diff < bestDxDiff) {
        bestDxDiff = diff;
        bestDx = tx - sx;
      }
    }
  }

  let bestDy = 0;
  let bestDyDiff = Infinity;
  for (const sy of sys) {
    for (const ty of yTargets) {
      const diff = Math.abs(ty - sy);
      if (diff < threshold && diff < bestDyDiff) {
        bestDyDiff = diff;
        bestDy = ty - sy;
      }
    }
  }

  const guides: SnapGuide[] = [];
  if (bestDxDiff < Infinity) {
    const snapped = [src.x + bestDx, src.x + src.w + bestDx, src.x + src.w / 2 + bestDx];
    for (const tx of xTargets) {
      if (snapped.some((sx) => Math.abs(sx - tx) < 0.5)) {
        guides.push({ orient: "v", pos: tx });
      }
    }
  }
  if (bestDyDiff < Infinity) {
    const snapped = [src.y + bestDy, src.y + src.h + bestDy, src.y + src.h / 2 + bestDy];
    for (const ty of yTargets) {
      if (snapped.some((sy) => Math.abs(sy - ty) < 0.5)) {
        guides.push({ orient: "h", pos: ty });
      }
    }
  }

  return { dx: bestDx, dy: bestDy, guides };
}
