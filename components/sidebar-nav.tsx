"use client";

import Image from "next/image";
import { useState } from "react";

const navItems = [
  { id: "home", src: "/icons/home.svg", label: "首页" },
  { id: "generate", src: "/icons/ai.svg", label: "AI 生成" },
  { id: "album", src: "/icons/album.svg", label: "作品集" },
  { id: "features", src: "/icons/grid.svg", label: "功能" },
] as const;

export function SidebarNav() {
  const [activeId, setActiveId] = useState<string>("home");

  return (
    <aside
      className="sticky top-0 flex h-screen w-[64px] shrink-0 flex-col items-start justify-center gap-10 py-6 pl-[40px]"
      aria-label="主导航"
    >
      {navItems.map(({ id, src, label }) => {
        const active = activeId === id;
        return (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => setActiveId(id)}
            className={[
              "flex size-6 shrink-0 transition-opacity duration-200 ease-out",
              active ? "opacity-100" : "opacity-30 hover:opacity-60",
            ].join(" ")}
          >
            <Image
              src={src}
              alt={label}
              width={24}
              height={24}
              className="size-6 object-contain"
            />
          </button>
        );
      })}
    </aside>
  );
}
