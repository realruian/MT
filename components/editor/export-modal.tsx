"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, Layers, Loader2, X } from "lucide-react";
import type { Slot } from "./editor-shell";

interface ExportModalProps {
  open: boolean;
  slots: Slot[];
  activeSlot: Slot;
  /** 父组件正在导出（loading 期间禁用按钮 + 选中项显示 spinner）*/
  exporting: boolean;
  onClose: () => void;
  onConfirm: (scope: "all" | "current") => void;
}

export function ExportModal({
  open,
  slots,
  activeSlot,
  exporting,
  onClose,
  onConfirm,
}: ExportModalProps) {
  // 记录用户点了哪一个，方便在导出期间只在那张卡上显示 spinner
  const [clickedScope, setClickedScope] = useState<"all" | "current" | null>(
    null,
  );
  // 弹窗关闭时重置（下次打开默认无选中态）
  useEffect(() => {
    if (!open) setClickedScope(null);
  }, [open]);

  if (!open) return null;

  const pick = (scope: "all" | "current") => {
    if (exporting) return;
    setClickedScope(scope);
    onConfirm(scope);
  };

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => !exporting && onClose()}
    >
      <div
        className="modal-card-enter flex w-[480px] flex-col rounded-[12px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏（跟一键拓展弹窗对齐：text-[20px] font-medium, px-6 pb-3 pt-6, X size-8）*/}
        <div className="flex items-center justify-between px-6 pb-3 pt-6">
          <h2 className="text-[20px] font-medium text-grey-primary">
            选择下载范围
          </h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            disabled={exporting}
            className="flex size-8 items-center justify-center text-grey-tertiary transition-colors hover:text-grey-primary disabled:opacity-30"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 选项区 */}
        <div className="space-y-3 px-6 pb-6">
          <ChoiceCard
            icon={<Layers className="size-5 text-grey-primary" />}
            title="导出全部资源位"
            subtitle={`共 ${slots.length} 张 · PNG 格式`}
            onClick={() => pick("all")}
            loading={exporting && clickedScope === "all"}
            disabled={exporting && clickedScope !== "all"}
          />
          <ChoiceCard
            icon={<ImageIcon className="size-5 text-grey-primary" />}
            title="仅导出当前资源位"
            subtitle={`${activeSlot.name} · PNG 格式`}
            onClick={() => pick("current")}
            loading={exporting && clickedScope === "current"}
            disabled={exporting && clickedScope !== "current"}
          />
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  subtitle,
  onClick,
  loading,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex w-full items-center gap-3 rounded-[10px] border border-grey-border bg-white p-4 text-left transition-colors hover:border-[#11192D] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-grey-border"
    >
      {/* 左侧图标圆角灰底容器 */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-grey-100">
        {icon}
      </div>
      {/* 中间文案 */}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-grey-primary">{title}</div>
        <div className="mt-1 text-[14px] text-grey-secondary">{subtitle}</div>
      </div>
      {/* 右侧 spinner（仅本卡片正在导出时显示）*/}
      {loading && (
        <Loader2 className="size-4 shrink-0 animate-spin text-grey-tertiary" />
      )}
    </button>
  );
}
