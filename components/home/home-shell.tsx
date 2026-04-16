"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Template } from "@/types/template";
import { SceneTabBar, type SceneTabId } from "./scene-tab-bar";
import { HeroHeader } from "./hero-header";
import { HomeMain } from "./home-main";

const SCENE_TO_CATEGORY: Record<string, string> = {
  "hall-banner": "会场头图",
  "hall-blocks": "会场组件",
  "insite-slot": "站内资源位",
  "offsite-slot": "站外资源位",
  "consumer": "C 端外素材",
};

export function HomeShell({ templates }: { templates: Template[] }) {
  const [activeScene, setActiveScene] = useState<SceneTabId>("all");

  const filtered = useMemo(() => {
    if (activeScene === "all") return templates;
    const category = SCENE_TO_CATEGORY[activeScene];
    if (!category) return templates;
    return templates.filter((t) => t.category === category);
  }, [templates, activeScene]);

  return (
    <div className="w-full">
      {/* Hero 标题区 — max-w 居中 */}
      <div className="mx-auto w-full max-w-[1300px] pl-[100px] pr-[40px] pt-[60px]">
        <HeroHeader />
      </div>

      {/* 吸顶场景 Tab 栏 — 全宽粘性条，内部 max-w 居中 */}
      <StickySceneTabBar
        activeScene={activeScene}
        onSceneChange={setActiveScene}
      />

      {/* 主内容 — max-w 居中 */}
      <div className="mx-auto w-full max-w-[1300px] pl-[100px] pr-[40px]">
        <HomeMain activeScene={activeScene} templates={filtered} />
      </div>
    </div>
  );
}

/** 吸顶场景 Tab 栏 —— max-w 容器外的全宽粘性条 */
function StickySceneTabBar({
  activeScene,
  onSceneChange,
}: {
  activeScene: SceneTabId;
  onSceneChange: (id: SceneTabId) => void;
}) {
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    const check = () => {
      const el = sentinelRef.current;
      if (el) {
        setStuck(el.getBoundingClientRect().top < 0);
      }
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const outerCls = [
    "sticky top-0 z-40 w-full border-b transition-[background-color,border-color]",
    stuck
      ? "border-black/[0.08] bg-white/80 backdrop-blur-md duration-150"
      : "border-transparent bg-transparent duration-0",
  ].join(" ");
  const innerCls = "mx-auto w-full max-w-[1300px] pl-[100px] pr-[40px] pt-6 pb-0";

  return (
    <>
      {/* 非吸顶状态下 Hero 与 Tab 栏之间的呼吸空间，独立于 sticky 自身 */}
      <div aria-hidden className="h-16 w-full" />
      {/* 哨兵：紧贴 sticky 上方，用于检测粘性激活时机 */}
      <div ref={sentinelRef} aria-hidden className="h-0 w-full" />
      <div className={outerCls}>
        <div className={innerCls}>
          <SceneTabBar activeScene={activeScene} onSceneChange={onSceneChange} />
        </div>
      </div>
    </>
  );
}
