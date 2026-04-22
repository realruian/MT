import type { ReactNode } from "react";
import { SidebarNav } from "./sidebar-nav";
import { TopBar } from "./top-bar";

interface AppShellProps {
  children: ReactNode;
  /** 追加到内容层的 className，用于按页调整内边距等（默认仅 pt-[60px] 让开 TopBar） */
  contentClassName?: string;
}

/**
 * 全站通用外壳：渐变底色 + 视频背景 + 顶部 TopBar + 左侧 SidebarNav。
 * 内容层位于 z-[3]，默认 pt-[60px] 让开 TopBar 高度；
 * 页面可通过 contentClassName 追加自己的内边距 / 高度约束。
 */
export function AppShell({ children, contentClassName }: AppShellProps) {
  return (
    <div
      className="hero-section flex min-h-screen flex-col font-sans"
      style={
        {
          "--bg-color": "#f0f4ff",
        } as React.CSSProperties
      }
    >
      {/* 基础渐变背景 z-0 */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(135deg,#fdf2f8_0%,#f0f9ff_50%,#faf5ff_100%)]" />

      {/* 背景视频 z-1 */}
      <video
        className="fixed inset-0 z-[1] h-screen w-screen object-cover"
        style={{ pointerEvents: "none" }}
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        src="/high.mp4"
      />

      {/* 顶部导航栏 — fixed，始终钉在视口顶部 */}
      <TopBar />

      {/* 固定侧边栏 */}
      <SidebarNav />

      {/* 内容层 z-3 */}
      <div
        className={
          contentClassName
            ? `relative z-[3] pt-[60px] ${contentClassName}`
            : "relative z-[3] pt-[60px]"
        }
      >
        {children}
      </div>
    </div>
  );
}
