"use client";

import { useState } from "react";
import { CreationPanel, type SceneTabId } from "./creation-panel";
import { TemplateGrid } from "./template-grid";
import type { Template } from "@/types/template";

export function HomeMain({ templates }: { templates: Template[] }) {
  const [activeScene, setActiveScene] = useState<SceneTabId>("all");

  return (
    <main className="flex min-h-screen flex-1 flex-col overflow-y-auto bg-transparent">
      <div className="animate-studio-enter mx-auto flex w-full max-w-content flex-col gap-9 pb-12 pt-[88px]">
        <CreationPanel
          activeScene={activeScene}
          onSceneChange={setActiveScene}
        />
        <TemplateGrid templates={templates} />
      </div>
    </main>
  );
}
