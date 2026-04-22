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
    setSelected(new Set()); // 清空供下次打开
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[640px] flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-[#eee] px-6 py-4">
          <h2 className="text-base font-medium text-[#11192D]">选择需要新增的渠道尺寸</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="text-[#999] hover:text-[#11192D]"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 分组列表 */}
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {SLOT_PRESETS.map((preset) => {
            const keys = preset.sizes.map((s) => keyOf(preset.id, s.id));
            const allSelected = keys.every((k) => selected.has(k));
            return (
              <div
                key={preset.id}
                className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-[#11192D]">{preset.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleAllInGroup(preset)}
                    className="text-xs text-[#666] hover:text-[#11192D]"
                  >
                    {allSelected ? "取消全选" : "全选"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {preset.sizes.map((size) => {
                    const k = keyOf(preset.id, size.id);
                    const checked = selected.has(k);
                    return (
                      <label
                        key={size.id}
                        className={[
                          "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition",
                          checked
                            ? "border-[#11192D] bg-white text-[#11192D]"
                            : "border-[#e5e5e5] bg-white text-[#666] hover:border-[#ccc]",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePick(preset.id, size.id)}
                          className="size-3.5"
                        />
                        {size.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between border-t border-[#eee] px-6 py-3">
          <span className="text-xs text-[#666]">
            当前已选择 {selected.size} 个需要延展的尺寸
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-[#e5e5e5] px-4 text-sm text-[#11192D] hover:bg-[#f5f5f5]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="h-9 rounded-lg bg-[#11192D] px-4 text-sm text-white hover:bg-[#000] disabled:opacity-40"
            >
              确认新增
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
