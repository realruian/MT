import { notFound } from "next/navigation";
import { getTemplateById } from "@/lib/templates-db";
import { EditorPageClient } from "@/components/editor/editor-page-client";

export const dynamic = "force-dynamic";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await getTemplateById(id);
  if (!template) notFound();

  return <EditorPageClient template={template} />;
}
