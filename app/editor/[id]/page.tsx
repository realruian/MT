import { notFound } from "next/navigation";
import { getTemplateById, templates } from "@/lib/templates";
import { EditorPageClient } from "@/components/editor/editor-page-client";

export function generateStaticParams() {
  return templates.map((t) => ({ id: t.id }));
}

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = getTemplateById(id);
  if (!template) notFound();

  return <EditorPageClient template={template} />;
}
