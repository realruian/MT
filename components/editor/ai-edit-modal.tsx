"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

interface AiEditModalProps {
  /** 选中图片层当前的 imageUrl（始终作为生成的 base） */
  originalImageUrl: string;
  onClose: () => void;
  /** 用户点 [应用] 时回调，传新图 URL */
  onApply: (newImageUrl: string) => void;
}

interface HistoryEntry {
  /** 我们 blob 存储里的 URL（永久） */
  url: string;
  /** 用户当时输入的 prompt */
  prompt: string;
}

/** 推荐 prompt 模板（运营常用） */
const PROMPT_TEMPLATES = [
  "把背景换成纯白",
  "把背景换成淡粉色",
  "去除图片中的水印 / logo",
  "把商品换成红色",
  "增强光照、提亮整体",
  "把人物换成卡通插画风格",
  "加上节日装饰元素",
  "把图变成春节红色氛围",
];

const MAX_HISTORY = 10;

export function AiEditModal({
  originalImageUrl,
  onClose,
  onApply,
}: AiEditModalProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 历史生成版本（最近 10 个）。null 索引表示当前预览原图。 */
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  // 注：组件不再接 `open` prop，由父级用 `{aiOpen && <AiEditModal ... />}`
  // 控制挂载/卸载——每次重新打开都是 fresh state，自动满足"会话内保留"。

  // 当前预览图：选中历史版本 → 该版 url；否则 → 原图
  const previewUrl =
    selectedIdx !== null && history[selectedIdx]
      ? history[selectedIdx].url
      : originalImageUrl;

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("请描述你想要的修改");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: originalImageUrl,
          prompt: trimmed,
        }),
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
      // 入栈，自动选中最新版本
      setHistory((prev) => {
        const next = [...prev, { url: data.imageUrl!, prompt: trimmed }];
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });
      // selectedIdx 指向新入栈的最后一项
      const newLen = Math.min(history.length + 1, MAX_HISTORY);
      setSelectedIdx(newLen - 1);
    } catch (e) {
      setError(
        e instanceof Error ? `生成失败：${e.message}` : "生成失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (selectedIdx === null) {
      setError("请先生成或选择一个版本");
      return;
    }
    const entry = history[selectedIdx];
    if (!entry) return;
    onApply(entry.url);
    onClose();
  }

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => !loading && onClose()}
    >
      <div
        className="modal-card-enter flex w-[720px] flex-col rounded-[12px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 pb-3 pt-6">
          <h2 className="flex items-center gap-2 text-[20px] font-medium text-grey-primary">
            <Sparkles className="size-5" />
            AI 修改
          </h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            disabled={loading}
            className="flex size-8 items-center justify-center text-grey-tertiary transition-colors hover:text-grey-primary disabled:opacity-30"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex flex-col gap-5 px-6">
          {/* 预览区 */}
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[8px] bg-grey-50">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="预览"
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <span className="text-[14px] text-grey-tertiary">无图</span>
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

          {/* 历史版本（仅本会话） */}
          {history.length > 0 && (
            <div>
              <div className="mb-2 text-[14px] text-grey-tertiary">
                历史版本（最多保留 {MAX_HISTORY} 个，关闭弹窗后清空）
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {/* 原图按钮 */}
                <button
                  type="button"
                  onClick={() => setSelectedIdx(null)}
                  className={[
                    "relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border-2 transition-colors",
                    selectedIdx === null
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
                    onClick={() => setSelectedIdx(i)}
                    className={[
                      "relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border-2 transition-colors",
                      selectedIdx === i
                        ? "border-[#11192D]"
                        : "border-transparent hover:border-grey-200",
                    ].join(" ")}
                    title={h.prompt}
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

          {/* Prompt 模板 */}
          <div>
            <div className="mb-2 text-[14px] text-grey-tertiary">推荐示例</div>
            <div className="flex flex-wrap gap-2">
              {PROMPT_TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={loading}
                  onClick={() => setPrompt(t)}
                  className="rounded-full bg-[#F7F8FA] px-3 py-1 text-[14px] text-[#7C889C] transition-colors hover:bg-grey-100 disabled:opacity-40"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt 输入 */}
          <div>
            <label
              htmlFor="ai-prompt"
              className="mb-2 block text-[14px] text-grey-tertiary"
            >
              描述你想要的修改
            </label>
            <textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              rows={3}
              maxLength={500}
              placeholder="例：把背景换成淡粉色，并加上飘落的花瓣"
              className="block w-full resize-none rounded-[8px] border border-grey-border bg-white px-3 py-2 text-[14px] text-grey-primary outline-none transition-colors focus:border-[#11192D] disabled:bg-grey-50 disabled:opacity-60"
            />
            <div className="mt-1 text-right text-[14px] text-grey-tertiary">
              {prompt.length}/500
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div
              role="alert"
              className="rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#C72A26]"
            >
              {error}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 px-6 pb-6 pt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-8 rounded-[8px] bg-[#F7F8FA] px-3 text-[14px] font-medium text-[#7C889C] transition-colors hover:bg-grey-100 disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || prompt.trim().length === 0}
            className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[#11192D] px-3 text-[14px] font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                生成中
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                生成
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || selectedIdx === null}
            className="h-8 rounded-[8px] bg-[#11192D] px-3 text-[14px] font-medium text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
}

