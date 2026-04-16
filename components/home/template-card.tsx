import Link from "next/link";
import type { Template } from "@/types/template";

export function TemplateCard({ template }: { template: Template }) {
  return (
    <div className="break-inside-avoid">
      <div className="group relative block w-full break-inside-avoid overflow-hidden rounded-[8px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={template.thumbnail}
          alt={template.name}
          width={template.width}
          height={template.height}
          loading="lazy"
          decoding="async"
          className="w-full"
        />
        {/* Hover 态底部信息条 —— 62px 高，黑色 40% 透明蒙版 */}
        <div className="absolute inset-x-0 bottom-0 flex h-[62px] flex-col items-stretch justify-between bg-black/40 backdrop-blur-[10px] px-2 py-2 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
          <span className="text-center text-[10px] leading-none text-white">
            {template.name}
          </span>
          <Link
            href={`/editor/${template.id}`}
            className="flex h-[28px] w-full items-center justify-center rounded-[6px] bg-[#ff6813] text-[12px] font-medium text-white transition-colors duration-150 hover:bg-[#e85d0f]"
          >
            在线编辑
          </Link>
        </div>
      </div>
    </div>
  );
}
