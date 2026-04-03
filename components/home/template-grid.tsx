import Link from "next/link";
import { templates } from "@/lib/templates";

const templateImages = [
  "/images/1.jpg", // → header 模板
  "/images/2.png",
  "/images/3.png",
  "/images/4.jpg",
  "/images/5.png",
  "/images/6.png",
  "/images/7.png",
  "/images/8.jpg",
  "/images/9.png",
  "/images/10.jpg",
  "/images/11.png",
  "/images/12.png",
  "/images/13.png",
  "/images/14.png",
  "/images/1b860b5ce0292d748bbde6e9133a701b236062.jpg",
  "/images/7ab1bbda2faae0eb5fdf546ccae0f961236923.jpg",
  "/images/8925eacd0560c12ffdeccd5e87954729274902.jpg",
  "/images/a6d0965cca98ea0de37aa4edccee55ec276721.jpg",
  "/images/ad8732bcf2dd6db7e02a0597fa31a390998810.png",
  "/images/e6fda5e285ec1b435e3a4eba170a59f5262669.jpg",
  "/images/f61c60666ed7e17dffc4709d132f2203285213.jpg",
];

export function TemplateGrid() {
  return (
    <section
      className="mx-auto w-full max-w-content px-[120px]"
      aria-label="模板库"
    >
      {/* 模板瀑布流 */}
      <div className="columns-4 gap-6 space-y-6">
        {templateImages.map((src, i) => {
          // 按顺序对应：第 i 张图片对应第 i 个模板（若存在）
          const tpl = templates[i];
          const card = (
            <div
              className="group relative block w-full break-inside-avoid overflow-hidden rounded-[8px] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(6,182,212,0.3)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={tpl?.name ?? `模板 ${i + 1}`}
                className="w-full transition-transform duration-300 ease-out group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 flex items-end justify-center pb-4 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
                <span className="relative rounded-full bg-white/90 px-5 py-2 text-[12px] font-medium text-[#2a2a2a] shadow-[0_2px_12px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                  立即使用
                </span>
              </div>
            </div>
          );
          return tpl ? (
            <Link key={i} href={`/editor/${tpl.id}`} className="block break-inside-avoid">
              {card}
            </Link>
          ) : (
            <button key={i} type="button" aria-label={`模板 ${i + 1}`} className="block break-inside-avoid">
              {card}
            </button>
          );
        })}
      </div>
    </section>
  );
}
