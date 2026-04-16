import { HomeShell } from "@/components/home/home-shell";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { TopBar } from "@/components/layout/top-bar";
import { getAllTemplates } from "@/lib/templates-db";

export const revalidate = 60;

export default async function Home() {
  const baseTemplates = await getAllTemplates();

  // DEV ONLY: 克隆 10 份用于验证瀑布流布局，生产环境直接用原始数据
  const templates =
    process.env.NODE_ENV === "development"
      ? Array.from({ length: 10 }, (_, i) =>
          baseTemplates.map((t) => ({ ...t, id: `${t.id}-mock-${i}` })),
        ).flat()
      : baseTemplates;

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
      <div className="relative z-[3] pt-[60px]">
        <HomeShell templates={templates} />
      </div>
    </div>
  );
}
