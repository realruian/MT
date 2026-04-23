/**
 * 精选家族 displayName 映射表：家族聚合 key → 下拉展示名。
 *
 * "聚合 key" 见 lib/font-aggregation.ts::familyToAggregationKey —— 经过正
 * 则剥离字重尾缀 / 方正分区号（-GB / -BIG5）后得到的稳定英文标识，例如
 * "MiSans"、"Alibaba PuHuiTi 3.0"、"FZLanTingHeiS-GB"。
 *
 * 只列在这里的家族会得到中文 displayName；未列出的家族 fallback 到聚合
 * key（或 fontkit 原 family 名）直接展示。
 */
export const FAMILY_DISPLAY_NAMES: Record<string, string> = {
  "Meituan Type": "美团字体",
  "Alibaba PuHuiTi 3.0": "阿里巴巴普惠体 3.0",
  "Alimama ShuHeiTi": "阿里妈妈刀隶体",
  "Alimama FangYuanTi VF": "阿里妈妈方圆体",
  "MiSans": "小米 MiSans",
  "Source Han Serif CN": "思源宋体",
  "Source Han Sans CN": "思源黑体",
  "IBM Plex Sans Cond": "IBM Plex Sans Condensed",
  "Smiley Sans Oblique": "得意黑",
  "DingTalk JinBuTi": "钉钉进步体",
  "Douyin Sans": "抖音美好体",
  "FZLanTingHeiS-GB": "方正兰亭黑 S",
  "FZLanTingYuanS-GB": "方正兰亭圆 S",
  "FZJunHeiS-GB": "方正俊黑 S",
  "FZPanHuBaoZhuangTiS W07": "方正潘虎包装体 W07",
  "MT New Digital Display": "美团数字展示",
};
