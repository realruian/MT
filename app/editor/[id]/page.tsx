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
  // 这层 wrapper 继续在四周留出 16px 间距，让卡片四周透出外壳背景。
  // 卡片高度：100vh - 60px(TopBar) - 16px(top) - 16px(bottom) = calc(100vh - 92px)
  if (template.templateType === "psd") {
    return (
      <AppShell>
        <div className="flex h-[calc(100vh-60px)] pl-[72px] pr-4 pt-4 pb-4">
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
