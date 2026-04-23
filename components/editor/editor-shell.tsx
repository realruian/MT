"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PsdLayer, Template } from "@/types/template";
import {
  fetchExposedFamilies,
  preloadFonts,
  type FontFamilyDef,
} from "@/lib/fonts";
import type { SlotPreset, SlotSize } from "@/lib/slot-presets";
import { SLOT_PRESETS_DEMO_TEMPLATE } from "@/lib/slot-presets";
import { EditorTopbar } from "./editor-topbar";
import { SlotPanel, type LeftPanelTab } from "./slot-panel";
import { CanvasStage } from "./canvas-stage";
import { PropertyPanel } from "./property-panel";
import { ExtendModal } from "./extend-modal";
import { ExportModal } from "./export-modal";
import type { VenueComponent } from "./venue-components";
import {
  insertComponentIntoLayers,
} from "./insert-venue-component";
import { reorderBlockInLayers } from "./venue-blocks";
import { reflowVenueBlocks } from "./venue-reflow";

export type SlotId = string;

/**
 * undo/redo 历史快照（D6）：同时记录 editState 和 layers。
 * - editState：属性面板所有编辑覆盖（文字/字体/颜色/可见性…）
 * - layers：venue 画布图层数组（含 originalGroup 换位顺序 + 插入 instance）
 * 非 venue slot 的 layers 字段对 undo 无意义但无害（restore 时 setLayers
 * 写入的是已经 fetch 过的数组，reflow effect 会立即短路跳过）。
 */
type HistorySnapshot = {
  editState: Record<string, Partial<PsdLayer>>;
  layers: PsdLayer[];
};

/**
 * venue 画布的虚拟 layerId：用于把"画布背景色"塞进 editState 享受 undo/redo。
 * 约定字段：`editState[VENUE_CANVAS_ID].fontColor` = 当前 bgColor（hex，含 #）。
 * 不对应任何真实 layer，不会参与渲染 / 导出 edits 映射。
 */
export const VENUE_CANVAS_ID = "__venue_canvas__";

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
  /** 画布背景色（hex，含 #）；editState[VENUE_CANVAS_ID].fontColor 覆盖此默认 */
  bgColor?: string;
}

interface EditorShellProps {
  template: Template;
  activity?: string;
  /** true = 全套活动模板，启用完整 venue 编辑器；false = 普通编辑器（无左侧 + 无延展） */
  isVenueMode?: boolean;
}

