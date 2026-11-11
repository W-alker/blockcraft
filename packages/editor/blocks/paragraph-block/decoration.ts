/** 段落装饰是显示属性，不进入 Y.Text。 */
export type ParagraphDecoration = {
  position: 'before' | 'after' | 'both' | 'above' | 'below'
  style?: 'solid' | 'dashed' | 'dotted' | 'double'
  color?: string
  width?: number
  opacity?: number
  gap?: number
  align?: 'first' | 'center' | 'last'
  before?: string
  after?: string
  span?: 'text' | 'paragraph'
  overflow?: 'shrink' | 'hide'
}
const bounded = (v: unknown, d: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d
export const decorationLengthMode = (v?: string): 'auto' | 'px' | 'percent' => v?.endsWith('px') ? 'px' : v?.endsWith('%') ? 'percent' : 'auto'
export const decorationLengthValue = (v?: string): number => {
  const parsed = parseFloat(v ?? '')
  return Number.isFinite(parsed) ? parsed : 40
}
const length = (v: unknown): string => {
  if (typeof v !== 'string' || !/^\d+(?:\.\d+)?(?:px|%)$/.test(v)) return 'auto'
  return `${bounded(parseFloat(v), 40, 0, v.endsWith('%') ? 100 : 2000)}${v.endsWith('%') ? '%' : 'px'}`
}
export function normalizeParagraphDecoration(value: unknown): ParagraphDecoration | null {
  if (!value || typeof value !== 'object') return null
  const d = value as ParagraphDecoration
  if (!['before', 'after', 'both', 'above', 'below'].includes(d.position)) return null
  return {
    position: d.position,
    style: ['solid', 'dashed', 'dotted', 'double'].includes(d.style!) ? d.style : 'solid',
    color: typeof d.color === 'string' && d.color.trim() && !/[;{}<>]/.test(d.color) ? d.color.trim() : 'currentColor',
    width: bounded(d.width, 1, .5, 12), opacity: bounded(d.opacity, 1, 0, 1),
    gap: bounded(d.gap, 12, 0, 120),
    align: d.align === 'first' || d.align === 'last' ? d.align : 'center',
    before: length(d.before), after: length(d.after),
    span: d.span === 'text' ? 'text' : 'paragraph',
    overflow: d.overflow === 'hide' ? 'hide' : 'shrink',
  }
}
const size = (v: string) => v === 'auto' ? '0px' : v
export function paragraphDecorationStyles(value: unknown, textAlign?: unknown): Record<string, string> {
  const d = normalizeParagraphDecoration(value)
  if (!d) return {}
  return {
    '--bc-deco-justify': textAlign === 'center' ? 'center' : textAlign === 'right' ? 'end' : 'start',
    '--bc-deco-color': d.color!, '--bc-deco-width': `${d.width}px`,
    '--bc-deco-style': d.style!, '--bc-deco-opacity': `${d.opacity}`,
    '--bc-deco-gap': `${d.gap}px`,
    '--bc-deco-before': size(d.before!), '--bc-deco-after': size(d.after!),
    '--bc-deco-before-grow': d.before === 'auto' ? '1' : '0',
    '--bc-deco-after-grow': d.after === 'auto' ? '1' : '0',
  }
}
export function applyParagraphDecoration(element: HTMLElement, value: unknown, textAlign?: unknown): void {
  const d = normalizeParagraphDecoration(value)
  if (!d && !element.hasAttribute('data-bc-deco-position')) return
  for (const key of ['position', 'align', 'span', 'overflow'] as const) {
    if (d) element.setAttribute(`data-bc-deco-${key}`, d[key]!)
    else element.removeAttribute(`data-bc-deco-${key}`)
  }
  const styles = paragraphDecorationStyles(d, textAlign)
  for (const key of ['justify','color','width','style','opacity','gap','before','after','before-grow','after-grow']) {
    const prop = `--bc-deco-${key}`
    if (styles[prop]) element.style.setProperty(prop, styles[prop])
    else element.style.removeProperty(prop)
  }
}
