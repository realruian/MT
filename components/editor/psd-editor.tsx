"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Upload, Type, ImageIcon, Lock, Undo2, Redo2, Folder, Eye, EyeOff, ChevronDown, ChevronRight } from "lucide-react";
import type { Template, PsdLayer } from "@/types/template";

const KNOWN_FONTS: Record<string, string> = {
  MeiTuan: "/fonts/Meituan Type-Regular.TTF",
  "MeiTuan-Bold": "/fonts/Meituan Type-Bold.TTF",
  FZLanTingHei: "/fonts/FZLTHJW.TTF",
  FZLanTingZCH: "/fonts/FZLTZCHJW.TTF",
  MiSans: "/fonts/MiSans-Regular.otf",
  "MiSans-Medium": "/fonts/MiSans-Medium.otf",
  "MiSans-Demibold": "/fonts/MiSans-Demibold.otf",
  ZaoZiYuanHei: "/fonts/造字工房元黑体.ttf",
  FZShengDa: "/api/fonts/molly/FZShengSKSJW_Da.ttf",
  FZShengZhong: "/api/fonts/molly/FZShengSKSJW_Zhong.ttf",
};

async function preloadFont(family: string, url: string) {
  if (document.fonts.check(`16px "${family}"`)) return;
  try {
    const face = new FontFace(family, `url(${url})`);
    const loaded = await face.load();
    document.fonts.add(loaded);
  } catch { /* font not available, use fallback */ }
}

