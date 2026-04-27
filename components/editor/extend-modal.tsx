"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { SLOT_PRESETS, type SlotPreset, type SlotSize } from "@/lib/slot-presets";

interface ExtendModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (picks: Array<{ preset: SlotPreset; size: SlotSize }>) => void;
}

export function ExtendModal({ open, onClose, onConfirm }: ExtendModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pickCount, setPickCount] = useState(0);

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

  async function runFakeAiAnimation() {
    await new Promise<void>((resolve) => setTimeout(resolve, 3500));
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
      setPickCount(picks.length);
      await runFakeAiAnimation();
      setLoading(false);
    }

    onConfirm(picks);
    setSelected(new Set());
  }

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  return (
    <>
      {/* ── 选择弹窗 ── */}
      <div
        className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={handleClose}
      >
        <div
          className="modal-card-enter flex h-[616px] w-[720px] flex-col rounded-[12px] bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-6 pb-3 pt-6">
            <h2 className="text-[20px] font-medium text-grey-primary">
              选择需要新增的资源位
            </h2>
            <button
              type="button"
              aria-label="关闭"
              onClick={handleClose}
              disabled={loading}
              className="flex size-8 items-center justify-center text-grey-tertiary transition-colors hover:text-grey-primary disabled:opacity-30"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* 分组列表 */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-3">
            {SLOT_PRESETS.map((preset) => {
              return (
                <div
                  key={preset.id}
                  className="h-[74px] rounded-[10px] bg-grey-50 px-6 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-normal text-grey-primary">
                          {preset.name}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                        {preset.sizes.map((size) => {
                          const k = keyOf(preset.id, size.id);
                          const checked = selected.has(k);
                          return (
                            <label
                              key={size.id}
                              className="flex cursor-pointer items-center gap-2 text-[14px] text-grey-primary"
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
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部操作区 */}
          <div className="flex items-end justify-between px-6 pb-6 pt-10">
            <span className="text-[14px] font-normal leading-8 text-grey-tertiary">
              当前已选择 {selected.size} 个需要延展的尺寸
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="h-8 rounded-[8px] bg-[#F7F8FA] px-3 text-[14px] font-medium text-[#7C889C] transition-colors hover:bg-grey-100 disabled:opacity-40"
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
        <div className="modal-backdrop-enter fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="modal-card-enter flex items-center gap-2 text-white text-[16px]">
            <Loader2 className="size-3.5 animate-spin" />
            <span>AI 正在生成 {pickCount} 个资源位…</span>
          </div>
        </div>
      )}
    </>
  );
}
