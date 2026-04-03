"use client";

import { useRef } from "react";
import { Download, Loader2, Upload } from "lucide-react";

interface EditPanelProps {
  texts: Record<string, string>;
  onTextChange: (key: string, value: string) => void;
  textColors: Record<string, string>;
  onTextColorChange: (key: string, color: string) => void;
  textFields: { key: string; label: string }[];
  colorThemes: { name: string; values: Record<string, string> }[];
  activeColorIndex: number;
  onColorChange: (index: number) => void;
  imageFields: { key: string; label: string; src: string }[];
  onImageChange: (key: string, src: string) => void;
  onExport: () => void;
  exporting: boolean;
}

const TEXT_COLORS = [
  { value: "#000000", label: "黑色" },
  { value: "#ffffff", label: "白色" },
];

export function EditPanel({
  texts,
  onTextChange,
  textColors,
  onTextColorChange,
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
    <aside className="fixed bottom-0 right-0 top-14 z-10 flex w-80 flex-col border-l border-gray-100 bg-white">
      {/* 滚动内容区 */}
      <div className="flex-1 overflow-y-auto">

        {/* 文案编辑 */}
        {textFields.length > 0 && (
          <section className="px-5 py-4">
            <h3 className="mb-3 text-sm font-medium text-gray-500">文案编辑</h3>
            <div className="flex flex-col gap-3">
              {textFields.map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <span className="text-xs text-gray-400">{label}</span>
                  <input
                    type="text"
                    value={texts[key] ?? ""}
                    onChange={(e) => onTextChange(key, e.target.value)}
                    className="rounded-input border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition-all focus:border-gray-400"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-300">颜色</span>
                    {TEXT_COLORS.map((c) => {
                      const active = textColors[key] === c.value;
                      const isWhite = c.value === "#ffffff";
                      return (
                        <button
                          key={c.value}
                          type="button"
                          title={c.label}
                          onClick={() => onTextColorChange(key, c.value)}
                          className={[
                            "size-5 rounded-full transition-all",
                            isWhite ? "border border-gray-200" : "",
                            active
                              ? "ring-1.5 ring-gray-400 ring-offset-1"
                              : "opacity-60 hover:opacity-100",
                          ].join(" ")}
                          style={{ backgroundColor: c.value }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {colorThemes.length > 0 && <div className="mx-5 border-t border-gray-100" />}

        {/* 配色切换（仅当模板提供了配色方案时展示） */}
        {colorThemes.length > 0 && (
          <section className="px-5 py-4">
            <h3 className="mb-3 text-sm font-medium text-gray-500">配色切换</h3>
            <div className="grid grid-cols-4 gap-3">
              {colorThemes.map((theme, i) => {
                const active = i === activeColorIndex;
                return (
                  <button
                    key={theme.name}
                    type="button"
                    onClick={() => onColorChange(i)}
                    className="group flex flex-col items-center gap-1.5"
                    title={theme.name}
                  >
                    <div
                      className={[
                        "size-9 rounded-full transition-all duration-200",
                        active
                          ? "ring-2 ring-cyan-500 ring-offset-2"
                          : "ring-1 ring-gray-200 group-hover:scale-110 group-hover:ring-gray-300",
                      ].join(" ")}
                      style={{ background: theme.values.primary }}
                    />
                    <span
                      className={[
                        "text-xs leading-none transition-colors",
                        active ? "font-medium text-gray-900" : "text-gray-400",
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

        {imageFields.length > 0 && <div className="mx-5 border-t border-gray-100" />}

        {/* 图片替换 */}
        {imageFields.length > 0 && (
          <section className="px-5 py-4">
            <h3 className="mb-3 text-sm font-medium text-gray-500">图片替换</h3>
            <div className="flex flex-col gap-3">
              {imageFields.map(({ key, label, src }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <span className="text-xs text-gray-400">{label}</span>
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[key]?.click()}
                    className="group relative h-20 w-full overflow-hidden rounded-card transition-shadow hover:shadow-card-hover"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={label}
                      className="size-full object-cover"
                    />
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-xs font-medium text-white drop-shadow transition-all duration-200 group-hover:bg-black/65">
                      <Upload className="size-4" />
                      点击替换
                    </span>
                  </button>
                  <input
                    ref={(el) => { fileInputRefs.current[key] = el; }}
                    type="file"
                    accept="image/*"
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
      <div className="shrink-0 border-t border-gray-100 p-5">
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="flex w-full items-center justify-center gap-2 rounded-button bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 active:scale-[0.98] disabled:opacity-50"
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
