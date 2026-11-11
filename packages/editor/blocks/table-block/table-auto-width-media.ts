/**
 * Only direct cell content can ask the native table layout for more space.
 * Nested columns, fixed tables and placement planes keep their own limits.
 * Called once at resize start; no measurement or document mutation.
 */
export function isAutoWidthTableMedia(host: HTMLElement): boolean {
  const wrapper = host.parentElement
  if (!wrapper?.classList.contains('table-cell__children-wrapper')) return false
  const cell = wrapper.parentElement
  if (!cell?.classList.contains('table-cell-block')) return false
  const table = cell.closest('table')
  return table?.closest('.table-block')?.classList.contains('is-auto-column-width') ?? false
}
