"use client";

import type { Template } from "@/types/template";
import type { SceneTabId } from "./scene-tab-bar";
import { CreationPanel } from "./creation-panel";
import { TemplateGrid } from "./template-grid";

interface HomeMainProps {
  activeScene: SceneTabId;
  templates: Template[];
}

export function HomeMain({ activeScene, templates }: HomeMainProps) {
  return (
    <main className="flex flex-1 flex-col bg-transparent">
      <div className="flex w-full flex-col gap-6 pb-12">
        <CreationPanel activeScene={activeScene} />
        <TemplateGrid templates={templates} />
      </div>
    </main>
  );
}
