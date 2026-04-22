"use client";

import { Download, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface EditorTopbarProps {
  activity?: string;
  onExtend: () => void;
  onDownload: () => void;
  exporting?: boolean;
}

export function EditorTopbar({
  activity,
  onExtend,
  onDownload,
  exporting = false,
}: EditorTopbarProps) {
  const router = useRouter();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#eee] px-6">
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-sm text-[#666]">
        <span>全套延展</span>
        <span className="text-[#aaa]">·</span>
        <span className="text-[#111]">{activity || "未命名活动"}</span>
      </div>

      {/* 右侧操作 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExtend}
          className="h-9 rounded-lg border border-[#e5e5e5] bg-white px-4 text-sm text-[#111] transition-colors hover:bg-[#f5f5f5]"
        >
          一键拓展
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={exporting}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-[#111] px-4 text-sm text-white transition-colors hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {exporting ? "导出中…" : "下载"}
        </button>
        <button
          type="button"
          aria-label="关闭编辑器"
          onClick={() => router.push("/")}
          className="flex size-9 items-center justify-center rounded-lg text-[#666] transition-colors hover:bg-[#f5f5f5] hover:text-[#111]"
        >
          <X className="size-5" />
        </button>
      </div>
    </header>
  );
}
