import type { Template } from "@/types/template";
import { TemplateCard } from "./template-card";

const SECTION_TITLE_CLS = "mb-3 text-[16px] font-light leading-none text-[#11192d]";

const GRID_CLS = [
  "columns-2 gap-2 space-y-2",
  "sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6",
].join(" ");

export function TemplateGrid({ templates }: { templates: Template[] }) {
  if (templates.length === 0) {
    return (
      <section aria-label="模板库">
        <h3 className={SECTION_TITLE_CLS}>全部模板</h3>
        <p className="py-20 text-center text-sm text-gray-400">暂无模板</p>
      </section>
    );
  }

  return (
    <section aria-label="模板库">
      <h3 className={SECTION_TITLE_CLS}>全部模板</h3>
      <div className={GRID_CLS}>
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </section>
  );
}
