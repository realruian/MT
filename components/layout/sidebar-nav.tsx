"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { canNavigate } from "@/lib/navigation-guard";

const navItems = [
  { id: "home", src: "/icons/home.svg", label: "首页", href: "/" },
  { id: "generate", src: "/icons/ai.svg", label: "AI 生成" },
  { id: "album", src: "/icons/album.svg", label: "作品集" },
  { id: "admin", src: "/icons/grid.svg", label: "管理后台", href: "/admin" },
] as const;

type NavId = (typeof navItems)[number]["id"];

/** 根据当前路径推导激活项：
 *  /            → home
 *  /editor/...  → generate（AI 生成）
 *  /admin...    → admin
 *  其他         → null（不激活任何项）
 */
function getActiveId(pathname: string | null): NavId | null {
  if (!pathname) return null;
  if (pathname === "/") return "home";
  if (pathname.startsWith("/editor")) return "generate";
  if (pathname.startsWith("/admin")) return "admin";
  return null;
}

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = getActiveId(pathname);

  return (
    <aside
      className="fixed left-[24px] top-1/2 z-10 flex -translate-y-1/2 flex-col items-start gap-6"
      aria-label="主导航"
    >
      {navItems.map((item) => {
        const active = activeId === item.id;
        const cls = [
          "flex size-6 shrink-0 transition-opacity duration-200 ease-out",
          active ? "opacity-100" : "opacity-30 hover:opacity-60",
        ].join(" ");

        if ("href" in item && item.href) {
          const href = item.href;
          return (
            <a
              key={item.id}
              href={href}
              aria-label={item.label}
              className={[cls, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2a2a2a]/30 focus-visible:ring-offset-2 rounded-sm"].join(" ")}
              onClick={async (e) => {
                if (pathname === href) {
                  e.preventDefault();
                  return;
                }
                e.preventDefault();
                const ok = await canNavigate(href);
                if (ok) router.push(href);
              }}
            >
              <Image src={item.src} alt="" width={24} height={24} className="size-6 object-contain" aria-hidden />
            </a>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={active}
            className={[cls, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2a2a2a]/30 focus-visible:ring-offset-2 rounded-sm"].join(" ")}
          >
            <Image src={item.src} alt="" width={24} height={24} className="size-6 object-contain" aria-hidden />
          </button>
        );
      })}
    </aside>
  );
}
