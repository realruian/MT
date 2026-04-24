"use client";

import type { ReactNode } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确定",
  cancelText = "取消",
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[60] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[2px]"
      onClick={() => !busy && onCancel()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div
        className="modal-card-enter w-[min(320px,92vw)] overflow-hidden rounded-[14px] bg-white/95 shadow-[0_20px_48px_-12px_rgba(17,25,45,0.25)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 内容区：居中标题 + 居中正文 */}
        <div className="px-5 pb-4 pt-5 text-center">
          <h3
            id="confirm-dialog-title"
            className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-[#11192D]"
          >
            {title}
          </h3>
          {description && (
            <p
              id="confirm-dialog-desc"
              className="mt-2 text-[13px] leading-[1.45] text-[#5B6475]"
            >
              {description}
            </p>
          )}
        </div>

        {/* 底部按钮区：两列等宽，细线分隔（Apple 风） */}
        <div className="grid grid-cols-2 border-t border-[#E5E7EB]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-11 text-[15px] font-normal text-[#11192D] transition-colors hover:bg-[#F5F6F8] disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={[
              "h-11 border-l border-[#E5E7EB] text-[15px] font-semibold transition-colors disabled:opacity-40",
              tone === "danger"
                ? "text-[#E5322D] hover:bg-[#FEF2F2]"
                : "text-[#0A84FF] hover:bg-[#F0F8FF]",
            ].join(" ")}
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
