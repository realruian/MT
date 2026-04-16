import { HomeMain } from "@/components/home/home-main";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { getAllTemplates } from "@/lib/templates-db";

export const revalidate = 60;

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
        preload="none"
        src="/high.mp4"
      />

      {/* 顶部遮罩 z-2.5 */}
      <div className="absolute left-0 top-0 z-[2] h-[60px] w-full bg-black/[0.06] mix-blend-multiply" />

      {/* 内容层 z-3 */}
      <div className="relative z-[3] flex min-h-screen flex-col">
        {/* 右上角用户徽章 */}
        <div className="absolute right-6 top-4 z-10 flex items-center gap-2">
          <div className="size-[30px] overflow-hidden rounded-full bg-gray-300" />
          <span className="text-[12px] text-white">业务</span>
        </div>

        {/* 固定侧边栏 */}
        <SidebarNav />

        {/* 主内容 */}
        <div className="flex flex-1 pl-[100px] pr-[40px]">
          <HomeMain templates={templates} />
        </div>
      </div>
    </div>
  );
}
