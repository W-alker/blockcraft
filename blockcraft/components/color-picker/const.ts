export interface IColorItem {
  name: string;
  value: string
}

// Craft 风格文字颜色 - 优雅且易读
export const BUILTIN_COLOR_LIST: readonly IColorItem[] = Object.freeze([
  {
    name: "默认",
    value: 'var(--bc-color)',  // Craft 默认文字色（深灰）
  },
  {
    name: "灰色",
    value: '#9B9A97',  // Craft 灰色
  },
  {
    name: "棕色",
    value: '#64473A',  // Craft 棕色
  },
  {
    name: "橙色",
    value: '#D9730D',  // Craft 橙色
  },
  {
    name: "黄色",
    value: '#DFAB01',  // Craft 黄色
  },
  {
    name: "绿色",
    value: '#0F7B6C',  // Craft 绿色
  },
  {
    name: "蓝色",
    value: '#0B6E99',  // Craft 蓝色
  },
  {
    name: "紫色",
    value: '#6940A5',  // Craft 紫色
  },
  {
    name: "粉色",
    value: '#AD1A72',  // Craft 粉色
  },
  {
    name: "红色",
    value: '#E03E3E',  // Craft 红色
  },
])

// Craft 风格背景颜色 - 柔和且与光标对比明显
export const BUILTIN_BG_COLOR_LIST: readonly IColorItem[] = Object.freeze([
  {
    name: "透明",
    value: 'transparent',
  },
  {
    name: "灰色",
    value: '#EBECED',  // Craft 灰色背景
  },
  {
    name: "棕色",
    value: '#E9E5E3',  // Craft 棕色背景
  },
  {
    name: "橙色",
    value: '#FAEBDD',  // Craft 橙色背景
  },
  {
    name: "黄色",
    value: '#FBF3DB',  // Craft 黄色背景（高亮用）
  },
  {
    name: "绿色",
    value: '#DDEDEA',  // Craft 绿色背景
  },
  {
    name: "蓝色",
    value: '#DDEBF1',  // Craft 蓝色背景
  },
  {
    name: "紫色",
    value: '#EAE4F2',  // Craft 紫色背景
  },
  {
    name: "粉色",
    value: '#F4DFEB',  // Craft 粉色背景
  },
  {
    name: "红色",
    value: '#FBE4E4',  // Craft 红色背景
  },
])
