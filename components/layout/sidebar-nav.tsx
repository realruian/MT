"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const navItems = [
  { id: "home", src: "/icons/home.svg", label: "首页" },
  { id: "generate", src: "/icons/ai.svg", label: "AI 生成" },
  { id: "album", src: "/icons/album.svg", label: "作品集" },
  { id: "admin", src: "/icons/grid.svg", label: "管理后台", href: "/admin" },
] as const;

export function SidebarNav() {
  const [activeId, setActiveId] = useState<string>("home");

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
          return (
            <Link key={item.id} href={item.href} aria-label={item.label} className={[cls, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2a2a2a]/30 focus-visible:ring-offset-2 rounded-sm"].join(" ")}>
              <Image src={item.src} alt="" width={24} height={24} className="size-6 object-contain" aria-hidden />
            </Link>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={active}
            onClick={() => setActiveId(item.id)}
            className={[cls, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2a2a2a]/30 focus-visible:ring-offset-2 rounded-sm"].join(" ")}
          >
            <Image src={item.src} alt="" width={24} height={24} className="size-6 object-contain" aria-hidden />
          </button>
        );
      })}
    </aside>
  );
}
