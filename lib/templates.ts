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
        { key: "mainTitle", label: "主标题", defaultValue: "主标题文案" },
        { key: "subTitle", label: "副标题", defaultValue: "副标题文案" },
      ],
      colors: [],
      images: [
        { key: "bgTemplate", label: "背景图片", defaultSrc: "/templates/background/hotpot.jpg" },
      ],
    },
  },
  {
    id: "2",
    name: "品质生活好物推荐",
    category: "会场组件",
    thumbnail: "/images/4.jpg",
    width: 750,
    height: 560,
    editableFields: {
      texts: [
        { key: "title", label: "主标题", defaultValue: "品质生活节" },
        { key: "subtitle", label: "副标题", defaultValue: "精选好物 限时特惠" },
        { key: "badge", label: "角标文案", defaultValue: "HOT" },
      ],
      colors: [
        {
          name: "暖金",
          values: { primary: "#d97706", secondary: "#fbbf24", bg: "#fffbeb" },
        },
        {
          name: "雅黑",
          values: { primary: "#1f2937", secondary: "#4b5563", bg: "#f3f4f6" },
        },
        {
          name: "森林绿",
          values: { primary: "#15803d", secondary: "#4ade80", bg: "#f0fdf4" },
        },
        {
          name: "海洋蓝",
          values: { primary: "#1d4ed8", secondary: "#60a5fa", bg: "#eff6ff" },
        },
        {
          name: "珊瑚橘",
          values: { primary: "#ea580c", secondary: "#fb923c", bg: "#fff7ed" },
        },
        {
          name: "烟灰紫",
          values: { primary: "#7c3aed", secondary: "#a78bfa", bg: "#f5f3ff" },
        },
        {
          name: "玫瑰红",
          values: { primary: "#e11d48", secondary: "#fb7185", bg: "#fff1f2" },
        },
        {
          name: "天空蓝",
          values: { primary: "#0284c7", secondary: "#38bdf8", bg: "#f0f9ff" },
        },
      ],
      images: [
        { key: "bg", label: "背景图", defaultSrc: "/images/4.jpg" },
        { key: "product1", label: "商品图 1", defaultSrc: "/images/5.png" },
        { key: "product2", label: "商品图 2", defaultSrc: "/images/6.png" },
      ],
    },
  },
  {
    id: "3",
    name: "外卖满减活动 Banner",
    category: "站内资源位",
    thumbnail: "/images/8.jpg",
    width: 1200,
    height: 450,
    editableFields: {
      texts: [
        { key: "title", label: "主标题", defaultValue: "超值满减" },
        {
          key: "subtitle",
          label: "副标题",
          defaultValue: "满30减15 满50减25",
        },
        { key: "cta", label: "按钮文案", defaultValue: "马上点餐" },
      ],
      colors: [
        {
          name: "美团黄",
          values: { primary: "#ffc107", secondary: "#ffca28", bg: "#fffde7" },
        },
        {
          name: "活力红",
          values: { primary: "#f44336", secondary: "#ef5350", bg: "#ffebee" },
        },
        {
          name: "清新蓝",
          values: { primary: "#2196f3", secondary: "#42a5f5", bg: "#e3f2fd" },
        },
        {
          name: "自然绿",
          values: { primary: "#4caf50", secondary: "#66bb6a", bg: "#e8f5e9" },
        },
        {
          name: "深邃紫",
          values: { primary: "#9c27b0", secondary: "#ab47bc", bg: "#f3e5f5" },
        },
        {
          name: "暗夜黑",
          values: { primary: "#212121", secondary: "#424242", bg: "#fafafa" },
        },
        {
          name: "霞光橙",
          values: { primary: "#ff9800", secondary: "#ffa726", bg: "#fff3e0" },
        },
        {
          name: "冰川蓝",
          values: { primary: "#00bcd4", secondary: "#26c6da", bg: "#e0f7fa" },
        },
      ],
      images: [
        { key: "hero", label: "主 Banner 图", defaultSrc: "/images/8.jpg" },
        { key: "food", label: "美食图", defaultSrc: "/images/10.jpg" },
      ],
    },
  },
];

export function getTemplateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}
