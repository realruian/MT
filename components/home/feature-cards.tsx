const features = [
  { id: "extend", title: "AI延展", desc: "上传图片，任意一键延展各类资源位" },
  { id: "cutout", title: "AI抠图", desc: "智能识别主体，一键抠图" },
  { id: "expand", title: "AI扩图", desc: "上传图片，任意延展空间" },
  { id: "cutout2", title: "AI抠图", desc: "智能识别主体，一键抠图" },
  { id: "cutout3", title: "AI抠图", desc: "智能识别主体，一键抠图" },
];

export function FeatureCards() {
  return (
    <section aria-label="AI 图像处理">
      <h3 className="mb-3 text-[16px] font-light leading-none text-[#11192d]">
        AI图像处理
      </h3>
      <div className="grid grid-cols-5 gap-3">
        {features.map((f, i) => (
          <button
            key={f.id + i}
            type="button"
            className="flex items-center gap-3 rounded-[12px] border border-[#f1f2f2] bg-white px-2 py-2 text-left transition-shadow duration-150 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
          >
            <div className="size-16 shrink-0 rounded-[4px] bg-[#eee]" />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-medium leading-none text-[#11192d]">
                {f.title}
              </p>
              <p className="mt-2 text-[12px] font-light leading-[1.2] text-[#7c889c]">
                {f.desc}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
