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

export interface SlotPreset {
  /** 资源位内部 id，如 "home_op_card" */
  id: string;
  /** 资源位 UI 名，如 "首页运营卡片" */
  name: string;
  sizes: SlotSize[];
}

// Demo 占位：全部指向现有 "38礼遇-会场" 模板。
// 业务阶段在后台上传各尺寸真实 PSD 后，把此处的 templateId 替换为对应真实模板 ID 即可。
const DEMO_TEMPLATE = "psd_mo9hkl9y_wd8n";

export const SLOT_PRESETS: SlotPreset[] = [
  {
    id: "home_op_card",
    name: "首页运营卡片",
    sizes: [
      { id: "750x100", label: "750 × 100", width: 750, height: 100, templateId: DEMO_TEMPLATE },
      { id: "750x110", label: "750 × 110", width: 750, height: 110, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "delivery_guess",
    name: "外卖猜喜",
    sizes: [
      { id: "702x120", label: "702 × 120", width: 702, height: 120, templateId: DEMO_TEMPLATE },
      { id: "702x150", label: "702 × 150", width: 702, height: 150, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "banner_top",
    name: "顶部 Banner",
    sizes: [
      { id: "1125x420", label: "1125 × 420", width: 1125, height: 420, templateId: DEMO_TEMPLATE },
    ],
  },
  {
    id: "feed_card",
    name: "信息流卡片",
    sizes: [
      { id: "375x200", label: "375 × 200", width: 375, height: 200, templateId: DEMO_TEMPLATE },
      { id: "375x240", label: "375 × 240", width: 375, height: 240, templateId: DEMO_TEMPLATE },
    ],
  },
];
