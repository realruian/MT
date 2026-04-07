import { HomeMain } from "@/components/home/home-main";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { getAllTemplates } from "@/lib/templates-db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const templates = await getAllTemplates();
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
      <div className="absolute inset-0 z-0 bg-[linear-gradient(135deg,#fdf2f8_0%,#f0f9ff_50%,#faf5ff_100%)]" />

      {/* 背景视频 z-1 */}
      <video
        className="absolute inset-0 z-[1] h-full w-full object-fill"
        style={{ pointerEvents: "none" }}
        autoPlay
        muted
        loop
        playsInline
        src="/high.mp4"
      />

      {/* 内容层 z-3，高于 ::after(z-2) 和 video(z-1) */}
      <div className="relative z-[3] flex min-h-screen flex-col">
        {/* 品牌名 — 与侧边栏 icon 左对齐 */}
        <div className="shrink-0 pl-[40px] pt-6">
          <span className="select-none text-[8px] font-medium text-[#2a2a2a] uppercase">
            AI Creative
          </span>
        </div>
        {/* 固定侧边栏 */}
        <SidebarNav />
        {/* 主内容（左侧留出侧边栏宽度） */}
        <div className="flex flex-1 pl-[64px]">
          <HomeMain templates={templates} />
        </div>
      </div>
    </div>
  );
}
