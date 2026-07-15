/** 只影响 :last-child 匹配，不占尺寸、不进入 PDF 可访问内容。 */
export function appendFlowSentinel(parent: HTMLElement): void {
  const sentinel = document.createElement('span')
  sentinel.className = 'bc-print-flow-sentinel'
  sentinel.setAttribute('aria-hidden', 'true')
  sentinel.style.display = 'none'
  parent.appendChild(sentinel)
}
