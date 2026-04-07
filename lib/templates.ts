import type { Template } from "@/types/template";

// Re-export types for convenience
export type { Template, EditableFields } from "@/types/template";

export const templates: Template[] = [
  {
    id: "header",
    name: "会场头图 Banner",
    category: "会场头图",
    thumbnail: "/images/1.jpg",
    width: 750,
    height: 810,
    htmlFile: "/templates/header.html",
    editableFields: {
      texts: [
        { key: "mainTitle", label: "主标题", defaultValue: "主标题文案", defaultColor: "#ffffff" },
        { key: "subTitle", label: "副标题", defaultValue: "副标题文案", defaultColor: "#000000" },
      ],
      colors: [],
      images: [
        { key: "bgTemplate", label: "背景图片", defaultSrc: "/templates/background/hotpot.jpg" },
      ],
    },
  },
];

export function getTemplateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}
