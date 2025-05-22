export const randomColor = (opacity = 1) => {
  return `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${opacity})`;
}

export function getRandomDarkColor(alpha = 1) {
  // 生成较低的 RGB 值以确保颜色较暗
  const r = Math.floor(Math.random() * 100);
  const g = Math.floor(Math.random() * 100);
  const b = Math.floor(Math.random() * 100);
  // 返回带有透明度的 RGBA 颜色字符串
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
