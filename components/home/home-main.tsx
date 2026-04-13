"use client";

import { useMemo, useState } from "react";
import { CreationPanel, type SceneTabId } from "./creation-panel";
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
      <div className="animate-studio-enter mx-auto flex w-full max-w-content flex-col gap-5 pb-12 pt-[88px]">
        <CreationPanel
          activeScene={activeScene}
          onSceneChange={setActiveScene}
        />
        <TemplateGrid templates={filtered} />
      </div>
    </main>
  );
}
