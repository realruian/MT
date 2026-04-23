"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { SLOT_PRESETS, type SlotPreset, type SlotSize } from "@/lib/slot-presets";

interface ExtendModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (picks: Array<{ preset: SlotPreset; size: SlotSize }>) => void;
}

const CIRCUMFERENCE = 2 * Math.PI * 80; // r=80

export function ExtendModal({ open, onClose, onConfirm }: ExtendModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [loadingCount, setLoadingCount] = useState(0);

  if (!open) return null;

  const keyOf = (presetId: string, sizeId: string) => `${presetId}::${sizeId}`;

  function togglePick(presetId: string, sizeId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(presetId, sizeId);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleAllInGroup(preset: SlotPreset) {
    const keys = preset.sizes.map((s) => keyOf(preset.id, s.id));
    const allSelected = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }

  /** rAF 平滑过渡 progress 从 from → to，耗时 duration ms */
  function animateProgressTo(from: number, to: number, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const startTime = performance.now();
      function step(now: number) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        // ease-out cubic 让最后阶段更自然
        const eased = 1 - Math.pow(1 - t, 2);
        setLoadingProgress(from + (to - from) * eased);
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          setLoadingProgress(to);
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  async function runFakeAiAnimation() {
    const stages = [
      { duration: 1000, text: "分析画布元素…", progressTo: 28 },
      { duration: 1000, text: "适配资源位尺寸…", progressTo: 58 },
      { duration: 1000, text: "生成布局…", progressTo: 88 },
      { duration: 500,  text: "即将完成…",     progressTo: 100 },
    ];
    let prev = 0;
    for (const stage of stages) {
      setLoadingText(stage.text);
      await animateProgressTo(prev, stage.progressTo, stage.duration);
      prev = stage.progressTo;
    }
  }

  async function handleConfirm() {
    if (loading) return;
    const picks: Array<{ preset: SlotPreset; size: SlotSize }> = [];
    for (const preset of SLOT_PRESETS) {
      for (const size of preset.sizes) {
        if (selected.has(keyOf(preset.id, size.id))) {
          picks.push({ preset, size });
        }
      }
    }
    if (picks.length === 0) return;

    const hasPsdBacked = picks.some((p) => p.size.templateId);

    if (hasPsdBacked) {
      setLoading(true);
      setLoadingProgress(0);
      setLoadingCount(picks.length);
      await runFakeAiAnimation();
      setLoading(false);
    }

    onConfirm(picks);
    setSelected(new Set());
  }

  const handleClose = () => {
    if (loading) return; // loading 期间禁止关闭
    onClose();
  };

  const dashOffset = CIRCUMFERENCE * (1 - loadingProgress / 100);

  return (
    <>
      {/* ── 选择弹窗 ── */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={handleClose}
      >
        <div
          className="flex h-[616px] w-[1000px] flex-col rounded-[12px] bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-6 pb-3 pt-6">
            <h2 className="text-[20px] font-medium text-[#11192D]">
              选择需要新增的渠道尺寸
            </h2>
            <button
              type="button"
              aria-label="关闭"
              onClick={handleClose}
              disabled={loading}
              className="flex size-8 items-center justify-center text-[#7c889c] transition-colors hover:text-[#11192D] disabled:opacity-30"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* 分组列表 */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-3">
            {SLOT_PRESETS.map((preset) => {
              const keys = preset.sizes.map((s) => keyOf(preset.id, s.id));
              const allSelected = keys.every((k) => selected.has(k));
              return (
                <div
                  key={preset.id}
                  className="h-[74px] rounded-[10px] bg-[#F4F6F8] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-normal text-[#11192D]">
                          {preset.name}
                        </span>
                        <span
                          className={[
                            "inline-flex h-[18px] items-center rounded-[4px] px-1.5 text-[11px] leading-none",
                            preset.channel === "外卖"
                              ? "bg-[#FFECB3] text-[#8A6100]"
                              : "bg-[#E4E7EC] text-[#4F607A]",
                          ].join(" ")}
                        >
                          {preset.channel}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                        {preset.sizes.map((size) => {
                          const k = keyOf(preset.id, size.id);
                          const checked = selected.has(k);
                          return (
                            <label
                              key={size.id}
                              className="flex cursor-pointer items-center gap-2 text-[14px] text-[#11192D]"
                            >
                              <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePick(preset.id, size.id)}
                                  className="peer sr-only"
                                />
                                <span
                                  aria-hidden
                                  className="absolute inset-0 rounded-[4px] bg-[#7C889C]/50 transition-colors peer-checked:bg-[#11192D]"
                                />
                                <svg
                                  aria-hidden
                                  viewBox="0 0 12 12"
                                  fill="none"
                                  stroke="white"
                                  strokeWidth={2.5}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="pointer-events-none relative size-2.5"
                                >
                                  <path d="M2 6.5 L5 9.5 L10 3" />
                                </svg>
                              </span>
                              {size.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleAllInGroup(preset)}
                      className="shrink-0 text-[14px] font-normal text-[#7c889c] transition-colors hover:text-[#11192D]"
                    >
                      {allSelected ? "取消全选" : "全选"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部操作区 */}
          <div className="flex items-center justify-between px-6 pb-6 pt-3">
            <span className="text-[14px] font-light text-[#7c889c]">
              当前已选择 {selected.size} 个需要延展的尺寸
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="h-8 rounded-[8px] bg-[#E9ECF1] px-3 text-[14px] font-medium text-[#7C889C] transition-colors hover:bg-[#dde1e8] disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selected.size === 0 || loading}
                className="h-8 rounded-[8px] bg-[#11192D] px-3 text-[14px] font-medium text-white transition-colors hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-40"
              >
                确认新增
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 假 AI Loading 全屏遮罩（z-[60]，高于弹窗 z-50） ── */}
      {loading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-5">
            {/* 圆形进度条 */}
            <svg
              width="200"
              height="200"
              viewBox="0 0 200 200"
              style={{ overflow: "visible" }}
            >
              {/* 底圈（浅色轨道） */}
              <circle
                cx="100"
                cy="100"
                r="80"
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="6"
              />
              {/* 进度弧 */}
              <circle
                cx="100"
                cy="100"
                r="80"
                fill="none"
                stroke="white"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 100 100)"
                style={{ transition: "stroke-dashoffset 0.05s linear" }}
              />
              {/* 百分比数字 */}
              <text
                x="100"
                y="100"
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="32"
                fontWeight="500"
                fontFamily="system-ui, sans-serif"
              >
                {Math.round(loadingProgress)}%
              </text>
            </svg>

            {/* 主文案 */}
            <p
              style={{
                fontSize: 18,
                color: "#FFFFFF",
                margin: 0,
                fontWeight: 500,
                letterSpacing: "0.02em",
              }}
            >
              {loadingText}
            </p>

            {/* 副文案 */}
            <p
              style={{
                fontSize: 14,
                color: "#C0C8D5",
                margin: 0,
              }}
            >
              正在生成 {loadingCount} 个资源位
            </p>
          </div>
        </div>
      )}
    </>
  );
}
