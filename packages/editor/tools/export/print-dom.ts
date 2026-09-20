/**
 * 确保根流末尾有一个结构哨兵。
 *
 * 它只影响 `:last-child` 匹配，不占尺寸、不进入 PDF 可访问内容。必须幂等：
 * 默认 readonly provider 与宿主自定义 provider 都会经过统一打印面入口。
 */
export function appendFlowSentinel(parent: HTMLElement): HTMLElement {
  for (const child of Array.from(parent.children)) {
    if (child instanceof HTMLElement && child.classList.contains('bc-print-flow-sentinel')) {
      child.setAttribute('aria-hidden', 'true')
      child.style.display = 'none'
      if (parent.lastElementChild !== child) parent.appendChild(child)
      return child
    }
  }
  const sentinel = document.createElement('span')
  sentinel.className = 'bc-print-flow-sentinel'
  sentinel.setAttribute('aria-hidden', 'true')
  sentinel.style.display = 'none'
  parent.appendChild(sentinel)
  return sentinel
}
