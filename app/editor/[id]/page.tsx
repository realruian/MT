import { notFound } from "next/navigation";
import { getTemplateById } from "@/lib/templates-db";
import { EditorPageClient } from "@/components/editor/editor-page-client";
import { EditorShell } from "@/components/editor/editor-shell";
import { AppShell } from "@/components/layout/app-shell";

export const revalidate = 300; // 模板元数据 5 分钟内复用缓存

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ activity?: string }>;
}) {
  const { id } = await params;
  const { activity } = await searchParams;
  const template = await getTemplateById(id);
  if (!template) notFound();

  // AppShell 贡献 pt-[60px] 让开 TopBar。
  // 卡片四周间距对齐 Figma：上 20 / 右 40 / 下 40 / 左 72（左侧特意留 72 给 SidebarNav）
  // 卡片高度：100vh - 60px(TopBar) - 20px(top) - 40px(bottom) = calc(100vh - 120px)
  if (template.templateType === "psd") {
    return (
      <AppShell>
        <div className="flex h-[calc(100vh-60px)] pl-[72px] pr-10 pt-5 pb-10">
          <EditorShell template={template} activity={activity} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <EditorPageClient template={template} />
    </AppShell>
  );
}
