"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PsdLayer, Template } from "@/types/template";
import { preloadAllFonts } from "@/lib/fonts";
import type { SlotPreset, SlotSize } from "@/lib/slot-presets";
import { EditorTopbar } from "./editor-topbar";
import { SlotPanel } from "./slot-panel";
import { CanvasStage } from "./canvas-stage";
import { PropertyPanel } from "./property-panel";
import { ExtendModal } from "./extend-modal";
import { ExportModal } from "./export-modal";

export type SlotId = string;

export interface Slot {
  id: SlotId;
  /** 显示名：会场 / 首页运营卡片 750×100 / ... */
  name: string;
  thumbnail?: string;
  /** 当前 slot 绑定的模板 id（图层从这里拉） */
  templateId: string;
  /** slot 的画布宽（默认与模板一致；延展 slot 为尺寸预设中的宽度） */
  width: number;
  /** slot 的画布高 */
  height: number;
}

interface EditorShellProps {
  template: Template;
  activity?: string;
}

export function EditorShell({ template, activity }: EditorShellProps) {
  const [slots, setSlots] = useState<Slot[]>([
    {
      id: "venue",
      name: "会场",
      templateId: template.id,
      thumbnail: template.thumbnail,
      width: template.canvasWidth ?? template.width,
      height: template.canvasHeight ?? template.height,
    },
  ]);
  const [activeSlotId, setActiveSlotId] = useState<SlotId>("venue");
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const activeSlot = slots.find((s) => s.id === activeSlotId) ?? slots[0];

  // 二级选中：moduleId 模块级 / layerId 元素级（layerId 必须配合 moduleId）
  const [selected, setSelected] = useState<
    { moduleId?: string; layerId?: string } | null
  >(null);

  // 图层数据（从 API 拉取）+ 用户编辑 overlay
  const [layers, setLayers] = useState<PsdLayer[]>([]);
  const [loadingLayers, setLoadingLayers] = useState(true);
  const [editState, setEditState] = useState<Record<string, Partial<PsdLayer>>>({});

  const updateLayer = useCallback(
    (id: string, updates: Partial<PsdLayer>) => {
      setEditState((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...updates },
      }));
    },
    [],
  );

  // 撤销 / 重做：过去的 editState 快照入 past 栈，未来栈保存 redo；
  // 防抖 500ms 把"变化前"状态推入 past，避免每个字符/每像素都入栈。
  const [historyFuture, setHistoryFuture] = useState<
    Record<string, Partial<PsdLayer>>[]
  >([]);
  const historyPastRef = useRef<Record<string, Partial<PsdLayer>>[]>([]);
  const prevEditStateRef = useRef<Record<string, Partial<PsdLayer>>>({});
  const suppressNextSnapshotRef = useRef(false);

  useEffect(() => {
    if (suppressNextSnapshotRef.current) {
      suppressNextSnapshotRef.current = false;
      prevEditStateRef.current = editState;
      return;
    }
    const timer = setTimeout(() => {
      if (editState === prevEditStateRef.current) return;
      historyPastRef.current = [
        ...historyPastRef.current,
        prevEditStateRef.current,
      ];
      if (historyPastRef.current.length > 50) {
        historyPastRef.current = historyPastRef.current.slice(-50);
      }
      prevEditStateRef.current = editState;
      setHistoryFuture([]);
    }, 500);
    return () => clearTimeout(timer);
  }, [editState]);

  const undo = useCallback(() => {
    if (historyPastRef.current.length === 0) return;
    const prev = historyPastRef.current[historyPastRef.current.length - 1];
    historyPastRef.current = historyPastRef.current.slice(0, -1);
    setHistoryFuture((f) => [editState, ...f]);
    suppressNextSnapshotRef.current = true;
    setEditState(prev);
  }, [editState]);

  const redo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const [next, ...rest] = historyFuture;
    historyPastRef.current = [...historyPastRef.current, editState];
    suppressNextSnapshotRef.current = true;
    setEditState(next);
    setHistoryFuture(rest);
  }, [editState, historyFuture]);

  // 拉图层 + 预加载字体；slot 切换时重新拉取并清空选中 / editState
  useEffect(() => {
    let cancelled = false;
    async function fetchLayers() {
      setLoadingLayers(true);
      setLayers([]);
      setSelected(null);
      setEditState({});
      try {
        const res = await fetch(
          `/api/admin/psd/layers?template_id=${activeSlot.templateId}`,
        );
        if (!res.ok) return;
        const data: PsdLayer[] = await res.json();
        if (cancelled) return;
        setLayers(data);
        // 一次性预加载内置字体所有 variant
        await preloadAllFonts();
      } catch (err) {
        console.error("Failed to load layers:", err);
      } finally {
        if (!cancelled) setLoadingLayers(false);
      }
    }
    fetchLayers();
    return () => {
      cancelled = true;
    };
  }, [activeSlot.templateId]);

  // slot 切换：清空历史栈，避免上个 slot 的快照被 undo 回到新 slot 上
  useEffect(() => {
    historyPastRef.current = [];
    prevEditStateRef.current = {};
    setHistoryFuture([]);
  }, [activeSlot.templateId]);

  // Esc 分级清空：先清 layerId，再清 moduleId
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected((prev) => {
        if (!prev) return null;
        if (prev.layerId) return { moduleId: prev.moduleId };
        return null;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cmd/Ctrl+Z = undo；Cmd/Ctrl+Shift+Z 或 Cmd/Ctrl+Y = redo；
  // 焦点在可编辑元素里时不拦截，交给浏览器原生撤销
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  function handleReplaceModule(moduleId: string) {
    console.log("[T6] replace module", moduleId);
  }

  function handleDeleteModule(moduleId: string) {
    updateLayer(moduleId, { visible: false });
    setSelected(null);
  }

  function handleAddSlots(picks: Array<{ preset: SlotPreset; size: SlotSize }>) {
    const newSlots: Slot[] = picks.map(({ preset, size }) => ({
      id: `slot_${preset.id}_${size.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${preset.name} ${size.label}`,
      templateId: size.templateId,
      width: size.width,
      height: size.height,
    }));
    setSlots((prev) => [...prev, ...newSlots]);
    if (newSlots.length > 0) {
      setActiveSlotId(newSlots[0].id);
      setSelected(null);
    }
    setExtendModalOpen(false);
  }

  function handleDeleteSlot(id: string) {
    if (id === "venue") return;
    setSlots((prev) => prev.filter((s) => s.id !== id));
    if (activeSlotId === id) setActiveSlotId("venue");
    setSelected(null);
  }

  function handleSelectSlot(id: string) {
    if (id === activeSlotId) return;
    setActiveSlotId(id);
    setSelected(null);
  }

  async function exportOneSlot(slot: Slot) {
    const edits: Record<string, Record<string, unknown>> = {};
    for (const [id, overrides] of Object.entries(editState)) {
      if (Object.keys(overrides).length > 0) edits[id] = { ...overrides };
    }
    // 对当前 slot 的所有文本图层补齐有效 fontFamily / fontWeight：
    // 服务端要靠 (fontFamily, fontWeight) 去查 PostScript 名，不能只靠 DB 里的 layer.*
    // （用户切换了字体族之后 DB 原值已失效）。fontWeight 做和属性面板一致的归一化
    // ("normal"→"400", "bold"→"700")，否则 FAMILY_WEIGHT_TO_PS 命不中。
    const normalizeWeight = (w: string | undefined): string | undefined => {
      if (!w) return undefined;
      if (w === "normal") return "400";
      if (w === "bold") return "700";
      return w;
    };
    if (slot.templateId === activeSlot.templateId) {
      for (const layer of layers) {
        if (layer.layerType !== "text") continue;
        const effFamily = editState[layer.id]?.fontFamily ?? layer.fontFamily;
        const effWeight = normalizeWeight(
          editState[layer.id]?.fontWeight ?? layer.fontWeight,
        );
        const patch: Record<string, unknown> = {};
        if (effFamily !== undefined) patch.fontFamily = effFamily;
        if (effWeight !== undefined) patch.fontWeight = effWeight;
        if (Object.keys(patch).length === 0) continue;
        edits[layer.id] = { ...(edits[layer.id] ?? {}), ...patch };
      }
    }
    const res = await fetch("/api/export/psd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: slot.templateId,
        edits,
        canvasWidth: slot.width,
        canvasHeight: slot.height,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "导出失败");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slot.name}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDownload() {
    if (slots.length === 1) {
      setExporting(true);
      try {
        await exportOneSlot(slots[0]);
      } catch (err) {
        alert(err instanceof Error ? err.message : "导出失败");
      } finally {
        setExporting(false);
      }
      return;
    }
    setExportModalOpen(true);
  }

  async function handleExportConfirm(scope: "all" | "current") {
    setExportModalOpen(false);
    setExporting(true);
    try {
      const targets = scope === "current" ? [activeSlot] : slots;
      for (const slot of targets) {
        await exportOneSlot(slot);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {/* 卡片面板：填满父容器（页面级内边距由 app/editor/[id]/page.tsx 负责） */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-[12px] bg-white/90">
        <EditorTopbar
          activity={activity}
          onExtend={() => {
            setSelected(null);
            setExtendModalOpen(true);
          }}
          onDownload={() => {
            setSelected(null);
            handleDownload();
          }}
          exporting={exporting}
        />
        <div className="flex min-h-0 min-w-0 flex-1">
          <SlotPanel
            slots={slots}
            activeSlotId={activeSlotId}
            onSelect={handleSelectSlot}
            onDelete={handleDeleteSlot}
          />
          <CanvasStage
            template={template}
            slot={activeSlot}
            layers={layers}
            loading={loadingLayers}
            editState={editState}
            selection={selected}
            onSelect={setSelected}
            onUpdate={updateLayer}
          />
          <PropertyPanel
            template={template}
            layers={layers}
            editState={editState}
            selection={selected}
            onUpdate={updateLayer}
            onReplaceModule={handleReplaceModule}
            onDeleteModule={handleDeleteModule}
          />
        </div>
      </div>

      <ExtendModal
        open={extendModalOpen}
        onClose={() => setExtendModalOpen(false)}
        onConfirm={handleAddSlots}
      />

      <ExportModal
        open={exportModalOpen}
        slots={slots}
        activeSlot={activeSlot}
        onClose={() => setExportModalOpen(false)}
        onConfirm={handleExportConfirm}
      />
    </>
  );
}
