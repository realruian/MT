/**
 * 演示用伪模板。仅用于内部 demo，演示完应当切回 main 分支删除。
 *
 * 约定：
 * - id 以 "demo_" 开头作为伪模板识别标记，TemplateCard 检测后阻止跳转
 * - thumbnail 指向 public/images/demo/{i}.png（用户演示前手动放图）
 * - category 固定 "全套活动"，匹配 home-shell.tsx 的 SCENE_TO_CATEGORY 映射
 * - editableFields 给空数组保证类型合法
 *
 * 还原：git switch main 即可，本文件随 demo/fake-templates 分支一起被切走
 */
import type { Template } from "@/types/template";

const DEMO_NAMES = [
  "38 礼遇会场",
  "618 大促头图",
  "周末半价节日神券",
  "外卖品牌联合营销",
  "夏日冰饮专场",
  "下午茶限时神券",
  "新店首单立减",
  "深夜食堂主题日",
  "学生开学季套餐",
  "中秋月饼礼盒",
  "国庆双节同庆",
  "11.11 双十一会场",
  "双 12 收官狂欢",
  "圣诞跨年盛典",
  "春节年货大促",
  "情人节专属优惠",
  "店庆周年回馈",
];

/** 17 档常见尺寸轮换，让 masonry 看起来自然不死板 */
const SIZE_PRESETS: Array<[number, number]> = [
  [600, 600],
  [600, 800],
  [600, 900],
  [600, 750],
];

export const DEMO_TEMPLATES: Template[] = DEMO_NAMES.map((name, i) => {
  const idx = i + 1;
  const [width, height] = SIZE_PRESETS[i % SIZE_PRESETS.length];
  return {
    id: `demo_${idx}`,
    name,
    category: "全套活动",
    thumbnail: `/images/demo/${idx}.png`,
    width,
    height,
    editableFields: { texts: [], colors: [], images: [] },
    templateType: "html",
  };
});
