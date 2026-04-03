"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { X } from "lucide-react";

// TODO: Move to config or fetch from API
const sceneTabs = [
  {
    id: "all",
    label: "全部模板",
    placeholder:
      "描述你想要的设计，如：我想要一个奶茶品类的夏日促销 Banner，清爽风格，主色调蓝绿",
  },
  {
    id: "hall-banner",
    label: "会场头图",
    placeholder:
      "描述你想要的会场头图风格与主题，如：夏日清凉感奶茶品类，主色调蓝绿，活动名「夏日狂欢节」，突出清爽促销氛围",
  },
  {
    id: "hall-blocks",
    label: "会场组件",
    placeholder:
      "描述你需要的会场组件类型，如：限时倒计时模块 + 爆品榜单 + 满减优惠信息组合，风格简洁、信息密度中等",
  },
  {
    id: "insite-slot",
    label: "站内资源位",
    placeholder:
      "上传主视觉，描述需要延展的站内资源位规格，如：首焦 1200×450、商品卡 400×300、弹窗 750×1000",
  },
  {
    id: "offsite-slot",
    label: "站外资源位",
    placeholder:
      "描述你需要的站外投放素材，如：微信朋友圈信息流 9:16、抖音竖版 Banner、微博横版图文等",
  },
  {
    id: "consumer",
    label: "C 端外素材",
    placeholder:
      "描述你需要的 C 端消费者向素材，如：品类节日贺卡、活动分享卡、品牌宣传长图等",
  },
] as const;

type SceneTabId = (typeof sceneTabs)[number]["id"];

const modes = [
  { id: "free", label: "自由模式" },
  { id: "template", label: "智能比例" },
] as const;

// TODO: Replace hardcoded paths with API data
const templateImages = [
  "/images/1.jpg",
  "/images/2.png",
  "/images/3.png",
  "/images/4.jpg",
  "/images/5.png",
  "/images/6.png",
  "/images/7.png",
  "/images/8.jpg",
  "/images/9.png",
  "/images/10.jpg",
  "/images/11.png",
  "/images/12.png",
  "/images/13.png",
  "/images/14.png",
  "/images/1b860b5ce0292d748bbde6e9133a701b236062.jpg",
  "/images/7ab1bbda2faae0eb5fdf546ccae0f961236923.jpg",
  "/images/8925eacd0560c12ffdeccd5e87954729274902.jpg",
  "/images/a6d0965cca98ea0de37aa4edccee55ec276721.jpg",
  "/images/ad8732bcf2dd6db7e02a0597fa31a390998810.png",
  "/images/e6fda5e285ec1b435e3a4eba170a59f5262669.jpg",
  "/images/f61c60666ed7e17dffc4709d132f2203285213.jpg",
];

export function HomeMain() {
  const [activeScene, setActiveScene] = useState<SceneTabId>("all");
  const [prompt, setPrompt] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentScene = sceneTabs.find((t) => t.id === activeScene)!;

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
    <main className="flex min-h-screen flex-1 flex-col overflow-y-auto bg-transparent">
      {/* 主内容 */}
      <div className="animate-studio-enter mx-auto flex w-full max-w-content flex-col gap-9 pb-12 pt-[88px]">

        {/* 标题区 */}
        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="title-rainbow font-display text-[32px] leading-none tracking-tight">
            设计需求 快人一步
          </h1>
          <p className="text-[16px] font-medium leading-none text-[#2a2a2a]">
            人人都是设计师
          </p>
        </header>

        {/* 创作面板卡片 */}
        <section
          className="mx-auto w-full max-w-[840px] px-10"
          aria-labelledby="design-panel-heading"
        >
          <h2 id="design-panel-heading" className="sr-only">
            创作面板
          </h2>
          <form
            aria-label={currentScene.label}
            className="flex min-h-[168px] flex-col gap-6 rounded-[32px] border border-white/50 bg-white/70 p-4 shadow-none backdrop-blur-xl transition-shadow duration-300 ease-out hover:shadow-[0_16px_48px_rgba(0,0,0,0.05)] focus-within:shadow-[0_16px_48px_rgba(0,0,0,0.05)]"
            action="#"
            method="post"
          >
            {/* 上传 + textarea */}
            <div className="flex flex-1 items-start gap-5">
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
                  <div className="relative h-[80px] w-[60px] overflow-hidden rounded-[12px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={uploadedImage}
                      alt="已上传参考图"
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      aria-label="移除图片"
                      className="absolute right-1 top-1 flex size-[18px] items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                    >
                      <X className="size-2.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="image-upload"
                    className="flex h-[80px] w-[60px] cursor-pointer items-center justify-center rounded-[12px] bg-[#f1f2f2] transition-colors duration-150 hover:bg-[#e5e6e7]"
                    aria-label="上传参考图片"
                  >
                    <Image
                      src="/icons/plus.svg"
                      alt="上传图片"
                      width={20}
                      height={20}
                      className="opacity-40"
                    />
                  </label>
                )}
              </div>

              {/* Textarea */}
              <div className="flex min-w-0 flex-1 self-stretch">
                <label htmlFor="design-prompt" className="sr-only">
                  {currentScene.label}描述
                </label>
                <textarea
                  id="design-prompt"
                  key={activeScene}
                  name="prompt"
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  autoComplete="off"
                  placeholder={currentScene.placeholder}
                  className="w-full resize-none border-0 bg-transparent text-[12px] leading-[1.5] text-[#2a2a2a] outline-none placeholder:text-[#999] focus:ring-0"
                />
              </div>
            </div>

            {/* 底部工具栏 */}
            <div className="flex items-end justify-between">
              {/* 模式 pills */}
              <div className="flex items-center gap-2">
                {modes.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className="rounded-[12px] border border-[#EEEEEE] px-5 py-2.5 text-[12px] font-medium leading-none text-[#919ca5]"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* 发送按钮 */}
              <button
                type="submit"
                disabled={!prompt.trim()}
                aria-label="发送需求"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2a2a2a] text-white shadow-sm transition-all duration-200 ease-out hover:bg-[#111] active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 13 13"
                  fill="none"
                  aria-hidden
                >
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
          </form>
        </section>

        {/* 场景 Tab 栏 + 模板网格 */}
        <section
          className="mx-auto w-full max-w-content px-[120px]"
          aria-label="模板库"
        >
          {/* Tab 栏 */}
          <div
            role="tablist"
            aria-label="选择场景分类"
            className="mb-3 flex items-center gap-2"
          >
            {sceneTabs.map((tab) => {
              const active = tab.id === activeScene;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setActiveScene(tab.id)}
                  className={[
                    "shrink-0 rounded-[8px] px-3 py-2 text-[10px] font-semibold text-[#2a2a2a] transition-colors duration-150 ease-out",
                    active ? "bg-[#ebeced] text-[#2a2a2a]" : "bg-transparent text-[#546471] hover:bg-[#ebeced]/60 hover:text-[#2a2a2a]",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 模板瀑布流 */}
          <div className="columns-4 gap-6 space-y-6">
            {templateImages.map((src, i) => (
              <button
                key={i}
                type="button"
                aria-label={`模板 ${i + 1}`}
                className="group relative block w-full break-inside-avoid overflow-hidden rounded-[8px] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(6,182,212,0.3)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`模板 ${i + 1}`}
                  className="w-full transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                />
                {/* 立即使用 hover 浮层 */}
                <div className="absolute inset-0 flex items-end justify-center pb-4 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
                  <span className="relative rounded-full bg-white/90 px-5 py-2 text-[12px] font-medium text-[#2a2a2a] shadow-[0_2px_12px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                    立即使用
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
