"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Loader2, Redo2, Undo2, X } from "lucide-react";

interface AiEditModalProps {
  /** 选中图片层当前的 imageUrl（始终作为生成的 base） */
  originalImageUrl: string;
  onClose: () => void;
  /** 用户点 [应用] 时回调，传新图 URL */
  onApply: (newImageUrl: string) => void;
}

interface HistoryEntry {
  url: string;
  label: string;
}

interface Region {
  id: string;
  editType: "text" | "image";
  /** % 0–100，相对图片自然尺寸 */
  x: number;
  y: number;
  width: number;
  height: number;
  newText?: string;
  imagePrompt?: string;
}

type Mode = "text" | "image";

const MAX_HISTORY = 10;
const MAX_NEW_TEXT = 100;
const MAX_IMAGE_PROMPT = 200;
const PREVIEW_MAX_W = 832;
const PREVIEW_MAX_H = 480;
const MIN_REGION_PCT = 3;
const REGION_HISTORY_CAP = 30;

let regionIdCounter = 0;
const newRegionId = (): string => `r${++regionIdCounter}`;

export function AiEditModal({
  originalImageUrl,
  onClose,
  onApply,
}: AiEditModalProps) {
  const [mode, setMode] = useState<Mode>("image");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 改图 tab 整图 prompt（仅在 mode='image' && 没画框时生效） */
  const [wholeImagePrompt, setWholeImagePrompt] = useState("");

  /**
   * 全部区域；每个 tab 至多 1 个，按 editType 过滤。
   * 用数组而不是单对象是为了让 tab 切换时保留另一 tab 的区域。
   */
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionPast, setRegionPast] = useState<Region[][]>([]);
  const [regionFuture, setRegionFuture] = useState<Region[][]>([]);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState<number | null>(
    null,
  );

  const previewUrl =
    selectedHistoryIdx !== null && history[selectedHistoryIdx]
      ? history[selectedHistoryIdx].url
      : originalImageUrl;

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  useEffect(() => {
    if (!previewUrl) {
      setNaturalSize(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setNaturalSize(null);
    };
    img.src = previewUrl;
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  const previewBox = useMemo(() => {
    if (!naturalSize) {
      return { w: PREVIEW_MAX_W, h: Math.round(PREVIEW_MAX_W * 0.5625) };
    }
    const ratio = naturalSize.w / naturalSize.h;
    let w = PREVIEW_MAX_W;
    let h = w / ratio;
    if (h > PREVIEW_MAX_H) {
      h = PREVIEW_MAX_H;
      w = h * ratio;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [naturalSize]);

  // 当前 tab 的 region（最多 1 个）
  const currentRegion = useMemo(
    () => regions.find((r) => r.editType === mode) ?? null,
    [regions, mode],
  );

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
  }

  // 鼠标拖框
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);

  function pushRegionUndo(prev: Region[]) {
    setRegionPast((p) => {
      const next = [...p, prev];
      return next.length > REGION_HISTORY_CAP
        ? next.slice(-REGION_HISTORY_CAP)
        : next;
    });
    setRegionFuture([]);
  }

  function getPctCoords(e: ReactMouseEvent): { x: number; y: number } | null {
    const rect = previewWrapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }

  function handlePreviewMouseDown(e: ReactMouseEvent) {
    if (loading) return;
    const pos = getPctCoords(e);
    if (!pos) return;
    setError(null);
    setDraft({ startX: pos.x, startY: pos.y, curX: pos.x, curY: pos.y });
  }

  function handlePreviewMouseMove(e: ReactMouseEvent) {
    if (!draft) return;
    const pos = getPctCoords(e);
    if (!pos) return;
    setDraft({ ...draft, curX: pos.x, curY: pos.y });
  }

  function handlePreviewMouseUp() {
    if (!draft) return;
    const x = Math.min(draft.startX, draft.curX);
    const y = Math.min(draft.startY, draft.curY);
    const width = Math.abs(draft.curX - draft.startX);
    const height = Math.abs(draft.curY - draft.startY);
    setDraft(null);
    if (width < MIN_REGION_PCT || height < MIN_REGION_PCT) return;

    const id = newRegionId();
    // 沿用当前 tab 的旧 region 内容（如果有）
    const old = regions.find((r) => r.editType === mode);
    const newRegion: Region =
      mode === "text"
        ? {
            id,
            editType: "text",
            x,
            y,
            width,
            height,
            newText: old?.newText ?? "",
          }
        : {
            id,
            editType: "image",
            x,
            y,
            width,
            height,
            imagePrompt: old?.imagePrompt ?? "",
          };
    pushRegionUndo(regions);
    // 替换当前 tab 的 region（如果存在），保留其他 tab 的
    setRegions((prev) => [
      ...prev.filter((r) => r.editType !== mode),
      newRegion,
    ]);
  }

  function updateCurrentRegion(patch: Partial<Region>) {
    if (!currentRegion) return;
    setRegions((prev) =>
      prev.map((r) => (r.id === currentRegion.id ? { ...r, ...patch } : r)),
    );
  }

  function undoRegion() {
    setRegionPast((past) => {
      if (past.length === 0) return past;
      const prev = past[past.length - 1];
      setRegionFuture((f) => [...f, regions]);
      setRegions(prev);
      return past.slice(0, -1);
    });
  }

  function redoRegion() {
    setRegionFuture((future) => {
      if (future.length === 0) return future;
      const next = future[future.length - 1];
      setRegionPast((p) => [...p, regions]);
      setRegions(next);
      return future.slice(0, -1);
    });
  }

  async function handleGenerate() {
    setError(null);

    // 改图 tab + 没画框 → 整图模式
    if (mode === "image" && !currentRegion) {
      const trimmed = wholeImagePrompt.trim();
      const finalPrompt =
        trimmed || "请保留原图主体，重新生成图像，保持整体风格一致";
      setLoading(true);
      try {
        const res = await fetch("/api/ai-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: originalImageUrl, prompt: finalPrompt }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          imageUrl?: string;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.imageUrl) {
          setError(data.error ?? `生成失败（${res.status}），请稍后重试`);
          return;
        }
        pushHistory({
          url: data.imageUrl,
          label: trimmed.slice(0, 20) || "整图重绘",
        });
      } catch (e) {
        setError(
          e instanceof Error ? `生成失败:${e.message}` : "生成失败，请稍后重试",
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    // 框选模式
    if (!currentRegion) {
      setError("请先在预览图上画框选择区域");
      return;
    }
    if (mode === "text") {
      if (!currentRegion.newText || !currentRegion.newText.trim()) {
        setError("请填写新文案");
        return;
      }
    } else {
      if (!currentRegion.imagePrompt || !currentRegion.imagePrompt.trim()) {
        setError("请填写图像描述");
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        imageUrl: originalImageUrl,
        regions: [
          {
            editType: currentRegion.editType,
            x: currentRegion.x,
            y: currentRegion.y,
            width: currentRegion.width,
            height: currentRegion.height,
            newText:
              currentRegion.editType === "text"
                ? currentRegion.newText?.trim()
                : undefined,
            imagePrompt:
              currentRegion.editType === "image"
                ? currentRegion.imagePrompt?.trim() || undefined
                : undefined,
          },
        ],
      };
      const res = await fetch("/api/ai-edit/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        imageUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.imageUrl) {
        setError(data.error ?? `生成失败（${res.status}），请稍后重试`);
        return;
      }
      pushHistory({
        url: data.imageUrl,
        label: mode === "text" ? "改字" : "改图",
      });
    } catch (e) {
      setError(
        e instanceof Error ? `生成失败:${e.message}` : "生成失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }

  function pushHistory(entry: HistoryEntry) {
    setHistory((prev) => {
      const next = [...prev, entry];
      const trimmed = next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      setSelectedHistoryIdx(trimmed.length - 1);
      return trimmed;
    });
  }

  function handleApply() {
    if (selectedHistoryIdx === null) {
      setError("请先生成或选择一个版本");
      return;
    }
    const entry = history[selectedHistoryIdx];
    if (!entry) return;
    onApply(entry.url);
    onClose();
  }

  // 输入框配置
  const inputConfig = (() => {
    if (mode === "image" && !currentRegion) {
      return {
        value: wholeImagePrompt,
        onChange: setWholeImagePrompt,
        placeholder: "描述想要重新绘制的内容，不填将基于原图生成",
        maxLength: 500,
        disabled: loading,
      };
    }
    if (currentRegion) {
      if (mode === "text") {
        return {
          value: currentRegion.newText ?? "",
          onChange: (v: string) => updateCurrentRegion({ newText: v }),
          placeholder: "新文案，例：限时特价 9.9 元",
          maxLength: MAX_NEW_TEXT,
          disabled: loading,
        };
      }
      return {
        value: currentRegion.imagePrompt ?? "",
        onChange: (v: string) => updateCurrentRegion({ imagePrompt: v }),
        placeholder: "图像描述，例：换成红色苹果，光照明亮",
        maxLength: MAX_IMAGE_PROMPT,
        disabled: loading,
      };
    }
    // mode === 'text' && !currentRegion
    return {
      value: "",
      onChange: () => {},
      placeholder: "请先在预览图上拖动鼠标画出要改字的区域",
      maxLength: MAX_NEW_TEXT,
      disabled: true,
    };
  })();

  // 生成按钮可用性
  const generateDisabled = (() => {
    if (loading) return true;
    if (mode === "image" && !currentRegion) return false; // 整图模式允许空 prompt
    if (!currentRegion) return true; // 改字必须画框
    if (mode === "text")
      return !(currentRegion.newText && currentRegion.newText.trim());
    return !(currentRegion.imagePrompt && currentRegion.imagePrompt.trim());
  })();

  const canUndoRegion = regionPast.length > 0;
  const canRedoRegion = regionFuture.length > 0;

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => !loading && onClose()}
    >
      <div
        className="modal-card-enter flex max-h-[92vh] w-[880px] flex-col overflow-hidden rounded-[12px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-6">
          <h2 className="text-[20px] font-medium text-grey-primary">智能重绘</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            disabled={loading}
            className="flex size-8 items-center justify-center rounded-lg text-grey-secondary transition-colors hover:bg-grey-50 hover:text-grey-primary disabled:opacity-30"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab：改图 / 改字 */}
        <div className="flex shrink-0 gap-1 border-b border-grey-border px-6">
          {(["image", "text"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={loading}
              onClick={() => switchMode(m)}
              className={[
                "relative -mb-px px-3 py-2 text-[14px] font-medium transition-colors",
                mode === m
                  ? "text-grey-primary"
                  : "text-grey-tertiary hover:text-grey-primary",
                "disabled:opacity-40",
              ].join(" ")}
            >
              {m === "image" ? "改图" : "改字"}
              {mode === m && (
                <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-[#11192D]" />
              )}
            </button>
          ))}
        </div>

        {/* 滚动内容区：仅预览 + 历史 */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {/* 预览区 */}
          <div className="flex justify-center">
            <div
              ref={previewWrapRef}
              className={[
                "relative overflow-hidden rounded-[8px] bg-grey-50 select-none",
                !loading ? "cursor-crosshair" : "",
              ].join(" ")}
              style={{ width: previewBox.w, height: previewBox.h }}
              onMouseDown={handlePreviewMouseDown}
              onMouseMove={handlePreviewMouseMove}
              onMouseUp={handlePreviewMouseUp}
              onMouseLeave={() => draft && handlePreviewMouseUp()}
            >
              {previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewUrl}
                  alt="预览"
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[14px] text-grey-tertiary">
                  无图
                </div>
              )}

              {/* 区域 overlay：仅一个框，无标签 */}
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {currentRegion && (
                  <rect
                    x={currentRegion.x}
                    y={currentRegion.y}
                    width={currentRegion.width}
                    height={currentRegion.height}
                    fill="rgba(17,25,45,0.18)"
                    stroke="#11192D"
                    strokeWidth={0.5}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {draft && (
                  <rect
                    x={Math.min(draft.startX, draft.curX)}
                    y={Math.min(draft.startY, draft.curY)}
                    width={Math.abs(draft.curX - draft.startX)}
                    height={Math.abs(draft.curY - draft.startY)}
                    fill="rgba(17,25,45,0.08)"
                    stroke="#11192D"
                    strokeWidth={0.4}
                    strokeDasharray="1,0.6"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>

              {/* 悬浮工具栏：撤销/重做 */}
              {!loading && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <div className="pointer-events-auto flex items-center gap-1 rounded-lg bg-white px-1.5 py-1 shadow-md">
                    <button
                      type="button"
                      aria-label="撤销"
                      onClick={undoRegion}
                      disabled={!canUndoRegion}
                      className="flex size-7 items-center justify-center rounded-md text-grey-secondary transition-colors hover:bg-grey-50 hover:text-grey-primary disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Undo2 className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="重做"
                      onClick={redoRegion}
                      disabled={!canRedoRegion}
                      className="flex size-7 items-center justify-center rounded-md text-grey-secondary transition-colors hover:bg-grey-50 hover:text-grey-primary disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Redo2 className="size-4" />
                    </button>
                  </div>
                </div>
              )}

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <div className="flex flex-col items-center gap-2 text-grey-primary">
                    <Loader2 className="size-6 animate-spin" />
                    <span className="text-[14px]">AI 生成中…（最多 3 分钟）</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 历史版本 */}
          {history.length > 0 && (
            <div>
              <div className="mb-2 text-[14px] text-grey-tertiary">
                历史版本（最多保留 {MAX_HISTORY} 个，关闭弹窗后清空）
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedHistoryIdx(null)}
                  className={[
                    "relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border-2 transition-colors",
                    selectedHistoryIdx === null
                      ? "border-[#11192D]"
                      : "border-transparent hover:border-grey-200",
                  ].join(" ")}
                  title="原图"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={originalImageUrl}
                    alt="原图"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-[10px] text-white">
                    原图
                  </span>
                </button>
                {history.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedHistoryIdx(i)}
                    className={[
                      "relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border-2 transition-colors",
                      selectedHistoryIdx === i
                        ? "border-[#11192D]"
                        : "border-transparent hover:border-grey-200",
                    ].join(" ")}
                    title={h.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={h.url}
                      alt={`版本 ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-[10px] text-white">
                      v{i + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#C72A26]"
            >
              {error}
            </div>
          )}
        </div>

        {/* 输入条：常驻底部，不随滚动 */}
        <div className="shrink-0 border-t border-grey-border px-6 pt-4">
          <input
            type="text"
            value={inputConfig.value}
            onChange={(e) => inputConfig.onChange(e.target.value)}
            disabled={inputConfig.disabled}
            maxLength={inputConfig.maxLength}
            placeholder={inputConfig.placeholder}
            className="block h-11 w-full rounded-[10px] bg-grey-50 px-4 text-[14px] text-grey-primary outline-none transition-colors placeholder:text-grey-tertiary focus:bg-grey-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        {/* 底部按钮 */}
        <div className="flex shrink-0 items-center justify-end gap-2 px-6 py-4">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generateDisabled}
            className="flex h-8 items-center gap-1 rounded-lg bg-[#11192D] px-3 text-[16px] font-medium text-white transition-colors hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "生成中" : "生成"}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || selectedHistoryIdx === null}
            className="h-8 rounded-lg bg-[#11192D] px-3 text-[16px] font-medium text-white transition-colors hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-40"
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
}
