"use client";

import { useRef } from "react";
import { Download, Loader2, Upload } from "lucide-react";

interface EditPanelProps {
  texts: Record<string, string>;
  onTextChange: (key: string, value: string) => void;
  textFields: { key: string; label: string }[];
  colorThemes: { name: string; values: Record<string, string> }[];
  activeColorIndex: number;
  onColorChange: (index: number) => void;
  imageFields: { key: string; label: string; src: string }[];
  onImageChange: (key: string, src: string) => void;
  onExport: () => void;
  exporting: boolean;
}

export function EditPanel({
  texts,
  onTextChange,
  textFields,
  colorThemes,
  activeColorIndex,
  onColorChange,
  imageFields,
  onImageChange,
  onExport,
  exporting,
}: EditPanelProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function handleImageUpload(key: string, file: File) {
    const url = URL.createObjectURL(file);
    onImageChange(key, url);
  }

  return (
    <aside className="fixed bottom-0 right-0 top-14 z-10 flex w-80 flex-col border-l border-[#2a2a2a] bg-[#1a1a1a]">
      {/* 滚动内容区 */}
      <div className="flex-1 overflow-y-auto">

        {/* 文案编辑 */}
        {textFields.length > 0 && (
          <section className="px-5 py-4">
            <h3 className="mb-3 text-sm font-medium text-[#555]">文案编辑</h3>
            <div className="flex flex-col gap-3">
              {textFields.map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label htmlFor={`text-field-${key}`} className="text-xs text-[#555]">{label}</label>
                  <input
                    id={`text-field-${key}`}
                    type="text"
                    name={key}
                    autoComplete="off"
                    value={texts[key] ?? ""}
                    onChange={(e) => onTextChange(key, e.target.value)}
                    className="rounded border border-[#333] bg-[#222] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-[#555] focus-visible:ring-2 focus-visible:ring-white/10"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {colorThemes.length > 0 && <div className="mx-5 border-t border-[#2a2a2a]" />}

        {/* 配色切换（仅当模板提供了配色方案时展示） */}
        {colorThemes.length > 0 && (
          <section className="px-5 py-4">
            <h3 className="mb-3 text-sm font-medium text-[#555]">配色切换</h3>
            <div className="grid grid-cols-4 gap-3">
              {colorThemes.map((theme, i) => {
                const active = i === activeColorIndex;
                return (
                  <button
                    key={theme.name}
                    type="button"
                    onClick={() => onColorChange(i)}
                    aria-label={theme.name}
                    aria-pressed={active}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <div
                      className={[
                        "size-9 rounded-full transition-all duration-200",
                        active
                          ? "ring-2 ring-white ring-offset-2 ring-offset-[#1a1a1a]"
                          : "ring-1 ring-[#333] group-hover:scale-110 group-hover:ring-[#555]",
                      ].join(" ")}
                      style={{ background: theme.values.primary }}
                    />
                    <span
                      className={[
                        "text-xs leading-none transition-colors",
                        active ? "font-medium text-white" : "text-[#555]",
                      ].join(" ")}
                    >
                      {theme.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {imageFields.length > 0 && <div className="mx-5 border-t border-[#2a2a2a]" />}

        {/* 图片替换 */}
        {imageFields.length > 0 && (
          <section className="px-5 py-4">
            <h3 className="mb-3 text-sm font-medium text-[#555]">图片替换</h3>
            <div className="flex flex-col gap-3">
              {imageFields.map(({ key, label, src }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label htmlFor={`image-field-${key}`} className="text-xs text-[#555]">{label}</label>
                  <button
                    type="button"
                    aria-label={`替换${label}`}
                    onClick={() => fileInputRefs.current[key]?.click()}
                    className="group relative h-20 w-full overflow-hidden rounded transition-shadow hover:shadow-card-hover"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={label}
                      className="size-full object-cover"
                    />
                    <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-xs font-medium text-white drop-shadow transition-colors duration-200 group-hover:bg-black/65">
                      <Upload className="size-4" />
                      点击替换
                    </span>
                  </button>
                  <input
                    id={`image-field-${key}`}
                    ref={(el) => { fileInputRefs.current[key] = el; }}
                    type="file"
                    accept="image/*"
                    aria-label={`上传${label}图片`}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(key, file);
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* 导出按钮 — 固定在底部 */}
      <div className="shrink-0 border-t border-[#2a2a2a] p-5">
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="flex w-full items-center justify-center gap-2 rounded-button bg-white px-4 py-2.5 text-sm font-medium text-grey-primary transition-colors hover:bg-grey-100 active:scale-[0.98] disabled:opacity-40"
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {exporting ? "导出中…" : "导出 PNG"}
        </button>
      </div>
    </aside>
  );
}
