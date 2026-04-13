import { notFound } from "next/navigation";
import { getTemplateById } from "@/lib/templates-db";
import { EditorPageClient } from "@/components/editor/editor-page-client";
import { PsdEditor } from "@/components/editor/psd-editor";

export const revalidate = 300; // 模板元数据 5 分钟内复用缓存

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await getTemplateById(id);
  if (!template) notFound();

  if (template.templateType === "psd") {
    return <PsdEditor template={template} />;
  }

  return <EditorPageClient template={template} />;
}
