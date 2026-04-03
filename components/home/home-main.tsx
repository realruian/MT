"use client";

import { useState } from "react";
import { CreationPanel, type SceneTabId } from "./creation-panel";
import { TemplateGrid } from "./template-grid";

export function HomeMain() {
  const [activeScene, setActiveScene] = useState<SceneTabId>("all");

  return (
    <main className="flex min-h-screen flex-1 flex-col overflow-y-auto bg-transparent">
      {/* 主内容 */}
      <div className="animate-studio-enter mx-auto flex w-full max-w-content flex-col gap-9 pb-12 pt-[88px]">
        <CreationPanel
          activeScene={activeScene}
          onSceneChange={setActiveScene}
        />
        <TemplateGrid />
      </div>
    </main>
  );
}
