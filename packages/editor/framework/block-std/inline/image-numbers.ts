// 行内图片协议的数值归一化，仅供实现复用。
export const finiteNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const positiveNumber = (value: unknown): number | undefined => {
  const parsed = finiteNumber(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

export const nonNegativeNumber = (value: unknown): number | undefined => {
  const parsed = finiteNumber(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}
