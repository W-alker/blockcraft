/** 天气展示选项；不包含取数、定位或定格逻辑。 */
export const WEATHER_LAYOUTS = [
  {id: 'classic', label: '经典紧凑', width: 152, height: 34},
  {id: 'inline', label: '行内组合', width: 272, height: 72},
  {id: 'ruled', label: '双线横栏', width: 262, height: 90},
  {id: 'sidebar', label: '侧线标记', width: 256, height: 96},
  {id: 'card', label: '基础信息卡', width: 256, height: 144},
  {id: 'stack', label: '纵向组合', width: 148, height: 156},
  {id: 'ledger', label: '气象分栏', width: 280, height: 104},
] as const
export type WeatherLayout = typeof WEATHER_LAYOUTS[number]['id']
export const resolveWeatherLayout = (id?: string | null) => WEATHER_LAYOUTS.find(layout => layout.id === id) ?? WEATHER_LAYOUTS[0]

export const WEATHER_PALETTES = [
  {id: 'document', label: '跟随文档', fg: 'inherit', accent: 'currentColor', line: 'color-mix(in srgb, currentColor 35%, transparent)', bg: 'transparent'},
  {id: 'ink', label: '中性灰', fg: '#30353b', accent: '#59626b', line: '#c9cdd1', bg: '#f0f1f2'},
  {id: 'blue', label: '雾蓝', fg: '#2b4054', accent: '#42769d', line: '#b6c6d5', bg: '#eaf0f6'},
  {id: 'green', label: '苔绿', fg: '#314b3c', accent: '#56806a', line: '#b6c8bc', bg: '#edf2eb'},
  {id: 'clay', label: '陶土', fg: '#583f38', accent: '#a16b55', line: '#d6bbb0', bg: '#f5ece6'},
  {id: 'dark', label: '深色', fg: '#edf2f6', accent: '#afc9df', line: '#697b8b', bg: '#293b4a'},
] as const
export type WeatherPalette = typeof WEATHER_PALETTES[number]['id']
export type WeatherPresentationProps = {
  style?: string | null; palette?: string | null; fg?: string | null; accent?: string | null; line?: string | null; bg?: string | null;
  bw?: string | null; bc?: string | null; iconMode?: string | null; range?: string | null;
}

/** 色调切换清除逐项覆盖；背景恢复预设默认值，之后可独立覆盖为透明。调用者在同一事务内写入。 */
export function weatherPalettePatch(palette: WeatherPalette) {
  return {palette, fg: null, accent: null, line: null, bg: null}
}
