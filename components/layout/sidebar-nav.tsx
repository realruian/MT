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
      className="fixed left-0 top-1/2 z-10 flex w-[64px] -translate-y-1/2 flex-col items-start gap-10 pl-[40px]"
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
            <Link key={item.id} href={item.href} title={item.label} aria-label={item.label} className={cls}>
              <Image src={item.src} alt={item.label} width={24} height={24} className="size-6 object-contain" />
            </Link>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            onClick={() => setActiveId(item.id)}
            className={cls}
          >
            <Image src={item.src} alt={item.label} width={24} height={24} className="size-6 object-contain" />
          </button>
        );
      })}
    </aside>
  );
}