export function EditorShell({ template, activity, isVenueMode = false }: EditorShellProps) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    isVenueMode
      ? [
          {
            id: "venue",
            name: "会场",
            templateId: template.id,
            thumbnail: template.thumbnail,
            width: template.canvasWidth ?? template.width,
            height: template.canvasHeight ?? template.height,
            bgColor: "#FFFFFF",
          },
        ]
      : [
          {
            id: "main",
            name: template.name,
            templateId: template.id,
            thumbnail: template.thumbnail,
            width: template.canvasWidth ?? template.width,
            height: template.canvasHeight ?? template.height,
          },
        ],
  );
  // venue 模板原始画布尺寸（用于 reflow / recompute 里识别"铺底背景"）。
  // 画布 height 本身会被 reflow 自动调整，但这两个常量固定不变。
  const venueCanvasRef = useRef<{ width: number; height: number }>({
    width: template.canvasWidth ?? template.width,
    height: template.canvasHeight ?? template.height,
  });
  const [activeSlotId, setActiveSlotId] = useState<SlotId>(isVenueMode ? "venue" : "main");
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const activeSlot = slots.find((s) => s.id === activeSlotId) ?? slots[0];

  // 左侧面板 tab 状态：会场（会场组件库）/ 资源位（多尺寸 slot 列表）。
  // 默认停在"会场"tab 与默认 activeSlotId="venue" 保持一致的画布入口。
  const [leftTab, setLeftTab] = useState<LeftPanelTab>("venue");
  // 当前被选中的会场组件卡片 id；Step 1 仅用于卡片 active 高亮，不做插入
  const [selectedVenueComponentId, setSelectedVenueComponentId] = useState<
    string | null
  >(null);

  // 二级选中：moduleId 模块级 / layerId 元素级（layerId 必须配合 moduleId）
  const [selected, setSelected] = useState<
    { moduleId?: string; layerId?: string } | null
  >(null);

  // 图层数据（从 API 拉取）+ 用户编辑 overlay
  const [layers, setLayers] = useState<PsdLayer[]>([]);
  const [loadingLayers, setLoadingLayers] = useState(true);
  const [editState, setEditState] = useState<Record<string, Partial<PsdLayer>>>({});
  // venue 画布当前完整 layers 快照（D7）：切去别的 slot 再切回 venue 时优先
  // 读 ref，fallback fetch API；保证 originalGroup 手动换位顺序也不丢失。
  const venueInsertedLayersRef = useRef<PsdLayer[]>([]);

  // layers 镜像 ref：供双 rAF 回调读取 reflow 后的最新 y 坐标
  const layersRef = useRef<PsdLayer[]>([]);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  // canvas-stage 暴露：滚动容器 + 当前 scale（用于插入组件后自动定位）
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const canvasScaleRef = useRef<number>(0.5);

  const updateLayer = useCallback(
    (id: string, updates: Partial<PsdLayer>) => {
      setEditState((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...updates },
      }));
    },
    [],
  );

  // undo / redo 历史栈（D6）：快照结构扩展为 { editState, layers }。
  // 防抖 500ms，在 editState 或 layers 任一变化后将"变化前"快照推入 past 栈。
  // suppressNextSnapshotRef：undo/redo 触发的 setState 不能再次入栈。
  const [historyFuture, setHistoryFuture] = useState<HistorySnapshot[]>([]);
  const historyPastRef = useRef<HistorySnapshot[]>([]);
  const prevSnapshotRef = useRef<HistorySnapshot>({ editState: {}, layers: [] });
  const suppressNextSnapshotRef = useRef(false);

  useEffect(() => {
    if (suppressNextSnapshotRef.current) {
      // undo/redo 触发的变更：不入栈，但更新 prevSnapshotRef 为当前已恢复的状态，
      // 使下一次真实用户操作的 "变化前" 基线对齐
      suppressNextSnapshotRef.current = false;
      prevSnapshotRef.current = { editState, layers };
      return;
    }
    const timer = setTimeout(() => {
      const prev = prevSnapshotRef.current;
      if (editState === prev.editState && layers === prev.layers) return;
      historyPastRef.current = [
        ...historyPastRef.current,
        prev,
      ];
      if (historyPastRef.current.length > 50) {
        historyPastRef.current = historyPastRef.current.slice(-50);
      }
      prevSnapshotRef.current = { editState, layers };
      setHistoryFuture([]);
    }, 500);
    return () => clearTimeout(timer);
  }, [editState, layers]);

  const undo = useCallback(() => {
    if (historyPastRef.current.length === 0) return;
    const prevSnapshot = historyPastRef.current[historyPastRef.current.length - 1];
    historyPastRef.current = historyPastRef.current.slice(0, -1);
    setHistoryFuture((f) => [{ editState, layers }, ...f]);
    suppressNextSnapshotRef.current = true;
    setEditState(prevSnapshot.editState);
    setLayers(prevSnapshot.layers);
    // D7：同步 venueInsertedLayersRef，切走 / 切回 venue 后还原 undo 后的状态
    venueInsertedLayersRef.current = prevSnapshot.layers;
  }, [editState, layers]);

  const redo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const [nextSnapshot, ...rest] = historyFuture;
    historyPastRef.current = [...historyPastRef.current, { editState, layers }];
    suppressNextSnapshotRef.current = true;
    setEditState(nextSnapshot.editState);
    setLayers(nextSnapshot.layers);
    venueInsertedLayersRef.current = nextSnapshot.layers;
    setHistoryFuture(rest);
  }, [editState, layers, historyFuture]);

  // canUndo/canRedo：historyPastRef 是 ref（不触发 rerender），
  // 但每次入栈/出栈都伴随 setHistoryFuture 或 setEditState/setLayers 的 state 更新，
  // 触发 rerender 时 ref 已是最新值，直接读取即可。
  const canUndo = historyPastRef.current.length > 0;
  const canRedo = historyFuture.length > 0;

  // 编辑器字体下拉数据：运行时从 /api/fonts/families 拉取 EXPOSED 精选家族。
  // 独立于 slot 切换的 useEffect，整个编辑器会话只拉一次；拉到后立刻
  // preloadFonts 到 document.fonts，供画布内文字实时渲染。失败不阻塞
  // 编辑器其它功能——字体数组保持空数组，下拉显示"（未安装）"占位。
  const [fontFamilies, setFontFamilies] = useState<FontFamilyDef[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const families = await fetchExposedFamilies();
        if (cancelled) return;
        setFontFamilies(families);
        await preloadFonts(families);
      } catch (err) {
        console.error("[fonts] fetch/preload failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 拉图层；slot 切换时重新拉取并清空选中 / editState。
  // venue 切回时把 venueInsertedLayersRef.current（当前 session 已插入的会场组件
  // 图层）拼回到原始 venue layers 末尾，避免"切到别的 slot 再回来插入的组件
  // 消失"这种 footgun。
  useEffect(() => {
    let cancelled = false;
    const isVenue = activeSlot.id === "venue";
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
        // D7 全快照：有保存的 venue 快照时直接还原（含 originalGroup 换位顺序）；
        // 否则用 API 返回的原始 layers（ref 为空 = 首次加载）
        if (isVenue && venueInsertedLayersRef.current.length > 0) {
          setLayers(venueInsertedLayersRef.current);
        } else {
          setLayers(data);
        }
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
  }, [activeSlot.templateId, activeSlot.id]);

  // slot 切换：清空历史栈，避免上个 slot 的快照被 undo 回到新 slot 上
  useEffect(() => {
    historyPastRef.current = [];
    prevSnapshotRef.current = { editState: {}, layers: [] };
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

  // 切换左侧 tab：会场→强制画布回到 venue；资源位→若当前是 venue 则跳到列表第一个非 venue slot。
  // 任何 tab 切换都清掉选中避免混淆属性面板状态。
  function handleTabChange(next: LeftPanelTab) {
    setLeftTab(next);
    setSelected(null);
    if (next === "venue") {
      setActiveSlotId("venue");
      return;
    }
    if (activeSlotId === "venue") {
      const firstExtended = slots.find((s) => s.id !== "venue");
      if (firstExtended) setActiveSlotId(firstExtended.id);
    }
  }

  // 点击会场组件卡片 → 克隆 payload.layers 追加到 venue 画布底部；
  // 画布高度不在这里算，由下面的 useEffect([layers, editState]) 统一重算。
  // 假定调用时 activeSlotId === "venue"（会场 tab 下点的组件，tab 切换逻辑已
  // 保证这个恒等）；非 venue 场景只更新 active 视觉态不动画布。
  //
  // PR3 起 SlotPanel 直传完整 VenueComponent 对象（不再传 id 由 shell 自查），
  // 因为组件数据已从 MOCK 常量改为 /api/venue-components 实时数据，shell
  // 本身不再持有组件列表。
  function handleSelectVenueComponent(component: VenueComponent) {
    setSelectedVenueComponentId(component.id);
    if (activeSlotId !== "venue") {
      console.warn(
        "[VenueComponentCard] skipped insert: activeSlotId is not venue",
      );
      return;
    }
    const venueSlot = slots.find((s) => s.id === "venue");
    if (!venueSlot) return;

    const { nextLayers, rootLayerId } = insertComponentIntoLayers(
      layers,
      component,
      venueSlot.templateId,
    );

    // 全快照（D7）：记录插入后的完整 venue layers，切走切回都能还原
    venueInsertedLayersRef.current = nextLayers;
    setLayers(nextLayers);

    // 选中新组件根：经 ensureRootGroup 规范化后根永远是 group，走模块选中；
    // 兜底分支保留以防 rootLayerId 为 null（组件 payload 为空之类异常）
    if (rootLayerId) {
      const root = nextLayers.find((l) => l.id === rootLayerId);
      if (root?.layerType === "group") {
        setSelected({ moduleId: rootLayerId });
      } else {
        setSelected({ layerId: rootLayerId });
      }

      // 双 rAF：等第一帧 setLayers 提交后，再等一帧让 reflow useEffect 跑完，
      // 读取 reflow 后的 y 位置并平滑滚动到新组件居中显示
      const capturedId = rootLayerId;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newLayer = layersRef.current.find((l) => l.id === capturedId);
          if (!newLayer || !canvasScrollRef.current) return;
          const s = canvasScaleRef.current;
          // py-10 = 40px 是 venue 滚动容器内层 wrapper 的顶部 padding
          const PY_10 = 40;
          const targetY = PY_10 + newLayer.y * s;
          const containerH = canvasScrollRef.current.clientHeight;
          const scrollTop = targetY - containerH / 2 + (newLayer.height * s) / 2;
          canvasScrollRef.current.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: "smooth",
          });
        });
      });
    }
    console.log(
      "[VenueComponentCard] inserted:",
      component.id,
      "root:",
      rootLayerId,
    );
  }

  // venue 画布全量 autolayout reflow：layers/editState 变化时对所有 block
  // (originalGroup + instance) 从 TOP_PADDING=24 起自上而下铺排，删除/隐藏
  // block 后下方内容自动上移填空。reflow 不改的情况下返回原引用 → 短路避免循环。
  // 同时从 nextHeight 取出新画布高度，一次 effect 同步搞定 reflow + height。
  useEffect(() => {
    if (activeSlot.id !== "venue") return;
    const { nextLayers, nextEditState, nextHeight } = reflowVenueBlocks(
      layers,
      editState,
      venueCanvasRef.current.width,
      venueCanvasRef.current.height,
    );
    if (nextLayers !== layers) setLayers(nextLayers);
    if (nextEditState !== editState) setEditState(nextEditState);
    setSlots((prev) => {
      const venue = prev.find((s) => s.id === "venue");
      if (!venue || venue.height === nextHeight) return prev;
      return prev.map((s) => (s.id === "venue" ? { ...s, height: nextHeight } : s));
    });
  }, [layers, editState, activeSlot.id]);

  // venue 组件拖拽换位：把被拖 block 在 layers 里整体 splice 到 newIndex 位置，
  // reflow useEffect 自动基于新数组顺序重算所有 y。
  // - 同步 venueInsertedLayersRef 全快照（D7），切走 / 切回 venue 后顺序不回退
  const handleReorderBlock = useCallback(
    (blockKey: { kind: "originalGroup" | "instance"; id: string }, newIndex: number) => {
      if (activeSlot.id !== "venue") return;
      setLayers((prev) => {
        const next = reorderBlockInLayers(prev, blockKey, newIndex);
        venueInsertedLayersRef.current = next;
        return next;
      });
    },
    [activeSlot.id],
  );


  // beforeunload 提示：venue 当前 layers 含任一"来自组件库的图层"时挂载原生
  // 离开确认（浏览器只显示默认文案，无法自定义），提醒用户刷新会丢失插入
  useEffect(() => {
    const hasInserted = layers.some((l) => l.sourceComponentId != null);
    if (!hasInserted) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [layers]);

  // 画布背景色 eff 值 + 编辑回调（走 editState 享受 undo/redo）
  const venueSlot = slots.find((s) => s.id === "venue");
  const effVenueBgColor =
    editState[VENUE_CANVAS_ID]?.fontColor ?? venueSlot?.bgColor ?? "#FFFFFF";
  const handleCanvasBgColorChange = useCallback(
    (hex: string) => {
      updateLayer(VENUE_CANVAS_ID, { fontColor: hex });
    },
    [updateLayer],
  );

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
      // PSD-backed slot 用自己的 templateId；尺寸占位 slot 降级到 demo 模板
      templateId: size.templateId ?? SLOT_PRESETS_DEMO_TEMPLATE,
      width: size.width,
      height: size.height,
    }));
    setSlots((prev) => [...prev, ...newSlots]);
    if (newSlots.length > 0) {
      setActiveSlotId(newSlots[0].id);
      setSelected(null);
      // 刚拓展出的资源位应立即在"资源位"tab 下可见
      setLeftTab("slots");
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
      // VENUE_CANVAS_ID 是"画布背景色"的虚拟键，不对应任何 layer，
      // 单独通过 bgColor 字段下发给后端，这里过滤掉
      if (id === VENUE_CANVAS_ID) continue;
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
    // venue 画布上存在"来自组件库"的插入图层时，把当前完整 layers 送后端，
    // 绕过后端按 templateId 从 DB 拉 layers 的默认路径（DB 里不包含插入图层）
    const bodyPayload: Record<string, unknown> = {
      templateId: slot.templateId,
      edits,
      canvasWidth: slot.width,
      canvasHeight: slot.height,
    };
    if (
      slot.id === "venue" &&
      layers.some((l) => l.sourceComponentId != null)
    ) {
      bodyPayload.layers = layers;
    }
    // 画布背景色：venue 走 eff 值（editState 覆盖 slot.bgColor），其他 slot
    // 走 slot.bgColor（目前只有 venue 有 UI 入口，延展 slot 保持默认白）
    if (slot.id === "venue") {
      bodyPayload.bgColor = effVenueBgColor;
    } else if (slot.bgColor) {
      bodyPayload.bgColor = slot.bgColor;
    }
    const res = await fetch("/api/export/psd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
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
      <div className="flex flex-1 flex-col overflow-hidden rounded-[12px] bg-white/50">
        <EditorTopbar
          activity={activity}
          isVenueMode={isVenueMode}
          onExtend={() => {
            if (!isVenueMode) return;
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
          {isVenueMode && (
            <SlotPanel
              slots={slots}
              activeSlotId={activeSlotId}
              onSelect={handleSelectSlot}
              onDelete={handleDeleteSlot}
              tab={leftTab}
              onTabChange={handleTabChange}
              selectedVenueComponentId={selectedVenueComponentId}
              onSelectVenueComponent={handleSelectVenueComponent}
            />
          )}
          <CanvasStage
            template={template}
            slot={activeSlot}
            layers={layers}
            loading={loadingLayers}
            editState={editState}
            selection={selected}
            onSelect={setSelected}
            onUpdate={updateLayer}
            onReorderBlock={handleReorderBlock}
            scrollRef={canvasScrollRef}
            scaleRef={canvasScaleRef}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
          />
          <PropertyPanel
            template={template}
            layers={layers}
            editState={editState}
            selection={selected}
            onUpdate={updateLayer}
            onReplaceModule={handleReplaceModule}
            onDeleteModule={handleDeleteModule}
            isVenue={isVenueMode && activeSlotId === "venue"}
            canvasBgColor={effVenueBgColor}
            onCanvasBgColorChange={handleCanvasBgColorChange}
            fontFamilies={fontFamilies}
          />
        </div>
      </div>

      {isVenueMode && (
        <ExtendModal
          open={extendModalOpen}
          onClose={() => setExtendModalOpen(false)}
          onConfirm={handleAddSlots}
        />
      )}

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
