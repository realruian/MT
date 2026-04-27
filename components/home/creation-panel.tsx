"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { SceneTabId } from "./scene-tab-bar";

const modes = [
  { id: "free", label: "自由模式" },
  { id: "template", label: "智能比例" },
] as const;

interface CreationPanelProps {
  activeScene: SceneTabId;
}

export function CreationPanel({ activeScene }: CreationPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [activeMode, setActiveMode] = useState<string>("free");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedImage(URL.createObjectURL(file));
  }

  function clearImage() {
    setUploadedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form
      aria-label="创作面板"
      className="flex w-full flex-wrap gap-6 rounded-[12px] border border-[#f1f2f2] bg-white p-4"
      action="#"
      method="post"
    >
      {/* 上传区 */}
      <div className="shrink-0">
        <input
          ref={fileInputRef}
          id="image-upload"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
        />
        {uploadedImage ? (
          <div className="relative size-[80px]">
            <div className="size-[80px] overflow-hidden rounded-[8px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={uploadedImage}
                alt="已上传参考图"
                className="size-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={clearImage}
              aria-label="移除图片"
              className="absolute -right-2 -top-2 flex size-11 items-center justify-center"
            >
              <span
                aria-hidden
                className="flex size-[18px] items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <X className="size-2.5" strokeWidth={2.5} />
              </span>
            </button>
          </div>
        ) : (
          <label
            htmlFor="image-upload"
            className="flex size-[80px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-grey-border transition-colors duration-150 hover:bg-grey-50"
            aria-label="上传参考图片"
          >
            <Image
              src="/icons/upload-image.svg"
              alt=""
              width={20}
              height={20}
              aria-hidden
            />
            <span className="text-[14px] text-grey-tertiary">上传图片</span>
          </label>
        )}
      </div>

      {/* 右侧：输入框 + 按钮 */}
      <div className="flex min-w-[200px] flex-1 flex-col justify-between self-stretch">
        <div className="flex-1">
          <label htmlFor="design-prompt" className="sr-only">
            设计描述
          </label>
          <textarea
            id="design-prompt"
            key={activeScene}
            name="prompt"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            autoComplete="off"
            placeholder="请在此输入您的设计要求，词条越详细，生成效果越精准哦～"
            className="mt-2 w-full resize-none border-0 bg-transparent text-[14px] leading-[14px] text-grey-tertiary outline-none placeholder:text-grey-tertiary focus:ring-0"
          />
        </div>

        {/* 底部工具栏 */}
        <div className="flex items-end justify-between">
          <div className="flex items-center gap-2" role="group" aria-label="创作模式">
            {modes.map(({ id, label }) => {
              const pressed = activeMode === id;
              const cls = [
                "rounded-[12px] border px-5 py-2.5 text-[14px] font-normal leading-none transition-colors duration-150",
                pressed
                  ? "border-[#11192d] bg-[#11192d] text-white"
                  : "border-grey-border text-grey-tertiary hover:border-[#ccc] hover:text-grey-primary",
              ].join(" ");
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setActiveMode(id)}
                  className={cls}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={!prompt.trim()}
            aria-label="发送需求"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#11192d] text-white shadow-sm transition-colors duration-150 ease-out hover:bg-[#000] active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
              <path
                d="M6.5 11V2M6.5 2L2 6.5M6.5 2L11 6.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </form>
  );
}
