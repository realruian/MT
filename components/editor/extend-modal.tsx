"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { SLOT_PRESETS, type SlotPreset, type SlotSize } from "@/lib/slot-presets";

interface ExtendModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (picks: Array<{ preset: SlotPreset; size: SlotSize }>) => void;
}

export function ExtendModal({ open, onClose, onConfirm }: ExtendModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  function handleConfirm() {
    const picks: Array<{ preset: SlotPreset; size: SlotSize }> = [];
    for (const preset of SLOT_PRESETS) {
      for (const size of preset.sizes) {
        if (selected.has(keyOf(preset.id, size.id))) {
          picks.push({ preset, size });
        }
      }
    }
    onConfirm(picks);
    setSelected(new Set());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex h-[616px] w-[1000px] flex-col rounded-[12px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 —— 无底部分割线 */}
        <div className="flex items-center justify-between px-6 pb-3 pt-6">
          <h2 className="text-[20px] font-medium text-[#11192D]">
            选择需要新增的渠道尺寸
          </h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex size-8 items-center justify-center text-[#7c889c] transition-colors hover:text-[#11192D]"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 分组列表 —— 每组一个灰色胶囊，无描边 */}
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
                  {/* 左：组名 + 尺寸 items */}
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-normal text-[#11192D]">
                      {preset.name}
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
                            {/* 自定义勾选框：未选=#7C889C，选中=#11192D，勾始终白色 */}
                            <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  togglePick(preset.id, size.id)
                                }
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
                  {/* 右：全选文字链接 */}
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

        {/* 底部 —— 无顶部分割线 */}
        <div className="flex items-center justify-between px-6 pb-6 pt-3">
          <span className="text-[14px] text-[#7c889c]">
            当前已选择 {selected.size} 个需要延展的尺寸
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-[8px] bg-[#E9ECF1] px-3 text-[14px] font-medium text-[#11192D] transition-colors hover:bg-[#dde1e8]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="h-8 rounded-[8px] bg-[#11192D] px-3 text-[14px] font-medium text-white transition-colors hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-40"
            >
              确认新增
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