export function PsdEditor({ template }: { template: Template }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<PsdLayer[]>([]);
  const [editState, setEditState] = useState<Record<string, Partial<PsdLayer>>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [scale, setScale] = useState(0.5);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [uploadingLayer, setUploadingLayer] = useState<string | null>(null);
  const dragStartRef = useRef({ mx: 0, my: 0, lx: 0, ly: 0 });
  const editingDivRef = useRef<HTMLDivElement>(null);
  const [snapLines, setSnapLines] = useState<Array<{ x?: number; y?: number }>>([]);
  const editStateRef = useRef(editState);
  const historyRef = useRef<Record<string, Partial<PsdLayer>>[]>([]);
  const futureRef = useRef<Record<string, Partial<PsdLayer>>[]>([]);
  const MAX_HISTORY = 50;

  const cw = template.canvasWidth ?? template.width;
  const ch = template.canvasHeight ?? template.height;

  function getVal<K extends keyof PsdLayer>(layer: PsdLayer, key: K): PsdLayer[K] {
    const o = editState[layer.id];
    if (o && key in o) return o[key] as PsdLayer[K];
    return layer[key];
  }

  function pushHistory() {
    const snapshot = JSON.parse(JSON.stringify(editState));
    historyRef.current.push(snapshot);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }
    futureRef.current = [];
  }

  function updateLayer(id: string, updates: Partial<PsdLayer>) {
    pushHistory();
    setEditState((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }));
  }

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const snapshot = JSON.parse(JSON.stringify(editState));
    futureRef.current.push(snapshot);
    const prev = historyRef.current.pop()!;
    setEditState(prev);
  }, [editState]);

  const handleRedo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const snapshot = JSON.parse(JSON.stringify(editState));
    historyRef.current.push(snapshot);
    const next = futureRef.current.pop()!;
    setEditState(next);
  }, [editState]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, handleRedo]);

  // 保持 ref 与 state 同步，供拖拽闭包读取最新位置
  useEffect(() => { editStateRef.current = editState; }, [editState]);

  function getLayerPos(layer: PsdLayer) {
    const o = editState[layer.id];
    return {
      x: (o && "x" in o ? o.x : layer.x) as number,
      y: (o && "y" in o ? o.y : layer.y) as number,
    };
  }

  function handleDragStart(layerId: string, layer: PsdLayer, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (layer.locked === true || String(layer.locked) === "true") return;
    pushHistory();
    setSelectedLayer(layerId);
    setDragging(layerId);
    const pos = getLayerPos(layer);
    dragStartRef.current = { mx: e.clientX, my: e.clientY, lx: pos.x, ly: pos.y };
  }

  useEffect(() => {
    if (!dragging) return;
    const SNAP = 5; // 吸附阈值（画布像素）

    function onMove(e: MouseEvent) {
      e.preventDefault();
      const dx = (e.clientX - dragStartRef.current.mx) / scale;
      const dy = (e.clientY - dragStartRef.current.my) / scale;
      const rawX = dragStartRef.current.lx + dx;
      const rawY = dragStartRef.current.ly + dy;

      const draggedLayer = layers.find((l) => l.id === dragging);
      if (!draggedLayer) {
        setEditState((prev) => ({ ...prev, [dragging!]: { ...prev[dragging!], x: Math.round(rawX), y: Math.round(rawY) } }));
        return;
      }

      const dw = draggedLayer.width;
      const dh = draggedLayer.height;
      const cur = editStateRef.current;

      // 收集所有吸附候选点：画布边缘/中心 + 其他图层边缘/中心
      const xPts: number[] = [0, cw, cw / 2];
      const yPts: number[] = [0, ch, ch / 2];
      for (const l of layers) {
        if (l.id === dragging) continue;
        const vis = cur[l.id]?.visible ?? l.visible;
        if (vis !== true && String(vis) !== "true") continue;
        const lx = (cur[l.id]?.x ?? l.x) as number;
        const ly = (cur[l.id]?.y ?? l.y) as number;
        xPts.push(lx, lx + l.width, lx + l.width / 2);
        yPts.push(ly, ly + l.height, ly + l.height / 2);
      }

      // X 轴吸附：检查拖拽图层左边缘、右边缘、中心
      let bestX = SNAP + 1, finalX = rawX, snapXLine: number | undefined;
      for (const pt of xPts) {
        const dL = Math.abs(rawX - pt);
        if (dL < SNAP && dL < bestX) { bestX = dL; finalX = pt; snapXLine = pt; }
        const dR = Math.abs(rawX + dw - pt);
        if (dR < SNAP && dR < bestX) { bestX = dR; finalX = pt - dw; snapXLine = pt; }
        const dC = Math.abs(rawX + dw / 2 - pt);
        if (dC < SNAP && dC < bestX) { bestX = dC; finalX = pt - dw / 2; snapXLine = pt; }
      }

      // Y 轴吸附：检查拖拽图层上边缘、下边缘、中心
      let bestY = SNAP + 1, finalY = rawY, snapYLine: number | undefined;
      for (const pt of yPts) {
        const dT = Math.abs(rawY - pt);
        if (dT < SNAP && dT < bestY) { bestY = dT; finalY = pt; snapYLine = pt; }
        const dB = Math.abs(rawY + dh - pt);
        if (dB < SNAP && dB < bestY) { bestY = dB; finalY = pt - dh; snapYLine = pt; }
        const dCY = Math.abs(rawY + dh / 2 - pt);
        if (dCY < SNAP && dCY < bestY) { bestY = dCY; finalY = pt - dh / 2; snapYLine = pt; }
      }

      const lines: Array<{ x?: number; y?: number }> = [];
      if (snapXLine !== undefined) lines.push({ x: snapXLine });
      if (snapYLine !== undefined) lines.push({ y: snapYLine });
      setSnapLines(lines);

      setEditState((prev) => ({
        ...prev,
        [dragging!]: { ...prev[dragging!], x: Math.round(finalX), y: Math.round(finalY) },
      }));
    }

    function onUp() {
      setDragging(null);
      setSnapLines([]);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, scale]);

  useEffect(() => {
    if (!selectedLayer) return;
    const el = document.getElementById(`panel-layer-${selectedLayer}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedLayer]);

  useEffect(() => {
    async function fetchLayers() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/psd/layers?template_id=${template.id}`);
        if (res.ok) {
          const data: PsdLayer[] = await res.json();
          setLayers(data);
          // 并行加载所有字体，不阻塞 UI
          const fontLayers = data.filter((l) => l.layerType === "text" && l.fontFamily);
          await Promise.all(
            fontLayers.map((layer) => {
              const url = KNOWN_FONTS[layer.fontFamily!] ?? `/api/fonts/${layer.fontFamily}.ttf`;
              return preloadFont(layer.fontFamily!, url);
            })
          );
        }
      } catch (err) {
        console.error("Failed to load layers:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLayers();
  }, [template.id]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !cw) return;
    const observer = new ResizeObserver(([entry]) => {
      const availW = entry.contentRect.width - 60;
      const availH = entry.contentRect.height - 60;
      const s = Math.min(availW / cw, availH / ch, 1);
      setScale(Math.max(0.1, s));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [cw, ch]);

  async function handleExport() {
    setExporting(true);
    try {
      const edits: Record<string, Record<string, unknown>> = {};
      for (const [id, overrides] of Object.entries(editState)) {
        if (Object.keys(overrides).length > 0) {
          edits[id] = overrides;
        }
      }

      const res = await fetch("/api/export/psd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, edits }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "导出失败");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.name}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  }

  async function handleImageReplace(layerId: string, file: File) {
    setUploadingLayer(layerId);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "uploads");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        updateLayer(layerId, { imageUrl: data.url });
      }
    } catch { /* ignore */ } finally {
      setUploadingLayer(null);
    }
  }

  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  // Group 的有效显隐（叠加 editState 覆盖）。子层在预览中会跟随父 Group 隐藏。
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

  // 顶层条目（无 parentId）按 zIndex 升序，用于编辑面板树形渲染
  const topLevelEntries = useMemo(
    () => layers.filter((l) => !l.parentId).sort((a, b) => a.zIndex - b.zIndex),
    [layers],
  );

  const childrenByGroup = useMemo(() => {
    const map = new Map<string, PsdLayer[]>();
    for (const l of layers) {
      if (!l.parentId) continue;
      if (l.layerType !== "text" && l.layerType !== "image") continue;
      if (!map.has(l.parentId)) map.set(l.parentId, []);
      map.get(l.parentId)!.push(l);
    }
    for (const arr of map.values()) arr.sort((a, b) => b.zIndex - a.zIndex);
    return map;
  }, [layers]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  function toggleGroupCollapsed(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="h-screen bg-[#111]">
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-3 border-b border-[#2a2a2a] bg-[#1a1a1a] px-5">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-[#888] transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          返回首页
        </Link>
        <div className="mx-1 h-4 w-px bg-[#2a2a2a]" />
        <span className="text-sm font-medium text-white">{template.name}</span>
        <span className="rounded-tag bg-[#2a2a2a] px-2 py-0.5 text-xs text-[#888]">
          {template.category}
        </span>
        <span className="rounded-tag bg-[#2a1f3d] px-2 py-0.5 text-xs text-purple-400">
          PSD
        </span>
      </header>

      {/* 预览区 */}
      <div
        ref={containerRef}
        className="fixed bottom-0 left-0 right-[320px] top-14 flex items-center justify-center overflow-auto bg-[#111]"
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-[#555]" />
            <p className="text-sm text-[#555]">加载图层中...</p>
          </div>
        ) : (
          <div
            style={{
              width: cw * scale,
              height: ch * scale,
              overflow: "hidden",
              borderRadius: 0,
              boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
            }}
          >
            <div
              ref={previewRef}
              style={{
                position: "relative",
                width: cw,
                height: ch,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                overflow: "hidden",
                background: "#ffffff",
              }}
            >
              {sortedLayers.map((layer) => {
                // Group 节点只做分组容器，不渲染任何像素
                if (layer.layerType === "group") return null;
                // 父 Group 被整体隐藏时，子图层一并跳过
                if (layer.parentId && groupVisibility.get(layer.parentId) === false) return null;
                const visible = getVal(layer, "visible");
                if (visible !== true && String(visible) !== "true") return null;
                const type = getVal(layer, "layerType");
                const opacity = layer.opacity;
                const pos = getLayerPos(layer);
                const isDrag = dragging === layer.id;

                if (type === "text") {
                  const text = getVal(layer, "textContent") ?? "";
                  const isMultiLine = text.includes("\n");
                  const fs = getVal(layer, "fontSize") ?? 16;
                  const lh = getVal(layer, "lineHeight");
                  const rot = layer.rotation ?? 0;
                  const isLocked = layer.locked === true || String(layer.locked) === "true";
                  const isEditing = editingLayer === layer.id;

                  // 字体/位置基础样式，宽度和换行按场景单独设置
                  const baseStyle: React.CSSProperties = {
                    position: "absolute",
                    left: pos.x,
                    top: pos.y,
                    minWidth: layer.width,
                    opacity,
                    fontSize: fs,
                    fontFamily: `"${getVal(layer, "fontFamily") ?? "sans-serif"}", sans-serif`,
                    color: getVal(layer, "fontColor") ?? "#000",
                    fontWeight: (getVal(layer, "fontWeight") as string) ?? "normal",
                    fontStyle: (layer.fontStyle as React.CSSProperties["fontStyle"]) ?? "normal",
                    lineHeight: lh && lh > fs ? `${lh}px` : 1.3,
                    textAlign: (getVal(layer, "textAlign") as React.CSSProperties["textAlign"]) ?? "left",
                    zIndex: layer.zIndex,
                    transform: rot ? `rotate(${rot}deg)` : undefined,
                    transformOrigin: "left top",
                  };

                  return (
                    <React.Fragment key={layer.id}>
                      {/* 文字显示层 */}
                      <div
                        onMouseDown={(e) => {
                          if (isEditing) return;
                          handleDragStart(layer.id, layer, e);
                        }}
                        onDoubleClick={(e) => {
                          if (isLocked) return;
                          e.stopPropagation();
                          setEditingLayer(layer.id);
                          setSelectedLayer(layer.id);
                          setTimeout(() => {
                            const el = editingDivRef.current;
                            if (!el) return;
                            el.focus();
                            // 光标移到末尾
                            const range = document.createRange();
                            range.selectNodeContents(el);
                            range.collapse(false);
                            window.getSelection()?.removeAllRanges();
                            window.getSelection()?.addRange(range);
                          }, 0);
                        }}
                        style={{
                          ...baseStyle,
                          width: isMultiLine ? layer.width : undefined,
                          whiteSpace: isMultiLine ? "pre-wrap" : "nowrap",
                          overflow: "visible",
                          cursor: isLocked ? "default" : isDrag ? "grabbing" : "grab",
                          userSelect: "none",
                          visibility: isEditing ? "hidden" : "visible",
                        }}
                      >
                        {text}
                      </div>
                      {/* 原地编辑：contentEditable div，自动适应宽高 */}
                      {isEditing && (
                        <div
                          ref={(node) => {
                            (editingDivRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
                            if (node) {
                              // 初始化内容（不走 React 受控，避免光标跳动）
                              node.innerText = text;
                              node.focus();
                              const range = document.createRange();
                              range.selectNodeContents(node);
                              range.collapse(false);
                              window.getSelection()?.removeAllRanges();
                              window.getSelection()?.addRange(range);
                            }
                          }}
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            const newText = e.currentTarget.innerText;
                            pushHistory();
                            setEditState((prev) => ({
                              ...prev,
                              [layer.id]: { ...prev[layer.id], textContent: newText },
                            }));
                            setEditingLayer(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              // 放弃编辑，恢复原文本
                              if (editingDivRef.current) editingDivRef.current.innerText = text;
                              setEditingLayer(null);
                            }
                          }}
                          style={{
                            ...baseStyle,
                            width: isMultiLine ? layer.width : "max-content",
                            whiteSpace: isMultiLine ? "pre-wrap" : "nowrap",
                            overflow: "visible",
                            background: "transparent",
                            border: "1.5px solid #6366f1",
                            outline: "none",
                            padding: 0,
                            margin: 0,
                            cursor: "text",
                            userSelect: "text",
                          }}
                        />
                      )}
                    </React.Fragment>
                  );
                }

                const imgUrl = getVal(layer, "imageUrl");
                if (imgUrl) {
                  const imgRot = layer.rotation ?? 0;
                  return (
                    <div
                      key={layer.id}
                      onMouseDown={(e) => handleDragStart(layer.id, layer, e)}
                      style={{
                        position: "absolute",
                        left: pos.x,
                        top: pos.y,
                        width: layer.width,
                        height: layer.height,
                        zIndex: layer.zIndex,
                        cursor: (layer.locked === true || String(layer.locked) === "true") ? "default" : isDrag ? "grabbing" : "grab",
                        userSelect: "none",
                        transform: imgRot ? `rotate(${imgRot}deg)` : undefined,
                        transformOrigin: "left top",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgUrl}
                        alt={layer.name}
                        draggable={false}
                        style={{
                          width: "100%",
                          height: "100%",
                          opacity,
                          objectFit: "fill",
                          pointerEvents: "none",
                        }}
                      />
                      {uploadingLayer === layer.id && (
                        <div style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(0,0,0,0.4)",
                          borderRadius: 4,
                        }}>
                          <Loader2 className="size-6 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                  );
                }

                return null;
              })}

              {/* 吸附参考线 */}
              {snapLines.map((line, i) =>
                line.x !== undefined ? (
                  <div
                    key={`sx-${i}`}
                    style={{
                      position: "absolute",
                      left: line.x - 0.5,
                      top: 0,
                      width: 1,
                      height: ch,
                      background: "#6366f1",
                      opacity: 0.85,
                      pointerEvents: "none",
                      zIndex: 10001,
                    }}
                  />
                ) : (
                  <div
                    key={`sy-${i}`}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: line.y! - 0.5,
                      width: cw,
                      height: 1,
                      background: "#6366f1",
                      opacity: 0.85,
                      pointerEvents: "none",
                      zIndex: 10001,
                    }}
                  />
                )
              )}

              {/* 选中图层高亮边框 overlay */}
              {selectedLayer && (() => {
                const sl = layers.find((l) => l.id === selectedLayer);
                if (!sl) return null;
                const sp = getLayerPos(sl);
                const sRot = sl.rotation ?? 0;
                return (
                  <div
                    style={{
                      position: "absolute",
                      left: sp.x - 1,
                      top: sp.y - 1,
                      width: sl.width + 2,
                      height: sl.height + 2,
                      border: "2px solid #6366f1",
                      borderRadius: 2,
                      pointerEvents: "none",
                      zIndex: 9999,
                      transform: sRot ? `rotate(${sRot}deg)` : undefined,
                      transformOrigin: "left top",
                    }}
                  />
                );
              })()}
            </div>
          </div>
        )}
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 flex items-center gap-3 rounded-full border border-[#2a2a2a] bg-[#1f1f1f] px-4 py-2">
          <span className="text-xs text-[#555]">
            {cw} × {ch} · {Math.round(scale * 100)}%
          </span>
          <span className="h-3 w-px bg-[#2a2a2a]" />
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyRef.current.length === 0}
            title="撤销 (Ctrl+Z)"
            className="flex items-center text-[#555] transition-colors hover:text-white disabled:opacity-30"
          >
            <Undo2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={futureRef.current.length === 0}
            title="重做 (Ctrl+Shift+Z)"
            className="flex items-center text-[#555] transition-colors hover:text-white disabled:opacity-30"
          >
            <Redo2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 编辑面板 */}
      <aside className="fixed bottom-0 right-0 top-14 z-10 flex w-80 flex-col border-l border-[#2a2a2a] bg-[#1a1a1a]">
        <div className="flex-1 overflow-y-auto">
          {(() => {
            const hasAny = layers.some(
              (l) => l.layerType === "text" || l.layerType === "image" || l.layerType === "group",
            );
            if (!hasAny && !loading) {
              return <p className="px-5 py-10 text-center text-sm text-[#444]">无可编辑图层</p>;
            }
            return null;
          })()}

          {topLevelEntries.map((top) => {
            // Group 模块卡片
            if (top.layerType === "group") {
              const children = childrenByGroup.get(top.id) ?? [];
              const isCollapsed = collapsedGroups.has(top.id);
              const groupVisible = groupVisibility.get(top.id) ?? true;
              return (
                <section
                  key={top.id}
                  className="border-b border-[#2a2a2a] bg-[#181818]"
                >
                  <div className="flex items-center gap-2 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapsed(top.id)}
                      className="flex items-center text-[#888] transition-colors hover:text-white"
                      title={isCollapsed ? "展开模块" : "折叠模块"}
                    >
                      {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                    <Folder className="size-4 text-amber-400" />
                    <span className="truncate text-sm font-medium text-white">{top.name}</span>
                    <span className="ml-1 text-xs text-[#555]">{children.length}</span>
                    <button
                      type="button"
                      onClick={() => updateLayer(top.id, { visible: !groupVisible })}
                      className="ml-auto flex items-center text-[#888] transition-colors hover:text-white"
                      title={groupVisible ? "隐藏整组" : "显示整组"}
                    >
                      {groupVisible ? <Eye className="size-4" /> : <EyeOff className="size-4 text-[#555]" />}
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="pb-1">
                      {children.length === 0 ? (
                        <p className="px-5 py-3 text-xs text-[#444]">模块内无可编辑图层</p>
                      ) : (
                        children.map((child) => renderLayerSection(child, /* indent */ true))
                      )}
                    </div>
                  )}
                </section>
              );
            }
            // 顶层散层（无 Group 归属）
            if (top.layerType === "text" || top.layerType === "image") {
              return renderLayerSection(top, false);
            }
            return null;
          })}
        </div>

        {/* 导出按钮 */}
        <div className="shrink-0 border-t border-[#2a2a2a] p-5">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex w-full items-center justify-center gap-2 rounded-button bg-white px-4 py-2.5 text-sm font-medium text-[#111] transition-colors hover:bg-[#e5e5e5] active:scale-[0.98] disabled:opacity-40"
          >
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {exporting ? "导出中…" : "导出 PNG"}
          </button>
        </div>
      </aside>
    </div>
  );

  /** 单个 text/image 图层的编辑卡片。在模块内时带缩进。 */
  function renderLayerSection(layer: PsdLayer, indent: boolean) {
    const type = getVal(layer, "layerType");
    const pos = getLayerPos(layer);
    const isSel = selectedLayer === layer.id;
    return (
      <section
        key={layer.id}
        id={`panel-layer-${layer.id}`}
        className={[
          "border-b border-[#2a2a2a] py-4 transition-colors",
          indent ? "pl-10 pr-5" : "px-5",
          isSel ? "bg-white/5" : "",
        ].join(" ")}
      >
                <div
                  className="mb-3 flex cursor-pointer items-center gap-2"
                  onClick={() => setSelectedLayer(isSel ? null : layer.id)}
                >
                  {type === "text" ? (
                    <Type className="size-4 text-blue-400" />
                  ) : (
                    <ImageIcon className="size-4 text-emerald-400" />
                  )}
                  <span className="truncate text-sm font-medium text-[#ccc]">
                    {layer.name}
                  </span>
                  {(layer.locked === true || String(layer.locked) === "true") && <span title="位置已锁定" className="ml-auto"><Lock className="size-3 text-amber-400" /></span>}
                  {isSel && !(layer.locked === true || String(layer.locked) === "true") && <span className="ml-auto text-[12px] text-blue-400">已选中</span>}
                </div>

                {!(layer.locked === true || String(layer.locked) === "true") && (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[#555]">X</span>
                      <input
                        type="number"
                        value={pos.x}
                        onChange={(e) => updateLayer(layer.id, { x: Number(e.target.value) })}
                        className="rounded border border-[#333] bg-[#222] px-3 py-1.5 text-xs text-white outline-none focus:border-[#555]"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[#555]">Y</span>
                      <input
                        type="number"
                        value={pos.y}
                        onChange={(e) => updateLayer(layer.id, { y: Number(e.target.value) })}
                        className="rounded border border-[#333] bg-[#222] px-3 py-1.5 text-xs text-white outline-none focus:border-[#555]"
                      />
                    </div>
                  </div>
                )}

                {type === "text" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[#555]">文字内容</span>
                      <textarea
                        value={getVal(layer, "textContent") ?? ""}
                        onChange={(e) => updateLayer(layer.id, { textContent: e.target.value })}
                        rows={2}
                        className="resize-none rounded border border-[#333] bg-[#222] px-3 py-2 text-sm text-white outline-none focus:border-[#555]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-[#555]">字号</span>
                        <input
                          type="number"
                          value={getVal(layer, "fontSize") ?? 24}
                          onChange={(e) => updateLayer(layer.id, { fontSize: Number(e.target.value) })}
                          className="rounded border border-[#333] bg-[#222] px-3 py-2 text-sm text-white outline-none focus:border-[#555]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-[#555]">颜色</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={getVal(layer, "fontColor") ?? "#000000"}
                            onChange={(e) => updateLayer(layer.id, { fontColor: e.target.value })}
                            className="size-9 shrink-0 cursor-pointer rounded border border-[#333] bg-[#222]"
                          />
                          <span className="text-xs text-[#777]">
                            {getVal(layer, "fontColor") ?? "#000000"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {layer.fontFamily && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-[#555]">字体</span>
                        <span className="text-xs text-[#777]">{layer.fontFamily}</span>
                      </div>
                    )}
                  </div>
                )}

                {type === "image" && (
                  <div className="flex flex-col gap-2">
                    {getVal(layer, "imageUrl") && (
                      <div className="h-20 w-full overflow-hidden rounded border border-[#2a2a2a]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getVal(layer, "imageUrl")!}
                          alt={layer.name}
                          className="size-full object-contain"
                        />
                      </div>
                    )}
                    <label className={[
                      "flex items-center justify-center gap-1.5 rounded border border-[#333] px-3 py-2 text-xs transition-colors",
                      uploadingLayer === layer.id
                        ? "pointer-events-none opacity-50 text-[#555]"
                        : "cursor-pointer text-[#888] hover:bg-white/5 hover:text-white",
                    ].join(" ")}>
                      {uploadingLayer === layer.id ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                      {uploadingLayer === layer.id ? "上传中..." : "替换图片"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageReplace(layer.id, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                )}
      </section>
    );
  }
}
