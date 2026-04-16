"use client";

import { useMemo, useState } from "react";
import { HeroHeader, SceneTabBar, CreationPanel, type SceneTabId } from "./creation-panel";
import { FeatureCards } from "./feature-cards";
import { TemplateGrid } from "./template-grid";
import type { Template } from "@/types/template";

const SCENE_TO_CATEGORY: Record<string, string> = {
  "hall-banner": "会场头图",
  "hall-blocks": "会场组件",
  "insite-slot": "站内资源位",
  "offsite-slot": "站外资源位",
  "consumer": "C 端外素材",
};

export function HomeMain({ templates }: { templates: Template[] }) {
  const [activeScene, setActiveScene] = useState<SceneTabId>("all");

  const filtered = useMemo(() => {
    if (activeScene === "all") return templates;
    const category = SCENE_TO_CATEGORY[activeScene];
    if (!category) return templates;
    return templates.filter((t) => t.category === category);
  }, [templates, activeScene]);

  return (
    <main className="flex min-h-screen flex-1 flex-col overflow-y-auto bg-transparent">
      <div className="animate-studio-enter flex w-full flex-col pb-12">
        {/* ① Hero 标题区 — 顶部 60px 遮罩 + 60px 间距 = 120px */}
        <div className="pt-[120px]">
          <HeroHeader />
        </div>

        {/* ② 场景 Tab 栏 — 副标题下方 64px */}
        <div className="pt-16">
          <SceneTabBar
            activeScene={activeScene}
            onSceneChange={setActiveScene}
          />
        </div>

        {/* ③ 创作面板 — 紧贴 Tab 下方 */}
        <div className="pt-0">
          <CreationPanel activeScene={activeScene} />
        </div>

        {/* ④ AI 图像处理卡片 — 面板下方 24px */}
        <div className="pt-6">
          <FeatureCards />
        </div>

        {/* ⑤⑥ 全部模板 + 网格 — 卡片下方 24px */}
        <div className="pt-6">
          <TemplateGrid templates={filtered} />
        </div>
      </div>
    </main>
  );
}
