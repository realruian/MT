export interface SlotSize {
  /** 内部 id，如 "750x100" */
  id: string;
  /** UI 显示标签，如 "750 × 100" */
  label: string;
  width: number;
  height: number;
  /** 对应已上传 PSD 模板 ID。Demo 阶段可全部占位指向同一个模板 */
  templateId: string;
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

// Demo 占位：全部指向现有 "38礼遇-会场" 模板。
// 业务阶段在后台上传各尺寸真实 PSD 后，把此处的 templateId 替换为对应真实模板 ID 即可。
const DEMO_TEMPLATE = "psd_mo9hkl9y_wd8n";

// 尺寸列表按「一键拓展」弹窗的业务清单维护：外卖渠道在前、团侧渠道在后，
// 组内顺序与 PRD 给到的列表一致，便于产运对照检查。
export const SLOT_PRESETS: SlotPreset[] = [
  {
    id: "bottom_tab",
    name: "底 tab",
    channel: "外卖",
    sizes: [
      { id: "165x165", label: "165 × 165", width: 165, height: 165, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "banner_fixed",
    name: "固定位 banner",
    channel: "外卖",
    sizes: [
      { id: "702x110", label: "702 × 110", width: 702, height: 110, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "home_atmosphere",
    name: "首页氛围",
    channel: "外卖",
    sizes: [
      { id: "750x810", label: "750 × 810", width: 750, height: 810, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "home_one_two",
    name: "首页一拖二",
    channel: "外卖",
    sizes: [
      { id: "750x150", label: "750 × 150", width: 750, height: 150, templateId: DEMO_TEMPLATE },
      { id: "750x160", label: "750 × 160", width: 750, height: 160, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "pull_second_floor",
    name: "下拉二楼",
    channel: "外卖",
    sizes: [
      { id: "315x297", label: "315 × 297", width: 315, height: 297, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "popup",
    name: "弹窗",
    channel: "外卖",
    sizes: [
      { id: "640x790", label: "640 × 790", width: 640, height: 790, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "home_op_card",
    name: "首页运营卡片",
    channel: "外卖",
    sizes: [
      { id: "654x156", label: "654 × 156", width: 654, height: 156, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "home_float",
    name: "首页浮标",
    channel: "外卖",
    sizes: [
      { id: "120x40", label: "120 × 40", width: 120, height: 40, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "sidebar",
    name: "侧边栏",
    channel: "团侧",
    sizes: [
      { id: "352x352", label: "352 × 352", width: 352, height: 352, templateId: DEMO_TEMPLATE },
      { id: "184x184", label: "184 × 184", width: 184, height: 184, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "guess_like",
    name: "猜喜",
    channel: "团侧",
    sizes: [
      { id: "684x684", label: "684 × 684", width: 684, height: 684, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "game_popup",
    name: "游戏弹窗",
    channel: "团侧",
    sizes: [
      { id: "530x752", label: "530 × 752", width: 530, height: 752, templateId: DEMO_TEMPLATE },
    ],
  },
];
