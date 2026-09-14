/** 对象格式写入与工具栏共用的精度规则；调用前须完成有限值及范围校验。 */
export function quantizeObjectFormatNumber(
  value: number,
  step = 0.01,
  preservePrecision = false,
): number {
  if (preservePrecision) return value
  return Number((Math.round(value / step) * step).toFixed(2))
}
