"use client";

import { Download, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { canNavigate } from "@/lib/navigation-guard";

interface EditorTopbarProps {
  activity?: string;
  isVenueMode: boolean;
  onExtend: () => void;
  onDownload: () => void;
  exporting?: boolean;
}

export function EditorTopbar({
  activity,
  isVenueMode,
  onExtend,
  onDownload,
  exporting = false,
}: EditorTopbarProps) {
  const router = useRouter();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#7C889C]/10 px-5">
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-[16px] text-grey-secondary">
        <span>全套延展</span>
        <span className="text-[#aaa]">·</span>
        <span className="text-grey-primary">{activity || "未命名活动"}</span>
      </div>

      {/* 右侧操作 */}
      <div className="flex items-center gap-2">
        {isVenueMode && (
          <button
            type="button"
            onClick={onExtend}
            className="h-8 rounded-lg bg-grey-100 px-3 text-[16px] font-medium text-grey-primary transition-colors hover:bg-grey-200"
          >
            一键拓展
          </button>
        )}
        <button
          type="button"
          onClick={onDownload}
          disabled={exporting}
          className="flex h-8 items-center gap-0.5 rounded-lg bg-[#11192D] pl-2 pr-3 text-[16px] font-medium text-white transition-colors hover:bg-[#000] disabled:cursor-not-allowed disabled:opacity-60"
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
          onClick={async () => {
            const ok = await canNavigate("/");
            if (ok) router.push("/");
          }}
          className="ml-3 flex size-8 items-center justify-center rounded-lg text-grey-secondary transition-colors hover:bg-grey-50 hover:text-grey-primary"
        >
          <X className="size-5" />
        </button>
      </div>
    </header>
  );
}
