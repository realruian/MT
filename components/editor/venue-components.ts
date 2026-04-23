import type { PsdLayer } from "@/types/template";

/**
 * 会场组件（venue component）：可插入到当前会场画布的"业务积木"，
 * 在 SlotPanel 的「会场」tab 下以"会场组件卡片（venue component card）"形式
 * 呈现。将来由后台上传功能生产数据，接口返回结构按这个 type 对齐；
 * payload.layers 在 VenueComponentCard 被点击时，由 insertComponentIntoLayers
 * 克隆出一套新 id、y 偏移到画布底部、写入会场主画布。
 */
export interface VenueComponent {
  id: string;
  /** 会场组件卡片下方展示名，≤ 6 字 */
  name: string;
  /** 分组名；VenueComponentLibrary 按 group 首次出现顺序聚合渲染 */
  group: string;
  /** 缩略图 URL（生产环境是 blob URL，正方形） */
  thumbnail: string;
  /** 组件真实画布尺寸（像素），用于 insert 时的 bbox 与画布拉长计算 */
  width: number;
  height: number;
  /** 插入时克隆并 id 重映射；结构为 [根 group, 背景 image, 文字 text] 三层 */
  payload: { layers: PsdLayer[] };
}

/** 内联 SVG 占位缩略图（左侧卡片用）：纯色矩形，通过 viewBox 暴露 intrinsic
 *  aspect ratio，让 w-full / h-auto 按比例自适应卡片高度。 */
function mockThumb(color: string, aspectW: number, aspectH: number): string {
  const w = aspectW * 10;
  const h = aspectH * 10;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${color}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 会场组件分组表：保持严格顺序（VenueComponentLibrary 按 groups[i].name 首次
 * 出现顺序渲染）。每组一个代表色 + 一种缩略图比例 + 对应像素尺寸 + public 下
 * 的色块 PNG 文件名（由 scripts/gen-mock-venue-pngs.mjs 一次性生成）。
 */
const GROUPS: {
  name: string;
  short: string;
  color: string;
  ratio: [number, number];
  /** 组件真实画布尺寸（px），与 public/mock-venue/<png> 尺寸一致 */
  width: number;
  height: number;
  /** public/mock-venue 下的 PNG 文件名，插入 layer 的 imageUrl 会指向 `/mock-venue/<png>` */
  png: string;
}[] = [
  { name: "头图模块", short: "头图", color: "#FF5D6E", ratio: [16, 9], width: 750, height: 422, png: "head.png" },
  { name: "优惠券", short: "优惠券", color: "#FF8A3D", ratio: [1, 1], width: 400, height: 400, png: "coupon.png" },
  { name: "开礼包", short: "开礼包", color: "#FFC93D", ratio: [1, 1], width: 400, height: 400, png: "gift.png" },
  { name: "膨半价节日神券", short: "膨半价", color: "#10B981", ratio: [4, 3], width: 600, height: 450, png: "discount.png" },
  { name: "1对1急送", short: "1对1急送", color: "#3BA7FF", ratio: [3, 1], width: 750, height: 250, png: "urgent.png" },
  { name: "站台", short: "站台", color: "#6C63FF", ratio: [1, 1], width: 400, height: 400, png: "station.png" },
  { name: "免单", short: "免单", color: "#EC4899", ratio: [2, 1], width: 600, height: 300, png: "free.png" },
];

/** 字号按组件短边自适应：让文字在任意比例卡上都醒目但不溢出。 */
function pickFontSize(h: number): number {
  if (h <= 260) return 48;
  if (h <= 320) return 52;
  return 60;
}

/**
 * 为一个会场组件构造一套 mock 图层（[group, bg image, text]）。
 * - group：作为组件根，允许整体拖动；无 imageUrl / textContent，不被渲染
 * - bg image：覆盖整个组件 bbox，imageUrl 指向 /mock-venue/<png>
 * - text：居中文字（组件显示名），MeiTuan / 700 / 白色
 *
 * 图层 id 先用"组件内相对 id"（root / bg / text），实际插入时会由
 * insertComponentIntoLayers 做全局 id 重映射（加 nonce 前缀）。
 */
function buildMockLayers(
  componentId: string,
  componentName: string,
  width: number,
  height: number,
  png: string,
): PsdLayer[] {
  const fontSize = pickFontSize(height);
  const rootId = `${componentId}_root`;
  const bgId = `${componentId}_bg`;
  const textId = `${componentId}_text`;
  return [
    {
      id: rootId,
      templateId: "",
      name: componentName,
      layerType: "group",
      zIndex: 0,
      x: 0,
      y: 0,
      width,
      height,
      visible: true,
      opacity: 1,
      rotation: 0,
      locked: false,
      parentId: null,
    },
    {
      id: bgId,
      templateId: "",
      name: "背景",
      layerType: "image",
      zIndex: 1,
      x: 0,
      y: 0,
      width,
      height,
      visible: true,
      opacity: 1,
      rotation: 0,
      locked: false,
      parentId: rootId,
      imageUrl: `/mock-venue/${png}`,
    },
    {
      id: textId,
      templateId: "",
      name: "标题",
      layerType: "text",
      zIndex: 2,
      x: 0,
      // 文字 bbox 垂直居中：top = (组件高 - 字号) / 2
      y: Math.round((height - fontSize) / 2),
      width,
      height: fontSize,
      visible: true,
      opacity: 1,
      rotation: 0,
      locked: false,
      parentId: rootId,
      textContent: componentName,
      fontFamily: "MeiTuan",
      fontWeight: "700",
      fontSize,
      fontColor: "#FFFFFF",
      textAlign: "center",
    },
  ];
}

/**
 * 会场组件 mock 列表：严格按 GROUPS 顺序展开，每组 2 张会场组件卡片（A / B）。
 * 每张卡片的 payload.layers 是 [group, bg image(public PNG), text(组件名)]。
 * Step 2 真实接口上线后把这份数组换成 `await fetch('/api/admin/venue-components')`
 * 的结果即可。
 */
export const MOCK_VENUE_COMPONENTS: VenueComponent[] = GROUPS.flatMap((g) =>
  (["A", "B"] as const).map((suffix) => {
    const id = `venue_${g.short}_${suffix.toLowerCase()}`;
    const name = `${g.short} ${suffix}`;
    return {
      id,
      name,
      group: g.name,
      thumbnail: mockThumb(g.color, g.ratio[0], g.ratio[1]),
      width: g.width,
      height: g.height,
      payload: { layers: buildMockLayers(id, name, g.width, g.height, g.png) },
    };
  }),
);
