/**
 * Measure the vertical box that is actually visible outside a top-level block.
 *
 * Atomic blocks may paint descendants beyond their border box (for example an
 * iframe card in Safari), so visible overflow participates in pagination. A
 * clipped or scrollable host, however, contains that overflow; its scrollHeight
 * is internal content geometry and must not enlarge the page slot.
 */
export function measureBlockVisualHeight(
  element: HTMLElement,
  capHeight: boolean,
  style: CSSStyleDeclaration = getComputedStyle(element),
): number {
  const borderBoxHeight = element.offsetHeight
  if (!capHeight || !hasVisibleVerticalOverflow(style)) return borderBoxHeight
  return Math.max(borderBoxHeight, element.scrollHeight)
}

/**
 * Measure the block width that belongs to document content.
 *
 * Void/block hosts carry two absolutely positioned zero-space spans so WebKit
 * has a native caret target before and after the block. The trailing span sits
 * at `right:-2px`, which deliberately enlarges `scrollWidth` even though it is
 * editor chrome rather than printable content. Treating that overflow as an
 * intrinsic business-block width makes an A4-width block enter CSS zoom by
 * roughly 0.4%, and the zoom projection then feeds back into pagination.
 *
 * We only pay for the temporary DOM write/read when the raw width would
 * actually trigger a fit. The spans are restored synchronously before the
 * browser can paint an intermediate state.
 */
export function measureBlockContentWidth(
  element: HTMLElement,
  contentWidth?: number,
): number {
  const rawWidth = Math.max(element.offsetWidth, element.scrollWidth)
  if (
    !Number.isFinite(contentWidth)
    || contentWidth! <= 0
    || rawWidth <= contentWidth! + 0.5
  ) {
    return rawWidth
  }

  const gapSpans = Array.from(element.children)
    .filter(child => child.getAttribute('data-block-zero-space') === 'true')
    .map(child => child as HTMLElement)
  if (!gapSpans.length) return rawWidth

  const displays = gapSpans.map(span => ({
    value: span.style.getPropertyValue('display'),
    priority: span.style.getPropertyPriority('display'),
  }))
  for (const span of gapSpans) {
    span.style.setProperty('display', 'none', 'important')
  }
  try {
    return Math.max(element.offsetWidth, element.scrollWidth)
  } finally {
    gapSpans.forEach((span, index) => {
      const display = displays[index]
      if (display?.value) {
        span.style.setProperty('display', display.value, display.priority)
      } else {
        span.style.removeProperty('display')
      }
    })
  }
}

function hasVisibleVerticalOverflow(style: CSSStyleDeclaration): boolean {
  // JSDOM may return an empty computed value for the CSS initial value.
  const overflowY = style.overflowY || style.overflow
  return overflowY === '' || overflowY === 'visible'
}
