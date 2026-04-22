"use client";

export const sceneTabs = [
  { id: "full-campaign", label: "全套活动" },
  { id: "hall-banner", label: "会场头图" },
  { id: "hall-blocks", label: "会场组件" },
  { id: "insite-slot", label: "站内资源位" },
  { id: "offsite-slot", label: "站外资源位" },
  { id: "edit-material", label: "素材修改" },
  { id: "image-processing", label: "图像处理" },
  { id: "batch-processing", label: "批量处理" },
] as const;

export type SceneTabId = (typeof sceneTabs)[number]["id"];

interface SceneTabBarProps {
  activeScene: SceneTabId;
  onSceneChange: (id: SceneTabId) => void;
}

export function SceneTabBar({ activeScene, onSceneChange }: SceneTabBarProps) {
  return (
    <div
      role="tablist"
      aria-label="选择场景分类"
      className="flex items-center gap-8"
    >
      {sceneTabs.map((tab) => {
        const active = tab.id === activeScene;
        const cls = [
          "relative shrink-0 pb-2 text-[16px] leading-none transition-colors duration-150 ease-out focus-visible:outline-none",
          active
            ? "font-medium text-[#11192d]"
            : "font-normal text-[#11192d]/60 hover:text-[#11192d]",
        ].join(" ");
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => onSceneChange(tab.id)}
            className={cls}
          >
            {tab.label}
            {active && (
              <span className="absolute bottom-0 left-1/2 h-[2px] w-[32px] -translate-x-1/2 bg-[#11192d]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
