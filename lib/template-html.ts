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
  return `${template.htmlFile}?${params.toString()}`;
}

export function generateTemplateHtml(
  template: Template,
  texts: Record<string, string>,
  colorTheme: Record<string, string>,
  images: Record<string, string>,
  textColors?: Record<string, string>,
): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${template.width}px;
    height: ${template.height}px;
    font-family: "PingFang SC", "Helvetica Neue", Arial, sans-serif;
    background: ${colorTheme.bg || "#fff"};
    overflow: hidden;
    position: relative;
  }
  .hero-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.3;
  }
  .content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 40px;
    text-align: center;
  }
  .title {
    font-size: 48px;
    font-weight: 700;
    color: ${textColors?.title || colorTheme.primary || "#111"};
    margin-bottom: 16px;
    text-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .subtitle {
    font-size: 24px;
    font-weight: 400;
    color: ${textColors?.subtitle || colorTheme.secondary || "#666"};
    margin-bottom: 32px;
  }
  .cta {
    display: inline-block;
    padding: 12px 40px;
    border-radius: 999px;
    background: ${colorTheme.primary || "#111"};
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 2px;
  }
  .product-img {
    position: absolute;
    bottom: 20px;
    right: 40px;
    width: 120px;
    height: 120px;
    object-fit: cover;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  }
</style>
</head>
<body>
  <img class="hero-img" src="${images[template.editableFields.images[0]?.key] || template.editableFields.images[0]?.defaultSrc || ""}" />
  <div class="content">
    <div class="title">${texts.title || ""}</div>
    <div class="subtitle">${texts.subtitle || ""}</div>
    ${texts.cta ? `<div class="cta">${texts.cta}</div>` : ""}
  </div>
  ${
    template.editableFields.images[1]
      ? `<img class="product-img" src="${images[template.editableFields.images[1].key] || template.editableFields.images[1].defaultSrc}" />`
      : ""
  }
</body>
</html>`;
}
