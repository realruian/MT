"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Upload, Type, ImageIcon, Lock, Undo2, Redo2 } from "lucide-react";
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
  const [dragging, setDragging] = useState<string | null>(null);
  const [uploadingLayer, setUploadingLayer] = useState<string | null>(null);
  const dragStartRef = useRef({ mx: 0, my: 0, lx: 0, ly: 0 });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editState]);

  const handleRedo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const snapshot = JSON.parse(JSON.stringify(editState));
    historyRef.current.push(snapshot);
    const next = futureRef.current.pop()!;
    setEditState(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    function onMove(e: MouseEvent) {
      e.preventDefault();
      const dx = (e.clientX - dragStartRef.current.mx) / scale;
      const dy = (e.clientY - dragStartRef.current.my) / scale;
      setEditState((prev) => ({
        ...prev,
        [dragging!]: {
          ...prev[dragging!],
          x: Math.round(dragStartRef.current.lx + dx),
          y: Math.round(dragStartRef.current.ly + dy),
        },
      }));
    }
    function onUp() {
      setDragging(null);
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

  const editableLayers = layers
    .filter((l) => {
      const type = getVal(l, "layerType");
      return type === "text" || type === "image";
    })
    .sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div className="h-screen bg-white">
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-100 bg-white px-5">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-cyan-500"
        >
          <ArrowLeft className="size-4" />
          返回首页
        </Link>
        <div className="mx-1 h-4 w-px bg-gray-200" />
        <span className="text-sm font-medium text-gray-900">{template.name}</span>
        <span className="rounded-tag bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
          {template.category}
        </span>
        <span className="rounded-tag bg-purple-50 px-2 py-0.5 text-xs text-purple-600">
          PSD
        </span>
      </header>

      {/* 预览区 */}
      <div
        ref={containerRef}
        className="fixed bottom-0 left-0 right-[320px] top-14 flex items-center justify-center overflow-auto bg-gray-100"
        style={{
          backgroundImage: "radial-gradient(circle, #dde0e6 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-gray-400" />
            <p className="text-sm text-gray-400">加载图层中...</p>
          </div>
        ) : (
          <div
            style={{
              width: cw * scale,
              height: ch * scale,
              overflow: "hidden",
              borderRadius: 8,
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
                  return (
                    <div
                      key={layer.id}
                      onMouseDown={(e) => handleDragStart(layer.id, layer, e)}
                      style={{
                        position: "absolute",
                        left: pos.x,
                        top: pos.y,
                        minWidth: layer.width,
                        width: isMultiLine ? layer.width : undefined,
                        opacity,
                        fontSize: fs,
                        fontFamily: `"${getVal(layer, "fontFamily") ?? "sans-serif"}", sans-serif`,
                        color: getVal(layer, "fontColor") ?? "#000",
                        fontWeight: (getVal(layer, "fontWeight") as string) ?? "normal",
                        fontStyle: (layer.fontStyle as React.CSSProperties["fontStyle"]) ?? "normal",
                        lineHeight: lh && lh > fs ? `${lh}px` : 1.3,
                        textAlign: (getVal(layer, "textAlign") as React.CSSProperties["textAlign"]) ?? "left",
                        zIndex: layer.zIndex,
                        whiteSpace: isMultiLine ? "pre-wrap" : "nowrap",
                        overflow: "visible",
                        transform: rot ? `rotate(${rot}deg)` : undefined,
                        transformOrigin: "left top",
                        cursor: (layer.locked === true || String(layer.locked) === "true") ? "default" : isDrag ? "grabbing" : "grab",
                        userSelect: "none",
                      }}
                    >
                      {text}
                    </div>
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
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 flex items-center gap-3 rounded-full bg-white px-4 py-2 shadow-sm">
          <span className="text-xs text-gray-400">
            {cw} × {ch} · {Math.round(scale * 100)}%
          </span>
          <span className="h-3 w-px bg-gray-200" />
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyRef.current.length === 0}
            title="撤销 (Ctrl+Z)"
            className="flex items-center text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-30"
          >
            <Undo2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={futureRef.current.length === 0}
            title="重做 (Ctrl+Shift+Z)"
            className="flex items-center text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-30"
          >
            <Redo2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 编辑面板 */}
      <aside className="fixed bottom-0 right-0 top-14 z-10 flex w-80 flex-col border-l border-gray-100 bg-white">
        <div className="flex-1 overflow-y-auto">
          {editableLayers.length === 0 && !loading && (
            <p className="px-5 py-10 text-center text-sm text-gray-300">无可编辑图层</p>
          )}

          {editableLayers.map((layer) => {
            const type = getVal(layer, "layerType");
            const pos = getLayerPos(layer);
            const isSel = selectedLayer === layer.id;
            return (
              <section
                key={layer.id}
                id={`panel-layer-${layer.id}`}
                className={[
                  "border-b border-gray-100 px-5 py-4 transition-colors",
                  isSel ? "bg-blue-50/50" : "",
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
                  <span className="truncate text-sm font-medium text-gray-700">
                    {layer.name}
                  </span>
                  {(layer.locked === true || String(layer.locked) === "true") && <span title="位置已锁定" className="ml-auto"><Lock className="size-3 text-amber-400" /></span>}
                  {isSel && !(layer.locked === true || String(layer.locked) === "true") && <span className="ml-auto text-[10px] text-blue-500">已选中</span>}
                </div>

                {!(layer.locked === true || String(layer.locked) === "true") && (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400">X</span>
                      <input
                        type="number"
                        value={pos.x}
                        onChange={(e) => updateLayer(layer.id, { x: Number(e.target.value) })}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs outline-none focus:border-gray-400"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400">Y</span>
                      <input
                        type="number"
                        value={pos.y}
                        onChange={(e) => updateLayer(layer.id, { y: Number(e.target.value) })}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs outline-none focus:border-gray-400"
                      />
                    </div>
                  </div>
                )}

                {type === "text" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-400">文字内容</span>
                      <textarea
                        value={getVal(layer, "textContent") ?? ""}
                        onChange={(e) => updateLayer(layer.id, { textContent: e.target.value })}
                        rows={2}
                        className="resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-400">字号</span>
                        <input
                          type="number"
                          value={getVal(layer, "fontSize") ?? 24}
                          onChange={(e) => updateLayer(layer.id, { fontSize: Number(e.target.value) })}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-400">颜色</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={getVal(layer, "fontColor") ?? "#000000"}
                            onChange={(e) => updateLayer(layer.id, { fontColor: e.target.value })}
                            className="size-9 shrink-0 cursor-pointer rounded-lg border border-gray-200"
                          />
                          <span className="text-xs text-gray-500">
                            {getVal(layer, "fontColor") ?? "#000000"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {layer.fontFamily && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-400">字体</span>
                        <span className="text-xs text-gray-600">{layer.fontFamily}</span>
                      </div>
                    )}
                  </div>
                )}

                {type === "image" && (
                  <div className="flex flex-col gap-2">
                    {getVal(layer, "imageUrl") && (
                      <div className="h-20 w-full overflow-hidden rounded-lg border border-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getVal(layer, "imageUrl")!}
                          alt={layer.name}
                          className="size-full object-contain"
                        />
                      </div>
                    )}
                    <label className={[
                      "flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs transition-colors",
                      uploadingLayer === layer.id
                        ? "pointer-events-none opacity-50 text-gray-400"
                        : "cursor-pointer text-gray-500 hover:bg-gray-50",
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
          })}

        </div>

        {/* 导出按钮 */}
        <div className="shrink-0 border-t border-gray-100 p-5">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex w-full items-center justify-center gap-2 rounded-button bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50"
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
}
