"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Template, PsdLayer } from "@/types/template";
import type { Slot } from "./editor-shell";

interface CanvasStageProps {
  template: Template;
  slot: Slot;
  layers: PsdLayer[];
  loading: boolean;
  editState: Record<string, Partial<PsdLayer>>;
  selection: { moduleId?: string; layerId?: string } | null;
  onSelect: (sel: { moduleId?: string; layerId?: string } | null) => void;
  onUpdate: (id: string, updates: Partial<PsdLayer>) => void;
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
}: CanvasStageProps) {
  // 画布尺寸来自当前 slot —— 一键拓展生成的新 slot 会有不同的 width/height，
  // 图层仍按 PSD 原始坐标渲染，超出画布的部分会被 overflow: hidden 裁掉。
  const cw = slot.width;
  const ch = slot.height;

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  // 自适应缩放：容器上下左右各留 80px，取能容纳画布的最大比例（上限 1）
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !cw) return;
    const observer = new ResizeObserver(([entry]) => {
      const availW = entry.contentRect.width - 80;
      const availH = entry.contentRect.height - 80;
      const s = Math.min(availW / cw, availH / ch, 1);
      setScale(Math.max(0.1, s));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [cw, ch]);

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

  // 拖拽状态：元素级（单个 layer）或模块级（group + 所有子图层）
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
      };
  const [dragging, setDragging] = useState<DragState | null>(null);
  // 吸附参考线：拖拽时命中的对齐目标（画布 4 边 / 中线 + 兄弟元素 4 边 / 中线）
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

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
  }, [dragging, scale, onUpdate, layers, cw, ch, groupVisibility]);

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
    <div
      ref={containerRef}
      onClick={() => onSelect(null)}
      className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-white/50"
    >
      {loading ? (
        <div
          className="flex flex-col items-center gap-3 text-[#999]"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <Loader2 className="size-6 animate-spin" />
          <span className="text-xs">尺寸延展中，请稍后...</span>
        </div>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: cw * scale,
            height: ch * scale,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            background: "#ffffff",
            // 防止编辑态 textarea 横向撑出画布时把外层容器推偏；
            // overflow:clip + contain:strict 比 overflow:hidden 更硬，能阻断子元素对父布局尺寸的反向影响
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
              background: "#ffffff",
            }}
          >
            {sortedLayers.map((layer) => {
              if (layer.layerType === "group") return null;
              if (layer.parentId && groupVisibility.get(layer.parentId) === false) return null;
              const visible = layer.visible === true || String(layer.visible) === "true";
              if (!visible) return null;

              const x = getVal(layer, "x");
              const y = getVal(layer, "y");
              const w = getVal(layer, "width");
              const h = getVal(layer, "height");
              const opacity = getVal(layer, "opacity");
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
                : undefined;

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
                      // 顶层孤立文本不支持双击编辑（与现有选择规则一致）
                      if (!layer.parentId) return;
                      initialTextRef.current = text;
                      draftTextRef.current = text;
                      setDraftText(text);
                      setEditingId(layer.id);
                      onSelect({ moduleId: layer.parentId, layerId: layer.id });
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
      )}

      {/* 画布底部浅色状态条：尺寸 + 缩放比例 */}
      {!loading && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-[#e5e5e5] bg-white/90 px-3 py-1 text-[11px] text-[#999] shadow-sm backdrop-blur">
          {cw} × {ch} · {Math.round(scale * 100)}%
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
