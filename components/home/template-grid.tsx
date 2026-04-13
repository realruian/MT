import Link from "next/link";
import type { Template } from "@/types/template";

export function TemplateGrid({ templates }: { templates: Template[] }) {
  if (templates.length === 0) {
    return (
      <section className="mx-auto w-full max-w-content px-[120px]" aria-label="模板库">
        <p className="py-20 text-center text-sm text-gray-400">暂无模板</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-content px-[120px]" aria-label="模板库">
      <div className="columns-4 gap-6 space-y-6">
        {templates.map((tpl) => (
          <Link key={tpl.id} href={`/editor/${tpl.id}`} className="block break-inside-avoid">
            <div className="group relative block w-full break-inside-avoid overflow-hidden rounded-[8px] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(6,182,212,0.3)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tpl.thumbnail}
                alt={tpl.name}
                width={tpl.width}
                height={tpl.height}
                loading="lazy"
                decoding="async"
                className="w-full transition-transform duration-300 ease-out group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 flex items-end justify-center pb-4 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
                <span className="relative rounded-full bg-white/90 px-5 py-2 text-[12px] font-medium text-[#2a2a2a] shadow-[0_2px_12px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                  立即使用
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
