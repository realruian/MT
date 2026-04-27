"use client";

import { X } from "lucide-react";
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

/**
 * 二次确认弹窗：左对齐标题 + 右上 X + 左对齐正文 + 右下两按钮，跟一键拓展弹窗
 * 同款语言。`tone="danger"` 用深红填充按钮（删除态），`tone="primary"`（默认）
 * 用主色填充按钮。
 *
 * 字号规范（4-base，14 作为正文锚点）：
 *   - 标题 16px / Medium
 *   - 正文 14px / Regular
 *   - 按钮 14px / Medium
 */
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
      className="modal-backdrop-enter fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onCancel()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div
        className="modal-card-enter flex w-[min(420px,92vw)] flex-col rounded-[12px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏：左对齐标题 + 右上 X */}
        <div className="flex items-center justify-between px-6 pb-3 pt-6">
          <h3
            id="confirm-dialog-title"
            className="text-[16px] font-medium text-grey-primary"
          >
            {title}
          </h3>
          <button
            type="button"
            aria-label="关闭"
            onClick={onCancel}
            disabled={busy}
            className="flex size-8 items-center justify-center text-grey-tertiary transition-colors hover:text-grey-primary disabled:opacity-30"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 正文（左对齐） */}
        {description && (
          <div className="px-6">
            <p
              id="confirm-dialog-desc"
              className="text-[14px] leading-[1.5] text-grey-secondary"
            >
              {description}
            </p>
          </div>
        )}

        {/* 底部按钮：右下，取消（浅灰底）+ 确认（深色填充 / danger 用深红） */}
        <div className="flex justify-end gap-2 px-6 pb-6 pt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-8 rounded-[8px] bg-[#F7F8FA] px-3 text-[14px] font-medium text-[#7C889C] transition-colors hover:bg-grey-100 disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={[
              "h-8 rounded-[8px] px-3 text-[14px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              tone === "danger"
                ? "bg-[#E5322D] hover:bg-[#C72A26]"
                : "bg-[#11192D] hover:bg-black",
            ].join(" ")}
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
