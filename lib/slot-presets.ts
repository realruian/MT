export interface SlotSize {
  /** 内部 id，如 "750x100" */
  id: string;
  /** UI 显示标签，如 "750 × 100" */
  label: string;
  width: number;
  height: number;
  /**
   * 绑定的真实 PSD 模板 id。有值 = PSD-backed 资源位（可展示真实图层内容）；
   * 无值 = 尺寸占位资源位（目前降级到 demo 模板展示）。
   */
  templateId?: string;
  /** 可选缩略图 URL，供资源位列表卡片展示 */
  thumbnailUrl?: string;
}

/** 资源位所属渠道。外卖 = 外卖 app 的资源位；团侧 = 美团 app / 到店的资源位 */
export type SlotChannel = "外卖" | "团侧";

export interface SlotPreset {
  /** 资源位内部 id，如 "home_op_card" */
  id: string;
  /** 资源位 UI 名，如 "首页运营卡片" */
  name: string;
  /** 所属渠道，用于在"一键拓展"弹窗里区分渠道归属 */
  channel: SlotChannel;
  sizes: SlotSize[];
}

// 无真实 PSD 的占位资源位降级展示用的 demo 模板（38礼遇-会场）。
// 接入真实模板后从 sizes[].templateId 直接读取，该常量仅作兜底。
export const SLOT_PRESETS_DEMO_TEMPLATE = "psd_mobmnxso_532a";

// 尺寸列表按「一键拓展」弹窗的业务清单维护：外卖渠道在前、团侧渠道在后，
// 组内顺序与 PRD 给到的列表一致，便于产运对照检查。
// 前 4 个为 PSD-backed 资源位（含真实 templateId），其余为尺寸占位资源位。
export const SLOT_PRESETS: SlotPreset[] = [
  // ── PSD-backed 资源位（4 个真实模板） ──────────────────────────────────
  {
    id: "daocan-banner",
    name: "到餐后 banner",
    channel: "外卖",
    sizes: [
      { id: "default", label: "702 × 120", width: 702, height: 120, templateId: "psd_mobojeim_ygnu" },
    ],
  },
  {
    id: "shouye-card",
    name: "首页运营卡片",
    channel: "外卖",
    sizes: [
      { id: "default", label: "702 × 150", width: 702, height: 150, templateId: "psd_moboju6w_q79a" },
    ],
  },
  {
    id: "liyu-caixi",
    name: "38 礼遇·猜喜",
    channel: "外卖",
    sizes: [
      { id: "default", label: "684 × 684", width: 684, height: 684, templateId: "psd_mobojq30_mkci" },
    ],
  },
  {
    id: "tuan-popup",
    name: "团游戏弹窗",
    channel: "外卖",
    sizes: [
      { id: "default", label: "530 × 752", width: 530, height: 752, templateId: "psd_mobojmmb_69f0" },
    ],
  },
  // ── 尺寸占位资源位（现有 preset，暂无独立真实模板） ──────────────────
  {
    id: "bottom_tab",
    name: "底 tab",
    channel: "外卖",
    sizes: [
      { id: "165x165", label: "165 × 165", width: 165, height: 165 },
    ],
  },
  {
    id: "banner_fixed",
    name: "固定位 banner",
    channel: "外卖",
    sizes: [
      { id: "702x110", label: "702 × 110", width: 702, height: 110 },
    ],
  },
  {
    id: "home_atmosphere",
    name: "首页氛围",
    channel: "外卖",
    sizes: [
      { id: "750x810", label: "750 × 810", width: 750, height: 810 },
    ],
  },
  {
    id: "home_one_two",
    name: "首页一拖二",
    channel: "外卖",
    sizes: [
      { id: "750x150", label: "750 × 150", width: 750, height: 150 },
      { id: "750x160", label: "750 × 160", width: 750, height: 160 },
    ],
  },
  {
    id: "pull_second_floor",
    name: "下拉二楼",
    channel: "外卖",
    sizes: [
      { id: "315x297", label: "315 × 297", width: 315, height: 297 },
    ],
  },
  {
    id: "popup",
    name: "弹窗",
    channel: "外卖",
    sizes: [
      { id: "640x790", label: "640 × 790", width: 640, height: 790 },
    ],
  },
  {
    id: "home_op_card",
    name: "首页运营卡片（通用）",
    channel: "外卖",
    sizes: [
      { id: "654x156", label: "654 × 156", width: 654, height: 156 },
    ],
  },
  {
    id: "home_float",
    name: "首页浮标",
    channel: "外卖",
    sizes: [
      { id: "120x40", label: "120 × 40", width: 120, height: 40 },
    ],
  },
  {
    id: "sidebar",
    name: "侧边栏",
    channel: "团侧",
    sizes: [
      { id: "352x352", label: "352 × 352", width: 352, height: 352 },
      { id: "184x184", label: "184 × 184", width: 184, height: 184 },
    ],
  },
  {
    id: "guess_like",
    name: "猜喜",
    channel: "团侧",
    sizes: [
      { id: "684x684", label: "684 × 684", width: 684, height: 684 },
    ],
  },
  {
    id: "game_popup",
    name: "游戏弹窗",
    channel: "团侧",
    sizes: [
      { id: "530x752", label: "530 × 752", width: 530, height: 752 },
    ],
  },
];
