"use client";

import { X } from "lucide-react";
import type { Slot } from "./editor-shell";

interface ExportModalProps {
  open: boolean;
  slots: Slot[];
  activeSlot: Slot;
  onClose: () => void;
  onConfirm: (scope: "all" | "current") => void;
}

export function ExportModal({
  open,
  slots,
  activeSlot,
  onClose,
  onConfirm,
}: ExportModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex w-[420px] flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#7C889C]/10 px-6 py-4">
          <h2 className="text-base font-medium text-[#11192D]">选择下载范围</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="text-[#999] hover:text-[#11192D]"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-3 p-6">
          <button
            type="button"
            onClick={() => onConfirm("all")}
            className="w-full rounded-lg border border-[#e5e5e5] bg-white p-4 text-left transition-colors hover:border-[#11192D]"
          >
            <div className="text-sm font-medium text-[#11192D]">导出全部资源位</div>
            <div className="mt-1 text-xs text-[#666]">共 {slots.length} 张</div>
          </button>
          <button
            type="button"
            onClick={() => onConfirm("current")}
            className="w-full rounded-lg border border-[#e5e5e5] bg-white p-4 text-left transition-colors hover:border-[#11192D]"
          >
            <div className="text-sm font-medium text-[#11192D]">仅导出当前资源位</div>
            <div className="mt-1 text-xs text-[#666]">{activeSlot.name}</div>
          </button>
        </div>
      </div>
    </div>
  );
}
