import type { Template } from "@/types/template";

/**
 * 为带有 htmlFile 的真实模板构建带参数的 URL，参数注入由模板自身的脚本完成。
 */
export function buildTemplateUrl(
  template: Template,
  texts: Record<string, string>,
  colorTheme: Record<string, string>,
  images: Record<string, string>,
  textColors?: Record<string, string>,
): string {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(texts)) {
    if (val) params.set(key, val);
  }
  // 颜色参数（排除 primary，primary 仅用于面板色块展示）
  for (const [key, val] of Object.entries(colorTheme)) {
    if (key !== "primary" && val) params.set(key, val);
  }
  for (const [key, val] of Object.entries(images)) {
    if (val) params.set(key, val);
  }
  if (textColors) {
    for (const [key, val] of Object.entries(textColors)) {
      if (val) params.set(`${key}Color`, val);
    }
  }
  const base = template.htmlFile ?? "";
  const qs = params.toString();
  if (!qs) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${qs}`;
}

