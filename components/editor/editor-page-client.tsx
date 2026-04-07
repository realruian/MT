"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Template } from "@/types/template";
import { buildTemplateUrl } from "@/lib/template-html";
import { TemplatePreview } from "./template-preview";
import { EditPanel } from "./edit-panel";

export function EditorPageClient({ template }: { template: Template }) {
  const { editableFields } = template;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of editableFields.texts) init[f.key] = f.defaultValue;
    return init;
  });

  const [colorIndex, setColorIndex] = useState(0);

  const [images, setImages] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of editableFields.images) init[f.key] = f.defaultSrc;
    return init;
  });

  const [textColors, setTextColors] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of editableFields.texts) init[f.key] = f.defaultColor ?? "#000000";
    return init;
  });

  const [exporting, setExporting] = useState(false);

  const colorTheme = editableFields.colors[colorIndex]?.values ?? {};

  const previewSrc = useMemo(
    () => buildTemplateUrl(template, texts, colorTheme, images, textColors),
    [template, texts, colorTheme, images, textColors],
  );

  const handleTextChange = useCallback((key: string, value: string) => {
    setTexts((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleImageChange = useCallback((key: string, src: string) => {
    setImages((prev) => ({ ...prev, [key]: src }));
  }, []);

  const handleTextColorChange = useCallback((key: string, color: string) => {
    setTextColors((prev) => ({ ...prev, [key]: color }));
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const exportImages: Record<string, string> = {};
      await Promise.all(
        Object.entries(images).map(async ([key, src]) => {
          if (src.startsWith("blob:")) {
            const resp = await fetch(src);
            const blob = await resp.blob();
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            exportImages[key] = dataUrl;
          } else {
            exportImages[key] = src;
          }
        }),
      );

      const exportParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(texts)) { if (v) exportParams[k] = v; }
      for (const [k, v] of Object.entries(exportImages)) { if (v) exportParams[k] = v; }
      for (const [k, v] of Object.entries(textColors)) { if (v) exportParams[`${k}Color`] = v; }
      for (const [k, v] of Object.entries(colorTheme)) {
        if (k !== "primary" && v) exportParams[k] = v;
      }

      const payload = {
        url: template.htmlFile,
        params: exportParams,
        width: template.width,
        height: template.height,
      };

      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.name}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  }, [template, texts, colorTheme, images, textColors]);

  const colorManagedKeys = new Set(
    editableFields.colors.flatMap((c) => Object.keys(c.values)),
  );

  const imageFieldsWithSrc = editableFields.images
    .filter((f) => !colorManagedKeys.has(f.key))
    .map((f) => ({
      ...f,
      src: images[f.key] ?? f.defaultSrc,
    }));

  return (
    <div className="h-screen bg-white">
      {/* 顶部导航栏 — fixed，纯白 */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-100 bg-white px-5">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-cyan-500"
        >
          <ArrowLeft className="size-4" />
          返回首页
        </Link>
        <div className="mx-1 h-4 w-px bg-gray-200" />
        <span className="text-sm font-medium text-gray-900">
          {template.name}
        </span>
        <span className="rounded-tag bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
          {template.category}
        </span>
      </header>

      {/* 预览区 — fixed，占满顶栏以下、编辑面板以左的空间 */}
      <div className="fixed bottom-0 left-0 right-[320px] top-14">
        <TemplatePreview
          ref={iframeRef}
          src={previewSrc}
          templateBaseUrl={template.htmlFile}
          width={template.width}
          height={template.height}
        />
      </div>

      {/* 编辑面板 — fixed 右侧 */}
      <EditPanel
        texts={texts}
        onTextChange={handleTextChange}
        textColors={textColors}
        onTextColorChange={handleTextColorChange}
        textFields={editableFields.texts}
        colorThemes={editableFields.colors}
        activeColorIndex={colorIndex}
        onColorChange={setColorIndex}
        imageFields={imageFieldsWithSrc}
        onImageChange={handleImageChange}
        onExport={handleExport}
        exporting={exporting}
      />
    </div>
  );
}
