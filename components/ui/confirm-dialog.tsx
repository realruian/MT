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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="flex w-[min(420px,92vw)] flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3
            id="confirm-dialog-title"
            className="text-sm font-semibold text-gray-900"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={() => !busy && onCancel()}
            aria-label="关闭"
            className="flex size-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            disabled={busy}
          >
            <X className="size-3.5" />
          </button>
        </div>
        {description && (
          <div className="px-5 py-4 text-sm text-gray-600">{description}</div>
        )}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={[
              "rounded-lg px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50",
              tone === "danger"
                ? "bg-red-500 hover:bg-red-600"
                : "bg-gray-900 hover:bg-gray-800",
            ].join(" ")}
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
